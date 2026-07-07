import { Camera, Check, ChevronLeft, Cog, Crosshair, Flag, LogOut, MapPinned, Pause, Play, Plus, Radio, RadioTower, Repeat, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppData } from "../data/DataContext";
import { claimJobTask } from "../services/tasks";
import type { DriverLocation, Job, Subtask } from "../types";
import { DriverFieldMap } from "./DriverFieldMap";
import { DriverTaskGroupMap } from "./DriverTaskGroupMap";
import { NewHazardForm } from "./NewHazardForm";
import { FieldName, ProgressBar, StatusBadge, getTask } from "./shared";

type DriverFeedbackDraft = {
  doneHa: string;
  doneAmount: string;
  trips: string;
  note: string;
  photoName: string;
};

type DriverTaskGroup = {
  id: string;
  taskName: string;
  subtasks: Subtask[];
  jobCount: number;
  fieldsCount: number;
  areaHa: number;
  estimatedHours: number;
};

type EquipmentPlacement = "attached" | "yard" | "field" | "defect";
type CompletionDialogState = {
  subtaskId: string;
  status: "teilweise erledigt" | "erledigt";
} | null;

const equipmentLogStorageKey = "farm-manager.driverEquipmentLog";
const driverTestLocationStorageKey = "farm-manager.driverTestLocation";
const automaticDriverLocationIntervalMs = 5 * 60 * 1000;

