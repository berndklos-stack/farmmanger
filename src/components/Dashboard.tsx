import { AlertTriangle, CheckCircle2, ClipboardList, MapPinned, Package, Route } from "lucide-react";
import type { ElementType } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleMarker, MapContainer, Polygon, Popup, Tooltip, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { useAppData } from "../data/DataContext";
import { formatArea } from "../i18n/format";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { decideVacationRequest, loadVacationRequests, readVacationRequests, subscribeVacationRequests, type VacationRequest } from "../lib/vacationRequests";
import type { Field, Job, Status, Subtask } from "../types";
import { formatCoordinates } from "../utils/geo";
import { MapBaseLayers } from "./MapBaseLayers";
import { FieldName, StatusBadge, getTask } from "./shared";

type DriverEquipmentLogEntry = {
  id?: string;
  eventType?: string;
  recordedAt?: string;
  driverName?: string;
  placement?: string;
  note?: string;
  vehicleNames?: string[];
  implementNames?: string[];
  machineProblem?: boolean;
  problemRecipient?: string;
};

type ProductInventoryItem = {
  id: string;
  organizationId?: string;
  name: string;
  unit: string;
  openingStock: number;
  minimumStock?: number;
  archivedAt?: string;
};

type ProductMovement = {
  id?: string;
  productId: string;
  type: "in" | "out";
  quantity: number;
};

type ProductInventoryRow = {
  id: string;
  organization_id?: string | null;
  name: string;
  unit?: string | null;
  opening_stock?: number | null;
  minimum_stock?: number | null;
  archived_at?: string | null;
};

type ProductMovementRow = {
  id?: string;
  product_id: string;
  movement_type: ProductMovement["type"];
  quantity: number;
};

const productInventoryStorageKey = "farm-manager.productInventory";
const productMovementsStorageKey = "farm-manager.productMovements";

function readJsonArray<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T[] : [];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(key: string, values: T[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Dashboard warnings must not crash if browser storage is full.
  }
}

function mergeById<T extends { id?: string }>(localRows: T[], remoteRows: T[]) {
  const merged = new Map<string, T>();
  remoteRows.forEach((row, index) => merged.set(row.id ?? `remote-${index}`, row));
  localRows.forEach((row, index) => {
    const key = row.id ?? `local-${index}`;
    if (!merged.has(key)) merged.set(key, row);
  });
  return Array.from(merged.values());
}

function productFromRow(row: ProductInventoryRow): ProductInventoryItem {
  return {
    id: row.id,
    organizationId: row.organization_id ?? undefined,
    name: row.name,
    unit: row.unit ?? "Stk",
    openingStock: row.opening_stock ?? 0,
    minimumStock: row.minimum_stock ?? undefined,
    archivedAt: row.archived_at ?? undefined,
  };
}

function movementFromRow(row: ProductMovementRow): ProductMovement {
  return {
    id: row.id,
    productId: row.product_id,
    type: row.movement_type,
    quantity: row.quantity,
  };
}

type Props = {
  jobs: Job[];
  archivedJobs: Job[];
  subtasks: Subtask[];
  allSubtasks: Subtask[];
  onOpenFields: () => void;
  onOpenJobs: (showArchived?: boolean, statusFilter?: Status | "all") => void;
};

function getDashboardJobStatus(job: Job, subtasks: Subtask[]): Status {
  const items = subtasks.filter((subtask) => subtask.jobId === job.id);
  if (items.some((item) => item.status === "Problem")) return "Problem";
  if (items.length > 0 && items.every((item) => item.status === "erledigt")) return "erledigt";
  if (items.some((item) => item.status === "in Arbeit")) return "in Arbeit";
  if (items.some((item) => item.status === "pausiert")) return "pausiert";
  if (items.some((item) => item.status === "teilweise erledigt")) return "teilweise erledigt";
  if (items.some((item) => item.status === "reserviert")) return "reserviert";
  return "offen";
}

function readEquipmentProblemRows() {
  try {
    const raw = window.localStorage.getItem("farm-manager.driverEquipmentLog");
    const rows = raw ? JSON.parse(raw) as DriverEquipmentLogEntry[] : [];
    return rows.filter((row) => row.machineProblem || row.placement === "defect").slice(0, 8);
  } catch {
    return [];
  }
}

