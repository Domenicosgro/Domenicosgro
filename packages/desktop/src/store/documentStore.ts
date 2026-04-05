import { create } from 'zustand';
import { getSupabaseClient, getAnalyzer, uploadFile, STORAGE_BUCKET } from '@dokuvault/shared';
import type { Document, DocumentDate, DocumentAnalysis } from '@dokuvault/shared';

interface DocumentStore {
  documents: Document[];
  deadlines: DocumentDate[];
  isLoading: boolean;
  error: string | null;

  loadDocuments: () => Promise<void>;
  importFile: (filePath: string) => Promise<void>;
  importFiles: (files: File[]) => Promise<void>;
  importFilePaths: (paths: string[]) => Promise<void>;
  analyzeDocument: (documentId: string) => Promise<void>;
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  documents: [],
  deadlines: [],
  isLoading: false,
  error: null,

  loadDocuments: async () => {
    set({ isLoading: true, error: null });
    try {
      const settings = await window.electron?.getSettings();
      if (!settings?.supabaseUrl || !settings.supabaseAnonKey) {
        set({ isLoading: false });
        return;
      }

      const client = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey);

      const [{ data: docs }, { data: dates }] = await Promise.all([
        client
          .from('documents')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
        client
          .from('document_dates')
          .select('*')
          .gte('date', new Date().toISOString().split('T')[0])
          .order('date', { ascending: true })
          .limit(50),
      ]);

      set({
        documents: (docs ?? []) as Document[],
        deadlines: (dates ?? []) as DocumentDate[],
        isLoading: false,
      });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  importFile: async (filePath: string) => {
    const base64 = await window.electron?.readFileBase64(filePath);
    if (!base64) return;

    const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
    const mimeType = getMimeType(fileName);

    await uploadAndAnalyze(fileName, base64, mimeType, get, set);
  },

  importFiles: async (files: File[]) => {
    for (const file of files) {
      const base64 = await fileToBase64(file);
      await uploadAndAnalyze(file.name, base64, file.type, get, set);
    }
  },

  importFilePaths: async (paths: string[]) => {
    for (const p of paths) {
      await get().importFile(p);
    }
  },

  analyzeDocument: async (documentId: string) => {
    const settings = await window.electron?.getSettings();
    if (!settings?.supabaseUrl || !settings.anthropicApiKey) return;

    const client = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey);

    const { data: doc } = await client
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (!doc) return;

    // Mark as processing
    await client
      .from('documents')
      .update({ analysis_status: 'processing' })
      .eq('id', documentId);

    try {
      const signedUrlResp = await client.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(doc.storage_path, 300);

      if (signedUrlResp.error) throw signedUrlResp.error;

      // Fetch file content for analysis
      const response = await fetch(signedUrlResp.data.signedUrl);
      const arrayBuffer = await response.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);

      const analyzer = getAnalyzer(settings.anthropicApiKey);
      const analysis: DocumentAnalysis = await analyzer.analyzeDocument(
        base64,
        doc.mime_type,
        doc.file_name,
      );

      // Persist analysis results
      await client
        .from('documents')
        .update({
          title: analysis.title,
          category: analysis.category,
          summary: analysis.summary,
          tags: analysis.tags,
          analysis_status: 'done',
          analyzed_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      // Persist extracted dates
      if (analysis.dates.length > 0) {
        await client.from('document_dates').insert(
          analysis.dates.map((d) => ({
            document_id: documentId,
            family_id: doc.family_id,
            label: d.label,
            date: d.date,
            priority: d.priority,
          })),
        );
      }

      await get().loadDocuments();
    } catch (err) {
      await client
        .from('documents')
        .update({ analysis_status: 'error' })
        .eq('id', documentId);
      console.error('[analyzeDocument]', err);
    }
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function uploadAndAnalyze(
  fileName: string,
  base64: string,
  mimeType: string,
  get: () => DocumentStore,
  set: (partial: Partial<DocumentStore>) => void,
) {
  const settings = await window.electron?.getSettings();
  if (!settings?.supabaseUrl || !settings.supabaseAnonKey) return;

  const client = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;

  const { data: profile } = await client
    .from('profiles')
    .select('family_id')
    .eq('id', user.id)
    .single();

  if (!profile) return;

  // Convert base64 to blob for upload
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });

  const storagePath = await uploadFile(client, profile.family_id, fileName, blob, mimeType);

  const { data: doc } = await client
    .from('documents')
    .insert({
      family_id: profile.family_id,
      uploaded_by: user.id,
      storage_path: storagePath,
      file_name: fileName,
      file_size: blob.size,
      mime_type: mimeType,
      analysis_status: 'pending',
    })
    .select()
    .single();

  if (!doc) return;

  // Optimistically add to local state
  set({
    documents: [doc as Document, ...get().documents],
  });

  // Kick off analysis
  await get().analyzeDocument(doc.id);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    tiff: 'image/tiff',
    tif: 'image/tiff',
  };
  return map[ext ?? ''] ?? 'application/octet-stream';
}
