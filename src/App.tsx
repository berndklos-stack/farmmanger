import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Database,
  FileText,
  Map,
  Smartphone,
  Tractor,
  Users,
  X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import type { ElementType } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthLogin } from "./components/AuthLogin";
import { CompletionReport } from "./components/CompletionReport";
import { ContractorView } from "./components/ContractorView";
import { CreateJob } from "./components/CreateJob";
import { Dashboard } from "./components/Dashboard";
import { DriverView } from "./components/DriverView";
import { Fields } from "./components/Fields";
import { JobEditModal } from "./components/JobEditModal";
import { JobDetail } from "./components/JobDetail";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { UserRoleSwitcher } from "./components/UserRoleSwitcher";
import { DataProvider } from "./data/DataContext";
import { contractor as mockContractor, farmer as mockFarmer, jobTypes as mockJobTypes, organizations as mockOrganizations, taskTemplates as mockTaskTemplates } from "./data/mockData";
import { useSchlagLinkData } from "./hooks/useSchlagLinkData";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type { AuthProfile, Driver, DriverLocation, DriverLocationStatus, Field, Implement, Job, JobType, Organization, ProgressMetric, Status, Subtask, Task, TaskTemplate, UserRole, Vehicle, ViewKey, WorkMode } from "./types";

const navItems: { key: ViewKey; labelKey: string; icon: ElementType }[] = [
  { key: "dashboard", labelKey: "nav.dashboard", icon: BarChart3 },
  { key: "fields", labelKey: "nav.fields", icon: Map },
  { key: "jobs", labelKey: "nav.jobs", icon: ClipboardList },
  { key: "driver", labelKey: "nav.driver", icon: Smartphone },
  { key: "contractor", labelKey: "nav.contractor", icon: Users },
  { key: "masterData", labelKey: "nav.masterData", icon: Database },
  { key: "report", labelKey: "nav.report", icon: FileText },
];

type AppMode = "admin" | "driver" | "auto";

function getAppModeFromPath(pathname = window.location.pathname): AppMode {
  const normalized = pathname.toLowerCase();
  if (normalized.startsWith("/fahrer") || normalized.startsWith("/driver")) return "driver";
  if (normalized.startsWith("/admin")) return "admin";
  return "auto";
}

function initialViewForAppMode(appMode: AppMode): ViewKey {
  const requestedView = new URLSearchParams(window.location.search).get("view") as ViewKey | null;
  if (requestedView && navItems.some((item) => item.key === requestedView)) return requestedView;
  if (appMode === "driver") return "driver";
  return "dashboard";
}

function roleAllowedInAppMode(role: UserRole, appMode: AppMode) {
  if (appMode === "driver") return role === "driver";
  if (appMode === "admin") return role !== "driver";
  return true;
}

const contractorOrganizationId = "22222222-2222-4222-8222-222222222222";
const farmerOrganizationId = "11111111-1111-4111-8111-111111111111";
const klosContractorOrganizationId = "55555555-5555-4555-8555-555555555555";
const dispatchAssignmentsStorageKey = "schlaglink.dispatchAssignments";
const fieldReleaseMarker = "__schlaglink_released_contractors:";
const localFieldsStorageKey = "schlaglink.localFields";
const deletedFieldsStorageKey = "schlaglink.deletedFields";
const localDriversStorageKey = "schlaglink.localDrivers";
const localVehiclesStorageKey = "schlaglink.localVehicles";
const localOrganizationsStorageKey = "schlaglink.localOrganizations";
const deletedOrganizationsStorageKey = "schlaglink.deletedOrganizations";
const driverLocationsStorageKey = "schlaglink.driverLocations";
const localTaskTemplatesStorageKey = "schlaglink.localTaskTemplates";
const localJobTypesStorageKey = "schlaglink.localJobTypes";
const localArchivedJobsStorageKey = "schlaglink.localArchivedJobs";
const localJobsStorageKey = "schlaglink.localJobs";
const localSubtasksStorageKey = "schlaglink.localSubtasks";
const pendingDriverSyncStorageKey = "schlaglink.pendingDriverSync";
const driverLocationFreshnessMs = 15 * 60 * 1000;
const browserAutoSyncIntervalMs = 3 * 60 * 1000;

type DispatchAssignmentOverride = Pick<
  Subtask,
  | "activeDriverIds"
  | "activeDriverNames"
  | "activeVehicleIds"
  | "activeImplementIds"
  | "plannedCrews"
  | "progress"
  | "status"
  | "note"
  | "doneHa"
  | "doneAmount"
  | "trips"
  | "accessUsed"
  | "accessOk"
  | "driverNote"
  | "driverPhotoName"
  | "driverPhotos"
  | "completedAt"
  | "updatedAt"
  | "statusChangedAt"
>;

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole | null;
  organization_id: string | null;
  vehicle_name?: string | null;
};

function profileFromRow(row: ProfileRow): AuthProfile {
  const email = row.email ?? "";
  return {
    id: row.id,
    fullName: row.full_name ?? row.email ?? "SchlagLink Nutzer",
    email,
    role: row.role ?? "driver",
    organizationId: email.toLowerCase() === "bernd@kolaretorp.se" ? klosContractorOrganizationId : row.organization_id ?? undefined,
    vehicleName: row.vehicle_name ?? undefined,
  };
}

const demoAuthProfiles: Record<string, AuthProfile> = {
  "support@schlaglink.app": {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    fullName: "SchlagLink Support",
    email: "support@schlaglink.app",
    role: "support_admin",
  },
  "landwirt@schlaglink.app": {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    fullName: "Hof Müller Admin",
    email: "landwirt@schlaglink.app",
    role: "farmer_admin",
    organizationId: farmerOrganizationId,
  },
  "einsatzleiter@schlaglink.app": {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    fullName: "Agrarservice Schneider Admin",
    email: "einsatzleiter@schlaglink.app",
    role: "contractor_admin",
    organizationId: contractorOrganizationId,
  },
  "bernd@kolaretorp.se": {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    fullName: "Bernd Kolaretorp",
    email: "bernd@kolaretorp.se",
    role: "contractor_admin",
    organizationId: klosContractorOrganizationId,
  },
  "andersson@schlaglink.app": {
    id: "a3333333-3333-4333-8333-333333333333",
    fullName: "Hof Andersson Admin",
    email: "andersson@schlaglink.app",
    role: "farmer_admin",
    organizationId: "33333333-3333-4333-8333-333333333333",
  },
  "nord@schlaglink.app": {
    id: "b4444444-4444-4444-8444-444444444444",
    fullName: "Lohnbetrieb Nord Admin",
    email: "nord@schlaglink.app",
    role: "contractor_admin",
    organizationId: "44444444-4444-4444-8444-444444444444",
  },
  "max@schlaglink.app": {
    id: "dddddddd-dddd-4ddd-8ddd-000000000001",
    fullName: "Max",
    email: "max@schlaglink.app",
    role: "driver",
    organizationId: contractorOrganizationId,
    vehicleName: "Fendt 724",
  },
  "jens@schlaglink.app": {
    id: "dddddddd-dddd-4ddd-8ddd-000000000002",
    fullName: "Jens",
    email: "jens@schlaglink.app",
    role: "driver",
    organizationId: contractorOrganizationId,
    vehicleName: "John Deere 6250R",
  },
  "lisa@schlaglink.app": {
    id: "dddddddd-dddd-4ddd-8ddd-000000000003",
    fullName: "Lisa",
    email: "lisa@schlaglink.app",
    role: "driver",
    organizationId: contractorOrganizationId,
    vehicleName: "Claas Jaguar 950",
  },
  "tom@schlaglink.app": {
    id: "dddddddd-dddd-4ddd-8ddd-000000000004",
    fullName: "Tom",
    email: "tom@schlaglink.app",
    role: "driver",
    organizationId: contractorOrganizationId,
    vehicleName: "John Deere 6250R",
  },
  "olof@schlaglink.app": {
    id: "dddddddd-dddd-4ddd-8ddd-000000000005",
    fullName: "Olof",
    email: "olof@schlaglink.app",
    role: "driver",
    organizationId: contractorOrganizationId,
    vehicleName: "MAN Agrar-LKW",
  },
  "tobias@schlaglink.app": {
    id: "dddddddd-dddd-4ddd-8ddd-000000000006",
    fullName: "Tobias",
    email: "tobias@schlaglink.app",
    role: "driver",
    organizationId: farmerOrganizationId,
    vehicleName: "Hofschlepper Müller",
  },
};

const demoAuthPasswords: Record<string, string> = {
  "support@schlaglink.app": "1234",
  "bernd@kolaretorp.se": "1234",
  "andersson@schlaglink.app": "1234",
  "nord@schlaglink.app": "1234",
};

function getDemoAuthProfile(email: string, password: string) {
  const normalizedEmail = email.toLowerCase();
  const expectedPassword = demoAuthPasswords[normalizedEmail] ?? "schlaglink-demo";
  if (password !== expectedPassword) return null;
  return demoAuthProfiles[normalizedEmail] ?? null;
}

function loadDispatchAssignmentOverrides() {
  try {
    const raw = window.localStorage.getItem(dispatchAssignmentsStorageKey);
    return raw ? JSON.parse(raw) as Record<string, Partial<DispatchAssignmentOverride>> : {};
  } catch {
    return {};
  }
}

function saveDispatchAssignmentOverrides(overrides: Record<string, Partial<DispatchAssignmentOverride>>) {
  window.localStorage.setItem(dispatchAssignmentsStorageKey, JSON.stringify(overrides));
}

function loadDriverLocations() {
  try {
    const raw = window.localStorage.getItem(driverLocationsStorageKey);
    return raw ? freshDriverLocations(JSON.parse(raw) as DriverLocation[]) : [];
  } catch {
    return [];
  }
}

function saveDriverLocations(locations: DriverLocation[]) {
  window.localStorage.setItem(driverLocationsStorageKey, JSON.stringify(freshDriverLocations(locations)));
}

function freshDriverLocations(locations: DriverLocation[]) {
  const now = Date.now();
  return locations.filter((location) => {
    const recordedAt = Date.parse(location.recordedAt);
    return Number.isFinite(recordedAt) && now - recordedAt <= driverLocationFreshnessMs;
  });
}

type DriverLocationRow = {
  id: string;
  driver_id: string;
  driver_name: string;
  vehicle_name: string | null;
  subtask_id: string | null;
  field_id: string | null;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  status: DriverLocationStatus;
  recorded_at: string;
};

function driverLocationPayload(location: DriverLocation) {
  return {
    id: location.id,
    driver_id: location.driverId,
    driver_name: location.driverName,
    vehicle_name: location.vehicleName ?? null,
    subtask_id: location.subtaskId || null,
    field_id: location.fieldId || null,
    lat: location.lat,
    lng: location.lng,
    accuracy: location.accuracy ?? null,
    speed: location.speed ?? null,
    status: location.status,
    recorded_at: location.recordedAt,
    updated_at: new Date().toISOString(),
  };
}

function driverLocationFromRow(row: DriverLocationRow): DriverLocation {
  return {
    id: row.id,
    driverId: row.driver_id,
    driverName: row.driver_name,
    vehicleName: row.vehicle_name ?? undefined,
    subtaskId: row.subtask_id ?? undefined,
    fieldId: row.field_id ?? undefined,
    lat: row.lat,
    lng: row.lng,
    accuracy: row.accuracy ?? undefined,
    speed: row.speed ?? undefined,
    status: row.status,
    recordedAt: row.recorded_at,
  };
}

function loadPendingDriverSync() {
  try {
    const raw = window.localStorage.getItem(pendingDriverSyncStorageKey);
    return raw ? JSON.parse(raw) as Record<string, Subtask> : {};
  } catch {
    return {};
  }
}

function savePendingDriverSync(items: Record<string, Subtask>) {
  window.localStorage.setItem(pendingDriverSyncStorageKey, JSON.stringify(items));
}

function mergeDispatchAssignmentOverrides(subtasks: Subtask[], overrides: Record<string, Partial<DispatchAssignmentOverride>>) {
  return subtasks.map((subtask) => ({ ...subtask, ...(overrides[subtask.id] ?? {}) }));
}

function loadLocalFields() {
  try {
    const raw = window.localStorage.getItem(localFieldsStorageKey);
    return raw ? JSON.parse(raw) as Record<string, Field> : {};
  } catch {
    return {};
  }
}

function saveLocalFields(fields: Record<string, Field>) {
  window.localStorage.setItem(localFieldsStorageKey, JSON.stringify(fields));
}

function loadDeletedFieldIds() {
  try {
    const raw = window.localStorage.getItem(deletedFieldsStorageKey);
    return raw ? JSON.parse(raw) as string[] : [];
  } catch {
    return [];
  }
}

function saveDeletedFieldIds(ids: string[]) {
  window.localStorage.setItem(deletedFieldsStorageKey, JSON.stringify(ids));
}

function mergeLocalFields(loadedFields: Field[], localFields: Record<string, Field>, deletedFieldIds: string[]) {
  const deleted = new Set(deletedFieldIds);
  const merged = new globalThis.Map<string, Field>();
  loadedFields.filter((field) => !deleted.has(field.id)).forEach((field) => merged.set(field.id, field));
  Object.values(localFields).filter((field) => !deleted.has(field.id)).forEach((field) => merged.set(field.id, field));
  return Array.from(merged.values());
}

function loadLocalDrivers() {
  try {
    const raw = window.localStorage.getItem(localDriversStorageKey);
    return raw ? JSON.parse(raw) as Record<string, Driver> : {};
  } catch {
    return {};
  }
}

function saveLocalDrivers(drivers: Record<string, Driver>) {
  window.localStorage.setItem(localDriversStorageKey, JSON.stringify(drivers));
}

function mergeLocalDrivers(loadedDrivers: Driver[], localDrivers: Record<string, Driver>) {
  const merged = new globalThis.Map<string, Driver>();
  loadedDrivers.forEach((driver) => merged.set(driver.id, driver));
  Object.values(localDrivers).forEach((driver) => {
    const loaded = merged.get(driver.id);
    merged.set(driver.id, { ...loaded, ...driver, profileId: driver.profileId ?? loaded?.profileId });
  });
  return Array.from(merged.values());
}

function loadLocalVehicles() {
  try {
    const raw = window.localStorage.getItem(localVehiclesStorageKey);
    return raw ? JSON.parse(raw) as Record<string, Vehicle> : {};
  } catch {
    return {};
  }
}

function saveLocalVehicles(vehicles: Record<string, Vehicle>) {
  window.localStorage.setItem(localVehiclesStorageKey, JSON.stringify(vehicles));
}

