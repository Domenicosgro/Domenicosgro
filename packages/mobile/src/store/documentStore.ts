import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import { getSupabaseClient, getAnalyzer, uploadFile, STORAGE_BUCKET } from '@dokuvault/shared';
import type { Document, DocumentDate, DocumentAnalysis } from '@dokuvault/shared';
import type { DocumentPickerAsset } from 'expo-document-picker';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dokuvault/shared';

interface DocumentStore {
  documents: Document[];
  deadlines: DocumentDate[];
  isLoading: boolean;
  error: string | null;

  loadDocuments: () => Promise<void>;
  importPickedFile: (asset: DocumentPickerAsset) => Promise<void>;
  importScannedPages: (base64Pages: string[]) => Promise<void>;
}

async function getConfig() {
  const supabaseUrl = (await SecureStore.getItemAsync('supabase_url')) ?? '';
  const supabaseAnonKey = (await SecureStore.getItemAsync('supabase_anon_key')) ?? '';
  const anthropicApiKey = (await SecureStore.getItemAsync('anthropic_api_key')) ?? '';
  return { supabaseUrl, supabaseAnonKey, anthropicApiKey };
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  documents: [],
  deadlines: [],
  isLoading: false,
  error: null,

  loadDocuments: async () => {
    set({ isLoading: true, error: null });
    try {
      const { supabaseUrl, supabaseAnonKey } = await getConfig();
      if (!supabaseUrl || !supabaseAnonKey) {
        set({ isLoading: false });
        return;
      }

      const client = getSupabaseClient(supabaseUrl, supabaseAnonKey);
      const today = new Date().toISOString().split('T')[0];

      const [{ data: docs }, { data: dates }] = await Promise.all([
        client.from('documents').select('*').order('created_at', { ascending: false }).limit(100),
        client.from('document_dates').select('*').gte('date', today).order('date').limit(50),
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

  importPickedFile: async (asset: DocumentPickerAsset) => {
    const { supabaseUrl, supabaseAnonKey, anthropicApiKey } = await getConfig();
    if (!supabaseUrl || !supabaseAnonKey || !anthropicApiKey) return;

    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const mimeType = asset.mimeType ?? 'application/pdf';
    const fileName = asset.name ?? `document_${Date.now()}.pdf`;

    await _uploadAndAnalyze(
      { supabaseUrl, supabaseAnonKey, anthropicApiKey },
      fileName,
      base64,
      mimeType,
      get,
      set,
    );
  },

  importScannedPages: async (base64Pages: string[]) => {
    const { supabaseUrl, supabaseAnonKey, anthropicApiKey } = await getConfig();
    if (!supabaseUrl || !supabaseAnonKey || !anthropicApiKey) return;

    // For multi-page scans: analyze the first image (full multi-page PDF support
    // would require a server-side PDF assembly step).
    const fileName = `scan_${Date.now()}.jpg`;
    const base64 = base64Pages[0];

    await _uploadAndAnalyze(
      { supabaseUrl, supabaseAnonKey, anthropicApiKey },
      fileName,
      base64,
      'image/jpeg',
      get,
      set,
    );
  },
}));

// ─── Private helpers ──────────────────────────────────────────────────────────

async function _uploadAndAnalyze(
  config: { supabaseUrl: string; supabaseAnonKey: string; anthropicApiKey: string },
  fileName: string,
  base64: string,
  mimeType: string,
  get: () => DocumentStore,
  set: (partial: Partial<DocumentStore>) => void,
) {
  const client = getSupabaseClient(config.supabaseUrl, config.supabaseAnonKey);

  const { data: { user } } = await client.auth.getUser();
  if (!user) return;

  const { data: profile } = await client
    .from('profiles')
    .select('family_id')
    .eq('id', user.id)
    .single();

  if (!profile) return;

  // Build Blob from base64
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });

  const storagePath = await uploadFile(client, profile.family_id, fileName, blob, mimeType);

  const { data: doc } = await (client as SupabaseClient<Database>)
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

  set({ documents: [doc as Document, ...get().documents] });

  // Analyse
  try {
    await (client as SupabaseClient<Database>)
      .from('documents')
      .update({ analysis_status: 'processing' })
      .eq('id', doc.id);

    const analyzer = getAnalyzer(config.anthropicApiKey);
    const analysis: DocumentAnalysis = await analyzer.analyzeDocument(base64, mimeType, fileName);

    await (client as SupabaseClient<Database>)
      .from('documents')
      .update({
        title: analysis.title,
        category: analysis.category,
        summary: analysis.summary,
        tags: analysis.tags,
        analysis_status: 'done',
        analyzed_at: new Date().toISOString(),
      })
      .eq('id', doc.id);

    if (analysis.dates.length > 0) {
      await (client as SupabaseClient<Database>).from('document_dates').insert(
        analysis.dates.map((d) => ({
          document_id: doc.id,
          family_id: profile.family_id,
          label: d.label,
          date: d.date,
          priority: d.priority,
        })),
      );
    }

    await get().loadDocuments();
  } catch (err) {
    await (client as SupabaseClient<Database>)
      .from('documents')
      .update({ analysis_status: 'error' })
      .eq('id', doc.id);
    console.error('[importAndAnalyze]', err);
  }
}
