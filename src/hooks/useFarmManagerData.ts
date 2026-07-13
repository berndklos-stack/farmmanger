import { useCallback, useEffect, useMemo, useState } from "react";
import { contractor, drivers, farmer, fields as mockFields, implementsList as mockImplements, jobs as mockJobs, organizations as mockOrganizations, subtasks as mockSubtasks, taskTemplates as mockTaskTemplates, vehicles as mockVehicles } from "../data/mockData";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { Driver, Field, FieldAttachment, FieldHazard, FieldHazardType, Implement, Job, Organization, PersonnelAppAccess, PersonnelEmployeeType, ProgressMetric, Status, Subtask, SubtaskPhoto, SubtaskStatusEvent, Task, TaskTemplate, UserRole, Vehicle, WorkMode } from "../types";

type DataState = {
  fields: Field[];
  drivers: Driver[];
  vehicles: Vehicle[];
  implementsList: Implement[];
  organizations: Organization[];
  taskTemplates: TaskTemplate[];
  jobs: Job[];
  subtasks: Subtask[];
  isDemoMode: boolean;
  isLoading: boolean;
  error?: string;
  refreshData: (options?: RefreshDataOptions) => Promise<void>;
};

type RefreshDataOptions = {
  silent?: boolean;
};

const personnelAccessMarker = "FM_PERSONNEL_ACCESS:";

function stripMarkerBlock(value: string | undefined | null, marker: string) {
  return (value ?? "").split("\n").filter((line) => !line.startsWith(marker)).join("\n").trim();
}

function parseMarkerJson<T>(value: string | undefined | null, marker: string, fallback: T): T {
  const line = (value ?? "").split("\n").find((item) => item.startsWith(marker));
  if (!line) return fallback;
  try {
    return JSON.parse(line.slice(marker.length)) as T;
  } catch {
    return fallback;
  }
}

function personnelAccessFromOperationType(value: string | undefined | null) {
  return parseMarkerJson<Partial<PersonnelAppAccess> & { employeeType?: PersonnelEmployeeType }>(value, personnelAccessMarker, {});
}

const offlineDataCacheKey = "farm-manager.offlineDataCache";
const fieldReleaseMarker = "__farm-manager_released_contractors:";
const organizationMetaMarker = "__farm-manager_organization_meta:";

type CachedDataState = Omit<DataState, "isLoading" | "error" | "refreshData">;

function readOfflineDataCache(): CachedDataState | null {
  try {
    const raw = window.localStorage.getItem(offlineDataCacheKey);
    return raw ? JSON.parse(raw) as CachedDataState : null;
  } catch {
    return null;
  }
}

function writeOfflineDataCache(data: CachedDataState) {
  window.localStorage.setItem(offlineDataCacheKey, JSON.stringify(data));
}

function parseFieldNotes(notes?: string | null) {
  const lines = (notes ?? "").split("\n");
  const releaseLine = lines.find((line) => line.startsWith(fieldReleaseMarker));
  const releasedContractorIds = releaseLine
    ? releaseLine.slice(fieldReleaseMarker.length).split(",").map((item) => item.trim()).filter(Boolean)
    : [];
  return {
    releasedContractorIds,
    restrictedZones: lines.filter((line) => line.trim() && !line.startsWith(fieldReleaseMarker)),
  };
}

function parseOrganizationAddress(address?: string | null) {
  const lines = (address ?? "").split("\n");
  const metaLine = lines.find((line) => line.startsWith(organizationMetaMarker));
  const cleanAddress = lines.filter((line) => line.trim() && !line.startsWith(organizationMetaMarker)).join("\n").trim();
  if (!metaLine) return { cleanAddress };

  try {
    const parsed = JSON.parse(decodeURIComponent(metaLine.slice(organizationMetaMarker.length))) as Partial<Organization>;
    return { cleanAddress, meta: parsed };
  } catch {
    return { cleanAddress };
  }
}

type FieldRow = {
  id: string;
  organization_id: string | null;
  name: string;
  area_ha: number | null;
  crop: string | null;
  ownership_type: string | null;
  center_lat: number | null;
  center_lng: number | null;
  access_lat: number | null;
  access_lng: number | null;
  access_description: string | null;
  notes: string | null;
  archived_at?: string | null;
};

type BoundaryRow = {
  field_id: string;
  points_json: { lat: number; lng: number }[] | null;
};

type HazardRow = {
  id: string;
  field_id: string;
  hazard_type: FieldHazardType;
  title: string;
  description: string | null;
  lat: number | null;
  lng: number | null;
};

type DocumentRow = {
  id: string;
  field_id: string | null;
  file_name: string;
  file_path: string;
  file_type: string | null;
  created_at: string | null;
  archived_at?: string | null;
};