function mergeLocalVehicles(loadedVehicles: Vehicle[], localVehicles: Record<string, Vehicle>) {
  const merged = new globalThis.Map<string, Vehicle>();
  loadedVehicles.forEach((vehicle) => merged.set(vehicle.id, vehicle));
  Object.values(localVehicles).forEach((vehicle) => {
    const loaded = merged.get(vehicle.id);
    merged.set(vehicle.id, { ...loaded, ...vehicle, organizationId: vehicle.organizationId ?? loaded?.organizationId });
  });
  return Array.from(merged.values());
}

function loadLocalOrganizations() {
  try {
    const raw = window.localStorage.getItem(localOrganizationsStorageKey);
    return raw ? JSON.parse(raw) as Record<string, Organization> : {};
  } catch {
    return {};
  }
}

function saveLocalOrganizations(organizations: Record<string, Organization>) {
  window.localStorage.setItem(localOrganizationsStorageKey, JSON.stringify(organizations));
}

function loadDeletedOrganizationIds() {
  try {
    const raw = window.localStorage.getItem(deletedOrganizationsStorageKey);
    return raw ? JSON.parse(raw) as string[] : [];
  } catch {
    return [];
  }
}

function saveDeletedOrganizationIds(ids: string[]) {
  window.localStorage.setItem(deletedOrganizationsStorageKey, JSON.stringify(ids));
}

function mergeLocalOrganizations(loadedOrganizations: Organization[], localOrganizations: Record<string, Organization>, deletedOrganizationIds: string[]) {
  const deleted = new Set(deletedOrganizationIds);
  const merged = new globalThis.Map<string, Organization>();
  loadedOrganizations.filter((organization) => !deleted.has(organization.id)).forEach((organization) => merged.set(organization.id, organization));
  Object.values(localOrganizations).filter((organization) => !deleted.has(organization.id)).forEach((organization) => merged.set(organization.id, organization));
  return Array.from(merged.values());
}

function mergeBaseOrganizations(loadedOrganizations: Organization[], baseOrganizations: Organization[]) {
  const merged = new globalThis.Map<string, Organization>();
  baseOrganizations.forEach((organization) => merged.set(organization.id, organization));
  loadedOrganizations.forEach((organization) => merged.set(organization.id, organization));
  return Array.from(merged.values());
}

function formatOrganizationAddress(organization: Organization) {
  const cityLine = [organization.postalCode, organization.city].filter(Boolean).join(" ");
  return [organization.street, cityLine, organization.country].filter(Boolean).join(", ") || organization.address || "";
}

function loadLocalTaskTemplates() {
  try {
    const raw = window.localStorage.getItem(localTaskTemplatesStorageKey);
    return raw ? JSON.parse(raw) as Record<string, TaskTemplate> : {};
  } catch {
    return {};
  }
}

function saveLocalTaskTemplates(taskTemplates: Record<string, TaskTemplate>) {
  window.localStorage.setItem(localTaskTemplatesStorageKey, JSON.stringify(taskTemplates));
}

function mergeLocalTaskTemplates(loadedTaskTemplates: TaskTemplate[], localTaskTemplates: Record<string, TaskTemplate>) {
  const merged = new globalThis.Map<string, TaskTemplate>();
  loadedTaskTemplates.forEach((taskTemplate) => merged.set(taskTemplate.id, taskTemplate));
  Object.values(localTaskTemplates).forEach((taskTemplate) => merged.set(taskTemplate.id, taskTemplate));
  return Array.from(merged.values());
}

function loadLocalJobTypes() {
  try {
    const raw = window.localStorage.getItem(localJobTypesStorageKey);
    return raw ? JSON.parse(raw) as Record<string, JobType> : {};
  } catch {
    return {};
  }
}

function saveLocalJobTypes(jobTypes: Record<string, JobType>) {
  window.localStorage.setItem(localJobTypesStorageKey, JSON.stringify(jobTypes));
}

function mergeLocalJobTypes(loadedJobTypes: JobType[], localJobTypes: Record<string, JobType>) {
  const merged = new globalThis.Map<string, JobType>();
  loadedJobTypes.forEach((jobType) => merged.set(jobType.id, jobType));
  Object.values(localJobTypes).forEach((jobType) => merged.set(jobType.id, jobType));
  return Array.from(merged.values());
}

function loadLocalArchivedJobs() {
  try {
    const raw = window.localStorage.getItem(localArchivedJobsStorageKey);
    return raw ? JSON.parse(raw) as Record<string, string> : {};
  } catch {
    return {};
  }
}

function saveLocalArchivedJobs(archivedJobs: Record<string, string>) {
  window.localStorage.setItem(localArchivedJobsStorageKey, JSON.stringify(archivedJobs));
}

function mergeLocalArchivedJobs(loadedJobs: Job[], localArchivedJobs: Record<string, string>) {
  return loadedJobs.map((job) => (
    localArchivedJobs[job.id]
      ? { ...job, archivedAt: localArchivedJobs[job.id] }
      : job
  ));
}

function loadLocalJobs() {
  try {
    const raw = window.localStorage.getItem(localJobsStorageKey);
    return raw ? JSON.parse(raw) as Record<string, Job> : {};
  } catch {
    return {};
  }
}

function saveLocalJobs(jobs: Record<string, Job>) {
  window.localStorage.setItem(localJobsStorageKey, JSON.stringify(jobs));
}

function loadLocalSubtasks() {
  try {
    const raw = window.localStorage.getItem(localSubtasksStorageKey);
    return raw ? JSON.parse(raw) as Record<string, Subtask[]> : {};
  } catch {
    return {};
  }
}

function saveLocalSubtasks(subtasks: Record<string, Subtask[]>) {
  window.localStorage.setItem(localSubtasksStorageKey, JSON.stringify(subtasks));
}

function mergeLocalJobs(loadedJobs: Job[], localJobs: Record<string, Job>, localArchivedJobs: Record<string, string>) {
  const merged = new globalThis.Map<string, Job>();
  mergeLocalArchivedJobs(loadedJobs, localArchivedJobs).forEach((job) => merged.set(job.id, job));
  Object.values(localJobs).forEach((job) => {
    merged.set(job.id, localArchivedJobs[job.id] ? { ...job, archivedAt: localArchivedJobs[job.id] } : job);
  });
  return Array.from(merged.values());
}

function mergeLocalSubtasks(loadedSubtasks: Subtask[], localSubtasks: Record<string, Subtask[]>) {
  const merged = new globalThis.Map<string, Subtask>();
  loadedSubtasks.forEach((subtask) => merged.set(subtask.id, subtask));
  Object.values(localSubtasks).flat().forEach((subtask) => merged.set(subtask.id, subtask));
  return Array.from(merged.values());
}

function storagePathForFieldFile(fieldId: string, fileId: string, file: File) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    return `${farmerOrganizationId}/fields/${fieldId}/${fileId}-${safeName}`;
  }

