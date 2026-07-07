import { supabase } from "../lib/supabase";

export type StorageBucket = "field-photos" | "job-documents" | "task-reports";

export async function uploadDocument(bucket: StorageBucket, path: string, file: File) {
  if (!supabase) {
    return { data: null, error: new Error("Demo-Modus aktiv: Supabase Storage ist nicht konfiguriert.") };
  }

  return supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
}

export function getPublicDocumentUrl(bucket: StorageBucket, path: string) {
  if (!supabase) return "";
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
