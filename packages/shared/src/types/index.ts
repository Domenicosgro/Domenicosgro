// ─── Claude Analysis Response ────────────────────────────────────────────────

export type DatePriority = 'urgent' | 'high' | 'medium' | 'low';

export interface ExtractedDate {
  label: string;
  date: string; // ISO 8601, e.g. "2026-05-15"
  priority: DatePriority;
}

export interface DocumentAnalysis {
  title: string;
  category: DocumentCategory;
  summary: string;
  dates: ExtractedDate[];
  tags: string[];
}

// ─── Document Categories (German document types) ──────────────────────────────

export type DocumentCategory =
  | 'rechnung'        // Invoice
  | 'vertrag'         // Contract
  | 'bescheid'        // Official notice
  | 'versicherung'    // Insurance
  | 'steuer'          // Tax
  | 'bank'            // Banking
  | 'gesundheit'      // Health / medical
  | 'behoerde'        // Government / authority
  | 'schule'          // School / education
  | 'wohnen'          // Housing / rent
  | 'arbeit'          // Employment
  | 'sonstiges';      // Other

export const DOCUMENT_CATEGORIES: Record<DocumentCategory, string> = {
  rechnung: 'Rechnung',
  vertrag: 'Vertrag',
  bescheid: 'Bescheid',
  versicherung: 'Versicherung',
  steuer: 'Steuer',
  bank: 'Bank',
  gesundheit: 'Gesundheit',
  behoerde: 'Behörde',
  schule: 'Schule / Bildung',
  wohnen: 'Wohnen',
  arbeit: 'Arbeit',
  sonstiges: 'Sonstiges',
};

// ─── Supabase Database Types ──────────────────────────────────────────────────

export interface Profile {
  id: string; // UUID, matches auth.users.id
  family_id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Family {
  id: string;
  name: string;
  created_at: string;
}

export interface Document {
  id: string;
  family_id: string;
  uploaded_by: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  title: string | null;
  category: DocumentCategory | null;
  summary: string | null;
  tags: string[];
  analysis_status: AnalysisStatus;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AnalysisStatus = 'pending' | 'processing' | 'done' | 'error';

export interface DocumentDate {
  id: string;
  document_id: string;
  family_id: string;
  label: string;
  date: string; // ISO 8601 date string
  priority: DatePriority;
  calendar_synced: boolean;
  calendar_event_id: string | null;
  created_at: string;
}

// ─── API / Service Layer ──────────────────────────────────────────────────────

export interface UploadResult {
  document: Document;
  storagePath: string;
}

export interface AnalyzeDocumentInput {
  documentId: string;
  fileContent: string; // base64 encoded
  mimeType: string;
  fileName: string;
}

export interface CalendarEventInput {
  title: string;
  date: string; // ISO 8601
  description?: string;
  priority: DatePriority;
}