function appendEquipmentLog(entry: Record<string, unknown>) {
  try {
    const existing = window.localStorage.getItem(equipmentLogStorageKey);
    const parsed = existing ? JSON.parse(existing) as Record<string, unknown>[] : [];
    const nextEntry = {
      id: crypto.randomUUID(),
      recordedAt: new Date().toISOString(),
      ...entry,
    };
    window.localStorage.setItem(equipmentLogStorageKey, JSON.stringify([nextEntry, ...parsed].slice(0, 250)));
  } catch {
    // Lokales Protokoll ist Komfortfunktion; die Fahreransicht darf daran nicht scheitern.
  }
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

function draftFromSubtask(subtask?: Subtask): DriverFeedbackDraft {
  return {
    doneHa: subtask?.doneHa ? String(subtask.doneHa) : "",
    doneAmount: subtask?.doneAmount ? String(subtask.doneAmount) : "",
    trips: subtask?.trips ? String(subtask.trips) : "",
    note: subtask?.driverNote ?? subtask?.note ?? "",
    photoName: subtask?.driverPhotoName ?? "",
  };
}

function parseOptionalNumber(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatDriverHours(value: number) {
  return `${value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
}

export function DriverView({
  subtasks,
  jobs,
  onLocationUpdate,
  onUpdateSubtask,
  onHandoverDriverAssignments,
  onUploadSubtaskPhotos,
  onDeleteSubtaskPhoto,
}: {
  subtasks: Subtask[];
  jobs: Job[];
  onLocationUpdate: (location: DriverLocation) => void;
  onUpdateSubtask: (id: string, patch: Partial<Subtask>) => void;
  onHandoverDriverAssignments: (nextDriverId: string) => Promise<void>;
  onUploadSubtaskPhotos: (id: string, files: File[]) => Promise<void>;
  onDeleteSubtaskPhoto: (subtaskId: string, photoId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { authProfile, currentDriverId, drivers, fields, implementsList, isAuthenticated, isDemoMode, isLoading, organizations, refreshData, signOut, vehicles } = useAppData();
  const driver = drivers.find((item) => (
    item.id === currentDriverId
    || item.profileId === currentDriverId
    || Boolean(authProfile?.id && item.profileId === authProfile.id)
    || Boolean(authProfile?.email && item.email?.trim().toLowerCase() === authProfile.email.trim().toLowerCase())
  )) ?? (authProfile?.role === "driver"
    ? {
        id: currentDriverId ?? authProfile.id,
        profileId: authProfile.id,
        organizationId: authProfile.organizationId,
        name: authProfile.fullName,
        email: authProfile.email,
        vehicle: authProfile.vehicleName ?? "",
        jobVisibility: authProfile.jobVisibility ?? "assigned_only",
      }
    : !isAuthenticated ? drivers[0] : undefined);
  const availableVehicles = vehicles.filter((vehicle) => !vehicle.archivedAt && vehicle.status !== "wartung" && (!driver?.organizationId || vehicle.organizationId === driver.organizationId));
  const availableImplements = implementsList.filter((implement) => !implement.archivedAt && implement.status !== "wartung" && (!driver?.organizationId || implement.organizationId === driver.organizationId));
  const driverOrganization = driver?.organizationId ? organizations.find((organization) => organization.id === driver.organizationId) : undefined;
  const isJobOwnedByDriverFarm = (job: Job) => Boolean(driver?.organizationId && (
    job.farmerOrganizationId === driver.organizationId
    || job.fieldIds.some((fieldId) => fields.find((field) => field.id === fieldId)?.organizationId === driver.organizationId)
  ));
  const isInternalJobForDriverOrganization = (job: Job) => {
    if (!driver?.organizationId) return true;
    if (driverOrganization?.kind === "farmer") {
      return isJobOwnedByDriverFarm(job) && (!job.contractorOrganizationId || job.contractorOrganizationId === driver.organizationId);
    }
    return job.contractorOrganizationId === driver.organizationId;
  };
  const isVisibleOrganizationJob = (job: Job) => {
    if (!driver?.organizationId) return true;
    const visibility = driver.jobVisibility ?? "assigned_only";
    if (visibility === "organization_all") {
      return isJobOwnedByDriverFarm(job) || job.contractorOrganizationId === driver.organizationId;
    }
    if (visibility === "organization_internal" || visibility === "contractor_all") {
      return isInternalJobForDriverOrganization(job);
    }
    return false;
  };
  const isAssignedToDriver = (subtask: Subtask) => Boolean(driver && (
    subtask.activeDriverIds.includes(driver.id)
    || Boolean(driver.profileId && subtask.activeDriverIds.includes(driver.profileId))
    || subtask.activeDriverIds.some((driverId) => drivers.find((item) => item.id === driverId)?.name === driver.name)
  ));
  const accessibleSubtasks = subtasks
    .filter((subtask) => subtask.status !== "erledigt")
    .filter((subtask) => {
      if (!driver) return true;
      if (isAssignedToDriver(subtask)) return true;
      if ((driver.jobVisibility ?? "assigned_only") !== "assigned_only") {
        const job = jobs.find((item) => item.id === subtask.jobId);
        return job ? isVisibleOrganizationJob(job) : false;
      }
      return isAssignedToDriver(subtask);
    });
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

  const driverTaskGroups = useMemo<DriverTaskGroup[]>(() => {
    const groups = new Map<string, DriverTaskGroup>();
    accessibleSubtasks.forEach((subtask) => {
      const job = jobs.find((item) => item.id === subtask.jobId);
      const task = job?.tasks.find((item) => item.id === subtask.taskId);
      const taskName = task?.name ?? subtask.taskId;
      const estimatedHours = subtask.estimatedHours ?? task?.estimatedHours ?? job?.estimatedHours ?? 0;
      const key = taskName.trim().toLowerCase();
      const field = fields.find((item) => item.id === subtask.fieldId);
      const existing = groups.get(key);
      const subtasksInGroup = [...(existing?.subtasks ?? []), subtask];
      const orderedSubtasks = orderSubtasksByRoute(subtasksInGroup);
      groups.set(key, {
        id: key,
        taskName,
        subtasks: orderedSubtasks,
        jobCount: new Set(subtasksInGroup.map((item) => item.jobId)).size,
        fieldsCount: new Set(subtasksInGroup.map((item) => item.fieldId)).size,
        areaHa: (existing?.areaHa ?? 0) + (field?.areaHa ?? 0),
        estimatedHours: (existing?.estimatedHours ?? 0) + estimatedHours,
      });
    });
    return Array.from(groups.values()).sort((a, b) => b.subtasks.length - a.subtasks.length);
  }, [accessibleSubtasks, fields, jobs]);
  const [openSubtaskId, setOpenSubtaskId] = useState("");
  const [openTaskGroupId, setOpenTaskGroupId] = useState("");
  const [trackingSubtaskId, setTrackingSubtaskId] = useState("");
  const [trackingNotice, setTrackingNotice] = useState("");
  const [noticeSubtaskId, setNoticeSubtaskId] = useState("");
  const [pendingFieldClaimId, setPendingFieldClaimId] = useState("");
  const [isMachineYardOpen, setIsMachineYardOpen] = useState(false);
  const [isEndShiftOpen, setIsEndShiftOpen] = useState(false);
  const [isHandoverOpen, setIsHandoverOpen] = useState(false);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [selectedImplementIds, setSelectedImplementIds] = useState<string[]>([]);
  const [hasManualEquipmentSelection, setHasManualEquipmentSelection] = useState(false);
  const [equipmentPlacement, setEquipmentPlacement] = useState<EquipmentPlacement>("attached");
  const [equipmentNote, setEquipmentNote] = useState("");
  const [equipmentProblem, setEquipmentProblem] = useState(false);
  const [equipmentProblemRecipient, setEquipmentProblemRecipient] = useState("workshop");
  const [handoverDriverId, setHandoverDriverId] = useState("");
  const [handoverNote, setHandoverNote] = useState("");
  const [equipmentNotice, setEquipmentNotice] = useState("");
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, DriverFeedbackDraft>>({});
  const [completionDialog, setCompletionDialog] = useState<CompletionDialogState>(null);
  const [useTestLocation, setUseTestLocationState] = useState(() => {
    try {
      return window.localStorage.getItem(driverTestLocationStorageKey) === "true";
    } catch {
      return false;
    }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedSubtask = accessibleSubtasks.find((subtask) => subtask.id === openSubtaskId);
  const selectedTaskGroup = driverTaskGroups.find((group) => group.id === openTaskGroupId);
  const selectedTaskGroupFields = selectedTaskGroup
    ? Array.from(new Map(selectedTaskGroup.subtasks
      .map((subtask) => fields.find((field) => field.id === subtask.fieldId))
      .filter(Boolean)
      .map((field) => [field!.id, field!] as const)).values())
    : [];
  const selectedTaskGroupStatuses = selectedTaskGroup
    ? selectedTaskGroup.subtasks.reduce<Record<string, Subtask["status"][]>>((acc, subtask) => {
      acc[subtask.fieldId] = Array.from(new Set([...(acc[subtask.fieldId] ?? []), subtask.status]));
      return acc;
    }, {})
    : {};
  const visibleSubtasksForSelectedGroup = selectedTaskGroup?.subtasks ?? [];

  useEffect(() => {
    if (!trackingSubtaskId || !driver) return undefined;
    const interval = window.setInterval(() => {
      const subtask = subtasks.find((item) => item.id === trackingSubtaskId);
      if (subtask) sendLocation(subtask, true);
    }, 30000);
    return () => window.clearInterval(interval);
  }, [driver, trackingSubtaskId, subtasks, useTestLocation]);
  useEffect(() => {
    if (!driver) return undefined;
    const sendAutomaticLocation = () => {
      const identifiers = new Set([driver.id, driver.profileId].filter(Boolean));
      const assignedSubtask = subtasks
        .filter((subtask) => subtask.status !== "erledigt")
        .filter((subtask) => subtask.activeDriverIds.some((driverId) => identifiers.has(driverId)))
        .sort((a, b) => {
          const priority = (status: Subtask["status"]) => status === "in Arbeit" ? 0 : status === "pausiert" ? 1 : status === "reserviert" ? 2 : 3;
          return priority(a.status) - priority(b.status);
        })[0];
      if (assignedSubtask) {
        sendLocation(assignedSubtask, true);
        return;
      }
      sendDriverHeartbeatLocation(true);
    };
    const interval = window.setInterval(sendAutomaticLocation, automaticDriverLocationIntervalMs);
    return () => window.clearInterval(interval);
  }, [driver?.id, driver?.profileId, subtasks, useTestLocation]);
  useEffect(() => {
    if (openTaskGroupId && !driverTaskGroups.some((group) => group.id === openTaskGroupId)) {
      setOpenTaskGroupId("");
      setOpenSubtaskId("");
    }
  }, [driverTaskGroups, openTaskGroupId]);
  useEffect(() => {
    if (openSubtaskId && !accessibleSubtasks.some((subtask) => subtask.id === openSubtaskId)) {
      setOpenSubtaskId("");
    }
  }, [accessibleSubtasks, openSubtaskId]);
  if (!driver) {
    return <section className="panel"><h2>{t("driver.noDriverLogin")}</h2></section>;
  }
  const activeDriver = driver;
  const standardVehicle = vehicles.find((vehicle) => (
    vehicle.id === activeDriver.vehicle
    || vehicle.name === activeDriver.vehicle
    || [vehicle.name, vehicle.licensePlate].filter(Boolean).join(" ") === activeDriver.vehicle
  ));
  const selectedYardVehicleIds = hasManualEquipmentSelection ? selectedVehicleIds : standardVehicle ? [standardVehicle.id] : [];
  const selectedYardVehicleNames = selectedYardVehicleIds
    .map((id) => vehicles.find((vehicle) => vehicle.id === id))
    .filter((vehicle): vehicle is NonNullable<typeof vehicle> => Boolean(vehicle))
    .map((vehicle) => [vehicle.name, vehicle.licensePlate].filter(Boolean).join(" "));
  const selectedYardImplementNames = selectedImplementIds
    .map((id) => implementsList.find((implement) => implement.id === id))
    .filter((implement): implement is NonNullable<typeof implement> => Boolean(implement))
    .map((implement) => implement.name);
  const selectedYardLabel = [...selectedYardVehicleNames, ...selectedYardImplementNames].join(" · ") || t("driver.noEquipmentSelected");
  const handoverDrivers = drivers.filter((item) => item.id !== activeDriver.id && (!activeDriver.organizationId || item.organizationId === activeDriver.organizationId));
  const selectedTask = selectedSubtask ? jobs.find((job) => job.id === selectedSubtask.jobId)?.tasks.find((item) => item.id === selectedSubtask.taskId) : undefined;
  const selectedField = selectedSubtask ? fields.find((item) => item.id === selectedSubtask.fieldId) : undefined;
  const selectedFeedbackDraft = selectedSubtask ? feedbackDrafts[selectedSubtask.id] ?? draftFromSubtask(selectedSubtask) : draftFromSubtask();
  const completionSubtask = completionDialog ? subtasks.find((subtask) => subtask.id === completionDialog.subtaskId) : undefined;
  const completionTask = completionSubtask ? jobs.find((job) => job.id === completionSubtask.jobId)?.tasks.find((item) => item.id === completionSubtask.taskId) : undefined;
  const completionDraft = completionSubtask ? feedbackDrafts[completionSubtask.id] ?? draftFromSubtask(completionSubtask) : draftFromSubtask();
  const pendingFieldClaim = accessibleSubtasks.find((subtask) => subtask.id === pendingFieldClaimId);
  const pendingFieldClaimField = pendingFieldClaim ? fields.find((field) => field.id === pendingFieldClaim.fieldId) : undefined;
  function resourceAssignmentLabel(resourceId: string, kind: "vehicle" | "implement") {
    const assignedSubtask = subtasks.find((subtask) => (
      subtask.status !== "erledigt"
      && (kind === "vehicle"
        ? (subtask.activeVehicleIds ?? []).includes(resourceId)
        : (subtask.activeImplementIds ?? []).includes(resourceId))
    ));
    if (!assignedSubtask) return t("driver.resourceAvailable");
    const job = jobs.find((item) => item.id === assignedSubtask.jobId);
    const driverNames = [
      ...assignedSubtask.activeDriverIds
        .map((id) => drivers.find((item) => item.id === id || item.profileId === id)?.name)
        .filter((name): name is string => Boolean(name)),
      ...(assignedSubtask.activeDriverNames ?? []),
    ];
    const assignee = Array.from(new Set(driverNames)).join(", ") || t("driver.unknownDriver");
    return t("driver.resourceAssignedTo", { assignee, job: job?.jobNumber ?? assignedSubtask.jobId });
  }

  function updateFeedbackDraft(subtaskId: string, patch: Partial<DriverFeedbackDraft>) {
    const subtask = subtasks.find((item) => item.id === subtaskId);
    setFeedbackDrafts((current) => ({
      ...current,
      [subtaskId]: {
        ...(current[subtaskId] ?? draftFromSubtask(subtask)),
        ...patch,
      },
    }));
  }

  function feedbackMetric(task?: Job["tasks"][number]) {
    return task?.progressMetric[0] ?? "Fläche";
  }

  function feedbackValueConfig(task?: Job["tasks"][number], subtask?: Subtask) {
    const metric = feedbackMetric(task);
    const unitFromData = subtask?.targetUnit || task?.unit || "";
    if (metric === "Menge") {
      const inferredUnit = task?.name.toLowerCase().includes("ballen") ? t("driver.bales") : "";
      const unit = unitFromData || inferredUnit;
      return {
        key: "doneAmount" as const,
        label: unit ? `${t("driver.quantity")} (${unit})` : t("driver.quantity"),
        placeholder: "0",
        inputMode: "decimal" as const,
      };
    }
    if (metric === "Fuhren") {
      const unit = unitFromData || t("driver.trips");
      return {
        key: "trips" as const,
        label: unit ? `${t("driver.trips")} (${unit})` : t("driver.trips"),
        placeholder: "0",
        inputMode: "numeric" as const,
      };
    }
    if (metric === "Zeit") {
      const unit = unitFromData || "h";
      return {
        key: "doneAmount" as const,
        label: unit ? `${t("driver.completedTime")} (${unit})` : t("driver.completedTime"),
        placeholder: "0,00",
        inputMode: "decimal" as const,
      };
    }
    const unit = unitFromData || "ha";
    return {
      key: "doneHa" as const,
      label: unit ? `${t("driver.areaDone")} (${unit})` : t("driver.areaDone"),
      placeholder: "0,00",
      inputMode: "decimal" as const,
    };
  }

  function feedbackPatch(subtask: Subtask, status: Subtask["status"], fallbackProgress: number) {
    const draft = feedbackDrafts[subtask.id] ?? draftFromSubtask(subtask);
    const doneHa = parseOptionalNumber(draft.doneHa);
    const doneAmount = parseOptionalNumber(draft.doneAmount);
    const trips = parseOptionalNumber(draft.trips);
    const note = draft.note.trim();
    const activeDriverIds = Array.from(new Set([...subtask.activeDriverIds, activeDriver.id]));
    const activeDriverNames = Array.from(new Set([...(subtask.activeDriverNames ?? []), activeDriver.name]));
    const performedDriverIds = Array.from(new Set([...(subtask.performedDriverIds ?? []), activeDriver.id]));
    const performedDriverNames = Array.from(new Set([...(subtask.performedDriverNames ?? []), activeDriver.name]));
    const activeVehicleIds = Array.from(new Set([...(subtask.activeVehicleIds ?? []), ...selectedYardVehicleIds]));
    const performedVehicleNames = Array.from(new Set([
      ...(subtask.performedVehicleNames ?? []),
      ...selectedYardVehicleNames,
    ]));
    const activeImplementIds = Array.from(new Set([...(subtask.activeImplementIds ?? []), ...selectedImplementIds]));
    const performedImplementIds = Array.from(new Set([...(subtask.performedImplementIds ?? []), ...selectedImplementIds]));
    return {
      status,
      progress: status === "erledigt" ? 100 : Math.max(fallbackProgress, subtask.progress),
      activeDriverIds,
      activeDriverNames,
      performedDriverIds,
      performedDriverNames,
      activeVehicleIds,
      performedVehicleNames,
      activeImplementIds,
      performedImplementIds,
      doneHa,
      doneAmount,
      trips,
      note: note || subtask.note,
      driverNote: note || subtask.driverNote,
      driverPhotoName: draft.photoName || subtask.driverPhotoName,
      accessUsed: selectedField?.accessPoint.label,
      accessOk: status === "Problem" ? false : true,
    };
  }

  function handlePhotosSelected(subtask: Subtask, fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    updateFeedbackDraft(subtask.id, { photoName: files.length === 1 ? files[0].name : t("driver.photosSelected", { count: files.length }) });
    void onUploadSubtaskPhotos(subtask.id, files);
  }

	  async function claim(subtask: Subtask) {
    const task = jobs.find((job) => job.id === subtask.jobId)?.tasks.find((item) => item.id === subtask.taskId);
    if (!isDemoMode) {
      const { error } = await claimJobTask(subtask.id, activeDriver.vehicle);
      if (error) {
        console.error("Fahrer-Anmeldung konnte nicht direkt synchronisiert werden", error);
        setEquipmentNotice(t("driver.claimSyncFailed"));
      }
    }
    const activeDriverIds = task?.mode === "Einzelmodus" ? [activeDriver.id] : Array.from(new Set([...subtask.activeDriverIds, activeDriver.id]));
    const activeDriverNames = task?.mode === "Einzelmodus" ? [activeDriver.name] : Array.from(new Set([...(subtask.activeDriverNames ?? []), activeDriver.name]));
    const activeVehicleIds = task?.mode === "Einzelmodus"
      ? selectedYardVehicleIds
      : Array.from(new Set([...(subtask.activeVehicleIds ?? []), ...selectedYardVehicleIds]));
    const activeImplementIds = Array.from(new Set([...(subtask.activeImplementIds ?? []), ...selectedImplementIds]));
	    onUpdateSubtask(subtask.id, { activeDriverIds, activeDriverNames, activeVehicleIds, activeImplementIds, status: "reserviert" });
	  }

  function selectFieldForClaim(subtask: Subtask) {
    setPendingFieldClaimId(subtask.id);
  }

  async function confirmFieldClaim() {
    const subtask = pendingFieldClaim;
    if (!subtask) return;
    setPendingFieldClaimId("");
    await claim(subtask);
    setOpenSubtaskId(subtask.id);
    sendLocation({
      ...subtask,
      activeDriverIds: Array.from(new Set([...subtask.activeDriverIds, activeDriver.id])),
      activeDriverNames: Array.from(new Set([...(subtask.activeDriverNames ?? []), activeDriver.name])),
      activeVehicleIds: Array.from(new Set([...(subtask.activeVehicleIds ?? []), ...selectedYardVehicleIds])),
      activeImplementIds: Array.from(new Set([...(subtask.activeImplementIds ?? []), ...selectedImplementIds])),
      status: subtask.status === "offen" ? "reserviert" : subtask.status,
    });
  }

  function toggleYardVehicle(vehicleId: string) {
    setHasManualEquipmentSelection(true);
    setSelectedVehicleIds((current) => {
      const base = hasManualEquipmentSelection ? current : selectedYardVehicleIds;
      return base.includes(vehicleId)
        ? base.filter((id) => id !== vehicleId)
        : Array.from(new Set([...base, vehicleId]));
    });
  }

  function toggleYardImplement(implementId: string) {
    setHasManualEquipmentSelection(true);
    setSelectedImplementIds((current) => current.includes(implementId)
      ? current.filter((id) => id !== implementId)
      : Array.from(new Set([...current, implementId])));
  }

  function writeEquipmentLog(eventType: "selection" | "shift_end" | "handover", note: string, placement: EquipmentPlacement, extra: Record<string, unknown> = {}) {
    const reportsProblem = equipmentProblem || placement === "defect";
    appendEquipmentLog({
      eventType,
      driverId: activeDriver.id,
      driverName: activeDriver.name,
      organizationId: activeDriver.organizationId,
      placement,
      note: note.trim(),
      machineProblem: reportsProblem,
      problemRecipient: reportsProblem ? equipmentProblemRecipient : undefined,
      notificationStatus: reportsProblem ? "queued" : undefined,
      vehicleIds: selectedYardVehicleIds,
      vehicleNames: selectedYardVehicleNames,
      implementIds: selectedImplementIds,
      implementNames: selectedYardImplementNames,
      ...extra,
    });
    setEquipmentNotice(t(reportsProblem ? "driver.equipmentProblemSaved" : eventType === "handover" ? "driver.handoverSaved" : "driver.equipmentSaved"));
  }

  function saveEquipmentSelection() {
    writeEquipmentLog("selection", equipmentNote, equipmentPlacement);
    setEquipmentNote("");
    setEquipmentProblem(false);
    setIsMachineYardOpen(false);
  }

  async function confirmEndShift() {
    writeEquipmentLog("shift_end", equipmentNote, equipmentPlacement);
    if (equipmentPlacement === "yard") {
      setHasManualEquipmentSelection(true);
      setSelectedVehicleIds([]);
      setSelectedImplementIds([]);
    }
    setEquipmentNote("");
    setEquipmentProblem(false);
    setIsEndShiftOpen(false);
    await signOut();
  }

  async function confirmHandover() {
    const nextDriver = drivers.find((item) => item.id === handoverDriverId);
    writeEquipmentLog("handover", handoverNote, equipmentPlacement, {
      handoverToDriverId: nextDriver?.id,
      handoverToDriverName: nextDriver?.name,
    });
    setHandoverNote("");
    setEquipmentProblem(false);
    setIsHandoverOpen(false);
    await onHandoverDriverAssignments(handoverDriverId);
  }

  function fallbackPoint(subtask: Subtask) {
    const field = fields.find((item) => item.id === subtask.fieldId);
    const base = field?.accessPoint ?? field?.center ?? { lat: 55.72572, lng: 13.17942 };
    return {
      lat: base.lat + (Math.random() - 0.5) * 0.001,
      lng: base.lng + (Math.random() - 0.5) * 0.001,
      accuracy: 25,
      speed: 0,
    };
  }

  function fallbackDriverPoint() {
    const field = fields.find((item) => item.organizationId === activeDriver.organizationId) ?? fields[0];
    const base = field?.accessPoint ?? field?.center ?? { lat: 55.72572, lng: 13.17942 };
    return {
      lat: base.lat + (Math.random() - 0.5) * 0.001,
      lng: base.lng + (Math.random() - 0.5) * 0.001,
      accuracy: field ? 75 : 100,
      speed: 0,
    };
  }

  function publishLocation(subtask: Subtask, point: { lat: number; lng: number; accuracy?: number; speed?: number }, automatic = false, fallbackNotice?: string) {
    onLocationUpdate({
      id: `${activeDriver.id}-${Date.now()}`,
      driverId: activeDriver.id,
      driverName: activeDriver.name,
      vehicleName: activeDriver.vehicle,
      subtaskId: subtask.id,
      fieldId: subtask.fieldId,
      lat: point.lat,
      lng: point.lng,
      accuracy: point.accuracy,
      speed: point.speed,
      status: subtask.status === "Problem" ? "Problem" : subtask.status === "in Arbeit" ? "in Arbeit" : subtask.status === "pausiert" ? "pausiert" : "unterwegs",
      recordedAt: new Date().toISOString(),
    });
    setNoticeSubtaskId(subtask.id);
    setTrackingNotice(fallbackNotice ?? (automatic ? t("liveLocation.autoSent") : t("liveLocation.sent")));
  }

  function publishTravelLocation(point: { lat: number; lng: number; accuracy?: number; speed?: number }, automatic = false, fallbackNotice?: string) {
    onLocationUpdate({
      id: `${activeDriver.id}-${Date.now()}`,
      driverId: activeDriver.id,
      driverName: activeDriver.name,
      vehicleName: activeDriver.vehicle,
      lat: point.lat,
      lng: point.lng,
      accuracy: point.accuracy,
      speed: point.speed,
      status: "unterwegs",
      recordedAt: new Date().toISOString(),
    });
    setTrackingNotice(fallbackNotice ?? (automatic ? t("liveLocation.autoSent") : t("liveLocation.sent")));
  }

  function setUseTestLocation(next: boolean) {
    setUseTestLocationState(next);
    try {
      window.localStorage.setItem(driverTestLocationStorageKey, String(next));
    } catch {
      // Wenn der Browser localStorage blockiert, bleibt der Schalter nur fuer die aktuelle Sitzung aktiv.
    }
  }

  function sendLocation(subtask: Subtask, automatic = false) {
    if (!automatic) {
      setNoticeSubtaskId(subtask.id);
      setTrackingNotice(t("liveLocation.sending"));
    }
    if (useTestLocation) {
      publishLocation(subtask, fallbackPoint(subtask), automatic, t("liveLocation.testLocationSent"));
      return;
    }
    if (!window.isSecureContext) {
      publishLocation(subtask, fallbackPoint(subtask), automatic, t("liveLocation.insecureContext"));
      return;
    }
    if (!navigator.geolocation) {
      publishLocation(subtask, fallbackPoint(subtask), automatic, t("liveLocation.notSupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => publishLocation(subtask, {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed ?? undefined,
      }, automatic),
      (error) => {
        const fallbackMessage = error.code === error.PERMISSION_DENIED
          ? t("liveLocation.permissionDenied")
          : error.code === error.TIMEOUT
            ? t("liveLocation.timeout")
            : t("liveLocation.positionUnavailable");
        publishLocation(subtask, fallbackPoint(subtask), automatic, fallbackMessage);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 5000 },
    );
  }

  function sendTravelLocationFromSubtask(subtask: Subtask, automatic = false) {
    if (useTestLocation) {
      publishTravelLocation(fallbackPoint(subtask), automatic, t("liveLocation.testLocationSent"));
      return;
    }
    if (!window.isSecureContext) {
      publishTravelLocation(fallbackPoint(subtask), automatic, t("liveLocation.insecureContext"));
      return;
    }
    if (!navigator.geolocation) {
      publishTravelLocation(fallbackPoint(subtask), automatic, t("liveLocation.notSupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => publishTravelLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed ?? undefined,
      }, automatic),
      (error) => {
        const fallbackMessage = error.code === error.PERMISSION_DENIED
          ? t("liveLocation.permissionDenied")
          : error.code === error.TIMEOUT
            ? t("liveLocation.timeout")
            : t("liveLocation.positionUnavailable");
        publishTravelLocation(fallbackPoint(subtask), automatic, fallbackMessage);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 5000 },
    );
  }

  function sendDriverHeartbeatLocation(automatic = false) {
    if (useTestLocation) {
      publishTravelLocation(fallbackDriverPoint(), automatic, t("liveLocation.testLocationSent"));
      return;
    }
    if (!window.isSecureContext) {
      publishTravelLocation(fallbackDriverPoint(), automatic, t("liveLocation.insecureContext"));
      return;
    }
    if (!navigator.geolocation) {
      publishTravelLocation(fallbackDriverPoint(), automatic, t("liveLocation.notSupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => publishTravelLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed ?? undefined,
      }, automatic),
      (error) => {
        const fallbackMessage = error.code === error.PERMISSION_DENIED
          ? t("liveLocation.permissionDenied")
          : error.code === error.TIMEOUT
            ? t("liveLocation.timeout")
            : t("liveLocation.positionUnavailable");
        publishTravelLocation(fallbackDriverPoint(), automatic, fallbackMessage);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 5000 },
    );
  }

  function completeSubtask(subtask: Subtask) {
    const patch = feedbackPatch(subtask, "erledigt", 100);
    onUpdateSubtask(subtask.id, patch);
    if (trackingSubtaskId === subtask.id) setTrackingSubtaskId("");
    setNoticeSubtaskId("");
    sendTravelLocationFromSubtask({ ...subtask, ...patch }, true);
    setOpenSubtaskId("");
  }

  function updateStatusAndSendLocation(subtask: Subtask, patch: Partial<Subtask>) {
    onUpdateSubtask(subtask.id, patch);
    sendLocation({ ...subtask, ...patch }, true);
  }

  function openCompletionDialog(subtask: Subtask, status: "teilweise erledigt" | "erledigt") {
    setFeedbackDrafts((current) => ({
      ...current,
      [subtask.id]: current[subtask.id] ?? draftFromSubtask(subtask),
    }));
    setCompletionDialog({ subtaskId: subtask.id, status });
  }

  function confirmCompletionDialog() {
    if (!completionDialog || !completionSubtask) return;
    if (completionDialog.status === "erledigt") {
      completeSubtask(completionSubtask);
    } else {
      updateStatusAndSendLocation(completionSubtask, feedbackPatch(completionSubtask, "teilweise erledigt", 60));
    }
    setCompletionDialog(null);
  }

  return (
    <section className="driver-shell">
      <div className="mobile-frame">
        <div className="driver-header">
          <div>
            <p className="eyebrow">{t("driver.view")}</p>
            <h2>{driver.name}</h2>
            <span className="driver-selected-resources">{selectedYardLabel}</span>
            {equipmentNotice && <small className="driver-equipment-notice">{equipmentNotice}</small>}
          </div>
          <div className="driver-header-actions">
            <button className="driver-yard-open" onClick={() => setIsMachineYardOpen(true)} type="button">
              <Cog size={20} />
              <span>
                {t("driver.machineYard")}
                <small>{t("driver.machineYardSelection", { vehicles: selectedYardVehicleIds.length, implements: selectedImplementIds.length })}</small>
              </span>
            </button>
            <button className="driver-yard-open secondary-driver-action" onClick={() => setIsHandoverOpen(true)} type="button">
              <Repeat size={20} />
              <span>{t("driver.driverHandover")}</span>
            </button>
            <button className="driver-yard-open secondary-driver-action" onClick={() => setIsEndShiftOpen(true)} type="button">
              <LogOut size={20} />
              <span>{t("driver.endShift")}</span>
            </button>
          </div>
        </div>

        <div className="driver-scroll-content">
        <div className="driver-overview">
          <div className="driver-overview-head">
            <div>
              <h3>{t("driver.overview")}</h3>
              <span>{t("driver.visibleJobs", { count: accessibleSubtasks.length })}</span>
            </div>
            <button className="secondary-driver-action compact-driver-action" disabled={isLoading} onClick={() => { void refreshData(); }} type="button">
              <Repeat size={18} />
              <span>{isLoading ? t("driver.refreshing") : t("liveLocation.refresh")}</span>
            </button>
          </div>
          {accessibleSubtasks.length === 0 && <p className="driver-slot-note">{t("driver.noVisibleJobs")}</p>}
          {driverTaskGroups.length > 0 && (
            <div className="driver-task-group-list">
              <strong>{t("driver.groupedTasks")}</strong>
              {driverTaskGroups.map((group) => (
                <button
                  className={group.id === selectedTaskGroup?.id ? "driver-task-group-card active" : "driver-task-group-card"}
                  key={group.id}
	                  onClick={() => {
	                    setOpenTaskGroupId(group.id);
	                    setOpenSubtaskId("");
	                  }}
                  type="button"
                >
                  <span>
                    <b>{group.taskName}</b>
                    <small>{t("driver.groupSummary", { jobs: group.jobCount, fields: group.fieldsCount, area: group.areaHa.toFixed(2) })}</small>
                    <small>{t("driver.estimatedTime", { time: formatDriverHours(group.estimatedHours) })}</small>
                  </span>
                  <MapPinned size={18} />
                </button>
              ))}
            </div>
	          )}
          {driverTaskGroups.length > 0 && !selectedTaskGroup && (
            <p className="driver-slot-note">{t("driver.selectTaskFirst")}</p>
          )}
	          {selectedTaskGroup && selectedTaskGroupFields.length > 0 && (
	            <div className="driver-map-section">
	              <DriverTaskGroupMap fields={selectedTaskGroupFields} statusesByFieldId={selectedTaskGroupStatuses} />
              <p className="driver-slot-note">{selectedSubtask ? t("driver.selectedFieldReady") : t("driver.selectFieldForTask")}</p>
	              <div className="driver-group-field-list">
                {selectedTaskGroup.subtasks.map((subtask, routeIndex) => {
                  const job = jobs.find((item) => item.id === subtask.jobId);
                  const task = job?.tasks.find((item) => item.id === subtask.taskId);
                  const estimatedHours = subtask.estimatedHours ?? task?.estimatedHours ?? job?.estimatedHours ?? 0;
                  return (
                    <button
                      className={subtask.id === selectedSubtask?.id ? "active" : ""}
                      key={subtask.id}
                      onClick={() => selectFieldForClaim(subtask)}
                      type="button"
                    >
                      <span>{t("driver.routeStop", { index: routeIndex + 1 })} · {job?.jobNumber ?? subtask.jobId}</span>
                      <strong><FieldName id={subtask.fieldId} /></strong>
                      <span>{t("driver.estimatedTime", { time: formatDriverHours(estimatedHours) })}</span>
                      <StatusBadge status={subtask.status} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {selectedSubtask && visibleSubtasksForSelectedGroup.filter((subtask) => subtask.id === selectedSubtask.id).map((subtask) => {
            const job = jobs.find((item) => item.id === subtask.jobId);
            const task = job?.tasks.find((item) => item.id === subtask.taskId);
            const field = fields.find((item) => item.id === subtask.fieldId);
            const activeCount = subtask.activeDriverIds.length;
            const maxWorkers = task?.maxVehicles ?? 1;
            const estimatedHours = subtask.estimatedHours ?? task?.estimatedHours ?? job?.estimatedHours ?? 0;
            return (
	              <button className={subtask.id === selectedSubtask?.id ? "driver-overview-card active" : "driver-overview-card"} key={subtask.id} onClick={() => {
	                const group = driverTaskGroups.find((item) => item.subtasks.some((groupSubtask) => groupSubtask.id === subtask.id));
	                if (group) setOpenTaskGroupId(group.id);
		                selectFieldForClaim(subtask);
	              }} type="button">
                <div>
                  <div className="driver-job-meta-row">
                    <small>{t("jobs.jobNumberShort")}: {job?.jobNumber ?? subtask.jobId}</small>
                    <small>{job?.customer ?? "-"}</small>
                    <small>{job?.timeWindow || t("createJob.noTimeWindow")}</small>
                  </div>
                  <strong>{task?.name}</strong>
                  <span>{field?.name ?? <FieldName id={subtask.fieldId} />}</span>
                  <span>{t("driver.estimatedTime", { time: formatDriverHours(estimatedHours) })}</span>
                </div>
                <StatusBadge status={subtask.status} />
                <small>{t("driver.vehiclesActive", { mode: task?.mode ? t(`mode.${task.mode}`) : "", active: activeCount, max: maxWorkers, free: Math.max(0, maxWorkers - activeCount) })}</small>
                <span className="open-job-link">{t("driver.openJob")}</span>
              </button>
            );
          })}
        </div>

        {selectedSubtask && (
          <article className="driver-card driver-detail-card">
            {(() => {
              const subtask = selectedSubtask;
              const task = selectedTask;
              const field = selectedField;
              const activeCount = subtask.activeDriverIds.length;
              const maxWorkers = task?.maxVehicles ?? 1;
              const alreadyJoined = isAssignedToDriver(subtask);
              const singleTaken = task?.mode === "Einzelmodus" && activeCount > 0 && !alreadyJoined;
              const canJoin = !alreadyJoined && !singleTaken && activeCount < maxWorkers;
              const freeSlots = Math.max(0, maxWorkers - activeCount);
              const estimatedHours = subtask.estimatedHours ?? task?.estimatedHours ?? jobs.find((job) => job.id === subtask.jobId)?.estimatedHours ?? 0;
              return (
                <>
                <div className="driver-card-head">
                  <div>
                    <button className="secondary-action compact-action" onClick={() => setOpenSubtaskId("")} type="button">
                      <ChevronLeft size={16} /> {t("driver.backToOverview")}
                    </button>
                    <div className="driver-job-meta-row">
                      <small>{t("jobs.jobNumberShort")}: {jobs.find((job) => job.id === subtask.jobId)?.jobNumber ?? subtask.jobId}</small>
                      <small>{jobs.find((job) => job.id === subtask.jobId)?.customer ?? "-"}</small>
                      <small>{jobs.find((job) => job.id === subtask.jobId)?.timeWindow || t("createJob.noTimeWindow")}</small>
                    </div>
                    <strong>{task?.name}</strong>
                    <span><FieldName id={subtask.fieldId} /></span>
                    <span>{t("driver.estimatedTime", { time: formatDriverHours(estimatedHours) })}</span>
                  </div>
                  <StatusBadge status={subtask.status} />
                </div>
                <div className={`driver-current-status ${subtask.status === "Problem" ? "problem" : subtask.status === "erledigt" ? "done" : subtask.status === "pausiert" ? "paused" : subtask.status === "in Arbeit" ? "active" : ""}`}>
                  <span>{t("driver.currentStatus")}</span>
                  <strong>{t(`status.${subtask.status}`)}</strong>
                </div>
                <ProgressBar value={subtask.progress} />
                <p>{t("driver.vehiclesActive", { mode: task?.mode ? t(`mode.${task.mode}`) : "", active: activeCount, max: maxWorkers, free: freeSlots })}</p>
                <button className="secondary-action wide" onClick={() => setOpenSubtaskId(subtask.id)} type="button">
                  <MapPinned size={18} /> {t("actions.openMapRoute")}
                </button>
                <div className="tracking-actions">
                  <button className="secondary-action wide" onClick={() => sendLocation(subtask)} type="button">
                    <Crosshair size={18} /> {t("liveLocation.sendNow")}
                  </button>
                  {trackingSubtaskId === subtask.id ? (
                    <button className="secondary-action wide" onClick={() => setTrackingSubtaskId("")} type="button">
                      <RadioTower size={18} /> {t("liveLocation.stopTracking")}
                    </button>
                  ) : (
                    <button className="driver-main-button" onClick={() => { setTrackingSubtaskId(subtask.id); sendLocation(subtask); }} type="button">
                      <Radio size={20} /> {t("liveLocation.startTracking")}
                    </button>
                  )}
                </div>
                {trackingNotice && noticeSubtaskId === subtask.id && <p className="driver-slot-note">{trackingNotice}</p>}
                {field && openSubtaskId === subtask.id && (
                  <div className="driver-map-section">
                    <DriverFieldMap field={field} status={subtask.status} />
                    <NewHazardForm
                      field={field}
                      subtask={subtask}
                      onReport={(patch) => onUpdateSubtask(subtask.id, patch)}
                    />
                  </div>
                )}
	                {canJoin && (
	                  <button className="driver-main-button" onClick={() => { void confirmFieldClaim(); }} type="button">
	                    {task?.mode === "Einzelmodus" ? <Check size={22} /> : <Plus size={22} />}
	                    {t("driver.claimField")}
	                  </button>
	                )}
                {!canJoin && (
                  <div className="driver-slot-note">
                    {alreadyJoined ? t("driver.alreadyJoined") : t("driver.noSlots")}
                  </div>
                )}
                <div className="driver-actions">
                  <button className={subtask.status === "in Arbeit" ? "active-action" : ""} onClick={() => updateStatusAndSendLocation(subtask, { ...feedbackPatch(subtask, "in Arbeit", 25), note: selectedFeedbackDraft.note.trim() || t("driver.workStarted"), accessOk: undefined })} type="button"><Play size={18} /> {t("actions.start")}</button>
                  <button className={subtask.status === "pausiert" ? "active-action" : ""} onClick={() => updateStatusAndSendLocation(subtask, { ...feedbackPatch(subtask, "pausiert", subtask.progress), note: selectedFeedbackDraft.note.trim() || t("createJob.driverPaused"), accessOk: undefined })} type="button"><Pause size={18} /> {t("actions.pause")}</button>
                  <button className={subtask.status === "teilweise erledigt" ? "active-action" : ""} onClick={() => openCompletionDialog(subtask, "teilweise erledigt")} type="button"><Flag size={18} /> {t("actions.partial")}</button>
	                  <button className={subtask.status === "erledigt" ? "active-action done-action" : ""} onClick={() => openCompletionDialog(subtask, "erledigt")} type="button"><Check size={18} /> {t("actions.complete")}</button>
                </div>
                <div className="driver-inputs">
                  <input
                    accept="image/*"
                    capture="environment"
                    className="visually-hidden-file"
                    multiple
                    onChange={(event) => {
                      handlePhotosSelected(subtask, event.target.files);
                      event.target.value = "";
                    }}
                    ref={fileInputRef}
                    type="file"
                  />
                  <button className="driver-photo-button" onClick={() => fileInputRef.current?.click()} type="button">
                    <Camera size={18} /> {subtask.driverPhotos?.length ? t("driver.photosStored", { count: subtask.driverPhotos.length }) : selectedFeedbackDraft.photoName || t("actions.photo")}
                  </button>
                  {subtask.driverPhotos && subtask.driverPhotos.length > 0 && (
                    <div className="driver-photo-list">
                      {subtask.driverPhotos.map((photo) => (
                        <div className="driver-photo-row" key={photo.id}>
                          <a href={photo.url} rel="noreferrer" target="_blank">
                            {photo.name}
                          </a>
                          <button aria-label={`${t("actions.delete")} ${photo.name}`} onClick={() => void onDeleteSubtaskPhoto(subtask.id, photo.id)} type="button">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                </>
              );
            })()}
	          </article>
	        )}
        </div>
        {isMachineYardOpen && (
          <div className="modal-backdrop" role="presentation">
            <div className="resource-modal driver-yard-modal driver-dialog-modal" role="dialog" aria-modal="true">
              <div className="section-heading">
                <div>
                  <h2>{t("driver.machineYard")}</h2>
                  <p>{t("driver.machineYardHint")}</p>
                </div>
                <button className="secondary-action icon-action" onClick={() => setIsMachineYardOpen(false)} type="button">×</button>
              </div>
              <div className="driver-resource-yard">
                <div className="driver-yard-section">
                  <span>{t("terms.vehicle")}</span>
                  <div className="driver-yard-grid">
                    {availableVehicles.map((vehicle) => {
                      const selected = selectedYardVehicleIds.includes(vehicle.id);
                      const assignment = resourceAssignmentLabel(vehicle.id, "vehicle");
                      const assigned = assignment !== t("driver.resourceAvailable");
                      return (
                        <button className={selected ? "selected" : ""} key={vehicle.id} onClick={() => toggleYardVehicle(vehicle.id)} type="button">
                          <strong>{vehicle.name}</strong>
                          <small>{[vehicle.licensePlate, vehicle.type].filter(Boolean).join(" · ") || t("terms.vehicle")}</small>
                          <small className={assigned ? "yard-status assigned" : "yard-status"}>{assignment}</small>
                        </button>
                      );
                    })}
                    {availableVehicles.length === 0 && <small>{t("driver.noYardVehicles")}</small>}
                  </div>
                </div>
                <div className="driver-yard-section">
                  <span>{t("terms.implement")}</span>
                  <div className="driver-yard-grid">
                    {availableImplements.map((implement) => {
                      const selected = selectedImplementIds.includes(implement.id);
                      const assignment = resourceAssignmentLabel(implement.id, "implement");
                      const assigned = assignment !== t("driver.resourceAvailable");
                      return (
                        <button className={selected ? "selected" : ""} key={implement.id} onClick={() => toggleYardImplement(implement.id)} type="button">
                          <strong>{implement.name}</strong>
                          <small>{implement.type || t("terms.implement")}</small>
                          <small className={assigned ? "yard-status assigned" : "yard-status"}>{assignment}</small>
                        </button>
                      );
                    })}
                    {availableImplements.length === 0 && <small>{t("driver.noYardImplements")}</small>}
                  </div>
                </div>
                <div className="driver-yard-form">
                  <label>
                    <span>{t("driver.equipmentPlacement")}</span>
                    <select value={equipmentPlacement} onChange={(event) => setEquipmentPlacement(event.target.value as EquipmentPlacement)}>
                      <option value="attached">{t("driver.equipmentAttached")}</option>
                      <option value="yard">{t("driver.equipmentInYard")}</option>
                      <option value="field">{t("driver.equipmentAtField")}</option>
                      <option value="defect">{t("driver.equipmentDefect")}</option>
                    </select>
                  </label>
                  <label>
                    <span>{t("driver.equipmentNote")}</span>
                    <textarea onChange={(event) => setEquipmentNote(event.target.value)} placeholder={t("driver.equipmentNotePlaceholder")} value={equipmentNote} />
                  </label>
                  <label className="driver-problem-check">
                    <input checked={equipmentProblem || equipmentPlacement === "defect"} onChange={(event) => setEquipmentProblem(event.target.checked)} type="checkbox" />
                    <span>{t("driver.reportMachineProblem")}</span>
                  </label>
                  {(equipmentProblem || equipmentPlacement === "defect") && (
                    <label>
                      <span>{t("driver.notifyRecipient")}</span>
                      <select value={equipmentProblemRecipient} onChange={(event) => setEquipmentProblemRecipient(event.target.value)}>
                        <option value="workshop">{t("driver.notifyWorkshop")}</option>
                        <option value="dispatcher">{t("driver.notifyDispatcher")}</option>
                        <option value="office">{t("driver.notifyOffice")}</option>
                      </select>
                    </label>
                  )}
                </div>
              </div>
              <div className="modal-actions">
                <button className="secondary-action" onClick={() => setIsMachineYardOpen(false)} type="button">{t("actions.close")}</button>
                <button className="primary-action" onClick={saveEquipmentSelection} type="button">
                  <Check size={16} /> {t("driver.saveEquipmentSelection")}
                </button>
              </div>
            </div>
          </div>
        )}
        {isEndShiftOpen && (
          <div className="modal-backdrop" role="presentation">
            <div className="resource-modal driver-yard-modal driver-dialog-modal" role="dialog" aria-modal="true">
              <div className="section-heading">
                <div>
                  <h2>{t("driver.endShiftTitle")}</h2>
                  <p>{t("driver.endShiftHint")}</p>
                </div>
                <button className="secondary-action icon-action" onClick={() => setIsEndShiftOpen(false)} type="button">×</button>
              </div>
              <div className="driver-yard-form">
                <label>
                  <span>{t("driver.equipmentPlacement")}</span>
                  <select value={equipmentPlacement} onChange={(event) => setEquipmentPlacement(event.target.value as EquipmentPlacement)}>
                    <option value="yard">{t("driver.equipmentInYard")}</option>
                    <option value="attached">{t("driver.equipmentAttached")}</option>
                    <option value="field">{t("driver.equipmentAtField")}</option>
                    <option value="defect">{t("driver.equipmentDefect")}</option>
                  </select>
                </label>
                <label>
                  <span>{t("driver.equipmentNote")}</span>
                  <textarea onChange={(event) => setEquipmentNote(event.target.value)} placeholder={t("driver.shiftEndNotePlaceholder")} value={equipmentNote} />
                </label>
                <label className="driver-problem-check">
                  <input checked={equipmentProblem || equipmentPlacement === "defect"} onChange={(event) => setEquipmentProblem(event.target.checked)} type="checkbox" />
                  <span>{t("driver.reportMachineProblem")}</span>
                </label>
                {(equipmentProblem || equipmentPlacement === "defect") && (
                  <label>
                    <span>{t("driver.notifyRecipient")}</span>
                    <select value={equipmentProblemRecipient} onChange={(event) => setEquipmentProblemRecipient(event.target.value)}>
                      <option value="workshop">{t("driver.notifyWorkshop")}</option>
                      <option value="dispatcher">{t("driver.notifyDispatcher")}</option>
                      <option value="office">{t("driver.notifyOffice")}</option>
                    </select>
                  </label>
                )}
              </div>
              <div className="modal-actions">
                <button className="secondary-action" onClick={() => setIsEndShiftOpen(false)} type="button">{t("actions.cancel")}</button>
                <button className="primary-action" onClick={() => { void confirmEndShift(); }} type="button">
                  <LogOut size={16} /> {t("driver.confirmEndShift")}
                </button>
              </div>
            </div>
          </div>
        )}
        {isHandoverOpen && (
          <div className="modal-backdrop" role="presentation">
            <div className="resource-modal driver-yard-modal driver-dialog-modal" role="dialog" aria-modal="true">
              <div className="section-heading">
                <div>
                  <h2>{t("driver.driverHandoverTitle")}</h2>
                  <p>{t("driver.driverHandoverHint")}</p>
                </div>
                <button className="secondary-action icon-action" onClick={() => setIsHandoverOpen(false)} type="button">×</button>
              </div>
              <div className="driver-yard-form">
                <label>
                  <span>{t("driver.nextDriver")}</span>
                  <select value={handoverDriverId} onChange={(event) => setHandoverDriverId(event.target.value)}>
                    <option value="">{t("driver.selectNextDriver")}</option>
                    {handoverDrivers.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("driver.equipmentPlacement")}</span>
                  <select value={equipmentPlacement} onChange={(event) => setEquipmentPlacement(event.target.value as EquipmentPlacement)}>
                    <option value="attached">{t("driver.equipmentAttached")}</option>
                    <option value="yard">{t("driver.equipmentInYard")}</option>
                    <option value="field">{t("driver.equipmentAtField")}</option>
                    <option value="defect">{t("driver.equipmentDefect")}</option>
                  </select>
                </label>
                <label>
                  <span>{t("driver.handoverNote")}</span>
                  <textarea onChange={(event) => setHandoverNote(event.target.value)} placeholder={t("driver.handoverNotePlaceholder")} value={handoverNote} />
                </label>
                <label className="driver-problem-check">
                  <input checked={equipmentProblem || equipmentPlacement === "defect"} onChange={(event) => setEquipmentProblem(event.target.checked)} type="checkbox" />
                  <span>{t("driver.reportMachineProblem")}</span>
                </label>
                {(equipmentProblem || equipmentPlacement === "defect") && (
                  <label>
                    <span>{t("driver.notifyRecipient")}</span>
                    <select value={equipmentProblemRecipient} onChange={(event) => setEquipmentProblemRecipient(event.target.value)}>
                      <option value="workshop">{t("driver.notifyWorkshop")}</option>
                      <option value="dispatcher">{t("driver.notifyDispatcher")}</option>
                      <option value="office">{t("driver.notifyOffice")}</option>
                    </select>
                  </label>
                )}
              </div>
              <div className="modal-actions">
                <button className="secondary-action" onClick={() => setIsHandoverOpen(false)} type="button">{t("actions.cancel")}</button>
                <button className="primary-action" disabled={!handoverDriverId} onClick={() => { void confirmHandover(); }} type="button">
                  <Repeat size={16} /> {t("driver.confirmHandover")}
                </button>
              </div>
            </div>
          </div>
        )}
        {pendingFieldClaim && (
          <div className="modal-backdrop" role="presentation">
            <div className="resource-modal driver-dialog-modal compact-driver-dialog" role="dialog" aria-modal="true">
              <div className="section-heading">
                <h2>{t("driver.confirmFieldClaimTitle")}</h2>
                <button className="secondary-action icon-action" onClick={() => setPendingFieldClaimId("")} type="button">×</button>
              </div>
              <p>{t("driver.confirmFieldClaimText", { field: pendingFieldClaimField?.name ?? t("fields.unknownField") })}</p>
              <div className="modal-actions">
                <button className="secondary-action" onClick={() => setPendingFieldClaimId("")} type="button">{t("actions.cancel")}</button>
                <button className="primary-action" onClick={() => { void confirmFieldClaim(); }} type="button">
                  <Check size={16} /> {t("driver.claimAndSendLocation")}
                </button>
              </div>
            </div>
          </div>
        )}
        {completionDialog && completionSubtask && (
          <div className="modal-backdrop" role="presentation">
            <div className="resource-modal driver-dialog-modal compact-driver-dialog" role="dialog" aria-modal="true">
              <div className="section-heading">
                <h2>{t(completionDialog.status === "erledigt" ? "driver.completeDialogTitle" : "driver.partialDialogTitle")}</h2>
                <button className="secondary-action icon-action" onClick={() => setCompletionDialog(null)} type="button">×</button>
              </div>
              <p>{t("driver.completionDialogHint", { task: completionTask?.name ?? "" })}</p>
              {(() => {
                const config = feedbackValueConfig(completionTask, completionSubtask);
                return (
                  <div className="driver-yard-form">
                    <label>
                      <span>{config.label}</span>
                      <input
                        inputMode={config.inputMode}
                        onChange={(event) => updateFeedbackDraft(completionSubtask.id, { [config.key]: event.target.value } as Partial<DriverFeedbackDraft>)}
                        placeholder={config.placeholder}
                        value={completionDraft[config.key]}
                      />
                    </label>
                    <label>
                      <span>{t("driver.note")}</span>
                      <textarea onChange={(event) => updateFeedbackDraft(completionSubtask.id, { note: event.target.value })} placeholder={t("driver.notePlaceholder")} value={completionDraft.note} />
                    </label>
                  </div>
                );
              })()}
              <div className="modal-actions">
                <button className="secondary-action" onClick={() => setCompletionDialog(null)} type="button">{t("actions.cancel")}</button>
                <button className="primary-action" onClick={confirmCompletionDialog} type="button">
                  <Check size={16} /> {t(completionDialog.status === "erledigt" ? "actions.complete" : "actions.partial")}
                </button>
              </div>
            </div>
          </div>
        )}
	      </div>
	    </section>
  );
}
