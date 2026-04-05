import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// ─── Singleton client factory ─────────────────────────────────────────────────

let _client: SupabaseClient<Database> | null = null;

export function getSupabaseClient(
  url?: string,
  anonKey?: string,
): SupabaseClient<Database> {
  const supabaseUrl = url ?? process.env['SUPABASE_URL'] ?? '';
  const supabaseKey = anonKey ?? process.env['SUPABASE_ANON_KEY'] ?? '';

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Supabase URL and anon key are required. Set SUPABASE_URL and SUPABASE_ANON_KEY.',
    );
  }

  if (!_client) {
    _client = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }

  return _client;
}

// ─── Server-side admin client (service role key, never expose to client) ──────

export function getSupabaseAdminClient(
  url?: string,
  serviceRoleKey?: string,
): SupabaseClient<Database> {
  const supabaseUrl = url ?? process.env['SUPABASE_URL'] ?? '';
  const key = serviceRoleKey ?? process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

  if (!supabaseUrl || !key) {
    throw new Error('Supabase URL and service role key are required.');
  }

  return createClient<Database>(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

export const STORAGE_BUCKET = 'documents';

export async function uploadFile(
  client: SupabaseClient<Database>,
  familyId: string,
  fileName: string,
  fileData: ArrayBuffer | Blob,
  contentType: string,
): Promise<string> {
  const storagePath = `${familyId}/${Date.now()}_${fileName}`;

  const { error } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, fileData, {
      contentType,
      upsert: false,
    });

  if (error) throw error;
  return storagePath;
}

export function getFileUrl(
  client: SupabaseClient<Database>,
  storagePath: string,
): string {
  const { data } = client.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function getSignedUrl(
  client: SupabaseClient<Database>,
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await client.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) throw error;
  return data.signedUrl;
}