function getProductStock(product: ProductInventoryItem, movements: ProductMovement[]) {
  return (product.openingStock ?? 0) + movements
    .filter((movement) => movement.productId === product.id)
    .reduce((sum, movement) => sum + (movement.type === "in" ? movement.quantity : -movement.quantity), 0);
}

export function Dashboard({ jobs, archivedJobs, subtasks, allSubtasks, onOpenFields, onOpenJobs }: Props) {
  const { t, i18n } = useTranslation();
  const { authProfile, currentRole, fields } = useAppData();
  const [vacationRequests, setVacationRequests] = useState<VacationRequest[]>(() => readVacationRequests());
  const [dashboardProducts, setDashboardProducts] = useState<ProductInventoryItem[]>(() => readJsonArray<ProductInventoryItem>(productInventoryStorageKey));
  const [dashboardProductMovements, setDashboardProductMovements] = useState<ProductMovement[]>(() => readJsonArray<ProductMovement>(productMovementsStorageKey));
  useEffect(() => subscribeVacationRequests(() => setVacationRequests(readVacationRequests())), []);
  useEffect(() => {
    void loadVacationRequests().then(setVacationRequests);
  }, []);
  useEffect(() => {
    const refreshVacationRequests = () => {
      void loadVacationRequests().then(setVacationRequests);
    };
    const interval = window.setInterval(refreshVacationRequests, 30000);
    window.addEventListener("focus", refreshVacationRequests);
    document.addEventListener("visibilitychange", refreshVacationRequests);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVacationRequests);
      document.removeEventListener("visibilitychange", refreshVacationRequests);
    };
  }, []);
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    let mounted = true;
    async function loadDashboardProductInventory() {
      const [{ data: productRows, error: productError }, { data: movementRows, error: movementError }] = await Promise.all([
        client.from("product_inventory").select("id, organization_id, name, unit, opening_stock, minimum_stock, archived_at"),
        client.from("product_movements").select("id, product_id, movement_type, quantity"),
      ]);
      if (!mounted || productError || movementError) return;
      const nextProducts = mergeById(readJsonArray<ProductInventoryItem>(productInventoryStorageKey), ((productRows ?? []) as ProductInventoryRow[]).map(productFromRow));
      const nextMovements = mergeById(readJsonArray<ProductMovement>(productMovementsStorageKey), ((movementRows ?? []) as ProductMovementRow[]).map(movementFromRow));
      setDashboardProducts(nextProducts);
      setDashboardProductMovements(nextMovements);
      writeJsonArray(productInventoryStorageKey, nextProducts);
      writeJsonArray(productMovementsStorageKey, nextMovements);
    }
    void loadDashboardProductInventory();
    const interval = window.setInterval(loadDashboardProductInventory, 30000);
    window.addEventListener("focus", loadDashboardProductInventory);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", loadDashboardProductInventory);
    };
  }, []);
  const totalArea = fields.reduce((sum, field) => sum + field.areaHa, 0);
  const openJobs = jobs.filter((job) => getDashboardJobStatus(job, subtasks) === "offen").length;
  const doneJobs = archivedJobs.filter((job) => getDashboardJobStatus(job, allSubtasks) === "erledigt").length;
  const problems = subtasks.filter((subtask) => subtask.status === "Problem");
  const machineProblems = readEquipmentProblemRows();
  const openVacationRequests = vacationRequests.filter((request) => request.status === "requested");
  const lowStockProducts = dashboardProducts
    .filter((product) => !product.archivedAt)
    .filter((product) => currentRole === "support_admin" || !authProfile?.organizationId || product.organizationId === authProfile.organizationId)
    .map((product) => ({ product, stock: getProductStock(product, dashboardProductMovements) }))
    .filter(({ product, stock }) => product.minimumStock !== undefined && stock <= product.minimumStock);
  const alertCount = problems.length + machineProblems.length + openVacationRequests.length + lowStockProducts.length;

  function handleVacationDecision(request: VacationRequest, status: "approved" | "rejected") {
    const reason = window.prompt(t(status === "approved" ? "vacationApproval.approveReasonPrompt" : "vacationApproval.rejectReasonPrompt"), "");
    if (reason === null) return;
    void decideVacationRequest(request.id, status, t("vacationApproval.disposition"), reason.trim()).then(setVacationRequests);
  }

  return (
    <section className="view-stack dashboard-view">
      <div className="hero-band">
        <div>
          <h2>{t("dashboard.hero")}</h2>
        </div>
      </div>

      <div className="metric-grid">
        <Metric icon={ClipboardList} label={t("dashboard.activeJobs")} onClick={() => onOpenJobs(false, "all")} value={jobs.length.toString()} />
        <Metric icon={Route} label={t("dashboard.openJobs")} onClick={() => onOpenJobs(false, "offen")} value={openJobs.toString()} />
        <Metric icon={CheckCircle2} label={t("dashboard.completedJobs")} onClick={() => onOpenJobs(true, "erledigt")} value={doneJobs.toString()} />
        <Metric icon={MapPinned} label={t("dashboard.fields")} onClick={onOpenFields} value={`${fields.length} · ${formatArea(totalArea, i18n.language)}`} />
      </div>

      <div className="panel dashboard-alert-panel">
          <div className="section-heading">
            <h2>{t("dashboard.alertsProblems")}</h2>
            <span>{alertCount} {t("dashboard.open")}</span>
          </div>
          <div className="alert-list">
            {openVacationRequests.map((request) => (
              <div className="alert-item vacation-alert-item" key={request.id}>
                <AlertTriangle size={19} />
                <div className="vacation-alert-copy">
                  <strong>{t("vacationApproval.requestTitle")} · {request.driverName}</strong>
                  <span>{request.from}-{request.to} · {request.days} {t("driver.days")}{request.note ? ` · ${request.note}` : ""}</span>
                  <small>{t("vacationApproval.submittedAt", { time: new Date(request.createdAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) })}</small>
                  {request.history.filter((entry) => entry.action !== "submitted").slice(0, 2).map((entry) => (
                    <small key={entry.id}>{t(`vacationApproval.history.${entry.action}`)} · {entry.actorName} · {new Date(entry.createdAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}{entry.reason ? ` · ${entry.reason}` : ""}</small>
                  ))}
                </div>
                <div className="vacation-decision-actions">
                  <button className="secondary-action compact-action" onClick={() => handleVacationDecision(request, "rejected")} type="button">{t("vacationApproval.reject")}</button>
                  <button className="primary-action compact-action" onClick={() => handleVacationDecision(request, "approved")} type="button">{t("vacationApproval.approve")}</button>
                </div>
              </div>
            ))}
            {machineProblems.map((problem) => (
              <div className="alert-item" key={problem.id ?? `${problem.recordedAt}-${problem.driverName}`}>
                <AlertTriangle size={19} />
                <div>
                  <strong>{t("dashboard.machineProblem")} · {[...(problem.vehicleNames ?? []), ...(problem.implementNames ?? [])].join(" · ") || t("terms.vehicle")}</strong>
                  <span>{[problem.driverName, problem.problemRecipient ? t(`driver.notify.${problem.problemRecipient}`) : "", problem.note].filter(Boolean).join(" · ")}</span>
                </div>
                <span className="status-badge status-problem">{t("dashboard.notificationQueued")}</span>
              </div>
            ))}
            {lowStockProducts.map(({ product, stock }) => (
              <div className="alert-item" key={`low-stock-${product.id}`}>
                <Package size={19} />
                <div>
                  <strong>{t("products.lowStockTitle")} · {product.name}</strong>
                  <span>{t("products.lowStockDetail", { stock: `${stock.toLocaleString(i18n.language)} ${product.unit}`, minimum: `${product.minimumStock?.toLocaleString(i18n.language)} ${product.unit}` })}</span>
                </div>
                <span className="status-badge status-problem">{t("products.minimumStock")}</span>
              </div>
            ))}
            {problems.map((subtask) => (
              <div className="alert-item" key={subtask.id}>
                <AlertTriangle size={19} />
                <div>
                  <strong><FieldName id={subtask.fieldId} /> · {getTask(subtask, jobs)?.name}</strong>
                  <span>{subtask.note ?? t("dashboard.queryRequired")}</span>
                </div>
                <StatusBadge status={subtask.status} />
              </div>
            ))}
            {alertCount === 0 && <p className="muted">{t("dashboard.noAlertsProblems")}</p>}
          </div>
      </div>

      <div className="panel dashboard-map-panel">
        <div className="section-heading">
          <div>
            <h2>{t("dashboard.fieldsMapTitle")}</h2>
            <p>{t("dashboard.fieldsMapSubtitle")}</p>
          </div>
          <span>{fields.length} {t("dashboard.fields")}</span>
        </div>
        <CompanyFieldsMap fields={fields} jobs={jobs} onOpenFields={onOpenFields} subtasks={subtasks} />
      </div>
    </section>
  );
}

