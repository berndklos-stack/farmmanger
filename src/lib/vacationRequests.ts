import { isSupabaseConfigured, supabase } from "./supabase";

export type VacationRequestStatus = "requested" | "approved" | "rejected";

export type VacationRequestHistoryEntry = {
  id: string;
  action: VacationRequestStatus | "submitted";
  actorName: string;
  reason?: string;
  createdAt: string;
};

export type VacationRequest = {
  id: string;
  driverId: string;
  driverName: string;
  from: string;
  to: string;
  days: number;
  note?: string;
  status: VacationRequestStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionReason?: string;
  history: VacationRequestHistoryEntry[];
};

export const vacationRequestsStorageKey = "farm-manager.vacationRequests";
const vacationRequestsChangedEvent = "farm-manager:vacation-requests-changed";

type VacationRequestRow = {
  id: string;
  driver_id: string;
  driver_name: string;
  from_date: string;
  to_date: string;
  days: number;
  note: string | null;
  status: VacationRequestStatus;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
  history: VacationRequestHistoryEntry[] | string | null;
};

function mapVacationRequestRow(row: VacationRequestRow): VacationRequest {
  const history = Array.isArray(row.history)
    ? row.history
    : typeof row.history === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(row.history) as VacationRequestHistoryEntry[];
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];
  return {
    id: row.id,
    driverId: row.driver_id,
    driverName: row.driver_name,
    from: row.from_date,
    to: row.to_date,
    days: Number(row.days ?? 0),
    note: row.note ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at ?? undefined,
    decidedBy: row.decided_by ?? undefined,
    decisionReason: row.decision_reason ?? undefined,
    history,
  };
}

function vacationRequestPayload(request: VacationRequest) {
  return {
    id: request.id,
    driver_id: request.driverId,
    driver_name: request.driverName,
    from_date: request.from,
    to_date: request.to,
    days: request.days,
    note: request.note ?? null,
    status: request.status,
    created_at: request.createdAt,
    decided_at: request.decidedAt ?? null,
    decided_by: request.decidedBy ?? null,
    decision_reason: request.decisionReason ?? null,
    history: request.history ?? [],
  };
}

export function readVacationRequests() {
  try {
    const raw = window.localStorage.getItem(vacationRequestsStorageKey);
    const rows = raw ? JSON.parse(raw) as VacationRequest[] : [];
    return rows.map((row) => ({ ...row, history: row.history ?? [] }));
  } catch {
    return [];
  }
}

function writeVacationRequestsLocal(requests: VacationRequest[]) {
  window.localStorage.setItem(vacationRequestsStorageKey, JSON.stringify(requests));
  window.dispatchEvent(new CustomEvent(vacationRequestsChangedEvent));
}

export async function loadVacationRequests() {
  const localRows = readVacationRequests();
  if (!isSupabaseConfigured || !supabase) return localRows;
  const { data, error } = await supabase
    .from("vacation_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return localRows;
  const remoteRows = ((data ?? []) as VacationRequestRow[]).map(mapVacationRequestRow);
  const merged = new Map<string, VacationRequest>();
  localRows.forEach((request) => merged.set(request.id, request));
  remoteRows.forEach((request) => merged.set(request.id, request));
  const next = Array.from(merged.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  writeVacationRequestsLocal(next);
  return next;
}

export async function writeVacationRequests(requests: VacationRequest[]) {
  writeVacationRequestsLocal(requests);
  if (!isSupabaseConfigured || !supabase) return requests;
  const { error } = await supabase
    .from("vacation_requests")
    .upsert(requests.map(vacationRequestPayload), { onConflict: "id" });
  if (error) return requests;
  return loadVacationRequests();
}

export function subscribeVacationRequests(onChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === vacationRequestsStorageKey) onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(vacationRequestsChangedEvent, onChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(vacationRequestsChangedEvent, onChange);
  };
}

export async function decideVacationRequest(id: string, status: Exclude<VacationRequestStatus, "requested">, actorName: string, reason: string) {
  const decidedAt = new Date().toISOString();
  const next = readVacationRequests().map((request) => {
    if (request.id !== id) return request;
    return {
      ...request,
      status,
      decidedAt,
      decidedBy: actorName,
      decisionReason: reason,
      history: [
        {
          id: crypto.randomUUID(),
          action: status,
          actorName,
          reason,
          createdAt: decidedAt,
        },
        ...(request.history ?? []),
      ],
    };
  });
  return writeVacationRequests(next);
}
