import { Archive, Building2, CalendarDays, CheckCircle, Eye, EyeOff, Mail, MessageSquare, Plus, RadioTower, RotateCcw, Save, Settings, Trash2, Truck, UserMinus, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAppData } from "../data/DataContext";
import type { Driver, DriverLocation, FieldMapPattern, Implement, Job, Organization, ProgressMetric, Subtask, Task, TaskTemplate, Vehicle, WorkMode } from "../types";
import { DriverChips, FieldName, ProgressBar, StatusBadge, getTask } from "./shared";
import { LiveLocationMap } from "./LiveLocationMap";

type ContractorSection = "overview" | "masterData" | "organizations" | "taskTemplates" | "jobTypes" | "programSettings";
type MasterResourceGroup = "personnel" | "vehicles" | "implements";
type DragResourceKind = "driver" | "vehicle" | "implement";
type DragResourcePayload = {
  kind: DragResourceKind;
  id: string;
  sourceSubtaskId?: string;
  sourceSubtaskIds?: string[];
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

const resourceHistoryStorageKey = "schlaglink.resourceHistory";
const equipmentLogStorageKey = "schlaglink.driverEquipmentLog";

function readJsonArray<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T[] : [];
  } catch {
    return [];
  }
}

const calendarColumnCount = 5;
const taskModes: WorkMode[] = ["Einzelmodus", "Teammodus", "Rollenmodus", "Flächenteilung"];
const taskMetrics: ProgressMetric[] = ["Fläche", "Menge", "Fuhren", "Zeit"];
const mapPatterns: FieldMapPattern[] = ["none", "whiteDots"];

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
  variant = "dispatch",
  masterDataFocus,
  onOpenMasterData,
  onOpenJob,
}: {
  subtasks: Subtask[];
  jobs: Job[];
  driverLocations: DriverLocation[];
  onRefreshDriverLocations?: () => void;
  onUpdateSubtask: (id: string, patch: Partial<Subtask>) => void;
  variant?: "dispatch" | "masterData";
  masterDataFocus?: { group: MasterResourceGroup; id: string } | null;
  onOpenMasterData?: (focus: { group: MasterResourceGroup; id: string }) => void;
  onOpenJob?: (jobId: string) => void;
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
    permissions,
    authProfile,
    currentRole,
    updateDriver,
    updateImplement,
    updateOrganization,
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
  const [activeSection, setActiveSection] = useState<ContractorSection>(() => variant === "masterData" ? "masterData" : "overview");
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
    const stored = window.localStorage.getItem("schlaglink.standardVehiclePlanningMode") as StandardVehiclePlanningMode | null;
    return stored ?? "ask";
  });
  const [mapProviderPreference, setMapProviderPreference] = useState<MapProviderPreference>(() => {
    const stored = window.localStorage.getItem("schlaglink.mapProviderPreference");
    const allowedProviders: MapProviderPreference[] = ["osm", "google", "hitta_se", "lantmateriet"];
    return allowedProviders.includes(stored as MapProviderPreference) ? stored as MapProviderPreference : "osm";
  });
  const [dispatchGroupingLevel, setDispatchGroupingLevel] = useState<DispatchGroupingLevel>(() => {
    const stored = window.localStorage.getItem("schlaglink.dispatchGroupingLevel") as DispatchGroupingLevel | null;
    return stored ?? "task";
  });
  const [calendarStartOffset, setCalendarStartOffset] = useState(0);
  const [dispatchCalendarMode, setDispatchCalendarMode] = useState<DispatchCalendarMode>("single");
  const [selectedDispatchCustomerIds, setSelectedDispatchCustomerIds] = useState<string[]>([]);
  const [standardVehicleChoice, setStandardVehicleChoice] = useState<{ driverId: string; subtaskId: string } | null>(null);
  const [resourceHistoryVersion, setResourceHistoryVersion] = useState(0);
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
  const resourceOrganizationId = currentRole === "contractor_admin" || currentRole === "farmer_admin" ? authProfile?.organizationId : undefined;
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
  const canManageOrganizations = currentRole === "contractor_admin" || currentRole === "support_admin";
  const canManageResources = permissions.canEditDrivers;
  const canManageOwnTemplates = currentRole === "farmer_admin" || currentRole === "contractor_admin" || currentRole === "support_admin";
  const selectedJobType = visibleJobTypes.find((jobType) => jobType.id === selectedJobTypeId) ?? visibleJobTypes[0];
  const selectedTaskTemplate = visibleTaskTemplates.find((taskTemplate) => taskTemplate.id === selectedTaskTemplateId) ?? visibleTaskTemplates[0];
  const isSystemTaskTemplateSelected = Boolean(selectedTaskTemplate && (selectedTaskTemplate.isSystemTemplate || selectedTaskTemplate.templateOwnerType === "system" || !selectedTaskTemplate.organizationId));
  const isSystemJobTypeSelected = Boolean(selectedJobType && (selectedJobType.isSystemTemplate || selectedJobType.templateOwnerType === "system" || !selectedJobType.organizationId));
  const canEditSelectedTaskTemplate = canManageOwnTemplates && (currentRole === "support_admin" || !isSystemTaskTemplateSelected);
  const canEditSelectedJobType = canManageOwnTemplates && (currentRole === "support_admin" || !isSystemJobTypeSelected);
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
    resourceType: "",
    operationType: "",
  });
  const [vehicleForm, setVehicleForm] = useState({
    name: "",
    type: "",
    licensePlate: "",
    resourceType: "",
    operationType: "",
    status: "frei" as Vehicle["status"],
  });
  const [implementForm, setImplementForm] = useState({
    name: "",
    type: "",
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
    mapStyleLabel: "",
    mapStyleColor: "#7fcf6b",
    mapStylePattern: "none" as FieldMapPattern,
  });
  const accessibleOrganizations = useMemo(() => organizations.filter((organization) => {
    if (currentRole === "farmer_admin" && authProfile?.organizationId) {
      return organization.id === authProfile.organizationId || organization.kind === "contractor";
    }
    if (currentRole === "contractor_admin" && authProfile?.organizationId) {
      return organization.id === authProfile.organizationId || organization.kind === "farmer";
    }
    return true;
  }), [authProfile?.organizationId, currentRole, organizations]);
  const activeOrganizations = useMemo(() => accessibleOrganizations.filter((organization) => !organization.archivedAt), [accessibleOrganizations]);
  const archivedOrganizations = useMemo(() => accessibleOrganizations.filter((organization) => Boolean(organization.archivedAt)), [accessibleOrganizations]);
  const visibleOrganizations = showArchivedOrganizations ? archivedOrganizations : activeOrganizations;
  const farmerOrganizations = useMemo(() => visibleOrganizations.filter((organization) => organization.kind === "farmer"), [visibleOrganizations]);
  const contractorOrganizations = useMemo(() => visibleOrganizations.filter((organization) => organization.kind === "contractor"), [visibleOrganizations]);
  const activeFarmerOrganizations = useMemo(() => activeOrganizations.filter((organization) => organization.kind === "farmer"), [activeOrganizations]);
  const activeContractorOrganizations = useMemo(() => activeOrganizations.filter((organization) => organization.kind === "contractor"), [activeOrganizations]);
  const defaultResourceOrganizationId = resourceOrganizationId ?? authProfile?.organizationId ?? activeContractorOrganizations[0]?.id ?? activeFarmerOrganizations[0]?.id ?? "";
  const isResourceOrganizationLocked = currentRole === "contractor_admin" || currentRole === "farmer_admin";
  const fixedResourceOrganization = activeOrganizations.find((organization) => organization.id === driverForm.organizationId)
    ?? activeOrganizations.find((organization) => organization.id === defaultResourceOrganizationId);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(activeOrganizations[0]?.id ?? "");
  const selectedOrganization = accessibleOrganizations.find((organization) => organization.id === selectedOrganizationId) ?? visibleOrganizations[0];
  const [organizationForm, setOrganizationForm] = useState({
    name: "",
    kind: "farmer" as Organization["kind"],
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
    notes: "",
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
      resourceType: driver.resourceType ?? t("masterData.personnel"),
      operationType: driver.operationType ?? "",
    };
  }

  function vehicleToForm(vehicle: Vehicle) {
    return {
      name: vehicle.name,
      type: vehicle.type,
      licensePlate: vehicle.licensePlate ?? "",
      resourceType: vehicle.resourceType ?? vehicle.type,
      operationType: vehicle.operationType ?? "",
      status: vehicle.status,
    };
  }

  function implementToForm(implement: Implement) {
    return {
      name: implement.name,
      type: implement.type,
      resourceType: implement.resourceType ?? implement.type,
      operationType: implement.operationType ?? "",
      status: implement.status,
    };
  }

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
      notes: selectedOrganization.notes ?? "",
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
    window.localStorage.setItem("schlaglink.standardVehiclePlanningMode", standardVehicleMode);
  }, [standardVehicleMode]);

  useEffect(() => {
    window.localStorage.setItem("schlaglink.mapProviderPreference", mapProviderPreference);
  }, [mapProviderPreference]);

  useEffect(() => {
    window.localStorage.setItem("schlaglink.dispatchGroupingLevel", dispatchGroupingLevel);
  }, [dispatchGroupingLevel]);

  useEffect(() => {
    if (variant === "dispatch" && activeSection !== "overview" && !isResourceModalOpen) setActiveSection("overview");
    if (variant === "masterData" && activeSection === "overview") setActiveSection("masterData");
  }, [activeSection, isResourceModalOpen, variant]);

  useEffect(() => {
    if (!masterDataFocus) return;
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
      id: crypto.randomUUID(),
      recordedAt: entry.recordedAt ?? new Date().toISOString(),
      actor: entry.actor ?? authProfile?.fullName ?? t("app.user"),
      ...entry,
    };
    const existing = readJsonArray<ResourceHistoryEntry>(resourceHistoryStorageKey);
    window.localStorage.setItem(resourceHistoryStorageKey, JSON.stringify([nextEntry, ...existing].slice(0, 500)));
    setResourceHistoryVersion((current) => current + 1);
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
        ))
        : activeMasterGroup === "vehicles"
          ? (subtask.activeVehicleIds ?? []).includes(resourceId)
          : (subtask.activeImplementIds ?? []).includes(resourceId);
      if (!matches) return [];
      const activityName = task?.name ?? job?.title ?? t("terms.subtask");
      return [{
        id: `${subtask.id}-${resourceId}`,
        resourceGroup: activeMasterGroup,
        resourceId,
        event: "assigned",
        recordedAt: subtask.completedAt ?? subtask.statusChangedAt ?? subtask.updatedAt ?? new Date().toISOString(),
        actor: (subtask.activeDriverNames ?? []).join(", "),
        title: activityName,
        details: [activityName, field?.name, job?.customer, subtask.driverNote ?? subtask.note].filter(Boolean).join(" · "),
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
    setCreatingResourceGroup("personnel");
    setShowDriverPassword(false);
    setDriverForm({
      name: t("masterData.newDriverName"),
      organizationId: defaultResourceOrganizationId,
      vehicle: "",
      jobVisibility: "assigned_only",
      email: "",
      accessPassword: generateDriverPassword(),
      mobile: "",
      licenseClasses: "",
      maxDailyHours: 8,
      resourceType: t("masterData.personnel"),
      operationType: "",
    });
    setIsResourceModalOpen(true);
  }

  function openDriverEditor(driver: Driver) {
    setCreatingResourceGroup(null);
    setShowDriverPassword(false);
    setSelectedDriverId(driver.id);
    setDriverForm(driverToForm(driver));
    setIsResourceModalOpen(true);
  }

  function saveDriver() {
    const lockedOrganizationId = creatingResourceGroup === "personnel"
      ? defaultResourceOrganizationId
      : driverForm.organizationId || selectedDriver?.organizationId || defaultResourceOrganizationId;
    const payload = {
      ...driverForm,
      organizationId: isResourceOrganizationLocked ? lockedOrganizationId : driverForm.organizationId,
      licenseClasses: driverForm.licenseClasses.split(",").map((item) => item.trim()).filter(Boolean),
    };
    if (creatingResourceGroup === "personnel") {
      const id = crypto.randomUUID();
      addDriver({ id, ...payload });
      appendResourceHistory({ resourceGroup: "personnel", resourceId: id, event: "created", title: payload.name, details: payload.vehicle });
      setSelectedDriverId(id);
    } else if (selectedDriver) {
      updateDriver(selectedDriver.id, payload);
      appendResourceHistory({ resourceGroup: "personnel", resourceId: selectedDriver.id, event: "updated", title: payload.name, details: payload.vehicle });
    }
    closeResourceModal();
  }

  function generateDriverPassword() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const suffix = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    return `SL-${suffix}`;
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

  function createVehicle() {
    setCreatingResourceGroup("vehicles");
    setVehicleForm({
      name: t("masterData.newVehicleName"),
      type: t("terms.vehicle"),
      licensePlate: "",
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
    if (creatingResourceGroup === "vehicles") {
      const id = crypto.randomUUID();
      addVehicle({ id, organizationId: defaultResourceOrganizationId, ...vehicleForm });
      appendResourceHistory({ resourceGroup: "vehicles", resourceId: id, event: "created", title: vehicleForm.name, details: [vehicleForm.licensePlate, vehicleForm.status].filter(Boolean).join(" · ") });
      setSelectedVehicleId(id);
    } else if (selectedVehicle) {
      updateVehicle(selectedVehicle.id, vehicleForm);
      appendResourceHistory({ resourceGroup: "vehicles", resourceId: selectedVehicle.id, event: "updated", title: vehicleForm.name, details: [vehicleForm.licensePlate, vehicleForm.status].filter(Boolean).join(" · ") });
    }
    closeResourceModal();
  }

  function createImplement() {
    setCreatingResourceGroup("implements");
    setImplementForm({
      name: t("masterData.newImplementName"),
      type: t("masterData.implementType"),
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
    if (creatingResourceGroup === "implements") {
      const id = crypto.randomUUID();
      addImplement({ id, organizationId: defaultResourceOrganizationId, ...implementForm });
      appendResourceHistory({ resourceGroup: "implements", resourceId: id, event: "created", title: implementForm.name, details: [implementForm.type, implementForm.status].filter(Boolean).join(" · ") });
      setSelectedImplementId(id);
    } else if (selectedImplement) {
      updateImplement(selectedImplement.id, implementForm);
      appendResourceHistory({ resourceGroup: "implements", resourceId: selectedImplement.id, event: "updated", title: implementForm.name, details: [implementForm.type, implementForm.status].filter(Boolean).join(" · ") });
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
      mapStyle: taskTemplate.mapStyle,
      timePerHa: taskTemplate.timePerHa,
      estimatedHours: selectedJobType?.defaultEstimatedHours,
      unit: taskTemplate.progressMetric === "Fläche" ? "ha" : undefined,
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
    const id = crypto.randomUUID();
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
      requiredDrivers: 1,
      requiredVehicles: 1,
      requiredImplements: 0,
      resourceHint: "",
      mapStyle: undefined,
    });
    setSelectedTaskTemplateId(id);
    setIsTaskTemplateModalOpen(true);
  }

  function saveTaskTemplate() {
    if (!selectedTaskTemplate) return;
    updateTaskTemplate(selectedTaskTemplate.id, {
      name: taskTemplateForm.name,
      timePerHa: taskTemplateForm.timePerHa,
      mode: taskTemplateForm.mode,
      maxVehicles: taskTemplateForm.maxVehicles,
      progressMetric: taskTemplateForm.progressMetric,
      requiredDrivers: taskTemplateForm.requiredDrivers,
      requiredVehicles: taskTemplateForm.requiredVehicles,
      requiredImplements: taskTemplateForm.requiredImplements,
      resourceHint: taskTemplateForm.resourceHint,
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
    setOrganizationForm({
      name: "",
      kind: "farmer",
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
      notes: "",
      contacts: [],
    });
    setIsOrganizationModalOpen(true);
  }

  function openOrganizationEditor(organization: Organization) {
    setCreatingOrganization(false);
    setSelectedOrganizationId(organization.id);
    setOrganizationForm({
      name: organization.name,
      kind: organization.kind,
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
      notes: organization.notes ?? "",
      contacts: organization.contacts ?? [],
    });
    setIsOrganizationModalOpen(true);
  }

  function addOrganizationContact() {
    setOrganizationForm((current) => ({
      ...current,
      contacts: [
        ...current.contacts,
        { id: crypto.randomUUID(), name: "", role: "", phone: "", mobile: "", email: "", sms: "", notes: "" },
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

  function saveOrganization() {
    if (!organizationForm.name.trim()) return;
    if (creatingOrganization) {
      const id = crypto.randomUUID();
      addOrganization({ id, ...organizationForm });
      setSelectedOrganizationId(id);
    } else if (selectedOrganization) {
      updateOrganization(selectedOrganization.id, organizationForm);
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
    const resource = kind === "driver"
      ? allDrivers.find((item) => item.id === id || item.profileId === id)
      : kind === "vehicle"
        ? allVehicles.find((item) => item.id === id)
        : allImplementsList.find((item) => item.id === id);
    if (!canControlResource(resource)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("application/x-schlaglink-resource", JSON.stringify({ kind, id, sourceSubtaskId, sourceSubtaskIds }));
    event.dataTransfer.effectAllowed = "move";
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
    const raw = event.dataTransfer.getData("application/x-schlaglink-resource");
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
    const raw = event.dataTransfer.getData("application/x-schlaglink-resource");
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
    const raw = event.dataTransfer.getData("application/x-schlaglink-resource");
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

  function renderOrganizationCard(organization: Organization) {
    const resources = getOrganizationResources(organization.id);
    return (
      <article className="resource-card organization-card" key={organization.id}>
        <div className="organization-card-main">
          <div>
            <span className="resource-kind">
              {organization.kind === "farmer" ? t("masterData.farmerOrganization") : t("masterData.contractorOrganization")}
            </span>
            <strong>{organization.name}</strong>
            <span>{formatOrganizationAddress(organization) || t("masterData.noAddress")}</span>
            <small>{[organization.phone, organization.mobile, organization.email].filter(Boolean).join(" · ") || t("masterData.noContactData")}</small>
            <small>{t("masterData.contactsCount", { count: organization.contacts?.length ?? 0 })}</small>
          </div>
          <button className="secondary-action" onClick={() => openOrganizationEditor(organization)} type="button">
            {t("masterData.editOrganization")}
          </button>
        </div>
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
      </article>
    );
  }

  return (
    <section className="view-stack">
      {variant === "masterData" && (
        <div className="subpage-tabs" role="tablist" aria-label={t("contractor.sections")}>
          <button className={activeSection === "masterData" ? "active" : ""} onClick={() => setActiveSection("masterData")} type="button">
            {t("contractor.resourceMasterData")}
          </button>
          <button className={activeSection === "organizations" ? "active" : ""} onClick={() => setActiveSection("organizations")} type="button">
            {t("contractor.organizationMasterData")}
          </button>
          <button className={activeSection === "taskTemplates" ? "active" : ""} onClick={() => setActiveSection("taskTemplates")} type="button">
            {t("contractor.taskTemplateMasterData")}
          </button>
          <button className={activeSection === "jobTypes" ? "active" : ""} onClick={() => setActiveSection("jobTypes")} type="button">
            {t("contractor.jobTypeMasterData")}
          </button>
          <button className={activeSection === "programSettings" ? "active" : ""} onClick={() => setActiveSection("programSettings")} type="button">
            {t("contractor.programSettings")}
          </button>
        </div>
      )}

      {activeSection === "overview" && (
        <>
          <div className="panel resource-board">
            <div className="section-heading">
              <h2>{t("contractor.resourceOverview")}</h2>
              <span>{resourceCount} {t("contractor.resources")}</span>
            </div>
            <div className="resource-group-grid">
              {resourceGroups.map((group) => (
                <details className="resource-group" key={group.id}>
                  <summary className="resource-group-heading">
                    <strong>{group.title}</strong>
                    <span>{group.resources.length}</span>
                  </summary>
                  <div className="resource-grid">
                    {group.resources.map((resource) => {
                      const task = resource.subtask ? getTask(resource.subtask, jobs) : undefined;
                      return (
                        <button
                          className="resource-card resource-card-button"
                          key={`${resource.kind}-${resource.id}`}
                          onClick={() => openResourceMasterData(group.id, resource.id)}
                          type="button"
                        >
                          <span className="resource-kind">{resource.kind}</span>
                          <strong>{resource.name}</strong>
                          <span>{resource.detail}</span>
                          <small>{resource.resourceType}{resource.operationType ? ` · ${resource.operationType}` : ""}</small>
                          <span className={resource.subtask ? "pill warning-pill" : "pill success"}>
                            {resource.subtask ? t("contractor.assignedTo", { task: task?.name ?? "", field: "" }) : t("contractor.available")}
                          </span>
                          {resource.subtask && <small><FieldName id={resource.subtask.fieldId} /></small>}
                        </button>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>
          </div>

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
                  <div className="dispatch-day-column" key={day.id}>
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
                            key={subtask.id}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => handleDropResource(event, subtask)}
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
                    <div className="dispatch-day-column" key={day.id}>
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
                            onDrop={(event) => handleDropResourceOnGroup(event, group)}
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

          <div className="split-grid">
            <div className="panel">
              <div className="section-heading">
                <h2>{t("contractor.allCustomerJobs")}</h2>
                <span>{jobs.length} {t("terms.active")}</span>
              </div>
              <div className="dispatch-list compact-customer-jobs">
                {sortOpenBeforeDone(subtasks).map((subtask, sortedIndex, sortedSubtasks) => {
                  const task = getTask(subtask, jobs);
                  const job = jobs.find((item) => item.id === subtask.jobId);
                  const lastDriver = [...subtask.activeDriverIds].reverse().find((driverId) => canControlResource(getDriverByAssignmentId(driverId)));
                  const activeVehicles = getDisplayVehiclesForSubtask(subtask)
                    .map((vehicle) => vehicle.name)
                    .join(", ");
                  const activeImplements = (subtask.activeImplementIds ?? [])
                    .map((id) => allImplementsList.find((implement) => implement.id === id)?.name)
                    .filter(Boolean)
                    .join(", ");
                  const startsDoneGroup = subtask.status === "erledigt" && sortedSubtasks[sortedIndex - 1]?.status !== "erledigt";
                  return (
                    <article className={`dispatch-item compact-customer-job ${subtask.status === "erledigt" ? "completed-item" : ""} ${startsDoneGroup ? "completed-section-start" : ""}`} key={subtask.id}>
                      <div className="compact-customer-main">
                        <div className="compact-job-title-line">
                          <small className="compact-job-id">{job?.jobNumber ?? subtask.jobId}</small>
                          <strong>{task?.name}</strong>
                        </div>
                        <span><FieldName id={subtask.fieldId} /></span>
                        <small>
                          {t("contractor.resourceNeedShort", {
                            crews: subtask.plannedCrews ?? 1,
                            drivers: task?.requiredDrivers ?? 0,
                            vehicles: task?.requiredVehicles ?? task?.maxVehicles ?? 0,
                            implements: task?.requiredImplements ?? 0,
                          })}
                        </small>
                      </div>
                      <div className="compact-customer-status">
                        <StatusBadge status={subtask.status} />
                        <ProgressBar value={subtask.progress} />
                        <small>{subtask.progress}%</small>
                      </div>
                      <div className="compact-customer-resources">
                        {subtask.activeDriverIds.length > 0 ? <span><DriverChips subtask={subtask} /></span> : <small>{t("contractor.noDriverAssigned")}</small>}
                        <small>{activeVehicles || t("contractor.noVehicleAssigned")}</small>
                        <small>{activeImplements || t("contractor.noImplementAssigned")}</small>
                      </div>
                      {permissions.canAssignDrivers && (
                        <div className="dispatch-actions compact-dispatch-actions">
                          <button onClick={() => assignResources(subtask)} type="button">
                            <UserPlus size={17} /> {t("actions.assignResources")}
                          </button>
                          {lastDriver && (
                            <button
                              onClick={() =>
                                onUpdateSubtask(subtask.id, {
                                  activeDriverIds: subtask.activeDriverIds.filter((id) => id !== lastDriver),
                                  activeDriverNames: (subtask.activeDriverNames ?? []).filter((name) => name !== getDriverByAssignmentId(lastDriver)?.name),
                                  status: subtask.activeDriverIds.length <= 1 ? "offen" : subtask.status,
                                })
                              }
                              type="button"
                            >
                              <UserMinus size={17} /> {t("actions.removeDriver")}
                            </button>
                          )}
                          {subtask.activeDriverIds.some((driverId) => canControlResource(getDriverByAssignmentId(driverId))) && (
                            <button onClick={() => releaseDriverLogins(subtask)} type="button">
                              <UserMinus size={17} /> {t("actions.releaseDriverLogins")}
                            </button>
                          )}
                          <button onClick={() => releaseResources(subtask)} type="button"><RotateCcw size={17} /> {t("actions.release")}</button>
                          <button onClick={() => onUpdateSubtask(subtask.id, { status: "erledigt", progress: 100 })} type="button"><CheckCircle size={17} /> {t("actions.close")}</button>
                          <div className="assignment-picker">
                            <input
                              aria-label={t("contractor.plannedCrews")}
                              min={1}
                              max={8}
                              value={subtask.plannedCrews ?? 1}
                              onChange={(event) => setSubtaskCrews(subtask, Number(event.target.value))}
                              type="number"
                            />
                            <select value={assignDriverId} onChange={(event) => setAssignDriverId(event.target.value)}>
                              {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
                            </select>
                            <select value={assignVehicleId} onChange={(event) => setAssignVehicleId(event.target.value)}>
                              {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}
                            </select>
                            <select value={assignImplementId} onChange={(event) => setAssignImplementId(event.target.value)}>
                              <option value="">{t("contractor.noImplement")}</option>
                              {implementsList.map((implement) => <option key={implement.id} value={implement.id}>{implement.name}</option>)}
                            </select>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="panel">
              <div className="section-heading">
                <h2>{t("contractor.problems")}</h2>
                <span>{problems.length + machineProblems.length}</span>
              </div>
              {machineProblems.map((problem) => (
                <div className="alert-item" key={problem.id ?? `${problem.recordedAt}-${problem.driverName}`}>
                  <strong>{t("dashboard.machineProblem")} · {[...(problem.vehicleNames ?? []), ...(problem.implementNames ?? [])].join(" · ") || t("terms.vehicle")}</strong>
                  <span>{[problem.driverName, problem.problemRecipient ? t(`driver.notify.${problem.problemRecipient}`) : "", problem.note].filter(Boolean).join(" · ")}</span>
                </div>
              ))}
              {problems.map((problem) => (
                <div className="alert-item" key={problem.id}>
                  <strong><FieldName id={problem.fieldId} /></strong>
                  <span>{problem.note ?? t("contractor.openFeedback")}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeSection === "masterData" && (
        <div className="panel resource-master-page">
          <div className="section-heading">
            <h2>{t("contractor.resourceMasterData")}</h2>
            <span>{masterDrivers.length + masterVehicles.length + masterImplements.length}</span>
          </div>

          <div className="resource-master-layout">
            <div className="resource-category-list">
              <button className={activeMasterGroup === "personnel" ? "resource-category active" : "resource-category"} onClick={() => setActiveMasterGroup("personnel")} type="button">
                <strong>{t("masterData.personnel")}</strong>
                <span>{drivers.length} {t("archive.active")} · {archivedDrivers.length} {t("archive.archived")}</span>
              </button>
              <button className={activeMasterGroup === "vehicles" ? "resource-category active" : "resource-category"} onClick={() => setActiveMasterGroup("vehicles")} type="button">
                <strong>{t("contractor.vehicleResources")}</strong>
                <span>{vehicles.length} {t("archive.active")} · {archivedVehicles.length} {t("archive.archived")}</span>
              </button>
              <button className={activeMasterGroup === "implements" ? "resource-category active" : "resource-category"} onClick={() => setActiveMasterGroup("implements")} type="button">
                <strong>{t("contractor.implementResources")}</strong>
                <span>{implementsList.length} {t("archive.active")} · {archivedImplements.length} {t("archive.archived")}</span>
              </button>
            </div>

            <div className="resource-editor-block">
              <div className="section-heading">
                <div>
                  <h2>{t("contractor.resourceMasterData")}</h2>
                  <span className="resource-category-pill">
                    {activeMasterGroup === "personnel" && t("masterData.personnel")}
                    {activeMasterGroup === "vehicles" && t("contractor.vehicleResources")}
                    {activeMasterGroup === "implements" && t("contractor.implementResources")}
                  </span>
                </div>
                <div className="modal-actions">
                  <div className="segmented-control archive-toggle category-archive-toggle">
                    <button className={!showArchivedMasterData ? "active" : ""} onClick={() => setCategoryArchiveView(activeMasterGroup, false)} type="button">
                      {t("archive.active")} · {activeMasterGroup === "personnel" && drivers.length}{activeMasterGroup === "vehicles" && vehicles.length}{activeMasterGroup === "implements" && implementsList.length}
                    </button>
                    <button className={showArchivedMasterData ? "active" : ""} onClick={() => setCategoryArchiveView(activeMasterGroup, true)} type="button">
                      {t("archive.archived")} · {activeMasterGroup === "personnel" && archivedDrivers.length}{activeMasterGroup === "vehicles" && archivedVehicles.length}{activeMasterGroup === "implements" && archivedImplements.length}
                    </button>
                  </div>
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
              <p className="resource-editor-summary">
                {activeMasterGroup === "personnel" && selectedDriver && `${selectedDriver.name} · ${selectedDriver.mobile || selectedDriver.vehicle}`}
                {activeMasterGroup === "vehicles" && selectedVehicle && `${selectedVehicle.name} · ${selectedVehicle.resourceType ?? selectedVehicle.type}`}
                {activeMasterGroup === "implements" && selectedImplement && `${selectedImplement.name} · ${selectedImplement.resourceType ?? selectedImplement.type}`}
              </p>
            </div>

            <div className="resource-list-panel">
              {activeMasterGroup === "personnel" && masterDrivers.map((driver) => (
                (() => {
                  const standardVehicle = allVehicles.find((vehicle) => vehicle.name === driver.vehicle);
                  const vehicleLabel = standardVehicle
                    ? [standardVehicle.name, standardVehicle.licensePlate, standardVehicle.type].filter(Boolean).join(" · ")
                    : driver.vehicle || t("masterData.noDefaultVehicle");
                  return (
                    <button className={driver.id === selectedDriver?.id ? "roster-item active" : "roster-item"} key={driver.id} onClick={() => openDriverEditor(driver)} type="button">
                      <strong>{driver.name}</strong>
                      <span>{driver.mobile || t("masterData.mobile")} · {driver.licenseClasses?.join(", ") || t("masterData.licenseClasses")}</span>
                      <span>{t("masterData.defaultVehicle")}: {vehicleLabel}</span>
                      <span>{activeOrganizations.find((organization) => organization.id === driver.organizationId)?.name ?? t("masterData.noOrganizationAssigned")} · {t(`masterData.driverVisibility.${normalizedDriverJobVisibility(driver)}`)}</span>
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
                          {t("masterData.driverPassword")}
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
                        <label>{t("masterData.resourceType")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={driverForm.resourceType} onChange={(event) => setDriverForm((current) => ({ ...current, resourceType: event.target.value }))} /></label>
                        <label>{t("masterData.operationType")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={driverForm.operationType} onChange={(event) => setDriverForm((current) => ({ ...current, operationType: event.target.value }))} /></label>
                      </div>
                    </section>
                  </div>
                )}

                {activeMasterGroup === "vehicles" && (
                  <div className="form-row resource-form-row modal-form-row">
                    <label>{t("masterData.vehicleDescription")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={vehicleForm.name} onChange={(event) => setVehicleForm((current) => ({ ...current, name: event.target.value }))} /></label>
                    <label>{t("masterData.licensePlate")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={vehicleForm.licensePlate} onChange={(event) => setVehicleForm((current) => ({ ...current, licensePlate: event.target.value }))} /></label>
                    <label>{t("masterData.type")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={vehicleForm.type} onChange={(event) => setVehicleForm((current) => ({ ...current, type: event.target.value }))} /></label>
                    <label>{t("masterData.resourceType")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={vehicleForm.resourceType} onChange={(event) => setVehicleForm((current) => ({ ...current, resourceType: event.target.value }))} /></label>
                    <label>{t("masterData.operationType")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={vehicleForm.operationType} onChange={(event) => setVehicleForm((current) => ({ ...current, operationType: event.target.value }))} /></label>
                    <label>{t("masterData.status")}<select disabled={!permissions.canEditDrivers || showArchivedMasterData} value={vehicleForm.status} onChange={(event) => setVehicleForm((current) => ({ ...current, status: event.target.value as Vehicle["status"] }))}><option value="frei">{t("resourceStatus.frei")}</option><option value="zugewiesen">{t("resourceStatus.zugewiesen")}</option><option value="wartung">{t("resourceStatus.wartung")}</option></select></label>
                  </div>
                )}

                {activeMasterGroup === "implements" && (
                  <div className="form-row resource-form-row modal-form-row">
                    <label>{t("terms.implement")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={implementForm.name} onChange={(event) => setImplementForm((current) => ({ ...current, name: event.target.value }))} /></label>
                    <label>{t("masterData.type")}<input disabled={!permissions.canEditDrivers || showArchivedMasterData} value={implementForm.type} onChange={(event) => setImplementForm((current) => ({ ...current, type: event.target.value }))} /></label>
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
                            <span>{row.details || "-"}</span>
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
                  <button className="secondary-action" onClick={closeResourceModal} type="button">
                    {t("actions.cancel")}
                  </button>
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
          <div className="section-heading">
            <h2><Building2 size={20} /> {t("contractor.organizationMasterData")}</h2>
            <div className="modal-actions">
              <div className="segmented-control archive-toggle category-archive-toggle">
                <button className={!showArchivedOrganizations ? "active" : ""} onClick={() => setShowArchivedOrganizations(false)} type="button">
                  {t("archive.active")} · {activeOrganizations.length}
                </button>
                <button className={showArchivedOrganizations ? "active" : ""} onClick={() => setShowArchivedOrganizations(true)} type="button">
                  {t("archive.archived")} · {archivedOrganizations.length}
                </button>
              </div>
              {canManageOrganizations && !showArchivedOrganizations && (
                <button className="primary-action" onClick={createOrganization} type="button">
                  <Plus size={16} /> {t("masterData.newOrganization")}
                </button>
              )}
            </div>
          </div>
          {!canManageOrganizations && <p className="permission-note">{t("permissions.organizationsReadOnly")}</p>}

          <div className="resource-group-grid">
            <div className="resource-group">
              <div className="resource-group-heading">
                <strong>{t("masterData.farmerOrganizations")}</strong>
                <span>{farmerOrganizations.length}</span>
              </div>
              <div className="resource-grid">
                {farmerOrganizations.map((organization) => renderOrganizationCard(organization))}
              </div>
            </div>
            <div className="resource-group">
              <div className="resource-group-heading">
                <strong>{t("masterData.contractorOrganizations")}</strong>
                <span>{contractorOrganizations.length}</span>
              </div>
              <div className="resource-grid">
                {contractorOrganizations.map((organization) => renderOrganizationCard(organization))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSection === "taskTemplates" && (
        <div className="panel resource-master-page">
          <div className="section-heading">
            <h2>{t("contractor.taskTemplateMasterData")}</h2>
            <span>{showArchivedTaskTemplates ? archivedTaskTemplates.length : activeTaskTemplates.length}</span>
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
                  <label>{t("terms.driver")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} min={0} max={10} value={taskTemplateForm.requiredDrivers} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, requiredDrivers: Number(event.target.value) }))} type="number" /></label>
                  <label>{t("terms.vehicle")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} min={0} max={10} value={taskTemplateForm.requiredVehicles} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, requiredVehicles: Number(event.target.value) }))} type="number" /></label>
                  <label>{t("terms.implement")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} min={0} max={10} value={taskTemplateForm.requiredImplements} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, requiredImplements: Number(event.target.value) }))} type="number" /></label>
                  <label>{t("createJob.subtasks")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} value={taskTemplateForm.workSteps} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, workSteps: event.target.value }))} /></label>
                  <label>{t("createJob.resourceNeed")}<input disabled={!canEditSelectedTaskTemplate || showArchivedTaskTemplates} value={taskTemplateForm.resourceHint} onChange={(event) => setTaskTemplateForm((current) => ({ ...current, resourceHint: event.target.value }))} /></label>
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
                  <button className="secondary-action" onClick={() => setIsTaskTemplateModalOpen(false)} type="button">
                    {t("actions.cancel")}
                  </button>
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
          <div className="section-heading">
            <h2>{t("contractor.jobTypeMasterData")}</h2>
            <span>{showArchivedJobTypes ? archivedJobTypes.length : activeJobTypes.length}</span>
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
        <div className="panel resource-master-page">
          <div className="section-heading">
            <h2>{t("contractor.programSettings")}</h2>
            <span>{t("contractor.dispatchSettings")}</span>
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
	            </div>
	            <p className="resource-editor-summary">{t("contractor.standardVehiclePlanningHint")}</p>
	            <p className="resource-editor-summary">{t("contractor.dispatchGroupingHint")}</p>
	            <p className="resource-editor-summary">{t("contractor.mapProviderHint")}</p>
          </div>
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
                <input disabled={!canManageOrganizations} value={organizationForm.name} onChange={(event) => setOrganizationForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label>
                {t("masterData.organizationKind")}
                <select disabled={currentRole !== "support_admin"} value={organizationForm.kind} onChange={(event) => setOrganizationForm((current) => ({ ...current, kind: event.target.value as Organization["kind"] }))}>
                  <option value="farmer">{t("masterData.farmerOrganization")}</option>
                  <option value="contractor">{t("masterData.contractorOrganization")}</option>
                </select>
                {currentRole !== "support_admin" && <small>{t("masterData.organizationKindLockedHint")}</small>}
              </label>
              <label>
                {t("masterData.street")}
                <input disabled={!canManageOrganizations} value={organizationForm.street} onChange={(event) => setOrganizationForm((current) => ({ ...current, street: event.target.value }))} />
              </label>
              <label>
                {t("masterData.country")}
                <input disabled={!canManageOrganizations} value={organizationForm.country} onChange={(event) => setOrganizationForm((current) => ({ ...current, country: event.target.value }))} />
              </label>
              <label>
                {t("masterData.postalCode")}
                <input disabled={!canManageOrganizations} value={organizationForm.postalCode} onChange={(event) => setOrganizationForm((current) => ({ ...current, postalCode: event.target.value }))} />
              </label>
              <label>
                {t("masterData.city")}
                <input disabled={!canManageOrganizations} value={organizationForm.city} onChange={(event) => setOrganizationForm((current) => ({ ...current, city: event.target.value }))} />
              </label>
              <label>
                {t("masterData.phone")}
                <input disabled={!canManageOrganizations} value={organizationForm.phone} onChange={(event) => setOrganizationForm((current) => ({ ...current, phone: event.target.value }))} />
              </label>
              <label>
                {t("masterData.mobile")}
                <input disabled={!canManageOrganizations} value={organizationForm.mobile} onChange={(event) => setOrganizationForm((current) => ({ ...current, mobile: event.target.value }))} />
              </label>
              <label>
                {t("masterData.email")}
                <input disabled={!canManageOrganizations} type="email" value={organizationForm.email} onChange={(event) => setOrganizationForm((current) => ({ ...current, email: event.target.value }))} />
              </label>
              <label>
                {t("masterData.website")}
                <input disabled={!canManageOrganizations} value={organizationForm.website} onChange={(event) => setOrganizationForm((current) => ({ ...current, website: event.target.value }))} />
              </label>
              <label>
                {t("masterData.vatId")}
                <input disabled={!canManageOrganizations} value={organizationForm.vatId} onChange={(event) => setOrganizationForm((current) => ({ ...current, vatId: event.target.value }))} />
              </label>
              <label>
                {t("terms.notes")}
                <input disabled={!canManageOrganizations} value={organizationForm.notes} onChange={(event) => setOrganizationForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
            </div>
            <div className="resource-editor-block contact-editor-block">
              <div className="section-heading">
                <h2>{t("masterData.contacts")}</h2>
                {canManageOrganizations && (
                  <button className="secondary-action" onClick={addOrganizationContact} type="button">
                    <Plus size={16} /> {t("masterData.addContact")}
                  </button>
                )}
              </div>
              <div className="contact-list-editor">
                {organizationForm.contacts.length === 0 && <p className="permission-note">{t("masterData.noContacts")}</p>}
                {organizationForm.contacts.map((contact) => (
                  <div className="contact-editor-card" key={contact.id}>
                    <label>{t("masterData.contactName")}<input disabled={!canManageOrganizations} value={contact.name} onChange={(event) => updateOrganizationContact(contact.id, { name: event.target.value })} /></label>
                    <label>{t("masterData.contactRole")}<input disabled={!canManageOrganizations} value={contact.role ?? ""} onChange={(event) => updateOrganizationContact(contact.id, { role: event.target.value })} /></label>
                    <label>{t("masterData.phone")}<input disabled={!canManageOrganizations} value={contact.phone ?? ""} onChange={(event) => updateOrganizationContact(contact.id, { phone: event.target.value })} /></label>
                    <label>{t("masterData.mobile")}<input disabled={!canManageOrganizations} value={contact.mobile ?? ""} onChange={(event) => updateOrganizationContact(contact.id, { mobile: event.target.value })} /></label>
                    <label>{t("masterData.sms")}<input disabled={!canManageOrganizations} value={contact.sms ?? ""} onChange={(event) => updateOrganizationContact(contact.id, { sms: event.target.value })} /></label>
                    <label>{t("masterData.email")}<input disabled={!canManageOrganizations} type="email" value={contact.email ?? ""} onChange={(event) => updateOrganizationContact(contact.id, { email: event.target.value })} /></label>
                    <label>{t("terms.notes")}<input disabled={!canManageOrganizations} value={contact.notes ?? ""} onChange={(event) => updateOrganizationContact(contact.id, { notes: event.target.value })} /></label>
                    {canManageOrganizations && (
                      <button className="danger-action" onClick={() => removeOrganizationContact(contact.id)} type="button">
                        <Trash2 size={16} /> {t("actions.delete")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              {canManageOrganizations && !showArchivedOrganizations && !creatingOrganization && (
                <button className="danger-action" onClick={archiveSelectedOrganization} type="button">
                  <Archive size={16} /> {t("actions.archive")}
                </button>
              )}
              {canManageOrganizations && showArchivedOrganizations && !creatingOrganization && (
                <button className="danger-action" onClick={requestDeleteSelectedOrganization} type="button">
                  <Trash2 size={16} /> {t("actions.deletePermanent")}
                </button>
              )}
              <button className="secondary-action" onClick={() => setIsOrganizationModalOpen(false)} type="button">
                {t("actions.cancel")}
              </button>
              {canManageOrganizations && !showArchivedOrganizations && (
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
              <button className="secondary-action" onClick={() => setStandardVehicleChoice(null)} type="button">
                {t("actions.cancel")}
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
              <button className="secondary-action" onClick={() => setWorkTimeOverride(null)} type="button">
                {t("actions.cancel")}
              </button>
              <button className="primary-action" onClick={confirmWorkTimeOverride} type="button">
                {t("contractor.overrideWorkTime")}
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
              <button className="secondary-action" onClick={() => setDeleteOrganizationConfirm(null)} type="button">{t("actions.cancel")}</button>
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
              <button className="secondary-action" onClick={() => setDeleteResourceConfirm(null)} type="button">{t("actions.cancel")}</button>
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
              <button className="secondary-action" onClick={() => setDeleteTaskTemplateConfirm(null)} type="button">{t("actions.cancel")}</button>
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
              <button className="secondary-action" onClick={() => setDeleteJobTypeConfirm(null)} type="button">{t("actions.cancel")}</button>
              <button className="danger-action" onClick={confirmDeleteSelectedJobType} type="button"><Trash2 size={16} /> {t("actions.deletePermanent")}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