type OrganizationRow = {
  id: string;
  name: string;
  organization_type: Organization["kind"];
  address: string | null;
  organization_number?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  website?: string | null;
  vat_id?: string | null;
  logo_url?: string | null;
  default_language?: string | null;
  billing_details?: string | null;
  customer_number?: string | null;
  supplier_category?: string | null;
  notes?: string | null;
  contacts?: Organization["contacts"] | string | null;
  archived_at?: string | null;
};

type JobRow = {
  id: string;
  job_number?: string | null;
  farmer_organization_id: string | null;
  contractor_organization_id: string | null;
  title: string;
  description: string | null;
  planned_start: string | null;
  planned_end: string | null;
  status: string | null;
  completion_status?: Job["completionStatus"] | null;
  completion_status_changed_at?: string | null;
  completion_status_changed_by?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  archived_at?: string | null;
};

type JobFieldRow = {
  job_id: string;
  field_id: string;
};

type JobTaskRow = {
  id: string;
  job_id: string;
  field_id: string | null;
  task_type: string;
  title: string;
  description: string | null;
  work_mode: "single" | "team" | "role_based" | "area_split";
  progress_type: "area" | "quantity" | "trips" | "time";
  target_area_ha: number | null;
  target_quantity: number | null;
  quantity_unit: string | null;
  target_trips: number | null;
  planned_columns?: number | null;
  max_active_workers: number | null;
  status: string | null;
  updated_at?: string | null;
};