function Metric({ icon: Icon, label, onClick, value }: { icon: ElementType; label: string; onClick: () => void; value: string }) {
  return (
    <button className="metric-card metric-button" onClick={onClick} type="button">
      <Icon size={22} />
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

function CompanyFieldsMap({ fields, jobs, onOpenFields, subtasks }: { fields: Field[]; jobs: Job[]; onOpenFields: () => void; subtasks: Subtask[] }) {
  const { t, i18n } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const mapCenter = fields[0]?.center ?? { lat: 55.72, lng: 13.18 };
  const fieldSummaries = useMemo(() => {
    const statusWeight: Record<Status, number> = {
      Problem: 0,
      "in Arbeit": 1,
      pausiert: 2,
      "teilweise erledigt": 3,
      reserviert: 4,
      offen: 5,
      erledigt: 6,
    };
    const actionDateValue = (subtask: Subtask) => (
      subtask.completedAt
      ?? subtask.statusChangedAt
      ?? subtask.updatedAt
      ?? subtask.statusEvents?.at(-1)?.createdAt
      ?? subtask.driverPhotos?.at(-1)?.uploadedAt
      ?? ""
    );
    const formatActionDate = (value?: string) => {
      if (!value) return "";
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return value;
      return new Intl.DateTimeFormat(i18n.language, { dateStyle: "short" }).format(parsed);
    };
    return new Map(fields.map((field) => {
      const fieldSubtasks = subtasks
        .filter((subtask) => subtask.fieldId === field.id)
        .sort((a, b) => statusWeight[a.status] - statusWeight[b.status]);
      const activeSubtasks = fieldSubtasks.filter((subtask) => subtask.status !== "erledigt");
      const lastSubtask = [...fieldSubtasks]
        .filter((subtask) => actionDateValue(subtask))
        .sort((a, b) => Date.parse(actionDateValue(b)) - Date.parse(actionDateValue(a)))[0];
      const current = activeSubtasks[0] ?? fieldSubtasks[0];
      const job = current ? jobs.find((item) => item.id === current.jobId) : undefined;
      const task = current ? getTask(current, jobs) : undefined;
      const lastTask = lastSubtask ? getTask(lastSubtask, jobs) : undefined;
      const lastActionDate = lastSubtask ? formatActionDate(actionDateValue(lastSubtask)) : "";
      const lastAction = lastTask
        ? [lastTask.name, lastActionDate].filter(Boolean).join(" · ")
        : t("dashboard.noLastFieldAction");
      return [field.id, {
        nextAction: task?.name ?? t("dashboard.noPlannedFieldAction"),
        lastAction,
        timeWindow: job?.timeWindow,
      }];
    }));
  }, [fields, i18n.language, jobs, subtasks, t]);
  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    const boundaryPoints = fields.flatMap((field) => field.boundary.map((point) => [point.lat, point.lng] as [number, number]));
    const accessPoints = fields.map((field) => [field.accessPoint.lat, field.accessPoint.lng] as [number, number]);
    const points = boundaryPoints.length > 0 ? boundaryPoints : accessPoints;
    return points.length > 0 ? points : null;
  }, [fields]);

  if (fields.length === 0) {
    return (
      <button className="dashboard-empty-map" onClick={onOpenFields} type="button">
        <MapPinned size={24} />
        <span>{t("dashboard.noFieldsMap")}</span>
      </button>
    );
  }

  return (
    <div className={isExpanded ? "dashboard-map-open-area expanded" : "dashboard-map-open-area"}>
      <button className="dashboard-map-resize-button" onClick={() => setIsExpanded((expanded) => !expanded)} type="button">
        {isExpanded ? t("dashboard.shrinkMap") : t("dashboard.expandMap")}
      </button>
      <MapContainer center={[mapCenter.lat, mapCenter.lng]} className="leaflet-map dashboard-company-map" scrollWheelZoom={false} zoom={13}>
        <InvalidateDashboardMapSize trigger={isExpanded} />
        {bounds && <FitDashboardBounds bounds={bounds} trigger={isExpanded} />}
        <MapBaseLayers defaultLayer="imagery" />
        {fields.filter((field) => field.boundary.length >= 3).map((field) => {
          const summary = fieldSummaries.get(field.id);
          return (
            <Polygon
              key={field.id}
              pathOptions={{ color: "#e8fff0", fillColor: "#dff8cf", fillOpacity: 0.24, opacity: 0.95, weight: 2 }}
              positions={field.boundary.map((point) => [point.lat, point.lng] as [number, number])}
            >
              <Tooltip className="dashboard-field-tooltip" direction="top" opacity={1} sticky>
                <strong>{field.name}</strong>
                <span>{formatArea(field.areaHa, i18n.language)} · {field.crop}</span>
                <span>{t("fields.lastAction")}: {summary?.lastAction ?? t("dashboard.noLastFieldAction")}</span>
                <span>{t("dashboard.nextFieldAction")}: {summary?.nextAction ?? t("dashboard.noPlannedFieldAction")}</span>
                {summary?.timeWindow && <span>{summary.timeWindow}</span>}
              </Tooltip>
              <Popup>
                <strong>{field.name}</strong>
                <br />
                {formatArea(field.areaHa, i18n.language)} · {field.crop}
                <br />
                {t("fields.lastAction")}: {summary?.lastAction ?? t("dashboard.noLastFieldAction")}
                <br />
                {t("dashboard.nextFieldAction")}: {summary?.nextAction ?? t("dashboard.noPlannedFieldAction")}
              </Popup>
            </Polygon>
          );
        })}
        {fields.map((field) => (
          <CircleMarker center={[field.accessPoint.lat, field.accessPoint.lng]} key={`${field.id}-access`} pathOptions={{ color: "#1f5f9a", fillColor: "#1f78c1", fillOpacity: 0.95 }} radius={6}>
            <Tooltip className="dashboard-field-tooltip" direction="top" opacity={1} sticky>
              <strong>{field.name}</strong>
              <span>{formatArea(field.areaHa, i18n.language)} · {field.crop}</span>
              <span>{t("fields.lastAction")}: {fieldSummaries.get(field.id)?.lastAction ?? t("dashboard.noLastFieldAction")}</span>
              <span>{t("dashboard.nextFieldAction")}: {fieldSummaries.get(field.id)?.nextAction ?? t("dashboard.noPlannedFieldAction")}</span>
            </Tooltip>
            <Popup>
              <strong>{field.name}</strong>
              <br />
              {t("terms.accessPoint")}: {formatCoordinates(field.accessPoint)}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

function FitDashboardBounds({ bounds, trigger }: { bounds: LatLngBoundsExpression; trigger: boolean }) {
  const map = useMap();

  useEffect(() => {
    const fit = () => {
      map.invalidateSize();
      map.fitBounds(bounds, { maxZoom: 15, padding: [42, 42] });
    };
    fit();
    const first = window.setTimeout(fit, 180);
    const second = window.setTimeout(fit, 520);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [bounds, map, trigger]);

  return null;
}

function InvalidateDashboardMapSize({ trigger }: { trigger: boolean }) {
  const map = useMap();

  useEffect(() => {
    const id = window.setTimeout(() => {
      map.invalidateSize();
    }, 160);
    return () => window.clearTimeout(id);
  }, [map, trigger]);

  return null;
}