function storagePathForTaskPhoto(subtaskId: string, fileId: string, file: File, organizationId?: string) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${organizationId ?? "shared"}/task-reports/${subtaskId}/${fileId}-${safeName}`;
}

function fieldPayload(field: Field) {
  const releaseLine = field.releasedContractorIds?.length
    ? `${fieldReleaseMarker}${field.releasedContractorIds.join(",")}`
    : "";
  const notes = [...field.restrictedZones, releaseLine].filter(Boolean).join("\n");
  return {
    id: field.id,
    organization_id: field.organizationId ?? farmerOrganizationId,
    name: field.name,
    area_ha: field.areaHa,
    crop: field.crop,
    ownership_type: field.tenure === "Pacht" ? "lease" : "owned",
    center_lat: field.center.lat,
    center_lng: field.center.lng,
    access_lat: field.accessPoint.lat,
    access_lng: field.accessPoint.lng,
    access_description: field.accessDescription,
    notes,
    archived_at: field.archivedAt ?? null,
  };
}

function organizationPayload(organization: Organization) {
  return {
    id: organization.id,
    name: organization.name,
    organization_type: organization.kind,
    address: formatOrganizationAddress(organization),
    archived_at: organization.archivedAt ?? null,
  };
}

function organizationPayloadWithoutArchive(organization: Organization) {
  const { archived_at: _archivedAt, ...payload } = organizationPayload(organization);
  return payload;
}

function workModeToDatabase(mode: WorkMode) {
  if (mode === "Einzelmodus") return "single";
  if (mode === "Rollenmodus") return "role_based";
  if (mode === "Flächenteilung") return "area_split";
  return "team";
}

function progressMetricToDatabase(metric: ProgressMetric) {
  if (metric === "Fläche") return "area";
  if (metric === "Menge") return "quantity";
  if (metric === "Fuhren") return "trips";
  return "time";
}

function parseTimeWindowDate(value: string, fallbackHour: number) {
  const match = value.match(/(\d{4}-\d{2}-\d{2})(?:,\s*(\d{2}:\d{2}|--:--)-(\d{2}:\d{2}|--:--))?/);
  if (!match) return null;
  const [, date, start, end] = match;
  const time = fallbackHour < 12 ? start : end;
  const normalizedTime = time && time !== "--:--" ? time : `${String(fallbackHour).padStart(2, "0")}:00`;
  return new Date(`${date}T${normalizedTime}:00`).toISOString();
}

function generateJobNumber() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `A-${code}`;
}

function positiveInteger(value: number | undefined, fallback = 1) {
  return Number.isFinite(value) && value && value > 0 ? Math.round(value) : fallback;
}

function jobTaskPayload(job: Job, subtask: Subtask) {
  const task = job.tasks.find((item) => item.id === subtask.taskId) ?? job.tasks[0];
  const metric = task.progressMetric[0] ?? "Fläche";
  return {
    id: subtask.id,
    job_id: job.id,
    field_id: subtask.fieldId || null,
    task_type: task.name,
    title: task.name,
    description: task.resourceHint ?? "",
    work_mode: workModeToDatabase(task.mode),
    progress_type: progressMetricToDatabase(metric),
    target_area_ha: metric === "Fläche" ? task.targetValue ?? null : null,
    target_quantity: metric === "Menge" ? task.targetValue ?? task.plannedAmount ?? null : null,
    quantity_unit: task.unit ?? null,
    target_trips: metric === "Fuhren" ? task.targetValue ?? null : null,
    max_active_workers: positiveInteger(task.maxVehicles),
    status: "open",
  };
}

function isSystemTemplate(item: TaskTemplate | JobType) {
  return item.isSystemTemplate || item.templateOwnerType === "system" || !item.organizationId;
}

function visibleTemplateItems<T extends TaskTemplate | JobType>(items: T[], role: UserRole, organizationId?: string | null) {
  if (role === "support_admin") return items;
  if (!organizationId) return items.filter(isSystemTemplate);
  const organizationItems = items.filter((item) => item.organizationId === organizationId);
  return organizationItems.length > 0 ? organizationItems : items.filter(isSystemTemplate);
}

function cloneTaskTemplateForOrganization(template: TaskTemplate, organizationId: string): TaskTemplate {
  const id = crypto.randomUUID();
  return {
    ...template,
    id,
    organizationId,
    isSystemTemplate: false,
    templateOwnerType: "organization",
    sourceTemplateId: template.sourceTemplateId ?? template.id,
    createdByAdmin: true,
    archivedAt: undefined,
  };
}

function cloneJobTypeForOrganization(jobType: JobType, organizationId: string): JobType {
  return {
    ...jobType,
    id: crypto.randomUUID(),
    organizationId,
    isSystemTemplate: false,
    templateOwnerType: "organization",
    sourceTemplateId: jobType.sourceTemplateId ?? jobType.id,
    createdByAdmin: true,
    archivedAt: undefined,
    tasks: jobType.tasks.map((task) => ({ ...task, id: crypto.randomUUID() })),
  };
}

export function App() {
  const { t } = useTranslation();
  const appMode = getAppModeFromPath();
  const loadedData = useSchlagLinkData();
  const [activeView, setActiveView] = useState<ViewKey>(() => initialViewForAppMode(appMode));
  const [selectedFieldId, setSelectedFieldId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [fieldRecords, setFieldRecords] = useState<Field[]>([]);
  const [localFields, setLocalFields] = useState<Record<string, Field>>(() => loadLocalFields());
  const [deletedFieldIds, setDeletedFieldIds] = useState<string[]>(() => loadDeletedFieldIds());
  const [driverRecords, setDriverRecords] = useState<Driver[]>([]);
  const [localDrivers, setLocalDrivers] = useState<Record<string, Driver>>(() => loadLocalDrivers());
  const [vehicleRecords, setVehicleRecords] = useState<Vehicle[]>([]);
  const [localVehicles, setLocalVehicles] = useState<Record<string, Vehicle>>(() => loadLocalVehicles());
  const [implementRecords, setImplementRecords] = useState<Implement[]>([]);
  const [organizationRecords, setOrganizationRecords] = useState<Organization[]>(mockOrganizations);
  const [localOrganizations, setLocalOrganizations] = useState<Record<string, Organization>>(() => loadLocalOrganizations());
  const [deletedOrganizationIds, setDeletedOrganizationIds] = useState<string[]>(() => loadDeletedOrganizationIds());
  const [jobTypeRecords, setJobTypeRecords] = useState<JobType[]>(mockJobTypes);
  const [localJobTypes, setLocalJobTypes] = useState<Record<string, JobType>>(() => loadLocalJobTypes());
  const [taskTemplateRecords, setTaskTemplateRecords] = useState<TaskTemplate[]>(mockTaskTemplates);
  const [localTaskTemplates, setLocalTaskTemplates] = useState<Record<string, TaskTemplate>>(() => loadLocalTaskTemplates());
  const [localArchivedJobs, setLocalArchivedJobs] = useState<Record<string, string>>(() => loadLocalArchivedJobs());
  const [localJobs, setLocalJobs] = useState<Record<string, Job>>(() => loadLocalJobs());
  const [localSubtasks, setLocalSubtasks] = useState<Record<string, Subtask[]>>(() => loadLocalSubtasks());
  const [currentRole, setCurrentRoleState] = useState<UserRole>(() => {
    const stored = window.localStorage.getItem("schlaglink.role") as UserRole | null;
    return stored ?? "farmer_admin";
  });
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authProfile, setAuthProfile] = useState<AuthProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [authError, setAuthError] = useState("");
  const [browserSyncStatus, setBrowserSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [browserSyncMessage, setBrowserSyncMessage] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [driverLocations, setDriverLocations] = useState<DriverLocation[]>(() => loadDriverLocations());
  const [dispatchAssignmentOverrides, setDispatchAssignmentOverrides] = useState<Record<string, Partial<DispatchAssignmentOverride>>>(() => loadDispatchAssignmentOverrides());
  const [pendingDriverSync, setPendingDriverSync] = useState<Record<string, Subtask>>(() => loadPendingDriverSync());
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [showArchivedJobs, setShowArchivedJobs] = useState(false);
  const [isCreateJobModalOpen, setIsCreateJobModalOpen] = useState(false);
  const [jobTemplateDraft, setJobTemplateDraft] = useState<Job | null>(null);
  const [dispatchEditJobId, setDispatchEditJobId] = useState("");
  const [masterDataFocus, setMasterDataFocus] = useState<{
    group: "personnel" | "vehicles" | "implements";
    id: string;
  } | null>(null);
  const loginLocationSentForDriverRef = useRef<string | null>(null);

  async function loadAuthProfile(session: Session | null) {
    if (!session || !supabase) {
      setAuthProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();
    if (error || !data) {
      setAuthError(error?.message ?? t("auth.profileMissing"));
      setAuthProfile(null);
      return;
    }
    const profile = profileFromRow(data as ProfileRow);
    if (!roleAllowedInAppMode(profile.role, appMode)) {
      setAuthProfile(null);
      setAuthSession(null);
      setCurrentRoleState(appMode === "driver" ? "driver" : "farmer_admin");
      window.localStorage.setItem("schlaglink.role", appMode === "driver" ? "driver" : "farmer_admin");
      setActiveView(initialViewForAppMode(appMode));
      setAuthError(t(appMode === "driver" ? "auth.driverLoginRequired" : "auth.adminLoginRequired"));
      await supabase.auth.signOut();
      return;
    }
    setAuthProfile(profile);
    setCurrentRoleState(profile.role);
    window.localStorage.setItem("schlaglink.role", profile.role);
    setAuthError("");
    if (profile.role === "driver") setActiveView("driver");
    if (profile.role !== "driver" && appMode !== "driver") setActiveView("dashboard");
  }

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setAuthLoading(false);
      return undefined;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuthSession(data.session);
      loadAuthProfile(data.session).finally(() => {
        if (mounted) setAuthLoading(false);
      });
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session);
      setAuthLoading(false);
      void loadAuthProfile(session);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setFieldRecords(mergeLocalFields(loadedData.fields, localFields, deletedFieldIds));
    setDriverRecords(mergeLocalDrivers(loadedData.drivers, localDrivers));
    setVehicleRecords(mergeLocalVehicles(loadedData.vehicles, localVehicles));
    setImplementRecords(loadedData.implementsList);
    setOrganizationRecords(mergeLocalOrganizations(mergeBaseOrganizations(loadedData.organizations, mockOrganizations), localOrganizations, deletedOrganizationIds));
    setTaskTemplateRecords(mergeLocalTaskTemplates(loadedData.taskTemplates, localTaskTemplates));
    setJobTypeRecords(mergeLocalJobTypes(jobTypeRecords.length > 0 ? jobTypeRecords : mockJobTypes, localJobTypes));
    setJobs(mergeLocalJobs(loadedData.jobs, localJobs, localArchivedJobs));
    setSubtasks(mergeDispatchAssignmentOverrides(mergeLocalSubtasks(loadedData.subtasks, localSubtasks), dispatchAssignmentOverrides));
    setSelectedFieldId((current) => current || loadedData.fields[0]?.id || "");
    setSelectedJobId((current) => current || loadedData.jobs[0]?.id || "");
  }, [deletedFieldIds, deletedOrganizationIds, dispatchAssignmentOverrides, loadedData.drivers, loadedData.fields, loadedData.implementsList, loadedData.jobs, loadedData.organizations, loadedData.subtasks, loadedData.taskTemplates, loadedData.vehicles, localArchivedJobs, localDrivers, localFields, localJobs, localJobTypes, localOrganizations, localSubtasks, localTaskTemplates, localVehicles]);

  useEffect(() => {
    function updateOnlineState() {
      setIsOnline(navigator.onLine);
    }
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    if (!isOnline || Object.keys(pendingDriverSync).length === 0) return;
    let cancelled = false;
    async function flushPendingDriverSync() {
      const entries = Object.entries(pendingDriverSync);
      const remaining: Record<string, Subtask> = {};
      for (const [id, subtask] of entries) {
        const result = await syncSubtaskAssignments(subtask);
        if (!result.ok) remaining[id] = subtask;
      }
      if (cancelled) return;
      if (Object.keys(remaining).length !== entries.length) {
        setPendingDriverSync(remaining);
        savePendingDriverSync(remaining);
      }
    }
    void flushPendingDriverSync();
    return () => {
      cancelled = true;
    };
  }, [isOnline, pendingDriverSync]);

  const visibleFieldRecords = useMemo(() => {
    if ((currentRole === "farmer_admin" || currentRole === "farmer_employee") && authProfile?.organizationId) {
      return fieldRecords.filter((field) => field.organizationId === authProfile.organizationId);
    }
    if (currentRole === "contractor_admin" && authProfile?.organizationId) {
      return fieldRecords.filter((field) => (
        field.organizationId === authProfile.organizationId
        || (field.releasedContractorIds ?? []).includes(authProfile.organizationId!)
      ));
    }
    return fieldRecords;
  }, [authProfile?.organizationId, currentRole, fieldRecords]);
  const scopedJobs = useMemo(() => {
    if (currentRole === "support_admin" || !authProfile?.organizationId) return jobs;
    const organizationId = authProfile.organizationId;
    const jobHasFieldOwnedByOrganization = (job: Job) => job.fieldIds.some((fieldId) => (
      fieldRecords.find((field) => field.id === fieldId)?.organizationId === organizationId
    ));
    const jobHasFieldReleasedToOrganization = (job: Job) => job.fieldIds.some((fieldId) => (
      fieldRecords.find((field) => field.id === fieldId)?.releasedContractorIds?.includes(organizationId)
    ));
    if (currentRole === "farmer_admin" || currentRole === "farmer_employee") {
      return jobs.filter((job) => (
        job.farmerOrganizationId === organizationId
        || (!job.farmerOrganizationId && jobHasFieldOwnedByOrganization(job))
      ));
    }
    if (currentRole === "contractor_admin") {
      return jobs.filter((job) => (
        job.contractorOrganizationId === organizationId
        || jobHasFieldReleasedToOrganization(job)
      ));
    }
    return jobs;
  }, [authProfile?.organizationId, currentRole, fieldRecords, jobs]);
  const activeJobs = useMemo(() => scopedJobs.filter((job) => !job.archivedAt), [scopedJobs]);
  const archivedJobs = useMemo(() => scopedJobs.filter((job) => Boolean(job.archivedAt)), [scopedJobs]);
  const visibleJobs = showArchivedJobs ? archivedJobs : activeJobs;
  const selectedJob = visibleJobs.find((job) => job.id === selectedJobId) ?? visibleJobs[0];
  const dispatchEditJob = activeJobs.find((job) => job.id === dispatchEditJobId);
  const activeJobIds = useMemo(() => new Set(activeJobs.map((job) => job.id)), [activeJobs]);
  const activeSubtasks = useMemo(() => subtasks.filter((subtask) => activeJobIds.has(subtask.jobId)), [activeJobIds, subtasks]);
  const visibleTaskTemplateRecords = useMemo(
    () => visibleTemplateItems(taskTemplateRecords, currentRole, authProfile?.organizationId),
    [authProfile?.organizationId, currentRole, taskTemplateRecords],
  );
  const visibleJobTypeRecords = useMemo(
    () => visibleTemplateItems(jobTypeRecords, currentRole, authProfile?.organizationId),
    [authProfile?.organizationId, currentRole, jobTypeRecords],
  );
  const currentDriver = useMemo(() => {
    if (!authProfile || authProfile.role !== "driver") return null;
    const matchingDrivers = driverRecords.filter((driver) =>
      driver.profileId === authProfile.id
      || driver.id === authProfile.id
      || driver.name === authProfile.fullName,
    );
    return matchingDrivers.find((driver) => !driver.archivedAt) ?? matchingDrivers[0] ?? null;
  }, [authProfile, driverRecords]);
  const currentDriverId = currentDriver?.id ?? null;

  useEffect(() => {
    if (!currentDriver || appMode !== "driver") {
      loginLocationSentForDriverRef.current = null;
      return;
    }
    const loginLocationKey = `${authProfile?.id ?? currentDriver.id}:${currentDriver.id}`;
    if (loginLocationSentForDriverRef.current === loginLocationKey) return;
    loginLocationSentForDriverRef.current = loginLocationKey;
    void sendDriverLocationOnSignIn(currentDriver);
  }, [appMode, authProfile?.id, currentDriver?.id, activeSubtasks, fieldRecords]);

  const visibleNavItems = useMemo(() => {
    if (appMode === "driver") return navItems.filter((item) => item.key === "driver");
    if (appMode === "admin" && currentRole === "driver") return [];
    if (currentRole === "driver") return navItems.filter((item) => item.key === "driver");
    if (currentRole === "support_admin") return navItems.filter((item) => ["dashboard", "fields", "jobs", "contractor", "masterData", "report"].includes(item.key));
    if (currentRole === "contractor_admin") return navItems.filter((item) => ["dashboard", "fields", "contractor", "masterData", "jobs", "report"].includes(item.key));
    if (currentRole === "farmer_admin") return navItems.filter((item) => ["dashboard", "fields", "jobs", "contractor", "masterData", "report"].includes(item.key));
    if (currentRole === "farmer_employee") return navItems.filter((item) => ["dashboard", "fields", "jobs", "report"].includes(item.key));
    return navItems.filter((item) => ["dashboard", "fields", "jobs", "report"].includes(item.key));
  }, [appMode, currentRole]);

  useEffect(() => {
    if (visibleNavItems.some((item) => item.key === activeView)) return;
    setActiveView(visibleNavItems[0]?.key ?? "dashboard");
  }, [activeView, visibleNavItems]);

  function subtaskStatusToDatabase(status: Status) {
    if (status === "erledigt") return "completed";
    if (status === "in Arbeit") return "active";
    if (status === "pausiert") return "paused";
    if (status === "reserviert") return "reserved";
    if (status === "Problem") return "issue";
    if (status === "teilweise erledigt") return "partial";
    return "open";
  }

  function assignmentStatusFromSubtask(status: Status) {
    if (status === "erledigt") return "completed";
    if (status === "pausiert") return "paused";
    if (status === "in Arbeit" || status === "teilweise erledigt") return "active";
    return "reserved";
  }

  async function syncSubtaskAssignments(subtask: Subtask) {
    if (!isSupabaseConfigured || !supabase) return { ok: true };
    if (!jobs.some((job) => job.id === subtask.jobId)) return { ok: true };

    const shouldSyncAssignments = subtask.activeDriverIds.length > 0 || (subtask.activeVehicleIds ?? []).length === 0;
    let { error: taskError } = await supabase
      .from("job_tasks")
      .update({ status: subtaskStatusToDatabase(subtask.status) })
      .eq("id", subtask.id);
    if (taskError && taskError.message.includes("task_status") && taskError.message.includes("paused")) {
      const retry = await supabase
        .from("job_tasks")
        .update({ status: "reserved" })
        .eq("id", subtask.id);
      taskError = retry.error;
    }
    if (taskError) {
      console.error("Teilauftrag-Status konnte nicht in Supabase gespeichert werden", taskError);
      return { ok: false, error: `${subtask.id}: ${taskError.message}` };
    }

    if (!shouldSyncAssignments) return { ok: true };

    const { data: existingAssignments, error: readError } = await supabase
      .from("task_assignments")
      .select("id, driver_profile_id")
      .eq("job_task_id", subtask.id);
    if (readError) {
      console.error("Zuordnungen konnten nicht aus Supabase gelesen werden", readError);
      return { ok: false, error: `${subtask.id}: ${readError.message}` };
    }

    const vehicleNames = (subtask.activeVehicleIds ?? [])
      .map((vehicleId) => vehicleRecords.find((vehicle) => vehicle.id === vehicleId)?.name)
      .filter((name): name is string => Boolean(name));
    const desiredAssignments = subtask.activeDriverIds.flatMap((driverId, index) => {
      const driver = driverRecords.find((item) => item.id === driverId || item.profileId === driverId);
      const profileId = driver?.profileId ?? (driver?.id.startsWith("dddddddd-") ? driver.id : undefined);
      if (!profileId) return [];
      return {
        job_task_id: subtask.id,
        driver_profile_id: profileId,
        vehicle_name: vehicleNames[index] ?? vehicleNames[0] ?? driver?.vehicle ?? null,
        status: assignmentStatusFromSubtask(subtask.status),
        completed_area_ha: subtask.doneHa ?? null,
        completed_quantity: subtask.doneAmount ?? null,
        completed_trips: subtask.trips ?? null,
        completed_at: subtask.status === "erledigt" ? subtask.completedAt ?? new Date().toISOString() : null,
        notes: subtask.driverNote ?? subtask.note ?? null,
      };
    });
    const desiredProfileIds = new Set(desiredAssignments.map((assignment) => assignment.driver_profile_id));
    const releasedAssignmentIds = (existingAssignments ?? [])
      .filter((assignment) => !desiredProfileIds.has(assignment.driver_profile_id))
      .map((assignment) => assignment.id);

    if (releasedAssignmentIds.length > 0) {
      const { error } = await supabase
        .from("task_assignments")
        .update({ status: "released", updated_at: new Date().toISOString() })
        .in("id", releasedAssignmentIds);
      if (error) {
        console.error("Entfernte Zuordnungen konnten nicht freigegeben werden", error);
        return { ok: false, error: `${subtask.id}: ${error.message}` };
      }
    }

    if (desiredAssignments.length > 0) {
      let { error } = await supabase
        .from("task_assignments")
        .upsert(desiredAssignments, { onConflict: "job_task_id,driver_profile_id" });
      if (error && error.message.includes("assignment_status") && error.message.includes("paused")) {
        const retry = await supabase
          .from("task_assignments")
          .upsert(desiredAssignments.map((assignment) => ({
            ...assignment,
            status: assignment.status === "paused" ? "reserved" : assignment.status,
          })), { onConflict: "job_task_id,driver_profile_id" });
        error = retry.error;
      }
      if (error) {
        console.error("Dispo-Zuordnung konnte nicht in Supabase gespeichert werden", error);
        return { ok: false, error: `${subtask.id}: ${error.message}` };
      }
    }
    return { ok: true };
  }

  function queueDriverSync(subtask: Subtask) {
    setPendingDriverSync((current) => {
      const next = { ...current, [subtask.id]: subtask };
      savePendingDriverSync(next);
      return next;
    });
  }

  function updateSubtask(id: string, patch: Partial<Subtask>) {
    const timestamp = new Date().toISOString();
    const timedPatch: Partial<Subtask> = {
      ...patch,
      updatedAt: timestamp,
      ...("status" in patch ? { statusChangedAt: timestamp } : {}),
      ...(patch.status === "erledigt" ? { completedAt: patch.completedAt ?? timestamp } : {}),
    };
    const shouldPersistDispatch = "activeDriverIds" in patch
      || "activeDriverNames" in patch
      || "activeVehicleIds" in patch
      || "activeImplementIds" in patch
      || "plannedCrews" in patch
      || "progress" in patch
      || "status" in patch
      || "note" in patch
      || "doneHa" in patch
      || "doneAmount" in patch
      || "trips" in patch
      || "accessUsed" in patch
      || "accessOk" in patch
      || "driverNote" in patch
      || "driverPhotoName" in patch
      || "driverPhotos" in patch
      || "completedAt" in patch;
    const shouldSync = "activeDriverIds" in patch || "activeVehicleIds" in patch || "status" in patch;
    const shouldSyncDriverFeedback = "doneHa" in patch
      || "doneAmount" in patch
      || "trips" in patch
      || "note" in patch
      || "driverNote" in patch;
    const currentSubtask = subtasks.find((subtask) => subtask.id === id);
    const nextSubtaskForPersistence = currentSubtask ? { ...currentSubtask, ...timedPatch } : undefined;
    setSubtasks((current) =>
      current.map((subtask) => {
        if (subtask.id !== id) return subtask;
        return { ...subtask, ...timedPatch };
      }),
    );
    if (shouldPersistDispatch && nextSubtaskForPersistence) {
      setDispatchAssignmentOverrides((current) => {
        const next = {
          ...current,
          [id]: {
            activeDriverIds: nextSubtaskForPersistence.activeDriverIds,
            activeDriverNames: nextSubtaskForPersistence.activeDriverNames ?? [],
            activeVehicleIds: nextSubtaskForPersistence.activeVehicleIds ?? [],
            activeImplementIds: nextSubtaskForPersistence.activeImplementIds ?? [],
            plannedCrews: nextSubtaskForPersistence.plannedCrews,
            progress: nextSubtaskForPersistence.progress,
            status: nextSubtaskForPersistence.status,
            note: nextSubtaskForPersistence.note,
            doneHa: nextSubtaskForPersistence.doneHa,
            doneAmount: nextSubtaskForPersistence.doneAmount,
            trips: nextSubtaskForPersistence.trips,
            accessUsed: nextSubtaskForPersistence.accessUsed,
            accessOk: nextSubtaskForPersistence.accessOk,
            driverNote: nextSubtaskForPersistence.driverNote,
            driverPhotoName: nextSubtaskForPersistence.driverPhotoName,
            driverPhotos: nextSubtaskForPersistence.driverPhotos,
            completedAt: nextSubtaskForPersistence.completedAt,
            updatedAt: nextSubtaskForPersistence.updatedAt,
            statusChangedAt: nextSubtaskForPersistence.statusChangedAt,
          },
        };
        saveDispatchAssignmentOverrides(next);
        return next;
      });
    }
    if ((shouldSync || shouldSyncDriverFeedback) && nextSubtaskForPersistence) {
      if (!navigator.onLine) {
        queueDriverSync(nextSubtaskForPersistence);
      } else {
        void syncSubtaskAssignments(nextSubtaskForPersistence).then((result) => {
          if (!result.ok) queueDriverSync(nextSubtaskForPersistence);
        });
      }
    }
  }

  function releaseCurrentDriverAssignmentsBeforeSignOut() {
    if (!currentDriver) return;
    const normalizedDriverName = currentDriver.name.trim().toLowerCase();
    const currentDriverIdentifiers = new Set([currentDriver.id, currentDriver.profileId].filter(Boolean));
    const isCurrentDriverAssignment = (driverId: string) => {
      if (currentDriverIdentifiers.has(driverId)) return true;
      const assignedDriver = driverRecords.find((driver) => driver.id === driverId || driver.profileId === driverId);
      return assignedDriver?.name.trim().toLowerCase() === normalizedDriverName || driverId.trim().toLowerCase() === normalizedDriverName;
    };

    subtasks
      .filter((subtask) => subtask.status !== "erledigt")
      .filter((subtask) => (
        subtask.activeDriverIds.some(isCurrentDriverAssignment)
        || (subtask.activeDriverNames ?? []).some((name) => name.trim().toLowerCase() === normalizedDriverName)
      ))
      .forEach((subtask) => {
        const activeDriverIds = subtask.activeDriverIds.filter((driverId) => !isCurrentDriverAssignment(driverId));
        const activeDriverNames = (subtask.activeDriverNames ?? []).filter((name) => name.trim().toLowerCase() !== normalizedDriverName);
        const hasRemainingDriver = activeDriverIds.length > 0 || activeDriverNames.length > 0;
        const status: Subtask["status"] = hasRemainingDriver
          ? subtask.status
          : subtask.status === "in Arbeit"
            ? "pausiert"
            : subtask.status === "reserviert"
              ? "offen"
              : subtask.status;

        updateSubtask(subtask.id, {
          activeDriverIds,
          activeDriverNames,
          status,
        });
      });
  }

  function fallbackPointForDriverSignOut(subtask?: Subtask) {
    const field = fieldRecords.find((item) => item.id === subtask?.fieldId);
    const base = field?.accessPoint ?? field?.center ?? { lat: 55.72572, lng: 13.17942 };
    return {
      lat: base.lat,
      lng: base.lng,
      accuracy: field ? 25 : 100,
      speed: 0,
    };
  }

  function driverMatchesSubtask(driver: Driver, subtask: Subtask) {
    const normalizedDriverName = driver.name.trim().toLowerCase();
    const driverIdentifiers = new Set([driver.id, driver.profileId].filter(Boolean));
    return subtask.activeDriverIds.some((driverId) => {
      if (driverIdentifiers.has(driverId)) return true;
      const assignedDriver = driverRecords.find((item) => item.id === driverId || item.profileId === driverId);
      return assignedDriver?.name.trim().toLowerCase() === normalizedDriverName || driverId.trim().toLowerCase() === normalizedDriverName;
    }) || (subtask.activeDriverNames ?? []).some((name) => name.trim().toLowerCase() === normalizedDriverName);
  }

  function firstRelevantSubtaskForDriver(driver: Driver) {
    const priority = (status: Subtask["status"]) => status === "in Arbeit" ? 0 : status === "Problem" ? 1 : status === "pausiert" ? 2 : status === "reserviert" ? 3 : 4;
    return activeSubtasks
      .filter((subtask) => subtask.status !== "erledigt" && driverMatchesSubtask(driver, subtask))
      .sort((a, b) => priority(a.status) - priority(b.status))[0];
  }

  function fallbackPointForDriverSignIn(driver: Driver, subtask?: Subtask) {
    const assignedField = fieldRecords.find((item) => item.id === subtask?.fieldId);
    const organizationField = fieldRecords.find((item) => item.organizationId === driver.organizationId);
    const base = assignedField?.accessPoint ?? assignedField?.center ?? organizationField?.center ?? { lat: 55.72572, lng: 13.17942 };
    return {
      lat: base.lat,
      lng: base.lng,
      accuracy: assignedField ? 25 : organizationField ? 75 : 100,
      speed: 0,
    };
  }

  function locationStatusFromSubtask(subtask?: Subtask): DriverLocationStatus {
    if (subtask?.status === "Problem") return "Problem";
    if (subtask?.status === "in Arbeit") return "in Arbeit";
    if (subtask?.status === "pausiert") return "pausiert";
    return "unterwegs";
  }

  async function getCurrentDriverPointForSignOut(subtask?: Subtask) {
    if (!window.isSecureContext || !navigator.geolocation) return fallbackPointForDriverSignOut(subtask);
    return new Promise<{ lat: number; lng: number; accuracy?: number; speed?: number }>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed ?? undefined,
        }),
        () => resolve(fallbackPointForDriverSignOut(subtask)),
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 5000 },
      );
    });
  }

  async function getCurrentDriverPointForSignIn(driver: Driver, subtask?: Subtask) {
    if (!window.isSecureContext || !navigator.geolocation) return fallbackPointForDriverSignIn(driver, subtask);
    return new Promise<{ lat: number; lng: number; accuracy?: number; speed?: number }>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed ?? undefined,
        }),
        () => resolve(fallbackPointForDriverSignIn(driver, subtask)),
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 7000 },
      );
    });
  }

  async function sendDriverLocationOnSignIn(driver: Driver) {
    const subtask = firstRelevantSubtaskForDriver(driver);
    const point = await getCurrentDriverPointForSignIn(driver, subtask);
    updateDriverLocation({
      id: `${driver.id}-signin-${Date.now()}`,
      driverId: driver.id,
      driverName: driver.name,
      vehicleName: driver.vehicle,
      subtaskId: subtask?.id,
      fieldId: subtask?.fieldId,
      lat: point.lat,
      lng: point.lng,
      accuracy: point.accuracy,
      speed: point.speed,
      status: locationStatusFromSubtask(subtask),
      recordedAt: new Date().toISOString(),
    });
  }

  async function sendCurrentDriverLocationBeforeSignOut() {
    if (!currentDriver) return;
    const subtask = firstRelevantSubtaskForDriver(currentDriver);
    const point = await getCurrentDriverPointForSignOut(subtask);
    updateDriverLocation({
      id: `${currentDriver.id}-signout-${Date.now()}`,
      driverId: currentDriver.id,
      driverName: currentDriver.name,
      vehicleName: currentDriver.vehicle,
      subtaskId: subtask?.id,
      fieldId: subtask?.fieldId,
      lat: point.lat,
      lng: point.lng,
      accuracy: point.accuracy,
      speed: point.speed,
      status: "abgemeldet",
      recordedAt: new Date().toISOString(),
    });
  }

  async function uploadSubtaskPhotos(subtaskId: string, files: File[]) {
    if (files.length === 0) return;
    const currentSubtask = subtasks.find((subtask) => subtask.id === subtaskId);
    if (!currentSubtask) return;
    const job = jobs.find((item) => item.id === currentSubtask.jobId);
    const uploadedAt = new Date().toISOString();
    const uploadedPhotos = await Promise.all(files.map(async (file) => {
      const id = crypto.randomUUID();
      const filePath = storagePathForTaskPhoto(subtaskId, id, file, job?.contractorOrganizationId ?? job?.farmerOrganizationId);
      let url = URL.createObjectURL(file);
      if (isSupabaseConfigured && supabase) {
        const upload = await supabase.storage.from("task-reports").upload(filePath, file, { cacheControl: "3600", upsert: false });
        if (upload.error) {
          console.error("Fahrerfoto konnte nicht in Supabase Storage hochgeladen werden", upload.error);
        } else {
          url = supabase.storage.from("task-reports").getPublicUrl(filePath).data.publicUrl;
          const { error } = await supabase.from("task_reports").insert({
            id,
            job_task_id: subtaskId,
            report_type: currentSubtask.status === "Problem" ? "issue" : currentSubtask.status === "erledigt" ? "completion" : "progress",
            message: file.name,
            photo_url: url,
            created_by: authProfile?.id ?? null,
          });
          if (error) console.error("Fahrerfoto konnte nicht als Rückmeldung gespeichert werden", error);
        }
      }
      return {
        id,
        name: file.name,
        url,
        filePath,
        mimeType: file.type,
        sizeBytes: file.size,
        uploadedAt,
        uploadedByDriverId: currentDriverId ?? undefined,
      };
    }));
    const nextPhotos = [...(currentSubtask.driverPhotos ?? []), ...uploadedPhotos];
    updateSubtask(subtaskId, {
      driverPhotos: nextPhotos,
      driverPhotoName: uploadedPhotos.at(-1)?.name ?? currentSubtask.driverPhotoName,
    });
  }

  async function deleteSubtaskPhoto(subtaskId: string, photoId: string) {
    const currentSubtask = subtasks.find((subtask) => subtask.id === subtaskId);
    const photo = currentSubtask?.driverPhotos?.find((item) => item.id === photoId);
    if (!currentSubtask || !photo) return;
    const nextPhotos = (currentSubtask.driverPhotos ?? []).filter((item) => item.id !== photoId);
    updateSubtask(subtaskId, {
      driverPhotos: nextPhotos,
      driverPhotoName: nextPhotos.at(-1)?.name,
    });
    if (isSupabaseConfigured && supabase) {
      if (photo.filePath) {
        const { error: storageError } = await supabase.storage.from("task-reports").remove([photo.filePath]);
        if (storageError) console.error("Fahrerfoto konnte nicht aus Supabase Storage gelöscht werden", storageError);
      }
      const { error } = await supabase.from("task_reports").delete().eq("id", photoId);
      if (error) console.error("Fahrerfoto-Rückmeldung konnte nicht gelöscht werden", error);
    }
  }

  function releaseJobResources(jobId: string) {
    const affectedSubtasks = subtasks.filter((subtask) => subtask.jobId === jobId);
    setSubtasks((current) => current.map((subtask) => (
      subtask.jobId === jobId
        ? {
            ...subtask,
            activeDriverIds: [],
            activeVehicleIds: [],
            activeImplementIds: [],
          }
        : subtask
    )));
    setLocalSubtasks((current) => {
      const existing = current[jobId];
      if (!existing) return current;
      const next = {
        ...current,
        [jobId]: existing.map((subtask) => ({
          ...subtask,
          activeDriverIds: [],
          activeDriverNames: [],
          activeVehicleIds: [],
          activeImplementIds: [],
        })),
      };
      saveLocalSubtasks(next);
      return next;
    });
    setDispatchAssignmentOverrides((current) => {
      const next = { ...current };
      affectedSubtasks.forEach((subtask) => {
        const existing = next[subtask.id];
        if (!existing) return;
        next[subtask.id] = {
          ...existing,
          activeDriverIds: [],
          activeDriverNames: [],
          activeVehicleIds: [],
          activeImplementIds: [],
        };
      });
      saveDispatchAssignmentOverrides(next);
      return next;
    });
    affectedSubtasks.forEach((subtask) => {
      void syncSubtaskAssignments({
        ...subtask,
        activeDriverIds: [],
        activeVehicleIds: [],
        activeImplementIds: [],
      });
    });
  }

  function setSubtaskStatus(id: string, status: Status) {
    const progress = status === "erledigt" ? 100 : status === "in Arbeit" ? 25 : undefined;
    updateSubtask(id, progress === undefined ? { status } : { status, progress });
  }

  function updateDriverLocation(location: DriverLocation) {
    setDriverLocations((current) => {
      const next = freshDriverLocations([location, ...current.filter((item) => item.driverId !== location.driverId)]).slice(0, 50);
      saveDriverLocations(next);
      return next;
    });
    if (isSupabaseConfigured && supabase) {
      void supabase
        .from("driver_locations")
        .upsert(driverLocationPayload(location), { onConflict: "driver_id" })
        .then(({ error }) => {
          if (error) console.error("Fahrerstandort konnte nicht in Supabase gespeichert werden", error);
        });
    }
  }

  async function refreshDriverLocations() {
    if (isSupabaseConfigured && supabase) {
      const cutoff = new Date(Date.now() - driverLocationFreshnessMs).toISOString();
      const { data, error } = await supabase
        .from("driver_locations")
        .select("*")
        .gte("recorded_at", cutoff)
        .order("recorded_at", { ascending: false });
      if (!error) {
        const next = freshDriverLocations(((data ?? []) as DriverLocationRow[]).map(driverLocationFromRow));
        saveDriverLocations(next);
        setDriverLocations(next);
        return;
      }
      console.error("Fahrerstandorte konnten nicht aus Supabase geladen werden", error);
    }
    const next = loadDriverLocations();
    saveDriverLocations(next);
    setDriverLocations(next);
  }

  useEffect(() => {
    void refreshDriverLocations();
    const interval = window.setInterval(() => { void refreshDriverLocations(); }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  async function syncJobToSupabase(job: Job, generatedSubtasks: Subtask[]) {
    if (!isSupabaseConfigured || !supabase) return { ok: false, error: "Supabase ist nicht aktiv." };
    const fallbackFarmerOrganizationId = organizationRecords.find((organization) => organization.kind === "farmer" && !organization.archivedAt)?.id ?? farmerOrganizationId;
    const jobPayload = {
      id: job.id,
      job_number: job.jobNumber ?? generateJobNumber(),
      farmer_organization_id: job.farmerOrganizationId ?? fallbackFarmerOrganizationId,
      contractor_organization_id: job.contractorOrganizationId ?? null,
      title: job.title,
      description: job.notes,
      planned_start: parseTimeWindowDate(job.timeWindow, 8),
      planned_end: parseTimeWindowDate(job.timeWindow, 17),
      priority: job.priority ?? "normal",
      status: "open",
    };
    let { error: jobError } = await supabase.from("jobs").upsert(jobPayload, { onConflict: "id" });
    if (jobError && (jobError.message.includes("job_number") || jobError.message.includes("jobs_job_number"))) {
      const { job_number: _jobNumber, ...legacyJobPayload } = jobPayload;
      const retry = await supabase.from("jobs").upsert(legacyJobPayload, { onConflict: "id" });
      jobError = retry.error;
    }
    if (jobError) {
      console.error("Auftrag konnte nicht in Supabase gespeichert werden", jobError);
      return { ok: false, error: `${job.jobNumber ?? job.title}: ${jobError.message}` };
    }

    const knownFieldIds = new Set(fieldRecords.map((field) => field.id));
    const jobFields = job.fieldIds
      .filter((fieldId) => knownFieldIds.has(fieldId))
      .map((fieldId) => ({ job_id: job.id, field_id: fieldId }));
    if (jobFields.length > 0) {
      const { error } = await supabase.from("job_fields").upsert(jobFields, { onConflict: "job_id,field_id" });
      if (error) {
        console.error("Auftragsflächen konnten nicht in Supabase gespeichert werden", error);
        return { ok: false, error: `${job.jobNumber ?? job.title}: ${error.message}` };
      }
    }

    const jobTasks = generatedSubtasks.map((subtask) => jobTaskPayload(job, {
      ...subtask,
      fieldId: knownFieldIds.has(subtask.fieldId) ? subtask.fieldId : "",
    }));
    if (jobTasks.length > 0) {
      const { error } = await supabase.from("job_tasks").upsert(jobTasks, { onConflict: "id" });
      if (error) {
        console.error("Teilaufträge konnten nicht in Supabase gespeichert werden", error);
        return { ok: false, error: `${job.jobNumber ?? job.title}: ${error.message}` };
      }
    }
    return { ok: true };
  }

  async function syncCurrentBrowserStateToSupabase(silent = false) {
    if (!isSupabaseConfigured || !supabase) {
      setBrowserSyncStatus("error");
      setBrowserSyncMessage(t("sync.supabaseMissing"));
      return;
    }
    if (browserSyncStatus === "syncing") return;
    setBrowserSyncStatus("syncing");
    if (!silent) setBrowserSyncMessage(t("sync.running"));
    try {
      const syncErrors: string[] = [];
      for (const organization of organizationRecords) {
        let { error } = await supabase.from("organizations").upsert(organizationPayload(organization));
        if (error && error.message.includes("archived_at")) {
          const retry = await supabase.from("organizations").upsert(organizationPayloadWithoutArchive(organization));
          error = retry.error;
        }
        if (error) syncErrors.push(`${organization.name}: ${error.message}`);
      }
      for (const field of fieldRecords) {
        const { error } = await supabase.from("fields").upsert(fieldPayload(field));
        if (error) {
          syncErrors.push(`${field.name}: ${error.message}`);
        } else {
          await syncFieldBoundary(field);
          await syncFieldHazards(field);
        }
      }
      for (const driver of driverRecords) {
        const { error } = await supabase.from("personnel_resources").upsert(driverPayload(driver));
        if (error) syncErrors.push(`${driver.name}: ${error.message}`);
      }
      for (const vehicle of vehicleRecords) {
        const { error } = await supabase.from("vehicles").upsert(vehiclePayload(vehicle));
        if (error) syncErrors.push(`${vehicle.name}: ${error.message}`);
      }
      for (const implement of implementRecords) {
        const { error } = await supabase.from("implements").upsert(implementPayload(implement));
        if (error) syncErrors.push(`${implement.name}: ${error.message}`);
      }
      for (const taskTemplate of taskTemplateRecords) {
        const { error } = await supabase.from("task_templates").upsert(taskTemplatePayload(taskTemplate));
        if (error) syncErrors.push(`${taskTemplate.name}: ${error.message}`);
      }
      for (const job of jobs) {
        const jobSubtasks = subtasks.filter((subtask) => subtask.jobId === job.id);
        const result = await syncJobToSupabase(job, jobSubtasks);
        if (!result.ok) syncErrors.push(result.error ?? t("sync.jobFailed", { job: job.jobNumber ?? job.title }));
        if (job.archivedAt) {
          const { error } = await supabase.from("jobs").update({ archived_at: job.archivedAt }).eq("id", job.id);
          if (error) syncErrors.push(`${job.jobNumber ?? job.title}: ${error.message}`);
        }
      }
      for (const subtask of subtasks) {
        const result = await syncSubtaskAssignments(subtask);
        if (!result.ok) syncErrors.push(result.error ?? t("sync.subtaskFailed", { subtask: subtask.id }));
      }
      setPendingDriverSync({});
      savePendingDriverSync({});
      if (syncErrors.length > 0) {
        setBrowserSyncStatus("error");
        setBrowserSyncMessage(t("sync.partial", { count: syncErrors.length, first: syncErrors[0] }));
      } else {
        setBrowserSyncStatus("success");
        setBrowserSyncMessage(silent ? t("sync.autoSuccess") : t("sync.success"));
      }
    } catch (error) {
      console.error("Browserdaten konnten nicht vollständig nach Supabase synchronisiert werden", error);
      setBrowserSyncStatus("error");
      setBrowserSyncMessage(error instanceof Error ? error.message : t("sync.error"));
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured || loadedData.isDemoMode || !isOnline || !authProfile) return undefined;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void syncCurrentBrowserStateToSupabase(true);
    }, browserAutoSyncIntervalMs);
    return () => window.clearInterval(interval);
  }, [authProfile, browserSyncStatus, isOnline, loadedData.isDemoMode, jobs, subtasks, fieldRecords, driverRecords, vehicleRecords, implementRecords, organizationRecords, taskTemplateRecords]);

  function addJob(job: Job, generatedSubtasks: Subtask[]) {
    const jobWithNumber = { ...job, jobNumber: job.jobNumber ?? generateJobNumber() };
    const subtasksWithJobId = generatedSubtasks.map((subtask) => ({ ...subtask, jobId: jobWithNumber.id }));
    setLocalJobs((current) => {
      const next = { ...current, [jobWithNumber.id]: jobWithNumber };
      saveLocalJobs(next);
      return next;
    });
    setLocalSubtasks((current) => {
      const next = { ...current, [jobWithNumber.id]: subtasksWithJobId };
      saveLocalSubtasks(next);
      return next;
    });
    setJobs((current) => [jobWithNumber, ...current]);
    setSubtasks((current) => [...subtasksWithJobId, ...current]);
    setSelectedJobId(jobWithNumber.id);
    setActiveView("jobs");
    setIsCreateJobModalOpen(false);
    setJobTemplateDraft(null);
    void syncJobToSupabase(jobWithNumber, subtasksWithJobId);
  }

  function duplicateJobFromTemplate(sourceJobId: string) {
    const sourceJob = jobs.find((job) => job.id === sourceJobId);
    if (!sourceJob) return;
    setJobTemplateDraft(sourceJob);
    setIsCreateJobModalOpen(true);
    setShowArchivedJobs(false);
  }

  async function updateJob(id: string, patch: Partial<Job>) {
    const currentJob = jobs.find((job) => job.id === id);
    const nextJob = currentJob ? { ...currentJob, ...patch } : undefined;
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, ...patch } : job)));
    if (nextJob) {
      setLocalJobs((current) => {
        const next = { ...current, [id]: nextJob };
        saveLocalJobs(next);
        return next;
      });
    }
    if (isSupabaseConfigured && supabase) {
      const payload: Record<string, unknown> = {};
      if (patch.title !== undefined) payload.title = patch.title;
      if (patch.notes !== undefined) payload.description = patch.notes;
      if (patch.priority !== undefined) payload.priority = patch.priority;
      const { error } = await supabase.from("jobs").update(payload).eq("id", id);
      if (error) console.error("Auftrag konnte nicht in Supabase aktualisiert werden", error);
    }
  }

  async function archiveJob(id: string) {
    const archivedAt = new Date().toISOString();
    if (dispatchEditJobId === id) setDispatchEditJobId("");
    releaseJobResources(id);
    setLocalArchivedJobs((current) => {
      const next = { ...current, [id]: archivedAt };
      saveLocalArchivedJobs(next);
      return next;
    });
    setLocalJobs((current) => {
      const existing = jobs.find((job) => job.id === id) ?? current[id];
      if (!existing) return current;
      const next = { ...current, [id]: { ...existing, archivedAt } };
      saveLocalJobs(next);
      return next;
    });
    setJobs((current) => current.map((job) => job.id === id ? { ...job, archivedAt } : job));
    if (selectedJobId === id) setSelectedJobId((current) => activeJobs.find((job) => job.id !== current)?.id ?? "");
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("jobs").update({ archived_at: archivedAt }).eq("id", id);
      if (error) console.error("Auftrag konnte nicht archiviert werden", error);
    }
  }

  async function restoreJob(id: string) {
    setLocalArchivedJobs((current) => {
      const next = { ...current };
      delete next[id];
      saveLocalArchivedJobs(next);
      return next;
    });
    setLocalJobs((current) => {
      const existing = jobs.find((job) => job.id === id) ?? current[id];
      if (!existing) return current;
      const next = { ...current, [id]: { ...existing, archivedAt: undefined } };
      saveLocalJobs(next);
      return next;
    });
    setJobs((current) => current.map((job) => job.id === id ? { ...job, archivedAt: undefined } : job));
    setSelectedJobId(id);
    setShowArchivedJobs(false);
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("jobs").update({ archived_at: null }).eq("id", id);
      if (error) console.error("Auftrag konnte nicht reaktiviert werden", error);
    }
  }

  async function deleteJob(id: string) {
    if (dispatchEditJobId === id) setDispatchEditJobId("");
    releaseJobResources(id);
    setLocalArchivedJobs((current) => {
      const next = { ...current };
      delete next[id];
      saveLocalArchivedJobs(next);
      return next;
    });
    setLocalJobs((current) => {
      const next = { ...current };
      delete next[id];
      saveLocalJobs(next);
      return next;
    });
    setLocalSubtasks((current) => {
      const next = { ...current };
      delete next[id];
      saveLocalSubtasks(next);
      return next;
    });
    setJobs((current) => current.filter((job) => job.id !== id));
    setSubtasks((current) => current.filter((subtask) => subtask.jobId !== id));
    if (selectedJobId === id) setSelectedJobId((current) => jobs.find((job) => job.id !== current)?.id ?? "");
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("jobs").delete().eq("id", id);
      if (error) console.error("Auftrag konnte nicht endgültig gelöscht werden", error);
    }
  }

  async function syncFieldBoundary(field: Field) {
    if (!isSupabaseConfigured || !supabase) return;
    const { error: deleteError } = await supabase.from("field_boundaries").delete().eq("field_id", field.id);
    if (deleteError) console.error("Feldgrenze konnte nicht ersetzt werden", deleteError);
    const { error } = await supabase.from("field_boundaries").insert({
      field_id: field.id,
      points_json: field.boundary,
    });
    if (error) console.error("Feldgrenze konnte nicht in Supabase gespeichert werden", error);
  }

  async function syncFieldHazards(field: Field) {
    if (!isSupabaseConfigured || !supabase) return;
    const { error: deleteError } = await supabase.from("field_hazards").delete().eq("field_id", field.id);
    if (deleteError) console.error("Problemstellen konnten nicht ersetzt werden", deleteError);
    if (field.hazards.length === 0) return;
    const { error } = await supabase.from("field_hazards").insert(field.hazards.map((hazard) => ({
      id: hazard.id,
      field_id: field.id,
      hazard_type: hazard.type,
      title: hazard.title,
      description: hazard.description,
      lat: hazard.location.lat,
      lng: hazard.location.lng,
      photo_url: hazard.photoUrl ?? null,
    })));
    if (error) console.error("Problemstellen konnten nicht in Supabase gespeichert werden", error);
  }

  async function addField(field: Field) {
    const ownedField = {
      ...field,
      organizationId: field.organizationId ?? ((currentRole === "farmer_admin" || currentRole === "farmer_employee") ? authProfile?.organizationId : undefined) ?? farmerOrganizationId,
    };
    setFieldRecords((current) => [ownedField, ...current]);
    setLocalFields((current) => {
      const next = { ...current, [ownedField.id]: ownedField };
      saveLocalFields(next);
      return next;
    });
    setDeletedFieldIds((current) => {
      const next = current.filter((fieldId) => fieldId !== ownedField.id);
      saveDeletedFieldIds(next);
      return next;
    });
    setSelectedFieldId(ownedField.id);
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("fields").upsert(fieldPayload(ownedField));
      if (error) {
        console.error("Fläche konnte nicht in Supabase gespeichert werden", error);
        return;
      }
      await syncFieldBoundary(ownedField);
      await syncFieldHazards(ownedField);
    }
  }

  async function updateField(id: string, patch: Partial<Field>) {
    const currentField = fieldRecords.find((field) => field.id === id);
    const nextField = currentField ? { ...currentField, ...patch } : undefined;
    setFieldRecords((current) => current.map((field) => (field.id === id ? { ...field, ...patch } : field)));
    if (nextField) {
      setLocalFields((current) => {
        const next = { ...current, [id]: nextField };
        saveLocalFields(next);
        return next;
      });
    }
    if (nextField && isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("fields").update(fieldPayload(nextField)).eq("id", id);
      if (error) console.error("Fläche konnte nicht in Supabase aktualisiert werden", error);
      if (patch.boundary || patch.center) await syncFieldBoundary(nextField);
      if (patch.hazards) await syncFieldHazards(nextField);
    }
  }

  async function archiveField(id: string) {
    const archivedAt = new Date().toISOString();
    setFieldRecords((current) => current.map((field) => field.id === id ? { ...field, archivedAt } : field));
    setLocalFields((current) => {
      const existing = fieldRecords.find((field) => field.id === id) ?? current[id];
      if (!existing) return current;
      const next = { ...current, [id]: { ...existing, archivedAt } };
      saveLocalFields(next);
      return next;
    });
    if (selectedFieldId === id) setSelectedFieldId((current) => fieldRecords.find((field) => field.id !== current && !field.archivedAt)?.id ?? "");
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("fields").update({ archived_at: archivedAt }).eq("id", id);
      if (error) console.error("Fläche konnte nicht archiviert werden", error);
    }
  }

  async function deleteField(id: string) {
    setFieldRecords((current) => current.filter((field) => field.id !== id));
    setLocalFields((current) => {
      const next = { ...current };
      delete next[id];
      saveLocalFields(next);
      return next;
    });
    setDeletedFieldIds((current) => {
      const next = Array.from(new Set([...current, id]));
      saveDeletedFieldIds(next);
      return next;
    });
    setSubtasks((current) => current.filter((subtask) => subtask.fieldId !== id));
    setJobs((current) => current.map((job) => ({ ...job, fieldIds: job.fieldIds.filter((fieldId) => fieldId !== id) })));
    if (selectedFieldId === id) setSelectedFieldId((current) => fieldRecords.find((field) => field.id !== current)?.id ?? "");
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("fields").delete().eq("id", id);
      if (error) console.error("Fläche konnte nicht endgültig gelöscht werden", error);
    }
  }

  async function uploadFieldAttachments(fieldId: string, kind: "photo" | "document", files: File[]) {
    if (files.length === 0) return;
    const uploadedAt = new Date().toISOString();
    const bucket = kind === "photo" ? "field-photos" : "job-documents";
    const uploadedAttachments = await Promise.all(files.map(async (file) => {
      const id = crypto.randomUUID();
      const filePath = storagePathForFieldFile(fieldId, id, file);
      let url = URL.createObjectURL(file);
      if (isSupabaseConfigured && supabase) {
        const upload = await supabase.storage.from(bucket).upload(filePath, file, { cacheControl: "3600", upsert: false });
        if (upload.error) {
          console.error("Datei konnte nicht in Supabase Storage hochgeladen werden", upload.error);
        } else {
          url = supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
          const { error } = await supabase.from("documents").insert({
            id,
            organization_id: farmerOrganizationId,
            field_id: fieldId,
            file_name: file.name,
            file_path: filePath,
            file_type: file.type || kind,
          });
          if (error) console.error("Dokument konnte nicht in Supabase gespeichert werden", error);
        }
      }
      return {
        id,
        kind,
        name: file.name,
        placeholderUrl: url,
        filePath,
        mimeType: file.type,
        sizeBytes: file.size,
        uploadedAt,
      };
    }));
    setFieldRecords((current) => current.map((field) => (
      field.id === fieldId ? { ...field, attachments: [...field.attachments, ...uploadedAttachments] } : field
    )));
  }

  async function archiveFieldAttachment(fieldId: string, attachmentId: string) {
    const archivedAt = new Date().toISOString();
    setFieldRecords((current) => current.map((field) => (
      field.id === fieldId
        ? { ...field, attachments: field.attachments.map((attachment) => attachment.id === attachmentId ? { ...attachment, archivedAt } : attachment) }
        : field
    )));
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("documents").update({ archived_at: archivedAt }).eq("id", attachmentId);
      if (error) console.error("Dokument konnte nicht archiviert werden", error);
    }
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const legacyDriverSupabaseIds: Record<string, string> = {
    d1: "50000000-0000-4000-8000-000000000001",
    d2: "50000000-0000-4000-8000-000000000002",
    d3: "50000000-0000-4000-8000-000000000003",
    d4: "50000000-0000-4000-8000-000000000004",
    d5: "50000000-0000-4000-8000-000000000005",
    d6: "50000000-0000-4000-8000-000000000006",
  };

  const legacyVehicleSupabaseIds: Record<string, string> = {
    v0: "60000000-0000-4000-8000-000000000000",
    v1: "60000000-0000-4000-8000-000000000001",
    v2: "60000000-0000-4000-8000-000000000002",
    v3: "60000000-0000-4000-8000-000000000003",
    v4: "60000000-0000-4000-8000-000000000004",
    v5: "60000000-0000-4000-8000-000000000005",
  };

  const legacyImplementSupabaseIds: Record<string, string> = {
    i1: "70000000-0000-4000-8000-000000000001",
    i2: "70000000-0000-4000-8000-000000000002",
    i3: "70000000-0000-4000-8000-000000000003",
    i4: "70000000-0000-4000-8000-000000000004",
    i5: "70000000-0000-4000-8000-000000000005",
  };

  function isUuid(value: string | undefined) {
    return Boolean(value && uuidPattern.test(value));
  }

  function deterministicUuid(seed: string, prefix: string) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    const suffix = Math.abs(hash >>> 0).toString(16).padStart(12, "0").slice(-12);
    return `${prefix}-0000-4000-8000-${suffix}`;
  }

  function supabaseDriverId(driver: Driver) {
    if (isUuid(driver.id)) return driver.id;
    return legacyDriverSupabaseIds[driver.id] ?? deterministicUuid(`driver:${driver.id}:${driver.email ?? driver.name}`, "50000000");
  }

  function supabaseVehicleId(vehicle: Vehicle) {
    if (isUuid(vehicle.id)) return vehicle.id;
    return legacyVehicleSupabaseIds[vehicle.id] ?? deterministicUuid(`vehicle:${vehicle.id}:${vehicle.name}`, "60000000");
  }

  function supabaseImplementId(implement: Implement) {
    if (isUuid(implement.id)) return implement.id;
    return legacyImplementSupabaseIds[implement.id] ?? deterministicUuid(`implement:${implement.id}:${implement.name}`, "70000000");
  }

  function driverPayload(driver: Driver) {
    return {
      id: supabaseDriverId(driver),
      organization_id: driver.organizationId ?? contractorOrganizationId,
      full_name: driver.name,
      email: driver.email ?? "",
      access_password: driver.accessPassword ?? "",
      vehicle_name: driver.vehicle,
      job_visibility: driver.jobVisibility ?? "assigned_only",
      mobile: driver.mobile ?? "",
      license_classes: driver.licenseClasses ?? [],
      max_daily_hours: driver.maxDailyHours ?? 8,
      resource_type: driver.resourceType ?? "Personal",
      operation_type: driver.operationType ?? "",
      archived_at: driver.archivedAt ?? null,
    };
  }

  function vehiclePayload(vehicle: Vehicle) {
    return {
      id: supabaseVehicleId(vehicle),
      organization_id: vehicle.organizationId ?? contractorOrganizationId,
      name: vehicle.name,
      vehicle_type: vehicle.type,
      license_plate: vehicle.licensePlate ?? "",
      resource_type: vehicle.resourceType ?? vehicle.type,
      operation_type: vehicle.operationType ?? "",
      status: vehicle.status,
      archived_at: vehicle.archivedAt ?? null,
    };
  }

  function implementPayload(implement: Implement) {
    return {
      id: supabaseImplementId(implement),
      organization_id: implement.organizationId ?? contractorOrganizationId,
      name: implement.name,
      implement_type: implement.type,
      resource_type: implement.resourceType ?? implement.type,
      operation_type: implement.operationType ?? "",
      status: implement.status,
      archived_at: implement.archivedAt ?? null,
    };
  }

  async function addDriver(driver: Driver) {
    setDriverRecords((current) => [driver, ...current]);
    setLocalDrivers((current) => {
      const next = { ...current, [driver.id]: driver };
      saveLocalDrivers(next);
      return next;
    });
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("personnel_resources").upsert(driverPayload(driver));
      if (error) console.error("Personal konnte nicht in Supabase gespeichert werden", error);
    }
  }

  async function updateDriver(id: string, patch: Partial<Driver>) {
    const currentDriver = driverRecords.find((driver) => driver.id === id);
    const nextDriver = currentDriver ? { ...currentDriver, ...patch } : undefined;
    setDriverRecords((current) => current.map((driver) => (driver.id === id ? { ...driver, ...patch } : driver)));
    if (nextDriver) {
      setLocalDrivers((current) => {
        const next = { ...current, [id]: nextDriver };
        saveLocalDrivers(next);
        return next;
      });
    }
    if (nextDriver && isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("personnel_resources").update(driverPayload(nextDriver)).eq("id", supabaseDriverId(nextDriver));
      if (error) console.error("Personal konnte nicht in Supabase aktualisiert werden", error);
    }
  }

  async function archiveDriver(id: string) {
    const archivedAt = new Date().toISOString();
    const currentDriver = driverRecords.find((driver) => driver.id === id);
    const nextDriver = currentDriver ? { ...currentDriver, archivedAt } : undefined;
    setDriverRecords((current) => current.map((driver) => driver.id === id ? { ...driver, archivedAt } : driver));
    if (nextDriver) {
      setLocalDrivers((current) => {
        const next = { ...current, [id]: nextDriver };
        saveLocalDrivers(next);
        return next;
      });
    }
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("personnel_resources").update({ archived_at: archivedAt }).eq("id", currentDriver ? supabaseDriverId(currentDriver) : id);
      if (error) console.error("Personal konnte nicht archiviert werden", error);
    }
  }

  async function restoreDriver(id: string) {
    const currentDriver = driverRecords.find((driver) => driver.id === id);
    const nextDriver = currentDriver ? { ...currentDriver, archivedAt: undefined } : undefined;
    setDriverRecords((current) => current.map((driver) => driver.id === id ? { ...driver, archivedAt: undefined } : driver));
    if (nextDriver) {
      setLocalDrivers((current) => {
        const next = { ...current, [id]: nextDriver };
        saveLocalDrivers(next);
        return next;
      });
    }
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("personnel_resources").update({ archived_at: null }).eq("id", currentDriver ? supabaseDriverId(currentDriver) : id);
      if (error) console.error("Personal konnte nicht reaktiviert werden", error);
    }
  }

  async function deleteDriver(id: string) {
    setDriverRecords((current) => current.filter((driver) => driver.id !== id));
    setLocalDrivers((current) => {
      const next = { ...current };
      delete next[id];
      saveLocalDrivers(next);
      return next;
    });
    setSubtasks((current) => current.map((subtask) => ({ ...subtask, activeDriverIds: subtask.activeDriverIds.filter((driverId) => driverId !== id) })));
    if (isSupabaseConfigured && supabase) {
      const deletedDriver = driverRecords.find((driver) => driver.id === id);
      const { error } = await supabase.from("personnel_resources").delete().eq("id", deletedDriver ? supabaseDriverId(deletedDriver) : id);
      if (error) console.error("Personal konnte nicht endgültig gelöscht werden", error);
    }
  }

  async function addVehicle(vehicle: Vehicle) {
    setVehicleRecords((current) => [vehicle, ...current]);
    setLocalVehicles((current) => {
      const next = { ...current, [vehicle.id]: vehicle };
      saveLocalVehicles(next);
      return next;
    });
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("vehicles").upsert(vehiclePayload(vehicle));
      if (error) console.error("Fahrzeug konnte nicht in Supabase gespeichert werden", error);
    }
  }

  async function updateVehicle(id: string, patch: Partial<Vehicle>) {
    const currentVehicle = vehicleRecords.find((vehicle) => vehicle.id === id);
    const nextVehicle = currentVehicle ? { ...currentVehicle, ...patch } : undefined;
    setVehicleRecords((current) => current.map((vehicle) => (vehicle.id === id ? { ...vehicle, ...patch } : vehicle)));
    if (nextVehicle) {
      setLocalVehicles((current) => {
        const next = { ...current, [id]: nextVehicle };
        saveLocalVehicles(next);
        return next;
      });
    }
    if (nextVehicle && isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("vehicles").update(vehiclePayload(nextVehicle)).eq("id", supabaseVehicleId(nextVehicle));
      if (error) console.error("Fahrzeug konnte nicht in Supabase aktualisiert werden", error);
    }
  }

  async function archiveVehicle(id: string) {
    const archivedAt = new Date().toISOString();
    setVehicleRecords((current) => current.map((vehicle) => vehicle.id === id ? { ...vehicle, archivedAt } : vehicle));
    setLocalVehicles((current) => {
      const existing = vehicleRecords.find((vehicle) => vehicle.id === id) ?? current[id];
      if (!existing) return current;
      const next = { ...current, [id]: { ...existing, archivedAt } };
      saveLocalVehicles(next);
      return next;
    });
    if (isSupabaseConfigured && supabase) {
      const archivedVehicle = vehicleRecords.find((vehicle) => vehicle.id === id);
      const { error } = await supabase.from("vehicles").update({ archived_at: archivedAt }).eq("id", archivedVehicle ? supabaseVehicleId(archivedVehicle) : id);
      if (error) console.error("Fahrzeug konnte nicht archiviert werden", error);
    }
  }

  async function restoreVehicle(id: string) {
    setVehicleRecords((current) => current.map((vehicle) => vehicle.id === id ? { ...vehicle, archivedAt: undefined } : vehicle));
    setLocalVehicles((current) => {
      const existing = vehicleRecords.find((vehicle) => vehicle.id === id) ?? current[id];
      if (!existing) return current;
      const next = { ...current, [id]: { ...existing, archivedAt: undefined } };
      saveLocalVehicles(next);
      return next;
    });
    if (isSupabaseConfigured && supabase) {
      const restoredVehicle = vehicleRecords.find((vehicle) => vehicle.id === id);
      const { error } = await supabase.from("vehicles").update({ archived_at: null }).eq("id", restoredVehicle ? supabaseVehicleId(restoredVehicle) : id);
      if (error) console.error("Fahrzeug konnte nicht reaktiviert werden", error);
    }
  }

  async function deleteVehicle(id: string) {
    setVehicleRecords((current) => current.filter((vehicle) => vehicle.id !== id));
    setLocalVehicles((current) => {
      const next = { ...current };
      delete next[id];
      saveLocalVehicles(next);
      return next;
    });
    setSubtasks((current) => current.map((subtask) => ({ ...subtask, activeVehicleIds: (subtask.activeVehicleIds ?? []).filter((vehicleId) => vehicleId !== id) })));
    if (isSupabaseConfigured && supabase) {
      const deletedVehicle = vehicleRecords.find((vehicle) => vehicle.id === id);
      const { error } = await supabase.from("vehicles").delete().eq("id", deletedVehicle ? supabaseVehicleId(deletedVehicle) : id);
      if (error) console.error("Fahrzeug konnte nicht endgültig gelöscht werden", error);
    }
  }

  async function addImplement(implement: Implement) {
    setImplementRecords((current) => [implement, ...current]);
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("implements").upsert(implementPayload(implement));
      if (error) console.error("Anbaugerät konnte nicht in Supabase gespeichert werden", error);
    }
  }

  async function updateImplement(id: string, patch: Partial<Implement>) {
    const currentImplement = implementRecords.find((implement) => implement.id === id);
    const nextImplement = currentImplement ? { ...currentImplement, ...patch } : undefined;
    setImplementRecords((current) => current.map((implement) => (implement.id === id ? { ...implement, ...patch } : implement)));
    if (nextImplement && isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("implements").update(implementPayload(nextImplement)).eq("id", supabaseImplementId(nextImplement));
      if (error) console.error("Anbaugerät konnte nicht in Supabase aktualisiert werden", error);
    }
  }

  async function archiveImplement(id: string) {
    const archivedAt = new Date().toISOString();
    setImplementRecords((current) => current.map((implement) => implement.id === id ? { ...implement, archivedAt } : implement));
    if (isSupabaseConfigured && supabase) {
      const archivedImplement = implementRecords.find((implement) => implement.id === id);
      const { error } = await supabase.from("implements").update({ archived_at: archivedAt }).eq("id", archivedImplement ? supabaseImplementId(archivedImplement) : id);
      if (error) console.error("Anbaugerät konnte nicht archiviert werden", error);
    }
  }

  async function restoreImplement(id: string) {
    setImplementRecords((current) => current.map((implement) => implement.id === id ? { ...implement, archivedAt: undefined } : implement));
    if (isSupabaseConfigured && supabase) {
      const restoredImplement = implementRecords.find((implement) => implement.id === id);
      const { error } = await supabase.from("implements").update({ archived_at: null }).eq("id", restoredImplement ? supabaseImplementId(restoredImplement) : id);
      if (error) console.error("Anbaugerät konnte nicht reaktiviert werden", error);
    }
  }

  async function deleteImplement(id: string) {
    setImplementRecords((current) => current.filter((implement) => implement.id !== id));
    setSubtasks((current) => current.map((subtask) => ({ ...subtask, activeImplementIds: (subtask.activeImplementIds ?? []).filter((implementId) => implementId !== id) })));
    if (isSupabaseConfigured && supabase) {
      const deletedImplement = implementRecords.find((implement) => implement.id === id);
      const { error } = await supabase.from("implements").delete().eq("id", deletedImplement ? supabaseImplementId(deletedImplement) : id);
      if (error) console.error("Anbaugerät konnte nicht endgültig gelöscht werden", error);
    }
  }

  async function addOrganization(organization: Organization) {
    setOrganizationRecords((current) => [organization, ...current]);
    const copiedTaskTemplates = taskTemplateRecords.filter(isSystemTemplate).map((template) => cloneTaskTemplateForOrganization(template, organization.id));
    const copiedJobTypes = jobTypeRecords.filter(isSystemTemplate).map((jobType) => cloneJobTypeForOrganization(jobType, organization.id));
    if (copiedTaskTemplates.length > 0) {
      setTaskTemplateRecords((current) => [...copiedTaskTemplates, ...current]);
      setLocalTaskTemplates((current) => {
        const next = { ...current };
        copiedTaskTemplates.forEach((template) => {
          next[template.id] = template;
        });
        saveLocalTaskTemplates(next);
        return next;
      });
      const client = supabase;
      if (isSupabaseConfigured && client) {
        copiedTaskTemplates.forEach((template) => {
          void client.from("task_templates").upsert(taskTemplatePayload(template));
        });
      }
    }
    if (copiedJobTypes.length > 0) {
      setJobTypeRecords((current) => [...copiedJobTypes, ...current]);
    }
    setDeletedOrganizationIds((current) => {
      const next = current.filter((organizationId) => organizationId !== organization.id);
      saveDeletedOrganizationIds(next);
      return next;
    });
    setLocalOrganizations((current) => {
      const next = { ...current, [organization.id]: organization };
      saveLocalOrganizations(next);
      return next;
    });
    if (isSupabaseConfigured && supabase) {
      let { error } = await supabase.from("organizations").upsert(organizationPayload(organization));
      if (error && error.message.includes("archived_at")) {
        const retry = await supabase.from("organizations").upsert(organizationPayloadWithoutArchive(organization));
        error = retry.error;
      }
      if (error) console.error("Organisation konnte nicht in Supabase gespeichert werden", error);
    }
  }

  async function updateOrganization(id: string, patch: Partial<Organization>) {
    const currentOrganization = organizationRecords.find((organization) => organization.id === id);
    const nextOrganization = currentOrganization ? { ...currentOrganization, ...patch } : undefined;
    setOrganizationRecords((current) => current.map((organization) => (organization.id === id ? { ...organization, ...patch } : organization)));
    if (nextOrganization) {
      setLocalOrganizations((current) => {
        const next = { ...current, [id]: nextOrganization };
        saveLocalOrganizations(next);
        return next;
      });
    }
    if (nextOrganization && isSupabaseConfigured && supabase) {
      let { error } = await supabase.from("organizations").update(organizationPayload(nextOrganization)).eq("id", id);
      if (error && error.message.includes("archived_at")) {
        const retry = await supabase.from("organizations").update(organizationPayloadWithoutArchive(nextOrganization)).eq("id", id);
        error = retry.error;
      }
      if (error) console.error("Organisation konnte nicht in Supabase aktualisiert werden", error);
    }
  }

  async function archiveOrganization(id: string) {
    const archivedAt = new Date().toISOString();
    const currentOrganization = organizationRecords.find((organization) => organization.id === id);
    const nextOrganization = currentOrganization ? { ...currentOrganization, archivedAt } : undefined;
    setOrganizationRecords((current) => current.map((organization) => (organization.id === id ? { ...organization, archivedAt } : organization)));
    if (nextOrganization) {
      setLocalOrganizations((current) => {
        const next = { ...current, [id]: nextOrganization };
        saveLocalOrganizations(next);
        return next;
      });
    }
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("organizations").update({ archived_at: archivedAt }).eq("id", id);
      if (error && !error.message.includes("archived_at")) console.error("Organisation konnte nicht archiviert werden", error);
    }
  }

  async function deleteOrganization(id: string) {
    setOrganizationRecords((current) => current.filter((organization) => organization.id !== id));
    setDeletedOrganizationIds((current) => {
      const next = Array.from(new Set([...current, id]));
      saveDeletedOrganizationIds(next);
      return next;
    });
    setLocalOrganizations((current) => {
      const next = { ...current };
      delete next[id];
      saveLocalOrganizations(next);
      return next;
    });
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("organizations").delete().eq("id", id);
      if (error) console.error("Organisation konnte nicht endgültig gelöscht werden", error);
    }
  }

  function addJobType(jobType: JobType) {
    setJobTypeRecords((current) => [jobType, ...current]);
    setLocalJobTypes((current) => {
      const next = { ...current, [jobType.id]: jobType };
      saveLocalJobTypes(next);
      return next;
    });
  }

  function updateJobType(id: string, patch: Partial<JobType>) {
    const currentJobType = jobTypeRecords.find((jobType) => jobType.id === id);
    const nextJobType = currentJobType ? { ...currentJobType, ...patch } : undefined;
    setJobTypeRecords((current) => current.map((jobType) => (jobType.id === id ? { ...jobType, ...patch } : jobType)));
    if (nextJobType) {
      setLocalJobTypes((current) => {
        const next = { ...current, [id]: nextJobType };
        saveLocalJobTypes(next);
        return next;
      });
    }
  }

  function archiveJobType(id: string) {
    const archivedAt = new Date().toISOString();
    updateJobType(id, { archivedAt });
  }

  function deleteJobType(id: string) {
    setJobTypeRecords((current) => current.filter((jobType) => jobType.id !== id));
    setLocalJobTypes((current) => {
      const next = { ...current };
      delete next[id];
      saveLocalJobTypes(next);
      return next;
    });
  }

  function taskTemplatePayload(taskTemplate: TaskTemplate) {
    return {
      id: taskTemplate.id,
      organization_id: taskTemplate.organizationId ?? null,
      is_system_template: taskTemplate.isSystemTemplate ?? (taskTemplate.templateOwnerType ? taskTemplate.templateOwnerType === "system" : !taskTemplate.organizationId),
      template_owner_type: taskTemplate.templateOwnerType ?? (taskTemplate.organizationId ? "organization" : "system"),
      source_template_id: taskTemplate.sourceTemplateId ?? null,
      created_by_admin: taskTemplate.createdByAdmin ?? false,
      name: taskTemplate.name,
      work_steps: taskTemplate.workSteps?.length ? taskTemplate.workSteps : [taskTemplate.name],
      time_per_ha: Math.max(taskTemplate.timePerHa ?? 0, 0),
      work_mode: taskTemplate.mode === "Einzelmodus" ? "single" : taskTemplate.mode === "Rollenmodus" ? "role_based" : taskTemplate.mode === "Flächenteilung" ? "area_split" : "team",
      progress_type: taskTemplate.progressMetric === "Fläche" ? "area" : taskTemplate.progressMetric === "Menge" ? "quantity" : taskTemplate.progressMetric === "Fuhren" ? "trips" : "time",
      max_vehicles: positiveInteger(taskTemplate.maxVehicles),
      required_drivers: Math.max(taskTemplate.requiredDrivers ?? 0, 0),
      required_vehicles: Math.max(taskTemplate.requiredVehicles ?? 0, 0),
      required_implements: Math.max(taskTemplate.requiredImplements ?? 0, 0),
      resource_hint: taskTemplate.resourceHint ?? "",
      archived_at: taskTemplate.archivedAt ?? null,
    };
  }

  async function addTaskTemplate(taskTemplate: TaskTemplate) {
    setTaskTemplateRecords((current) => [taskTemplate, ...current]);
    setLocalTaskTemplates((current) => {
      const next = { ...current, [taskTemplate.id]: taskTemplate };
      saveLocalTaskTemplates(next);
      return next;
    });
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("task_templates").upsert(taskTemplatePayload(taskTemplate));
      if (error) console.error("Aufgabe konnte nicht in Supabase gespeichert werden", error);
    }
  }

  async function updateTaskTemplate(id: string, patch: Partial<TaskTemplate>) {
    const currentTaskTemplate = taskTemplateRecords.find((taskTemplate) => taskTemplate.id === id);
    const nextTaskTemplate = currentTaskTemplate ? { ...currentTaskTemplate, ...patch } : undefined;
    setTaskTemplateRecords((current) => current.map((taskTemplate) => (taskTemplate.id === id ? { ...taskTemplate, ...patch } : taskTemplate)));
    if (nextTaskTemplate) {
      setLocalTaskTemplates((current) => {
        const next = { ...current, [id]: nextTaskTemplate };
        saveLocalTaskTemplates(next);
        return next;
      });
    }
    if (nextTaskTemplate && isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("task_templates").update(taskTemplatePayload(nextTaskTemplate)).eq("id", id);
      if (error) console.error("Aufgabe konnte nicht in Supabase aktualisiert werden", error);
    }
  }

  async function archiveTaskTemplate(id: string) {
    const archivedAt = new Date().toISOString();
    const currentTaskTemplate = taskTemplateRecords.find((taskTemplate) => taskTemplate.id === id);
    const nextTaskTemplate = currentTaskTemplate ? { ...currentTaskTemplate, archivedAt } : undefined;
    setTaskTemplateRecords((current) => current.map((taskTemplate) => taskTemplate.id === id ? { ...taskTemplate, archivedAt } : taskTemplate));
    if (nextTaskTemplate) {
      setLocalTaskTemplates((current) => {
        const next = { ...current, [id]: nextTaskTemplate };
        saveLocalTaskTemplates(next);
        return next;
      });
    }
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("task_templates").update({ archived_at: archivedAt }).eq("id", id);
      if (error) console.error("Aufgabe konnte nicht archiviert werden", error);
    }
  }

  async function deleteTaskTemplate(id: string) {
    setTaskTemplateRecords((current) => current.filter((taskTemplate) => taskTemplate.id !== id));
    setLocalTaskTemplates((current) => {
      const next = { ...current };
      delete next[id];
      saveLocalTaskTemplates(next);
      return next;
    });
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("task_templates").delete().eq("id", id);
      if (error) console.error("Aufgabe konnte nicht endgültig gelöscht werden", error);
    }
  }

  function setCurrentRole(role: UserRole) {
    if (authProfile) return;
    setCurrentRoleState(role);
    window.localStorage.setItem("schlaglink.role", role);
  }

  async function signIn(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const matchingDriver = driverRecords.find((driver) => (
      driver.email?.trim().toLowerCase() === normalizedEmail
      && driver.accessPassword
      && driver.accessPassword === password
      && !driver.archivedAt
    ));
    function signInDriverFromPersonnel(driver: Driver) {
      setAuthProfile({
        id: driver.profileId ?? driver.id,
        fullName: driver.name,
        email: driver.email ?? email,
        role: "driver",
        organizationId: driver.organizationId,
        vehicleName: driver.vehicle,
      });
      setCurrentRoleState("driver");
      window.localStorage.setItem("schlaglink.role", "driver");
      setActiveView("driver");
      setAuthError("");
      setAuthLoading(false);
    }
    const demoProfile = getDemoAuthProfile(email, password);
    if (demoProfile && !roleAllowedInAppMode(demoProfile.role, appMode)) {
      setAuthError(t(appMode === "driver" ? "auth.adminAppRequired" : "auth.driverAppRequired"));
      return;
    }
    if (!supabase) {
      if (matchingDriver && roleAllowedInAppMode("driver", appMode)) {
        signInDriverFromPersonnel(matchingDriver);
        return;
      }
      if (demoProfile) {
        setAuthProfile(demoProfile);
        setCurrentRoleState(demoProfile.role);
        window.localStorage.setItem("schlaglink.role", demoProfile.role);
        setAuthError("");
        if (demoProfile.role === "driver") setActiveView("driver");
        return;
      }
      setAuthError(t("auth.supabaseRequired"));
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      let accessDriver = matchingDriver;
      if (!accessDriver) {
        const { data: personnelDriver } = await supabase
          .from("personnel_resources")
          .select("*")
          .ilike("email", normalizedEmail)
          .eq("access_password", password)
          .is("archived_at", null)
          .maybeSingle();
        if (personnelDriver) {
          const row = personnelDriver as {
            id: string;
            organization_id?: string | null;
            full_name: string;
            email?: string | null;
            access_password?: string | null;
            vehicle_name?: string | null;
            job_visibility?: Driver["jobVisibility"] | null;
            mobile?: string | null;
          };
          accessDriver = {
            id: row.id,
            organizationId: row.organization_id ?? undefined,
            name: row.full_name,
            email: row.email ?? normalizedEmail,
            accessPassword: row.access_password ?? password,
            vehicle: row.vehicle_name ?? "",
            jobVisibility: row.job_visibility ?? "assigned_only",
            mobile: row.mobile ?? "",
          };
        }
      }
      if (accessDriver && roleAllowedInAppMode("driver", appMode)) {
        signInDriverFromPersonnel(accessDriver);
        return;
      }
      if (accessDriver && !roleAllowedInAppMode("driver", appMode)) {
        setAuthError(t("auth.driverAppRequired"));
        setAuthLoading(false);
        return;
      }
      if (demoProfile && (error.status === 500 || error.status === 400)) {
        setAuthProfile(demoProfile);
        setCurrentRoleState(demoProfile.role);
        window.localStorage.setItem("schlaglink.role", demoProfile.role);
        setAuthError("");
        if (demoProfile.role === "driver") setActiveView("driver");
      } else {
        setAuthError(error.message);
      }
      setAuthLoading(false);
    }
  }

  async function signOut() {
    await sendCurrentDriverLocationBeforeSignOut();
    releaseCurrentDriverAssignmentsBeforeSignOut();
    if (supabase) await supabase.auth.signOut();
    setAuthSession(null);
    setAuthProfile(null);
    setCurrentRoleState("farmer_admin");
    window.localStorage.setItem("schlaglink.role", "farmer_admin");
    setActiveView(initialViewForAppMode(appMode));
  }

  const permissions = {
    canEditFields: currentRole === "farmer_admin" || currentRole === "farmer_employee" || currentRole === "support_admin",
    canCreateJobs: currentRole === "farmer_admin" || currentRole === "farmer_employee" || currentRole === "contractor_admin" || currentRole === "support_admin",
    canEditDrivers: currentRole === "contractor_admin" || currentRole === "farmer_admin" || currentRole === "support_admin",
    canAssignDrivers: currentRole === "contractor_admin" || currentRole === "farmer_admin" || currentRole === "support_admin",
  };

  if ((appMode === "driver" && (!authProfile || authProfile.role !== "driver")) || (isSupabaseConfigured && !authSession && !authProfile)) {
    return <AuthLogin appMode={appMode} error={authError} isLoading={authLoading} onSignIn={signIn} />;
  }

  if (authProfile && !roleAllowedInAppMode(authProfile.role, appMode)) {
    const targetHref = authProfile.role === "driver" ? "/fahrer" : "/admin";
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand auth-brand">
            <div className="brand-mark">
              <Tractor size={24} />
            </div>
            <div>
              <strong>SchlagLink</strong>
              <span>{t("app.brandSubtitle")}</span>
            </div>
          </div>
          <div>
            <p className="eyebrow">{t("auth.wrongAppEyebrow")}</p>
            <h1>{t(appMode === "driver" ? "auth.adminSignedInTitle" : "auth.driverSignedInTitle")}</h1>
            <p className="auth-copy">{t(appMode === "driver" ? "auth.adminSignedInCopy" : "auth.driverSignedInCopy")}</p>
          </div>
          <div className="auth-form">
            <a className="primary-action wide auth-link-button" href={targetHref}>
              {t(authProfile.role === "driver" ? "auth.openDriverApp" : "auth.openAdminApp")}
            </a>
            <button className="secondary-action wide" onClick={signOut} type="button">
              {t("auth.signOut")}
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <DataProvider
      value={{
        fields: visibleFieldRecords,
        drivers: driverRecords,
        vehicles: vehicleRecords,
        implementsList: implementRecords,
        organizations: organizationRecords,
        jobTypes: visibleJobTypeRecords,
        taskTemplates: visibleTaskTemplateRecords,
        addField,
        updateField,
        archiveField,
        deleteField,
        uploadFieldAttachments,
        archiveFieldAttachment,
        addDriver,
        updateDriver,
        archiveDriver,
        restoreDriver,
        deleteDriver,
        addVehicle,
        updateVehicle,
        archiveVehicle,
        restoreVehicle,
        deleteVehicle,
        addImplement,
        updateImplement,
        archiveImplement,
        restoreImplement,
        deleteImplement,
        addOrganization,
        updateOrganization,
        archiveOrganization,
        deleteOrganization,
        archiveJob,
        restoreJob,
        deleteJob,
        addJobType,
        updateJobType,
        archiveJobType,
        deleteJobType,
        addTaskTemplate,
        updateTaskTemplate,
        archiveTaskTemplate,
        deleteTaskTemplate,
        currentRole,
        setCurrentRole,
        authProfile,
        currentDriverId,
        isAuthenticated: Boolean(authSession || authProfile),
        signOut,
        permissions,
        farmerName: organizationRecords.find((organization) => organization.kind === "farmer" && !organization.archivedAt)?.name ?? mockFarmer,
        contractorName: organizationRecords.find((organization) => organization.kind === "contractor" && !organization.archivedAt)?.name ?? mockContractor,
        isDemoMode: loadedData.isDemoMode,
        isLoading: loadedData.isLoading,
        sourceLabel: loadedData.isDemoMode ? "Demo-Modus aktiv" : "Supabase aktiv",
      }}
    >
    {appMode === "driver" ? (
      <main className="driver-app-only">
        <header className="driver-app-topbar">
          <div className="brand">
            <div className="brand-mark">
              <Tractor size={22} />
            </div>
            <div>
              <strong>SchlagLink</strong>
              <span>{t("nav.driver")}</span>
            </div>
          </div>
          <div className="topbar-actions">
            {authProfile && (
              <div className="user-session-pill">
                <span>{authProfile.fullName}</span>
                <button onClick={signOut} type="button">{t("auth.signOut")}</button>
              </div>
            )}
            <LanguageSwitcher />
          </div>
        </header>
        <DriverView subtasks={activeSubtasks} jobs={activeJobs} onLocationUpdate={updateDriverLocation} onUpdateSubtask={updateSubtask} onUploadSubtaskPhotos={uploadSubtaskPhotos} onDeleteSubtaskPhoto={deleteSubtaskPhoto} />
      </main>
    ) : (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Tractor size={24} />
          </div>
          <div>
            <strong>SchlagLink</strong>
            <span>{t("app.brandSubtitle")}</span>
          </div>
        </div>
        <nav className="nav-list" aria-label="Hauptnavigation">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={activeView === item.key ? "nav-item active" : "nav-item"}
                onClick={() => setActiveView(item.key)}
                type="button"
              >
                <Icon size={19} />
                <span>{t(item.labelKey)}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-controls">
          <span className={loadedData.error || loadedData.isDemoMode ? "pill warning-pill sidebar-status-pill" : "pill success sidebar-status-pill"}>
            <CheckCircle2 size={16} /> {loadedData.error ? t("app.supabaseError") : loadedData.isDemoMode ? t("app.demoMode") : t("app.supabaseActive")}
          </span>
          <span className={isOnline ? "pill success sidebar-status-pill" : "pill warning-pill sidebar-status-pill"}>
            {isOnline ? t("pwa.online") : t("pwa.offline")}
          </span>
          {isSupabaseConfigured && !loadedData.isDemoMode && (
            <>
              <button
                className="sidebar-sync-button"
                disabled={browserSyncStatus === "syncing" || !isOnline}
                onClick={() => { void syncCurrentBrowserStateToSupabase(); }}
                type="button"
              >
                {browserSyncStatus === "syncing" ? t("sync.buttonRunning") : t("sync.button")}
              </button>
              {browserSyncMessage && (
                <span className={browserSyncStatus === "error" ? "pill problem-pill sidebar-status-pill" : browserSyncStatus === "success" ? "pill success sidebar-status-pill" : "pill warning-pill sidebar-status-pill"}>
                  {browserSyncMessage}
                </span>
              )}
            </>
          )}
          {Object.keys(pendingDriverSync).length > 0 && (
            <span className="pill warning-pill sidebar-status-pill">
              {t("pwa.pendingSync", { count: Object.keys(pendingDriverSync).length })}
            </span>
          )}
          {loadedData.error && (
            <span className="pill problem-pill sidebar-status-pill" title={loadedData.error}>
              {t("app.supabaseError")}: {loadedData.error}
            </span>
          )}
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h1>{t(navItems.find((item) => item.key === activeView)?.labelKey ?? "nav.dashboard")}</h1>
          </div>
          <div className="topbar-actions">
            {authProfile ? (
              <div className="user-session-pill">
                <span>{authProfile.fullName}</span>
                <small>{t(`roles.${authProfile.role}`)}</small>
                <button onClick={signOut} type="button">{t("auth.signOut")}</button>
              </div>
            ) : (
              <UserRoleSwitcher />
            )}
            <LanguageSwitcher />
          </div>
        </header>

        {activeView === "dashboard" && (
          <Dashboard
            jobs={activeJobs}
            subtasks={activeSubtasks}
            onOpenFields={() => setActiveView("fields")}
            onOpenJobs={() => setActiveView("jobs")}
          />
        )}
        {activeView === "fields" && (
          <Fields
            jobs={jobs}
            selectedFieldId={selectedFieldId}
            subtasks={activeSubtasks}
            onSelectField={setSelectedFieldId}
          />
        )}
        {activeView === "create" && <CreateJob onSave={addJob} />}
        {activeView === "jobs" && (
          <section className="view-stack">
            {selectedJob && (
              <JobDetail
                jobs={visibleJobs}
                selectedJob={selectedJob}
                subtasks={showArchivedJobs ? subtasks : activeSubtasks}
                onUpdateJob={updateJob}
                onUpdateSubtask={updateSubtask}
                onSelectJob={setSelectedJobId}
                onSetStatus={setSubtaskStatus}
                onArchiveJob={archiveJob}
                onRestoreJob={restoreJob}
                onDeleteJob={deleteJob}
                onDuplicateJob={duplicateJobFromTemplate}
                onCreateJob={() => setIsCreateJobModalOpen(true)}
                showArchived={showArchivedJobs}
                onShowArchivedChange={setShowArchivedJobs}
                activeCount={activeJobs.length}
                archivedCount={archivedJobs.length}
              />
            )}
            {!selectedJob && (
              <div className="panel">
                <div className="section-heading">
                  <h2>{t("jobs.jobs")}</h2>
                  <div className="segmented-control">
                    <button className={!showArchivedJobs ? "active" : ""} onClick={() => setShowArchivedJobs(false)} type="button">
                      {t("archive.active")} · {activeJobs.length}
                    </button>
                    <button className={showArchivedJobs ? "active" : ""} onClick={() => setShowArchivedJobs(true)} type="button">
                      {t("archive.archived")} · {archivedJobs.length}
                    </button>
                  </div>
                </div>
                {!showArchivedJobs && (
                  <button className="primary-action" onClick={() => setIsCreateJobModalOpen(true)} type="button">
                    {t("jobs.newJob")}
                  </button>
                )}
                <p className="muted">{showArchivedJobs ? t("archive.noArchivedJobs") : t("jobs.noJobs")}</p>
              </div>
            )}
            {isCreateJobModalOpen && (
              <div className="modal-backdrop" role="presentation">
                <div className="resource-modal create-job-modal" role="dialog" aria-modal="true">
                  <div className="section-heading">
                    <h2>{t("jobs.newJob")}</h2>
                    <button className="secondary-action icon-action" onClick={() => { setIsCreateJobModalOpen(false); setJobTemplateDraft(null); }} type="button"><X size={18} /></button>
                  </div>
                  <CreateJob initialTemplate={jobTemplateDraft ? { job: jobTemplateDraft } : null} onSave={addJob} onSaved={() => { setIsCreateJobModalOpen(false); setJobTemplateDraft(null); }} />
                </div>
              </div>
            )}
          </section>
        )}
        {activeView === "driver" && (
          <DriverView subtasks={activeSubtasks} jobs={activeJobs} onLocationUpdate={updateDriverLocation} onUpdateSubtask={updateSubtask} onUploadSubtaskPhotos={uploadSubtaskPhotos} onDeleteSubtaskPhoto={deleteSubtaskPhoto} />
        )}
        {activeView === "contractor" && (
          <ContractorView
            subtasks={activeSubtasks}
            jobs={activeJobs}
            driverLocations={driverLocations}
            onRefreshDriverLocations={() => { void refreshDriverLocations(); }}
            onUpdateSubtask={updateSubtask}
            variant="dispatch"
            onOpenJob={(jobId) => {
              setDispatchEditJobId(jobId);
            }}
            onOpenMasterData={(focus) => {
              setMasterDataFocus(focus);
              setActiveView("masterData");
            }}
          />
        )}
        {activeView === "masterData" && (
          <ContractorView
            subtasks={activeSubtasks}
            jobs={activeJobs}
            driverLocations={driverLocations}
            onRefreshDriverLocations={() => { void refreshDriverLocations(); }}
            onUpdateSubtask={updateSubtask}
            variant="masterData"
            masterDataFocus={masterDataFocus}
          />
        )}
        {activeView === "report" && <CompletionReport jobs={activeJobs} subtasks={activeSubtasks} />}
        {dispatchEditJob && (
          <JobEditModal
            job={dispatchEditJob}
            jobs={activeJobs}
            subtasks={activeSubtasks}
            onClose={() => setDispatchEditJobId("")}
            onUpdateJob={updateJob}
            onUpdateSubtask={updateSubtask}
            onSetStatus={setSubtaskStatus}
            onArchiveJob={archiveJob}
            onDeleteJob={deleteJob}
          />
        )}
      </main>
    </div>
    )}
    </DataProvider>
  );
}