type AssignmentRow = {
  id: string;
  job_task_id: string;
  driver_profile_id: string | null;
  personnel_resource_id?: string | null;
  vehicle_name: string | null;
  status: string | null;
  started_at?: string | null;
  completed_area_ha: number | null;
  completed_quantity: number | null;
  completed_trips: number | null;
  completed_at?: string | null;
  notes: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type TaskReportRow = {
  id: string;
  job_task_id: string;
  message: string | null;
  photo_url: string | null;
  created_by: string | null;
  created_at: string | null;
};

type DriverRow = {
  id: string;
  full_name: string | null;
  role: UserRole | null;
  organization_id?: string | null;
  email?: string | null;
  vehicle_name?: string | null;
  job_visibility?: Driver["jobVisibility"] | null;
  mobile?: string | null;
  license_classes?: string[] | string | null;
  max_daily_hours?: number | null;
  annual_vacation_days?: number | null;
  vacation_used_days?: number | null;
  resource_type?: string | null;
  operation_type?: string | null;
};

type PersonnelResourceRow = {
  id: string;
  profile_id?: string | null;
  organization_id?: string | null;
  full_name: string;
  email?: string | null;
  access_password?: string | null;
  vehicle_name: string | null;
  job_visibility?: Driver["jobVisibility"] | null;
  mobile: string | null;
  license_classes: string[] | string | null;
  max_daily_hours: number | null;
  annual_vacation_days?: number | null;
  vacation_used_days?: number | null;
  resource_type: string | null;
  operation_type: string | null;
  archived_at?: string | null;
};

type VehicleRow = {
  id: string;
  organization_id?: string | null;
  name: string;
  vehicle_type: string | null;
  license_plate?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  construction_year?: number | null;
  operating_hours?: number | null;
  default_driver_id?: string | null;
  resource_type?: string | null;
  operation_type?: string | null;
  status: Vehicle["status"] | null;
  archived_at?: string | null;
};

type ImplementRow = {
  id: string;
  organization_id?: string | null;
  name: string;
  implement_type: string | null;
  manufacturer?: string | null;
  working_width?: number | null;
  resource_type?: string | null;
  operation_type?: string | null;
  status: Implement["status"] | null;
  archived_at?: string | null;
};

type TaskTemplateRow = {
  id: string;
  organization_id?: string | null;
  is_system_template?: boolean | null;
  template_owner_type?: "system" | "organization" | null;
  source_template_id?: string | null;
  created_by_admin?: boolean | null;
  name: string;
  work_steps: string[] | string | null;
  time_per_ha: number | null;
  work_mode: "single" | "team" | "role_based" | "area_split" | null;
  progress_type: "area" | "quantity" | "trips" | "time" | null;
  max_vehicles: number | null;
  required_drivers: number | null;
  required_vehicles: number | null;
  required_implements: number | null;
  resource_hint: string | null;
  quantity_unit?: string | null;
  archived_at?: string | null;
};

function toWorkMode(value: JobTaskRow["work_mode"]): WorkMode {
  if (value === "single") return "Einzelmodus";
  if (value === "role_based") return "Rollenmodus";
  if (value === "area_split") return "Flächenteilung";
  return "Teammodus";
}

function toProgressMetric(value: JobTaskRow["progress_type"]): ProgressMetric {
  if (value === "area") return "Fläche";
  if (value === "quantity") return "Menge";
  if (value === "trips") return "Fuhren";
  return "Zeit";
}

function toStatus(value: string | null): Status {
  if (value === "completed") return "erledigt";
  if (value === "active") return "in Arbeit";
  if (value === "paused") return "pausiert";
  if (value === "reserved") return "reserviert";
  if (value === "issue" || value === "problem") return "Problem";
  if (value === "partial") return "teilweise erledigt";
  return "offen";
}

function formatTimeWindow(start: string | null, end: string | null) {
  if (!start && !end) return "Kein Zeitfenster hinterlegt";
  return `${start ? new Date(start).toLocaleString("de-DE") : "offen"} bis ${end ? new Date(end).toLocaleString("de-DE") : "offen"}`;
}

function documentUrl(row: DocumentRow) {
  if (!supabase) return "";
  const bucket = row.file_type?.startsWith("image/") ? "field-photos" : "job-documents";
  return supabase.storage.from(bucket).getPublicUrl(row.file_path).data.publicUrl;
}

function mapFields(fieldRows: FieldRow[], boundaryRows: BoundaryRow[], hazardRows: HazardRow[], documentRows: DocumentRow[]): Field[] {
  return fieldRows.map((row) => {
    const parsedNotes = parseFieldNotes(row.notes);
    const boundary = boundaryRows.find((item) => item.field_id === row.id)?.points_json ?? [];
    const hazards: FieldHazard[] = hazardRows
      .filter((hazard) => hazard.field_id === row.id)
      .map((hazard) => ({
        id: hazard.id,
        type: hazard.hazard_type,
        title: hazard.title,
        description: hazard.description ?? "",
        location: {
          lat: hazard.lat ?? row.center_lat ?? 0,
          lng: hazard.lng ?? row.center_lng ?? 0,
        },
      }));
    const attachments: FieldAttachment[] = documentRows
      .filter((document) => document.field_id === row.id && !document.archived_at)
      .map((document) => ({
        id: document.id,
        kind: document.file_type?.startsWith("image/") ? "photo" : "document",
        name: document.file_name,
        filePath: document.file_path,
        placeholderUrl: documentUrl(document),
        mimeType: document.file_type ?? undefined,
        uploadedAt: document.created_at ?? undefined,
      }));

    return {
      id: row.id,
      organizationId: row.organization_id ?? undefined,
      name: row.name,
      areaHa: row.area_ha ?? 0,
      crop: row.crop ?? "Unbekannt",
      tenure: row.ownership_type === "lease" ? "Pacht" : "Eigentum",
      center: { lat: row.center_lat ?? row.access_lat ?? 0, lng: row.center_lng ?? row.access_lng ?? 0 },
      accessPoint: { lat: row.access_lat ?? row.center_lat ?? 0, lng: row.access_lng ?? row.center_lng ?? 0, label: "Zufahrtspunkt" },
      accessDescription: row.access_description ?? "",
      boundary,
      hazards,
      attachments,
      restrictedZones: parsedNotes.restrictedZones,
      history: [],
      releasedContractorIds: parsedNotes.releasedContractorIds,
      archivedAt: row.archived_at ?? undefined,
    };
  });
}

function mapOrganizations(organizationRows: OrganizationRow[]): Organization[] {
  return organizationRows.map((row) => {
    const parsedAddress = parseOrganizationAddress(row.address);
    const contacts = Array.isArray(row.contacts)
      ? row.contacts
      : typeof row.contacts === "string"
        ? (() => {
            try {
              const parsed = JSON.parse(row.contacts) as Organization["contacts"];
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          })()
        : parsedAddress.meta?.contacts ?? [];
    return {
      id: row.id,
      name: row.name,
      kind: row.organization_type,
      organizationNumber: row.organization_number ?? parsedAddress.meta?.organizationNumber ?? undefined,
      address: parsedAddress.cleanAddress,
      phone: row.phone ?? parsedAddress.meta?.phone ?? undefined,
      mobile: row.mobile ?? parsedAddress.meta?.mobile ?? undefined,
      email: row.email ?? parsedAddress.meta?.email ?? undefined,
      website: row.website ?? parsedAddress.meta?.website ?? undefined,
      vatId: row.vat_id ?? parsedAddress.meta?.vatId ?? undefined,
      logoUrl: row.logo_url ?? parsedAddress.meta?.logoUrl ?? undefined,
      defaultLanguage: row.default_language ?? parsedAddress.meta?.defaultLanguage ?? undefined,
      billingDetails: row.billing_details ?? parsedAddress.meta?.billingDetails ?? undefined,
      customerNumber: row.customer_number ?? parsedAddress.meta?.customerNumber ?? undefined,
      supplierCategory: row.supplier_category ?? parsedAddress.meta?.supplierCategory ?? undefined,
      notes: row.notes ?? parsedAddress.meta?.notes ?? undefined,
      contacts,
      archivedAt: row.archived_at ?? undefined,
    };
  });
}

function mapJobs(jobRows: JobRow[], jobFieldRows: JobFieldRow[], taskRows: JobTaskRow[], organizationRecords: Organization[]): Job[] {
  const organizationById = new Map(organizationRecords.map((organization) => [organization.id, organization]));
  return jobRows.map((row, index) => {
    const tasks: Task[] = taskRows
      .filter((task) => task.job_id === row.id)
      .map((task) => ({
        id: task.id,
        name: task.title || task.task_type,
        mode: toWorkMode(task.work_mode),
        allowMultipleWorkers: task.work_mode !== "single",
        maxVehicles: task.max_active_workers ?? 1,
        progressMetric: [toProgressMetric(task.progress_type)],
        targetValue: task.target_quantity ?? task.target_area_ha ?? task.target_trips ?? undefined,
        plannedAmount: task.target_quantity ?? undefined,
        unit: task.quantity_unit ?? undefined,
      }));

    return {
      id: row.id,
      jobNumber: row.job_number && row.job_number.length <= 8 ? row.job_number : `A-${String(index + 1).padStart(3, "0")}`,
      title: row.title,
      customer: organizationById.get(row.farmer_organization_id ?? "")?.name ?? farmer,
      contractor: organizationById.get(row.contractor_organization_id ?? "")?.name ?? contractor,
      farmerOrganizationId: row.farmer_organization_id ?? undefined,
      contractorOrganizationId: row.contractor_organization_id ?? undefined,
      fieldIds: jobFieldRows.filter((field) => field.job_id === row.id).map((field) => field.field_id),
      tasks,
      timeWindow: formatTimeWindow(row.planned_start, row.planned_end),
      notes: row.description ?? row.status ?? "",
      completionStatus: row.completion_status ?? undefined,
      completionStatusChangedAt: row.completion_status_changed_at ?? undefined,
      completionStatusChangedBy: row.completion_status_changed_by ?? undefined,
      invoiceNumber: row.invoice_number ?? undefined,
      invoiceDate: row.invoice_date ?? undefined,
      archivedAt: row.archived_at ?? undefined,
    };
  });
}

function normalizeName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function buildProfileToPersonnelIdMap(profileRows: DriverRow[], personnelRows: PersonnelResourceRow[]) {
  const personnelByName = new Map(personnelRows.filter((person) => !person.archived_at).map((person) => [normalizeName(person.full_name), person.id]));
  return new Map(
    profileRows
      .map((profile) => {
        const personnelId = personnelByName.get(normalizeName(profile.full_name));
        return personnelId ? [profile.id, personnelId] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry)),
  );
}

function buildProfileToPersonnelNameMap(profileRows: DriverRow[], personnelRows: PersonnelResourceRow[]) {
  const personnelByName = new Map(personnelRows.filter((person) => !person.archived_at).map((person) => [normalizeName(person.full_name), person.full_name]));
  return new Map(
    profileRows
      .map((profile) => {
        const name = personnelByName.get(normalizeName(profile.full_name)) ?? profile.full_name;
        return profile.id && name ? [profile.id, name] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry)),
  );
}

function buildPersonnelIdToNameMap(personnelRows: PersonnelResourceRow[]) {
  return new Map(personnelRows.filter((person) => !person.archived_at).map((person) => [person.id, person.full_name]));
}

function mapSubtasks(
  taskRows: JobTaskRow[],
  assignmentRows: AssignmentRow[],
  taskReportRows: TaskReportRow[] = [],
  profileToPersonnelId = new Map<string, string>(),
  profileToPersonnelName = new Map<string, string>(),
  personnelIdToName = new Map<string, string>(),
  vehicleRows: VehicleRow[] = [],
): Subtask[] {
  const vehicleIdByName = new Map(vehicleRows.map((vehicle) => [normalizeName(vehicle.name), vehicle.id]));
  const assignmentDriverId = (assignment: AssignmentRow) => {
    if (assignment.personnel_resource_id) return assignment.personnel_resource_id;
    const profileId = assignment.driver_profile_id;
    return profileId ? profileToPersonnelId.get(profileId) ?? profileId : assignment.id;
  };
  const assignmentDriverName = (assignment: AssignmentRow) => {
    if (assignment.personnel_resource_id) return personnelIdToName.get(assignment.personnel_resource_id);
    return assignment.driver_profile_id ? profileToPersonnelName.get(assignment.driver_profile_id) : undefined;
  };
  return taskRows.map((task) => {
    const assignments = assignmentRows.filter((assignment) => assignment.job_task_id === task.id);
    const driverPhotos: SubtaskPhoto[] = taskReportRows
      .filter((report) => report.job_task_id === task.id && Boolean(report.photo_url))
      .map((report) => ({
        id: report.id,
        name: report.message ?? "Fahrerfoto",
        url: report.photo_url ?? "",
        uploadedAt: report.created_at ?? new Date().toISOString(),
        uploadedByDriverId: report.created_by ?? undefined,
    }));
    const statusEvents: SubtaskStatusEvent[] = taskReportRows
      .filter((report) => report.job_task_id === task.id && !report.photo_url && Boolean(report.message))
      .map((report) => ({
        id: report.id,
        message: report.message ?? "",
        createdAt: report.created_at ?? new Date().toISOString(),
      }));
    const activeAssignments = assignments.filter((assignment) => ["reserved", "active", "paused"].includes(assignment.status ?? ""));
    const completed = task.status === "completed" ? assignments.find((assignment) => assignment.status === "completed") : undefined;
    const performedAssignments = assignments.filter((assignment) => (
      assignment.status === "completed"
      || Boolean(assignment.completed_at)
      || Boolean(assignment.completed_area_ha)
      || Boolean(assignment.completed_quantity)
      || Boolean(assignment.completed_trips)
    ));
    const reportDriverNames = taskReportRows
      .filter((report) => report.job_task_id === task.id && report.created_by)
      .map((report) => profileToPersonnelName.get(report.created_by ?? "") ?? personnelIdToName.get(report.created_by ?? ""))
      .filter((name): name is string => Boolean(name));
    const feedbackAssignment = completed
      ?? activeAssignments.find((assignment) => assignment.completed_at || assignment.completed_area_ha || assignment.completed_quantity || assignment.completed_trips || assignment.notes)
      ?? assignments.find((assignment) => assignment.started_at && assignment.completed_at)
      ?? assignments.find((assignment) => assignment.notes);
    const activeVehicleIds = activeAssignments
      .map((assignment) => vehicleIdByName.get(normalizeName(assignment.vehicle_name)))
      .filter((id): id is string => Boolean(id));
    const activeAssignmentRows = activeAssignments.map((assignment) => ({
      id: assignment.id,
      driverId: assignmentDriverId(assignment),
      vehicleId: vehicleIdByName.get(normalizeName(assignment.vehicle_name)) ?? undefined,
    }));
    return {
      id: task.id,
      jobId: task.job_id,
      fieldId: task.field_id ?? "",
      taskId: task.id,
      status: toStatus(task.status ?? activeAssignments[0]?.status ?? completed?.status ?? null),
      progress: task.status === "completed" ? 100 : task.status === "partial" ? 60 : activeAssignments.length > 0 ? 25 : 0,
      activeDriverIds: activeAssignments.map(assignmentDriverId),
      activeAssignments: activeAssignmentRows,
      activeDriverNames: Array.from(new Set(activeAssignments
        .map(assignmentDriverName)
        .filter((name): name is string => Boolean(name)))),
      performedDriverIds: Array.from(new Set(performedAssignments.map(assignmentDriverId).filter(Boolean))),
      performedDriverNames: Array.from(new Set([
        ...performedAssignments.map(assignmentDriverName).filter((name): name is string => Boolean(name)),
        ...reportDriverNames,
      ])),
      activeVehicleIds: Array.from(new Set(activeVehicleIds)),
      performedVehicleNames: Array.from(new Set(performedAssignments.map((assignment) => assignment.vehicle_name).filter((name): name is string => Boolean(name)))),
      workedMinutes: feedbackAssignment?.started_at && feedbackAssignment.completed_at
        ? Math.max(1, Math.round((new Date(feedbackAssignment.completed_at).getTime() - new Date(feedbackAssignment.started_at).getTime()) / 60000))
        : undefined,
      workStartedAt: (activeAssignments[0] ?? feedbackAssignment)?.started_at ?? undefined,
      workEndedAt: feedbackAssignment?.completed_at ?? undefined,
      plannedCrews: task.planned_columns ?? task.max_active_workers ?? undefined,
      targetValue: task.target_quantity ?? task.target_area_ha ?? task.target_trips ?? undefined,
      targetUnit: task.quantity_unit ?? (task.progress_type === "area" ? "ha" : task.progress_type === "trips" ? "Fuhren" : undefined),
      doneHa: feedbackAssignment?.completed_area_ha ?? undefined,
      doneAmount: feedbackAssignment?.completed_quantity ?? undefined,
      trips: feedbackAssignment?.completed_trips ?? undefined,
      note: feedbackAssignment?.notes ?? undefined,
      driverNote: feedbackAssignment?.notes ?? undefined,
      driverPhotoName: driverPhotos.at(-1)?.name,
      driverPhotos,
      statusEvents,
      completedAt: completed?.completed_at ?? completed?.updated_at ?? undefined,
      updatedAt: task.updated_at ?? feedbackAssignment?.updated_at ?? taskReportRows.filter((report) => report.job_task_id === task.id).at(-1)?.created_at ?? undefined,
      statusChangedAt: completed?.updated_at ?? activeAssignments.at(-1)?.updated_at ?? undefined,
    };
  });
}

function mapDrivers(driverRows: DriverRow[]): Driver[] {
  return driverRows
    .filter((driver) => driver.role === "driver" || driver.role === "farmer_employee" || driver.role === "contractor_admin" || driver.role === "advisor")
    .map((driver) => ({
      id: driver.id,
      profileId: driver.id,
      organizationId: driver.organization_id ?? undefined,
      name: driver.full_name ?? "Fahrer",
      email: driver.email ?? "",
      vehicle: driver.vehicle_name ?? "Fahrzeug",
      jobVisibility: driver.job_visibility ?? "assigned_only",
      mobile: driver.mobile ?? "",
      maxDailyHours: driver.max_daily_hours ?? 8,
      annualVacationDays: driver.annual_vacation_days ?? 30,
      vacationUsedDays: driver.vacation_used_days ?? 0,
      licenseClasses: Array.isArray(driver.license_classes)
        ? driver.license_classes
        : typeof driver.license_classes === "string"
          ? driver.license_classes.split(",").map((item) => item.trim()).filter(Boolean)
          : [],
      employeeType: personnelAccessFromOperationType(driver.operation_type).employeeType ?? (driver.role === "driver" ? "field" : "administration"),
      appRole: personnelAccessFromOperationType(driver.operation_type).role ?? driver.role ?? "driver",
      allowedViews: personnelAccessFromOperationType(driver.operation_type).allowedViews,
      appPermissions: personnelAccessFromOperationType(driver.operation_type).permissions,
      resourceType: driver.resource_type ?? "Personal",
      operationType: stripMarkerBlock(driver.operation_type, personnelAccessMarker),
    }));
}

function mapPersonnelResources(personnelRows: PersonnelResourceRow[], profileRows: DriverRow[] = []): Driver[] {
  const personnelProfileRoles = new Set(["driver", "farmer_employee", "contractor_admin", "advisor"]);
  const profilesByName = new Map(profileRows.filter((profile) => personnelProfileRoles.has(profile.role ?? "")).map((profile) => [normalizeName(profile.full_name), profile]));
  const profilesById = new Map(profileRows.filter((profile) => personnelProfileRoles.has(profile.role ?? "")).map((profile) => [profile.id, profile]));
  const personnelDrivers = personnelRows.map((person) => {
    const profile = (person.profile_id ? profilesById.get(person.profile_id) : undefined) ?? profilesByName.get(normalizeName(person.full_name));
    const access = personnelAccessFromOperationType(person.operation_type);
    const appRole = access.role ?? profile?.role ?? "driver";
    return {
    id: person.id,
    profileId: person.profile_id ?? profile?.id,
    organizationId: person.organization_id ?? profile?.organization_id ?? undefined,
    name: person.full_name,
    email: person.email ?? profile?.email ?? "",
    accessPassword: person.access_password ?? "",
    vehicle: person.vehicle_name ?? profile?.vehicle_name ?? "",
    jobVisibility: person.job_visibility ?? profile?.job_visibility ?? "assigned_only",
    mobile: person.mobile ?? "",
    maxDailyHours: person.max_daily_hours ?? 8,
    annualVacationDays: person.annual_vacation_days ?? 30,
    vacationUsedDays: person.vacation_used_days ?? 0,
    licenseClasses: Array.isArray(person.license_classes)
      ? person.license_classes
      : typeof person.license_classes === "string"
        ? person.license_classes.split(",").map((item) => item.trim()).filter(Boolean)
        : [],
    employeeType: access.employeeType ?? (appRole === "driver" ? "field" : "administration"),
    appRole,
    allowedViews: access.allowedViews,
    appPermissions: access.permissions,
    resourceType: person.resource_type ?? "Personal",
    operationType: stripMarkerBlock(person.operation_type, personnelAccessMarker),
    archivedAt: person.archived_at ?? undefined,
    };
  });
  const personnelNames = new Set(personnelRows.filter((person) => !person.archived_at).map((person) => normalizeName(person.full_name)));
  const missingProfileDrivers = mapDrivers(profileRows).filter((driver) => !personnelNames.has(normalizeName(driver.name)));
  return [...personnelDrivers, ...missingProfileDrivers];
}

function mapVehicles(vehicleRows: VehicleRow[]): Vehicle[] {
  return vehicleRows.map((vehicle) => ({
    id: vehicle.id,
    organizationId: vehicle.organization_id ?? undefined,
    name: vehicle.name,
    type: vehicle.vehicle_type ?? "Fahrzeug",
    licensePlate: vehicle.license_plate ?? "",
    manufacturer: vehicle.manufacturer ?? "",
    model: vehicle.model ?? "",
    constructionYear: vehicle.construction_year ?? undefined,
    operatingHours: vehicle.operating_hours ?? undefined,
    defaultDriverId: vehicle.default_driver_id ?? undefined,
    resourceType: vehicle.resource_type ?? vehicle.vehicle_type ?? "Fahrzeug",
    operationType: vehicle.operation_type ?? "",
    status: vehicle.status ?? "frei",
    archivedAt: vehicle.archived_at ?? undefined,
  }));
}

function mapImplements(implementRows: ImplementRow[]): Implement[] {
  return implementRows.map((implement) => ({
    id: implement.id,
    organizationId: implement.organization_id ?? undefined,
    name: implement.name,
    type: implement.implement_type ?? "Anbaugerät",
    manufacturer: implement.manufacturer ?? "",
    workingWidth: implement.working_width ?? undefined,
    resourceType: implement.resource_type ?? implement.implement_type ?? "Anbaugerät",
    operationType: implement.operation_type ?? "",
    status: implement.status ?? "frei",
    archivedAt: implement.archived_at ?? undefined,
  }));
}

function mapTaskTemplates(taskTemplateRows: TaskTemplateRow[]): TaskTemplate[] {
  return taskTemplateRows.map((taskTemplate) => ({
    id: taskTemplate.id,
    organizationId: taskTemplate.organization_id ?? undefined,
    isSystemTemplate: taskTemplate.is_system_template ?? !taskTemplate.organization_id,
    templateOwnerType: taskTemplate.template_owner_type ?? (taskTemplate.organization_id ? "organization" : "system"),
    sourceTemplateId: taskTemplate.source_template_id ?? undefined,
    createdByAdmin: taskTemplate.created_by_admin ?? undefined,
    name: taskTemplate.name,
    workSteps: Array.isArray(taskTemplate.work_steps)
      ? taskTemplate.work_steps
      : typeof taskTemplate.work_steps === "string"
        ? taskTemplate.work_steps.split(",").map((item) => item.trim()).filter(Boolean)
        : [],
    timePerHa: taskTemplate.time_per_ha ?? 0,
    mode: toWorkMode(taskTemplate.work_mode ?? "single"),
    maxVehicles: taskTemplate.max_vehicles ?? 1,
    progressMetric: toProgressMetric(taskTemplate.progress_type ?? "area"),
    requiredDrivers: taskTemplate.required_drivers ?? undefined,
    requiredVehicles: taskTemplate.required_vehicles ?? undefined,
    requiredImplements: taskTemplate.required_implements ?? undefined,
    resourceHint: taskTemplate.resource_hint ?? "",
    unit: taskTemplate.quantity_unit ?? undefined,
    archivedAt: taskTemplate.archived_at ?? undefined,
  }));
}

export function useFarmManagerData(): DataState {
  const cachedData = isSupabaseConfigured ? readOfflineDataCache() : null;
  const [state, setState] = useState<Omit<DataState, "refreshData">>({
    fields: cachedData?.fields ?? (isSupabaseConfigured ? [] : mockFields),
    drivers: cachedData?.drivers ?? (isSupabaseConfigured ? [] : drivers),
    vehicles: cachedData?.vehicles ?? (isSupabaseConfigured ? [] : mockVehicles),
    implementsList: cachedData?.implementsList ?? (isSupabaseConfigured ? [] : mockImplements),
    organizations: cachedData?.organizations ?? (isSupabaseConfigured ? [] : mockOrganizations),
    taskTemplates: cachedData?.taskTemplates ?? (isSupabaseConfigured ? [] : mockTaskTemplates),
    jobs: cachedData?.jobs ?? (isSupabaseConfigured ? [] : mockJobs),
    subtasks: cachedData?.subtasks ?? (isSupabaseConfigured ? [] : mockSubtasks),
    isDemoMode: cachedData?.isDemoMode ?? !isSupabaseConfigured,
    isLoading: false,
    error: cachedData && isSupabaseConfigured ? "Offline-Daten geladen" : undefined,
  });

  const refreshData = useCallback(async (options: RefreshDataOptions = {}) => {
    const silent = options.silent ?? false;
    if (!isSupabaseConfigured || !supabase) {
      if (!silent) setState((current) => ({ ...current, isDemoMode: true, isLoading: false, error: undefined }));
      return;
    }
    if (!silent) setState((current) => ({ ...current, isLoading: true, isDemoMode: false, error: undefined }));

    const [
      fieldsResult,
      driversResult,
      personnelResourcesResult,
      vehiclesResult,
      implementsResult,
      organizationsResult,
      boundariesResult,
      hazardsResult,
      documentsResult,
      jobsResult,
      jobFieldsResult,
      tasksResult,
      assignmentsResult,
      taskReportsResult,
      taskTemplatesResult,
    ] = await Promise.all([
      supabase.from("fields").select("*").order("name"),
      supabase.from("profiles").select("*").in("role", ["driver", "farmer_employee", "contractor_admin", "advisor"]).order("full_name"),
      supabase.from("personnel_resources").select("*").order("full_name"),
      supabase.from("vehicles").select("*").order("name"),
      supabase.from("implements").select("*").order("name"),
      supabase.from("organizations").select("*").order("name"),
      supabase.from("field_boundaries").select("*"),
      supabase.from("field_hazards").select("*"),
      supabase.from("documents").select("*"),
      supabase.from("jobs").select("*").order("created_at", { ascending: false }),
      supabase.from("job_fields").select("*"),
      supabase.from("job_tasks").select("*"),
      supabase.from("task_assignments").select("*"),
      supabase.from("task_reports").select("*"),
      supabase.from("task_templates").select("*").order("name"),
    ]);

    const firstError = [
      fieldsResult.error,
      driversResult.error,
      organizationsResult.error,
      boundariesResult.error,
      hazardsResult.error,
      documentsResult.error,
      jobsResult.error,
      jobFieldsResult.error,
      tasksResult.error,
      assignmentsResult.error,
      taskReportsResult.error,
    ].find(Boolean);

    if (firstError) {
      if (silent) {
        setState((current) => ({ ...current, isLoading: false }));
        return;
      }
      const fallbackCache = readOfflineDataCache();
      if (fallbackCache) {
        setState({
          ...fallbackCache,
          isLoading: false,
          error: firstError.message,
        });
        return;
      }
      setState({
        fields: isSupabaseConfigured ? [] : mockFields,
        drivers: isSupabaseConfigured ? [] : drivers,
        vehicles: isSupabaseConfigured ? [] : mockVehicles,
        implementsList: isSupabaseConfigured ? [] : mockImplements,
        organizations: isSupabaseConfigured ? [] : mockOrganizations,
        taskTemplates: isSupabaseConfigured ? [] : mockTaskTemplates,
        jobs: isSupabaseConfigured ? [] : mockJobs,
        subtasks: isSupabaseConfigured ? [] : mockSubtasks,
        isDemoMode: !isSupabaseConfigured,
        isLoading: false,
        error: firstError.message,
      });
      return;
    }

    const fieldRows = (fieldsResult.data ?? []) as FieldRow[];
    const taskRows = (tasksResult.data ?? []) as JobTaskRow[];
    const organizationRows = (organizationsResult.data ?? []) as OrganizationRow[];
    const organizationRecords = organizationRows.length > 0 ? mapOrganizations(organizationRows) : mockOrganizations;
    const profileRows = (driversResult.data ?? []) as DriverRow[];
    const personnelRows = (personnelResourcesResult.data ?? []) as PersonnelResourceRow[];
    const profileToPersonnelId = buildProfileToPersonnelIdMap(profileRows, personnelRows);
    const profileToPersonnelName = buildProfileToPersonnelNameMap(profileRows, personnelRows);
    const personnelIdToName = buildPersonnelIdToNameMap(personnelRows);
    const nextState: CachedDataState = {
      fields: mapFields(fieldRows, (boundariesResult.data ?? []) as BoundaryRow[], (hazardsResult.data ?? []) as HazardRow[], (documentsResult.data ?? []) as DocumentRow[]),
      drivers: personnelResourcesResult.error || personnelRows.length === 0
        ? mapDrivers(profileRows)
        : mapPersonnelResources(personnelRows, profileRows),
      vehicles: vehiclesResult.error ? [] : mapVehicles((vehiclesResult.data ?? []) as VehicleRow[]),
      implementsList: implementsResult.error ? [] : mapImplements((implementsResult.data ?? []) as ImplementRow[]),
      organizations: organizationRecords,
      taskTemplates: taskTemplatesResult.error ? mockTaskTemplates : mapTaskTemplates((taskTemplatesResult.data ?? []) as TaskTemplateRow[]),
      jobs: mapJobs((jobsResult.data ?? []) as JobRow[], (jobFieldsResult.data ?? []) as JobFieldRow[], taskRows, organizationRecords),
      subtasks: mapSubtasks(taskRows, (assignmentsResult.data ?? []) as AssignmentRow[], (taskReportsResult.data ?? []) as TaskReportRow[], profileToPersonnelId, profileToPersonnelName, personnelIdToName, (vehiclesResult.data ?? []) as VehicleRow[]),
      isDemoMode: false,
    };
    writeOfflineDataCache(nextState);
    setState({
      ...nextState,
      isLoading: false,
    });
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refreshData({ silent: true });
    }
    const interval = window.setInterval(() => {
      void refreshData({ silent: true });
    }, 15000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshData]);

  return useMemo(() => ({ ...state, refreshData }), [refreshData, state]);
}
