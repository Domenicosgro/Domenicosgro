/**
 * Auto-generated Supabase database types.
 * Regenerate with: supabase gen types typescript --local > packages/shared/src/supabase/database.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      families: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          family_id: string;
          display_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          family_id: string;
          display_name: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          display_name?: string;
          avatar_url?: string | null;
          updated_at?: string;
        };
      };
      documents: {
        Row: {
          id: string;
          family_id: string;
          uploaded_by: string;
          storage_path: string;
          file_name: string;
          file_size: number;
          mime_type: string;
          title: string | null;
          category: string | null;
          summary: string | null;
          tags: string[];
          analysis_status: string;
          analyzed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          uploaded_by: string;
          storage_path: string;
          file_name: string;
          file_size: number;
          mime_type: string;
          title?: string | null;
          category?: string | null;
          summary?: string | null;
          tags?: string[];
          analysis_status?: string;
          analyzed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string | null;
          category?: string | null;
          summary?: string | null;
          tags?: string[];
          analysis_status?: string;
          analyzed_at?: string | null;
          updated_at?: string;
        };
      };
      document_dates: {
        Row: {
          id: string;
          document_id: string;
          family_id: string;
          label: string;
          date: string;
          priority: string;
          calendar_synced: boolean;
          calendar_event_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          family_id: string;
          label: string;
          date: string;
          priority: string;
          calendar_synced?: boolean;
          calendar_event_id?: string | null;
          created_at?: string;
        };
        Update: {
          calendar_synced?: boolean;
          calendar_event_id?: string | null;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      search_documents: {
        Args: {
          query_text: string;
          p_family_id: string;
        };
        Returns: {
          id: string;
          title: string | null;
          category: string | null;
          summary: string | null;
          tags: string[];
          rank: number;
        }[];
      };
    };
    Enums: {
      analysis_status: 'pending' | 'processing' | 'done' | 'error';
      date_priority: 'urgent' | 'high' | 'medium' | 'low';
      document_category:
        | 'rechnung'
        | 'vertrag'
        | 'bescheid'
        | 'versicherung'
        | 'steuer'
        | 'bank'
        | 'gesundheit'
        | 'behoerde'
        | 'schule'
        | 'wohnen'
        | 'arbeit'
        | 'sonstiges';
    };
  };
}
