import { Archive, Boxes, Building2, CalendarDays, Camera, CheckCircle, ChevronDown, ClipboardList, Clock, Eye, EyeOff, Factory, FileArchive, Lock, Mail, MessageSquare, Package, Plus, Printer, RadioTower, RotateCw, RotateCcw, Save, Settings, Tractor, Trash2, Truck, Unlock, User, UserMinus, UserPlus, Users, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAppData } from "../data/DataContext";
import { deleteDriverTimeEntry as deleteStoredDriverTimeEntry, loadDriverTimeEntries, readDriverTimeEntries, subscribeDriverTimeEntries, type DriverTimeEntry, type DriverTimeEntryKind, writeDriverTimeEntries } from "../lib/driverTimeEntries";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { decideVacationRequest, loadVacationRequests, readVacationRequests, subscribeVacationRequests, type VacationRequest } from "../lib/vacationRequests";
import type { Driver, DriverLocation, ExternalContact, ExternalContactType, FieldMapPattern, Implement, Job, Organization, OrganizationRelationship, PersonnelAppPermissionKey, PersonnelEmployeeType, ProgressMetric, Subtask, Task, TaskTemplate, UserRole, Vehicle, ViewKey, WorkMode } from "../types";
import { DriverChips, FieldName, ProgressBar, StatusBadge, getTask } from "./shared";
import { LiveLocationMap } from "./LiveLocationMap";

type ContractorSection = "overview" | "masterOverview" | "masterData" | "organizations" | "products" | "taskTemplates" | "jobTypes" | "programSettings";
type OrganizationDirectoryMode = "company" | "contacts" | "collaboration";
type MasterResourceGroup = "personnel" | "vehicles" | "implements";
type MasterDataFocus = { group: MasterResourceGroup; id: string } | { section: "programSettings" };
type DragResourceKind = "driver" | "vehicle" | "implement";
type BillingUnit = "ha" | "hour" | "trip" | "quantity" | "flat";
type TaskBillingCondition = {
  billingUnit: BillingUnit;
  price?: number;
  currency?: string;
  validFrom?: string;
  validTo?: string;
};
type CustomerConditionRow = TaskBillingCondition & {
  id: string;
  taskName: string;
};
type ReportPreview = {
  title: string;
  html: string;
};
type TimeEntryEditDraft = {
  id: string;
  kind: DriverTimeEntryKind;
  startedAt: string;
  endedAt: string;
  reason: string;
  jobNumber: string;
  note: string;
};
const personnelViewOptions: ViewKey[] = ["dashboard", "fields", "jobs", "contractor", "masterData", "report", "driver"];
const personnelPermissionOptions: PersonnelAppPermissionKey[] = ["canEditFields", "canCreateJobs", "canEditDrivers", "canAssignDrivers"];
type DragResourcePayload = {
  kind: DragResourceKind;
  id: string;
  sourceSubtaskId?: string;
  sourceSubtaskIds?: string[];
};
type DragJobPayload = {
  jobId: string;
  sourceOffsetDays: number;
};
type StandardVehiclePlanningMode = "none" | "automatic" | "ask";
type MapProviderPreference = "osm" | "google" | "hitta_se" | "lantmateriet";
type DispatchCalendarMode = "single" | "grouped";
type DispatchGroupingLevel = "job_task" | "task";
type ResourceHistoryEvent = "created" | "updated" | "archived" | "restored" | "deleted" | "assigned" | "equipment";

type ResourceHistoryEntry = {
  id: string;
  resourceGroup: MasterResourceGroup;
  resourceId: string;
  event: ResourceHistoryEvent;
  recordedAt: string;
  actor?: string;
  title?: string;
  details?: string;
  jobNumber?: string;
  status?: string;
};

type DriverEquipmentLogEntry = {
  id?: string;
  eventType?: string;
  recordedAt?: string;
  driverId?: string;
  driverName?: string;
  placement?: string;
  note?: string;
  vehicleIds?: string[];
  vehicleNames?: string[];
  implementIds?: string[];
  implementNames?: string[];
  handoverToDriverName?: string;
  machineProblem?: boolean;
  problemRecipient?: string;
  notificationStatus?: string;
};

type DispatchGroup = {
  id: string;
  job?: Job;
  jobIds: string[];
  customerNames: string[];
  taskName: string;
  taskId: string;
  offsetDays: number;
  sourceOffsetDays?: number;
  isRollover?: boolean;
  subtasks: Subtask[];
  totalAreaHa: number;
  totalHours: number;
  completedCount: number;
  orderedSubtasks: Subtask[];
};

const resourceHistoryStorageKey = "farm-manager.resourceHistory";
const equipmentLogStorageKey = "farm-manager.driverEquipmentLog";
const inactiveCollaborationsStorageKey = "farm-manager.inactiveCollaborations";
const productInventoryStorageKey = "farm-manager.productInventory";
const productMovementsStorageKey = "farm-manager.productMovements";
const productCurrencyOptions = ["SEK", "EUR", "DKK", "NOK", "USD"];
const taskBillingMarker = "FM_TASK_BILLING:";
const customerConditionsMarker = "FM_CUSTOMER_CONDITIONS:";

type ProductInventoryItem = {
  id: string;
  organizationId?: string;
  name: string;
  category: string;
  unit: string;
  supplierName?: string;
  articleNumber?: string;
  photoUrl?: string;
  photoName?: string;
  currency?: string;
  purchasePrice?: number;
  salesPrice?: number;
  purchasePriceValidFrom?: string;
  purchasePriceValidTo?: string;
  salesPriceValidFrom?: string;
  salesPriceValidTo?: string;
  openingStock: number;
  minimumStock?: number;
  packageUnit?: string;
  quantityPerPackage?: number;
  notes?: string;
  archivedAt?: string;
};

type ProductMovementDocument = {
  id: string;
  name: string;
  kind: "photo" | "document";
  url: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedAt: string;
};

type ProductMovement = {
  id: string;
  productId: string;
  type: "in" | "out";
  quantity: number;
  packageCount?: number;
  packageQuantity?: number;
  openedPackageCount?: number;
  openedPackageQuantity?: number;
  bookedAt: string;
  createdAt?: string;
  bookedById?: string;
  bookedByName?: string;
  jobId?: string;
  jobLabel?: string;
  currency?: string;
  purchasePrice?: number;
  salesPrice?: number;
  note?: string;
  correctionOfMovementId?: string;
  documents: ProductMovementDocument[];
};

type ProductInventoryRow = {
  id: string;
  organization_id?: string | null;
  name: string;
  category?: string | null;
  unit?: string | null;
  supplier_name?: string | null;
  article_number?: string | null;
  photo_url?: string | null;
  photo_name?: string | null;
  currency?: string | null;
  purchase_price?: number | null;
  sales_price?: number | null;
  purchase_price_valid_from?: string | null;
  purchase_price_valid_to?: string | null;
  sales_price_valid_from?: string | null;
  sales_price_valid_to?: string | null;
  opening_stock?: number | null;
  minimum_stock?: number | null;
  package_unit?: string | null;
  quantity_per_package?: number | null;
  notes?: string | null;
  archived_at?: string | null;
};

type ProductMovementRow = {
  id: string;
  product_id: string;
  movement_type: ProductMovement["type"];
  quantity: number;
  package_count?: number | null;
  package_quantity?: number | null;
  opened_package_count?: number | null;
  opened_package_quantity?: number | null;
  booked_at: string;
  created_at?: string | null;
  booked_by_id?: string | null;
  booked_by_name?: string | null;
  job_id?: string | null;
  job_label?: string | null;
  currency?: string | null;
  purchase_price?: number | null;
  note?: string | null;
  correction_of_movement_id?: string | null;
  documents?: ProductMovementDocument[] | null;
};

function readJsonArray<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T[] : [];
  } catch {
    return [];
  }
}

function readStringSet(key: string) {
  return new Set(readJsonArray<string>(key));
}

function writeJsonArray<T>(key: string, values: T[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch (error) {
    console.error(`Farm-Manager konnte ${key} nicht lokal speichern.`, error);
  }
}

function mergeById<T extends { id: string }>(localRows: T[], remoteRows: T[]) {
  const merged = new Map<string, T>();
  remoteRows.forEach((row) => merged.set(row.id, row));
  localRows.forEach((row) => {
    if (!merged.has(row.id)) merged.set(row.id, row);
  });
  return Array.from(merged.values());
}

function productFromRow(row: ProductInventoryRow): ProductInventoryItem {
  return {
    id: row.id,
    organizationId: row.organization_id ?? undefined,
    name: row.name,
    category: row.category ?? "",
    unit: row.unit ?? "Stk",
    supplierName: row.supplier_name ?? undefined,
    articleNumber: row.article_number ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    photoName: row.photo_name ?? undefined,
    currency: row.currency ?? "SEK",
    purchasePrice: row.purchase_price ?? undefined,
    salesPrice: row.sales_price ?? undefined,
    purchasePriceValidFrom: row.purchase_price_valid_from ?? undefined,
    purchasePriceValidTo: row.purchase_price_valid_to ?? undefined,
    salesPriceValidFrom: row.sales_price_valid_from ?? undefined,
    salesPriceValidTo: row.sales_price_valid_to ?? undefined,
    openingStock: row.opening_stock ?? 0,
    minimumStock: row.minimum_stock ?? undefined,
    packageUnit: row.package_unit ?? undefined,
    quantityPerPackage: row.quantity_per_package ?? undefined,
    notes: row.notes ?? undefined,
    archivedAt: row.archived_at ?? undefined,
  };
}

function productToRow(product: ProductInventoryItem): ProductInventoryRow {
  return {
    id: product.id,
    organization_id: product.organizationId ?? null,
    name: product.name,
    category: product.category,
    unit: product.unit,
    supplier_name: product.supplierName ?? null,
    article_number: product.articleNumber ?? null,
    photo_url: product.photoUrl ?? null,
    photo_name: product.photoName ?? null,
    currency: product.currency ?? "SEK",
    purchase_price: product.purchasePrice ?? null,
    sales_price: product.salesPrice ?? null,
    purchase_price_valid_from: product.purchasePriceValidFrom ?? null,
    purchase_price_valid_to: product.purchasePriceValidTo ?? null,
    sales_price_valid_from: product.salesPriceValidFrom ?? null,
    sales_price_valid_to: product.salesPriceValidTo ?? null,
    opening_stock: product.openingStock,
    minimum_stock: product.minimumStock ?? null,
    package_unit: product.packageUnit ?? null,
    quantity_per_package: product.quantityPerPackage ?? null,
    notes: product.notes ?? null,
    archived_at: product.archivedAt ?? null,
  };
}

function productMovementFromRow(row: ProductMovementRow): ProductMovement {
  return {
    id: row.id,
    productId: row.product_id,
    type: row.movement_type,
    quantity: row.quantity,
    packageCount: row.package_count ?? undefined,
    packageQuantity: row.package_quantity ?? undefined,
    openedPackageCount: row.opened_package_count ?? undefined,
    openedPackageQuantity: row.opened_package_quantity ?? undefined,
    bookedAt: row.booked_at,
    createdAt: row.created_at ?? undefined,
    bookedById: row.booked_by_id ?? undefined,
    bookedByName: row.booked_by_name ?? undefined,
    jobId: row.job_id ?? undefined,
    jobLabel: row.job_label ?? undefined,
    currency: row.currency ?? "SEK",
    purchasePrice: row.purchase_price ?? undefined,
    note: row.note ?? undefined,
    correctionOfMovementId: row.correction_of_movement_id ?? undefined,
    documents: row.documents ?? [],
  };
}

function productMovementToRow(movement: ProductMovement): ProductMovementRow {
  return {
    id: movement.id,
    product_id: movement.productId,
    movement_type: movement.type,
    quantity: movement.quantity,
    package_count: movement.packageCount ?? null,
    package_quantity: movement.packageQuantity ?? null,
    opened_package_count: movement.openedPackageCount ?? null,
    opened_package_quantity: movement.openedPackageQuantity ?? null,
    booked_at: movement.bookedAt,
    created_at: movement.createdAt ?? null,
    booked_by_id: movement.bookedById ?? null,
    booked_by_name: movement.bookedByName ?? null,
    job_id: movement.jobId ?? null,
    job_label: movement.jobLabel ?? null,
    currency: movement.currency ?? "SEK",
    purchase_price: movement.purchasePrice ?? null,
    note: movement.note ?? null,
    correction_of_movement_id: movement.correctionOfMovementId ?? null,
    documents: movement.documents,
  };
}

function createLocalId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function fileToDataDocument(file: File): Promise<ProductMovementDocument> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: createLocalId("document"),
        name: file.name || "Beleg",
        kind: file.type.startsWith("image/") ? "photo" : "document",
        url: String(reader.result ?? ""),
        mimeType: file.type,
        sizeBytes: file.size,
        uploadedAt: new Date().toISOString(),
      });
    };
    reader.readAsDataURL(file);
  });
}

const calendarColumnCount = 5;
const taskModes: WorkMode[] = ["Einzelmodus", "Teammodus", "Rollenmodus", "Flächenteilung"];
const taskMetrics: ProgressMetric[] = ["Fläche", "Menge", "Fuhren", "Zeit"];
const mapPatterns: FieldMapPattern[] = ["none", "whiteDots"];
const employeeTimeEditWindowStorageKey = "farm-manager.employeeTimeEditWindowDays";

function normalizeEmail(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function distanceKm(a?: { lat: number; lng: number }, b?: { lat: number; lng: number }) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const earthRadiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}

function formatOrganizationAddress(organization: Organization) {
  const cityLine = [organization.postalCode, organization.city].filter(Boolean).join(" ");
  return [organization.street, cityLine, organization.country].filter(Boolean).join(", ") || organization.address || "";
}

function formatDurationMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function toDateTimeInputValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function fromDateTimeInputValue(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function minutesBetween(startedAt?: string, endedAt?: string) {
  if (!startedAt || !endedAt) return undefined;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined;
  return Math.max(1, Math.round((end - start) / 60000));
}

function sortOpenBeforeDone(items: Subtask[]) {
  return [...items].sort((a, b) => Number(a.status === "erledigt") - Number(b.status === "erledigt"));
}

function formatCalendarDate(offsetDays: number, language: string) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return new Intl.DateTimeFormat(language, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function getRelativeDayLabel(offsetDays: number, t: (key: string, options?: Record<string, unknown>) => string) {
  if (offsetDays === 0) return t("contractor.today");
  if (offsetDays === 1) return t("contractor.tomorrow");
  if (offsetDays === 2) return t("contractor.dayAfterTomorrow");
  if (offsetDays === -1) return t("contractor.yesterday");
  return offsetDays > 0
    ? t("contractor.inDays", { count: offsetDays })
    : t("contractor.daysAgo", { count: Math.abs(offsetDays) });
}

function parseJobDateOffset(job?: Job) {
  const dateMatch = job?.timeWindow?.match(/(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return undefined;
  const target = new Date(`${dateMatch[1]}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatIsoDateForOffset(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getIsoWeek(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function ContractorView({
  subtasks,
  jobs,
  driverLocations,
  onRefreshDriverLocations,
  onUpdateSubtask,
  onUpdateJob,
  variant = "dispatch",
  masterDataFocus,
  onOpenMasterData,
  onOpenJob,
  onResetOrganizationOperationalData,
}: {
  subtasks: Subtask[];
  jobs: Job[];
  driverLocations: DriverLocation[];
  onRefreshDriverLocations?: () => void;
  onUpdateSubtask: (id: string, patch: Partial<Subtask>) => void;
  onUpdateJob?: (id: string, patch: Partial<Job>) => void;
  variant?: "dispatch" | "masterData";
  masterDataFocus?: MasterDataFocus | null;
  onOpenMasterData?: (focus: { group: MasterResourceGroup; id: string }) => void;
  onOpenJob?: (jobId: string) => void;
  onResetOrganizationOperationalData?: (organizationId: string) => Promise<{ ok: boolean; deletedJobs: number; deletedSubtasks: number; error?: string }>;
}) {
  const { t, i18n } = useTranslation();
  const {
    addDriver,
    addImplement,
    addOrganization,
    addVehicle,
    archiveOrganization,
    archiveDriver,
    archiveImplement,
    archiveVehicle,
    restoreDriver,
    restoreImplement,
    restoreVehicle,
    deleteDriver,
    deleteImplement,
    deleteOrganization,
    deleteVehicle,
    drivers: allDrivers,
    fields,
    implementsList: allImplementsList,
    organizations,
    organizationRelationships,
    externalContacts,
    permissions,
    authProfile,
    currentRole,
    updateDriver,
    updateImplement,
    updateOrganization,
    addOrganizationRelationship,
    updateOrganizationRelationship,
    deleteOrganizationRelationship,
    addExternalContact,
    updateExternalContact,
    addJobType,
    updateJobType,
    archiveJobType,
    deleteJobType,
    addTaskTemplate,
    updateTaskTemplate,
    archiveTaskTemplate,
    deleteTaskTemplate,
    updateVehicle,
    vehicles: allVehicles,
    jobTypes,
    taskTemplates,
  } = useAppData();
  const [activeSection, setActiveSection] = useState<ContractorSection>(() => variant === "masterData" ? "masterOverview" : "overview");
  const [activeMasterGroup, setActiveMasterGroup] = useState<MasterResourceGroup>("personnel");
  const [masterArchiveView, setMasterArchiveView] = useState<Record<MasterResourceGroup, boolean>>({
    personnel: false,
    vehicles: false,
    implements: false,
  });
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [isOrganizationModalOpen, setIsOrganizationModalOpen] = useState(false);
  const [creatingOrganization, setCreatingOrganization] = useState(false);
  const [creatingResourceGroup, setCreatingResourceGroup] = useState<MasterResourceGroup | null>(null);
  const [isTaskTemplateModalOpen, setIsTaskTemplateModalOpen] = useState(false);
  const [deleteResourceConfirm, setDeleteResourceConfirm] = useState<{ id: string; name: string; group: MasterResourceGroup } | null>(null);
  const [deleteOrganizationConfirm, setDeleteOrganizationConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleteTaskTemplateConfirm, setDeleteTaskTemplateConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleteJobTypeConfirm, setDeleteJobTypeConfirm] = useState<{ id: string; name: string } | null>(null);
  const [showArchivedTaskTemplates, setShowArchivedTaskTemplates] = useState(false);
  const [showArchivedJobTypes, setShowArchivedJobTypes] = useState(false);
  const [showArchivedOrganizations, setShowArchivedOrganizations] = useState(false);
  const [standardVehicleMode, setStandardVehicleMode] = useState<StandardVehiclePlanningMode>(() => {
    const stored = window.localStorage.getItem("farm-manager.standardVehiclePlanningMode") as StandardVehiclePlanningMode | null;
    return stored ?? "ask";
  });
  const [mapProviderPreference, setMapProviderPreference] = useState<MapProviderPreference>(() => {
    const stored = window.localStorage.getItem("farm-manager.mapProviderPreference");
    const allowedProviders: MapProviderPreference[] = ["osm", "google", "hitta_se", "lantmateriet"];
    return allowedProviders.includes(stored as MapProviderPreference) ? stored as MapProviderPreference : "osm";
  });
  const [dispatchGroupingLevel, setDispatchGroupingLevel] = useState<DispatchGroupingLevel>(() => {
    const stored = window.localStorage.getItem("farm-manager.dispatchGroupingLevel") as DispatchGroupingLevel | null;
    return stored ?? "task";
  });
  const [calendarStartOffset, setCalendarStartOffset] = useState(0);
  const [dispatchCalendarMode, setDispatchCalendarMode] = useState<DispatchCalendarMode>("single");
  const [selectedDispatchCustomerIds, setSelectedDispatchCustomerIds] = useState<string[]>([]);
  const [standardVehicleChoice, setStandardVehicleChoice] = useState<{ driverId: string; subtaskId: string } | null>(null);
  const [moveResourceConfirm, setMoveResourceConfirm] = useState<{ jobId: string; targetOffsetDays: number } | null>(null);
  const [resourceHistoryVersion, setResourceHistoryVersion] = useState(0);
  const [vacationRequests, setVacationRequests] = useState<VacationRequest[]>(() => readVacationRequests());
  const [driverTimeEntries, setDriverTimeEntries] = useState<DriverTimeEntry[]>(() => readDriverTimeEntries());
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  const [reportPreview, setReportPreview] = useState<ReportPreview | null>(null);
  const [payrollMonth, setPayrollMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [employeeTimeEditWindowDays, setEmployeeTimeEditWindowDays] = useState(() => {
    const stored = window.localStorage.getItem(employeeTimeEditWindowStorageKey);
    const parsed = stored ? Number(stored) : 3;
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 3;
  });
  const [editingTimeEntryId, setEditingTimeEntryId] = useState("");
  const [timeEntryEditDraft, setTimeEntryEditDraft] = useState<TimeEntryEditDraft | null>(null);
  const [deleteTimeEntryConfirm, setDeleteTimeEntryConfirm] = useState<DriverTimeEntry | null>(null);
  const [timeEntryEditNotice, setTimeEntryEditNotice] = useState("");
  const [resetOrganizationConfirm, setResetOrganizationConfirm] = useState<Organization | null>(null);
  const [resetOrganizationStatus, setResetOrganizationStatus] = useState("");
  const [organizationDirectoryMode, setOrganizationDirectoryMode] = useState<OrganizationDirectoryMode>("company");
  const [inactiveCollaborationIds, setInactiveCollaborationIds] = useState<Set<string>>(() => readStringSet(inactiveCollaborationsStorageKey));
  const [collaborationInviteForm, setCollaborationInviteForm] = useState({
    email: "",
    organizationNumber: "",
    companyName: "",
    message: "",
  });
  const [organizationLoginPassword, setOrganizationLoginPassword] = useState("");
  const [organizationLoginStatus, setOrganizationLoginStatus] = useState("");
  const [showArchivedProducts, setShowArchivedProducts] = useState(false);
  const [products, setProducts] = useState<ProductInventoryItem[]>(() => readJsonArray<ProductInventoryItem>(productInventoryStorageKey));
  const [productMovements, setProductMovements] = useState<ProductMovement[]>(() => readJsonArray<ProductMovement>(productMovementsStorageKey));
  const [selectedProductId, setSelectedProductId] = useState("");
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [productForm, setProductForm] = useState({
    name: "",
    category: "",
    unit: "Stk",
    supplierName: "",
    articleNumber: "",
    photoUrl: "",
    photoName: "",
    currency: "SEK",
    purchasePrice: "",
    salesPrice: "",
    purchasePriceValidFrom: "",
    purchasePriceValidTo: "",
    salesPriceValidFrom: "",
    salesPriceValidTo: "",
    openingStock: "0",
    minimumStock: "",
    packageUnit: "",
    quantityPerPackage: "",
    notes: "",
  });
  const [movementForm, setMovementForm] = useState({
    type: "in" as ProductMovement["type"],
    quantity: "",
    deliveredTotal: "",
    packageCount: "",
    packageQuantity: "",
    openedPackageCount: "",
    openedPackageQuantity: "",
    bookedAt: new Date().toISOString().slice(0, 10),
    jobId: "",
    purchasePrice: "",
    note: "",
    correctionOfMovementId: "",
  });
  const [movementDocuments, setMovementDocuments] = useState<ProductMovementDocument[]>([]);
  const [selectedProductMovementId, setSelectedProductMovementId] = useState("");
  const [isProductBookingModalOpen, setIsProductBookingModalOpen] = useState(false);
  const [isProductMovementsModalOpen, setIsProductMovementsModalOpen] = useState(false);
  const reportPreviewFrameRef = useRef<HTMLIFrameElement>(null);
  const [workTimeOverride, setWorkTimeOverride] = useState<{
    driverId: string;
    subtaskId: string;
    planned: number;
    added: number;
    max: number;
  } | null>(null);
  const problems = subtasks.filter((subtask) => subtask.status === "Problem");
  const machineProblems = readJsonArray<DriverEquipmentLogEntry>(equipmentLogStorageKey)
    .filter((row) => row.machineProblem || row.placement === "defect")
    .slice(0, 12);
  const openVacationRequests = vacationRequests.filter((request) => request.status === "requested");
  const resourceOrganizationId = currentRole === "contractor_admin" || currentRole === "farmer_admin" ? authProfile?.organizationId : undefined;
  const scopedProducts = useMemo(() => products.filter((product) => !resourceOrganizationId || product.organizationId === resourceOrganizationId), [products, resourceOrganizationId]);
  const activeProducts = scopedProducts.filter((product) => !product.archivedAt);
  const archivedProducts = scopedProducts.filter((product) => Boolean(product.archivedAt));
  const visibleProducts = showArchivedProducts ? archivedProducts : activeProducts;
  const selectedProduct = visibleProducts.find((product) => product.id === selectedProductId) ?? (isCreatingProduct ? undefined : visibleProducts[0]);
  const canManageProducts = currentRole === "support_admin" || currentRole === "contractor_admin" || currentRole === "farmer_admin";
  const supplierNameOptions = useMemo(() => Array.from(new Set([
    ...organizations.filter((organization) => organization.kind === "supplier" && !organization.archivedAt).map((organization) => organization.name),
    ...externalContacts.filter((contact) => contact.contactType === "supplier" && contact.status !== "archived").map((contact) => contact.companyName),
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b)), [externalContacts, organizations]);
  const productStock = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    const movementStock = productMovements
      .filter((movement) => movement.productId === productId)
      .reduce((sum, movement) => sum + (movement.type === "in" ? movement.quantity : -movement.quantity), 0);
    return (product?.openingStock ?? 0) + movementStock;
  };
  const selectedProductMovements = selectedProduct ? productMovements
    .filter((movement) => movement.productId === selectedProduct.id)
    .sort((a, b) => b.bookedAt.localeCompare(a.bookedAt)) : [];
  const selectedProductMovement = productMovements.find((movement) => movement.id === selectedProductMovementId);
  const selectedProductMovementProduct = selectedProductMovement ? products.find((product) => product.id === selectedProductMovement.productId) : undefined;
  const lowStockProducts = activeProducts
    .map((product) => ({ product, stock: productStock(product.id) }))
    .filter(({ product, stock }) => product.minimumStock !== undefined && stock <= product.minimumStock);
  const inventoryValuesByCurrency = activeProducts.reduce<Record<string, number>>((acc, product) => {
    const currency = product.currency || "SEK";
    acc[currency] = (acc[currency] ?? 0) + productStock(product.id) * (product.purchasePrice ?? 0);
    return acc;
  }, {});
  const inventoryValueLabel = Object.entries(inventoryValuesByCurrency)
    .filter(([, value]) => value > 0)
    .map(([currency, value]) => formatMoneyValue(value, currency))
    .join(" · ") || formatMoneyValue(0, "SEK");
  const problemCount = problems.length + machineProblems.length + openVacationRequests.length + lowStockProducts.length;
  const canControlResource = <T extends { organizationId?: string }>(resource?: T) => currentRole === "support_admin" || !resourceOrganizationId || resource?.organizationId === resourceOrganizationId;
  const organizationResourceFilter = <T extends { organizationId?: string }>(resource: T) => !resourceOrganizationId || resource.organizationId === resourceOrganizationId;
  const scopedDrivers = useMemo(() => allDrivers.filter(organizationResourceFilter), [allDrivers, resourceOrganizationId]);
  const scopedVehicles = useMemo(() => allVehicles.filter(organizationResourceFilter), [allVehicles, resourceOrganizationId]);
  const scopedImplements = useMemo(() => allImplementsList.filter(organizationResourceFilter), [allImplementsList, resourceOrganizationId]);
  const drivers = useMemo(() => scopedDrivers.filter((driver) => !driver.archivedAt), [scopedDrivers]);
  const vehicles = useMemo(() => scopedVehicles.filter((vehicle) => !vehicle.archivedAt), [scopedVehicles]);
  const implementsList = useMemo(() => scopedImplements.filter((implement) => !implement.archivedAt), [scopedImplements]);
  const archivedDrivers = useMemo(() => scopedDrivers.filter((driver) => Boolean(driver.archivedAt)), [scopedDrivers]);
  const archivedVehicles = useMemo(() => scopedVehicles.filter((vehicle) => Boolean(vehicle.archivedAt)), [scopedVehicles]);
  const archivedImplements = useMemo(() => scopedImplements.filter((implement) => Boolean(implement.archivedAt)), [scopedImplements]);
  const showArchivedMasterData = masterArchiveView[activeMasterGroup];
  const masterDrivers = useMemo(() => masterArchiveView.personnel ? archivedDrivers : drivers, [archivedDrivers, drivers, masterArchiveView.personnel]);
  const masterVehicles = useMemo(() => masterArchiveView.vehicles ? archivedVehicles : vehicles, [archivedVehicles, masterArchiveView.vehicles, vehicles]);
  const masterImplements = useMemo(() => masterArchiveView.implements ? archivedImplements : implementsList, [archivedImplements, implementsList, masterArchiveView.implements]);
  const activeTaskTemplates = useMemo(() => taskTemplates.filter((taskTemplate) => !taskTemplate.archivedAt), [taskTemplates]);
  const archivedTaskTemplates = useMemo(() => taskTemplates.filter((taskTemplate) => Boolean(taskTemplate.archivedAt)), [taskTemplates]);
  const visibleTaskTemplates = showArchivedTaskTemplates ? archivedTaskTemplates : activeTaskTemplates;
  const activeJobTypes = useMemo(() => jobTypes.filter((jobType) => !jobType.archivedAt), [jobTypes]);
  const archivedJobTypes = useMemo(() => jobTypes.filter((jobType) => Boolean(jobType.archivedAt)), [jobTypes]);
  const visibleJobTypes = showArchivedJobTypes ? archivedJobTypes : activeJobTypes;
  const [selectedDriverId, setSelectedDriverId] = useState(allDrivers[0]?.id ?? "");
  const [selectedVehicleId, setSelectedVehicleId] = useState(allVehicles[0]?.id ?? "");
  const [selectedImplementId, setSelectedImplementId] = useState(allImplementsList[0]?.id ?? "");
  const [selectedJobTypeId, setSelectedJobTypeId] = useState(jobTypes[0]?.id ?? "");
  const [selectedTaskTemplateId, setSelectedTaskTemplateId] = useState(taskTemplates[0]?.id ?? "");
  const [jobTypeTaskToAdd, setJobTypeTaskToAdd] = useState("");
  const [showDriverPassword, setShowDriverPassword] = useState(false);
  const [assignDriverId, setAssignDriverId] = useState(drivers[0]?.id ?? "");
  const [assignVehicleId, setAssignVehicleId] = useState(vehicles[0]?.id ?? "");
  const [assignImplementId, setAssignImplementId] = useState(implementsList[0]?.id ?? "");
  const selectedDriver = (variant === "masterData" ? masterDrivers : drivers).find((driver) => driver.id === selectedDriverId) ?? (variant === "masterData" ? masterDrivers[0] : drivers[0]);
  const selectedVehicle = (variant === "masterData" ? masterVehicles : vehicles).find((vehicle) => vehicle.id === selectedVehicleId) ?? (variant === "masterData" ? masterVehicles[0] : vehicles[0]);
  const selectedImplement = (variant === "masterData" ? masterImplements : implementsList).find((implement) => implement.id === selectedImplementId) ?? (variant === "masterData" ? masterImplements[0] : implementsList[0]);
  const canManageOrganizations = currentRole === "farmer_admin" || currentRole === "contractor_admin" || currentRole === "support_admin";
  const canCreateOrganizations = currentRole === "farmer_admin" || currentRole === "contractor_admin" || currentRole === "support_admin";
  const canManageResources = permissions.canEditDrivers;
  const canManageOwnTemplates = currentRole === "farmer_admin" || currentRole === "contractor_admin" || currentRole === "support_admin";
  const selectedJobType = visibleJobTypes.find((jobType) => jobType.id === selectedJobTypeId) ?? visibleJobTypes[0];
  const selectedTaskTemplate = visibleTaskTemplates.find((taskTemplate) => taskTemplate.id === selectedTaskTemplateId) ?? visibleTaskTemplates[0];
  const selectedDriverTimeEntries = useMemo(() => (
    selectedDriver ? driverTimeEntries.filter((entry) => entry.driverId === selectedDriver.id) : []
  ), [driverTimeEntries, selectedDriver]);
  const selectedDriverClosedTimeEntries = useMemo(() => (
    selectedDriverTimeEntries.filter((entry) => entry.endedAt && entry.minutes)
  ), [selectedDriverTimeEntries]);
  const selectedDriverVacationRequests = useMemo(() => (
    selectedDriver ? vacationRequests.filter((request) => request.driverId === selectedDriver.id) : []
  ), [selectedDriver, vacationRequests]);
  const selectedDriverOpenVacationRequests = useMemo(() => (
    selectedDriverVacationRequests.filter((request) => request.status === "requested")
  ), [selectedDriverVacationRequests]);
  const selectedDriverVacationUsedDays = selectedDriver?.vacationUsedDays ?? 0;
  const selectedDriverVacationAllowance = selectedDriver?.annualVacationDays ?? 30;
  const selectedDriverVacationRequestedDays = selectedDriverVacationRequests
    .filter((request) => request.status === "requested" || request.status === "approved")
    .reduce((sum, request) => sum + request.days, 0);
  const selectedDriverVacationRemaining = Math.max(0, selectedDriverVacationAllowance - selectedDriverVacationUsedDays - selectedDriverVacationRequestedDays);
  const personnelTimeSummary = useMemo(() => masterDrivers.map((driver) => {
    const entries = driverTimeEntries.filter((entry) => entry.driverId === driver.id && entry.endedAt && entry.minutes);
    const requests = vacationRequests.filter((request) => request.driverId === driver.id);
    return {
      driverId: driver.id,
      workMinutes: entries.filter((entry) => entry.kind === "work" || entry.kind === "interruption").reduce((sum, entry) => sum + (entry.minutes ?? 0), 0),
      pauseMinutes: entries.filter((entry) => entry.kind === "pause").reduce((sum, entry) => sum + (entry.minutes ?? 0), 0),
      openVacationRequests: requests.filter((request) => request.status === "requested").length,
      vacationRemaining: Math.max(0, (driver.annualVacationDays ?? 30) - (driver.vacationUsedDays ?? 0) - requests.filter((request) => request.status === "requested" || request.status === "approved").reduce((sum, request) => sum + request.days, 0)),
    };
  }), [driverTimeEntries, masterDrivers, vacationRequests]);
  const personnelOpenVacationRequestCount = personnelTimeSummary.reduce((sum, row) => sum + row.openVacationRequests, 0);
  const personnelTotalWorkMinutes = personnelTimeSummary.reduce((sum, row) => sum + row.workMinutes, 0);
  const personnelTotalPauseMinutes = personnelTimeSummary.reduce((sum, row) => sum + row.pauseMinutes, 0);
  const payrollMonthOptions = useMemo(() => {
    const months = new Set<string>([payrollMonth, new Date().toISOString().slice(0, 7)]);
    driverTimeEntries.forEach((entry) => months.add(entry.startedAt.slice(0, 7)));
    vacationRequests.forEach((request) => {
      months.add(request.from.slice(0, 7));
      months.add(request.to.slice(0, 7));
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [driverTimeEntries, payrollMonth, vacationRequests]);
  const payrollSummaries = useMemo(() => masterDrivers.map((driver) => {
    const monthEntries = driverTimeEntries
      .filter((entry) => entry.driverId === driver.id && entry.startedAt.slice(0, 7) === payrollMonth)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const closed = monthEntries.filter((entry) => entry.endedAt && entry.minutes);
    const requests = vacationRequests.filter((request) => (
      request.driverId === driver.id
      && (request.from.slice(0, 7) === payrollMonth || request.to.slice(0, 7) === payrollMonth)
    ));
    return {
      driver,
      entries: monthEntries,
      vacationRequests: requests,
      workMinutes: closed.filter((entry) => entry.kind === "work" || entry.kind === "interruption").reduce((sum, entry) => sum + (entry.minutes ?? 0), 0),
      pauseMinutes: closed.filter((entry) => entry.kind === "pause").reduce((sum, entry) => sum + (entry.minutes ?? 0), 0),
      interruptionMinutes: closed.filter((entry) => entry.kind === "interruption").reduce((sum, entry) => sum + (entry.minutes ?? 0), 0),
    };
  }), [driverTimeEntries, masterDrivers, payrollMonth, vacationRequests]);
  const payrollTotals = {
    workMinutes: payrollSummaries.reduce((sum, row) => sum + row.workMinutes, 0),
    pauseMinutes: payrollSummaries.reduce((sum, row) => sum + row.pauseMinutes, 0),
    openVacationRequests: payrollSummaries.reduce((sum, row) => sum + row.vacationRequests.filter((request) => request.status === "requested").length, 0),
  };
  const isSystemTaskTemplateSelected = Boolean(selectedTaskTemplate && (selectedTaskTemplate.isSystemTemplate || selectedTaskTemplate.templateOwnerType === "system" || !selectedTaskTemplate.organizationId));
  const isSystemJobTypeSelected = Boolean(selectedJobType && (selectedJobType.isSystemTemplate || selectedJobType.templateOwnerType === "system" || !selectedJobType.organizationId));
  const canEditSelectedTaskTemplate = canManageOwnTemplates && (currentRole === "support_admin" || !isSystemTaskTemplateSelected);
  const canEditSelectedJobType = canManageOwnTemplates && (currentRole === "support_admin" || !isSystemJobTypeSelected);
  const taskTemplateOwnerLabel = (taskTemplate?: TaskTemplate) => {
    if (!taskTemplate) return t("masterData.templateOwnerUnknown");
    if (taskTemplate.isSystemTemplate || taskTemplate.templateOwnerType === "system" || !taskTemplate.organizationId) {
      return t("masterData.templateOwnerSystem");
    }
    const owner = organizations.find((organization) => organization.id === taskTemplate.organizationId);
    return owner?.name ?? t("masterData.templateOwnerUnknown");
  };
  const dispatchCustomerOptions = useMemo(() => {
    const seen = new Set<string>();
    return jobs.flatMap((job) => {
      const id = job.farmerOrganizationId ?? job.customer;
      if (!id || seen.has(id)) return [];
      seen.add(id);
      return [{ id, name: job.customer }];
    });
  }, [jobs]);
  const selectedDispatchCustomerSet = useMemo(() => new Set(selectedDispatchCustomerIds), [selectedDispatchCustomerIds]);
  const filteredDispatchSubtasks = useMemo(() => (
    selectedDispatchCustomerIds.length === 0
      ? subtasks
      : subtasks.filter((subtask) => {
        const job = jobs.find((item) => item.id === subtask.jobId);
        const customerId = job?.farmerOrganizationId ?? job?.customer;
        return Boolean(customerId && selectedDispatchCustomerSet.has(customerId));
      })
  ), [jobs, selectedDispatchCustomerIds.length, selectedDispatchCustomerSet, subtasks]);
  const getDriverByAssignmentId = (id: string) => allDrivers.find((driver) => driver.id === id || driver.profileId === id);
  const getDriverLabel = (id: string) => getDriverByAssignmentId(id)?.name ?? t("driver.unknownDriver");
  const getDriverTooltip = (id: string) => {
    const driver = getDriverByAssignmentId(id);
    return [driver?.name, driver?.mobile, driver?.vehicle].filter(Boolean).join(" · ") || t("driver.unknownDriver");
  };
  const getVehicleByName = (name?: string) => allVehicles.find((vehicle) => vehicle.name === name);
  const getDisplayVehiclesForSubtask = (subtask: Subtask) => {
    const explicitVehicles = (subtask.activeVehicleIds ?? [])
      .map((id) => allVehicles.find((vehicle) => vehicle.id === id))
      .filter((vehicle): vehicle is Vehicle => Boolean(vehicle));
    if (explicitVehicles.length > 0) return explicitVehicles;
    return subtask.activeDriverIds
      .map((driverId) => getVehicleByName(getDriverByAssignmentId(driverId)?.vehicle))
      .filter((vehicle): vehicle is Vehicle => Boolean(vehicle));
  };
  const [driverForm, setDriverForm] = useState({
    name: "",
    organizationId: "",
    vehicle: "",
    jobVisibility: "assigned_only" as Driver["jobVisibility"],
    email: "",
    accessPassword: "",
    mobile: "",
    licenseClasses: "",
    maxDailyHours: 8,
    annualVacationDays: 30,
    vacationUsedDays: 0,
    employeeType: "field" as PersonnelEmployeeType,
    appRole: "driver" as UserRole,
    allowedViews: ["driver"] as ViewKey[],
    appPermissions: {
      canEditFields: false,
      canCreateJobs: false,
      canEditDrivers: false,
      canAssignDrivers: false,
    } as Record<PersonnelAppPermissionKey, boolean>,
    resourceType: "",
    operationType: "",
  });
  const [vehicleForm, setVehicleForm] = useState({
    name: "",
    type: "",
    licensePlate: "",
    manufacturer: "",
    model: "",
    constructionYear: "",
    operatingHours: "",
    defaultDriverId: "",
    resourceType: "",
    operationType: "",
    status: "frei" as Vehicle["status"],
  });
  const [implementForm, setImplementForm] = useState({
    name: "",
    type: "",
    manufacturer: "",
    workingWidth: "",
    resourceType: "",
    operationType: "",
    status: "frei" as Implement["status"],
  });
  const [jobTypeForm, setJobTypeForm] = useState({
    name: "",
    description: "",
    defaultCrews: 1,
    defaultEstimatedHours: 6,
    resourceSummary: "",
  });
  const [taskTemplateForm, setTaskTemplateForm] = useState({
    name: "",
    workSteps: "",
    timePerHa: 0.3,
    mode: "Einzelmodus" as WorkMode,
    maxVehicles: 1,
    progressMetric: "Fläche" as ProgressMetric,
    requiredDrivers: 1,
    requiredVehicles: 1,
    requiredImplements: 0,
    resourceHint: "",
    unit: "",
    billingUnit: "ha" as BillingUnit,
    standardPrice: "",
    standardPriceCurrency: "SEK",
    standardPriceValidFrom: "",
    standardPriceValidTo: "",
    mapStyleLabel: "",
    mapStyleColor: "#7fcf6b",
    mapStylePattern: "none" as FieldMapPattern,
  });
  const ownOrganization = authProfile?.organizationId ? organizations.find((organization) => organization.id === authProfile.organizationId) : undefined;
  const ownOrganizationRelationships = useMemo(() => (
    authProfile?.organizationId
      ? organizationRelationships.filter((relationship) => (
          relationship.notes !== "FM_DELETED_INVITATION"
          && (
            relationship.farmerOrganizationId === authProfile.organizationId
            || relationship.contractorOrganizationId === authProfile.organizationId
          )
        ))
      : []
  ), [authProfile?.organizationId, organizationRelationships]);
  const activeRelationshipPartnerIds = useMemo(() => new Set(ownOrganizationRelationships
    .filter((relationship) => relationship.status === "active")
    .map((relationship) => relationship.farmerOrganizationId === authProfile?.organizationId ? relationship.contractorOrganizationId : relationship.farmerOrganizationId)
  ), [authProfile?.organizationId, ownOrganizationRelationships]);
  const legacyJobPartnerIds = useMemo(() => {
    const ids = new Set<string>();
    if (!authProfile?.organizationId) return ids;
    jobs.forEach((job) => {
      if (job.farmerOrganizationId === authProfile.organizationId && job.contractorOrganizationId) ids.add(job.contractorOrganizationId);
      if (job.contractorOrganizationId === authProfile.organizationId && job.farmerOrganizationId) ids.add(job.farmerOrganizationId);
    });
    return ids;
  }, [authProfile?.organizationId, jobs]);
  const collaborationOrganizationIds = useMemo(() => (
    new Set([...activeRelationshipPartnerIds, ...legacyJobPartnerIds])
  ), [activeRelationshipPartnerIds, legacyJobPartnerIds]);
  const invitedRelationships = useMemo(() => ownOrganizationRelationships.filter((relationship) => relationship.status === "invited"), [ownOrganizationRelationships]);
  const activeRelationships = useMemo(() => ownOrganizationRelationships.filter((relationship) => relationship.status === "active"), [ownOrganizationRelationships]);
  const endedRelationships = useMemo(() => ownOrganizationRelationships.filter((relationship) => relationship.status === "ended" || relationship.status === "paused" || relationship.status === "blocked"), [ownOrganizationRelationships]);
  const ownExternalContacts = useMemo(() => (
    authProfile?.organizationId
      ? externalContacts.filter((contact) => contact.organizationId === authProfile.organizationId && contact.status !== "archived")
      : []
  ), [authProfile?.organizationId, externalContacts]);
  const openExternalInvites = useMemo(() => (
    ownExternalContacts.filter((contact) => contact.status === "invited" && !contact.linkedOrganizationId)
  ), [ownExternalContacts]);
  const activeOrganizations = useMemo(() => organizations.filter((organization) => !organization.archivedAt), [organizations]);
  const archivedOrganizations = useMemo(() => organizations.filter((organization) => Boolean(organization.archivedAt)), [organizations]);
  const visibleOrganizations = showArchivedOrganizations ? archivedOrganizations : activeOrganizations;
  const farmerOrganizations = useMemo(() => visibleOrganizations.filter((organization) => organization.kind === "farmer"), [visibleOrganizations]);
  const contractorOrganizations = useMemo(() => visibleOrganizations.filter((organization) => organization.kind === "contractor"), [visibleOrganizations]);
  const partnerOrganizations = useMemo(() => visibleOrganizations.filter((organization) => !["farmer", "contractor"].includes(organization.kind)), [visibleOrganizations]);
  const activeContactOrganizations = useMemo(() => activeOrganizations.filter((organization) => organization.id !== authProfile?.organizationId), [activeOrganizations, authProfile?.organizationId]);
  const archivedContactOrganizations = useMemo(() => archivedOrganizations.filter((organization) => organization.id !== authProfile?.organizationId), [archivedOrganizations, authProfile?.organizationId]);
  const contactOrganizations = showArchivedOrganizations ? archivedContactOrganizations : activeContactOrganizations;
  const collaborationOrganizations = useMemo(() => contactOrganizations.filter((organization) => collaborationOrganizationIds.has(organization.id)), [collaborationOrganizationIds, contactOrganizations]);
  const directoryOrganizations = useMemo(() => {
    if (organizationDirectoryMode === "company") return ownOrganization ? [ownOrganization] : [];
    if (organizationDirectoryMode === "collaboration") return collaborationOrganizations;
    return contactOrganizations;
  }, [collaborationOrganizations, contactOrganizations, organizationDirectoryMode, ownOrganization, showArchivedOrganizations]);
  const activeOrganizationDirectoryCount = useMemo(() => {
    if (organizationDirectoryMode === "company") return ownOrganization && !ownOrganization.archivedAt ? 1 : 0;
    if (organizationDirectoryMode === "collaboration") return activeRelationships.length;
    return activeContactOrganizations.length;
  }, [activeContactOrganizations.length, activeRelationships.length, organizationDirectoryMode, ownOrganization]);
  const archivedOrganizationDirectoryCount = useMemo(() => {
    if (organizationDirectoryMode === "company") return ownOrganization?.archivedAt ? 1 : 0;
    if (organizationDirectoryMode === "collaboration") return endedRelationships.length;
    return archivedContactOrganizations.length;
  }, [archivedContactOrganizations.length, endedRelationships.length, organizationDirectoryMode, ownOrganization]);
  const activeFarmerOrganizations = useMemo(() => activeOrganizations.filter((organization) => organization.kind === "farmer"), [activeOrganizations]);
  const activeContractorOrganizations = useMemo(() => activeOrganizations.filter((organization) => organization.kind === "contractor"), [activeOrganizations]);
  const archivedFarmerOrganizations = useMemo(() => archivedOrganizations.filter((organization) => organization.kind === "farmer"), [archivedOrganizations]);
  const archivedContractorOrganizations = useMemo(() => archivedOrganizations.filter((organization) => organization.kind === "contractor"), [archivedOrganizations]);
  const openOrganizationDirectory = (mode: OrganizationDirectoryMode) => {
    setOrganizationDirectoryMode(mode);
    setActiveSection("organizations");
  };
  const openMasterResourceGroup = (group: MasterResourceGroup) => {
    setActiveMasterGroup(group);
    setActiveSection("masterData");
  };
  const masterDataOverviewGroups = [
    {
      id: "companies",
      title: t("masterDataOverview.groups.companies"),
      items: [
        {
          id: "companyData",
          icon: <Factory size={18} />,
          title: t("masterDataOverview.companyData.title"),
          description: t("masterDataOverview.companyData.description"),
          activeCount: ownOrganization && !ownOrganization.archivedAt ? 1 : 0,
          archivedCount: ownOrganization?.archivedAt ? 1 : 0,
          onClick: () => openOrganizationDirectory("company"),
        },
        {
          id: "customers",
          icon: <Users size={18} />,
          title: t("masterDataOverview.contacts.title"),
          description: t("masterDataOverview.contacts.description"),
          activeCount: activeContactOrganizations.length,
          archivedCount: archivedContactOrganizations.length,
          onClick: () => openOrganizationDirectory("contacts"),
        },
        {
          id: "collaboration",
          icon: <RadioTower size={18} />,
          title: t("masterDataOverview.collaboration.title"),
          description: t("masterDataOverview.collaboration.description"),
          activeCount: activeRelationships.length,
          archivedCount: invitedRelationships.length + openExternalInvites.length,
          secondaryCountLabel: t("collaboration.openRequestsCount", { count: invitedRelationships.length + openExternalInvites.length }),
          onClick: () => openOrganizationDirectory("collaboration"),
        },
      ],
    },
    {
      id: "resources",
      title: t("masterDataOverview.groups.resources"),
      items: [
        {
          id: "personnel",
          icon: <User size={18} />,
          title: t("masterDataOverview.personnel.title"),
          description: t("masterDataOverview.personnel.description"),
          activeCount: drivers.length,
          archivedCount: archivedDrivers.length,
          onClick: () => openMasterResourceGroup("personnel"),
        },
        {
          id: "machines",
          icon: <Tractor size={18} />,
          title: t("masterDataOverview.machines.title"),
          description: t("masterDataOverview.machines.description"),
          activeCount: vehicles.length,
          archivedCount: archivedVehicles.length,
          onClick: () => openMasterResourceGroup("vehicles"),
        },
        {
          id: "implements",
          icon: <Wrench size={18} />,
          title: t("masterDataOverview.implements.title"),
          description: t("masterDataOverview.implements.description"),
          activeCount: implementsList.length,
          archivedCount: archivedImplements.length,
          onClick: () => openMasterResourceGroup("implements"),
        },
      ],
    },
    {
      id: "inputs",
      title: t("masterDataOverview.groups.inputs"),
      items: [
        {
          id: "products",
          icon: <Package size={18} />,
          title: t("masterDataOverview.products.title"),
          description: t("masterDataOverview.products.description"),
          activeCount: activeProducts.length,
          archivedCount: archivedProducts.length,
          onClick: () => setActiveSection("products"),
        },
      ],
    },
    {
      id: "planning",
      title: t("masterDataOverview.groups.planning"),
      items: [
        {
          id: "tasks",
          icon: <ClipboardList size={18} />,
          title: t("masterDataOverview.tasks.title"),
          description: t("masterDataOverview.tasks.description"),
          activeCount: activeTaskTemplates.length,
          archivedCount: archivedTaskTemplates.length,
          onClick: () => setActiveSection("taskTemplates"),
        },
        {
          id: "workChains",
          icon: <Boxes size={18} />,
          title: t("masterDataOverview.workChains.title"),
          description: t("masterDataOverview.workChains.description"),
          activeCount: activeJobTypes.length,
          archivedCount: archivedJobTypes.length,
          onClick: () => setActiveSection("jobTypes"),
        },
      ],
    },
  ];
  const defaultResourceOrganizationId = resourceOrganizationId ?? authProfile?.organizationId ?? activeContractorOrganizations[0]?.id ?? activeFarmerOrganizations[0]?.id ?? "";
  const isResourceOrganizationLocked = currentRole === "contractor_admin" || currentRole === "farmer_admin";
  const fixedResourceOrganization = activeOrganizations.find((organization) => organization.id === driverForm.organizationId)
    ?? activeOrganizations.find((organization) => organization.id === defaultResourceOrganizationId);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(activeOrganizations[0]?.id ?? "");
  const selectedOrganization = organizations.find((organization) => organization.id === selectedOrganizationId) ?? visibleOrganizations[0];
  const canManageContactOrganizations = organizationDirectoryMode === "contacts" && (currentRole === "farmer_admin" || currentRole === "contractor_admin" || currentRole === "support_admin");
  const canEditOrganizationRecord = (organization?: Organization) => (
    currentRole === "support_admin"
    || Boolean(organization?.id && authProfile?.organizationId && organization.id === authProfile.organizationId)
    || Boolean(canManageContactOrganizations && organization?.id && organization.id !== authProfile?.organizationId)
  );
  const canEditSelectedOrganization = creatingOrganization ? canCreateOrganizations : canEditOrganizationRecord(selectedOrganization);
  const [organizationForm, setOrganizationForm] = useState({
    name: "",
    kind: "farmer" as Organization["kind"],
    organizationNumber: "",
    address: "",
    street: "",
    country: "",
    postalCode: "",
    city: "",
    phone: "",
    mobile: "",
    email: "",
    website: "",
    vatId: "",
    logoUrl: "",
    defaultLanguage: "",
    billingDetails: "",
    customerNumber: "",
    supplierCategory: "",
    notes: "",
    customerConditionRows: [] as CustomerConditionRow[],
    contacts: [] as NonNullable<Organization["contacts"]>,
  });

  function normalizedDriverJobVisibility(driver: Driver): Driver["jobVisibility"] {
    const organization = organizations.find((item) => item.id === driver.organizationId);
    if (organization?.kind === "farmer" && driver.jobVisibility === "contractor_all") return "organization_internal";
    return driver.jobVisibility ?? "assigned_only";
  }

  function driverToForm(driver: Driver) {
    const standardVehicleExists = vehicles.some((vehicle) => vehicle.name === driver.vehicle && vehicle.status !== "wartung");
    return {
      name: driver.name,
      organizationId: driver.organizationId ?? defaultResourceOrganizationId,
      vehicle: standardVehicleExists ? driver.vehicle : "",
      jobVisibility: normalizedDriverJobVisibility(driver),
      email: driver.email ?? "",
      accessPassword: driver.accessPassword ?? "",
      mobile: driver.mobile ?? "",
      licenseClasses: driver.licenseClasses?.join(", ") ?? "",
      maxDailyHours: driver.maxDailyHours ?? 8,
      annualVacationDays: driver.annualVacationDays ?? 30,
      vacationUsedDays: driver.vacationUsedDays ?? 0,
      employeeType: driver.employeeType ?? "field",
      appRole: driver.appRole ?? "driver",
      allowedViews: driver.allowedViews?.length ? driver.allowedViews : (["driver"] as ViewKey[]),
      appPermissions: {
        canEditFields: Boolean(driver.appPermissions?.canEditFields),
        canCreateJobs: Boolean(driver.appPermissions?.canCreateJobs),
        canEditDrivers: Boolean(driver.appPermissions?.canEditDrivers),
        canAssignDrivers: Boolean(driver.appPermissions?.canAssignDrivers),
      },
      resourceType: driver.resourceType ?? t("masterData.personnel"),
      operationType: driver.operationType ?? "",
    };
  }

  function personnelDraftKey(resourceId: string) {
    return `farm-manager.personnel-draft.${authProfile?.organizationId ?? "shared"}.${resourceId}`;
  }

  function readPersonnelDraft<T>(resourceId: string, fallback: T): T {
    try {
      const stored = window.localStorage.getItem(personnelDraftKey(resourceId));
      if (!stored) return fallback;
      return { ...fallback, ...JSON.parse(stored) } as T;
    } catch {
      return fallback;
    }
  }

  function clearPersonnelDraft(resourceId: string) {
    window.localStorage.removeItem(personnelDraftKey(resourceId));
  }

  useEffect(() => {
    if (!isResourceModalOpen || activeMasterGroup !== "personnel" || showArchivedMasterData) return;
    const draftId = creatingResourceGroup === "personnel" ? "new" : selectedDriver?.id;
    if (!draftId) return;
    window.localStorage.setItem(personnelDraftKey(draftId), JSON.stringify(driverForm));
  }, [activeMasterGroup, authProfile?.organizationId, creatingResourceGroup, driverForm, isResourceModalOpen, selectedDriver?.id, showArchivedMasterData]);

  function vehicleToForm(vehicle: Vehicle) {
    return {
      name: vehicle.name,
      type: vehicle.type,
      licensePlate: vehicle.licensePlate ?? "",
      manufacturer: vehicle.manufacturer ?? "",
      model: vehicle.model ?? "",
      constructionYear: vehicle.constructionYear ? String(vehicle.constructionYear) : "",
      operatingHours: vehicle.operatingHours ? String(vehicle.operatingHours) : "",
      defaultDriverId: vehicle.defaultDriverId ?? "",
      resourceType: vehicle.resourceType ?? vehicle.type,
      operationType: vehicle.operationType ?? "",
      status: vehicle.status,
    };
  }

  function implementToForm(implement: Implement) {
    return {
      name: implement.name,
      type: implement.type,
      manufacturer: implement.manufacturer ?? "",
      workingWidth: implement.workingWidth ? String(implement.workingWidth) : "",
      resourceType: implement.resourceType ?? implement.type,
      operationType: implement.operationType ?? "",
      status: implement.status,
    };
  }

  useEffect(() => {
    return subscribeVacationRequests(() => setVacationRequests(readVacationRequests()));
  }, []);

  useEffect(() => {
    return subscribeDriverTimeEntries(() => setDriverTimeEntries(readDriverTimeEntries()));
  }, []);

  useEffect(() => {
    void loadVacationRequests().then(setVacationRequests);
  }, []);

  useEffect(() => {
    void loadDriverTimeEntries().then(setDriverTimeEntries);
  }, []);

  useEffect(() => {
    const refreshExternalPersonnelData = () => {
      void loadVacationRequests().then(setVacationRequests);
      void loadDriverTimeEntries().then(setDriverTimeEntries);
    };
    const interval = window.setInterval(refreshExternalPersonnelData, 30000);
    window.addEventListener("focus", refreshExternalPersonnelData);
    document.addEventListener("visibilitychange", refreshExternalPersonnelData);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshExternalPersonnelData);
      document.removeEventListener("visibilitychange", refreshExternalPersonnelData);
    };
  }, []);

  useEffect(() => {
    if (!selectedDriver) return;
    setDriverForm(driverToForm(selectedDriver));
  }, [
    selectedDriver?.id,
    selectedDriver?.name,
    selectedDriver?.organizationId,
    selectedDriver?.vehicle,
    selectedDriver?.jobVisibility,
    selectedDriver?.email,
    selectedDriver?.accessPassword,
    selectedDriver?.mobile,
    selectedDriver?.licenseClasses,
    selectedDriver?.maxDailyHours,
    selectedDriver?.annualVacationDays,
    selectedDriver?.vacationUsedDays,
    selectedDriver?.resourceType,
    selectedDriver?.operationType,
    t,
    vehicles,
  ]);

  useEffect(() => {
    if (!selectedVehicle) return;
    setVehicleForm(vehicleToForm(selectedVehicle));
  }, [selectedVehicle?.id]);

  useEffect(() => {
    if (!selectedImplement) return;
    setImplementForm(implementToForm(selectedImplement));
  }, [selectedImplement?.id]);

  useEffect(() => {
    if (!selectedJobType) return;
    setSelectedJobTypeId(selectedJobType.id);
    setJobTypeForm({
      name: selectedJobType.name,
      description: selectedJobType.description,
      defaultCrews: selectedJobType.defaultCrews,
      defaultEstimatedHours: selectedJobType.defaultEstimatedHours,
      resourceSummary: selectedJobType.resourceSummary,
    });
  }, [selectedJobType?.id]);

  useEffect(() => {
    if (!selectedTaskTemplate) return;
    const billing = billingConditionFromTaskTemplate(selectedTaskTemplate);
    setSelectedTaskTemplateId(selectedTaskTemplate.id);
    setTaskTemplateForm({
      name: selectedTaskTemplate.name,
      workSteps: selectedTaskTemplate.workSteps.join(", "),
      timePerHa: selectedTaskTemplate.timePerHa,
      mode: selectedTaskTemplate.mode,
      maxVehicles: selectedTaskTemplate.maxVehicles,
      progressMetric: selectedTaskTemplate.progressMetric,
      requiredDrivers: selectedTaskTemplate.requiredDrivers ?? 1,
      requiredVehicles: selectedTaskTemplate.requiredVehicles ?? 1,
      requiredImplements: selectedTaskTemplate.requiredImplements ?? 0,
      resourceHint: selectedTaskTemplate.resourceHint ?? "",
      unit: selectedTaskTemplate.unit ?? "",
      billingUnit: billing.billingUnit,
      standardPrice: billing.price?.toString() ?? "",
      standardPriceCurrency: billing.currency ?? "SEK",
      standardPriceValidFrom: billing.validFrom ?? "",
      standardPriceValidTo: billing.validTo ?? "",
      mapStyleLabel: selectedTaskTemplate.mapStyle?.label ?? "",
      mapStyleColor: selectedTaskTemplate.mapStyle?.color ?? "#7fcf6b",
      mapStylePattern: selectedTaskTemplate.mapStyle?.pattern ?? "none",
    });
  }, [selectedTaskTemplate?.id]);

  useEffect(() => {
    if (!selectedOrganization) return;
    setSelectedOrganizationId(selectedOrganization.id);
    setOrganizationForm({
      name: selectedOrganization.name,
      kind: selectedOrganization.kind,
      organizationNumber: selectedOrganization.organizationNumber ?? "",
      address: selectedOrganization.address ?? "",
      street: selectedOrganization.street ?? "",
      country: selectedOrganization.country ?? "",
      postalCode: selectedOrganization.postalCode ?? "",
      city: selectedOrganization.city ?? "",
      phone: selectedOrganization.phone ?? "",
      mobile: selectedOrganization.mobile ?? "",
      email: selectedOrganization.email ?? "",
      website: selectedOrganization.website ?? "",
      vatId: selectedOrganization.vatId ?? "",
      logoUrl: selectedOrganization.logoUrl ?? "",
      defaultLanguage: selectedOrganization.defaultLanguage ?? "",
      billingDetails: selectedOrganization.billingDetails ?? "",
      customerNumber: selectedOrganization.customerNumber ?? "",
      supplierCategory: selectedOrganization.supplierCategory ?? "",
      notes: stripMarkerBlock(selectedOrganization.notes, customerConditionsMarker),
      customerConditionRows: conditionsToRows(customerConditionsFromOrganization(selectedOrganization)),
      contacts: selectedOrganization.contacts ?? [],
    });
  }, [selectedOrganization?.id]);

  useEffect(() => {
    if (visibleOrganizations.length > 0 && !visibleOrganizations.some((organization) => organization.id === selectedOrganizationId)) {
      setSelectedOrganizationId(visibleOrganizations[0].id);
    }
  }, [selectedOrganizationId, visibleOrganizations]);

  useEffect(() => {
    setAssignDriverId((current) => current || drivers[0]?.id || "");
    setAssignVehicleId((current) => current || vehicles[0]?.id || "");
    setAssignImplementId((current) => current || implementsList[0]?.id || "");
  }, [drivers, implementsList, vehicles]);

  useEffect(() => {
    window.localStorage.setItem("farm-manager.standardVehiclePlanningMode", standardVehicleMode);
  }, [standardVehicleMode]);

  useEffect(() => {
    window.localStorage.setItem("farm-manager.mapProviderPreference", mapProviderPreference);
  }, [mapProviderPreference]);

  useEffect(() => {
    window.localStorage.setItem("farm-manager.dispatchGroupingLevel", dispatchGroupingLevel);
  }, [dispatchGroupingLevel]);

  useEffect(() => {
    window.localStorage.setItem(employeeTimeEditWindowStorageKey, String(employeeTimeEditWindowDays));
  }, [employeeTimeEditWindowDays]);

  useEffect(() => {
    writeJsonArray(productInventoryStorageKey, products);
  }, [products]);

  useEffect(() => {
    writeJsonArray(productMovementsStorageKey, productMovements);
  }, [productMovements]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    let mounted = true;
    async function loadRemoteProductInventory() {
      const [{ data: productRows, error: productError }, { data: movementRows, error: movementError }] = await Promise.all([
        client.from("product_inventory").select("*"),
        client.from("product_movements").select("*"),
      ]);
      if (!mounted) return;
      if (productError || movementError) {
        console.warn("Produktdaten konnten nicht aus Supabase geladen werden.", productError ?? movementError);
        return;
      }
      const remoteProducts = ((productRows ?? []) as ProductInventoryRow[]).map(productFromRow);
      const remoteMovements = ((movementRows ?? []) as ProductMovementRow[]).map(productMovementFromRow);
      setProducts((current) => {
        const next = mergeById(current, remoteProducts);
        writeJsonArray(productInventoryStorageKey, next);
        return next;
      });
      setProductMovements((current) => {
        const next = mergeById(current, remoteMovements);
        writeJsonArray(productMovementsStorageKey, next);
        return next;
      });
    }
    void loadRemoteProductInventory();
    return () => {
      mounted = false;
    };
  }, [authProfile?.organizationId]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || products.length === 0) return;
    const client = supabase;
    const handle = window.setTimeout(() => {
      void client.from("product_inventory").upsert(products.map(productToRow), { onConflict: "id" }).then(({ error }) => {
        if (error) console.warn("Produktdaten konnten nicht in Supabase gespeichert werden.", error);
      });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [products]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || productMovements.length === 0) return;
    const client = supabase;
    const handle = window.setTimeout(() => {
      void client.from("product_movements").upsert(productMovements.map(productMovementToRow), { onConflict: "id" }).then(({ error }) => {
        if (error) console.warn("Bestandsbuchungen konnten nicht in Supabase gespeichert werden.", error);
      });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [productMovements]);

  useEffect(() => {
    if (!selectedProduct) {
      setSelectedProductId("");
      setProductForm({
        name: "",
        category: "",
        unit: "Stk",
        supplierName: "",
        articleNumber: "",
        photoUrl: "",
        photoName: "",
        currency: "SEK",
        purchasePrice: "",
        salesPrice: "",
        purchasePriceValidFrom: "",
        purchasePriceValidTo: "",
        salesPriceValidFrom: "",
        salesPriceValidTo: "",
        openingStock: "0",
        minimumStock: "",
        packageUnit: "",
        quantityPerPackage: "",
        notes: "",
      });
      return;
    }
    if (selectedProductId !== selectedProduct.id) setSelectedProductId(selectedProduct.id);
    setProductForm({
      name: selectedProduct.name,
      category: selectedProduct.category,
      unit: selectedProduct.unit,
      supplierName: selectedProduct.supplierName ?? "",
      articleNumber: selectedProduct.articleNumber ?? "",
      photoUrl: selectedProduct.photoUrl ?? "",
      photoName: selectedProduct.photoName ?? "",
      currency: selectedProduct.currency ?? "SEK",
      purchasePrice: selectedProduct.purchasePrice?.toString() ?? "",
      salesPrice: selectedProduct.salesPrice?.toString() ?? "",
      purchasePriceValidFrom: selectedProduct.purchasePriceValidFrom ?? "",
      purchasePriceValidTo: selectedProduct.purchasePriceValidTo ?? "",
      salesPriceValidFrom: selectedProduct.salesPriceValidFrom ?? "",
      salesPriceValidTo: selectedProduct.salesPriceValidTo ?? "",
      openingStock: selectedProduct.openingStock.toString(),
      minimumStock: selectedProduct.minimumStock?.toString() ?? "",
      packageUnit: selectedProduct.packageUnit ?? "",
      quantityPerPackage: selectedProduct.quantityPerPackage?.toString() ?? "",
      notes: selectedProduct.notes ?? "",
    });
    setMovementForm((current) => ({
      ...current,
      packageQuantity: current.packageQuantity || selectedProduct.quantityPerPackage?.toString() || "",
    }));
  }, [isCreatingProduct, selectedProduct?.id, selectedProductId]);

  useEffect(() => {
    if (variant === "dispatch" && activeSection !== "overview" && !isResourceModalOpen) setActiveSection("overview");
    if (variant === "masterData" && activeSection === "overview") setActiveSection("masterOverview");
  }, [activeSection, isResourceModalOpen, variant]);

  useEffect(() => {
    if (variant === "masterData" && !masterDataFocus) {
      setActiveSection("masterOverview");
      return;
    }
    if (!masterDataFocus) return;
    if ("section" in masterDataFocus) {
      setActiveSection(masterDataFocus.section);
      return;
    }
    setActiveMasterGroup(masterDataFocus.group);
    setActiveSection("masterData");
    if (masterDataFocus.group === "personnel") setSelectedDriverId(masterDataFocus.id);
    if (masterDataFocus.group === "vehicles") setSelectedVehicleId(masterDataFocus.id);
    if (masterDataFocus.group === "implements") setSelectedImplementId(masterDataFocus.id);
  }, [masterDataFocus]);

  useEffect(() => {
    if (creatingResourceGroup) return;
    if (activeMasterGroup === "personnel" && masterDrivers.length > 0 && !masterDrivers.some((driver) => driver.id === selectedDriverId)) {
      setSelectedDriverId(masterDrivers[0].id);
    }
    if (activeMasterGroup === "vehicles" && masterVehicles.length > 0 && !masterVehicles.some((vehicle) => vehicle.id === selectedVehicleId)) {
      setSelectedVehicleId(masterVehicles[0].id);
    }
    if (activeMasterGroup === "implements" && masterImplements.length > 0 && !masterImplements.some((implement) => implement.id === selectedImplementId)) {
      setSelectedImplementId(masterImplements[0].id);
    }
  }, [activeMasterGroup, creatingResourceGroup, masterDrivers, masterImplements, masterVehicles, selectedDriverId, selectedImplementId, selectedVehicleId]);

  function closeResourceModal() {
    setCreatingResourceGroup(null);
    setIsResourceModalOpen(false);
    if (variant === "dispatch") setActiveSection("overview");
  }

  function appendResourceHistory(entry: Omit<ResourceHistoryEntry, "id" | "recordedAt" | "actor"> & { actor?: string; recordedAt?: string }) {
    const nextEntry: ResourceHistoryEntry = {
      id: createLocalId("local"),
      recordedAt: entry.recordedAt ?? new Date().toISOString(),
      actor: entry.actor ?? authProfile?.fullName ?? t("app.user"),
      ...entry,
    };
    const existing = readJsonArray<ResourceHistoryEntry>(resourceHistoryStorageKey);
    window.localStorage.setItem(resourceHistoryStorageKey, JSON.stringify([nextEntry, ...existing].slice(0, 500)));
    setResourceHistoryVersion((current) => current + 1);
  }

  function handleVacationDecision(request: VacationRequest, status: "approved" | "rejected") {
    const reason = window.prompt(t(status === "approved" ? "vacationApproval.approveReasonPrompt" : "vacationApproval.rejectReasonPrompt"), "");
    if (reason === null) return;
    void decideVacationRequest(request.id, status, authProfile?.fullName ?? t("vacationApproval.disposition"), reason.trim()).then((next) => {
      setVacationRequests(next);
      setResourceHistoryVersion((current) => current + 1);
    });
  }

  function numberFromForm(value: string) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function optionalNumberFromForm(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = numberFromForm(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function formatQuantity(value: number) {
    return new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(value);
  }

  function formatMoneyValue(value: number, currency = "SEK") {
    try {
      return new Intl.NumberFormat(i18n.language, { currency, style: "currency" }).format(value);
    } catch {
      return `${new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;
    }
  }

  function stripMarkerBlock(value: string | undefined, marker: string) {
    return (value ?? "").split("\n").filter((line) => !line.startsWith(marker)).join("\n").trim();
  }

  function parseMarkerJson<T>(value: string | undefined, marker: string, fallback: T): T {
    const line = (value ?? "").split("\n").find((item) => item.startsWith(marker));
    if (!line) return fallback;
    try {
      return JSON.parse(line.slice(marker.length)) as T;
    } catch {
      return fallback;
    }
  }

  function withMarkerJson(value: string | undefined, marker: string, data: unknown) {
    const base = stripMarkerBlock(value, marker);
    return [base, `${marker}${JSON.stringify(data)}`].filter(Boolean).join("\n");
  }

  function billingConditionFromTaskTemplate(taskTemplate?: TaskTemplate): TaskBillingCondition {
    if (!taskTemplate) return { billingUnit: "ha", currency: "SEK" };
    return {
      ...parseMarkerJson<TaskBillingCondition>(taskTemplate.resourceHint, taskBillingMarker, { billingUnit: taskTemplate.billingUnit ?? "ha" }),
      billingUnit: taskTemplate.billingUnit ?? parseMarkerJson<TaskBillingCondition>(taskTemplate.resourceHint, taskBillingMarker, { billingUnit: "ha" }).billingUnit ?? "ha",
      price: taskTemplate.standardPrice ?? parseMarkerJson<TaskBillingCondition>(taskTemplate.resourceHint, taskBillingMarker, { billingUnit: "ha" }).price,
      currency: taskTemplate.standardPriceCurrency ?? parseMarkerJson<TaskBillingCondition>(taskTemplate.resourceHint, taskBillingMarker, { billingUnit: "ha", currency: "SEK" }).currency ?? "SEK",
      validFrom: taskTemplate.standardPriceValidFrom ?? parseMarkerJson<TaskBillingCondition>(taskTemplate.resourceHint, taskBillingMarker, { billingUnit: "ha" }).validFrom,
      validTo: taskTemplate.standardPriceValidTo ?? parseMarkerJson<TaskBillingCondition>(taskTemplate.resourceHint, taskBillingMarker, { billingUnit: "ha" }).validTo,
    };
  }

  function customerConditionsFromOrganization(organization?: Organization) {
    return parseMarkerJson<Record<string, TaskBillingCondition>>(organization?.notes, customerConditionsMarker, {});
  }

  function conditionsToRows(conditions: Record<string, TaskBillingCondition>) {
    return Object.entries(conditions).map(([taskName, condition], index) => ({
      id: `condition-${index}-${taskName}`,
      taskName,
      billingUnit: condition.billingUnit || "ha",
      price: condition.price,
      currency: condition.currency || "SEK",
      validFrom: condition.validFrom,
      validTo: condition.validTo,
    }));
  }

  function rowsToConditions(rows: CustomerConditionRow[]) {
    return rows.reduce<Record<string, TaskBillingCondition>>((result, row) => {
      const taskName = row.taskName.trim();
      if (!taskName) return result;
      result[taskName] = {
        billingUnit: row.billingUnit || "ha",
        price: row.price,
        currency: row.currency || "SEK",
        validFrom: row.validFrom || undefined,
        validTo: row.validTo || undefined,
      };
      return result;
    }, {});
  }

  function organizationPayloadFromForm() {
    const { customerConditionRows: _customerConditionRows, notes, ...payload } = organizationForm;
    return {
      ...payload,
      notes: withMarkerJson(notes, customerConditionsMarker, rowsToConditions(organizationForm.customerConditionRows)),
    };
  }

  function addCustomerConditionRow() {
    const firstTask = activeTaskTemplates[0] ?? taskTemplates[0];
    const taskBilling = billingConditionFromTaskTemplate(firstTask);
    setOrganizationForm((current) => ({
      ...current,
      customerConditionRows: [
        ...current.customerConditionRows,
        {
          id: `condition-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          taskName: firstTask?.name ?? "",
          billingUnit: taskBilling.billingUnit ?? "ha",
          price: taskBilling.price,
          currency: taskBilling.currency ?? "SEK",
          validFrom: taskBilling.validFrom,
          validTo: taskBilling.validTo,
        },
      ],
    }));
  }

  function updateCustomerConditionRow(rowId: string, patch: Partial<CustomerConditionRow>) {
    setOrganizationForm((current) => ({
      ...current,
      customerConditionRows: current.customerConditionRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    }));
  }

  function removeCustomerConditionRow(rowId: string) {
    setOrganizationForm((current) => ({
      ...current,
      customerConditionRows: current.customerConditionRows.filter((row) => row.id !== rowId),
    }));
  }

  function productPackageSummary(product: ProductInventoryItem) {
    const parts = [
      product.packageUnit ? `${t("products.packageUnit")}: ${product.packageUnit}` : "",
      product.quantityPerPackage !== undefined ? `${formatQuantity(product.quantityPerPackage)} ${product.unit}/${t("products.vpeShort")}` : "",
    ].filter(Boolean);
    return parts.join(" · ");
  }

  function formNumberText(value: number) {
    if (!Number.isFinite(value)) return "";
    return String(Math.round(value * 1000) / 1000);
  }

  function movementQuantityFromPackages(form = movementForm) {
    const packageQuantity = numberFromForm(form.packageQuantity) || selectedProduct?.quantityPerPackage || 0;
    const fullPackageTotal = numberFromForm(form.packageCount) * packageQuantity;
    const openedTotal = numberFromForm(form.openedPackageCount) * numberFromForm(form.openedPackageQuantity);
    return fullPackageTotal + openedTotal;
  }

  function updateMovementPackageFields(patch: Partial<typeof movementForm>) {
    setMovementForm((current) => {
      const next = { ...current, ...patch };
      const calculatedQuantity = movementQuantityFromPackages(next);
      return {
        ...next,
        quantity: calculatedQuantity > 0 ? formNumberText(calculatedQuantity) : next.quantity,
      };
    });
  }

  function updateMovementDeliveredTotal(value: string) {
    const total = numberFromForm(value);
    const standardPackageQuantity = selectedProduct?.quantityPerPackage ?? 0;
    if (total > 0 && standardPackageQuantity > 0) {
      const fullPackages = Math.floor(total / standardPackageQuantity);
      const rest = Math.round((total - fullPackages * standardPackageQuantity) * 1000) / 1000;
      setMovementForm((current) => ({
        ...current,
        deliveredTotal: value,
        packageCount: fullPackages > 0 ? String(fullPackages) : "",
        packageQuantity: formNumberText(standardPackageQuantity),
        openedPackageCount: rest > 0 ? "1" : "",
        openedPackageQuantity: rest > 0 ? formNumberText(rest) : "",
        quantity: formNumberText(total),
      }));
      return;
    }
    setMovementForm((current) => ({ ...current, deliveredTotal: value, quantity: value }));
  }

  async function addProductPhoto(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const document = await fileToDataDocument(file);
    setProductForm((current) => ({
      ...current,
      photoName: document.name,
      photoUrl: document.url,
    }));
  }

  function startNewProduct() {
    setIsCreatingProduct(true);
    setSelectedProductId("");
    setProductForm({
      name: "",
      category: "",
      unit: "Stk",
      supplierName: "",
      articleNumber: "",
      photoUrl: "",
      photoName: "",
      currency: "SEK",
      purchasePrice: "",
      salesPrice: "",
      purchasePriceValidFrom: "",
      purchasePriceValidTo: "",
      salesPriceValidFrom: "",
      salesPriceValidTo: "",
      openingStock: "0",
      minimumStock: "",
      packageUnit: "",
      quantityPerPackage: "",
      notes: "",
    });
    setMovementDocuments([]);
  }

  function saveProduct() {
    if (!canManageProducts || !productForm.name.trim()) return;
    const editableProduct = isCreatingProduct ? undefined : selectedProduct;
    const nextProduct: ProductInventoryItem = {
      id: editableProduct?.id ?? createLocalId("product"),
      organizationId: editableProduct?.organizationId ?? resourceOrganizationId ?? authProfile?.organizationId,
      name: productForm.name.trim(),
      category: productForm.category.trim(),
      unit: productForm.unit.trim() || "Stk",
      supplierName: productForm.supplierName.trim() || undefined,
      articleNumber: productForm.articleNumber.trim() || undefined,
      photoUrl: productForm.photoUrl || undefined,
      photoName: productForm.photoName || undefined,
      currency: productForm.currency || "SEK",
      purchasePrice: optionalNumberFromForm(productForm.purchasePrice),
      salesPrice: optionalNumberFromForm(productForm.salesPrice),
      purchasePriceValidFrom: productForm.purchasePriceValidFrom || undefined,
      purchasePriceValidTo: productForm.purchasePriceValidTo || undefined,
      salesPriceValidFrom: productForm.salesPriceValidFrom || undefined,
      salesPriceValidTo: productForm.salesPriceValidTo || undefined,
      openingStock: numberFromForm(productForm.openingStock),
      minimumStock: optionalNumberFromForm(productForm.minimumStock),
      packageUnit: productForm.packageUnit.trim() || undefined,
      quantityPerPackage: optionalNumberFromForm(productForm.quantityPerPackage),
      notes: productForm.notes.trim() || undefined,
      archivedAt: editableProduct?.archivedAt,
    };
    setProducts((current) => {
      const exists = current.some((product) => product.id === nextProduct.id);
      return exists ? current.map((product) => product.id === nextProduct.id ? nextProduct : product) : [nextProduct, ...current];
    });
    setIsCreatingProduct(false);
    setSelectedProductId(nextProduct.id);
  }

  function archiveSelectedProduct() {
    if (!selectedProduct || !canManageProducts) return;
    setProducts((current) => current.map((product) => product.id === selectedProduct.id ? { ...product, archivedAt: new Date().toISOString() } : product));
  }

  function restoreSelectedProduct() {
    if (!selectedProduct || !canManageProducts) return;
    setProducts((current) => current.map((product) => product.id === selectedProduct.id ? { ...product, archivedAt: undefined } : product));
  }

  async function addMovementDocuments(fileList: FileList | null) {
    if (!fileList?.length) return;
    const documents = await Promise.all(Array.from(fileList).map((file) => fileToDataDocument(file)));
    setMovementDocuments((current) => [...current, ...documents]);
  }

  function bookProductMovement() {
    if (!selectedProduct || !canManageProducts) return;
    const quantity = numberFromForm(movementForm.quantity);
    if (quantity <= 0) return;
    const selectedJob = jobs.find((job) => job.id === movementForm.jobId);
    const movement: ProductMovement = {
      id: createLocalId("local"),
      productId: selectedProduct.id,
      type: movementForm.type,
      quantity,
      packageCount: optionalNumberFromForm(movementForm.packageCount),
      packageQuantity: optionalNumberFromForm(movementForm.packageQuantity) ?? selectedProduct.quantityPerPackage,
      openedPackageCount: optionalNumberFromForm(movementForm.openedPackageCount),
      openedPackageQuantity: optionalNumberFromForm(movementForm.openedPackageQuantity),
      bookedAt: movementForm.bookedAt || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      bookedById: authProfile?.id,
      bookedByName: authProfile?.fullName ?? t("app.user"),
      jobId: movementForm.type === "out" ? selectedJob?.id : undefined,
      jobLabel: movementForm.type === "out" && selectedJob ? `${selectedJob.jobNumber ?? selectedJob.id} · ${selectedJob.title}` : undefined,
      currency: selectedProduct.currency ?? "SEK",
      purchasePrice: optionalNumberFromForm(movementForm.purchasePrice),
      note: movementForm.note.trim() || undefined,
      correctionOfMovementId: movementForm.correctionOfMovementId || undefined,
      documents: movementDocuments,
    };
    setProductMovements((current) => [movement, ...current]);
    setMovementDocuments([]);
    setMovementForm((current) => ({
      ...current,
      quantity: "",
      deliveredTotal: "",
      packageCount: "",
      packageQuantity: selectedProduct.quantityPerPackage?.toString() ?? "",
      openedPackageCount: "",
      openedPackageQuantity: "",
      jobId: "",
      purchasePrice: "",
      note: "",
      correctionOfMovementId: "",
    }));
    setIsProductBookingModalOpen(false);
  }

  function prepareProductMovementCorrection(movement: ProductMovement) {
    const product = products.find((item) => item.id === movement.productId);
    setSelectedProductMovementId("");
    setSelectedProductId(movement.productId);
    setMovementDocuments([]);
    setMovementForm({
      type: movement.type === "in" ? "out" : "in",
      quantity: String(movement.quantity),
      deliveredTotal: "",
      packageCount: movement.packageCount?.toString() ?? "",
      packageQuantity: movement.packageQuantity?.toString() ?? product?.quantityPerPackage?.toString() ?? "",
      openedPackageCount: movement.openedPackageCount?.toString() ?? "",
      openedPackageQuantity: movement.openedPackageQuantity?.toString() ?? "",
      bookedAt: new Date().toISOString().slice(0, 10),
      jobId: "",
      purchasePrice: "",
      note: t("products.correctionNote", {
        date: new Date(`${movement.bookedAt}T00:00:00`).toLocaleDateString(i18n.language),
        quantity: formatQuantity(movement.quantity),
        unit: product?.unit ?? "",
      }),
      correctionOfMovementId: movement.id,
    });
  }

  function releaseProblemJobForCompletion(jobId: string) {
    if (!onUpdateJob) return;
    onUpdateJob(jobId, {
      completionStatus: "review",
      completionStatusChangedAt: new Date().toISOString(),
      completionStatusChangedBy: authProfile?.fullName ?? t("report.systemUser"),
    });
  }

  const problemsPanel = (
    <section className="dispatch-problems-panel" aria-label={t("contractor.problems")}>
      <button
        className="dispatch-problems-toggle"
        aria-expanded={problemCount > 0}
        type="button"
      >
        <span>{t("contractor.problems")} ({problemCount})</span>
        <ChevronDown className={problemCount > 0 ? "open" : ""} size={18} />
      </button>
      {problemCount > 0 && (
        <div className="dispatch-problems-list">
          {openVacationRequests.map((request) => (
            <div className="alert-item vacation-alert-item" key={request.id}>
              <CalendarDays size={19} />
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
              <Wrench size={18} />
              <div>
                <strong>{t("dashboard.machineProblem")} · {[...(problem.vehicleNames ?? []), ...(problem.implementNames ?? [])].join(" · ") || t("terms.vehicle")}</strong>
                <span>{[problem.driverName, problem.problemRecipient ? t(`driver.notify.${problem.problemRecipient}`) : "", problem.note].filter(Boolean).join(" · ")}</span>
              </div>
            </div>
          ))}
          {lowStockProducts.map(({ product, stock }) => (
            <div className="alert-item" key={`low-stock-${product.id}`}>
              <Package size={18} />
              <div>
                <strong>{t("products.lowStockTitle")} · {product.name}</strong>
                <span>{t("products.lowStockDetail", { stock: `${formatQuantity(stock)} ${product.unit}`, minimum: `${formatQuantity(product.minimumStock ?? 0)} ${product.unit}` })}</span>
              </div>
            </div>
          ))}
          {problems.map((problem) => (
            (() => {
              const problemJob = jobs.find((job) => job.id === problem.jobId);
              const isReleasedForCompletion = Boolean(problemJob?.completionStatus);
              return (
                <div className="alert-item" key={problem.id}>
                  <MessageSquare size={18} />
                  <div>
                    <strong><FieldName id={problem.fieldId} />{problemJob ? ` · ${problemJob.jobNumber ?? problemJob.title}` : ""}</strong>
                    <span>{problem.note ?? t("contractor.openFeedback")}</span>
                  </div>
                  <button
                    className="secondary-action compact-action"
                    disabled={!problemJob || !onUpdateJob || isReleasedForCompletion}
                    onClick={() => problemJob && releaseProblemJobForCompletion(problemJob.id)}
                    type="button"
                  >
                    {t(isReleasedForCompletion ? "contractor.releasedForCompletion" : "contractor.releaseForCompletion")}
                  </button>
                </div>
              );
            })()
          ))}
        </div>
      )}
    </section>
  );

  function persistDriverTimeEntries(next: DriverTimeEntry[]) {
    setDriverTimeEntries(next);
    void writeDriverTimeEntries(next).then(setDriverTimeEntries);
  }

  function draftFromDriverTimeEntry(entry: DriverTimeEntry): TimeEntryEditDraft {
    return {
      id: entry.id,
      kind: entry.kind,
      startedAt: toDateTimeInputValue(entry.startedAt),
      endedAt: toDateTimeInputValue(entry.endedAt),
      reason: entry.reason ?? "",
      jobNumber: entry.jobNumber ?? "",
      note: entry.note ?? "",
    };
  }

  function editDriverTimeEntry(entry: DriverTimeEntry) {
    if (entry.lockedAt) {
      setTimeEntryEditNotice(t("masterData.timeEntryLockedNotice"));
      return;
    }
    setEditingTimeEntryId(entry.id);
    setTimeEntryEditDraft(draftFromDriverTimeEntry(entry));
    setTimeEntryEditNotice("");
  }

  function updateTimeEntryEditDraft(patch: Partial<TimeEntryEditDraft>) {
    setTimeEntryEditDraft((current) => current ? { ...current, ...patch } : current);
  }

  function saveTimeEntryEditDraft() {
    if (!timeEntryEditDraft) return;
    const startedAt = fromDateTimeInputValue(timeEntryEditDraft.startedAt);
    const endedAt = fromDateTimeInputValue(timeEntryEditDraft.endedAt);
    if (!startedAt || (endedAt && !minutesBetween(startedAt, endedAt))) {
      setTimeEntryEditNotice(t("masterData.timeEntryInvalidRange"));
      return;
    }
    persistDriverTimeEntries(driverTimeEntries.map((item) => (
      item.id === timeEntryEditDraft.id ? {
        ...item,
        kind: timeEntryEditDraft.kind,
        startedAt,
        endedAt,
        minutes: minutesBetween(startedAt, endedAt),
        reason: timeEntryEditDraft.reason.trim() || undefined,
        jobNumber: timeEntryEditDraft.jobNumber.trim() || undefined,
        note: timeEntryEditDraft.note.trim() || undefined,
      } : item
    )));
    setEditingTimeEntryId("");
    setTimeEntryEditDraft(null);
    setTimeEntryEditNotice("");
  }

  function deleteDriverTimeEntry(entry: DriverTimeEntry) {
    if (entry.lockedAt) {
      setTimeEntryEditNotice(t("masterData.timeEntryLockedNotice"));
      return;
    }
    setDeleteTimeEntryConfirm(entry);
  }

  function confirmDeleteDriverTimeEntry() {
    if (!deleteTimeEntryConfirm) return;
    const entryId = deleteTimeEntryConfirm.id;
    setDeleteTimeEntryConfirm(null);
    setTimeEntryEditNotice("");
    setDriverTimeEntries((current) => current.filter((entry) => entry.id !== entryId));
    void deleteStoredDriverTimeEntry(entryId).then(setDriverTimeEntries);
  }

  function cancelDeleteDriverTimeEntry() {
    setDeleteTimeEntryConfirm(null);
    setTimeEntryEditNotice("");
  }

  function lockDriverTimeEntries(entries: DriverTimeEntry[]) {
    const now = new Date().toISOString();
    const actorName = authProfile?.fullName ?? authProfile?.email ?? t("report.systemUser");
    const targetIds = new Set(entries.filter((entry) => !entry.lockedAt).map((entry) => entry.id));
    if (targetIds.size === 0) return;
    persistDriverTimeEntries(driverTimeEntries.map((entry) => (
      targetIds.has(entry.id)
        ? { ...entry, lockedAt: now, lockedById: authProfile?.id, lockedByName: actorName }
        : entry
    )));
  }

  function lockPayrollMonthForDriver(driverId?: string) {
    const entries = driverTimeEntries.filter((entry) => (
      (!driverId || entry.driverId === driverId)
      && entry.startedAt.slice(0, 7) === payrollMonth
      && entry.endedAt
      && entry.minutes
    ));
    lockDriverTimeEntries(entries);
  }

  function employeeCanEditTimeEntry(entry: DriverTimeEntry) {
    if (entry.lockedAt) return false;
    const started = new Date(entry.startedAt).getTime();
    if (!Number.isFinite(started)) return false;
    const maxAgeMs = employeeTimeEditWindowDays * 86400000;
    return Date.now() - started <= maxAgeMs;
  }

  function timeEntryLockMeta(entry: DriverTimeEntry) {
    if (!entry.lockedAt) return t("masterData.notLockedYet");
    return [
      new Date(entry.lockedAt).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }),
      entry.lockedByName ? t("masterData.lockedBy", { name: entry.lockedByName }) : "",
    ].filter(Boolean).join(" · ");
  }

  function payrollReportLines(driverId?: string) {
    const rows = driverId ? payrollSummaries.filter((row) => row.driver.id === driverId) : payrollSummaries;
    const title = driverId
      ? `${t("masterData.payrollReport")} ${rows[0]?.driver.name ?? ""} ${payrollMonth}`
      : `${t("masterData.payrollReportAll")} ${payrollMonth}`;
    return {
      title,
      lines: [
        "Farm-Manager",
        title,
        "",
        ...rows.flatMap((row) => [
          `${row.driver.name}`,
          `${t("masterData.totalWorkTime")}: ${formatDurationMinutes(row.workMinutes)} · ${t("masterData.totalPauseTime")}: ${formatDurationMinutes(row.pauseMinutes)} · ${t("masterData.interruptionTime")}: ${formatDurationMinutes(row.interruptionMinutes)}`,
          `${t("masterData.openVacationRequests")}: ${row.vacationRequests.filter((request) => request.status === "requested").length}`,
          ...row.entries.map((entry) => {
            const start = new Date(entry.startedAt).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" });
            const end = entry.endedAt ? new Date(entry.endedAt).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }) : t("driver.running");
            return `- ${t(entry.kind === "work" ? "driver.workTime" : entry.kind === "pause" ? "driver.pause" : "driver.interruption")}: ${start}-${end} · ${entry.minutes ? formatDurationMinutes(entry.minutes) : t("driver.running")}${entry.jobNumber ? ` · ${entry.jobNumber}` : ""}${entry.note ? ` · ${entry.note}` : ""}`;
          }),
          "",
        ]),
      ],
    };
  }

  function escapeReportHtml(value: string) {
    return value.replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char] ?? char);
  }

  function printReportPreview() {
    const previewWindow = reportPreviewFrameRef.current?.contentWindow;
    if (!previewWindow) return;
    previewWindow.focus();
    previewWindow.print();
  }

  function printPayrollReport(driverId?: string) {
    const report = payrollReportLines(driverId);
    const rows = driverId ? payrollSummaries.filter((row) => row.driver.id === driverId) : payrollSummaries;
    const periodLabel = new Date(`${payrollMonth}-01T00:00:00`).toLocaleDateString(i18n.language, { month: "long", year: "numeric" });
    const employeeSections = rows.map((row) => {
      const vacationRows = row.vacationRequests.map((request) => `
        <tr>
          <td>${escapeReportHtml(request.from)}</td>
          <td>${escapeReportHtml(request.to)}</td>
          <td class="numeric">${request.days}</td>
          <td>${escapeReportHtml(t(`driver.vacationStatus.${request.status}`))}</td>
          <td>${escapeReportHtml(request.note || request.decisionReason || "-")}</td>
        </tr>
      `).join("");
      const timeRows = row.entries.map((entry) => {
        const startedAt = new Date(entry.startedAt);
        const endedAt = entry.endedAt ? new Date(entry.endedAt) : undefined;
        return `
          <tr>
            <td>${escapeReportHtml(startedAt.toLocaleDateString(i18n.language))}</td>
            <td>${escapeReportHtml(startedAt.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }))}</td>
            <td>${endedAt ? escapeReportHtml(endedAt.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })) : escapeReportHtml(t("driver.running"))}</td>
            <td>${escapeReportHtml(t(entry.kind === "work" ? "driver.workTime" : entry.kind === "pause" ? "driver.pause" : "driver.interruption"))}</td>
            <td class="numeric">${escapeReportHtml(entry.minutes ? formatDurationMinutes(entry.minutes) : t("driver.running"))}</td>
            <td>${escapeReportHtml(entry.reason ? t(`${entry.kind === "pause" ? "driver.pauseReasons" : "driver.interruptionReasons"}.${entry.reason}`) : "-")}</td>
            <td>${escapeReportHtml([entry.jobNumber, entry.note].filter(Boolean).join(" · ") || "-")}</td>
          </tr>
        `;
      }).join("");
      return `
        <section class="employee">
          <div class="employee-head">
            <div>
              <h2>${escapeReportHtml(row.driver.name)}</h2>
              <p>${escapeReportHtml([row.driver.mobile, row.driver.email, row.driver.resourceType].filter(Boolean).join(" · ") || "-")}</p>
            </div>
            <div class="summary compact">
              <div><span>${escapeReportHtml(t("masterData.totalWorkTime"))}</span><strong>${escapeReportHtml(formatDurationMinutes(row.workMinutes))}</strong></div>
              <div><span>${escapeReportHtml(t("masterData.totalPauseTime"))}</span><strong>${escapeReportHtml(formatDurationMinutes(row.pauseMinutes))}</strong></div>
              <div><span>${escapeReportHtml(t("masterData.interruptionTime"))}</span><strong>${escapeReportHtml(formatDurationMinutes(row.interruptionMinutes))}</strong></div>
            </div>
          </div>
          <h3>Einsatzzeiten</h3>
          <table>
            <thead>
              <tr><th>Datum</th><th>Start</th><th>Ende</th><th>Art</th><th class="numeric">Dauer</th><th>Grund</th><th>Auftrag / Notiz</th></tr>
            </thead>
            <tbody>${timeRows || `<tr><td colspan="7">${escapeReportHtml(t("masterData.noTimeEntries"))}</td></tr>`}</tbody>
          </table>
          <h3>Urlaub</h3>
          <table>
            <thead>
              <tr><th>Von</th><th>Bis</th><th class="numeric">Tage</th><th>Status</th><th>Bemerkung / Entscheidung</th></tr>
            </thead>
            <tbody>${vacationRows || `<tr><td colspan="5">${escapeReportHtml(t("masterData.noVacationRequests"))}</td></tr>`}</tbody>
          </table>
        </section>
      `;
    }).join("");
    setReportPreview({
      title: report.title,
      html: `
      <html>
        <head>
          <title>${escapeReportHtml(report.title)}</title>
          <style>
            @page { margin: 18mm; }
            body { font-family: Arial, sans-serif; color: #14221a; margin: 0; }
            .report { display: grid; gap: 18px; }
            .report-head { border-bottom: 3px solid #2f6f3e; display: grid; gap: 8px; padding-bottom: 14px; }
            .brand { color: #2f6f3e; font-size: 13px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
            h1 { font-size: 24px; line-height: 1.15; margin: 0; }
            h2 { font-size: 18px; margin: 0 0 3px; }
            h3 { color: #31543a; font-size: 13px; margin: 14px 0 7px; }
            p { color: #617268; font-size: 12px; margin: 0; }
            .meta { color: #52645a; display: grid; font-size: 12px; gap: 4px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .summary { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
            .summary.compact { grid-template-columns: repeat(3, minmax(0, 1fr)); }
            .summary div { border: 1px solid #dbe6dc; border-radius: 8px; padding: 10px; }
            .summary span { color: #617268; display: block; font-size: 11px; font-weight: 700; margin-bottom: 5px; }
            .summary strong { font-size: 17px; }
            .employee { break-inside: avoid; display: grid; gap: 8px; }
            .employee + .employee { border-top: 1px solid #dbe6dc; padding-top: 18px; }
            .employee-head { align-items: start; display: grid; gap: 14px; grid-template-columns: minmax(180px, 1fr) minmax(360px, 1.7fr); }
            table { border-collapse: collapse; font-size: 11px; width: 100%; }
            th { background: #eef6e9; color: #26362c; font-size: 10px; text-align: left; text-transform: uppercase; }
            th, td { border-bottom: 1px solid #dfe8dc; padding: 7px 6px; vertical-align: top; }
            .numeric { text-align: right; white-space: nowrap; }
            .signature { display: grid; gap: 30px; grid-template-columns: repeat(2, 1fr); margin-top: 28px; }
            .signature div { border-top: 1px solid #718176; color: #617268; font-size: 11px; padding-top: 6px; }
          </style>
        </head>
        <body>
          <main class="report">
            <section class="report-head">
              <div class="brand">Farm-Manager</div>
              <h1>${escapeReportHtml(report.title)}</h1>
              <div class="meta">
                <span><b>Zeitraum:</b> ${escapeReportHtml(periodLabel)}</span>
                <span><b>Erstellt:</b> ${escapeReportHtml(new Date().toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }))}</span>
                <span><b>Mitarbeiter:</b> ${rows.length}</span>
                <span><b>${escapeReportHtml(t("masterData.openVacationRequests"))}:</b> ${rows.reduce((sum, row) => sum + row.vacationRequests.filter((request) => request.status === "requested").length, 0)}</span>
              </div>
            </section>
            <section class="summary">
              <div><span>${escapeReportHtml(t("masterData.totalWorkTime"))}</span><strong>${escapeReportHtml(formatDurationMinutes(rows.reduce((sum, row) => sum + row.workMinutes, 0)))}</strong></div>
              <div><span>${escapeReportHtml(t("masterData.totalPauseTime"))}</span><strong>${escapeReportHtml(formatDurationMinutes(rows.reduce((sum, row) => sum + row.pauseMinutes, 0)))}</strong></div>
              <div><span>${escapeReportHtml(t("masterData.interruptionTime"))}</span><strong>${escapeReportHtml(formatDurationMinutes(rows.reduce((sum, row) => sum + row.interruptionMinutes, 0)))}</strong></div>
              <div><span>${escapeReportHtml(t("driver.timeEntries"))}</span><strong>${rows.reduce((sum, row) => sum + row.entries.length, 0)}</strong></div>
            </section>
            ${employeeSections}
            <section class="signature">
              <div>Lohnbuchhaltung</div>
              <div>Geprüft durch Einsatzleitung</div>
            </section>
          </main>
        </body>
      </html>
    `,
    });
  }

  function printProductInventoryReport(product = selectedProduct) {
    if (!product) return;
    const sortedMovements = productMovements
      .filter((movement) => movement.productId === product.id)
      .sort((a, b) => `${a.bookedAt}-${a.createdAt ?? ""}`.localeCompare(`${b.bookedAt}-${b.createdAt ?? ""}`));
    let runningStock = product.openingStock ?? 0;
    const movementRows = sortedMovements.map((movement) => {
      runningStock += movement.type === "in" ? movement.quantity : -movement.quantity;
      const packageInfo = [
        movement.packageCount ? `${formatQuantity(movement.packageCount)} ${product.packageUnit ?? t("products.vpeShort")}` : "",
        movement.packageQuantity ? `${formatQuantity(movement.packageQuantity)} ${product.unit}/${t("products.vpeShort")}` : "",
        movement.openedPackageCount || movement.openedPackageQuantity
          ? `${movement.openedPackageCount ? formatQuantity(movement.openedPackageCount) : "1"} ${t("products.openedPackage")} · ${movement.openedPackageQuantity ? formatQuantity(movement.openedPackageQuantity) : "-"} ${product.unit}`
          : "",
      ].filter(Boolean).join(" · ");
      return `
        <tr>
          <td>${escapeReportHtml(new Date(`${movement.bookedAt}T00:00:00`).toLocaleDateString(i18n.language))}</td>
          <td>${escapeReportHtml(movement.type === "in" ? t("products.movementIn") : t("products.movementOut"))}</td>
          <td class="numeric">${movement.type === "in" ? "+" : "-"}${escapeReportHtml(formatQuantity(movement.quantity))} ${escapeReportHtml(product.unit)}</td>
          <td class="numeric">${escapeReportHtml(formatQuantity(runningStock))} ${escapeReportHtml(product.unit)}</td>
          <td>${escapeReportHtml(packageInfo || "-")}</td>
          <td>${escapeReportHtml(movement.purchasePrice !== undefined ? formatMoneyValue(movement.purchasePrice, movement.currency ?? product.currency ?? "SEK") : "-")}</td>
          <td>${escapeReportHtml(movement.jobLabel ?? "-")}</td>
          <td>${escapeReportHtml(movement.bookedByName ?? t("products.unknownBooker"))}</td>
          <td class="numeric">${movement.documents.length}</td>
          <td>${escapeReportHtml(movement.note ?? "-")}</td>
        </tr>
      `;
    }).join("");
    const totalIn = sortedMovements.filter((movement) => movement.type === "in").reduce((sum, movement) => sum + movement.quantity, 0);
    const totalOut = sortedMovements.filter((movement) => movement.type === "out").reduce((sum, movement) => sum + movement.quantity, 0);
    const priceValidity = (price?: number, from?: string, to?: string) => [
      price !== undefined ? formatMoneyValue(price, product.currency ?? "SEK") : "-",
      from || to ? `${from || "-"}-${to || "-"}` : "",
    ].filter(Boolean).join(" · ");
    setReportPreview({
      title: `${t("products.inventoryReport")} ${product.name}`,
      html: `
      <html>
        <head>
          <title>${escapeReportHtml(t("products.inventoryReport"))} ${escapeReportHtml(product.name)}</title>
          <style>
            @page { margin: 16mm; }
            body { font-family: Arial, sans-serif; color: #14221a; margin: 0; }
            .report { display: grid; gap: 18px; }
            .report-head { border-bottom: 3px solid #2f6f3e; display: grid; gap: 9px; padding-bottom: 14px; }
            .brand { color: #2f6f3e; font-size: 13px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
            h1 { font-size: 25px; line-height: 1.15; margin: 0; }
            h2 { color: #31543a; font-size: 14px; margin: 0; }
            p { color: #617268; font-size: 12px; margin: 0; }
            .meta { display: grid; gap: 6px 18px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
            .meta div { border-bottom: 1px solid #e3ece0; padding-bottom: 5px; }
            .meta span { color: #617268; display: block; font-size: 10px; font-weight: 800; text-transform: uppercase; }
            .meta b { display: block; font-size: 12px; margin-top: 2px; }
            .summary { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
            .summary div { border: 1px solid #dbe6dc; border-radius: 8px; padding: 10px; }
            .summary span { color: #617268; display: block; font-size: 11px; font-weight: 700; margin-bottom: 5px; }
            .summary strong { font-size: 17px; }
            table { border-collapse: collapse; font-size: 10.5px; width: 100%; }
            th { background: #eef6e9; color: #26362c; font-size: 9px; text-align: left; text-transform: uppercase; }
            th, td { border-bottom: 1px solid #dfe8dc; padding: 7px 5px; vertical-align: top; }
            .numeric { text-align: right; white-space: nowrap; }
            .footer { border-top: 1px solid #dbe6dc; color: #617268; display: flex; font-size: 10px; justify-content: space-between; padding-top: 8px; }
          </style>
        </head>
        <body>
          <main class="report">
            <section class="report-head">
              <div class="brand">Farm-Manager</div>
              <h1>${escapeReportHtml(t("products.inventoryReport"))}</h1>
              <p>${escapeReportHtml(product.name)} · ${escapeReportHtml([product.category, product.articleNumber, product.supplierName].filter(Boolean).join(" · ") || "-")}</p>
              <div class="meta">
                <div><span>${escapeReportHtml(t("masterDataOverview.productFields.name"))}</span><b>${escapeReportHtml(product.name)}</b></div>
                <div><span>${escapeReportHtml(t("masterDataOverview.productFields.category"))}</span><b>${escapeReportHtml(product.category || "-")}</b></div>
                <div><span>${escapeReportHtml(t("products.supplier"))}</span><b>${escapeReportHtml(product.supplierName || "-")}</b></div>
                <div><span>${escapeReportHtml(t("products.articleNumber"))}</span><b>${escapeReportHtml(product.articleNumber || "-")}</b></div>
                <div><span>${escapeReportHtml(t("masterDataOverview.productFields.unit"))}</span><b>${escapeReportHtml(product.unit)}</b></div>
                <div><span>${escapeReportHtml(t("products.currency"))}</span><b>${escapeReportHtml(product.currency ?? "SEK")}</b></div>
                <div><span>${escapeReportHtml(t("products.purchasePrice"))}</span><b>${escapeReportHtml(priceValidity(product.purchasePrice, product.purchasePriceValidFrom, product.purchasePriceValidTo))}</b></div>
                <div><span>${escapeReportHtml(t("products.salesPrice"))}</span><b>${escapeReportHtml(priceValidity(product.salesPrice, product.salesPriceValidFrom, product.salesPriceValidTo))}</b></div>
                <div><span>${escapeReportHtml(t("products.organization"))}</span><b>${escapeReportHtml(ownOrganization?.name ?? "-")}</b></div>
                <div><span>${escapeReportHtml(t("products.packageUnit"))}</span><b>${escapeReportHtml([product.packageUnit, product.quantityPerPackage ? `${formatQuantity(product.quantityPerPackage)} ${product.unit}` : ""].filter(Boolean).join(" · ") || "-")}</b></div>
                <div><span>${escapeReportHtml(t("products.minimumStock"))}</span><b>${product.minimumStock !== undefined ? `${escapeReportHtml(formatQuantity(product.minimumStock))} ${escapeReportHtml(product.unit)}` : "-"}</b></div>
                <div><span>${escapeReportHtml(t("products.createdAt"))}</span><b>${escapeReportHtml(new Date().toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }))}</b></div>
              </div>
            </section>
            <section class="summary">
              <div><span>${escapeReportHtml(t("products.openingStock"))}</span><strong>${escapeReportHtml(formatQuantity(product.openingStock ?? 0))} ${escapeReportHtml(product.unit)}</strong></div>
              <div><span>${escapeReportHtml(t("products.totalIn"))}</span><strong>${escapeReportHtml(formatQuantity(totalIn))} ${escapeReportHtml(product.unit)}</strong></div>
              <div><span>${escapeReportHtml(t("products.totalOut"))}</span><strong>${escapeReportHtml(formatQuantity(totalOut))} ${escapeReportHtml(product.unit)}</strong></div>
              <div><span>${escapeReportHtml(t("products.currentStock"))}</span><strong>${escapeReportHtml(formatQuantity(productStock(product.id)))} ${escapeReportHtml(product.unit)}</strong></div>
            </section>
            <section>
              <h2>${escapeReportHtml(t("products.movementHistory"))}</h2>
              <table>
                <thead>
                  <tr>
                    <th>${escapeReportHtml(t("products.bookingDate"))}</th>
                    <th>${escapeReportHtml(t("products.movementType"))}</th>
                    <th class="numeric">${escapeReportHtml(t("products.quantity"))}</th>
                    <th class="numeric">${escapeReportHtml(t("products.stockAfterMovement"))}</th>
                    <th>${escapeReportHtml(t("products.packageUnit"))}</th>
                    <th>${escapeReportHtml(t("products.purchasePrice"))}</th>
                    <th>${escapeReportHtml(t("products.assignJob"))}</th>
                    <th>${escapeReportHtml(t("products.bookedBy"))}</th>
                    <th class="numeric">${escapeReportHtml(t("products.documents"))}</th>
                    <th>${escapeReportHtml(t("products.bookingNote"))}</th>
                  </tr>
                </thead>
                <tbody>${movementRows || `<tr><td colspan="10">${escapeReportHtml(t("products.noMovements"))}</td></tr>`}</tbody>
              </table>
            </section>
            <section class="footer">
              <span>${escapeReportHtml(t("products.inventoryReport"))}</span>
              <span>${escapeReportHtml(new Date().toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }))}</span>
            </section>
          </main>
        </body>
      </html>
    `,
    });
  }

  function activeResourceHistory() {
    const resourceId = activeMasterGroup === "personnel"
      ? selectedDriver?.id
      : activeMasterGroup === "vehicles"
        ? selectedVehicle?.id
        : selectedImplement?.id;
    if (!resourceId) return [];
    const storedRows = readJsonArray<ResourceHistoryEntry>(resourceHistoryStorageKey)
      .filter((row) => row.resourceGroup === activeMasterGroup && row.resourceId === resourceId);
    const equipmentRows = readJsonArray<DriverEquipmentLogEntry>(equipmentLogStorageKey)
      .flatMap((row): ResourceHistoryEntry[] => {
        const matches = activeMasterGroup === "personnel"
          ? row.driverId === resourceId
          : activeMasterGroup === "vehicles"
            ? (row.vehicleIds ?? []).includes(resourceId)
            : (row.implementIds ?? []).includes(resourceId);
        if (!matches) return [];
        const equipmentNames = [...(row.vehicleNames ?? []), ...(row.implementNames ?? [])].join(" · ");
        return [{
          id: row.id ?? `${resourceId}-${row.recordedAt ?? "equipment"}`,
          resourceGroup: activeMasterGroup,
          resourceId,
          event: "equipment",
          recordedAt: row.recordedAt ?? new Date().toISOString(),
          actor: row.driverName,
          title: row.machineProblem ? t("resourceHistory.machineProblem") : t(`resourceHistory.equipment.${row.eventType ?? "selection"}`),
          details: [equipmentNames, row.placement ? t(`resourceHistory.placement.${row.placement}`) : "", row.problemRecipient ? t("resourceHistory.notified", { recipient: t(`driver.notify.${row.problemRecipient}`) }) : "", row.handoverToDriverName ? t("resourceHistory.handoverTo", { driver: row.handoverToDriverName }) : "", row.note].filter(Boolean).join(" · "),
        }];
      });
    const assignmentRows = subtasks.flatMap((subtask): ResourceHistoryEntry[] => {
      const job = jobs.find((item) => item.id === subtask.jobId);
      const task = job?.tasks.find((item) => item.id === subtask.taskId);
      const field = fields.find((item) => item.id === subtask.fieldId);
      const matches = activeMasterGroup === "personnel"
        ? Boolean(selectedDriver && (
          subtask.activeDriverIds.includes(selectedDriver.id)
          || Boolean(selectedDriver.profileId && subtask.activeDriverIds.includes(selectedDriver.profileId))
          || (subtask.activeDriverNames ?? []).includes(selectedDriver.name)
          || (subtask.performedDriverIds ?? []).includes(selectedDriver.id)
          || Boolean(selectedDriver.profileId && (subtask.performedDriverIds ?? []).includes(selectedDriver.profileId))
          || (subtask.performedDriverNames ?? []).includes(selectedDriver.name)
        ))
        : activeMasterGroup === "vehicles"
          ? (subtask.activeVehicleIds ?? []).includes(resourceId)
          : (subtask.activeImplementIds ?? []).includes(resourceId);
      if (!matches) return [];
      const activityName = task?.name ?? job?.title ?? t("terms.subtask");
      const assignmentStatus = t(`status.${subtask.status}`);
      const detailParts = [
        `${t("resourceHistory.eventType.assigned")}: ${activityName}`,
        field?.name,
        job?.jobNumber ? `Auftrag ${job.jobNumber}` : job?.title,
        `${t("masterData.status")}: ${assignmentStatus}`,
        subtask.driverNote ?? subtask.note,
      ];
      return [{
        id: `${subtask.id}-${resourceId}`,
        resourceGroup: activeMasterGroup,
        resourceId,
        event: "assigned",
        recordedAt: subtask.completedAt ?? subtask.statusChangedAt ?? subtask.updatedAt ?? new Date().toISOString(),
        actor: Array.from(new Set([...(subtask.activeDriverNames ?? []), ...(subtask.performedDriverNames ?? [])])).join(", "),
        title: activityName,
        details: detailParts.filter(Boolean).join(" · "),
        jobNumber: job?.jobNumber ?? subtask.jobId,
        status: subtask.status,
      }];
    });
    return [...storedRows, ...equipmentRows, ...assignmentRows]
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  }

  const selectedResourceHistory = useMemo(activeResourceHistory, [
    activeMasterGroup,
    fields,
    jobs,
    resourceHistoryVersion,
    selectedDriver?.id,
    selectedDriver?.name,
    selectedDriver?.profileId,
    selectedImplement?.id,
    selectedVehicle?.id,
    subtasks,
    t,
  ]);

  function formatHistoryDate(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }).format(parsed);
  }

  function createDriver() {
    const draftId = "new";
    const draft = readPersonnelDraft(draftId, {
      name: t("masterData.newDriverName"),
      organizationId: defaultResourceOrganizationId,
      vehicle: "",
      jobVisibility: "assigned_only" as Driver["jobVisibility"],
      email: "",
      accessPassword: generateDriverPassword(),
      mobile: "",
      licenseClasses: "",
      maxDailyHours: 8,
      annualVacationDays: 30,
      vacationUsedDays: 0,
      employeeType: "field" as PersonnelEmployeeType,
      appRole: "driver" as UserRole,
      allowedViews: ["driver"] as ViewKey[],
      appPermissions: {
        canEditFields: false,
        canCreateJobs: false,
        canEditDrivers: false,
        canAssignDrivers: false,
      } as Record<PersonnelAppPermissionKey, boolean>,
      resourceType: t("masterData.personnel"),
      operationType: "",
    });
    setCreatingResourceGroup("personnel");
    setShowDriverPassword(false);
    setDriverForm(draft);
    setIsResourceModalOpen(true);
  }

  function openDriverEditor(driver: Driver) {
    setCreatingResourceGroup(null);
    setShowDriverPassword(false);
    setSelectedDriverId(driver.id);
    setDriverForm(readPersonnelDraft(driver.id, driverToForm(driver)));
    setIsResourceModalOpen(true);
  }

  function updatePersonnelViewAccess(view: ViewKey, enabled: boolean) {
    setDriverForm((current) => {
      const nextViews = enabled
        ? Array.from(new Set([...current.allowedViews, view]))
        : current.allowedViews.filter((item) => item !== view);
      return { ...current, allowedViews: nextViews.length > 0 ? nextViews : [current.appRole === "driver" ? "driver" : "dashboard"] };
    });
  }

  function updatePersonnelPermission(permission: PersonnelAppPermissionKey, enabled: boolean) {
    setDriverForm((current) => ({
      ...current,
      appPermissions: { ...current.appPermissions, [permission]: enabled },
    }));
  }

  function saveDriver() {
    const normalizedEmail = normalizeEmail(driverForm.email);
    if (normalizedEmail) {
      const duplicateDriver = allDrivers.find((driver) => (
        driver.id !== selectedDriver?.id
        && normalizeEmail(driver.email) === normalizedEmail
      ));
      if (duplicateDriver) {
        window.alert(t("masterData.driverEmailDuplicate", { name: duplicateDriver.name }));
        return;
      }
    }
    const lockedOrganizationId = creatingResourceGroup === "personnel"
      ? defaultResourceOrganizationId
      : driverForm.organizationId || selectedDriver?.organizationId || defaultResourceOrganizationId;
    const payload = {
      ...driverForm,
      email: normalizedEmail,
      organizationId: isResourceOrganizationLocked ? lockedOrganizationId : driverForm.organizationId,
      licenseClasses: driverForm.licenseClasses.split(",").map((item) => item.trim()).filter(Boolean),
    };
    if (creatingResourceGroup === "personnel") {
      const id = createLocalId("local");
      addDriver({ id, ...payload });
      appendResourceHistory({ resourceGroup: "personnel", resourceId: id, event: "created", title: payload.name, details: payload.vehicle });
      setSelectedDriverId(id);
      clearPersonnelDraft("new");
    } else if (selectedDriver) {
      updateDriver(selectedDriver.id, payload);
      appendResourceHistory({ resourceGroup: "personnel", resourceId: selectedDriver.id, event: "updated", title: payload.name, details: payload.vehicle });
      clearPersonnelDraft(selectedDriver.id);
    }
    closeResourceModal();
  }

  function generateDriverPassword() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const suffix = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    return `SL-${suffix}`;
  }

  function generateOrganizationPassword() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const suffix = Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    return `FM-${suffix}`;
  }

  function driverAccessMessage() {
    const appUrl = `${window.location.origin}/fahrer`;
    return t("masterData.driverAccessMessage", {
      appUrl,
      email: driverForm.email || "-",
      password: driverForm.accessPassword || "-",
    });
  }

  function openDriverAccessMail() {
    if (!driverForm.email) return;
    const subject = encodeURIComponent(t("masterData.driverAccessMailSubject"));
    const body = encodeURIComponent(driverAccessMessage());
    window.location.href = `mailto:${encodeURIComponent(driverForm.email)}?subject=${subject}&body=${body}`;
  }

  function openDriverAccessSms() {
    if (!driverForm.mobile) return;
    window.location.href = `sms:${encodeURIComponent(driverForm.mobile)}?&body=${encodeURIComponent(driverAccessMessage())}`;
  }

  function organizationAdminRole(organization?: Organization) {
    return organization?.kind === "farmer" ? "farmer_admin" : "contractor_admin";
  }

  function organizationLoginMessage() {
    const appUrl = `${window.location.origin}/admin`;
    return t("masterData.organizationAccessMessage", {
      appUrl,
      email: organizationForm.email || "-",
      password: organizationLoginPassword || "-",
    });
  }

  function openOrganizationAccessMail() {
    if (!organizationForm.email) return;
    const subject = encodeURIComponent(t("masterData.organizationAccessMailSubject"));
    const body = encodeURIComponent(organizationLoginMessage());
    window.location.href = `mailto:${encodeURIComponent(organizationForm.email)}?subject=${subject}&body=${body}`;
  }

  async function createOrganizationAdminLogin() {
    if (!selectedOrganization || creatingOrganization) return;
    if (!isSupabaseConfigured || !supabase) {
      setOrganizationLoginStatus(t("masterData.organizationLoginRequiresSupabase"));
      return;
    }
    const email = organizationForm.email.trim();
    const password = organizationLoginPassword.trim();
    if (!email || password.length < 6) {
      setOrganizationLoginStatus(t("masterData.organizationLoginMissingData"));
      return;
    }
    setOrganizationLoginStatus(t("masterData.organizationLoginCreating"));
    updateOrganization(selectedOrganization.id, organizationPayloadFromForm());
    const { error } = await supabase.functions.invoke("sync-organization-admin-auth", {
      body: {
        organizationId: selectedOrganization.id,
        fullName: organizationForm.contacts[0]?.name || organizationForm.name,
        email,
        password,
        role: organizationAdminRole({ ...selectedOrganization, ...organizationForm }),
      },
    });
    if (error) {
      let errorMessage = error.message;
      const context = typeof error === "object" && error && "context" in error ? (error as { context?: unknown }).context : null;
      if (context instanceof Response) {
        try {
          const payload = await context.clone().json() as { error?: string };
          if (payload.error) errorMessage = payload.error;
        } catch {
          // Keep Supabase client error.
        }
      }
      setOrganizationLoginStatus(t("masterData.organizationLoginError", { error: errorMessage }));
      return;
    }
    setOrganizationLoginStatus(t("masterData.organizationLoginCreated"));
  }

  function createVehicle() {
    setCreatingResourceGroup("vehicles");
    setVehicleForm({
      name: t("masterData.newVehicleName"),
      type: t("terms.vehicle"),
      licensePlate: "",
      manufacturer: "",
      model: "",
      constructionYear: "",
      operatingHours: "",
      defaultDriverId: "",
      resourceType: t("terms.vehicle"),
      operationType: "",
      status: "frei",
    });
    setIsResourceModalOpen(true);
  }

  function openVehicleEditor(vehicle: Vehicle) {
    setCreatingResourceGroup(null);
    setSelectedVehicleId(vehicle.id);
    setVehicleForm(vehicleToForm(vehicle));
    setIsResourceModalOpen(true);
  }

  function saveVehicle() {
    const payload = {
      ...vehicleForm,
      constructionYear: vehicleForm.constructionYear ? Number(vehicleForm.constructionYear) : undefined,
      operatingHours: vehicleForm.operatingHours ? Number(vehicleForm.operatingHours) : undefined,
      defaultDriverId: vehicleForm.defaultDriverId || undefined,
    };
    if (creatingResourceGroup === "vehicles") {
      const id = createLocalId("local");
      addVehicle({ id, organizationId: defaultResourceOrganizationId, ...payload });
      appendResourceHistory({ resourceGroup: "vehicles", resourceId: id, event: "created", title: payload.name, details: [payload.licensePlate, payload.status].filter(Boolean).join(" · ") });
      setSelectedVehicleId(id);
    } else if (selectedVehicle) {
      updateVehicle(selectedVehicle.id, payload);
      appendResourceHistory({ resourceGroup: "vehicles", resourceId: selectedVehicle.id, event: "updated", title: payload.name, details: [payload.licensePlate, payload.status].filter(Boolean).join(" · ") });
    }
    closeResourceModal();
  }

  function createImplement() {
    setCreatingResourceGroup("implements");
    setImplementForm({
      name: t("masterData.newImplementName"),
      type: t("masterData.implementType"),
      manufacturer: "",
      workingWidth: "",
      resourceType: t("masterData.implementType"),
      operationType: "",
      status: "frei",
    });
    setIsResourceModalOpen(true);
  }

  function openImplementEditor(implement: Implement) {
    setCreatingResourceGroup(null);
    setSelectedImplementId(implement.id);
    setImplementForm(implementToForm(implement));
    setIsResourceModalOpen(true);
  }

  function saveImplement() {
    const payload = {
      ...implementForm,
      workingWidth: implementForm.workingWidth ? Number(implementForm.workingWidth) : undefined,
    };
    if (creatingResourceGroup === "implements") {
      const id = createLocalId("local");
      addImplement({ id, organizationId: defaultResourceOrganizationId, ...payload });
      appendResourceHistory({ resourceGroup: "implements", resourceId: id, event: "created", title: payload.name, details: [payload.type, payload.status].filter(Boolean).join(" · ") });
      setSelectedImplementId(id);
    } else if (selectedImplement) {
      updateImplement(selectedImplement.id, payload);
      appendResourceHistory({ resourceGroup: "implements", resourceId: selectedImplement.id, event: "updated", title: payload.name, details: [payload.type, payload.status].filter(Boolean).join(" · ") });
    }
    closeResourceModal();
  }

  function archiveSelectedResource() {
    if (activeMasterGroup === "personnel" && selectedDriver) {
      archiveDriver(selectedDriver.id);
      appendResourceHistory({ resourceGroup: "personnel", resourceId: selectedDriver.id, event: "archived", title: selectedDriver.name });
    }
    if (activeMasterGroup === "vehicles" && selectedVehicle) {
      archiveVehicle(selectedVehicle.id);
      appendResourceHistory({ resourceGroup: "vehicles", resourceId: selectedVehicle.id, event: "archived", title: selectedVehicle.name });
    }
    if (activeMasterGroup === "implements" && selectedImplement) {
      archiveImplement(selectedImplement.id);
      appendResourceHistory({ resourceGroup: "implements", resourceId: selectedImplement.id, event: "archived", title: selectedImplement.name });
    }
    closeResourceModal();
  }

  function restoreSelectedResource() {
    if (activeMasterGroup === "personnel" && selectedDriver) {
      restoreDriver(selectedDriver.id);
      appendResourceHistory({ resourceGroup: "personnel", resourceId: selectedDriver.id, event: "restored", title: selectedDriver.name });
    }
    if (activeMasterGroup === "vehicles" && selectedVehicle) {
      restoreVehicle(selectedVehicle.id);
      appendResourceHistory({ resourceGroup: "vehicles", resourceId: selectedVehicle.id, event: "restored", title: selectedVehicle.name });
    }
    if (activeMasterGroup === "implements" && selectedImplement) {
      restoreImplement(selectedImplement.id);
      appendResourceHistory({ resourceGroup: "implements", resourceId: selectedImplement.id, event: "restored", title: selectedImplement.name });
    }
    closeResourceModal();
    setCategoryArchiveView(activeMasterGroup, false);
  }

  function requestDeleteSelectedResource() {
    if (activeMasterGroup === "personnel" && selectedDriver) setDeleteResourceConfirm({ id: selectedDriver.id, name: selectedDriver.name, group: "personnel" });
    if (activeMasterGroup === "vehicles" && selectedVehicle) setDeleteResourceConfirm({ id: selectedVehicle.id, name: selectedVehicle.name, group: "vehicles" });
    if (activeMasterGroup === "implements" && selectedImplement) setDeleteResourceConfirm({ id: selectedImplement.id, name: selectedImplement.name, group: "implements" });
  }

  function confirmDeleteSelectedResource() {
    if (!deleteResourceConfirm) return;
    if (deleteResourceConfirm.group === "personnel") deleteDriver(deleteResourceConfirm.id);
    if (deleteResourceConfirm.group === "vehicles") deleteVehicle(deleteResourceConfirm.id);
    if (deleteResourceConfirm.group === "implements") deleteImplement(deleteResourceConfirm.id);
    appendResourceHistory({ resourceGroup: deleteResourceConfirm.group, resourceId: deleteResourceConfirm.id, event: "deleted", title: deleteResourceConfirm.name });
    setDeleteResourceConfirm(null);
    closeResourceModal();
  }

  function createJobType() {
    const id = `job-type-${Date.now()}`;
    addJobType({
      id,
      organizationId: currentRole === "support_admin" ? undefined : authProfile?.organizationId,
      isSystemTemplate: currentRole === "support_admin",
      templateOwnerType: currentRole === "support_admin" ? "system" : "organization",
      createdByAdmin: currentRole === "support_admin",
      name: t("masterData.newJobTypeName"),
      description: "",
      defaultCrews: 1,
      defaultEstimatedHours: 6,
      resourceSummary: t("createJob.dispatchPlannerDecides"),
      tasks: [],
    });
    setSelectedJobTypeId(id);
  }

  function saveJobType() {
    if (!selectedJobType) return;
    updateJobType(selectedJobType.id, jobTypeForm);
  }

  function archiveSelectedJobType() {
    if (!selectedJobType) return;
    archiveJobType(selectedJobType.id);
    setSelectedJobTypeId(activeJobTypes.find((jobType) => jobType.id !== selectedJobType.id)?.id ?? "");
  }

  function requestDeleteSelectedJobType() {
    if (!selectedJobType) return;
    setDeleteJobTypeConfirm({ id: selectedJobType.id, name: selectedJobType.name });
  }

  function confirmDeleteSelectedJobType() {
    if (!deleteJobTypeConfirm) return;
    deleteJobType(deleteJobTypeConfirm.id);
    setSelectedJobTypeId(visibleJobTypes.find((jobType) => jobType.id !== deleteJobTypeConfirm.id)?.id ?? "");
    setDeleteJobTypeConfirm(null);
  }

  function taskTemplateToJobTypeTask(taskTemplate: TaskTemplate): Task {
    return {
      id: `${taskTemplate.id}-${Date.now()}`,
      name: taskTemplate.name,
      subtasks: taskTemplate.workSteps,
      mode: taskTemplate.mode,
      allowMultipleWorkers: taskTemplate.mode !== "Einzelmodus",
      maxVehicles: taskTemplate.mode === "Einzelmodus" ? 1 : taskTemplate.maxVehicles,
      progressMetric: [taskTemplate.progressMetric],
      requiredDrivers: taskTemplate.requiredDrivers,
      requiredVehicles: taskTemplate.requiredVehicles,
      requiredImplements: taskTemplate.requiredImplements,
      resourceHint: taskTemplate.resourceHint,
      unit: taskTemplate.unit || (taskTemplate.progressMetric === "Fläche" ? "ha" : taskTemplate.progressMetric === "Fuhren" ? t("driver.trips") : taskTemplate.progressMetric === "Zeit" ? "h" : undefined),
      mapStyle: taskTemplate.mapStyle,
      timePerHa: taskTemplate.timePerHa,
      estimatedHours: selectedJobType?.defaultEstimatedHours,
    };
  }

  function addTaskToSelectedJobType() {
    if (!selectedJobType || !jobTypeTaskToAdd) return;
    const taskTemplate = taskTemplates.find((item) => item.id === jobTypeTaskToAdd);
    if (!taskTemplate) return;
    updateJobType(selectedJobType.id, { tasks: [...selectedJobType.tasks, taskTemplateToJobTypeTask(taskTemplate)] });
    setJobTypeTaskToAdd("");
  }

  function updateSelectedJobTypeTask(taskId: string, patch: Partial<Task>) {
    if (!selectedJobType) return;
    updateJobType(selectedJobType.id, {
      tasks: selectedJobType.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
    });
  }

  function removeSelectedJobTypeTask(taskId: string) {
    if (!selectedJobType) return;
    updateJobType(selectedJobType.id, { tasks: selectedJobType.tasks.filter((task) => task.id !== taskId) });
  }

  function createTaskTemplate() {
    const id = createLocalId("local");
    addTaskTemplate({
      id,
      organizationId: currentRole === "support_admin" ? undefined : authProfile?.organizationId,
      isSystemTemplate: currentRole === "support_admin",
      templateOwnerType: currentRole === "support_admin" ? "system" : "organization",
      createdByAdmin: currentRole === "support_admin",
      name: t("masterData.newTaskTemplateName"),
      workSteps: [],
      timePerHa: 0.3,
      mode: "Einzelmodus",
      maxVehicles: 1,
      progressMetric: "Fläche",
      unit: "ha",
      requiredDrivers: 1,
      requiredVehicles: 1,
      requiredImplements: 0,
      resourceHint: withMarkerJson("", taskBillingMarker, { billingUnit: "ha", currency: "SEK" }),
      billingUnit: "ha",
      standardPriceCurrency: "SEK",
      mapStyle: undefined,
    });
    setSelectedTaskTemplateId(id);
    setIsTaskTemplateModalOpen(true);
  }

  function saveTaskTemplate() {
    if (!selectedTaskTemplate) return;
    const billingCondition: TaskBillingCondition = {
      billingUnit: taskTemplateForm.billingUnit,
      price: optionalNumberFromForm(taskTemplateForm.standardPrice),
      currency: taskTemplateForm.standardPriceCurrency || "SEK",
      validFrom: taskTemplateForm.standardPriceValidFrom || undefined,
      validTo: taskTemplateForm.standardPriceValidTo || undefined,
    };
    updateTaskTemplate(selectedTaskTemplate.id, {
      name: taskTemplateForm.name,
      timePerHa: taskTemplateForm.timePerHa,
      mode: taskTemplateForm.mode,
      maxVehicles: taskTemplateForm.maxVehicles,
      progressMetric: taskTemplateForm.progressMetric,
      requiredDrivers: taskTemplateForm.requiredDrivers,
      requiredVehicles: taskTemplateForm.requiredVehicles,
      requiredImplements: taskTemplateForm.requiredImplements,
      resourceHint: withMarkerJson(taskTemplateForm.resourceHint, taskBillingMarker, billingCondition),
      unit: taskTemplateForm.unit.trim() || undefined,
      billingUnit: billingCondition.billingUnit,
      standardPrice: billingCondition.price,
      standardPriceCurrency: billingCondition.currency,
      standardPriceValidFrom: billingCondition.validFrom,
      standardPriceValidTo: billingCondition.validTo,
      mapStyle: taskTemplateForm.mapStyleLabel.trim()
        ? {
            label: taskTemplateForm.mapStyleLabel.trim(),
            color: taskTemplateForm.mapStyleColor,
            pattern: taskTemplateForm.mapStylePattern,
          }
        : undefined,
      workSteps: taskTemplateForm.workSteps.split(",").map((item) => item.trim()).filter(Boolean),
    });
    setIsTaskTemplateModalOpen(false);
  }

  function archiveSelectedTaskTemplate() {
    if (!selectedTaskTemplate) return;
    archiveTaskTemplate(selectedTaskTemplate.id);
    setIsTaskTemplateModalOpen(false);
  }

  function requestDeleteSelectedTaskTemplate() {
    if (!selectedTaskTemplate) return;
    setDeleteTaskTemplateConfirm({ id: selectedTaskTemplate.id, name: selectedTaskTemplate.name });
  }

  function confirmDeleteSelectedTaskTemplate() {
    if (!deleteTaskTemplateConfirm) return;
    deleteTaskTemplate(deleteTaskTemplateConfirm.id);
    setDeleteTaskTemplateConfirm(null);
    setIsTaskTemplateModalOpen(false);
  }

  function createOrganization() {
    setCreatingOrganization(true);
    setOrganizationLoginPassword("");
    setOrganizationLoginStatus("");
    setOrganizationForm({
      name: "",
      kind: "farmer",
      organizationNumber: "",
      address: "",
      street: "",
      country: "",
      postalCode: "",
      city: "",
      phone: "",
      mobile: "",
      email: "",
      website: "",
      vatId: "",
      logoUrl: "",
      defaultLanguage: "",
      billingDetails: "",
      customerNumber: "",
      supplierCategory: "",
      notes: "",
      customerConditionRows: [],
      contacts: [],
    });
    setIsOrganizationModalOpen(true);
  }

  function findOrganizationForInvite(organizationNumber: string) {
    const normalizedNumber = organizationNumber.trim().toLowerCase();
    return organizations.find((organization) => (
      normalizedNumber && organization.organizationNumber?.trim().toLowerCase() === normalizedNumber
    ));
  }

  function relationshipSides(targetOrganization?: Organization) {
    if (!authProfile?.organizationId) return null;
    if (currentRole === "contractor_admin") {
      return {
        farmerOrganizationId: targetOrganization?.kind === "farmer" ? targetOrganization.id : "",
        contractorOrganizationId: authProfile.organizationId,
      };
    }
    return {
      farmerOrganizationId: authProfile.organizationId,
      contractorOrganizationId: targetOrganization?.kind === "contractor" ? targetOrganization.id : "",
    };
  }

  function collaborationInvitationMessage(targetName: string, message?: string) {
    const appUrl = `${window.location.origin}/admin`;
    return t("collaboration.invitationMailBody", {
      appUrl,
      fromOrganization: ownOrganization?.name ?? t("masterData.noOrganizationAssigned"),
      targetOrganization: targetName || "-",
      message: message?.trim() || t("collaboration.noInvitationMessage"),
    });
  }

  function openCollaborationInvitationMail(email?: string, targetName?: string, message?: string) {
    if (!email?.trim()) return;
    const subject = encodeURIComponent(t("collaboration.invitationMailSubject", {
      fromOrganization: ownOrganization?.name ?? "Farm-Manager",
    }));
    const body = encodeURIComponent(collaborationInvitationMessage(targetName ?? email, message));
    window.location.href = `mailto:${encodeURIComponent(email.trim())}?subject=${subject}&body=${body}`;
  }

  function inviteCollaboration() {
    if (!authProfile?.organizationId || !collaborationInviteForm.organizationNumber.trim()) return;
    const matchedOrganization = findOrganizationForInvite(collaborationInviteForm.organizationNumber);
    const sides = relationshipSides(matchedOrganization);
    const contactType: ExternalContactType = currentRole === "contractor_admin" ? "customer" : "contractor";
    const now = new Date().toISOString();
    const invitationEmail = collaborationInviteForm.email.trim() || matchedOrganization?.email || "";

    const existingContact = ownExternalContacts.find((contact) => (
      contact.organizationNumber?.trim().toLowerCase() === collaborationInviteForm.organizationNumber.trim().toLowerCase()
    ));
    const contactPatch: ExternalContact = {
      id: existingContact?.id ?? createLocalId("local"),
      organizationId: authProfile.organizationId,
      contactType,
      companyName: collaborationInviteForm.companyName.trim() || matchedOrganization?.name || collaborationInviteForm.organizationNumber.trim(),
      contactPerson: existingContact?.contactPerson,
      email: invitationEmail,
      phone: existingContact?.phone,
      address: existingContact?.address,
      organizationNumber: collaborationInviteForm.organizationNumber.trim() || matchedOrganization?.organizationNumber,
      linkedOrganizationId: matchedOrganization?.id,
      status: matchedOrganization ? "invited" : "invited",
      notes: collaborationInviteForm.message.trim(),
      createdAt: existingContact?.createdAt ?? now,
      updatedAt: now,
    };
    if (existingContact) updateExternalContact(existingContact.id, contactPatch);
    else addExternalContact(contactPatch);

    if (matchedOrganization && sides?.farmerOrganizationId && sides.contractorOrganizationId) {
      const existingRelationship = ownOrganizationRelationships.find((relationship) => (
        relationship.farmerOrganizationId === sides.farmerOrganizationId
        && relationship.contractorOrganizationId === sides.contractorOrganizationId
      ));
      const relationship: OrganizationRelationship = {
        id: existingRelationship?.id ?? createLocalId("local"),
        farmerOrganizationId: sides.farmerOrganizationId,
        contractorOrganizationId: sides.contractorOrganizationId,
        status: "invited",
        invitedBy: authProfile.id,
        invitationEmail,
        invitationMessage: collaborationInviteForm.message.trim(),
        createdAt: existingRelationship?.createdAt ?? now,
      };
      if (existingRelationship) updateOrganizationRelationship(existingRelationship.id, relationship);
      else addOrganizationRelationship(relationship);
    }

    openCollaborationInvitationMail(
      invitationEmail,
      contactPatch.companyName,
      collaborationInviteForm.message,
    );
    setCollaborationInviteForm({ email: "", organizationNumber: "", companyName: "", message: "" });
  }

  function acceptRelationship(relationship: OrganizationRelationship) {
    updateOrganizationRelationship(relationship.id, {
      status: "active",
      acceptedBy: authProfile?.id,
      acceptedAt: new Date().toISOString(),
      endedAt: undefined,
    });
  }

  function setRelationshipStatus(relationship: OrganizationRelationship, status: OrganizationRelationship["status"]) {
    updateOrganizationRelationship(relationship.id, {
      status,
      endedAt: status === "ended" || status === "blocked" ? new Date().toISOString() : undefined,
    });
  }

  function openOrganizationEditor(organization: Organization) {
    setCreatingOrganization(false);
    setOrganizationLoginPassword("");
    setOrganizationLoginStatus("");
    setSelectedOrganizationId(organization.id);
    setOrganizationForm({
      name: organization.name,
      kind: organization.kind,
      organizationNumber: organization.organizationNumber ?? "",
      address: organization.address ?? "",
      street: organization.street ?? "",
      country: organization.country ?? "",
      postalCode: organization.postalCode ?? "",
      city: organization.city ?? "",
      phone: organization.phone ?? "",
      mobile: organization.mobile ?? "",
      email: organization.email ?? "",
      website: organization.website ?? "",
      vatId: organization.vatId ?? "",
      logoUrl: organization.logoUrl ?? "",
      defaultLanguage: organization.defaultLanguage ?? "",
      billingDetails: organization.billingDetails ?? "",
      customerNumber: organization.customerNumber ?? "",
      supplierCategory: organization.supplierCategory ?? "",
      notes: stripMarkerBlock(organization.notes, customerConditionsMarker),
      customerConditionRows: conditionsToRows(customerConditionsFromOrganization(organization)),
      contacts: organization.contacts ?? [],
    });
    setIsOrganizationModalOpen(true);
  }

  function addOrganizationContact() {
    setOrganizationForm((current) => ({
      ...current,
      contacts: [
        ...current.contacts,
        { id: createLocalId("local"), name: "", role: "", phone: "", mobile: "", email: "", sms: "", notes: "" },
      ],
    }));
  }

  function updateOrganizationContact(contactId: string, patch: Partial<NonNullable<Organization["contacts"]>[number]>) {
    setOrganizationForm((current) => ({
      ...current,
      contacts: current.contacts.map((contact) => (contact.id === contactId ? { ...contact, ...patch } : contact)),
    }));
  }

  function removeOrganizationContact(contactId: string) {
    setOrganizationForm((current) => ({
      ...current,
      contacts: current.contacts.filter((contact) => contact.id !== contactId),
    }));
  }

  function uploadOrganizationLogo(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setOrganizationForm((current) => ({ ...current, logoUrl: typeof reader.result === "string" ? reader.result : current.logoUrl }));
    });
    reader.readAsDataURL(file);
  }

  function saveOrganization() {
    if (!organizationForm.name.trim()) return;
    const payload = organizationPayloadFromForm();
    if (creatingOrganization) {
      const id = createLocalId("local");
      addOrganization({ id, ...payload });
      setSelectedOrganizationId(id);
    } else if (selectedOrganization) {
      updateOrganization(selectedOrganization.id, payload);
    }
    setIsOrganizationModalOpen(false);
    setCreatingOrganization(false);
  }

  function archiveSelectedOrganization() {
    if (!selectedOrganization) return;
    archiveOrganization(selectedOrganization.id);
    setIsOrganizationModalOpen(false);
    setCreatingOrganization(false);
  }

  function requestDeleteSelectedOrganization() {
    if (!selectedOrganization) return;
    setDeleteOrganizationConfirm({ id: selectedOrganization.id, name: selectedOrganization.name });
  }

  function confirmDeleteSelectedOrganization() {
    if (!deleteOrganizationConfirm) return;
    deleteOrganization(deleteOrganizationConfirm.id);
    setDeleteOrganizationConfirm(null);
    setIsOrganizationModalOpen(false);
    setCreatingOrganization(false);
  }

  function setCategoryArchiveView(group: MasterResourceGroup, archived: boolean) {
    setMasterArchiveView((current) => ({ ...current, [group]: archived }));
  }

  function toggleDispatchCustomerFilter(customerId: string) {
    setSelectedDispatchCustomerIds((current) => (
      current.includes(customerId)
        ? current.filter((id) => id !== customerId)
        : [...current, customerId]
    ));
  }

  function assignResources(subtask: Subtask) {
    onUpdateSubtask(subtask.id, {
      activeDriverIds: assignDriverId ? Array.from(new Set([...subtask.activeDriverIds, assignDriverId])) : subtask.activeDriverIds,
      activeVehicleIds: assignVehicleId ? Array.from(new Set([...(subtask.activeVehicleIds ?? []), assignVehicleId])) : subtask.activeVehicleIds,
      activeImplementIds: assignImplementId ? Array.from(new Set([...(subtask.activeImplementIds ?? []), assignImplementId])) : subtask.activeImplementIds,
      status: "reserviert",
    });
  }

  function assignResourcesToGroup(group: DispatchGroup) {
    group.subtasks.forEach((subtask) => {
      const job = jobs.find((item) => item.id === subtask.jobId);
      onUpdateSubtask(subtask.id, {
        activeDriverIds: assignDriverId ? Array.from(new Set([...subtask.activeDriverIds, assignDriverId])) : subtask.activeDriverIds,
        activeVehicleIds: assignVehicleId ? Array.from(new Set([...(subtask.activeVehicleIds ?? []), assignVehicleId])) : subtask.activeVehicleIds,
        activeImplementIds: assignImplementId ? Array.from(new Set([...(subtask.activeImplementIds ?? []), assignImplementId])) : subtask.activeImplementIds,
        plannedCrews: subtask.plannedCrews ?? job?.plannedCrews ?? 1,
        status: subtask.status === "offen" ? "reserviert" : subtask.status,
      });
    });
  }

  function releaseResources(subtask: Subtask) {
    const ownDriverIds = subtask.activeDriverIds.filter((driverId) => canControlResource(getDriverByAssignmentId(driverId)));
    const ownVehicleIds = (subtask.activeVehicleIds ?? []).filter((vehicleId) => canControlResource(allVehicles.find((vehicle) => vehicle.id === vehicleId)));
    const ownImplementIds = (subtask.activeImplementIds ?? []).filter((implementId) => canControlResource(allImplementsList.find((implement) => implement.id === implementId)));
    const remainingDriverIds = subtask.activeDriverIds.filter((driverId) => !ownDriverIds.includes(driverId));
    const remainingVehicleIds = (subtask.activeVehicleIds ?? []).filter((vehicleId) => !ownVehicleIds.includes(vehicleId));
    const remainingImplementIds = (subtask.activeImplementIds ?? []).filter((implementId) => !ownImplementIds.includes(implementId));
    onUpdateSubtask(subtask.id, {
      activeDriverIds: remainingDriverIds,
      activeVehicleIds: remainingVehicleIds,
      activeImplementIds: remainingImplementIds,
      status: remainingDriverIds.length === 0 && remainingVehicleIds.length === 0 && remainingImplementIds.length === 0 ? "offen" : subtask.status,
      progress: remainingDriverIds.length === 0 && remainingVehicleIds.length === 0 && remainingImplementIds.length === 0 ? 0 : subtask.progress,
    });
  }

  function releaseDriverLogins(subtask: Subtask) {
    const controlledDriverIds = subtask.activeDriverIds.filter((driverId) => canControlResource(getDriverByAssignmentId(driverId)));
    const controlledDriverNames = new Set(controlledDriverIds
      .map((driverId) => getDriverByAssignmentId(driverId)?.name.trim().toLowerCase())
      .filter((name): name is string => Boolean(name)));
    const activeDriverIds = subtask.activeDriverIds.filter((driverId) => !controlledDriverIds.includes(driverId));
    const activeDriverNames = (subtask.activeDriverNames ?? []).filter((name) => !controlledDriverNames.has(name.trim().toLowerCase()));
    const hasRemainingDriver = activeDriverIds.length > 0 || activeDriverNames.length > 0;
    const status: Subtask["status"] = hasRemainingDriver
      ? subtask.status
      : subtask.status === "in Arbeit"
        ? "pausiert"
        : subtask.status === "reserviert"
          ? "offen"
          : subtask.status;

    onUpdateSubtask(subtask.id, {
      activeDriverIds,
      activeDriverNames,
      status,
    });
  }

  function setSubtaskCrews(subtask: Subtask, plannedCrews: number) {
    onUpdateSubtask(subtask.id, { plannedCrews });
  }

  function handleDragStart(event: DragEvent, kind: DragResourceKind, id: string, sourceSubtaskId?: string, sourceSubtaskIds?: string[]) {
    event.stopPropagation();
    const resource = kind === "driver"
      ? allDrivers.find((item) => item.id === id || item.profileId === id)
      : kind === "vehicle"
        ? allVehicles.find((item) => item.id === id)
        : allImplementsList.find((item) => item.id === id);
    if (!canControlResource(resource)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("application/x-farm-manager-resource", JSON.stringify({ kind, id, sourceSubtaskId, sourceSubtaskIds }));
    event.dataTransfer.effectAllowed = "move";
  }

  function handleJobDragStart(event: DragEvent, job: Job, sourceOffsetDays: number) {
    if (!onUpdateJob) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("application/x-farm-manager-job", JSON.stringify({ jobId: job.id, sourceOffsetDays: parseJobDateOffset(job) ?? sourceOffsetDays }));
    event.dataTransfer.effectAllowed = "move";
  }

  function timeWindowWithDate(timeWindow: string, isoDate: string) {
    if (/\d{4}-\d{2}-\d{2}/.test(timeWindow)) return timeWindow.replace(/\d{4}-\d{2}-\d{2}/, isoDate);
    return isoDate;
  }

  function originalPlanNotice(job: Job, targetDate: string) {
    const existingNotes = job.notes?.trim() ?? "";
    const alreadyHasNotice = existingNotes.includes(t("contractor.originalPlanDateLabel"));
    if (alreadyHasNotice) return existingNotes;
    const notice = t("contractor.originalPlanDateNotice", {
      date: job.timeWindow || "-",
      movedTo: targetDate,
    });
    return [existingNotes, notice].filter(Boolean).join("\n");
  }

  function hasAssignedResources(jobSubtasks: Subtask[]) {
    return jobSubtasks.some((subtask) => (
      subtask.activeDriverIds.length > 0
      || (subtask.activeDriverNames ?? []).length > 0
      || (subtask.activeVehicleIds ?? []).length > 0
      || (subtask.activeImplementIds ?? []).length > 0
    ));
  }

  function applyMoveJobToDay(job: Job, targetOffsetDays: number, keepResources: boolean) {
    if (!onUpdateJob) return;
    const targetDate = formatIsoDateForOffset(targetOffsetDays);
    const targetTimeWindow = timeWindowWithDate(job.timeWindow, targetDate);
    if (targetTimeWindow === job.timeWindow) return;
    const jobSubtasks = subtasks.filter((subtask) => subtask.jobId === job.id);

    onUpdateJob(job.id, {
      timeWindow: targetTimeWindow,
      notes: originalPlanNotice(job, targetDate),
    });

    if (!keepResources) {
      jobSubtasks.forEach((subtask) => {
        const shouldResetStatus = subtask.status === "reserviert" || subtask.status === "in Arbeit" || subtask.status === "pausiert";
        onUpdateSubtask(subtask.id, {
          activeDriverIds: [],
          activeDriverNames: [],
          activeVehicleIds: [],
          activeImplementIds: [],
          status: shouldResetStatus ? "offen" : subtask.status,
          progress: shouldResetStatus ? 0 : subtask.progress,
        });
      });
    }
  }

  function moveJobToDay(job: Job, targetOffsetDays: number) {
    const jobSubtasks = subtasks.filter((subtask) => subtask.jobId === job.id);
    if (hasAssignedResources(jobSubtasks)) {
      setMoveResourceConfirm({ jobId: job.id, targetOffsetDays });
      return;
    }
    applyMoveJobToDay(job, targetOffsetDays, true);
  }

  function confirmMoveJobWithResources(keepResources: boolean) {
    if (!moveResourceConfirm) return;
    const job = jobs.find((item) => item.id === moveResourceConfirm.jobId);
    if (job) applyMoveJobToDay(job, moveResourceConfirm.targetOffsetDays, keepResources);
    setMoveResourceConfirm(null);
  }

  function handleDropJobOnDay(event: DragEvent, targetOffsetDays: number) {
    const raw = event.dataTransfer.getData("application/x-farm-manager-job");
    if (!raw) return false;
    event.preventDefault();
    event.stopPropagation();
    let payload: DragJobPayload;
    try {
      payload = JSON.parse(raw) as DragJobPayload;
    } catch {
      return true;
    }
    if (payload.sourceOffsetDays === targetOffsetDays) return true;
    const job = jobs.find((item) => item.id === payload.jobId);
    if (job) moveJobToDay(job, targetOffsetDays);
    return true;
  }

  function handleGroupResourceDragStart(event: DragEvent, kind: DragResourceKind, id: string, group: DispatchGroup) {
    handleDragStart(event, kind, id, undefined, group.subtasks.map((subtask) => subtask.id));
  }

  function findStandardVehicle(driverId: string) {
    const driver = allDrivers.find((item) => item.id === driverId || item.profileId === driverId);
    if (!driver?.vehicle) return undefined;
    return allVehicles.find((vehicle) => vehicle.name.trim().toLowerCase() === driver.vehicle.trim().toLowerCase() && vehicle.status !== "wartung");
  }

  function assignDriverToSubtask(driverId: string, subtask: Subtask, vehicleId?: string) {
    onUpdateSubtask(subtask.id, {
      activeDriverIds: Array.from(new Set([...subtask.activeDriverIds, driverId])),
      activeVehicleIds: vehicleId
        ? Array.from(new Set([...(subtask.activeVehicleIds ?? []), vehicleId]))
        : subtask.activeVehicleIds,
      status: subtask.status === "offen" ? "reserviert" : subtask.status,
    });
  }

  function planDriverWithStandardVehicleSetting(driverId: string, subtask: Subtask) {
    const standardVehicle = findStandardVehicle(driverId);
    if (!standardVehicle || standardVehicleMode === "none") {
      assignDriverToSubtask(driverId, subtask);
      return;
    }
    if (standardVehicleMode === "automatic") {
      assignDriverToSubtask(driverId, subtask, standardVehicle.id);
      return;
    }
    setStandardVehicleChoice({ driverId, subtaskId: subtask.id });
  }

  function confirmStandardVehicleChoice(vehicleId?: string) {
    if (!standardVehicleChoice) return;
    const subtask = subtasks.find((item) => item.id === standardVehicleChoice.subtaskId);
    if (subtask) assignDriverToSubtask(standardVehicleChoice.driverId, subtask, vehicleId);
    setStandardVehicleChoice(null);
  }

  function confirmWorkTimeOverride() {
    if (!workTimeOverride) return;
    const subtask = subtasks.find((item) => item.id === workTimeOverride.subtaskId);
    if (subtask) planDriverWithStandardVehicleSetting(workTimeOverride.driverId, subtask);
    setWorkTimeOverride(null);
  }

  function handleDropResource(event: DragEvent, subtask: Subtask) {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/x-farm-manager-resource");
    if (!raw) return;
    const resource = JSON.parse(raw) as DragResourcePayload;
    const droppedResource = resource.kind === "driver"
      ? allDrivers.find((item) => item.id === resource.id || item.profileId === resource.id)
      : resource.kind === "vehicle"
        ? allVehicles.find((item) => item.id === resource.id)
        : allImplementsList.find((item) => item.id === resource.id);
    if (!canControlResource(droppedResource)) return;
    if (resource.kind === "driver") {
      if (subtask.activeDriverIds.includes(resource.id)) return;
      const driver = drivers.find((item) => item.id === resource.id);
      const planned = getDriverPlannedHours(resource.id);
      const added = getSubtaskEstimatedHours(subtask) / Math.max(subtask.activeDriverIds.length + 1, 1);
      const max = driver?.maxDailyHours ?? 8;
      if (planned + added > max) {
        setWorkTimeOverride({ driverId: resource.id, subtaskId: subtask.id, planned, added, max });
        return;
      }
      planDriverWithStandardVehicleSetting(resource.id, subtask);
    }
    if (resource.kind === "vehicle") {
      onUpdateSubtask(subtask.id, {
        activeVehicleIds: Array.from(new Set([...(subtask.activeVehicleIds ?? []), resource.id])),
        status: subtask.status === "offen" ? "reserviert" : subtask.status,
      });
    }
    if (resource.kind === "implement") {
      onUpdateSubtask(subtask.id, {
        activeImplementIds: Array.from(new Set([...(subtask.activeImplementIds ?? []), resource.id])),
        status: subtask.status === "offen" ? "reserviert" : subtask.status,
      });
    }
  }

  function handleDropResourceOnGroup(event: DragEvent, group: DispatchGroup) {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/x-farm-manager-resource");
    if (!raw) return;
    const resource = JSON.parse(raw) as DragResourcePayload;
    const droppedResource = resource.kind === "driver"
      ? allDrivers.find((item) => item.id === resource.id || item.profileId === resource.id)
      : resource.kind === "vehicle"
        ? allVehicles.find((item) => item.id === resource.id)
        : allImplementsList.find((item) => item.id === resource.id);
    if (!canControlResource(droppedResource)) return;
    group.subtasks.forEach((subtask) => {
      if (resource.kind === "driver") {
        onUpdateSubtask(subtask.id, {
          activeDriverIds: Array.from(new Set([...subtask.activeDriverIds, resource.id])),
          status: subtask.status === "offen" ? "reserviert" : subtask.status,
        });
      }
      if (resource.kind === "vehicle") {
        onUpdateSubtask(subtask.id, {
          activeVehicleIds: Array.from(new Set([...(subtask.activeVehicleIds ?? []), resource.id])),
          status: subtask.status === "offen" ? "reserviert" : subtask.status,
        });
      }
      if (resource.kind === "implement") {
        onUpdateSubtask(subtask.id, {
          activeImplementIds: Array.from(new Set([...(subtask.activeImplementIds ?? []), resource.id])),
          status: subtask.status === "offen" ? "reserviert" : subtask.status,
        });
      }
    });
  }

  function handleReturnResource(event: DragEvent) {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/x-farm-manager-resource");
    if (!raw) return;
    const resource = JSON.parse(raw) as DragResourcePayload;
    const returnedResource = resource.kind === "driver"
      ? allDrivers.find((item) => item.id === resource.id || item.profileId === resource.id)
      : resource.kind === "vehicle"
        ? allVehicles.find((item) => item.id === resource.id)
        : allImplementsList.find((item) => item.id === resource.id);
    if (!canControlResource(returnedResource)) return;
    const sourceIds = resource.sourceSubtaskIds?.length ? resource.sourceSubtaskIds : resource.sourceSubtaskId ? [resource.sourceSubtaskId] : [];
    sourceIds.forEach((sourceId) => {
      const source = subtasks.find((subtask) => subtask.id === sourceId);
      if (!source) return;
      const patch: Partial<Subtask> = {};
      if (resource.kind === "driver") patch.activeDriverIds = source.activeDriverIds.filter((id) => id !== resource.id);
      if (resource.kind === "vehicle") patch.activeVehicleIds = (source.activeVehicleIds ?? []).filter((id) => id !== resource.id);
      if (resource.kind === "implement") patch.activeImplementIds = (source.activeImplementIds ?? []).filter((id) => id !== resource.id);
      const remainingDrivers = patch.activeDriverIds ?? source.activeDriverIds;
      const remainingVehicles = patch.activeVehicleIds ?? source.activeVehicleIds ?? [];
      const remainingImplements = patch.activeImplementIds ?? source.activeImplementIds ?? [];
      if (remainingDrivers.length === 0 && remainingVehicles.length === 0 && remainingImplements.length === 0) {
        patch.status = "offen";
      }
      onUpdateSubtask(source.id, patch);
    });
  }

  function openResourceMasterData(groupId: string, resourceId: string) {
    if (variant === "dispatch") {
      if (groupId === "drivers") {
        const driver = drivers.find((item) => item.id === resourceId);
        setActiveSection("masterData");
        setActiveMasterGroup("personnel");
        if (driver) openDriverEditor(driver);
      }
      if (groupId === "vehicles") {
        const vehicle = vehicles.find((item) => item.id === resourceId);
        setActiveSection("masterData");
        setActiveMasterGroup("vehicles");
        if (vehicle) openVehicleEditor(vehicle);
      }
      if (groupId === "implements") {
        const implement = implementsList.find((item) => item.id === resourceId);
        setActiveSection("masterData");
        setActiveMasterGroup("implements");
        if (implement) openImplementEditor(implement);
      }
      return;
    }
    if (groupId === "drivers") {
      setSelectedDriverId(resourceId);
      setActiveMasterGroup("personnel");
      onOpenMasterData?.({ group: "personnel", id: resourceId });
    }
    if (groupId === "vehicles") {
      setSelectedVehicleId(resourceId);
      setActiveMasterGroup("vehicles");
      onOpenMasterData?.({ group: "vehicles", id: resourceId });
    }
    if (groupId === "implements") {
      setSelectedImplementId(resourceId);
      setActiveMasterGroup("implements");
      onOpenMasterData?.({ group: "implements", id: resourceId });
    }
    if (!onOpenMasterData) setActiveSection("masterData");
  }

  const resourceGroups = [
    {
      id: "drivers",
      title: t("contractor.personnelResources"),
      resources: drivers.map((driver) => {
        const subtask = subtasks.find((item) => item.activeDriverIds.includes(driver.id));
        return {
          id: driver.id,
          kind: t("masterData.personnel"),
          name: driver.name,
          detail: driver.mobile || driver.vehicle,
          resourceType: driver.resourceType ?? t("masterData.personnel"),
          operationType: driver.operationType ?? "",
          subtask,
        };
      }),
    },
    {
      id: "vehicles",
      title: t("contractor.vehicleResources"),
      resources: vehicles.map((vehicle) => {
        const subtask = subtasks.find((item) => item.activeVehicleIds?.includes(vehicle.id));
        return {
          id: vehicle.id,
          kind: t("terms.vehicle"),
          name: vehicle.name,
          detail: vehicle.type,
          resourceType: vehicle.resourceType ?? vehicle.type,
          operationType: vehicle.operationType ?? "",
          subtask,
        };
      }),
    },
    {
      id: "implements",
      title: t("contractor.implementResources"),
      resources: implementsList.map((implement) => {
        const subtask = subtasks.find((item) => item.activeImplementIds?.includes(implement.id));
        return {
          id: implement.id,
          kind: t("terms.implement"),
          name: implement.name,
          detail: implement.type,
          resourceType: implement.resourceType ?? implement.type,
          operationType: implement.operationType ?? "",
          subtask,
        };
      }),
    },
  ];
  const resourceCount = resourceGroups.reduce((sum, group) => sum + group.resources.length, 0);
  const assignedVehicleIds = new Set(subtasks.flatMap((subtask) => subtask.activeVehicleIds ?? []));
  const standardVehicleOptions = vehicles.filter((vehicle) => vehicle.status !== "wartung");
  const standardVehicleChoiceDriver = standardVehicleChoice ? drivers.find((driver) => driver.id === standardVehicleChoice.driverId) : undefined;
  const standardVehicleChoiceVehicle = standardVehicleChoice ? findStandardVehicle(standardVehicleChoice.driverId) : undefined;
  const alternativeVehicleChoices = vehicles.filter((vehicle) => (
    vehicle.status !== "wartung"
    && vehicle.id !== standardVehicleChoiceVehicle?.id
    && !assignedVehicleIds.has(vehicle.id)
  ));

  function getSubtaskEstimatedHours(subtask: Subtask) {
    const task = getTask(subtask, jobs);
    const field = fields.find((item) => item.id === subtask.fieldId);
    return subtask.estimatedHours
      ?? (task?.timePerHa && field ? task.timePerHa * field.areaHa : undefined)
      ?? task?.estimatedHours
      ?? jobs.find((job) => job.id === subtask.jobId)?.estimatedHours
      ?? 0;
  }

  function getDriverPlannedHours(driverId: string) {
    return subtasks
      .filter((subtask) => subtask.activeDriverIds.includes(driverId) && subtask.status !== "erledigt")
      .reduce((sum, subtask) => {
        const divisor = Math.max(subtask.activeDriverIds.length, 1);
        return sum + getSubtaskEstimatedHours(subtask) / divisor;
      }, 0);
  }

  function formatHours(value: number) {
    return `${value.toFixed(2)} h`;
  }

  const visibleCalendarDays = useMemo(() => Array.from({ length: calendarColumnCount }, (_, index) => {
    const offsetDays = calendarStartOffset + index;
    return {
      id: `day-${offsetDays}`,
      label: getRelativeDayLabel(offsetDays, t),
      offsetDays,
    };
  }), [calendarStartOffset, t]);

  function getSubtaskCalendarOffset(subtask: Subtask, fallbackIndex: number) {
    const job = jobs.find((item) => item.id === subtask.jobId);
    return parseJobDateOffset(job) ?? fallbackIndex % calendarColumnCount;
  }

  function getDaySubtasks(offsetDays: number) {
    return subtasks.filter((subtask, index) => getSubtaskCalendarOffset(subtask, index) === offsetDays);
  }

  function orderSubtasksByRoute(groupSubtasks: Subtask[]) {
    const remaining = [...groupSubtasks];
    const ordered: Subtask[] = [];
    let currentPoint = remaining
      .map((subtask) => fields.find((field) => field.id === subtask.fieldId)?.accessPoint)
      .filter(Boolean)[0];

    while (remaining.length > 0) {
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      remaining.forEach((subtask, index) => {
        const field = fields.find((item) => item.id === subtask.fieldId);
        const candidateDistance = distanceKm(currentPoint, field?.accessPoint);
        if (candidateDistance < bestDistance) {
          bestDistance = candidateDistance;
          bestIndex = index;
        }
      });
      const [next] = remaining.splice(bestIndex, 1);
      ordered.push(next);
      currentPoint = fields.find((field) => field.id === next.fieldId)?.accessPoint ?? currentPoint;
    }

    return ordered;
  }

  const dispatchGroups = useMemo(() => {
    const groups = new Map<string, DispatchGroup>();
    filteredDispatchSubtasks.forEach((subtask, index) => {
	      const job = jobs.find((item) => item.id === subtask.jobId);
	      const task = getTask(subtask, jobs);
	      const offsetDays = getSubtaskCalendarOffset(subtask, index);
	      const taskName = task?.name ?? subtask.taskId;
	      const key = dispatchGroupingLevel === "job_task"
	        ? `${subtask.jobId}-${taskName.trim().toLowerCase()}-${offsetDays}`
	        : `${taskName.trim().toLowerCase()}-${offsetDays}`;
	      const field = fields.find((item) => item.id === subtask.fieldId);
	      const existing = groups.get(key);
	      const nextSubtasks = [...(existing?.subtasks ?? []), subtask];
	      groups.set(key, {
	        id: key,
	        job: existing?.job ?? job,
	        jobIds: Array.from(new Set([...(existing?.jobIds ?? []), subtask.jobId])),
	        customerNames: Array.from(new Set([...(existing?.customerNames ?? []), job?.customer].filter(Boolean) as string[])),
	        taskName,
	        taskId: taskName,
	        offsetDays,
	        subtasks: nextSubtasks,
        totalAreaHa: (existing?.totalAreaHa ?? 0) + (field?.areaHa ?? 0),
        totalHours: (existing?.totalHours ?? 0) + getSubtaskEstimatedHours(subtask),
        completedCount: (existing?.completedCount ?? 0) + (subtask.status === "erledigt" ? 1 : 0),
        orderedSubtasks: [],
      });
    });
    const baseGroups = Array.from(groups.values()).map((group) => ({
      ...group,
      orderedSubtasks: orderSubtasksByRoute(group.subtasks),
    }));

    return baseGroups.flatMap((group) => {
      const assignedDriverIds = Array.from(new Set(group.subtasks.flatMap((subtask) => subtask.activeDriverIds)));
      const dailyCapacityHours = assignedDriverIds.reduce((sum, driverId) => {
        const driver = getDriverByAssignmentId(driverId);
        return sum + (driver?.maxDailyHours ?? 8);
      }, 0);
      if (dailyCapacityHours <= 0 || group.totalHours <= dailyCapacityHours) return [group];

      const segments: DispatchGroup[] = [];
      let currentSubtasks: Subtask[] = [];
      let currentAreaHa = 0;
      let currentHours = 0;
      let currentCompletedCount = 0;
      let currentOffsetDays = group.offsetDays;

      const pushSegment = () => {
        if (currentSubtasks.length === 0) return;
        segments.push({
          ...group,
          id: `${group.id}-segment-${segments.length}`,
          offsetDays: currentOffsetDays,
	          sourceOffsetDays: group.offsetDays,
	          isRollover: currentOffsetDays > group.offsetDays,
	          jobIds: Array.from(new Set(currentSubtasks.map((subtask) => subtask.jobId))),
	          customerNames: Array.from(new Set(currentSubtasks.map((subtask) => jobs.find((job) => job.id === subtask.jobId)?.customer).filter(Boolean) as string[])),
	          subtasks: currentSubtasks,
          totalAreaHa: currentAreaHa,
          totalHours: currentHours,
          completedCount: currentCompletedCount,
          orderedSubtasks: currentSubtasks,
        });
      };

      group.orderedSubtasks.forEach((subtask) => {
        const field = fields.find((item) => item.id === subtask.fieldId);
        const subtaskHours = getSubtaskEstimatedHours(subtask);
        const shouldStartNextDay = currentSubtasks.length > 0 && currentHours + subtaskHours > dailyCapacityHours;
        if (shouldStartNextDay) {
          pushSegment();
          currentSubtasks = [];
          currentAreaHa = 0;
          currentHours = 0;
          currentCompletedCount = 0;
          currentOffsetDays += 1;
        }
        currentSubtasks.push(subtask);
        currentAreaHa += field?.areaHa ?? 0;
        currentHours += subtaskHours;
        currentCompletedCount += subtask.status === "erledigt" ? 1 : 0;
      });
      pushSegment();

      return segments;
    });
  }, [dispatchGroupingLevel, fields, filteredDispatchSubtasks, jobs, subtasks]);

  function getAvailableResourcesForDay(offsetDays: number) {
    const daySubtasks = getDaySubtasks(offsetDays);
    const dayDriverIds = new Set(daySubtasks.flatMap((subtask) => subtask.activeDriverIds));
    const dayVehicleIds = new Set(daySubtasks.flatMap((subtask) => subtask.activeVehicleIds ?? []));
    const dayImplementIds = new Set(daySubtasks.flatMap((subtask) => subtask.activeImplementIds ?? []));
    return {
      drivers: drivers.filter((driver) => !dayDriverIds.has(driver.id) && !dayDriverIds.has(driver.profileId ?? "")),
      vehicles: vehicles.filter((vehicle) => !dayVehicleIds.has(vehicle.id) && vehicle.status !== "wartung"),
      implementsList: implementsList.filter((implement) => !dayImplementIds.has(implement.id) && implement.status !== "wartung"),
    };
  }

  function getOrganizationResources(organizationId: string) {
    const organizationDrivers = allDrivers.filter((driver) => driver.organizationId === organizationId);
    const organizationVehicles = allVehicles.filter((vehicle) => vehicle.organizationId === organizationId);
    const organizationImplements = allImplementsList.filter((implement) => implement.organizationId === organizationId);
    return {
      drivers: organizationDrivers,
      vehicles: organizationVehicles,
      implementsList: organizationImplements,
      total: organizationDrivers.length + organizationVehicles.length + organizationImplements.length,
    };
  }

  function toggleCollaborationState(organizationId: string) {
    setInactiveCollaborationIds((current) => {
      const next = new Set(current);
      if (next.has(organizationId)) {
        next.delete(organizationId);
      } else {
        next.add(organizationId);
      }
      window.localStorage.setItem(inactiveCollaborationsStorageKey, JSON.stringify(Array.from(next)));
      return next;
    });
  }

  function relationshipPartner(relationship: OrganizationRelationship) {
    const partnerId = relationship.farmerOrganizationId === authProfile?.organizationId
      ? relationship.contractorOrganizationId
      : relationship.farmerOrganizationId;
    return organizations.find((organization) => organization.id === partnerId);
  }

  function renderRelationshipRow(relationship: OrganizationRelationship) {
    const partner = relationshipPartner(relationship);
    const requestedAt = relationship.createdAt
      ? new Date(relationship.createdAt).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" })
      : "-";
    const isInviteSender = Boolean(relationship.invitedBy && relationship.invitedBy === authProfile?.id);
    return (
      <article className="collaboration-row" key={relationship.id}>
        <div>
          <strong>{partner?.name ?? relationship.invitationEmail ?? "-"}</strong>
          <span>{partner ? t("masterData.connectedFarmManagerBusiness") : t("masterData.externalContactPending")}</span>
          {relationship.status === "invited" && <small>{t("collaboration.requestedAt", { time: requestedAt })}</small>}
          <small>{relationship.invitationEmail || partner?.email || "-"}</small>
          {relationship.invitationMessage && <small>{relationship.invitationMessage}</small>}
        </div>
        <div className="collaboration-actions">
          {relationship.status === "invited" && isInviteSender && (
            <>
              <button className="secondary-action" onClick={() => openCollaborationInvitationMail(relationship.invitationEmail || partner?.email, partner?.name, relationship.invitationMessage)} type="button">
                <Mail size={16} /> {t("collaboration.openInvitationMail")}
              </button>
              <button className="danger-action" onClick={() => deleteOrganizationRelationship(relationship.id)} type="button">
                <Trash2 size={16} /> {t("collaboration.deleteRequest")}
              </button>
            </>
          )}
          {relationship.status === "invited" && !isInviteSender && (
            <>
              <button className="secondary-action" onClick={() => openCollaborationInvitationMail(relationship.invitationEmail || partner?.email, partner?.name, relationship.invitationMessage)} type="button">
                <Mail size={16} /> {t("collaboration.openInvitationMail")}
              </button>
              <button className="primary-action" onClick={() => acceptRelationship(relationship)} type="button">
                <CheckCircle size={16} /> {t("collaboration.acceptInvitation")}
              </button>
              <button className="danger-action" onClick={() => setRelationshipStatus(relationship, "ended")} type="button">
                <X size={16} /> {t("collaboration.declineInvitation")}
              </button>
            </>
          )}
          {relationship.status === "active" && (
            <>
              <button className="secondary-action" onClick={() => setRelationshipStatus(relationship, "paused")} type="button">
                {t("collaboration.pause")}
              </button>
              <button className="danger-action" onClick={() => setRelationshipStatus(relationship, "ended")} type="button">
                {t("collaboration.end")}
              </button>
            </>
          )}
          {(relationship.status === "paused" || relationship.status === "ended") && (
            <button className="primary-action" onClick={() => acceptRelationship(relationship)} type="button">
              {t("collaboration.activate")}
            </button>
          )}
        </div>
      </article>
    );
  }

  function renderOpenExternalInviteRow(contact: ExternalContact) {
    const requestedAt = contact.createdAt
      ? new Date(contact.createdAt).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" })
      : "-";
    return (
      <article className="collaboration-row" key={contact.id}>
        <div>
          <strong>{contact.companyName}</strong>
          <span>{t("masterData.externalContactPending")}</span>
          <small>{t("collaboration.requestedAt", { time: requestedAt })}</small>
          <small>{[contact.email, contact.organizationNumber, contact.phone].filter(Boolean).join(" · ") || "-"}</small>
          {contact.notes && <small>{contact.notes}</small>}
        </div>
        <div className="collaboration-actions">
          <button className="secondary-action" onClick={() => openCollaborationInvitationMail(contact.email, contact.companyName, contact.notes)} type="button">
            <Mail size={16} /> {t("collaboration.openInvitationMail")}
          </button>
          <button className="danger-action" onClick={() => updateExternalContact(contact.id, { status: "archived" })} type="button">
            <Trash2 size={16} /> {t("collaboration.deleteRequest")}
          </button>
        </div>
      </article>
    );
  }

  function renderCollaborationDirectory() {
    return (
      <div className="collaboration-directory">
        <section className="collaboration-panel">
          <div className="section-heading compact-heading">
            <h3>{currentRole === "contractor_admin" ? t("collaboration.inviteCustomer") : t("collaboration.inviteContractor")}</h3>
          </div>
          <div className="form-row modal-form-row">
            <label>{t("masterData.email")}<input value={collaborationInviteForm.email} onChange={(event) => setCollaborationInviteForm((current) => ({ ...current, email: event.target.value }))} /></label>
            <label>{t("masterData.organizationNumber")}<input value={collaborationInviteForm.organizationNumber} onChange={(event) => setCollaborationInviteForm((current) => ({ ...current, organizationNumber: event.target.value }))} /></label>
            <label>{t("masterData.organizationName")}<input value={collaborationInviteForm.companyName} onChange={(event) => setCollaborationInviteForm((current) => ({ ...current, companyName: event.target.value }))} /></label>
            <label>{t("collaboration.message")}<input value={collaborationInviteForm.message} onChange={(event) => setCollaborationInviteForm((current) => ({ ...current, message: event.target.value }))} /></label>
          </div>
          <button className="primary-action" onClick={inviteCollaboration} type="button">
            <Mail size={16} /> {t("collaboration.sendInvitation")}
          </button>
        </section>

        <section className="collaboration-panel">
          <h3>{t("collaboration.active")} · {activeRelationships.length}</h3>
          {activeRelationships.length ? activeRelationships.map(renderRelationshipRow) : <p className="permission-note">{t("collaboration.emptyActive")}</p>}
        </section>
        <section className="collaboration-panel">
          <h3>{t("collaboration.openRequests")} · {invitedRelationships.length + openExternalInvites.length}</h3>
          {invitedRelationships.length + openExternalInvites.length
            ? (
                <>
                  {invitedRelationships.map(renderRelationshipRow)}
                  {openExternalInvites.map(renderOpenExternalInviteRow)}
                </>
              )
            : <p className="permission-note">{t("collaboration.emptyOpenRequests")}</p>}
        </section>
        <section className="collaboration-panel">
          <h3>{t("collaboration.ended")} · {endedRelationships.length}</h3>
          {endedRelationships.length ? endedRelationships.map(renderRelationshipRow) : <p className="permission-note">{t("collaboration.emptyEnded")}</p>}
        </section>
      </div>
    );
  }

  function renderOrganizationCard(organization: Organization) {
    const resources = getOrganizationResources(organization.id);
    const isOwnOrganization = organization.id === authProfile?.organizationId;
    const isCollaborationView = organizationDirectoryMode === "collaboration";
    const isInactiveCollaboration = inactiveCollaborationIds.has(organization.id);
    return (
      <article className="resource-card organization-card" key={organization.id}>
        <div className="organization-card-main">
          <div>
            <span className="resource-kind">
              {t(`masterData.organizationKinds.${organization.kind}`)}
            </span>
            <strong>{organization.name}</strong>
            <span>{formatOrganizationAddress(organization) || t("masterData.noAddress")}</span>
            <small>{[organization.phone, organization.mobile, organization.email].filter(Boolean).join(" · ") || t("masterData.noContactData")}</small>
            <small>{t("masterData.contactsCount", { count: organization.contacts?.length ?? 0 })}</small>
            <small>{isOwnOrganization ? t("masterData.ownOrganization") : t("masterData.linkedFarmManagerOrganization")}</small>
            {organizationDirectoryMode === "contacts" && <small>{t("masterData.contactCategory")}: {t(`masterData.organizationKinds.${organization.kind}`)}{organization.supplierCategory ? ` · ${organization.supplierCategory}` : ""}</small>}
            {isCollaborationView && <small>{isInactiveCollaboration ? t("masterData.collaborationInactive") : t("masterData.collaborationActive")}</small>}
          </div>
          {isCollaborationView && !isOwnOrganization && (
            <button
              className={isInactiveCollaboration ? "secondary-action" : "danger-action"}
              onClick={() => toggleCollaborationState(organization.id)}
              type="button"
            >
              {isInactiveCollaboration ? t("masterData.activateCollaboration") : t("masterData.deactivateCollaboration")}
            </button>
          )}
          {canEditOrganizationRecord(organization) && !isCollaborationView && (
            <button className="secondary-action" onClick={() => openOrganizationEditor(organization)} type="button">
              {t("masterData.editOrganization")}
            </button>
          )}
        </div>
        {isOwnOrganization && (
          <details className="organization-resource-details">
            <summary>
              <span>{t("masterData.assignedResources")}</span>
              <strong>{resources.total}</strong>
            </summary>
            {resources.total === 0 ? (
              <p className="permission-note">{t("masterData.noAssignedResources")}</p>
            ) : (
              <div className="organization-resource-list">
                <div>
                  <strong>{t("masterData.personnel")}</strong>
                  {resources.drivers.length === 0 ? <span>{t("masterData.noAssignedResources")}</span> : resources.drivers.map((driver) => (
                    <span key={driver.id}>{driver.name}{driver.vehicle ? ` · ${driver.vehicle}` : ""}</span>
                  ))}
                </div>
                <div>
                  <strong>{t("contractor.vehicleResources")}</strong>
                  {resources.vehicles.length === 0 ? <span>{t("masterData.noAssignedResources")}</span> : resources.vehicles.map((vehicle) => (
                    <span key={vehicle.id}>{[vehicle.name, vehicle.licensePlate, vehicle.type].filter(Boolean).join(" · ")}</span>
                  ))}
                </div>
                <div>
                  <strong>{t("contractor.implementResources")}</strong>
                  {resources.implementsList.length === 0 ? <span>{t("masterData.noAssignedResources")}</span> : resources.implementsList.map((implement) => (
                    <span key={implement.id}>{[implement.name, implement.type, implement.operationType].filter(Boolean).join(" · ")}</span>
                  ))}
                </div>
              </div>
            )}
          </details>
        )}
      </article>
    );
  }

  function organizationOperationalCounts(organizationId: string) {
    const organizationFieldIds = new Set(fields.filter((field) => field.organizationId === organizationId).map((field) => field.id));
    const organizationJobs = jobs.filter((job) => (
      job.farmerOrganizationId === organizationId
      || job.contractorOrganizationId === organizationId
      || job.fieldIds.some((fieldId) => organizationFieldIds.has(fieldId))
    ));
    const jobIds = new Set(organizationJobs.map((job) => job.id));
    return {
      jobs: organizationJobs.length,
      subtasks: subtasks.filter((subtask) => jobIds.has(subtask.jobId)).length,
    };
  }

  async function confirmResetOrganizationOperationalData() {
    if (!resetOrganizationConfirm || !onResetOrganizationOperationalData) return;
    const organization = resetOrganizationConfirm;
    const result = await onResetOrganizationOperationalData(organization.id);
    setResetOrganizationConfirm(null);
    setResetOrganizationStatus(result.ok
      ? t("contractor.resetOrganizationSuccess", {
          organization: organization.name,
          jobs: result.deletedJobs,
          subtasks: result.deletedSubtasks,
        })
      : t("contractor.resetOrganizationError", {
          organization: organization.name,
          error: result.error ?? t("contractor.resetOrganizationUnknownError"),
        }));
  }

  return (
    <section className="view-stack">
      {activeSection === "masterOverview" && (
        <div className="panel master-overview-page">
          <div className="section-heading">
            <div>
              <h2>{t("masterDataOverview.title")}</h2>
              <strong className="master-organization-label">{t("masterData.masterDataFor", { organization: ownOrganization?.name ?? t("masterData.noOrganizationAssigned") })}</strong>
              <p>{t("masterDataOverview.subtitle")}</p>
            </div>
            <span className="master-overview-total">
              {activeOrganizations.length + drivers.length + vehicles.length + implementsList.length + activeTaskTemplates.length + activeJobTypes.length}
            </span>
          </div>

          <div className="master-overview-groups">
            {masterDataOverviewGroups.map((group) => (
              <section className="master-overview-group" key={group.id}>
                <div className="master-overview-grid">
                  {group.items.map((item) => (
                    <button className="master-overview-tile" key={item.id} onClick={item.onClick} type="button">
                      <span className="master-overview-icon">{item.icon}</span>
                      <span className="master-overview-copy">
                        <strong>{item.title}</strong>
                        <small>{item.description}</small>
                      </span>
                      <span className="master-overview-counts">
                        <span>{t("masterDataOverview.activeCount", { count: item.activeCount })}</span>
                        <small>{item.secondaryCountLabel ?? t("masterDataOverview.archivedCount", { count: item.archivedCount })}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {activeSection === "overview" && (
        <>
          <div className="panel live-location-panel">
            <div className="section-heading">
              <h2><RadioTower size={20} /> {t("liveLocation.dispatchTitle")}</h2>
              <div className="live-location-actions">
                <span>{t("liveLocation.activeLocations", { count: driverLocations.length })}</span>
                <button className="secondary-action compact-action" onClick={onRefreshDriverLocations} type="button">
                  <RotateCcw size={15} /> {t("liveLocation.refresh")}
                </button>
              </div>
            </div>
            {driverLocations.length > 0 ? (
              <>
                <LiveLocationMap fields={fields} jobs={jobs} locations={driverLocations} subtasks={subtasks} />
                {problemsPanel}
                <div className="live-location-list">
                  <div className="live-location-row live-location-header">
                    <span>{t("terms.driver")}</span>
                    <span>{t("terms.job")}</span>
                    <span>{t("terms.field")}</span>
                    <span>{t("terms.status")}</span>
                  </div>
                  {driverLocations.map((location) => {
                    const field = fields.find((item) => item.id === location.fieldId);
                    const subtask = subtasks.find((item) => item.id === location.subtaskId);
                    const job = jobs.find((item) => item.id === subtask?.jobId);
                    const task = subtask ? getTask(subtask, jobs) : undefined;
                    const jobStatusLabel = subtask && subtask.status !== "offen"
                      ? t(`status.${subtask.status}`)
                      : subtask && location.status === "unterwegs"
                        ? t("status.reserviert")
                        : t(`liveLocation.status.${location.status}`);
                    return (
                      <div className="live-location-row" key={location.id}>
                        <div>
                          <strong>{location.driverName}</strong>
                          <small>{location.vehicleName}</small>
                        </div>
                        <div>
                          <span>{t("jobs.jobNumberShort")}: {job?.jobNumber ?? "-"}</span>
                          <small>{job?.title ?? t("terms.job")}</small>
                        </div>
                        <div>
                          <span>{field?.name ?? t("liveLocation.noField")}</span>
                          <small>{task?.name ?? t("terms.subtask")}</small>
                        </div>
                        <div>
                          <span>{t(`liveLocation.status.${location.status}`)}</span>
                          <small>{t("liveLocation.jobStatus")}: {jobStatusLabel}</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="permission-note">{t("liveLocation.noLocations")}</p>
            )}
          </div>

          <div className="panel dispatch-calendar-panel">
            <div className="section-heading">
              <h2><CalendarDays size={20} /> {t("contractor.dispatchCalendar")}</h2>
              <div className="calendar-controls">
                <button className="secondary-action" onClick={() => setCalendarStartOffset((current) => current - 7)} type="button">{t("contractor.previousWeek")}</button>
                <button className="secondary-action" onClick={() => setCalendarStartOffset((current) => current - 1)} type="button">{t("contractor.previousDay")}</button>
                <button className="primary-action" onClick={() => setCalendarStartOffset(0)} type="button">{t("contractor.today")}</button>
                <button className="secondary-action" onClick={() => setCalendarStartOffset((current) => current + 1)} type="button">{t("contractor.nextDay")}</button>
                <button className="secondary-action" onClick={() => setCalendarStartOffset((current) => current + 7)} type="button">{t("contractor.nextWeek")}</button>
              </div>
            </div>
            <p className="dispatch-calendar-hint">{t("contractor.dragDropHint")}</p>
            <div className="segmented-control dispatch-mode-toggle">
              <button className={dispatchCalendarMode === "single" ? "active" : ""} onClick={() => setDispatchCalendarMode("single")} type="button">
                {t("contractor.singleDispatchMode")}
              </button>
              <button className={dispatchCalendarMode === "grouped" ? "active" : ""} onClick={() => setDispatchCalendarMode("grouped")} type="button">
                {t("contractor.groupedDispatchMode")}
              </button>
            </div>
            <div className="dispatch-customer-filter">
              <strong>{t("contractor.customerFilter")}</strong>
              <button className={selectedDispatchCustomerIds.length === 0 ? "active" : ""} onClick={() => setSelectedDispatchCustomerIds([])} type="button">
                {t("contractor.allCustomers")}
              </button>
              {dispatchCustomerOptions.map((customer) => (
                <label className={selectedDispatchCustomerSet.has(customer.id) ? "active" : ""} key={customer.id}>
                  <input
                    checked={selectedDispatchCustomerSet.has(customer.id)}
                    onChange={() => toggleDispatchCustomerFilter(customer.id)}
                    type="checkbox"
                  />
                  <span>{customer.name}</span>
                </label>
              ))}
            </div>
            <div className="dispatch-calendar-layout">
              <aside className="dispatch-resource-pool" onDragOver={(event) => event.preventDefault()} onDrop={handleReturnResource}>
                <div className="return-drop-zone">
                  <strong>{t("contractor.returnResources")}</strong>
                  <span>{t("contractor.returnResourcesHint")}</span>
                </div>
                <strong>{t("contractor.availableByDay")}</strong>
                {visibleCalendarDays.map((day) => {
                  const dayResources = getAvailableResourcesForDay(day.offsetDays);
                  const dayCount = dayResources.drivers.length + dayResources.vehicles.length + dayResources.implementsList.length;
                  return (
                    <details className="day-resource-group" key={day.id} open={day.offsetDays === 0}>
                      <summary>
                        <span>{day.label}</span>
                        <small>{formatCalendarDate(day.offsetDays, i18n.language)} · {dayCount} {t("contractor.availableShort")}</small>
                      </summary>
                      <div className="resource-pool-group compact-resource-group">
                        <strong>{t("masterData.personnel")}</strong>
                        {dayResources.drivers.length === 0 && <span className="empty-resource-note">{t("contractor.noAvailableResources")}</span>}
                        {dayResources.drivers.map((driver) => {
                          const planned = getDriverPlannedHours(driver.id);
                          const maxHours = driver.maxDailyHours ?? 8;
                          const open = Math.max(maxHours - planned, 0);
                          const timeTitle = t("contractor.timePlannedOpen", { planned: formatHours(planned), open: formatHours(open), max: formatHours(maxHours) });
                          return (
                            <button draggable className="drag-resource" key={driver.id} onDragStart={(event) => handleDragStart(event, "driver", driver.id)} title={timeTitle} type="button">
                              <span>{driver.name}</span>
                              <small>{driver.operationType || driver.vehicle}</small>
                            </button>
                          );
                        })}
                      </div>
                      <div className="resource-pool-group compact-resource-group">
                        <strong>{t("contractor.vehicleResources")}</strong>
                        {dayResources.vehicles.length === 0 && <span className="empty-resource-note">{t("contractor.noAvailableResources")}</span>}
                        {dayResources.vehicles.map((vehicle) => (
                          <button draggable className="drag-resource" key={vehicle.id} onDragStart={(event) => handleDragStart(event, "vehicle", vehicle.id)} type="button">
                            <span>{vehicle.name}</span>
                            <small>{[vehicle.licensePlate, vehicle.operationType || vehicle.type].filter(Boolean).join(" · ")}</small>
                          </button>
                        ))}
                      </div>
                      <div className="resource-pool-group compact-resource-group">
                        <strong>{t("contractor.implementResources")}</strong>
                        {dayResources.implementsList.length === 0 && <span className="empty-resource-note">{t("contractor.noAvailableResources")}</span>}
                        {dayResources.implementsList.map((implement) => (
                          <button draggable className="drag-resource" key={implement.id} onDragStart={(event) => handleDragStart(event, "implement", implement.id)} type="button">
                            <span>{implement.name}</span>
                            <small>{implement.operationType || implement.type}</small>
                          </button>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </aside>
              {dispatchCalendarMode === "single" ? (
              <div className="dispatch-calendar-grid">
                {visibleCalendarDays.map((day) => (
                  <div
                    className="dispatch-day-column"
                    key={day.id}
                    onDragOver={(event) => {
                      if (event.dataTransfer.types.includes("application/x-farm-manager-job")) event.preventDefault();
                    }}
                    onDrop={(event) => { handleDropJobOnDay(event, day.offsetDays); }}
                  >
                    <div className="dispatch-day-heading">
                      <div className="dispatch-day-title">
                        <strong>{day.label}</strong>
                        <small>{formatCalendarDate(day.offsetDays, i18n.language)} · {t("contractor.calendarWeek", { week: getIsoWeek(day.offsetDays) })}</small>
                      </div>
                      <span>{filteredDispatchSubtasks.filter((subtask, index) => getSubtaskCalendarOffset(subtask, index) === day.offsetDays).length}</span>
                    </div>
                    {sortOpenBeforeDone(filteredDispatchSubtasks.filter((subtask, index) => getSubtaskCalendarOffset(subtask, index) === day.offsetDays))
                      .map((subtask, sortedIndex, daySubtasks) => {
                        const task = getTask(subtask, jobs);
                        const job = jobs.find((item) => item.id === subtask.jobId);
                      const activeVehicles = getDisplayVehiclesForSubtask(subtask);
                      const activeImplements = (subtask.activeImplementIds ?? []).map((id) => allImplementsList.find((implement) => implement.id === id)).filter(Boolean) as Implement[];
                      const startsDoneGroup = subtask.status === "erledigt" && daySubtasks[sortedIndex - 1]?.status !== "erledigt";
                      const estimated = getSubtaskEstimatedHours(subtask);
                        return (
                          <article
                            className={`dispatch-calendar-card ${subtask.status === "erledigt" ? "completed-item" : ""} ${startsDoneGroup ? "completed-section-start" : ""}`}
                            draggable={Boolean(job && onUpdateJob)}
                            key={subtask.id}
                            onDragStart={(event) => {
                              if (job) handleJobDragStart(event, job, getSubtaskCalendarOffset(subtask, sortedIndex));
                            }}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              if (handleDropJobOnDay(event, day.offsetDays)) return;
                              handleDropResource(event, subtask);
                            }}
                          >
                            <div className="dispatch-task-title">
                              <button className="dispatch-task-open" disabled={!job} onClick={() => job && onOpenJob?.(job.id)} type="button">
                                <strong>{job?.jobNumber ? `${job.jobNumber} · ${job.title}` : job?.title ?? task?.name}</strong>
                              </button>
                              {task?.name && job?.title !== task.name && <small>{task.name}</small>}
                              <small>{t("contractor.customer")}: {job?.customer ?? "-"}</small>
                              <span><FieldName id={subtask.fieldId} /></span>
                            </div>
                            <StatusBadge status={subtask.status} />
                            <small className="dispatch-card-meta">
                              {t("contractor.estimatedDuration", { hours: formatHours(estimated) })}
                              {" · "}
                              {t("contractor.resourceNeedShort", {
                                crews: subtask.plannedCrews ?? job?.plannedCrews ?? 1,
                                drivers: task?.requiredDrivers ?? 0,
                                vehicles: task?.requiredVehicles ?? task?.maxVehicles ?? 0,
                                implements: task?.requiredImplements ?? 0,
                              })}
                            </small>
                            <div className="calendar-assignment-row">
                              <div className="calendar-chip-row">
                                {subtask.activeDriverIds.length === 0 ? <span>{t("report.open")}</span> : subtask.activeDriverIds.map((id) => {
                                  const driver = getDriverByAssignmentId(id);
                                  const planned = getDriverPlannedHours(id);
                                  const maxHours = driver?.maxDailyHours ?? 8;
                                  const open = Math.max(maxHours - planned, 0);
                                  const canMove = canControlResource(driver);
                                  const timeTitle = `${getDriverTooltip(id)} · ${t("contractor.timePlannedOpen", { planned: formatHours(planned), open: formatHours(open), max: formatHours(maxHours) })}`;
                                  return (
                                    <button draggable={canMove} className="assigned-resource-chip" key={id} onDragStart={(event) => handleDragStart(event, "driver", id, subtask.id)} title={timeTitle} type="button">{getDriverLabel(id)}</button>
                                  );
                                })}
                              </div>
                              <div className="calendar-chip-row">
                                {activeVehicles.length === 0 ? <span>{t("contractor.noVehicleAssigned")}</span> : activeVehicles.map((vehicle) => (
                                  <button draggable={canControlResource(vehicle)} className="assigned-resource-chip" key={vehicle.id} onDragStart={(event) => handleDragStart(event, "vehicle", vehicle.id, subtask.id)} title={[vehicle.name, vehicle.licensePlate, vehicle.type].filter(Boolean).join(" · ")} type="button">{vehicle.name}</button>
                                ))}
                              </div>
                              <div className="calendar-chip-row">
                                {activeImplements.length === 0 ? <span>{t("contractor.noImplementAssigned")}</span> : activeImplements.map((implement) => (
                                  <button draggable={canControlResource(implement)} className="assigned-resource-chip" key={implement.id} onDragStart={(event) => handleDragStart(event, "implement", implement.id, subtask.id)} title={[implement.name, implement.type].filter(Boolean).join(" · ")} type="button">{implement.name}</button>
                                ))}
                              </div>
                            </div>
                            {subtask.activeDriverIds.some((driverId) => canControlResource(getDriverByAssignmentId(driverId))) && (
                              <div className="dispatch-actions compact-dispatch-actions">
                                <button onClick={() => releaseDriverLogins(subtask)} type="button">
                                  <UserMinus size={15} /> {t("actions.releaseDriverLogins")}
                                </button>
                              </div>
                            )}
                          </article>
                        );
                      })}
                  </div>
                ))}
              </div>
              ) : (
              <div className="dispatch-calendar-grid grouped-dispatch-grid">
                {visibleCalendarDays.map((day) => {
                  const dayGroups = dispatchGroups.filter((group) => group.offsetDays === day.offsetDays);
                  return (
                    <div
                      className="dispatch-day-column"
                      key={day.id}
                      onDragOver={(event) => {
                        if (event.dataTransfer.types.includes("application/x-farm-manager-job")) event.preventDefault();
                      }}
                      onDrop={(event) => { handleDropJobOnDay(event, day.offsetDays); }}
                    >
                      <div className="dispatch-day-heading">
                        <div className="dispatch-day-title">
                          <strong>{day.label}</strong>
                          <small>{formatCalendarDate(day.offsetDays, i18n.language)} · {t("contractor.calendarWeek", { week: getIsoWeek(day.offsetDays) })}</small>
                        </div>
                        <span>{dayGroups.length}</span>
                      </div>
		                      {dayGroups.map((group) => {
		                        const completionPercent = group.subtasks.length > 0 ? Math.round((group.completedCount / group.subtasks.length) * 100) : 0;
		                        const assignedDriverIds = Array.from(new Set(group.subtasks.flatMap((subtask) => subtask.activeDriverIds)));
		                        const assignedVehicleIds = Array.from(new Set(group.subtasks.flatMap((subtask) => subtask.activeVehicleIds ?? [])));
		                        const assignedImplementIds = Array.from(new Set(group.subtasks.flatMap((subtask) => subtask.activeImplementIds ?? [])));
		                        const estimatedCapacity = assignedDriverIds.length > 0
		                          ? assignedDriverIds.reduce((sum, driverId) => sum + (getDriverByAssignmentId(driverId)?.maxDailyHours ?? 8), 0)
		                          : group.totalHours;
	                        const overflowHours = Math.max(group.totalHours - estimatedCapacity, 0);
	                        return (
                          <article
                            className="dispatch-group-card"
                            key={group.id}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              if (handleDropJobOnDay(event, day.offsetDays)) return;
                              handleDropResourceOnGroup(event, group);
                            }}
	                          >
	                            <div className="dispatch-group-title">
	                              <strong>{group.taskName}</strong>
		                              <small>
		                                {t("contractor.groupedJobs", { count: group.jobIds.length })}
		                                {" · "}
		                                {t("contractor.groupedFields", { count: group.subtasks.length })}
		                              </small>
		                              <small>{group.customerNames.join(", ") || "-"}</small>
	                              {group.isRollover && <small className="dispatch-rollover-label">{t("contractor.rolledFromPreviousDay")}</small>}
	                            </div>
                            <div className="dispatch-group-metrics">
                              <span>{group.totalAreaHa.toFixed(2)} ha</span>
                              <span>{formatHours(group.totalHours)}</span>
                              <span>{group.completedCount}/{group.subtasks.length}</span>
                            </div>
                            <ProgressBar value={completionPercent} />
	                            {overflowHours > 0 && (
	                              <p className="dispatch-overflow-note">{t("contractor.dispatchCarryover", { hours: formatHours(overflowHours) })}</p>
	                            )}
	                            <div className="dispatch-group-resources">
	                              <div className="calendar-chip-row">
	                                {assignedDriverIds.length === 0 ? <span>{t("contractor.noDriverAssigned")}</span> : assignedDriverIds.map((id) => {
	                                  const driver = getDriverByAssignmentId(id);
	                                  const canMove = canControlResource(driver);
	                                  return (
	                                    <button
	                                      className="assigned-resource-chip"
	                                      draggable={canMove}
	                                      key={id}
	                                      onDragStart={(event) => handleGroupResourceDragStart(event, "driver", id, group)}
	                                      title={getDriverTooltip(id)}
	                                      type="button"
	                                    >
	                                      {getDriverLabel(id)}
	                                    </button>
	                                  );
	                                })}
	                              </div>
	                              <div className="calendar-chip-row">
	                                {assignedVehicleIds.length === 0 ? <span>{t("contractor.noVehicleAssigned")}</span> : assignedVehicleIds.map((id) => {
	                                  const vehicle = allVehicles.find((item) => item.id === id);
	                                  if (!vehicle) return null;
	                                  return (
	                                    <button
	                                      className="assigned-resource-chip"
	                                      draggable={canControlResource(vehicle)}
	                                      key={id}
	                                      onDragStart={(event) => handleGroupResourceDragStart(event, "vehicle", id, group)}
	                                      title={[vehicle.name, vehicle.licensePlate, vehicle.type].filter(Boolean).join(" · ")}
	                                      type="button"
	                                    >
	                                      {vehicle.name}
	                                    </button>
	                                  );
	                                })}
	                              </div>
	                              <div className="calendar-chip-row">
	                                {assignedImplementIds.length === 0 ? <span>{t("contractor.noImplementAssigned")}</span> : assignedImplementIds.map((id) => {
	                                  const implement = allImplementsList.find((item) => item.id === id);
	                                  if (!implement) return null;
	                                  return (
	                                    <button
	                                      className="assigned-resource-chip"
	                                      draggable={canControlResource(implement)}
	                                      key={id}
	                                      onDragStart={(event) => handleGroupResourceDragStart(event, "implement", id, group)}
	                                      title={[implement.name, implement.type].filter(Boolean).join(" · ")}
	                                      type="button"
	                                    >
	                                      {implement.name}
	                                    </button>
	                                  );
	                                })}
	                              </div>
	                            </div>
	                            <div className="dispatch-group-actions">
	                              <button onClick={() => assignResourcesToGroup(group)} type="button">
	                                <UserPlus size={15} /> {t("contractor.assignGroup")}
                              </button>
                              {group.subtasks.some((subtask) => subtask.activeDriverIds.some((driverId) => canControlResource(getDriverByAssignmentId(driverId)))) && (
                                <button onClick={() => group.subtasks.forEach((subtask) => releaseDriverLogins(subtask))} type="button">
                                  <UserMinus size={15} /> {t("actions.releaseDriverLogins")}
                                </button>
                              )}
                            </div>
                            <details className="dispatch-route-details">
                              <summary>{t("contractor.optimizedOrder")}</summary>
                              <ol>
	                                {group.orderedSubtasks.map((subtask) => (
	                                  <li key={subtask.id}>
	                                    <button className="dispatch-route-job-link" onClick={() => onOpenJob?.(subtask.jobId)} type="button">
	                                      {jobs.find((job) => job.id === subtask.jobId)?.jobNumber ?? subtask.jobId}
	                                    </button>
	                                    <FieldName id={subtask.fieldId} />
	                                    <span>{subtask.status !== "erledigt" ? t(`status.${subtask.status}`) : t("status.erledigt")}</span>
	                                  </li>
                                ))}
                              </ol>
                            </details>
                          </article>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          </div>

        </>
      )}

      {activeSection === "masterData" && (
        <div className="panel resource-master-page">
          <div className="section-heading master-detail-heading">
            <h2>
              {activeMasterGroup === "personnel" && t("masterData.personnel")}
              {activeMasterGroup === "vehicles" && t("contractor.vehicleResources")}
              {activeMasterGroup === "implements" && t("contractor.implementResources")}
            </h2>
            <div className="modal-actions">
              <span className="master-overview-total">
                {activeMasterGroup === "personnel" && masterDrivers.length}
                {activeMasterGroup === "vehicles" && masterVehicles.length}
                {activeMasterGroup === "implements" && masterImplements.length}
              </span>
              <button className="secondary-action icon-action" onClick={() => setActiveSection("masterOverview")} type="button">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="resource-master-toolbar">
            <div className="segmented-control archive-toggle category-archive-toggle">
              <button className={!showArchivedMasterData ? "active" : ""} onClick={() => setCategoryArchiveView(activeMasterGroup, false)} type="button">
                {t("archive.active")} · {activeMasterGroup === "personnel" && drivers.length}{activeMasterGroup === "vehicles" && vehicles.length}{activeMasterGroup === "implements" && implementsList.length}
              </button>
              <button className={showArchivedMasterData ? "active" : ""} onClick={() => setCategoryArchiveView(activeMasterGroup, true)} type="button">
                {t("archive.archived")} · {activeMasterGroup === "personnel" && archivedDrivers.length}{activeMasterGroup === "vehicles" && archivedVehicles.length}{activeMasterGroup === "implements" && archivedImplements.length}
              </button>
            </div>
            <div className="modal-actions">
              {canManageResources && !showArchivedMasterData && (
                <button className="primary-action" onClick={() => { setCreatingResourceGroup(null); setIsResourceModalOpen(true); }} type="button">
                  <Save size={16} /> {t("masterData.editSelected")}
                </button>
              )}
              {canManageResources && !showArchivedMasterData && activeMasterGroup === "personnel" && (
                <button className="secondary-action" onClick={createDriver} type="button"><Plus size={16} /> {t("masterData.newDriver")}</button>
              )}
              {canManageResources && !showArchivedMasterData && activeMasterGroup === "vehicles" && (
                <button className="secondary-action" onClick={createVehicle} type="button"><Plus size={16} /> {t("masterData.newVehicle")}</button>
              )}
              {canManageResources && !showArchivedMasterData && activeMasterGroup === "implements" && (
                <button className="secondary-action" onClick={createImplement} type="button"><Plus size={16} /> {t("masterData.newImplement")}</button>
              )}
            </div>
          </div>
          {!permissions.canEditDrivers && <p className="permission-note">{t("permissions.driversReadOnly")}</p>}

          {activeMasterGroup === "personnel" && (
            <button className="personnel-planning-panel personnel-planning-button" onClick={() => setIsPayrollModalOpen(true)} type="button">
              <div>
                <strong>{t("masterData.personnelTimeVacationTitle")}</strong>
                <span>{t("masterData.personnelTimeVacationHint")}</span>
              </div>
              <div className="personnel-planning-metrics">
                <span>{t("masterData.totalWorkTime")}: <b>{formatDurationMinutes(personnelTotalWorkMinutes)}</b></span>
                <span>{t("masterData.totalPauseTime")}: <b>{formatDurationMinutes(personnelTotalPauseMinutes)}</b></span>
                <span>{t("masterData.openVacationRequests")}: <b>{personnelOpenVacationRequestCount}</b></span>
              </div>
            </button>
          )}

          <div className="resource-master-layout resource-master-layout-single">
            <div className="resource-list-panel resource-list-panel-full">
              {activeMasterGroup === "personnel" && masterDrivers.map((driver) => (
                (() => {
                  const standardVehicle = allVehicles.find((vehicle) => vehicle.name === driver.vehicle);
                  const vehicleLabel = standardVehicle
                    ? [standardVehicle.name, standardVehicle.licensePlate, standardVehicle.type].filter(Boolean).join(" · ")
                    : driver.vehicle || t("masterData.noDefaultVehicle");
                  const personnelSummary = personnelTimeSummary.find((row) => row.driverId === driver.id);
                  return (
                    <button className={driver.id === selectedDriver?.id ? "roster-item personnel-roster-item active" : "roster-item personnel-roster-item"} key={driver.id} onClick={() => openDriverEditor(driver)} type="button">
                      <div>
                        <strong>{driver.name}</strong>
                        <span>{t(`masterData.employeeTypes.${driver.employeeType ?? "field"}`)} · {driver.mobile || t("masterData.mobile")} · {driver.licenseClasses?.join(", ") || t("masterData.licenseClasses")}</span>
                        <span>{t("masterData.defaultVehicle")}: {vehicleLabel}</span>
                        <span>{activeOrganizations.find((organization) => organization.id === driver.organizationId)?.name ?? t("masterData.noOrganizationAssigned")} · {t(`masterData.driverVisibility.${normalizedDriverJobVisibility(driver)}`)}</span>
                      </div>
                      <div className="personnel-roster-metrics">
                        <span>{t("masterData.workTimeShort")} <b>{formatDurationMinutes(personnelSummary?.workMinutes ?? 0)}</b></span>
                        <span>{t("masterData.pauseShort")} <b>{formatDurationMinutes(personnelSummary?.pauseMinutes ?? 0)}</b></span>
                        <span>{t("masterData.vacationRemainingShort")} <b>{personnelSummary?.vacationRemaining ?? 0}</b></span>
                        <span>{t("masterData.openRequestsShort")} <b>{personnelSummary?.openVacationRequests ?? 0}</b></span>
                      </div>
                    </button>
                  );
                })()
              ))}
              {activeMasterGroup === "vehicles" && masterVehicles.map((vehicle) => (
                <button className={vehicle.id === selectedVehicle?.id ? "roster-item active" : "roster-item"} key={vehicle.id} onClick={() => openVehicleEditor(vehicle)} type="button">
                  <strong><Truck size={16} /> {vehicle.name}</strong>
                  <span>{[vehicle.licensePlate, vehicle.resourceType ?? vehicle.type, vehicle.operationType || t(`resourceStatus.${vehicle.status}`)].filter(Boolean).join(" · ")}</span>
                </button>
              ))}
              {activeMasterGroup === "implements" && masterImplements.map((implement) => (
                <button className={implement.id === selectedImplement?.id ? "roster-item active" : "roster-item"} key={implement.id} onClick={() => openImplementEditor(implement)} type="button">
                  <strong><Settings size={16} /> {implement.name}</strong>
                  <span>{implement.resourceType ?? implement.type} · {implement.operationType || t(`resourceStatus.${implement.status}`)}</span>
                </button>
              ))}
            </div>
          </div>
          {isPayrollModalOpen && (
            <div className="modal-backdrop" role="presentation">
              <div className="resource-modal payroll-modal" role="dialog" aria-modal="true" aria-labelledby="payroll-modal-title">
                <div className="section-heading">
                  <div>
                    <h2 id="payroll-modal-title">{t("masterData.payrollPreparation")}</h2>
                    <p>{t("masterData.payrollPreparationHint")}</p>
                  </div>
                  <button className="secondary-action icon-action" onClick={() => setIsPayrollModalOpen(false)} type="button">
                    <X size={18} />
                  </button>
                </div>
                <div className="payroll-toolbar">
                  <label>
                    {t("masterData.payrollMonth")}
                    <select value={payrollMonth} onChange={(event) => setPayrollMonth(event.target.value)}>
                      {payrollMonthOptions.map((month) => (
                        <option key={month} value={month}>{new Date(`${month}-01T00:00:00`).toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</option>
                      ))}
                    </select>
                  </label>
                  <div className="personnel-planning-metrics">
                    <span>{t("masterData.totalWorkTime")}: <b>{formatDurationMinutes(payrollTotals.workMinutes)}</b></span>
                    <span>{t("masterData.totalPauseTime")}: <b>{formatDurationMinutes(payrollTotals.pauseMinutes)}</b></span>
                    <span>{t("masterData.openVacationRequests")}: <b>{payrollTotals.openVacationRequests}</b></span>
                  </div>
                  <button className="primary-action" onClick={() => printPayrollReport()} type="button">
                    <ClipboardList size={16} /> {t("masterData.exportAllPayrollPdf")}
                  </button>
                  <button className="secondary-action" onClick={() => lockPayrollMonthForDriver()} type="button">
                    <CheckCircle size={16} /> {t("masterData.lockPayrollMonth")}
                  </button>
                </div>
                <div className="payroll-employee-list">
                  {payrollSummaries.map((row) => (
                    <section className="payroll-employee-card" key={row.driver.id}>
                      <div className="payroll-employee-head">
                        <div>
                          <strong>{row.driver.name}</strong>
                          <span>{[row.driver.mobile, row.driver.email].filter(Boolean).join(" · ") || t("masterData.personnel")}</span>
                        </div>
                        <div className="personnel-planning-metrics">
                          <span>{t("masterData.totalWorkTime")}: <b>{formatDurationMinutes(row.workMinutes)}</b></span>
                          <span>{t("masterData.totalPauseTime")}: <b>{formatDurationMinutes(row.pauseMinutes)}</b></span>
                          <span>{t("masterData.interruptionTime")}: <b>{formatDurationMinutes(row.interruptionMinutes)}</b></span>
                        </div>
                        <button className="secondary-action compact-action" onClick={() => printPayrollReport(row.driver.id)} type="button">
                          {t("masterData.exportEmployeePayrollPdf")}
                        </button>
                        <button className="secondary-action compact-action" onClick={() => lockPayrollMonthForDriver(row.driver.id)} type="button">
                          {t("masterData.lockEmployeeMonth")}
                        </button>
                      </div>
                      {row.vacationRequests.length > 0 && (
                        <div className="personnel-request-list payroll-vacation-list">
                          {row.vacationRequests.map((request) => (
                            <div className={`personnel-request-row ${request.status}`} key={request.id}>
                              <div>
                                <strong>{request.from}-{request.to} · {request.days} {t("driver.days")}</strong>
                                <span>{t(`driver.vacationStatus.${request.status}`)}{request.note ? ` · ${request.note}` : ""}</span>
                              </div>
                              {request.status === "requested" && (
                                <div className="vacation-decision-actions">
                                  <button className="secondary-action compact-action" onClick={() => handleVacationDecision(request, "rejected")} type="button">{t("vacationApproval.reject")}</button>
                                  <button className="primary-action compact-action" onClick={() => handleVacationDecision(request, "approved")} type="button">{t("vacationApproval.approve")}</button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {row.entries.length > 0 ? (
                        <div className="payroll-time-table">
                          {row.entries.map((entry) => (
                            <div className={`payroll-time-row ${entry.kind} ${entry.lockedAt ? "locked" : "unlocked"}`} key={entry.id}>
                              <strong>{t(entry.kind === "work" ? "driver.workTime" : entry.kind === "pause" ? "driver.pause" : "driver.interruption")}</strong>
                              <span>{new Date(entry.startedAt).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" })}{entry.endedAt ? `-${new Date(entry.endedAt).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}` : ` · ${t("driver.running")}`}</span>
                              <span>{entry.minutes ? formatDurationMinutes(entry.minutes) : t("driver.running")}</span>
                              <span>{[entry.jobNumber, entry.note].filter(Boolean).join(" · ") || "-"}</span>
                              <div className={`payroll-time-lock-state ${entry.lockedAt ? "locked" : "open"}`}>
                                {entry.lockedAt ? <Lock size={15} /> : <Unlock size={15} />}
                                <strong>{t(entry.lockedAt ? "masterData.timeEntryStatusLocked" : "masterData.timeEntryStatusOpen")}</strong>
                                <small>{entry.lockedAt ? timeEntryLockMeta(entry) : (employeeCanEditTimeEntry(entry) ? t("masterData.employeeCanStillEdit") : t("masterData.employeeEditWindowClosed"))}</small>
                              </div>
                              <div className="payroll-row-actions">
                                <button className="secondary-action compact-action" disabled={Boolean(entry.lockedAt)} onClick={() => editDriverTimeEntry(entry)} type="button">{t("masterData.editTimeEntry")}</button>
                                <button className="secondary-action compact-action" disabled={Boolean(entry.lockedAt)} onClick={() => lockDriverTimeEntries([entry])} type="button">{t("masterData.lockTimeEntry")}</button>
                                <button className="danger-action compact-action" disabled={Boolean(entry.lockedAt)} onClick={() => deleteDriverTimeEntry(entry)} type="button">{t("masterData.deleteTimeEntry")}</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="resource-editor-summary">{t("masterData.noTimeEntries")}</p>
                      )}
                    </section>
                  ))}
                </div>
              </div>
            </div>
          )}
          {timeEntryEditDraft && (
            <div className="modal-backdrop" role="presentation">
              <div className="resource-modal time-entry-admin-modal" role="dialog" aria-modal="true" aria-labelledby="time-entry-admin-title">
                <div className="section-heading">
                  <div>
                    <h2 id="time-entry-admin-title">{t("masterData.editTimeEntry")}</h2>
                    <p>{t("masterData.editTimeEntryHint")}</p>
                  </div>
                  <button className="secondary-action icon-action" onClick={() => { setEditingTimeEntryId(""); setTimeEntryEditDraft(null); setTimeEntryEditNotice(""); }} type="button">
                    <X size={18} />
                  </button>
                </div>
                {timeEntryEditNotice && <p className="permission-note warning-note">{timeEntryEditNotice}</p>}
                <div className={`driver-time-entry-edit-card ${timeEntryEditDraft.kind}`}>
                  <label>
                    <span>{t("driver.bookingType")}</span>
                    <select value={timeEntryEditDraft.kind} onChange={(event) => updateTimeEntryEditDraft({ kind: event.target.value as DriverTimeEntryKind })}>
                      <option value="work">{t("driver.workTime")}</option>
                      <option value="pause">{t("driver.pause")}</option>
                      <option value="interruption">{t("driver.interruption")}</option>
                    </select>
                  </label>
                  <label>
                    <span>{t("driver.startTime")}</span>
                    <input type="datetime-local" value={timeEntryEditDraft.startedAt} onChange={(event) => updateTimeEntryEditDraft({ startedAt: event.target.value })} />
                  </label>
                  <label>
                    <span>{t("driver.endTime")}</span>
                    <input type="datetime-local" value={timeEntryEditDraft.endedAt} onChange={(event) => updateTimeEntryEditDraft({ endedAt: event.target.value })} />
                  </label>
                  <div className="driver-time-entry-duration">
                    <span>{t("driver.duration")}</span>
                    <strong>{formatDurationMinutes(minutesBetween(fromDateTimeInputValue(timeEntryEditDraft.startedAt), fromDateTimeInputValue(timeEntryEditDraft.endedAt)) ?? 0)}</strong>
                  </div>
                  <label>
                    <span>{t("driver.reason")}</span>
                    <input value={timeEntryEditDraft.reason} onChange={(event) => updateTimeEntryEditDraft({ reason: event.target.value })} />
                  </label>
                  <label>
                    <span>{t("driver.jobReference")}</span>
                    <input value={timeEntryEditDraft.jobNumber} onChange={(event) => updateTimeEntryEditDraft({ jobNumber: event.target.value })} />
                  </label>
                  <label className="wide">
                    <span>{t("masterData.notes")}</span>
                    <input value={timeEntryEditDraft.note} onChange={(event) => updateTimeEntryEditDraft({ note: event.target.value })} />
                  </label>
                </div>
                <div className="modal-actions">
                  <button className="primary-action" onClick={saveTimeEntryEditDraft} type="button">
                    <Save size={16} /> {t("masterData.saveChanges")}
                  </button>
                </div>
              </div>
            </div>
          )}
          {deleteTimeEntryConfirm && (
            <div className="modal-backdrop" role="presentation">
              <div className="resource-modal warning-modal" role="dialog" aria-modal="true" aria-labelledby="delete-time-entry-title">
                <div className="section-heading">
                  <div>
                    <h2 id="delete-time-entry-title">{t("masterData.deleteTimeEntryTitle")}</h2>
                    <p>{t("masterData.deleteTimeEntryConfirm")}</p>
                  </div>
                  <button className="secondary-action icon-action" onClick={cancelDeleteDriverTimeEntry} type="button">
                    <X size={18} />
                  </button>
                </div>
                <div className={`driver-time-entry-edit-card ${deleteTimeEntryConfirm.kind}`}>
                  <strong>{t(deleteTimeEntryConfirm.kind === "work" ? "driver.workTime" : deleteTimeEntryConfirm.kind === "pause" ? "driver.pause" : "driver.interruption")}</strong>
                  <span>{new Date(deleteTimeEntryConfirm.startedAt).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" })}{deleteTimeEntryConfirm.endedAt ? `-${new Date(deleteTimeEntryConfirm.endedAt).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}` : ` · ${t("driver.running")}`}</span>
                  <span>{deleteTimeEntryConfirm.minutes ? formatDurationMinutes(deleteTimeEntryConfirm.minutes) : t("driver.running")}</span>
                  <span>{[deleteTimeEntryConfirm.reason, deleteTimeEntryConfirm.note].filter(Boolean).join(" · ") || "-"}</span>
                </div>
                <div className="modal-actions">
                  <button className="danger-action" onClick={confirmDeleteDriverTimeEntry} type="button">
                    <Trash2 size={16} /> {t("masterData.deleteTimeEntry")}
                  </button>
                </div>
              </div>
            </div>
          )}
          {isResourceModalOpen && (
            <div className="modal-backdrop" role="presentation">
              <div className="resource-modal" role="dialog" aria-modal="true" aria-labelledby="resource-modal-title">
                <div className="section-heading">
                  <h2 id="resource-modal-title">
                    {activeMasterGroup === "personnel" && t("masterData.personnelMasterData")}
                    {activeMasterGroup === "vehicles" && t("masterData.vehicleMasterData")}
                    {activeMasterGroup === "implements" && t("masterData.implementMasterData")}
                  </h2>
                  <button className="secondary-action icon-action" onClick={closeResourceModal} type="button">
                    <X size={18} />
                  </button>
                </div>

                {activeMasterGroup === "personnel" && (
                  <div className="driver-resource-form">
                    <section className="driver-form-section">
                      <h3>{t("masterData.driverSectionBase")}</h3>
                      <div className="form-row resource-form-row modal-form-row compact-driver-form-grid driver-base-grid">
                        <label>{t("masterData.personName")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={driverForm.name} onChange={(event) => setDriverForm((current) => ({ ...current, name: event.target.value }))} /></label>
                        {isResourceOrganizationLocked ? (
                          <label>
                            {t("masterData.assignedOrganization")}
                            <input disabled readOnly value={fixedResourceOrganization?.name ?? t("masterData.noOrganizationAssigned")} />
                            <small>{t("masterData.organizationLockedHint")}</small>
                          </label>
                        ) : (
                          <label>
                            {t("masterData.assignedOrganization")}
                            <select disabled={!permissions.canEditDrivers || showArchivedMasterData} value={driverForm.organizationId} onChange={(event) => setDriverForm((current) => ({ ...current, organizationId: event.target.value }))}>
                              <option value="">{t("masterData.noOrganizationAssigned")}</option>
                              {activeOrganizations.map((organization) => (
                                <option key={organization.id} value={organization.id}>
                                  {organization.name} · {t(`masterData.${organization.kind === "farmer" ? "farmerOrganization" : "contractorOrganization"}`)}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    </section>

                    <section className="driver-form-section driver-access-section">
                      <h3>{t("masterData.driverSectionAccess")}</h3>
                      <div className="form-row resource-form-row modal-form-row compact-driver-form-grid driver-access-grid">
                        <label>{t("masterData.email")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={driverForm.email} onChange={(event) => setDriverForm((current) => ({ ...current, email: event.target.value }))} type="email" /></label>
                        <label>{t("masterData.mobile")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={driverForm.mobile} onChange={(event) => setDriverForm((current) => ({ ...current, mobile: event.target.value }))} /></label>
                        <label className="driver-password-label">
                          <span className="driver-password-heading">
                            {t("masterData.driverPassword")} <small>{t("masterData.driverPasswordMinLength")}</small>
                          </span>
                          <span className="password-field">
                            <input
                              disabled={!permissions.canEditDrivers || showArchivedMasterData}
                              value={driverForm.accessPassword}
                              onChange={(event) => setDriverForm((current) => ({ ...current, accessPassword: event.target.value }))}
                              type={showDriverPassword ? "text" : "password"}
                            />
                            <button
                              aria-label={t(showDriverPassword ? "masterData.hideDriverPassword" : "masterData.showDriverPassword")}
                              className="password-toggle-button"
                              disabled={showArchivedMasterData}
                              onClick={() => setShowDriverPassword((current) => !current)}
                              title={t(showDriverPassword ? "masterData.hideDriverPassword" : "masterData.showDriverPassword")}
                              type="button"
                            >
                              {showDriverPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                            </button>
                          </span>
                        </label>
                        <div className="driver-access-actions">
                          <button disabled={!permissions.canEditDrivers || showArchivedMasterData} className="secondary-action" onClick={() => setDriverForm((current) => ({ ...current, accessPassword: generateDriverPassword() }))} type="button">
                            {t("masterData.generateDriverPassword")}
                          </button>
                          <button disabled={!driverForm.email || !driverForm.accessPassword} className="secondary-action" onClick={openDriverAccessMail} type="button">
                            <Mail size={16} /> {t("masterData.sendAccessByEmail")}
                          </button>
                          <button disabled={!driverForm.mobile || !driverForm.accessPassword} className="secondary-action" onClick={openDriverAccessSms} type="button">
                            <MessageSquare size={16} /> {t("masterData.sendAccessBySms")}
                          </button>
                        </div>
                      </div>
                    </section>

                    <section className="driver-form-section">
                      <h3>{t("masterData.personnelAccessRights")}</h3>
                      <div className="form-row resource-form-row modal-form-row compact-driver-form-grid driver-access-rights-grid">
                        <label>
                          {t("masterData.employeeType")}
                          <select disabled={!permissions.canEditDrivers || showArchivedMasterData} value={driverForm.employeeType} onChange={(event) => setDriverForm((current) => ({ ...current, employeeType: event.target.value as PersonnelEmployeeType }))}>
                            <option value="field">{t("masterData.employeeTypes.field")}</option>
                            <option value="administration">{t("masterData.employeeTypes.administration")}</option>
                            <option value="workshop">{t("masterData.employeeTypes.workshop")}</option>
                            <option value="warehouse">{t("masterData.employeeTypes.warehouse")}</option>
                          </select>
                        </label>
                        <label>
                          {t("masterData.appRole")}
                          <select
                            disabled={!permissions.canEditDrivers || showArchivedMasterData}
                            value={driverForm.appRole}
                            onChange={(event) => {
                              const nextRole = event.target.value as UserRole;
                              setDriverForm((current) => ({
                                ...current,
                                appRole: nextRole,
                                allowedViews: nextRole === "driver" ? ["driver"] : current.allowedViews.filter((view) => view !== "driver").length ? current.allowedViews.filter((view) => view !== "driver") : ["dashboard"],
                              }));
                            }}
                          >
                            <option value="driver">{t("roles.driver")}</option>
                            <option value="farmer_employee">{t("roles.farmer_employee")}</option>
                            <option value="contractor_admin">{t("roles.contractor_admin")}</option>
                            <option value="advisor">{t("roles.advisor")}</option>
                          </select>
                        </label>
                        <div className="personnel-permission-panel">
                          <strong>{t("masterData.allowedProgramAreas")}</strong>
                          <div className="personnel-check-grid">
                            {personnelViewOptions.map((view) => (
                              <label key={view}>
                                <input
                                  checked={driverForm.allowedViews.includes(view)}
                                  disabled={!permissions.canEditDrivers || showArchivedMasterData || (driverForm.appRole === "driver" && view !== "driver")}
                                  onChange={(event) => updatePersonnelViewAccess(view, event.target.checked)}
                                  type="checkbox"
                                />
                                <span>{t(`nav.${view}`)}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="personnel-permission-panel">
                          <strong>{t("masterData.editPermissions")}</strong>
                          <div className="personnel-check-grid">
                            {personnelPermissionOptions.map((permission) => (
                              <label key={permission}>
                                <input
                                  checked={Boolean(driverForm.appPermissions[permission])}
                                  disabled={!permissions.canEditDrivers || showArchivedMasterData || driverForm.appRole === "driver"}
                                  onChange={(event) => updatePersonnelPermission(permission, event.target.checked)}
                                  type="checkbox"
                                />
                                <span>{t(`masterData.permissionLabels.${permission}`)}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="driver-form-section">
                      <h3>{t("masterData.driverSectionPlanning")}</h3>
                      <div className="form-row resource-form-row modal-form-row compact-driver-form-grid driver-planning-grid">
                        <label>
                          {t("masterData.driverJobVisibility")}
                          <select disabled={!permissions.canEditDrivers || showArchivedMasterData} value={driverForm.jobVisibility} onChange={(event) => setDriverForm((current) => ({ ...current, jobVisibility: event.target.value as Driver["jobVisibility"] }))}>
                            <option value="assigned_only">{t("masterData.driverVisibility.assigned_only")}</option>
                            <option value="organization_internal">{t("masterData.driverVisibility.organization_internal")}</option>
                            <option value="organization_all">{t("masterData.driverVisibility.organization_all")}</option>
                            <option value="contractor_all">{t("masterData.driverVisibility.contractor_all")}</option>
                          </select>
                        </label>
                        <label>
                          {t("masterData.defaultVehicle")}
                          <select disabled={!permissions.canEditDrivers || showArchivedMasterData} value={driverForm.vehicle} onChange={(event) => setDriverForm((current) => ({ ...current, vehicle: event.target.value }))}>
                            <option value="">{t("masterData.noDefaultVehicle")}</option>
                            {standardVehicleOptions.map((vehicle) => (
                              <option key={vehicle.id} value={vehicle.name}>{vehicle.name} · {vehicle.type}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </section>

                    <section className="driver-form-section">
                      <h3>{t("masterData.driverSectionQualification")}</h3>
                      <div className="form-row resource-form-row modal-form-row compact-driver-form-grid driver-profile-grid">
                        <label>{t("masterData.licenseClasses")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={driverForm.licenseClasses} onChange={(event) => setDriverForm((current) => ({ ...current, licenseClasses: event.target.value }))} /></label>
                        <label>{t("masterData.maxDailyHours")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} min={1} max={16} step={0.5} value={driverForm.maxDailyHours} onChange={(event) => setDriverForm((current) => ({ ...current, maxDailyHours: Number(event.target.value) }))} type="number" /></label>
                        <label>{t("masterData.annualVacationDays")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} min={0} max={60} step={0.5} value={driverForm.annualVacationDays} onChange={(event) => setDriverForm((current) => ({ ...current, annualVacationDays: Number(event.target.value) }))} type="number" /></label>
                        <label>{t("masterData.vacationUsedDays")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} min={0} max={60} step={0.5} value={driverForm.vacationUsedDays} onChange={(event) => setDriverForm((current) => ({ ...current, vacationUsedDays: Number(event.target.value) }))} type="number" /></label>
                        <label>{t("masterData.resourceType")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={driverForm.resourceType} onChange={(event) => setDriverForm((current) => ({ ...current, resourceType: event.target.value }))} /></label>
                        <label>{t("masterData.operationType")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={driverForm.operationType} onChange={(event) => setDriverForm((current) => ({ ...current, operationType: event.target.value }))} /></label>
                      </div>
                    </section>

                    {!creatingResourceGroup && selectedDriver && (
                      <section className="driver-form-section personnel-dialog-planning">
                        <h3>{t("masterData.timeVacationPlanning")}</h3>
                        <div className="personnel-dialog-grid">
                          <div className="personnel-dialog-card">
                            <div className="personnel-dialog-card-head">
                              <strong><CalendarDays size={17} /> {t("masterData.vacationOverview")}</strong>
                              <span>{t("masterData.vacationRemainingShort")} {selectedDriverVacationRemaining}</span>
                            </div>
                            <div className="personnel-dialog-metrics">
                              <span>{t("masterData.annualVacationDays")}: <b>{selectedDriverVacationAllowance}</b></span>
                              <span>{t("masterData.vacationUsedDays")}: <b>{selectedDriverVacationUsedDays}</b></span>
                              <span>{t("masterData.vacationRequestedDays")}: <b>{selectedDriverVacationRequestedDays}</b></span>
                            </div>
                            {selectedDriverVacationRequests.length > 0 ? (
                              <div className="personnel-request-list">
                                {selectedDriverVacationRequests.map((request) => (
                                  <div className={`personnel-request-row ${request.status}`} key={request.id}>
                                    <div>
                                      <strong>{request.from}-{request.to} · {request.days} {t("driver.days")}</strong>
                                      <span>{t(`driver.vacationStatus.${request.status}`)} · {t("vacationApproval.submittedAt", { time: new Date(request.createdAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) })}</span>
                                      {request.note && <small>{request.note}</small>}
                                      {request.decisionReason && <small>{t("vacationApproval.reason")}: {request.decisionReason}</small>}
                                    </div>
                                    {request.status === "requested" && (
                                      <div className="vacation-decision-actions">
                                        <button className="secondary-action compact-action" onClick={() => handleVacationDecision(request, "rejected")} type="button">{t("vacationApproval.reject")}</button>
                                        <button className="primary-action compact-action" onClick={() => handleVacationDecision(request, "approved")} type="button">{t("vacationApproval.approve")}</button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="resource-editor-summary">{t("masterData.noVacationRequests")}</p>
                            )}
                          </div>

                          <div className="personnel-dialog-card">
                            <div className="personnel-dialog-card-head">
                              <strong><Clock size={17} /> {t("masterData.timeEntriesOverview")}</strong>
                              <span>{selectedDriverClosedTimeEntries.length} {t("driver.timeEntries")}</span>
                            </div>
                            <div className="personnel-dialog-metrics">
                              <span>{t("masterData.totalWorkTime")}: <b>{formatDurationMinutes(selectedDriverClosedTimeEntries.filter((entry) => entry.kind === "work" || entry.kind === "interruption").reduce((sum, entry) => sum + (entry.minutes ?? 0), 0))}</b></span>
                              <span>{t("masterData.totalPauseTime")}: <b>{formatDurationMinutes(selectedDriverClosedTimeEntries.filter((entry) => entry.kind === "pause").reduce((sum, entry) => sum + (entry.minutes ?? 0), 0))}</b></span>
                              <span>{t("masterData.interruptionTime")}: <b>{formatDurationMinutes(selectedDriverClosedTimeEntries.filter((entry) => entry.kind === "interruption").reduce((sum, entry) => sum + (entry.minutes ?? 0), 0))}</b></span>
                            </div>
                            {selectedDriverTimeEntries.length > 0 ? (
                              <div className="personnel-time-list">
                                {selectedDriverTimeEntries.slice(0, 20).map((entry) => (
                                  <div className={`personnel-time-row ${entry.kind}`} key={entry.id}>
                                    <strong>{t(entry.kind === "work" ? "driver.workTime" : entry.kind === "pause" ? "driver.pause" : "driver.interruption")}</strong>
                                    <span>{new Date(entry.startedAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}{entry.endedAt ? `-${new Date(entry.endedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : ` · ${t("driver.running")}`}</span>
                                    <span>{entry.minutes ? formatDurationMinutes(entry.minutes) : t("driver.running")}</span>
                                    {entry.reason && <small>{t(`${entry.kind === "pause" ? "driver.pauseReasons" : "driver.interruptionReasons"}.${entry.reason}`)}</small>}
                                    {entry.jobNumber && <small>{entry.jobNumber}</small>}
                                    {entry.note && <small>{entry.note}</small>}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="resource-editor-summary">{t("masterData.noTimeEntries")}</p>
                            )}
                          </div>
                        </div>
                      </section>
                    )}
                  </div>
                )}

                {activeMasterGroup === "vehicles" && (
                  <div className="form-row resource-form-row modal-form-row">
                    <label>{t("masterData.vehicleDescription")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={vehicleForm.name} onChange={(event) => setVehicleForm((current) => ({ ...current, name: event.target.value }))} /></label>
                    <label>{t("masterData.licensePlate")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={vehicleForm.licensePlate} onChange={(event) => setVehicleForm((current) => ({ ...current, licensePlate: event.target.value }))} /></label>
                    <label>{t("masterData.type")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={vehicleForm.type} onChange={(event) => setVehicleForm((current) => ({ ...current, type: event.target.value }))} /></label>
                    <label>{t("masterData.manufacturer")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={vehicleForm.manufacturer} onChange={(event) => setVehicleForm((current) => ({ ...current, manufacturer: event.target.value }))} /></label>
                    <label>{t("masterData.model")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={vehicleForm.model} onChange={(event) => setVehicleForm((current) => ({ ...current, model: event.target.value }))} /></label>
                    <label>{t("masterData.constructionYear")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} min={1900} max={2100} value={vehicleForm.constructionYear} onChange={(event) => setVehicleForm((current) => ({ ...current, constructionYear: event.target.value }))} type="number" /></label>
                    <label>{t("masterData.operatingHours")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} min={0} step={1} value={vehicleForm.operatingHours} onChange={(event) => setVehicleForm((current) => ({ ...current, operatingHours: event.target.value }))} type="number" /></label>
                    <label>
                      {t("masterData.defaultDriver")}
                      <select disabled={!permissions.canEditDrivers || showArchivedMasterData} value={vehicleForm.defaultDriverId} onChange={(event) => setVehicleForm((current) => ({ ...current, defaultDriverId: event.target.value }))}>
                        <option value="">{t("masterData.noDefaultDriver")}</option>
                        {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
                      </select>
                    </label>
                    <label>{t("masterData.resourceType")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={vehicleForm.resourceType} onChange={(event) => setVehicleForm((current) => ({ ...current, resourceType: event.target.value }))} /></label>
                    <label>{t("masterData.operationType")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={vehicleForm.operationType} onChange={(event) => setVehicleForm((current) => ({ ...current, operationType: event.target.value }))} /></label>
                    <label>{t("masterData.status")}<select disabled={!permissions.canEditDrivers || showArchivedMasterData} value={vehicleForm.status} onChange={(event) => setVehicleForm((current) => ({ ...current, status: event.target.value as Vehicle["status"] }))}><option value="frei">{t("resourceStatus.frei")}</option><option value="zugewiesen">{t("resourceStatus.zugewiesen")}</option><option value="wartung">{t("resourceStatus.wartung")}</option></select></label>
                  </div>
                )}

                {activeMasterGroup === "implements" && (
                  <div className="form-row resource-form-row modal-form-row">
                    <label>{t("terms.implement")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={implementForm.name} onChange={(event) => setImplementForm((current) => ({ ...current, name: event.target.value }))} /></label>
                    <label>{t("masterData.type")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={implementForm.type} onChange={(event) => setImplementForm((current) => ({ ...current, type: event.target.value }))} /></label>
                    <label>{t("masterData.manufacturer")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={implementForm.manufacturer} onChange={(event) => setImplementForm((current) => ({ ...current, manufacturer: event.target.value }))} /></label>
                    <label>{t("masterData.workingWidth")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} min={0} step={0.1} value={implementForm.workingWidth} onChange={(event) => setImplementForm((current) => ({ ...current, workingWidth: event.target.value }))} type="number" /></label>
                    <label>{t("masterData.resourceType")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={implementForm.resourceType} onChange={(event) => setImplementForm((current) => ({ ...current, resourceType: event.target.value }))} /></label>
                    <label>{t("masterData.operationType")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={implementForm.operationType} onChange={(event) => setImplementForm((current) => ({ ...current, operationType: event.target.value }))} /></label>
                    <label>{t("masterData.status")}<select disabled={!permissions.canEditDrivers || showArchivedMasterData} value={implementForm.status} onChange={(event) => setImplementForm((current) => ({ ...current, status: event.target.value as Implement["status"] }))}><option value="frei">{t("resourceStatus.frei")}</option><option value="zugewiesen">{t("resourceStatus.zugewiesen")}</option><option value="wartung">{t("resourceStatus.wartung")}</option></select></label>
                  </div>
                )}

                {!creatingResourceGroup && (
                  <div className="resource-history-panel">
                    <div className="section-heading compact-heading">
                      <h3>{t("resourceHistory.title")}</h3>
                      <span>{selectedResourceHistory.length}</span>
                    </div>
                    {selectedResourceHistory.length === 0 ? (
                      <p className="resource-editor-summary">{t("resourceHistory.empty")}</p>
                    ) : (
                      <div className="resource-history-table">
                        <div className="resource-history-row resource-history-head">
                          <span>{t("resourceHistory.date")}</span>
                          <span>{t("resourceHistory.event")}</span>
                          <span>{t("resourceHistory.actor")}</span>
                          <span>{t("resourceHistory.details")}</span>
                        </div>
                        {selectedResourceHistory.map((row) => (
                          <div className="resource-history-row" key={row.id}>
                            <span>{formatHistoryDate(row.recordedAt)}</span>
                            <span>
                              <strong>{row.title || t(`resourceHistory.eventType.${row.event}`)}</strong>
                              {(row.jobNumber || row.status) && <small>{[row.jobNumber, row.status ? t(`status.${row.status}`) : ""].filter(Boolean).join(" · ")}</small>}
                            </span>
                            <span>{row.actor || "-"}</span>
                            <span>{row.details || t(`resourceHistory.eventType.${row.event}`)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="modal-actions">
                  {canManageResources && !showArchivedMasterData && !creatingResourceGroup && (
                    <button className="danger-action" onClick={archiveSelectedResource} type="button">
                      <Archive size={16} /> {t("actions.archive")}
                    </button>
                  )}
                  {canManageResources && showArchivedMasterData && !creatingResourceGroup && (
                    <button className="primary-action" onClick={restoreSelectedResource} type="button">
                      <RotateCcw size={16} /> {t("actions.restore")}
                    </button>
                  )}
                  {canManageResources && showArchivedMasterData && !creatingResourceGroup && (
                    <button className="danger-action" onClick={requestDeleteSelectedResource} type="button">
                      <Trash2 size={16} /> {t("actions.deletePermanent")}
                    </button>
                  )}
                  {canManageResources && !showArchivedMasterData && activeMasterGroup === "personnel" && <button className="primary-action" onClick={saveDriver} type="button"><Save size={16} /> {t("masterData.saveChanges")}</button>}
                  {canManageResources && !showArchivedMasterData && activeMasterGroup === "vehicles" && <button className="primary-action" onClick={saveVehicle} type="button"><Save size={16} /> {t("masterData.saveChanges")}</button>}
                  {canManageResources && !showArchivedMasterData && activeMasterGroup === "implements" && <button className="primary-action" onClick={saveImplement} type="button"><Save size={16} /> {t("masterData.saveChanges")}</button>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeSection === "organizations" && (
        <div className="panel resource-master-page">
          <div className="section-heading master-detail-heading">
            <h2><Building2 size={20} /> {t(`masterData.organizationDirectory.${organizationDirectoryMode}`)}</h2>
            <span>{t("masterData.masterDataFor", { organization: ownOrganization?.name ?? t("masterData.noOrganizationAssigned") })}</span>
            <div className="modal-actions">
              {organizationDirectoryMode !== "company" && organizationDirectoryMode !== "collaboration" && (
                <div className="segmented-control archive-toggle category-archive-toggle">
                  <button className={!showArchivedOrganizations ? "active" : ""} onClick={() => setShowArchivedOrganizations(false)} type="button">
                    {t("archive.active")} · {activeOrganizationDirectoryCount}
                  </button>
                  <button className={showArchivedOrganizations ? "active" : ""} onClick={() => setShowArchivedOrganizations(true)} type="button">
                    {t("archive.archived")} · {archivedOrganizationDirectoryCount}
                  </button>
                </div>
              )}
              {organizationDirectoryMode === "contacts" && canCreateOrganizations && !showArchivedOrganizations && (
                <button className="primary-action" onClick={createOrganization} type="button">
                  <Plus size={16} /> {t("masterData.newOrganization")}
                </button>
              )}
              <button className="secondary-action icon-action" onClick={() => setActiveSection("masterOverview")} type="button">
                <X size={18} />
              </button>
            </div>
          </div>
          {organizationDirectoryMode === "collaboration" ? (
            renderCollaborationDirectory()
          ) : (
            <div className="resource-group">
              <div className="resource-group-heading">
                <strong>{t(`masterData.organizationDirectory.${organizationDirectoryMode}`)}</strong>
                <span>{directoryOrganizations.length}</span>
              </div>
              <div className="resource-grid organization-directory-grid">
                {directoryOrganizations.length === 0 ? (
                  <p className="permission-note">{t(`masterData.organizationDirectoryEmpty.${organizationDirectoryMode}`)}</p>
                ) : (
                  directoryOrganizations.map((organization) => renderOrganizationCard(organization))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeSection === "products" && (
        <div className="panel resource-master-page">
          <div className="section-heading master-detail-heading">
            <div>
              <h2><Package size={20} /> {t("masterDataOverview.groups.inputs")}</h2>
              <p>{t("products.sectionHint")}</p>
            </div>
            <div className="modal-actions">
              <span className="master-overview-total">{showArchivedProducts ? archivedProducts.length : activeProducts.length}</span>
              <button className="secondary-action icon-action" onClick={() => setActiveSection("masterOverview")} type="button">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="resource-master-toolbar product-toolbar">
            <div className="segmented-control archive-toggle category-archive-toggle">
              <button className={!showArchivedProducts ? "active" : ""} onClick={() => setShowArchivedProducts(false)} type="button">
                {t("archive.active")} · {activeProducts.length}
              </button>
              <button className={showArchivedProducts ? "active" : ""} onClick={() => setShowArchivedProducts(true)} type="button">
                {t("archive.archived")} · {archivedProducts.length}
              </button>
            </div>
            <div className="product-kpi-row">
              <span>{t("products.inventoryValue")}: <b>{inventoryValueLabel}</b></span>
              <span>{t("products.activeProducts")}: <b>{activeProducts.length}</b></span>
            </div>
            {canManageProducts && (
              <button className="primary-action" onClick={startNewProduct} type="button">
                <Plus size={16} /> {t("products.newProduct")}
              </button>
            )}
          </div>
          <div className="product-inventory-layout">
            <aside className="product-list-panel">
              {visibleProducts.length === 0 ? (
                <p className="permission-note">{t("products.noProducts")}</p>
              ) : visibleProducts.map((product) => {
                const stock = productStock(product.id);
                const isLow = product.minimumStock !== undefined && stock <= product.minimumStock;
                return (
                  <button
                    className={`product-list-entry ${selectedProduct?.id === product.id ? "active" : ""} ${isLow ? "stock-low" : ""}`}
                    key={product.id}
                    onClick={() => {
                      setIsCreatingProduct(false);
                      setSelectedProductId(product.id);
                    }}
                    type="button"
                  >
                    <span>
                      <b>{product.name}</b>
                      <small>{[product.category, product.supplierName, product.articleNumber, product.currency ?? "SEK"].filter(Boolean).join(" · ") || t("products.noDetails")}</small>
                      {productPackageSummary(product) && <small>{productPackageSummary(product)}</small>}
                    </span>
                    <strong>{formatQuantity(stock)} {product.unit}</strong>
                  </button>
                );
              })}
            </aside>
            <div className="product-detail-stack">
              <section className="resource-editor-block product-editor-panel">
                <div className="section-heading">
                  <h2>{isCreatingProduct ? t("products.newProduct") : selectedProduct ? selectedProduct.name : t("products.productMasterData")}</h2>
                  <div className="modal-actions">
                    {selectedProduct && canManageProducts && !showArchivedProducts && (
                      <button className="secondary-action" onClick={() => setIsProductBookingModalOpen(true)} type="button">
                        <Package size={16} /> {t("products.stockBooking")}
                      </button>
                    )}
                    {selectedProduct && (
                      <button className="secondary-action" onClick={() => setIsProductMovementsModalOpen(true)} type="button">
                        <Eye size={16} /> {t("products.showMovements")}
                      </button>
                    )}
                    {selectedProduct && canManageProducts && !showArchivedProducts && (
                      <button className="danger-action" onClick={archiveSelectedProduct} type="button">
                        <Archive size={16} /> {t("products.archiveProduct")}
                      </button>
                    )}
                    {selectedProduct && canManageProducts && showArchivedProducts && (
                      <button className="secondary-action" onClick={restoreSelectedProduct} type="button">
                        <RotateCcw size={16} /> {t("products.restoreProduct")}
                      </button>
                    )}
                    {canManageProducts && (
                      <button className="primary-action" onClick={saveProduct} type="button">
                        <Save size={16} /> {t("products.saveProduct")}
                      </button>
                    )}
                  </div>
                </div>
                <div className="form-row product-form-grid">
                  <div className="product-photo-field">
                    <div className="product-photo-preview">
                      {productForm.photoUrl ? <img alt={productForm.photoName || productForm.name} src={productForm.photoUrl} /> : <Package size={34} />}
                    </div>
                    <div className="product-photo-actions">
                      <strong>{t("products.articlePhoto")}</strong>
                      <label className="secondary-action file-action">
                        <Camera size={16} /> {t("products.scanPhoto")}
                        <input accept="image/*" capture="environment" hidden onChange={(event) => void addProductPhoto(event.target.files)} type="file" />
                      </label>
                      <label className="secondary-action file-action">
                        <FileArchive size={16} /> {t("products.choosePhoto")}
                        <input accept="image/*" hidden onChange={(event) => void addProductPhoto(event.target.files)} type="file" />
                      </label>
                    </div>
                  </div>
                  <label>{t("masterDataOverview.productFields.name")}<input value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label>{t("masterDataOverview.productFields.category")}<input value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))} /></label>
                  <label>{t("masterDataOverview.productFields.unit")}<input value={productForm.unit} onChange={(event) => setProductForm((current) => ({ ...current, unit: event.target.value }))} /></label>
                  <label>{t("products.supplier")}<input list="product-suppliers" value={productForm.supplierName} onChange={(event) => setProductForm((current) => ({ ...current, supplierName: event.target.value }))} /></label>
                  <label>{t("products.articleNumber")}<input value={productForm.articleNumber} onChange={(event) => setProductForm((current) => ({ ...current, articleNumber: event.target.value }))} /></label>
                  <label>{t("products.currency")}<select value={productForm.currency} onChange={(event) => setProductForm((current) => ({ ...current, currency: event.target.value }))}>{productCurrencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
                  <label>{t("products.purchasePrice")}<input inputMode="decimal" value={productForm.purchasePrice} onChange={(event) => setProductForm((current) => ({ ...current, purchasePrice: event.target.value }))} /></label>
                  <label>{t("products.priceValidFrom")}<input type="date" value={productForm.purchasePriceValidFrom} onChange={(event) => setProductForm((current) => ({ ...current, purchasePriceValidFrom: event.target.value }))} /></label>
                  <label>{t("products.priceValidTo")}<input type="date" value={productForm.purchasePriceValidTo} onChange={(event) => setProductForm((current) => ({ ...current, purchasePriceValidTo: event.target.value }))} /></label>
                  <label>{t("products.salesPrice")}<input inputMode="decimal" value={productForm.salesPrice} onChange={(event) => setProductForm((current) => ({ ...current, salesPrice: event.target.value }))} /></label>
                  <label>{t("products.priceValidFrom")}<input type="date" value={productForm.salesPriceValidFrom} onChange={(event) => setProductForm((current) => ({ ...current, salesPriceValidFrom: event.target.value }))} /></label>
                  <label>{t("products.priceValidTo")}<input type="date" value={productForm.salesPriceValidTo} onChange={(event) => setProductForm((current) => ({ ...current, salesPriceValidTo: event.target.value }))} /></label>
                  <label>{t("products.minimumStock")}<input inputMode="decimal" value={productForm.minimumStock} onChange={(event) => setProductForm((current) => ({ ...current, minimumStock: event.target.value }))} /></label>
                  <label>{t("products.packageUnit")}<input value={productForm.packageUnit} onChange={(event) => setProductForm((current) => ({ ...current, packageUnit: event.target.value }))} /></label>
                  <label>{t("products.quantityPerPackage")}<input inputMode="decimal" value={productForm.quantityPerPackage} onChange={(event) => setProductForm((current) => ({ ...current, quantityPerPackage: event.target.value }))} /></label>
                  <label className="wide-field">{t("products.notes")}<input value={productForm.notes} onChange={(event) => setProductForm((current) => ({ ...current, notes: event.target.value }))} /></label>
                  <datalist id="product-suppliers">
                    {supplierNameOptions.map((supplierName) => <option key={supplierName} value={supplierName} />)}
                  </datalist>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {isProductBookingModalOpen && selectedProduct && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal product-movement-modal" role="dialog" aria-modal="true" aria-labelledby="product-booking-title">
            <div className="section-heading">
              <div>
                <h2 id="product-booking-title">{t("products.stockBooking")} · {selectedProduct.name}</h2>
                <p>{t("products.currentStock")}: <b>{formatQuantity(productStock(selectedProduct.id))} {selectedProduct.unit}</b></p>
              </div>
              <button className="secondary-action icon-action" onClick={() => setIsProductBookingModalOpen(false)} type="button">
                <X size={18} />
              </button>
            </div>
            <div className="form-row product-movement-form">
              <label>{t("products.movementType")}<select value={movementForm.type} onChange={(event) => setMovementForm((current) => ({ ...current, type: event.target.value as ProductMovement["type"], jobId: event.target.value === "in" ? "" : current.jobId }))}>
                <option value="in">{t("products.movementIn")}</option>
                <option value="out">{t("products.movementOut")}</option>
              </select></label>
              <label>{t("products.deliveredTotal")}<input inputMode="decimal" value={movementForm.deliveredTotal} onChange={(event) => updateMovementDeliveredTotal(event.target.value)} /></label>
              <label>{t("products.packageCount")}<input inputMode="decimal" value={movementForm.packageCount} onChange={(event) => updateMovementPackageFields({ packageCount: event.target.value, deliveredTotal: "" })} /></label>
              <label>{t("products.packageQuantityBooking")}<input inputMode="decimal" value={movementForm.packageQuantity} onChange={(event) => updateMovementPackageFields({ packageQuantity: event.target.value, deliveredTotal: "" })} /></label>
              <label>{t("products.openedPackageCount")}<input inputMode="decimal" value={movementForm.openedPackageCount} onChange={(event) => updateMovementPackageFields({ openedPackageCount: event.target.value, deliveredTotal: "" })} /></label>
              <label>{t("products.openedPackageQuantity")}<input inputMode="decimal" value={movementForm.openedPackageQuantity} onChange={(event) => updateMovementPackageFields({ openedPackageQuantity: event.target.value, deliveredTotal: "" })} /></label>
              <label>{t("products.quantity")}<input inputMode="decimal" value={movementForm.quantity} onChange={(event) => setMovementForm((current) => ({ ...current, quantity: event.target.value, deliveredTotal: "" }))} /></label>
              <label>{t("products.bookingDate")}<input type="date" value={movementForm.bookedAt} onChange={(event) => setMovementForm((current) => ({ ...current, bookedAt: event.target.value }))} /></label>
              <label>{t("products.assignJob")}<select disabled={movementForm.type === "in"} value={movementForm.jobId} onChange={(event) => setMovementForm((current) => ({ ...current, jobId: event.target.value }))}>
                <option value="">{t("products.noJobAssignment")}</option>
                {jobs.filter((job) => !job.archivedAt).map((job) => <option key={job.id} value={job.id}>{job.jobNumber ?? job.id} · {job.title}</option>)}
              </select></label>
              <label>{t("products.purchasePrice")}<input inputMode="decimal" value={movementForm.purchasePrice} onChange={(event) => setMovementForm((current) => ({ ...current, purchasePrice: event.target.value }))} /></label>
              <label className="wide-field">{t("products.bookingNote")}<input value={movementForm.note} onChange={(event) => setMovementForm((current) => ({ ...current, note: event.target.value }))} /></label>
            </div>
            <div className="product-upload-actions">
              <label className="secondary-action file-action">
                <Camera size={16} /> {t("products.scanReceipt")}
                <input accept="image/*" capture="environment" hidden multiple onChange={(event) => void addMovementDocuments(event.target.files)} type="file" />
              </label>
              <label className="secondary-action file-action">
                <FileArchive size={16} /> {t("products.chooseFile")}
                <input accept="image/*,.pdf,.doc,.docx" hidden multiple onChange={(event) => void addMovementDocuments(event.target.files)} type="file" />
              </label>
              <span>{t("products.documents")}: <b>{movementDocuments.length}</b></span>
            </div>
            {movementDocuments.length > 0 && (
              <div className="product-document-list">
                {movementDocuments.map((document) => (
                  <button className="secondary-action" key={document.id} onClick={() => setMovementDocuments((current) => current.filter((item) => item.id !== document.id))} type="button">
                    <X size={14} /> {document.name}
                  </button>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button className="primary-action" disabled={!movementForm.quantity} onClick={bookProductMovement} type="button">
                <Save size={16} /> {t("products.bookMovement")}
              </button>
            </div>
          </div>
        </div>
      )}

      {isProductMovementsModalOpen && selectedProduct && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal product-movement-modal" role="dialog" aria-modal="true" aria-labelledby="product-movements-title">
            <div className="section-heading">
              <div>
                <h2 id="product-movements-title">{t("products.movementHistory")} · {selectedProduct.name}</h2>
                <p>{selectedProductMovements.length} {t("products.movementHistory")}</p>
              </div>
              <div className="modal-actions">
                <button className="primary-action" onClick={() => printProductInventoryReport(selectedProduct)} type="button">
                  <FileArchive size={16} /> {t("products.exportInventoryPdf")}
                </button>
                <button className="secondary-action icon-action" onClick={() => setIsProductMovementsModalOpen(false)} type="button">
                  <X size={18} />
                </button>
              </div>
            </div>
            <section className="resource-list-panel master-list-full product-movement-list">
              {selectedProductMovements.length === 0 ? (
                <p className="permission-note">{t("products.noMovements")}</p>
              ) : selectedProductMovements.map((movement) => (
                <button className={`product-movement-entry ${movement.type === "in" ? "movement-in" : "movement-out"}`} key={movement.id} onClick={() => {
                  setIsProductMovementsModalOpen(false);
                  setSelectedProductMovementId(movement.id);
                }} type="button">
                  <div>
                    <b>{movement.type === "in" ? t("products.movementIn") : t("products.movementOut")} · {formatQuantity(movement.quantity)} {selectedProduct.unit}</b>
                    <span>{new Date(`${movement.bookedAt}T00:00:00`).toLocaleDateString(i18n.language)}{movement.jobLabel ? ` · ${movement.jobLabel}` : ""}</span>
                    <span>{t("products.bookedBy")}: {movement.bookedByName ?? t("products.unknownBooker")}</span>
                    {movement.note && <small>{movement.note}</small>}
                  </div>
                  <div>
                    <span>{t("products.purchasePrice")}: {movement.purchasePrice !== undefined ? formatMoneyValue(movement.purchasePrice, movement.currency ?? selectedProduct.currency ?? "SEK") : "-"}</span>
                    <span>{t("products.documentCount", { count: movement.documents.length })}</span>
                  </div>
                  <Eye size={18} />
                </button>
              ))}
            </section>
          </div>
        </div>
      )}

      {selectedProductMovement && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal product-movement-modal" role="dialog" aria-modal="true" aria-labelledby="product-movement-detail-title">
            <div className="section-heading">
              <h2 id="product-movement-detail-title">{t("products.movementDetails")}</h2>
              <button className="secondary-action icon-action" onClick={() => setSelectedProductMovementId("")} type="button">
                <X size={18} />
              </button>
            </div>
            <div className="product-movement-detail-grid">
              <div>
                <span>{t("masterDataOverview.products.title")}</span>
                <b>{selectedProductMovementProduct?.name ?? "-"}</b>
              </div>
              <div>
                <span>{t("products.movementType")}</span>
                <b>{selectedProductMovement.type === "in" ? t("products.movementIn") : t("products.movementOut")}</b>
              </div>
              <div>
                <span>{t("products.quantity")}</span>
                <b>{formatQuantity(selectedProductMovement.quantity)} {selectedProductMovementProduct?.unit ?? ""}</b>
              </div>
              {(selectedProductMovement.packageCount || selectedProductMovement.packageQuantity) && (
                <div>
                  <span>{t("products.packageCount")}</span>
                  <b>{selectedProductMovement.packageCount ? `${formatQuantity(selectedProductMovement.packageCount)} ${selectedProductMovementProduct?.packageUnit ?? t("products.vpeShort")}` : "-"} · {selectedProductMovement.packageQuantity ? `${formatQuantity(selectedProductMovement.packageQuantity)} ${selectedProductMovementProduct?.unit ?? ""}/${t("products.vpeShort")}` : "-"}</b>
                </div>
              )}
              {(selectedProductMovement.openedPackageCount || selectedProductMovement.openedPackageQuantity) && (
                <div>
                  <span>{t("products.openedPackageCount")}</span>
                  <b>{selectedProductMovement.openedPackageCount ? `${formatQuantity(selectedProductMovement.openedPackageCount)} ${selectedProductMovementProduct?.packageUnit ?? t("products.vpeShort")}` : "-"} · {selectedProductMovement.openedPackageQuantity ? `${formatQuantity(selectedProductMovement.openedPackageQuantity)} ${selectedProductMovementProduct?.unit ?? ""}` : "-"}</b>
                </div>
              )}
              <div>
                <span>{t("products.bookingDate")}</span>
                <b>{new Date(`${selectedProductMovement.bookedAt}T00:00:00`).toLocaleDateString(i18n.language)}</b>
              </div>
              <div>
                <span>{t("products.bookedBy")}</span>
                <b>{selectedProductMovement.bookedByName ?? t("products.unknownBooker")}</b>
              </div>
              <div>
                <span>{t("products.createdAt")}</span>
                <b>{selectedProductMovement.createdAt ? new Date(selectedProductMovement.createdAt).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }) : "-"}</b>
              </div>
              <div>
                <span>{t("products.purchasePrice")}</span>
                <b>{selectedProductMovement.purchasePrice !== undefined ? formatMoneyValue(selectedProductMovement.purchasePrice, selectedProductMovement.currency ?? selectedProductMovementProduct?.currency ?? "SEK") : "-"}</b>
              </div>
              <div>
                <span>{t("products.currency")}</span>
                <b>{selectedProductMovement.currency ?? selectedProductMovementProduct?.currency ?? "SEK"}</b>
              </div>
              {selectedProductMovement.jobLabel && (
                <div className="wide-field">
                  <span>{t("products.assignJob")}</span>
                  <b>{selectedProductMovement.jobLabel}</b>
                </div>
              )}
              {selectedProductMovement.correctionOfMovementId && (
                <div className="wide-field">
                  <span>{t("products.correctionOf")}</span>
                  <b>{selectedProductMovement.correctionOfMovementId}</b>
                </div>
              )}
              {selectedProductMovement.note && (
                <div className="wide-field">
                  <span>{t("products.bookingNote")}</span>
                  <b>{selectedProductMovement.note}</b>
                </div>
              )}
            </div>
            <section className="product-movement-documents">
              <div className="section-heading compact-heading">
                <h3>{t("products.documents")}</h3>
                <span>{selectedProductMovement.documents.length}</span>
              </div>
              {selectedProductMovement.documents.length === 0 ? (
                <p className="permission-note">{t("products.noDocuments")}</p>
              ) : (
                <div className="product-document-preview-grid">
                  {selectedProductMovement.documents.map((document) => (
                    <a href={document.url} key={document.id} rel="noreferrer" target="_blank">
                      {document.kind === "photo" || document.mimeType?.startsWith("image/") ? (
                        <img alt={document.name} src={document.url} />
                      ) : (
                        <FileArchive size={34} />
                      )}
                      <span>{document.name}</span>
                    </a>
                  ))}
                </div>
              )}
            </section>
            <div className="modal-actions">
              {canManageProducts && (
                <button className="primary-action" onClick={() => prepareProductMovementCorrection(selectedProductMovement)} type="button">
                  <RotateCw size={16} /> {t("products.prepareCorrection")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {activeSection === "taskTemplates" && (
        <div className="panel resource-master-page">
          <div className="section-heading master-detail-heading">
            <h2>{t("contractor.taskTemplateMasterData")}</h2>
            <div className="modal-actions">
              <span className="master-overview-total">{showArchivedTaskTemplates ? archivedTaskTemplates.length : activeTaskTemplates.length}</span>
              <button className="secondary-action icon-action" onClick={() => setActiveSection("masterOverview")} type="button">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="resource-editor-block">
            <div className="section-heading">
              <h2>{t("masterData.taskTemplate")}</h2>
              <div className="modal-actions">
                <div className="segmented-control archive-toggle category-archive-toggle">
                  <button className={!showArchivedTaskTemplates ? "active" : ""} onClick={() => setShowArchivedTaskTemplates(false)} type="button">
                    {t("archive.active")} · {activeTaskTemplates.length}
                  </button>
                  <button className={showArchivedTaskTemplates ? "active" : ""} onClick={() => setShowArchivedTaskTemplates(true)} type="button">
                    {t("archive.archived")} · {archivedTaskTemplates.length}
                  </button>
                </div>
                {canEditSelectedTaskTemplate && !showArchivedTaskTemplates && selectedTaskTemplate && (
                  <button className="primary-action" onClick={() => setIsTaskTemplateModalOpen(true)} type="button">
                    <Save size={16} /> {t("masterData.editSelected")}
                  </button>
                )}
                {canManageOwnTemplates && !showArchivedTaskTemplates && (
                  <button className="secondary-action" onClick={createTaskTemplate} type="button">
                    <Plus size={16} /> {t("masterData.newTaskTemplate")}
                  </button>
                )}
              </div>
            </div>
            <p className="resource-editor-summary">
              {selectedTaskTemplate
                ? `${selectedTaskTemplate.name} · ${selectedTaskTemplate.timePerHa} ${t("createJob.hoursPerHa")} · ${selectedTaskTemplate.workSteps.join(", ")}`
                : t("masterData.newTaskTemplate")}
            </p>
          </div>
          <div className="resource-list-panel master-list-full">
            {visibleTaskTemplates.length === 0 && (
              <p className="permission-note">{showArchivedTaskTemplates ? t("archive.noArchivedTaskTemplates") : t("masterData.newTaskTemplate")}</p>
            )}
            {visibleTaskTemplates.map((taskTemplate) => (
              <button
                className={taskTemplate.id === selectedTaskTemplate?.id ? "roster-item active" : "roster-item"}
                key={taskTemplate.id}
                onClick={() => {
                  setSelectedTaskTemplateId(taskTemplate.id);
                  setIsTaskTemplateModalOpen(true);
                }}
                type="button"
              >
                <strong>{taskTemplate.name}</strong>
                <span>{taskTemplate.timePerHa} {t("createJob.hoursPerHa")} · {t(`mode.${taskTemplate.mode}`)} · {taskTemplate.resourceHint || t("createJob.dispatchPlannerDecides")}</span>
                {currentRole === "support_admin" && (
                  <span className="template-owner-line">{t("masterData.templateOwner")}: <b>{taskTemplateOwnerLabel(taskTemplate)}</b></span>
                )}
              </button>
            ))}
          </div>
          {isTaskTemplateModalOpen && selectedTaskTemplate && (
            <div className="modal-backdrop" role="presentation">
              <div className="resource-modal" role="dialog" aria-modal="true" aria-labelledby="task-template-modal-title">
                <div className="section-heading">
                  <h2 id="task-template-modal-title">{t("contractor.taskTemplateMasterData")}</h2>
                  <button className="secondary-action icon-action" onClick={() => setIsTaskTemplateModalOpen(false)} type="button">
                    <X size={18} />
                  </button>
                </div>
                <div className="form-row resource-form-row modal-form-row">
                  <label>{t("terms.task")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} value={taskTemplateForm.name} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label>{t("createJob.hoursPerHa")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} min={0.01} max={10} step={0.01} value={taskTemplateForm.timePerHa} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, timePerHa: Number(event.target.value) }))} type="number" /></label>
                  <label>{t("createJob.workMode")} *<select disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} value={taskTemplateForm.mode} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, mode: event.target.value as WorkMode }))}>{taskModes.map((item) => <option key={item} value={item}>{t(`mode.${item}`)}</option>)}</select></label>
                  <label>{t("createJob.maxVehicles")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} min={1} max={12} value={taskTemplateForm.maxVehicles} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, maxVehicles: Number(event.target.value) }))} type="number" /></label>
                  <label>{t("createJob.progressBy")}<select disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} value={taskTemplateForm.progressMetric} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, progressMetric: event.target.value as ProgressMetric }))}>{taskMetrics.map((item) => <option key={item} value={item}>{t(`metrics.${item}`)}</option>)}</select></label>
                  <label>{t("masterData.taskUnit")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} placeholder={t("masterData.taskUnitPlaceholder")} value={taskTemplateForm.unit} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, unit: event.target.value }))} /></label>
                  <label>{t("pricing.billingUnit")}<select disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} value={taskTemplateForm.billingUnit} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, billingUnit: event.target.value as BillingUnit }))}>
                    <option value="ha">{t("pricing.units.ha")}</option>
                    <option value="hour">{t("pricing.units.hour")}</option>
                    <option value="trip">{t("pricing.units.trip")}</option>
                    <option value="quantity">{t("pricing.units.quantity")}</option>
                    <option value="flat">{t("pricing.units.flat")}</option>
                  </select></label>
                  <label>{t("pricing.standardPrice")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} value={taskTemplateForm.standardPrice} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, standardPrice: event.target.value }))} inputMode="decimal" /></label>
                  <label>{t("pricing.currency")}<select disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} value={taskTemplateForm.standardPriceCurrency} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, standardPriceCurrency: event.target.value }))}>{productCurrencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
                  <label>{t("pricing.validFrom")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} value={taskTemplateForm.standardPriceValidFrom} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, standardPriceValidFrom: event.target.value }))} type="date" /></label>
                  <label>{t("pricing.validTo")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} value={taskTemplateForm.standardPriceValidTo} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, standardPriceValidTo: event.target.value }))} type="date" /></label>
                  <label>{t("terms.driver")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} min={0} max={10} value={taskTemplateForm.requiredDrivers} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, requiredDrivers: Number(event.target.value) }))} type="number" /></label>
                  <label>{t("terms.vehicle")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} min={0} max={10} value={taskTemplateForm.requiredVehicles} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, requiredVehicles: Number(event.target.value) }))} type="number" /></label>
                  <label>{t("terms.implement")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} min={0} max={10} value={taskTemplateForm.requiredImplements} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, requiredImplements: Number(event.target.value) }))} type="number" /></label>
                  <label>{t("createJob.subtasks")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} value={taskTemplateForm.workSteps} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, workSteps: event.target.value }))} /></label>
                  <label>{t("createJob.resourceNeed")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} value={taskTemplateForm.resourceHint} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, resourceHint: event.target.value }))} /></label>
                  {currentRole === "support_admin" && (
                    <label>{t("masterData.templateOwner")}<input disabled value={taskTemplateOwnerLabel(selectedTaskTemplate)} /></label>
                  )}
                  <label>{t("mapStatus.label")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} placeholder={t("mapStatus.none")} value={taskTemplateForm.mapStyleLabel} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, mapStyleLabel: event.target.value }))} /></label>
                  <label>{t("mapStatus.color")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates || !taskTemplateForm.mapStyleLabel.trim()} value={taskTemplateForm.mapStyleColor} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, mapStyleColor: event.target.value }))} type="color" /></label>
                  <label>{t("mapStatus.pattern")}<select disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates || !taskTemplateForm.mapStyleLabel.trim()} value={taskTemplateForm.mapStylePattern} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, mapStylePattern: event.target.value as FieldMapPattern }))}>{mapPatterns.map((pattern) => <option key={pattern} value={pattern}>{t(`mapStatus.patterns.${pattern}`)}</option>)}</select></label>
                </div>
                <div className="field-help-box">
                  <strong>{t("createJob.workModeHelpTitle")}</strong>
                  <span>{t("createJob.workModeHelpSingle")}</span>
                  <span>{t("createJob.workModeHelpTeam")}</span>
                  <span>{t("createJob.workModeHelpRole")}</span>
                  <span>{t("createJob.workModeHelpSplit")}</span>
                </div>
                <div className="modal-actions">
                  {canEditSelectedTaskTemplate && !showArchivedTaskTemplates && (
                    <button className="danger-action" onClick={archiveSelectedTaskTemplate} type="button">
                      <Archive size={16} /> {t("actions.archive")}
                    </button>
                  )}
                  {canEditSelectedTaskTemplate && showArchivedTaskTemplates && (
                    <button className="danger-action" onClick={requestDeleteSelectedTaskTemplate} type="button">
                      <Trash2 size={16} /> {t("actions.deletePermanent")}
                    </button>
                  )}
                  {canEditSelectedTaskTemplate && !showArchivedTaskTemplates && (
                    <button className="primary-action" onClick={saveTaskTemplate} type="button">
                      <Save size={16} /> {t("masterData.saveChanges")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeSection === "jobTypes" && (
        <div className="panel resource-master-page">
          <div className="section-heading master-detail-heading">
            <h2>{t("contractor.jobTypeMasterData")}</h2>
            <div className="modal-actions">
              <span className="master-overview-total">{showArchivedJobTypes ? archivedJobTypes.length : activeJobTypes.length}</span>
              <button className="secondary-action icon-action" onClick={() => setActiveSection("masterOverview")} type="button">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="master-overview-examples">
            <strong>{t("masterDataOverview.workChainExamplesTitle")}</strong>
            <span>{t("masterDataOverview.workChainExampleSilage")}</span>
            <span>{t("masterDataOverview.workChainExampleSlurry")}</span>
            <span>{t("masterDataOverview.workChainExampleBales")}</span>
          </div>
          <div className="resource-editor-block">
            <div className="section-heading">
              <h2>{t("masterData.jobType")}</h2>
              <div className="modal-actions">
                <div className="segmented-control archive-toggle category-archive-toggle">
                  <button className={!showArchivedJobTypes ? "active" : ""} onClick={() => setShowArchivedJobTypes(false)} type="button">
                    {t("archive.active")} · {activeJobTypes.length}
                  </button>
                  <button className={showArchivedJobTypes ? "active" : ""} onClick={() => setShowArchivedJobTypes(true)} type="button">
                    {t("archive.archived")} · {archivedJobTypes.length}
                  </button>
                </div>
                {canEditSelectedJobType && selectedJobType && !showArchivedJobTypes && (
                  <button className="primary-action" onClick={saveJobType} type="button">
                    <Save size={16} /> {t("masterData.saveChanges")}
                  </button>
                )}
                {canEditSelectedJobType && selectedJobType && !showArchivedJobTypes && (
                  <button className="danger-action" onClick={archiveSelectedJobType} type="button">
                    <Archive size={16} /> {t("actions.archive")}
                  </button>
                )}
                {canEditSelectedJobType && selectedJobType && showArchivedJobTypes && (
                  <button className="danger-action" onClick={requestDeleteSelectedJobType} type="button">
                    <Trash2 size={16} /> {t("actions.deletePermanent")}
                  </button>
                )}
                {canManageOwnTemplates && !showArchivedJobTypes && (
                  <button className="secondary-action" onClick={createJobType} type="button">
                    <Plus size={16} /> {t("masterData.newJobType")}
                  </button>
                )}
              </div>
            </div>
            <div className="form-row resource-form-row master-inline-form">
              <label>
                {t("createJob.jobType")}
                <input disabled={!canEditSelectedJobType || showArchivedJobTypes} value={jobTypeForm.name} onChange={(event) => setJobTypeForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label>
                {t("createJob.plannedCrews")}
                <input disabled={!canEditSelectedJobType || showArchivedJobTypes} min={1} max={8} value={jobTypeForm.defaultCrews} onChange={(event) => setJobTypeForm((current) => ({ ...current, defaultCrews: Number(event.target.value) }))} type="number" />
              </label>
              <label>
                {t("createJob.estimatedHours")}
                <input disabled={!canEditSelectedJobType || showArchivedJobTypes} min={0.5} max={48} step={0.5} value={jobTypeForm.defaultEstimatedHours} onChange={(event) => setJobTypeForm((current) => ({ ...current, defaultEstimatedHours: Number(event.target.value) }))} type="number" />
              </label>
              <label>
                {t("createJob.resourceNeed")}
                <input disabled={!canEditSelectedJobType || showArchivedJobTypes} value={jobTypeForm.resourceSummary} onChange={(event) => setJobTypeForm((current) => ({ ...current, resourceSummary: event.target.value }))} />
              </label>
              <label>
                {t("masterData.description")}
                <input disabled={!canEditSelectedJobType || showArchivedJobTypes} value={jobTypeForm.description} onChange={(event) => setJobTypeForm((current) => ({ ...current, description: event.target.value }))} />
              </label>
            </div>
            {selectedJobType && (
              <div className="resource-need-box">
                <strong>{t("createJob.tasksRules")}</strong>
                {canEditSelectedJobType && !showArchivedJobTypes && (
                  <div className="job-type-task-add">
                    <select value={jobTypeTaskToAdd} onChange={(event) => setJobTypeTaskToAdd(event.target.value)}>
                      <option value="">{t("createJob.selectOption")}</option>
                      {taskTemplates.map((taskTemplate) => <option key={taskTemplate.id} value={taskTemplate.id}>{taskTemplate.name}</option>)}
                    </select>
                    <button className="secondary-action" disabled={!jobTypeTaskToAdd} onClick={addTaskToSelectedJobType} type="button">
                      <Plus size={16} /> {t("masterData.addTaskToJobType")}
                    </button>
                  </div>
                )}
                {selectedJobType.tasks.length === 0 ? (
                  <span>{t("masterData.noJobTypeTasks")}</span>
                ) : (
                  selectedJobType.tasks.map((task) => (
                    <div className="job-type-task-editor" key={task.id}>
                      <label>{t("terms.task")}<input disabled={!canEditSelectedJobType || showArchivedJobTypes} value={task.name} onChange={(event) => updateSelectedJobTypeTask(task.id, { name: event.target.value })} /></label>
                      <label>{t("createJob.workMode")}<select disabled={!canEditSelectedJobType || showArchivedJobTypes} value={task.mode} onChange={(event) => {
                        const nextMode = event.target.value as WorkMode;
                        updateSelectedJobTypeTask(task.id, {
                          mode: nextMode,
                          allowMultipleWorkers: nextMode !== "Einzelmodus",
                          maxVehicles: nextMode === "Einzelmodus" ? 1 : task.maxVehicles,
                        });
                      }}>{taskModes.map((item) => <option key={item} value={item}>{t(`mode.${item}`)}</option>)}</select></label>
                      <label>{t("createJob.maxVehicles")}<input disabled={!canEditSelectedJobType || showArchivedJobTypes} min={1} max={12} value={task.maxVehicles} onChange={(event) => updateSelectedJobTypeTask(task.id, { maxVehicles: Number(event.target.value) })} type="number" /></label>
                      <label>{t("createJob.progressBy")}<select disabled={!canEditSelectedJobType || showArchivedJobTypes} value={task.progressMetric[0] ?? "Fläche"} onChange={(event) => updateSelectedJobTypeTask(task.id, { progressMetric: [event.target.value as ProgressMetric] })}>{taskMetrics.map((item) => <option key={item} value={item}>{t(`metrics.${item}`)}</option>)}</select></label>
                      <label>{t("createJob.hoursPerHa")}<input disabled={!canEditSelectedJobType || showArchivedJobTypes} min={0} max={10} step={0.01} value={task.timePerHa ?? 0} onChange={(event) => updateSelectedJobTypeTask(task.id, { timePerHa: Number(event.target.value) })} type="number" /></label>
                      <label>{t("terms.driver")}<input disabled={!canEditSelectedJobType || showArchivedJobTypes} min={0} max={10} value={task.requiredDrivers ?? 0} onChange={(event) => updateSelectedJobTypeTask(task.id, { requiredDrivers: Number(event.target.value) })} type="number" /></label>
                      <label>{t("terms.vehicle")}<input disabled={!canEditSelectedJobType || showArchivedJobTypes} min={0} max={10} value={task.requiredVehicles ?? 0} onChange={(event) => updateSelectedJobTypeTask(task.id, { requiredVehicles: Number(event.target.value) })} type="number" /></label>
                      <label>{t("terms.implement")}<input disabled={!canEditSelectedJobType || showArchivedJobTypes} min={0} max={10} value={task.requiredImplements ?? 0} onChange={(event) => updateSelectedJobTypeTask(task.id, { requiredImplements: Number(event.target.value) })} type="number" /></label>
                      <label>{t("createJob.resourceNeed")}<input disabled={!canEditSelectedJobType || showArchivedJobTypes} value={task.resourceHint ?? ""} onChange={(event) => updateSelectedJobTypeTask(task.id, { resourceHint: event.target.value })} /></label>
                      <label>{t("mapStatus.label")}<input disabled={!canEditSelectedJobType || showArchivedJobTypes} placeholder={t("mapStatus.none")} value={task.mapStyle?.label ?? ""} onChange={(event) => updateSelectedJobTypeTask(task.id, { mapStyle: event.target.value.trim() ? { label: event.target.value, color: task.mapStyle?.color ?? "#7fcf6b", pattern: task.mapStyle?.pattern ?? "none" } : undefined })} /></label>
                      <label>{t("mapStatus.color")}<input disabled={!canEditSelectedJobType || showArchivedJobTypes || !task.mapStyle?.label} value={task.mapStyle?.color ?? "#7fcf6b"} onChange={(event) => updateSelectedJobTypeTask(task.id, { mapStyle: { label: task.mapStyle?.label ?? task.name, color: event.target.value, pattern: task.mapStyle?.pattern ?? "none" } })} type="color" /></label>
                      <label>{t("mapStatus.pattern")}<select disabled={!canEditSelectedJobType || showArchivedJobTypes || !task.mapStyle?.label} value={task.mapStyle?.pattern ?? "none"} onChange={(event) => updateSelectedJobTypeTask(task.id, { mapStyle: { label: task.mapStyle?.label ?? task.name, color: task.mapStyle?.color ?? "#7fcf6b", pattern: event.target.value as FieldMapPattern } })}>{mapPatterns.map((pattern) => <option key={pattern} value={pattern}>{t(`mapStatus.patterns.${pattern}`)}</option>)}</select></label>
                      {canEditSelectedJobType && !showArchivedJobTypes && (
                        <button className="danger-action" onClick={() => removeSelectedJobTypeTask(task.id)} type="button">
                          <Trash2 size={16} /> {t("masterData.removeTaskFromJobType")}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="resource-list-panel master-list-full">
            {visibleJobTypes.length === 0 && (
              <p className="permission-note">{showArchivedJobTypes ? t("archive.noArchivedJobTypes") : t("masterData.newJobType")}</p>
            )}
            {visibleJobTypes.map((jobType) => (
              <button
                className={jobType.id === selectedJobType?.id ? "roster-item active" : "roster-item"}
                key={jobType.id}
                onClick={() => setSelectedJobTypeId(jobType.id)}
                type="button"
              >
                <strong>{jobType.name}</strong>
                <span>{jobType.defaultCrews} {t("contractor.crews")} · {jobType.resourceSummary}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {activeSection === "programSettings" && (
        <div className="panel resource-master-page program-settings-page">
          <div className="section-heading master-detail-heading">
            <h2>{t("contractor.programSettings")}</h2>
            <div className="modal-actions">
              <span>{t("contractor.dispatchSettings")}</span>
              <button className="secondary-action icon-action" onClick={() => setActiveSection("masterOverview")} type="button">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="resource-editor-block">
            <div className="form-row modal-form-row">
              <label>
                {t("contractor.standardVehiclePlanning")}
                <select value={standardVehicleMode} onChange={(event) => setStandardVehicleMode(event.target.value as StandardVehiclePlanningMode)}>
                  <option value="none">{t("contractor.standardVehicleNever")}</option>
                  <option value="automatic">{t("contractor.standardVehicleAutomatic")}</option>
                  <option value="ask">{t("contractor.standardVehicleAsk")}</option>
                </select>
              </label>
	              <label>
	                {t("contractor.mapProvider")}
	                <select value={mapProviderPreference} onChange={(event) => setMapProviderPreference(event.target.value as MapProviderPreference)}>
                  <option value="osm">{t("contractor.mapProviderOsm")}</option>
                  <option value="google">{t("contractor.mapProviderGoogle")}</option>
                  <option value="hitta_se">{t("contractor.mapProviderHitta")}</option>
                  <option value="lantmateriet">{t("contractor.mapProviderLantmateriet")}</option>
	                </select>
	              </label>
	              <label>
	                {t("contractor.dispatchGroupingLevel")}
	                <select value={dispatchGroupingLevel} onChange={(event) => setDispatchGroupingLevel(event.target.value as DispatchGroupingLevel)}>
	                  <option value="task">{t("contractor.dispatchGroupingByTask")}</option>
	                  <option value="job_task">{t("contractor.dispatchGroupingByJobTask")}</option>
	                </select>
	              </label>
                <label>
                  {t("masterData.employeeTimeEditWindowDays")}
                  <input
                    min={0}
                    max={90}
                    step={1}
                    type="number"
                    value={employeeTimeEditWindowDays}
                    onChange={(event) => setEmployeeTimeEditWindowDays(Math.max(0, Math.round(Number(event.target.value) || 0)))}
                  />
                </label>
	            </div>
	            <p className="resource-editor-summary">{t("contractor.standardVehiclePlanningHint")}</p>
	            <p className="resource-editor-summary">{t("contractor.dispatchGroupingHint")}</p>
	            <p className="resource-editor-summary">{t("contractor.mapProviderHint")}</p>
	            <p className="resource-editor-summary">{t("masterData.employeeTimeEditWindowHint", { days: employeeTimeEditWindowDays })}</p>
          </div>
          {currentRole === "support_admin" && (
            <div className="resource-editor-block support-user-management-block">
              <div className="section-heading compact-heading">
                <div>
                  <h2><Users size={20} /> {t("contractor.userManagement")}</h2>
                  <p>{t("contractor.userManagementHint")}</p>
                </div>
                <span>{activeOrganizations.filter((organization) => organization.kind === "farmer" || organization.kind === "contractor").length}</span>
              </div>
              <div className="user-management-list">
                {activeOrganizations
                  .filter((organization) => organization.kind === "farmer" || organization.kind === "contractor")
                  .map((organization) => {
                    const counts = organizationOperationalCounts(organization.id);
                    return (
                      <article className="user-management-row" key={organization.id}>
                        <span className="user-management-kind">{t(`masterData.organizationKinds.${organization.kind}`)}</span>
                        <strong>{organization.name}</strong>
                        <span>{organization.email || t("masterData.noContactData")}</span>
                        <span>{formatOrganizationAddress(organization) || t("masterData.noAddress")}</span>
                        <span>{t("contractor.operationalDataCount", { jobs: counts.jobs, subtasks: counts.subtasks })}</span>
                        <span className="user-management-actions">
                          <button className="secondary-action compact-action" onClick={() => openOrganizationEditor(organization)} type="button">
                            <UserPlus size={16} /> {t("contractor.manageLogin")}
                          </button>
                          <button
                            className="danger-action compact-action"
                            disabled={!onResetOrganizationOperationalData}
                            onClick={() => setResetOrganizationConfirm(organization)}
                            title={counts.jobs === 0 && counts.subtasks === 0 ? t("contractor.resetOrganizationPossibleHiddenData") : undefined}
                            type="button"
                          >
                            <Trash2 size={16} /> {t("contractor.resetOrganizationData")}
                          </button>
                        </span>
                      </article>
                    );
                  })}
              </div>
              {resetOrganizationStatus && <p className="permission-note">{resetOrganizationStatus}</p>}
              {activeOrganizations.filter((organization) => organization.kind === "farmer" || organization.kind === "contractor").length === 0 && (
                <p className="permission-note">{t("masterData.organizationDirectoryEmpty.contacts")}</p>
              )}
            </div>
          )}
        </div>
      )}
      {isOrganizationModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal" role="dialog" aria-modal="true" aria-labelledby="organization-modal-title">
            <div className="section-heading">
              <h2 id="organization-modal-title">{creatingOrganization ? t("masterData.newOrganization") : t("masterData.editOrganization")}</h2>
              <button className="secondary-action icon-action" onClick={() => setIsOrganizationModalOpen(false)} type="button">
                <X size={18} />
              </button>
            </div>
            <div className="form-row resource-form-row modal-form-row">
              <label>
                {t("masterData.organizationName")}
                <input disabled={!canEditSelectedOrganization} value={organizationForm.name} onChange={(event) => setOrganizationForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label>
                {t("masterData.organizationNumber")}
                <input disabled={!canEditSelectedOrganization} value={organizationForm.organizationNumber} onChange={(event) => setOrganizationForm((current) => ({ ...current, organizationNumber: event.target.value }))} />
              </label>
              <label>
                {t("masterData.organizationKind")}
                <select disabled={!canEditSelectedOrganization || (!creatingOrganization && !canManageContactOrganizations && currentRole !== "support_admin")} value={organizationForm.kind} onChange={(event) => setOrganizationForm((current) => ({ ...current, kind: event.target.value as Organization["kind"] }))}>
                  <option value="farmer">{t("masterData.farmerOrganization")}</option>
                  <option value="contractor">{t("masterData.contractorOrganization")}</option>
                  <option value="advisor">{t("masterData.organizationKinds.advisor")}</option>
                  <option value="supplier">{t("masterData.organizationKinds.supplier")}</option>
                  <option value="other">{t("masterData.organizationKinds.other")}</option>
                </select>
                {!creatingOrganization && !canManageContactOrganizations && currentRole !== "support_admin" && <small>{t("masterData.organizationKindLockedHint")}</small>}
              </label>
              <label>
                {t("masterData.street")}
                <input disabled={!canEditSelectedOrganization} value={organizationForm.street} onChange={(event) => setOrganizationForm((current) => ({ ...current, street: event.target.value }))} />
              </label>
              <label>
                {t("masterData.country")}
                <input disabled={!canEditSelectedOrganization} value={organizationForm.country} onChange={(event) => setOrganizationForm((current) => ({ ...current, country: event.target.value }))} />
              </label>
              <label>
                {t("masterData.postalCode")}
                <input disabled={!canEditSelectedOrganization} value={organizationForm.postalCode} onChange={(event) => setOrganizationForm((current) => ({ ...current, postalCode: event.target.value }))} />
              </label>
              <label>
                {t("masterData.city")}
                <input disabled={!canEditSelectedOrganization} value={organizationForm.city} onChange={(event) => setOrganizationForm((current) => ({ ...current, city: event.target.value }))} />
              </label>
              <label>
                {t("masterData.queryPhone")}
                <input disabled={!canEditSelectedOrganization} value={organizationForm.phone} onChange={(event) => setOrganizationForm((current) => ({ ...current, phone: event.target.value }))} />
              </label>
              <label>
                {t("masterData.contactMobile")}
                <input disabled={!canEditSelectedOrganization} value={organizationForm.mobile} onChange={(event) => setOrganizationForm((current) => ({ ...current, mobile: event.target.value }))} />
              </label>
              <label>
                {t("masterData.email")}
                <input disabled={!canEditSelectedOrganization} type="email" value={organizationForm.email} onChange={(event) => setOrganizationForm((current) => ({ ...current, email: event.target.value }))} />
              </label>
              <label>
                {t("masterData.website")}
                <input disabled={!canEditSelectedOrganization} value={organizationForm.website} onChange={(event) => setOrganizationForm((current) => ({ ...current, website: event.target.value }))} />
              </label>
              <label>
                {t("masterData.vatId")}
                <input disabled={!canEditSelectedOrganization} value={organizationForm.vatId} onChange={(event) => setOrganizationForm((current) => ({ ...current, vatId: event.target.value }))} />
              </label>
              <label>
                {t("masterData.customerNumber")}
                <input disabled={!canEditSelectedOrganization} value={organizationForm.customerNumber} onChange={(event) => setOrganizationForm((current) => ({ ...current, customerNumber: event.target.value }))} />
              </label>
              <label>
                {t("masterData.supplierCategory")}
                <input disabled={!canEditSelectedOrganization} value={organizationForm.supplierCategory} onChange={(event) => setOrganizationForm((current) => ({ ...current, supplierCategory: event.target.value }))} />
              </label>
              <label>
                {t("masterData.defaultLanguage")}
                <select disabled={!canEditSelectedOrganization} value={organizationForm.defaultLanguage} onChange={(event) => setOrganizationForm((current) => ({ ...current, defaultLanguage: event.target.value }))}>
                  <option value="">{t("masterData.noDefaultLanguage")}</option>
                  <option value="de">Deutsch</option>
                  <option value="en">English</option>
                  <option value="sv">Svenska</option>
                </select>
              </label>
              <label>
                {t("masterData.logo")}
                <input disabled={!canEditSelectedOrganization} accept="image/*" onChange={(event) => uploadOrganizationLogo(event.target.files?.[0])} type="file" />
                {organizationForm.logoUrl && (
                  <span className="organization-logo-preview">
                    <img alt="" src={organizationForm.logoUrl} />
                    <small>{t("masterData.logoStored")}</small>
                  </span>
                )}
              </label>
              <label>
                {t("masterData.billingDetails")}
                <input disabled={!canEditSelectedOrganization} value={organizationForm.billingDetails} onChange={(event) => setOrganizationForm((current) => ({ ...current, billingDetails: event.target.value }))} />
              </label>
              <label>
                {t("terms.notes")}
                <input disabled={!canEditSelectedOrganization} value={organizationForm.notes} onChange={(event) => setOrganizationForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <div className="customer-conditions-editor wide-form-field">
                <div className="customer-conditions-toolbar">
                  <div>
                    <h3>{t("pricing.customerConditions")}</h3>
                    <p>{t("pricing.customerConditionsHint")}</p>
                  </div>
                  {canEditSelectedOrganization && (
                    <button className="secondary-action" onClick={addCustomerConditionRow} type="button">
                      <Plus size={16} /> {t("pricing.addCondition")}
                    </button>
                  )}
                </div>
                {organizationForm.customerConditionRows.length === 0 ? (
                  <p className="permission-note">{t("pricing.noCustomerConditions")}</p>
                ) : (
                  <div className="customer-condition-table">
                    <div className="customer-condition-row customer-condition-head">
                      <span>{t("terms.task")}</span>
                      <span>{t("pricing.billingUnit")}</span>
                      <span>{t("pricing.standardPrice")}</span>
                      <span>{t("pricing.currency")}</span>
                      <span>{t("pricing.validFrom")}</span>
                      <span>{t("pricing.validTo")}</span>
                      <span>{t("report.actions")}</span>
                    </div>
                    {organizationForm.customerConditionRows.map((row) => (
                      <div className="customer-condition-row" key={row.id}>
                        <select disabled={!canEditSelectedOrganization} value={row.taskName} onChange={(event) => {
                          const selectedTemplate = taskTemplates.find((template) => template.name === event.target.value);
                          const templateCondition = billingConditionFromTaskTemplate(selectedTemplate);
                          updateCustomerConditionRow(row.id, {
                            taskName: event.target.value,
                            billingUnit: templateCondition.billingUnit ?? row.billingUnit,
                            price: row.price ?? templateCondition.price,
                            currency: row.currency || templateCondition.currency || "SEK",
                          });
                        }}>
                          <option value="">{t("pricing.selectTask")}</option>
                          {taskTemplates.map((template) => <option key={template.id} value={template.name}>{template.name}</option>)}
                        </select>
                        <select disabled={!canEditSelectedOrganization} value={row.billingUnit} onChange={(event) => updateCustomerConditionRow(row.id, { billingUnit: event.target.value as BillingUnit })}>
                          <option value="ha">{t("pricing.units.ha")}</option>
                          <option value="hour">{t("pricing.units.hour")}</option>
                          <option value="trip">{t("pricing.units.trip")}</option>
                          <option value="quantity">{t("pricing.units.quantity")}</option>
                          <option value="flat">{t("pricing.units.flat")}</option>
                        </select>
                        <input disabled={!canEditSelectedOrganization} inputMode="decimal" value={row.price ?? ""} onChange={(event) => updateCustomerConditionRow(row.id, { price: optionalNumberFromForm(event.target.value) })} />
                        <select disabled={!canEditSelectedOrganization} value={row.currency ?? "SEK"} onChange={(event) => updateCustomerConditionRow(row.id, { currency: event.target.value })}>
                          {productCurrencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                        </select>
                        <input disabled={!canEditSelectedOrganization} type="date" value={row.validFrom ?? ""} onChange={(event) => updateCustomerConditionRow(row.id, { validFrom: event.target.value })} />
                        <input disabled={!canEditSelectedOrganization} type="date" value={row.validTo ?? ""} onChange={(event) => updateCustomerConditionRow(row.id, { validTo: event.target.value })} />
                        <button className="secondary-action compact-action" disabled={!canEditSelectedOrganization} onClick={() => removeCustomerConditionRow(row.id)} type="button">
                          <Trash2 size={16} /> {t("actions.delete")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="resource-editor-block contact-editor-block">
              <div className="section-heading">
                <h2>{t("masterData.contacts")}</h2>
                {canEditSelectedOrganization && (
                  <button className="secondary-action" onClick={addOrganizationContact} type="button">
                    <Plus size={16} /> {t("masterData.addContact")}
                  </button>
                )}
              </div>
              <div className="contact-list-editor">
                {organizationForm.contacts.length === 0 && <p className="permission-note">{t("masterData.noContacts")}</p>}
                {organizationForm.contacts.map((contact) => (
                  <div className="contact-editor-card" key={contact.id}>
                    <label>{t("masterData.contactName")}<input disabled={!canEditSelectedOrganization} value={contact.name} onChange={(event) => updateOrganizationContact(contact.id, { name: event.target.value })} /></label>
                    <label>{t("masterData.contactRole")}<input disabled={!canEditSelectedOrganization} value={contact.role ?? ""} onChange={(event) => updateOrganizationContact(contact.id, { role: event.target.value })} /></label>
                    <label>{t("masterData.queryPhone")}<input disabled={!canEditSelectedOrganization} value={contact.phone ?? ""} onChange={(event) => updateOrganizationContact(contact.id, { phone: event.target.value })} /></label>
                    <label>{t("masterData.contactMobile")}<input disabled={!canEditSelectedOrganization} value={contact.mobile ?? ""} onChange={(event) => updateOrganizationContact(contact.id, { mobile: event.target.value })} /></label>
                    <label>{t("masterData.sms")}<input disabled={!canEditSelectedOrganization} value={contact.sms ?? ""} onChange={(event) => updateOrganizationContact(contact.id, { sms: event.target.value })} /></label>
                    <label>{t("masterData.email")}<input disabled={!canEditSelectedOrganization} type="email" value={contact.email ?? ""} onChange={(event) => updateOrganizationContact(contact.id, { email: event.target.value })} /></label>
                    <label>{t("terms.notes")}<input disabled={!canEditSelectedOrganization} value={contact.notes ?? ""} onChange={(event) => updateOrganizationContact(contact.id, { notes: event.target.value })} /></label>
                    {canEditSelectedOrganization && (
                      <button className="danger-action" onClick={() => removeOrganizationContact(contact.id)} type="button">
                        <Trash2 size={16} /> {t("actions.delete")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {!creatingOrganization && ["farmer", "contractor"].includes(organizationForm.kind) && (
              <div className="resource-editor-block contact-editor-block">
                <div className="section-heading">
                  <h2>{t("masterData.organizationLoginTitle")}</h2>
                  <span>{t(`roles.${organizationAdminRole({ ...selectedOrganization, ...organizationForm })}`)}</span>
                </div>
                <p className="permission-note">{t("masterData.organizationLoginHint")}</p>
                <div className="organization-login-row">
                  <label>
                    {t("masterData.email")}
                    <input disabled={!canEditSelectedOrganization} type="email" value={organizationForm.email} onChange={(event) => setOrganizationForm((current) => ({ ...current, email: event.target.value }))} />
                  </label>
                  <label>
                    {t("masterData.organizationPassword")} <small>{t("masterData.driverPasswordMinLength")}</small>
                    <input disabled={!canEditSelectedOrganization} type="text" value={organizationLoginPassword} onChange={(event) => setOrganizationLoginPassword(event.target.value)} />
                  </label>
                  <button className="secondary-action organization-login-generate" disabled={!canEditSelectedOrganization} onClick={() => setOrganizationLoginPassword(generateOrganizationPassword())} type="button">
                    {t("masterData.generateDriverPassword")}
                  </button>
                  <button className="primary-action" disabled={!canEditSelectedOrganization} onClick={createOrganizationAdminLogin} type="button">
                    <UserPlus size={16} /> {t("masterData.createOrganizationLogin")}
                  </button>
                  <button className="secondary-action" disabled={!organizationForm.email || !organizationLoginPassword} onClick={openOrganizationAccessMail} type="button">
                    <Mail size={16} /> {t("masterData.sendAccessByEmail")}
                  </button>
                </div>
                {organizationLoginStatus && <p className="permission-note">{organizationLoginStatus}</p>}
              </div>
            )}
            <div className="modal-actions">
              {organizationDirectoryMode !== "company" && canEditSelectedOrganization && !showArchivedOrganizations && !creatingOrganization && (
                <button className="danger-action" onClick={archiveSelectedOrganization} type="button">
                  <Archive size={16} /> {t("actions.archive")}
                </button>
              )}
              {organizationDirectoryMode !== "company" && canEditSelectedOrganization && showArchivedOrganizations && !creatingOrganization && (
                <button className="danger-action" onClick={requestDeleteSelectedOrganization} type="button">
                  <Trash2 size={16} /> {t("actions.deletePermanent")}
                </button>
              )}
              {canEditSelectedOrganization && !showArchivedOrganizations && (
                <button className="primary-action" onClick={saveOrganization} type="button">
                  <Save size={16} /> {t("masterData.saveChanges")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {standardVehicleChoice && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal" role="dialog" aria-modal="true" aria-labelledby="standard-vehicle-choice-title">
            <div className="section-heading">
              <div>
                <h2 id="standard-vehicle-choice-title">{t("contractor.standardVehicleDialogTitle")}</h2>
                <p>{standardVehicleChoiceDriver?.name}</p>
              </div>
              <button className="secondary-action icon-action" onClick={() => setStandardVehicleChoice(null)} type="button">
                <X size={18} />
              </button>
            </div>
            <p className="resource-editor-summary">
              {standardVehicleChoiceVehicle
                ? t("contractor.standardVehicleDialogText", { vehicle: standardVehicleChoiceVehicle.name })
                : t("contractor.noStandardVehicleFound")}
            </p>
            <div className="resource-need-box">
              {standardVehicleChoiceVehicle && (
                <button className="primary-action" onClick={() => confirmStandardVehicleChoice(standardVehicleChoiceVehicle.id)} type="button">
                  <Truck size={16} /> {t("contractor.planStandardVehicle", { vehicle: standardVehicleChoiceVehicle.name })}
                </button>
              )}
              {alternativeVehicleChoices.map((vehicle) => (
                <button className="secondary-action" key={vehicle.id} onClick={() => confirmStandardVehicleChoice(vehicle.id)} type="button">
                  <Truck size={16} /> {t("contractor.planAlternativeVehicle", { vehicle: vehicle.name })}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="secondary-action" onClick={() => confirmStandardVehicleChoice()} type="button">
                {t("contractor.planDriverOnly")}
              </button>
            </div>
          </div>
        </div>
      )}
      {workTimeOverride && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal warning-modal" role="dialog" aria-modal="true" aria-labelledby="worktime-warning-title">
            <div className="section-heading">
              <h2 id="worktime-warning-title">{t("contractor.workTimeWarning")}</h2>
              <button className="secondary-action icon-action" onClick={() => setWorkTimeOverride(null)} type="button">
                <X size={18} />
              </button>
            </div>
            <p>
              {t("contractor.workTimeWarningText", {
                planned: formatHours(workTimeOverride.planned),
                added: formatHours(workTimeOverride.added),
                total: formatHours(workTimeOverride.planned + workTimeOverride.added),
                max: formatHours(workTimeOverride.max),
              })}
            </p>
            <div className="modal-actions">
              <button className="primary-action" onClick={confirmWorkTimeOverride} type="button">
                {t("contractor.overrideWorkTime")}
              </button>
            </div>
          </div>
        </div>
      )}
      {moveResourceConfirm && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal warning-modal" role="dialog" aria-modal="true" aria-labelledby="move-resource-confirm-title">
            <div className="section-heading">
              <h2 id="move-resource-confirm-title">{t("contractor.moveJobWithResourcesTitle")}</h2>
              <button className="secondary-action icon-action" onClick={() => setMoveResourceConfirm(null)} type="button">
                <X size={18} />
              </button>
            </div>
            <p>{t("contractor.keepResourcesOnMove")}</p>
            <div className="modal-actions">
              <button className="secondary-action" onClick={() => confirmMoveJobWithResources(false)} type="button">
                {t("contractor.moveWithoutResources")}
              </button>
              <button className="primary-action" onClick={() => confirmMoveJobWithResources(true)} type="button">
                {t("contractor.keepResourcesAndMove")}
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteOrganizationConfirm && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal warning-modal" role="dialog" aria-modal="true">
            <div className="section-heading">
              <h2>{t("actions.deletePermanent")}</h2>
              <button className="secondary-action icon-action" onClick={() => setDeleteOrganizationConfirm(null)} type="button">
                <X size={18} />
              </button>
            </div>
            <p>{t("archive.confirmPermanentDelete", { item: deleteOrganizationConfirm.name })}</p>
            <div className="modal-actions">
              <button className="danger-action" onClick={confirmDeleteSelectedOrganization} type="button"><Trash2 size={16} /> {t("actions.deletePermanent")}</button>
            </div>
          </div>
        </div>
      )}
      {deleteResourceConfirm && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal warning-modal" role="dialog" aria-modal="true">
            <div className="section-heading">
              <h2>{t("actions.deletePermanent")}</h2>
              <button className="secondary-action icon-action" onClick={() => setDeleteResourceConfirm(null)} type="button">
                <X size={18} />
              </button>
            </div>
            <p>{t("archive.confirmPermanentDelete", { item: deleteResourceConfirm.name })}</p>
            <div className="modal-actions">
              <button className="danger-action" onClick={confirmDeleteSelectedResource} type="button"><Trash2 size={16} /> {t("actions.deletePermanent")}</button>
            </div>
          </div>
        </div>
      )}
      {deleteTaskTemplateConfirm && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal warning-modal" role="dialog" aria-modal="true">
            <div className="section-heading">
              <h2>{t("actions.deletePermanent")}</h2>
              <button className="secondary-action icon-action" onClick={() => setDeleteTaskTemplateConfirm(null)} type="button">
                <X size={18} />
              </button>
            </div>
            <p>{t("archive.confirmPermanentDelete", { item: deleteTaskTemplateConfirm.name })}</p>
            <div className="modal-actions">
              <button className="danger-action" onClick={confirmDeleteSelectedTaskTemplate} type="button"><Trash2 size={16} /> {t("actions.deletePermanent")}</button>
            </div>
          </div>
        </div>
      )}
      {deleteJobTypeConfirm && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal warning-modal" role="dialog" aria-modal="true">
            <div className="section-heading">
              <h2>{t("actions.deletePermanent")}</h2>
              <button className="secondary-action icon-action" onClick={() => setDeleteJobTypeConfirm(null)} type="button">
                <X size={18} />
              </button>
            </div>
            <p>{t("archive.confirmPermanentDelete", { item: deleteJobTypeConfirm.name })}</p>
            <div className="modal-actions">
              <button className="danger-action" onClick={confirmDeleteSelectedJobType} type="button"><Trash2 size={16} /> {t("actions.deletePermanent")}</button>
            </div>
          </div>
        </div>
      )}
      {resetOrganizationConfirm && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal warning-modal" role="dialog" aria-modal="true" aria-labelledby="reset-organization-title">
            <div className="section-heading">
              <div>
                <h2 id="reset-organization-title">{t("contractor.resetOrganizationDataTitle")}</h2>
                <p>{t("contractor.resetOrganizationDataHint", { organization: resetOrganizationConfirm.name })}</p>
              </div>
              <button className="secondary-action icon-action" onClick={() => setResetOrganizationConfirm(null)} type="button">
                <X size={18} />
              </button>
            </div>
            {(() => {
              const counts = organizationOperationalCounts(resetOrganizationConfirm.id);
              return (
                <div className="reset-organization-summary">
                  <strong>{resetOrganizationConfirm.name}</strong>
                  <span>{t(`masterData.organizationKinds.${resetOrganizationConfirm.kind}`)}</span>
                  <span>{t("contractor.operationalDataCount", { jobs: counts.jobs, subtasks: counts.subtasks })}</span>
                  <small>{t("contractor.resetOrganizationKeepsMasterData")}</small>
                </div>
              );
            })()}
            <div className="modal-actions">
              <button className="danger-action" onClick={() => { void confirmResetOrganizationOperationalData(); }} type="button">
                <Trash2 size={16} /> {t("contractor.resetOrganizationDataConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
      {reportPreview && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal report-preview-modal" role="dialog" aria-modal="true" aria-labelledby="report-preview-title">
            <div className="section-heading">
              <div>
                <h2 id="report-preview-title">{reportPreview.title}</h2>
                <p>{t("masterData.reportPreviewHint")}</p>
              </div>
              <div className="modal-actions">
                <button className="primary-action compact-action" onClick={printReportPreview} type="button">
                  <Printer size={16} /> {t("actions.print")}
                </button>
                <button className="secondary-action icon-action" onClick={() => setReportPreview(null)} type="button">
                  <X size={18} />
                </button>
              </div>
            </div>
            <iframe
              className="report-preview-frame"
              ref={reportPreviewFrameRef}
              srcDoc={reportPreview.html}
              title={reportPreview.title}
            />
          </div>
        </div>
      )}
    </section>
  );
}
