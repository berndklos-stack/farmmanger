import { isSupabaseConfigured, supabase } from "./supabase";

export type DriverTimeEntryKind = "work" | "interruption" | "pause";

export type DriverTimeEntry = {
  id: string;
  driverId: string;
  driverName: string;
  kind: DriverTimeEntryKind;
  reason?: string;
  note?: string;
  subtaskId?: string;
  jobNumber?: string;
  startedAt: string;
  endedAt?: string;
  minutes?: number;
  lockedAt?: string;
  lockedById?: string;
  lockedByName?: string;
};

export const driverTimeEntriesStorageKey = "farm-manager.driverTimeEntries";
export const driverTimeEntriesChangedEvent = "farm-manager:driver-time-entries-changed";

type DriverTimeEntryRow = {
  id: string;
  driver_id: string;
  driver_name: string;
  kind: DriverTimeEntryKind;
  reason: string | null;
  note: string | null;
  subtask_id: string | null;
  job_number: string | null;
  started_at: string;
  ended_at: string | null;
  minutes: number | null;
  locked_at?: string | null;
  locked_by_id?: string | null;
  locked_by_name?: string | null;
};

function readLocalDriverTimeEntries() {
  try {
    const raw = window.localStorage.getItem(driverTimeEntriesStorageKey);
    return raw ? JSON.parse(raw) as DriverTimeEntry[] : [];
  } catch {
    return [];
  }
}

function writeLocalDriverTimeEntries(entries: DriverTimeEntry[]) {
  window.localStorage.setItem(driverTimeEntriesStorageKey, JSON.stringify(entries));
  window.dispatchEvent(new CustomEvent(driverTimeEntriesChangedEvent));
  window.dispatchEvent(new CustomEvent(`${driverTimeEntriesStorageKey}:changed`));
}

function mapDriverTimeEntryRow(row: DriverTimeEntryRow): DriverTimeEntry {
  return {
    id: row.id,
    driverId: row.driver_id,
    driverName: row.driver_name,
    kind: row.kind,
    reason: row.reason ?? undefined,
    note: row.note ?? undefined,
    subtaskId: row.subtask_id ?? undefined,
    jobNumber: row.job_number ?? undefined,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    minutes: row.minutes ?? undefined,
    lockedAt: row.locked_at ?? undefined,
    lockedById: row.locked_by_id ?? undefined,
    lockedByName: row.locked_by_name ?? undefined,
  };
}

function driverTimeEntryPayload(entry: DriverTimeEntry, includeLockFields = true) {
  return {
    id: entry.id,
    driver_id: entry.driverId,
    driver_name: entry.driverName,
    kind: entry.kind,
    reason: entry.reason ?? null,
    note: entry.note ?? null,
    subtask_id: entry.subtaskId ?? null,
    job_number: entry.jobNumber ?? null,
    started_at: entry.startedAt,
    ended_at: entry.endedAt ?? null,
    minutes: entry.minutes ?? null,
    ...(includeLockFields ? {
      locked_at: entry.lockedAt ?? null,
      locked_by_id: entry.lockedById ?? null,
      locked_by_name: entry.lockedByName ?? null,
    } : {}),
  };
}

export function readDriverTimeEntries() {
  return readLocalDriverTimeEntries();
}

export async function loadDriverTimeEntries() {
  const localRows = readLocalDriverTimeEntries();
  if (!isSupabaseConfigured || !supabase) return localRows;
  const { data, error } = await supabase
    .from("driver_time_entries")
    .select("*")
    .order("started_at", { ascending: false });
  if (error) return localRows;
  const remoteRows = ((data ?? []) as DriverTimeEntryRow[]).map(mapDriverTimeEntryRow);
  const merged = new Map<string, DriverTimeEntry>();
  localRows.forEach((entry) => merged.set(entry.id, entry));
  remoteRows.forEach((entry) => merged.set(entry.id, entry));
  const next = Array.from(merged.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  writeLocalDriverTimeEntries(next);
  return next;
}

export async function writeDriverTimeEntries(entries: DriverTimeEntry[]) {
  writeLocalDriverTimeEntries(entries);
  if (!isSupabaseConfigured || !supabase) return entries;
  const { error } = await supabase
    .from("driver_time_entries")
    .upsert(entries.map((entry) => driverTimeEntryPayload(entry)), { onConflict: "id" });
  if (error) {
    const { error: legacyError } = await supabase
      .from("driver_time_entries")
      .upsert(entries.map((entry) => driverTimeEntryPayload(entry, false)), { onConflict: "id" });
    if (legacyError) return entries;
  }
  return loadDriverTimeEntries();
}

export async function deleteDriverTimeEntry(id: string) {
  const next = readLocalDriverTimeEntries().filter((entry) => entry.id !== id);
  writeLocalDriverTimeEntries(next);
  if (isSupabaseConfigured && supabase) {
    await supabase.from("driver_time_entries").delete().eq("id", id);
  }
  return loadDriverTimeEntries();
}

export function subscribeDriverTimeEntries(onChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === driverTimeEntriesStorageKey) onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(driverTimeEntriesChangedEvent, onChange);
  window.addEventListener(`${driverTimeEntriesStorageKey}:changed`, onChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(driverTimeEntriesChangedEvent, onChange);
    window.removeEventListener(`${driverTimeEntriesStorageKey}:changed`, onChange);
  };
}
