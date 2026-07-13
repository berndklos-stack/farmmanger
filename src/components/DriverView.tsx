import { CalendarDays, Camera, Check, ChevronLeft, Clock3, Cog, Crosshair, Flag, LogOut, Mail, MapPinned, MessageSquare, Pause, Phone, Play, Plus, Printer, Radio, RadioTower, Repeat, Route, Trash2, TriangleAlert, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppData } from "../data/DataContext";
import { claimJobTask } from "../services/tasks";
import { APP_RELEASE_LABEL } from "../lib/appVersion";
import { loadDriverTimeEntries, readDriverTimeEntries, subscribeDriverTimeEntries, type DriverTimeEntry, type DriverTimeEntryKind, writeDriverTimeEntries } from "../lib/driverTimeEntries";
import { loadVacationRequests, readVacationRequests, subscribeVacationRequests, type VacationRequest, writeVacationRequests } from "../lib/vacationRequests";
import type { DriverLocation, Job, Organization, Subtask } from "../types";
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
type TravelDraft = {
  startedAt?: string;
  km: string;
  minutes: string;
};
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

function formatTravelMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0 && rest > 0) return `${hours} h ${rest} min`;
  if (hours > 0) return `${hours} h`;
  return `${rest} min`;
}

function dateInputValue(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function inclusiveVacationDays(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
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
  const { t, i18n } = useTranslation();
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
  const [mapSubtaskId, setMapSubtaskId] = useState("");
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
  const [travelDrafts, setTravelDrafts] = useState<Record<string, TravelDraft>>({});
  const [timeEntries, setTimeEntries] = useState<DriverTimeEntry[]>(() => readDriverTimeEntries());
  const [timeReason, setTimeReason] = useState("repair");
  const [timeNote, setTimeNote] = useState("");
  const [timeActionKind, setTimeActionKind] = useState<DriverTimeEntryKind | null>(null);
  const [vacationRequests, setVacationRequests] = useState<VacationRequest[]>(() => readVacationRequests());
  const [vacationDraft, setVacationDraft] = useState(() => ({ from: dateInputValue(7), to: dateInputValue(7), note: "" }));
  const [isPersonalPageOpen, setIsPersonalPageOpen] = useState(false);
  const [selectedTimeMonth, setSelectedTimeMonth] = useState("");
  const [selectedTimeDay, setSelectedTimeDay] = useState("");
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
    return subscribeVacationRequests(() => setVacationRequests(readVacationRequests()));
  }, []);

  useEffect(() => {
    void loadVacationRequests().then(setVacationRequests);
  }, []);

  useEffect(() => {
    return subscribeDriverTimeEntries(() => setTimeEntries(readDriverTimeEntries()));
  }, []);

  useEffect(() => {
    void loadDriverTimeEntries().then(setTimeEntries);
  }, []);

  useEffect(() => {
    if (openTaskGroupId && !driverTaskGroups.some((group) => group.id === openTaskGroupId)) {
      setOpenTaskGroupId("");
      setOpenSubtaskId("");
      setMapSubtaskId("");
    }
  }, [driverTaskGroups, openTaskGroupId]);
  useEffect(() => {
    if (openSubtaskId && !accessibleSubtasks.some((subtask) => subtask.id === openSubtaskId)) {
      setOpenSubtaskId("");
      setMapSubtaskId("");
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
  const activeTimeEntry = timeEntries.find((entry) => entry.driverId === activeDriver.id && !entry.endedAt);
  const driverTimeEntries = timeEntries.filter((entry) => entry.driverId === activeDriver.id);
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const currentMonthEntries = driverTimeEntries.filter((entry) => entry.startedAt.slice(0, 7) === currentMonthKey);
  const closedMonthEntries = currentMonthEntries.filter((entry) => entry.minutes);
  const monthlyWorkMinutes = closedMonthEntries.filter((entry) => entry.kind === "work" || entry.kind === "interruption").reduce((sum, entry) => sum + (entry.minutes ?? 0), 0);
  const monthlyInterruptionMinutes = closedMonthEntries.filter((entry) => entry.kind === "interruption").reduce((sum, entry) => sum + (entry.minutes ?? 0), 0);
  const ownVacationRequests = vacationRequests.filter((request) => request.driverId === activeDriver.id);
  const requestedVacationDays = ownVacationRequests.filter((request) => request.status !== "rejected").reduce((sum, request) => sum + request.days, 0);
  const vacationAllowance = activeDriver.annualVacationDays ?? 30;
  const vacationUsed = activeDriver.vacationUsedDays ?? 0;
  const vacationRemaining = Math.max(0, vacationAllowance - vacationUsed - requestedVacationDays);
  const monthlyTimeSummary = useMemo(() => {
    const summaries = new Map<string, { month: string; workMinutes: number; interruptionMinutes: number; entries: number }>();
    driverTimeEntries.filter((entry) => entry.endedAt && entry.minutes).forEach((entry) => {
      const month = entry.startedAt.slice(0, 7);
      const summary = summaries.get(month) ?? { month, workMinutes: 0, interruptionMinutes: 0, entries: 0 };
      if (entry.kind === "work" || entry.kind === "interruption") summary.workMinutes += entry.minutes ?? 0;
      if (entry.kind === "interruption") summary.interruptionMinutes += entry.minutes ?? 0;
      summary.entries += 1;
      summaries.set(month, summary);
    });
    return Array.from(summaries.values()).sort((a, b) => b.month.localeCompare(a.month));
  }, [driverTimeEntries]);
  const selectedMonthDaySummaries = useMemo(() => {
    if (!selectedTimeMonth) return [];
    const [year, month] = selectedTimeMonth.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = `${selectedTimeMonth}-${String(index + 1).padStart(2, "0")}`;
      const entries = driverTimeEntries
        .filter((entry) => entry.startedAt.slice(0, 10) === day)
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      const closed = entries.filter((entry) => entry.endedAt && entry.minutes);
      return {
        day,
        entries,
        workMinutes: closed.filter((entry) => entry.kind === "work" || entry.kind === "interruption").reduce((sum, entry) => sum + (entry.minutes ?? 0), 0),
        interruptionMinutes: closed.filter((entry) => entry.kind === "interruption").reduce((sum, entry) => sum + (entry.minutes ?? 0), 0),
        pauseMinutes: closed.filter((entry) => entry.kind === "pause").reduce((sum, entry) => sum + (entry.minutes ?? 0), 0),
      };
    });
  }, [driverTimeEntries, selectedTimeMonth]);
  const selectedDaySummary = selectedMonthDaySummaries.find((summary) => summary.day === selectedTimeDay);
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

  function timeEntryTitle(entry: DriverTimeEntry) {
    return t(entry.kind === "work" ? "driver.workTime" : entry.kind === "pause" ? "driver.pause" : "driver.interruption");
  }

  function timeEntryReason(entry: DriverTimeEntry) {
    return entry.reason ? t(`${entry.kind === "pause" ? "driver.pauseReasons" : "driver.interruptionReasons"}.${entry.reason}`) : "";
  }

  function escapeReportHtml(value: string) {
    return value.replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char] ?? char);
  }

  function timeReportLines(scope: "month" | "day", key: string) {
    const monthSummary = monthlyTimeSummary.find((summary) => summary.month === key);
    const daySummary = selectedMonthDaySummaries.find((summary) => summary.day === key);
    const entries = (scope === "month"
      ? driverTimeEntries.filter((entry) => entry.startedAt.slice(0, 7) === key)
      : driverTimeEntries.filter((entry) => entry.startedAt.slice(0, 10) === key))
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const title = scope === "month"
      ? `${t("driver.monthReport")} ${new Date(`${key}-01T00:00:00`).toLocaleDateString(i18n.language, { month: "long", year: "numeric" })}`
      : `${t("driver.dayReport")} ${new Date(`${key}T00:00:00`).toLocaleDateString(i18n.language, { dateStyle: "full" })}`;
    const summaryLines = scope === "month"
      ? [
          `${t("driver.monthWork")}: ${formatTravelMinutes(monthSummary?.workMinutes ?? 0)}`,
          `${t("driver.monthInterruptions")}: ${formatTravelMinutes(monthSummary?.interruptionMinutes ?? 0)}`,
          `${entries.length} ${t("driver.timeEntries")}`,
        ]
      : [
          `${t("driver.workTime")}: ${formatTravelMinutes(daySummary?.workMinutes ?? 0)}`,
          `${t("driver.interruption")}: ${formatTravelMinutes(daySummary?.interruptionMinutes ?? 0)}`,
          `${t("driver.pause")}: ${formatTravelMinutes(daySummary?.pauseMinutes ?? 0)}`,
          `${entries.length} ${t("driver.timeEntries")}`,
        ];
    const entryLines = entries.map((entry) => {
      const started = new Date(entry.startedAt).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" });
      const ended = entry.endedAt ? new Date(entry.endedAt).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }) : t("driver.running");
      return `${timeEntryTitle(entry)} · ${started}-${ended} · ${entry.minutes ? formatTravelMinutes(entry.minutes) : t("driver.running")}${timeEntryReason(entry) ? ` · ${timeEntryReason(entry)}` : ""}${entry.jobNumber ? ` · ${entry.jobNumber}` : ""}${entry.note ? ` · ${entry.note}` : ""}`;
    });
    return {
      title,
      lines: [
        `Farm-Manager`,
        `${t("driver.employeeData")}: ${activeDriver.name}`,
        ...summaryLines,
        "",
        ...entryLines,
      ],
    };
  }

  function openPrintableTimeReport(scope: "month" | "day", key: string) {
    const report = timeReportLines(scope, key);
    const entries = (scope === "month"
      ? driverTimeEntries.filter((entry) => entry.startedAt.slice(0, 7) === key)
      : driverTimeEntries.filter((entry) => entry.startedAt.slice(0, 10) === key))
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const monthSummary = monthlyTimeSummary.find((summary) => summary.month === key);
    const daySummary = selectedMonthDaySummaries.find((summary) => summary.day === key);
    const periodLabel = scope === "month"
      ? new Date(`${key}-01T00:00:00`).toLocaleDateString(i18n.language, { month: "long", year: "numeric" })
      : new Date(`${key}T00:00:00`).toLocaleDateString(i18n.language, { dateStyle: "full" });
    const workMinutes = scope === "month" ? monthSummary?.workMinutes ?? 0 : daySummary?.workMinutes ?? 0;
    const interruptionMinutes = scope === "month" ? monthSummary?.interruptionMinutes ?? 0 : daySummary?.interruptionMinutes ?? 0;
    const pauseMinutes = scope === "day" ? daySummary?.pauseMinutes ?? 0 : entries.filter((entry) => entry.kind === "pause").reduce((sum, entry) => sum + (entry.minutes ?? 0), 0);
    let lastReportDate = "";
    const entryRows = entries.map((entry) => {
      const startedAt = new Date(entry.startedAt);
      const endedAt = entry.endedAt ? new Date(entry.endedAt) : undefined;
      const reportDate = entry.startedAt.slice(0, 10);
      const daySeparator = scope === "month" && reportDate !== lastReportDate
        ? (() => {
            lastReportDate = reportDate;
            return `<tr class="day-separator"><td colspan="7">${escapeReportHtml(startedAt.toLocaleDateString(i18n.language, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }))}</td></tr>`;
          })()
        : "";
      return `
        ${daySeparator}
        <tr>
          <td>${escapeReportHtml(startedAt.toLocaleDateString(i18n.language))}</td>
          <td>${escapeReportHtml(startedAt.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }))}</td>
          <td>${endedAt ? escapeReportHtml(endedAt.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })) : escapeReportHtml(t("driver.running"))}</td>
          <td>${escapeReportHtml(timeEntryTitle(entry))}</td>
          <td class="numeric">${escapeReportHtml(entry.minutes ? formatTravelMinutes(entry.minutes) : t("driver.running"))}</td>
          <td>${escapeReportHtml(timeEntryReason(entry) || "-")}</td>
          <td>${escapeReportHtml([entry.jobNumber, entry.note].filter(Boolean).join(" · ") || "-")}</td>
        </tr>
      `;
    }).join("");
    const printWindow = window.open("about:blank", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
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
            .meta { color: #52645a; display: grid; font-size: 12px; gap: 4px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .summary { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
            .summary div { border: 1px solid #dbe6dc; border-radius: 8px; padding: 10px; }
            .summary span { color: #617268; display: block; font-size: 11px; font-weight: 700; margin-bottom: 5px; }
            .summary strong { font-size: 17px; }
            table { border-collapse: collapse; font-size: 11px; width: 100%; }
            th { background: #eef6e9; color: #26362c; font-size: 10px; text-align: left; text-transform: uppercase; }
            th, td { border-bottom: 1px solid #dfe8dc; padding: 7px 6px; vertical-align: top; }
            .day-separator td { background: #f4f8f1; border-bottom: 1px solid #cddccc; border-top: 2px solid #2f6f3e; color: #26362c; font-size: 11px; font-weight: 800; padding: 8px 6px; }
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
                <span><b>${escapeReportHtml(t("driver.employeeData"))}:</b> ${escapeReportHtml(activeDriver.name)}</span>
                <span><b>${escapeReportHtml(t("masterData.operationType"))}:</b> ${escapeReportHtml(activeDriver.operationType || "-")}</span>
                <span><b>${escapeReportHtml(t("masterData.assignedOrganization"))}:</b> ${escapeReportHtml(driverOrganization?.name ?? t("masterData.noOrganizationAssigned"))}</span>
                <span><b>Zeitraum:</b> ${escapeReportHtml(periodLabel)}</span>
                <span><b>Erstellt:</b> ${escapeReportHtml(new Date().toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }))}</span>
              </div>
            </section>
            <section class="summary">
              <div><span>${escapeReportHtml(t("driver.workTime"))}</span><strong>${escapeReportHtml(formatTravelMinutes(workMinutes))}</strong></div>
              <div><span>${escapeReportHtml(t("driver.pause"))}</span><strong>${escapeReportHtml(formatTravelMinutes(pauseMinutes))}</strong></div>
              <div><span>${escapeReportHtml(t("driver.interruption"))}</span><strong>${escapeReportHtml(formatTravelMinutes(interruptionMinutes))}</strong></div>
              <div><span>${escapeReportHtml(t("driver.timeEntries"))}</span><strong>${entries.length}</strong></div>
            </section>
            <section>
              <table>
                <thead>
                  <tr><th>Datum</th><th>Start</th><th>Ende</th><th>Art</th><th class="numeric">Dauer</th><th>Grund</th><th>Auftrag / Notiz</th></tr>
                </thead>
                <tbody>${entryRows || `<tr><td colspan="7">${escapeReportHtml(t("driver.noTimeHistory"))}</td></tr>`}</tbody>
              </table>
            </section>
            <section class="signature">
              <div>Mitarbeiter</div>
              <div>Geprüft durch Einsatzleitung</div>
            </section>
          </main>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
  }

  function openMailTimeReport(scope: "month" | "day", key: string) {
    const report = timeReportLines(scope, key);
    window.location.href = `mailto:?subject=${encodeURIComponent(report.title)}&body=${encodeURIComponent(report.lines.join("\n"))}`;
  }

  function openSmsTimeReport(scope: "month" | "day", key: string) {
    const report = timeReportLines(scope, key);
    window.location.href = `sms:?&body=${encodeURIComponent(report.lines.join("\n"))}`;
  }

  function organizationEmergencyContacts(organization?: Organization) {
    const contactRows = organization?.contacts?.filter((contact) => contact.mobile || contact.phone || contact.sms) ?? [];
    const preferredRows = contactRows.filter((contact) => {
      const haystack = [contact.name, contact.role, contact.notes].filter(Boolean).join(" ").toLowerCase();
      return ["notfall", "emergency", "rückfrage", "rueckfrage", "ansprech", "einsatz", "dispo"].some((keyword) => haystack.includes(keyword));
    });
    const rows = preferredRows.length > 0 ? preferredRows : contactRows;
    const seenPhones = new Set<string>();
    const contacts = rows.map((contact) => {
      const phone = contact.mobile || contact.phone || contact.sms || "";
      return {
        id: contact.id,
        label: [contact.name, contact.role].filter(Boolean).join(" · ") || organization?.name || t("driver.noContactData"),
        phone,
      };
    }).filter((contact) => {
      const normalized = contact.phone.replace(/[^\d+]/g, "");
      if (!normalized || seenPhones.has(normalized)) return false;
      seenPhones.add(normalized);
      return true;
    });
    if (contacts.length > 0) return contacts;
    const fallbackPhone = organization?.mobile || organization?.phone || "";
    return fallbackPhone ? [{ id: `${organization?.id ?? "organization"}-fallback`, label: organization?.name ?? t("driver.noContactData"), phone: fallbackPhone }] : [];
  }

  function renderEmergencyContacts(organization?: Organization) {
    const contacts = organizationEmergencyContacts(organization);
    if (contacts.length === 0) return <small>{t("driver.noContactPhone")}</small>;
    return (
      <div className="driver-contact-links">
        {contacts.map((contact) => (
          <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} key={contact.id}>
            <Phone size={16} />
            <span>{contact.label}: {contact.phone}</span>
          </a>
        ))}
      </div>
    );
  }

  function updateTravelDraft(subtaskId: string, patch: Partial<TravelDraft>) {
    setTravelDrafts((current) => ({
      ...current,
      [subtaskId]: { ...(current[subtaskId] ?? { km: "", minutes: "" }), ...patch },
    }));
  }

  function startTravel(subtask: Subtask) {
    const startedAt = new Date().toISOString();
    updateTravelDraft(subtask.id, { startedAt, minutes: "" });
    sendLocation({ ...subtask, status: subtask.status === "offen" ? "reserviert" : subtask.status }, true);
  }

  function saveTravel(subtask: Subtask) {
    const draft = travelDrafts[subtask.id] ?? { km: "", minutes: "" };
    const endedAt = new Date().toISOString();
    const startedAt = draft.startedAt ?? endedAt;
    const elapsedMinutes = Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000));
    const minutes = parseOptionalNumber(draft.minutes) ?? elapsedMinutes;
    const km = parseOptionalNumber(draft.km) ?? 0;
    if (km <= 0 || minutes <= 0) {
      setEquipmentNotice(t("driver.travelMissingValues"));
      return;
    }
    const event = {
      id: crypto.randomUUID(),
      driverId: activeDriver.id,
      driverName: activeDriver.name,
      startedAt,
      endedAt,
      minutes: Math.round(minutes),
      km,
    };
    const message = t("driver.travelEventMessage", {
      driver: activeDriver.name,
      km: km.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      time: formatTravelMinutes(Math.round(minutes)),
      from: new Date(startedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
      to: new Date(endedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
    });
    onUpdateSubtask(subtask.id, {
      travelEvents: [...(subtask.travelEvents ?? []), event],
      statusEvents: [...(subtask.statusEvents ?? []), { id: event.id, message, createdAt: endedAt }],
    });
    updateTravelDraft(subtask.id, { startedAt: undefined, km: "", minutes: "" });
    setEquipmentNotice(t("driver.travelSaved"));
    sendTravelLocationFromSubtask(subtask, true);
  }

  function persistTimeEntries(next: DriverTimeEntry[]) {
    setTimeEntries(next);
    void writeDriverTimeEntries(next).then(setTimeEntries);
  }

  function newTimeEntry(kind: DriverTimeEntryKind, startedAt = new Date().toISOString()): DriverTimeEntry {
    const job = selectedSubtask ? jobs.find((item) => item.id === selectedSubtask.jobId) : undefined;
    return {
      id: crypto.randomUUID(),
      driverId: activeDriver.id,
      driverName: activeDriver.name,
      kind,
      reason: kind === "interruption" || kind === "pause" ? timeReason : undefined,
      note: timeNote.trim() || undefined,
      subtaskId: selectedSubtask?.id,
      jobNumber: job?.jobNumber,
      startedAt,
    };
  }

  function startTimeEntry(kind: DriverTimeEntryKind) {
    if (activeTimeEntry) return;
    persistTimeEntries([newTimeEntry(kind), ...timeEntries]);
    setTimeActionKind(null);
    setTimeNote("");
    setEquipmentNotice(t(kind === "work" ? "driver.timeStarted" : kind === "pause" ? "driver.pauseStarted" : "driver.interruptionStarted"));
  }

  function closeActiveTimeEntry(endedAt: string) {
    if (!activeTimeEntry) return timeEntries;
    const minutes = Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(activeTimeEntry.startedAt).getTime()) / 60000));
    return timeEntries.map((entry) => entry.id === activeTimeEntry.id ? { ...entry, endedAt, minutes } : entry);
  }

  function appendInterruptionEvent(entry: DriverTimeEntry, endedAt: string) {
    if (entry.kind !== "interruption" || !entry.subtaskId) return;
    const minutes = Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(entry.startedAt).getTime()) / 60000));
    const message = t("driver.interruptionEventMessage", {
      reason: t(`driver.interruptionReasons.${entry.reason ?? "other"}`),
      time: formatTravelMinutes(minutes),
      note: entry.note ?? "",
    });
    const subtask = subtasks.find((item) => item.id === entry.subtaskId);
    if (subtask) {
      onUpdateSubtask(subtask.id, {
        statusEvents: [...(subtask.statusEvents ?? []), { id: crypto.randomUUID(), message, createdAt: endedAt }],
      });
    }
  }

  function requestTimeChange(kind: DriverTimeEntryKind) {
    if (kind === "pause") setTimeReason("lunch");
    if (kind === "interruption") setTimeReason("repair");
    setTimeActionKind(kind);
  }

  function confirmTimeChange() {
    if (!timeActionKind) return;
    const endedAt = new Date().toISOString();
    const closedEntries = closeActiveTimeEntry(endedAt);
    if (activeTimeEntry) appendInterruptionEvent(activeTimeEntry, endedAt);
    persistTimeEntries([newTimeEntry(timeActionKind, endedAt), ...closedEntries]);
    setEquipmentNotice(t(timeActionKind === "pause" ? "driver.pauseStarted" : timeActionKind === "interruption" ? "driver.interruptionStarted" : "driver.timeStarted"));
    setTimeActionKind(null);
    setTimeNote("");
  }

  function resumeWork() {
    const endedAt = new Date().toISOString();
    const closedEntries = closeActiveTimeEntry(endedAt);
    if (activeTimeEntry) appendInterruptionEvent(activeTimeEntry, endedAt);
    persistTimeEntries([newTimeEntry("work", endedAt), ...closedEntries]);
    setTimeActionKind(null);
    setTimeNote("");
    setEquipmentNotice(t("driver.timeResumed"));
  }

  function stopTimeEntry() {
    if (!activeTimeEntry) return;
    const endedAt = new Date().toISOString();
    const next = closeActiveTimeEntry(endedAt);
    appendInterruptionEvent(activeTimeEntry, endedAt);
    persistTimeEntries(next);
    setTimeActionKind(null);
    setTimeNote("");
    setEquipmentNotice(t("driver.timeSaved"));
  }

  function persistVacationRequests(next: VacationRequest[]) {
    setVacationRequests(next);
    void writeVacationRequests(next).then(setVacationRequests);
  }

  function submitVacationRequest() {
    const days = inclusiveVacationDays(vacationDraft.from, vacationDraft.to);
    if (days <= 0) {
      setEquipmentNotice(t("driver.vacationInvalid"));
      return;
    }
    const request: VacationRequest = {
      id: crypto.randomUUID(),
      driverId: activeDriver.id,
      driverName: activeDriver.name,
      from: vacationDraft.from,
      to: vacationDraft.to,
      days,
      note: vacationDraft.note.trim() || undefined,
      status: "requested",
      createdAt: new Date().toISOString(),
      history: [{
        id: crypto.randomUUID(),
        action: "submitted",
        actorName: activeDriver.name,
        reason: vacationDraft.note.trim() || undefined,
        createdAt: new Date().toISOString(),
      }],
    };
    persistVacationRequests([request, ...vacationRequests]);
    setVacationDraft({ from: dateInputValue(7), to: dateInputValue(7), note: "" });
    setEquipmentNotice(t("driver.vacationSubmitted"));
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

  function openDriverSubtask(subtask: Subtask) {
    const group = driverTaskGroups.find((item) => item.subtasks.some((groupSubtask) => groupSubtask.id === subtask.id));
    if (group) setOpenTaskGroupId(group.id);
    setPendingFieldClaimId("");
    setOpenSubtaskId(subtask.id);
  }

  async function confirmFieldClaim(subtaskToClaim?: Subtask) {
    const subtask = subtaskToClaim ?? pendingFieldClaim;
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

  function openDriverMap(subtask: Subtask) {
    const field = fields.find((item) => item.id === subtask.fieldId);
    if (!field) {
      setNoticeSubtaskId(subtask.id);
      setTrackingNotice(t("driver.noMapData"));
      return;
    }
    setTrackingNotice("");
    setNoticeSubtaskId("");
    setMapSubtaskId((current) => {
      const next = current === subtask.id ? "" : subtask.id;
      if (next) {
        window.setTimeout(() => {
          document.getElementById(`driver-map-${subtask.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      }
      return next;
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
    setMapSubtaskId("");
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
            <span className="driver-selected-resources">{[driver.resourceType ?? t("masterData.personnel"), driver.operationType].filter(Boolean).join(" · ")}</span>
            <span className="driver-selected-resources">{selectedYardLabel}</span>
            <span className="driver-version-label">Farm-Manager {APP_RELEASE_LABEL}</span>
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
            <button className="driver-yard-open secondary-driver-action" onClick={() => setIsPersonalPageOpen(true)} type="button">
              <UserRound size={20} />
              <span>{t("driver.personalData")}</span>
            </button>
            <button className="driver-yard-open secondary-driver-action" onClick={() => setIsEndShiftOpen(true)} type="button">
              <LogOut size={20} />
              <span>{t("driver.endShift")}</span>
            </button>
          </div>
        </div>

        <div className="driver-scroll-content">
        {isPersonalPageOpen ? (
          <article className="driver-personal-page">
            <div className="driver-card-head">
              <div>
                <button className="secondary-action compact-action" onClick={() => setIsPersonalPageOpen(false)} type="button">
                  <ChevronLeft size={16} /> {t("driver.backToOverview")}
                </button>
                <p className="eyebrow">{t("driver.personalData")}</p>
                <strong>{activeDriver.name}</strong>
                <span>{t("driver.personalPageHint")}</span>
              </div>
              <UserRound size={22} />
            </div>
            <div className="driver-personal-grid">
              <section className="driver-time-card">
                <div className="driver-time-card-head">
                  <div>
                    <strong>{t("driver.employeeData")}</strong>
                    <small>{driverOrganization?.name ?? t("masterData.noOrganizationAssigned")}</small>
                  </div>
                  <UserRound size={18} />
                </div>
                <div className="driver-personal-facts">
                  <span>{t("masterData.mobile")}: <b>{activeDriver.mobile || "-"}</b></span>
                  <span>{t("masterData.email")}: <b>{activeDriver.email || "-"}</b></span>
                  <span>{t("masterData.role")}: <b>{activeDriver.resourceType ?? t("masterData.personnel")}</b></span>
                  <span>{t("masterData.operationType")}: <b>{activeDriver.operationType || "-"}</b></span>
                  <span>{t("masterData.licenseClasses")}: <b>{activeDriver.licenseClasses?.join(", ") || "-"}</b></span>
                  <span>{t("masterData.maxDailyHours")}: <b>{activeDriver.maxDailyHours ?? 8}</b></span>
                </div>
              </section>

              <section className="driver-time-card">
                <div className="driver-time-card-head">
                  <div>
                    <strong>{t("driver.vacation")}</strong>
                    <small>{t("driver.vacationRemaining", { remaining: vacationRemaining, total: vacationAllowance })}</small>
                  </div>
                  <Flag size={18} />
                </div>
                <div className="driver-time-summary">
                  <span>{t("driver.vacationUsed")}: <b>{vacationUsed}</b></span>
                  <span>{t("driver.vacationRequested")}: <b>{requestedVacationDays}</b></span>
                </div>
                <div className="driver-vacation-form">
                  <label><span>{t("driver.vacationFrom")}</span><input value={vacationDraft.from} onChange={(event) => setVacationDraft((current) => ({ ...current, from: event.target.value }))} type="date" /></label>
                  <label><span>{t("driver.vacationTo")}</span><input value={vacationDraft.to} onChange={(event) => setVacationDraft((current) => ({ ...current, to: event.target.value }))} type="date" /></label>
                  <input placeholder={t("driver.vacationNotePlaceholder")} value={vacationDraft.note} onChange={(event) => setVacationDraft((current) => ({ ...current, note: event.target.value }))} />
                  <button className="secondary-action wide" onClick={submitVacationRequest} type="button"><Plus size={18} /> {t("driver.submitVacation")}</button>
                </div>
              </section>
            </div>

            <section className="driver-time-card">
              <div className="driver-time-card-head">
                <div>
                  <strong>{t("driver.timeByMonth")}</strong>
                  <small>{t("driver.timeByMonthHint")}</small>
                </div>
                <CalendarDays size={18} />
              </div>
              {monthlyTimeSummary.length > 0 ? (
                <div className="driver-month-list">
                  {monthlyTimeSummary.map((summary) => (
                    <button
                      className={selectedTimeMonth === summary.month ? "driver-month-row active" : "driver-month-row"}
                      key={summary.month}
                      onClick={() => {
                        setSelectedTimeMonth((current) => current === summary.month ? "" : summary.month);
                        setSelectedTimeDay("");
                      }}
                      type="button"
                    >
                      <strong>{new Date(`${summary.month}-01T00:00:00`).toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</strong>
                      <span>{t("driver.monthWork")}: <b>{formatTravelMinutes(summary.workMinutes)}</b></span>
                      <span>{t("driver.monthInterruptions")}: <b>{formatTravelMinutes(summary.interruptionMinutes)}</b></span>
                      <small>{summary.entries} {t("driver.timeEntries")}</small>
                    </button>
                  ))}
                  {selectedTimeMonth && (
                    <div className="driver-time-drilldown">
                      <div className="driver-time-drilldown-head">
                        <div>
                          <strong>{new Date(`${selectedTimeMonth}-01T00:00:00`).toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</strong>
                          <small>{t("driver.monthDayOverview")}</small>
                        </div>
                        <div className="driver-report-actions">
                          <button onClick={() => openPrintableTimeReport("month", selectedTimeMonth)} type="button"><Printer size={16} /> {t("driver.exportPdf")}</button>
                          <button onClick={() => openMailTimeReport("month", selectedTimeMonth)} type="button"><Mail size={16} /> {t("driver.sendMail")}</button>
                          <button onClick={() => openSmsTimeReport("month", selectedTimeMonth)} type="button"><MessageSquare size={16} /> {t("driver.sendSms")}</button>
                        </div>
                      </div>
                      <div className="driver-day-list">
                        {selectedMonthDaySummaries.map((day) => (
                          <button
                            className={selectedTimeDay === day.day ? "driver-day-row active" : "driver-day-row"}
                            key={day.day}
                            onClick={() => setSelectedTimeDay((current) => current === day.day ? "" : day.day)}
                            type="button"
                          >
                            <strong>{new Date(`${day.day}T00:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}</strong>
                            <span>{t("driver.workTime")}: <b>{formatTravelMinutes(day.workMinutes)}</b></span>
                            <span>{t("driver.pause")}: <b>{formatTravelMinutes(day.pauseMinutes)}</b></span>
                            <small>{day.entries.length} {t("driver.timeEntries")}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="driver-slot-note">{t("driver.noTimeHistory")}</p>
              )}
            </section>

            {selectedDaySummary && (
              <div className="modal-backdrop" role="presentation">
                <div className="driver-dialog-modal driver-day-dialog" role="dialog" aria-modal="true" aria-labelledby="driver-day-report-title">
                  <div className="section-heading">
                    <div>
                      <h2 id="driver-day-report-title">{t("driver.dayReport")} · {new Date(`${selectedDaySummary.day}T00:00:00`).toLocaleDateString("de-DE", { dateStyle: "full" })}</h2>
                      <p>{t("driver.workTime")}: {formatTravelMinutes(selectedDaySummary.workMinutes)} · {t("driver.pause")}: {formatTravelMinutes(selectedDaySummary.pauseMinutes)} · {t("driver.interruption")}: {formatTravelMinutes(selectedDaySummary.interruptionMinutes)}</p>
                    </div>
                    <button className="secondary-action icon-action" onClick={() => setSelectedTimeDay("")} type="button">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="driver-report-actions">
                    <button onClick={() => openPrintableTimeReport("day", selectedDaySummary.day)} type="button"><Printer size={16} /> {t("driver.exportPdf")}</button>
                    <button onClick={() => openMailTimeReport("day", selectedDaySummary.day)} type="button"><Mail size={16} /> {t("driver.sendMail")}</button>
                    <button onClick={() => openSmsTimeReport("day", selectedDaySummary.day)} type="button"><MessageSquare size={16} /> {t("driver.sendSms")}</button>
                  </div>
                  {selectedDaySummary.entries.length > 0 ? (
                    <div className="driver-time-entry-list">
                      {selectedDaySummary.entries.map((entry) => (
                        <div className={`driver-time-entry-row ${entry.kind}`} key={entry.id}>
                          <strong>{timeEntryTitle(entry)}</strong>
                          <span>{new Date(entry.startedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}{entry.endedAt ? `-${new Date(entry.endedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : ` · ${t("driver.running")}`}</span>
                          <span>{entry.minutes ? formatTravelMinutes(entry.minutes) : t("driver.running")}</span>
                          {entry.reason && <small>{timeEntryReason(entry)}</small>}
                          {entry.jobNumber && <small>{entry.jobNumber}</small>}
                          {entry.note && <small>{entry.note}</small>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="driver-slot-note">{t("driver.noTimeEntriesForDay")}</p>
                  )}
                </div>
              </div>
            )}

            <section className="driver-time-card">
              <div className="driver-time-card-head">
                <div>
                  <strong>{t("driver.vacationRequests")}</strong>
                  <small>{ownVacationRequests.length} {t("driver.requests")}</small>
                </div>
                <Flag size={18} />
              </div>
              {ownVacationRequests.length > 0 ? (
                <div className="driver-time-log">
                  {ownVacationRequests.map((request) => (
                    <small key={request.id}>
                      {request.from}-{request.to} · {request.days} {t("driver.days")} · {t(`driver.vacationStatus.${request.status}`)}{request.note ? ` · ${request.note}` : ""}
                      {request.decidedAt ? ` · ${t("vacationApproval.decidedAt", { time: new Date(request.decidedAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) })}` : ""}
                      {request.decisionReason ? ` · ${t("vacationApproval.reason")}: ${request.decisionReason}` : ""}
                    </small>
                  ))}
                </div>
              ) : (
                <p className="driver-slot-note">{t("driver.noVacationRequests")}</p>
              )}
            </section>
          </article>
        ) : (
        <>
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
          <div className="driver-time-grid">
            <section className="driver-time-card driver-time-card-compact">
              <div className="driver-time-card-head">
                <div>
                  <strong>{t("driver.timeTracking")}</strong>
                  <small>{activeTimeEntry ? t(activeTimeEntry.kind === "work" ? "driver.timeRunning" : activeTimeEntry.kind === "pause" ? "driver.pauseRunning" : "driver.interruptionRunning", { since: new Date(activeTimeEntry.startedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) }) : t("driver.timeReady")}</small>
                </div>
                <Clock3 size={18} />
              </div>
              <div className={`driver-time-status ${activeTimeEntry?.kind ?? "idle"}`}>
                <span>{t("driver.currentTimeStatus")}</span>
                <strong>{t(activeTimeEntry ? `driver.timeStatus.${activeTimeEntry.kind}` : "driver.timeStatus.idle")}</strong>
              </div>
              <div className="driver-time-summary">
                <span>{t("driver.monthWork")}: <b>{formatTravelMinutes(monthlyWorkMinutes)}</b></span>
                <span>{t("driver.monthInterruptions")}: <b>{formatTravelMinutes(monthlyInterruptionMinutes)}</b></span>
              </div>
              {timeActionKind && (
                <div className="driver-time-form driver-time-reason-form">
                  <label>
                    <span>{t(timeActionKind === "pause" ? "driver.selectPauseReason" : "driver.selectInterruptionReason")}</span>
                    <select value={timeReason} onChange={(event) => setTimeReason(event.target.value)}>
                      {timeActionKind === "pause" ? (
                        <>
                          <option value="lunch">{t("driver.pauseReasons.lunch")}</option>
                          <option value="break">{t("driver.pauseReasons.break")}</option>
                          <option value="private">{t("driver.pauseReasons.private")}</option>
                          <option value="other">{t("driver.pauseReasons.other")}</option>
                        </>
                      ) : (
                        <>
                          <option value="repair">{t("driver.interruptionReasons.repair")}</option>
                          <option value="maintenance">{t("driver.interruptionReasons.maintenance")}</option>
                          <option value="waiting">{t("driver.interruptionReasons.waiting")}</option>
                          <option value="warehouse">{t("driver.interruptionReasons.warehouse")}</option>
                          <option value="other">{t("driver.interruptionReasons.other")}</option>
                        </>
                      )}
                    </select>
                  </label>
                  <input placeholder={t("driver.timeNotePlaceholder")} value={timeNote} onChange={(event) => setTimeNote(event.target.value)} />
                  <button className="driver-main-button" onClick={confirmTimeChange} type="button">
                    <Check size={18} /> {t(timeActionKind === "pause" ? "driver.confirmPause" : "driver.confirmInterruption")}
                  </button>
                  <button className="secondary-action wide" onClick={() => setTimeActionKind(null)} type="button">
                    {t("actions.cancel")}
                  </button>
                </div>
              )}
              <div className="tracking-actions">
                {!activeTimeEntry ? (
                  <button className="driver-main-button" onClick={() => startTimeEntry("work")} type="button"><Play size={18} /> {t("driver.startWorkTime")}</button>
                ) : activeTimeEntry.kind === "work" ? (
                  <>
                    <button className="secondary-action wide" onClick={() => requestTimeChange("pause")} type="button"><Pause size={18} /> {t("driver.startPause")}</button>
                    <button className="secondary-action wide" onClick={() => requestTimeChange("interruption")} type="button"><TriangleAlert size={18} /> {t("driver.startInterruption")}</button>
                    <button className="driver-main-button" onClick={stopTimeEntry} type="button"><Check size={18} /> {t("driver.endWorkTime")}</button>
                  </>
                ) : (
                  <button className="driver-main-button" onClick={resumeWork} type="button"><Play size={18} /> {t("driver.resumeWork")}</button>
                )}
              </div>
              {closedMonthEntries.length > 0 && (
                <div className="driver-time-log">
                  {closedMonthEntries.slice(0, 4).map((entry) => (
                    <small key={entry.id}>
                      {t(entry.kind === "work" ? "driver.workTime" : entry.kind === "pause" ? "driver.pause" : "driver.interruption")} · {formatTravelMinutes(entry.minutes ?? 0)}
                      {entry.reason ? ` · ${t(`${entry.kind === "pause" ? "driver.pauseReasons" : "driver.interruptionReasons"}.${entry.reason}`)}` : ""}
                      {entry.jobNumber ? ` · ${entry.jobNumber}` : ""}
                    </small>
                  ))}
                </div>
              )}
            </section>
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
	                    setMapSubtaskId("");
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
                      onClick={() => openDriverSubtask(subtask)}
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
        </div>

        {selectedSubtask && (
          <article className="driver-card driver-detail-card">
            {(() => {
              const subtask = selectedSubtask;
              const task = selectedTask;
              const field = selectedField;
              const job = jobs.find((item) => item.id === subtask.jobId);
              const farmerOrganization = organizations.find((organization) => organization.id === job?.farmerOrganizationId);
              const contractorOrganization = organizations.find((organization) => organization.id === job?.contractorOrganizationId);
              const travelDraft = travelDrafts[subtask.id] ?? { km: "", minutes: "" };
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
                    <button className="secondary-action compact-action" onClick={() => { setOpenSubtaskId(""); setMapSubtaskId(""); }} type="button">
                      <ChevronLeft size={16} /> {t("driver.backToOverview")}
                    </button>
                    <div className="driver-job-meta-row">
                      <small>{t("jobs.jobNumberShort")}: {job?.jobNumber ?? subtask.jobId}</small>
                      <small>{job?.customer ?? "-"}</small>
                      <small>{job?.timeWindow || t("createJob.noTimeWindow")}</small>
                    </div>
                    <strong>{task?.name}</strong>
                    <span><FieldName id={subtask.fieldId} /></span>
                    <span>{t("driver.estimatedTime", { time: formatDriverHours(estimatedHours) })}</span>
                  </div>
                </div>
                <div className="driver-contact-grid">
                  <div className="driver-contact-card">
                    <span>{t("driver.customerContact")}</span>
                    {renderEmergencyContacts(farmerOrganization)}
                  </div>
                  <div className="driver-contact-card">
                    <span>{t("driver.contractorContact")}</span>
                    {renderEmergencyContacts(contractorOrganization)}
                  </div>
                </div>
                <div className={`driver-current-status ${subtask.status === "Problem" ? "problem" : subtask.status === "erledigt" ? "done" : subtask.status === "pausiert" ? "paused" : subtask.status === "in Arbeit" ? "active" : ""}`}>
                  <span>{t("driver.currentStatus")}</span>
                  <strong>{t(`status.${subtask.status}`)}</strong>
                </div>
                <ProgressBar value={subtask.progress} />
                <p>{t("driver.vehiclesActive", { mode: task?.mode ? t(`mode.${task.mode}`) : "", active: activeCount, max: maxWorkers, free: freeSlots })}</p>
                <button className="driver-main-button wide" onClick={() => openDriverMap(subtask)} type="button">
                  <MapPinned size={18} /> {mapSubtaskId === subtask.id ? t("driver.hideMapRoute") : t("actions.openMapRoute")}
                </button>
                <details className="driver-live-location-panel">
                  <summary>
                    <RadioTower size={16} />
                    <span>{t("liveLocation.driverPanelTitle")}</span>
                  </summary>
                  <div className="tracking-actions compact-tracking-actions">
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
                </details>
                {trackingNotice && noticeSubtaskId === subtask.id && <p className="driver-slot-note">{trackingNotice}</p>}
                <div className="driver-travel-box">
                  <div>
                    <Route size={18} />
                    <strong>{t("driver.travelTitle")}</strong>
                    {travelDraft.startedAt && <small>{t("driver.travelStartedAt", { time: new Date(travelDraft.startedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) })}</small>}
                  </div>
                  <div className="driver-travel-fields">
                    <label>
                      <span>{t("driver.travelKm")}</span>
                      <input inputMode="decimal" placeholder="0,0" value={travelDraft.km} onChange={(event) => updateTravelDraft(subtask.id, { km: event.target.value })} />
                    </label>
                    <label>
                      <span>{t("driver.travelMinutes")}</span>
                      <input inputMode="numeric" placeholder={travelDraft.startedAt ? t("driver.travelAutoTime") : "0"} value={travelDraft.minutes} onChange={(event) => updateTravelDraft(subtask.id, { minutes: event.target.value })} />
                    </label>
                  </div>
                  <div className="tracking-actions">
                    <button className="secondary-action wide" onClick={() => startTravel(subtask)} type="button">
                      <Clock3 size={18} /> {travelDraft.startedAt ? t("driver.travelRestart") : t("driver.travelStart")}
                    </button>
                    <button className="driver-main-button" onClick={() => saveTravel(subtask)} type="button">
                      <Check size={18} /> {t("driver.travelSave")}
                    </button>
                  </div>
                  {(subtask.travelEvents?.length ?? 0) > 0 && (
                    <div className="driver-travel-log">
                      {subtask.travelEvents?.slice(-3).reverse().map((event) => (
                        <small key={event.id}>{event.km.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km · {formatTravelMinutes(event.minutes)} · {new Date(event.endedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</small>
                      ))}
                    </div>
                  )}
                </div>
                {field && mapSubtaskId === subtask.id && (
                  <div className="driver-map-section" id={`driver-map-${subtask.id}`}>
                    <DriverFieldMap field={field} />
                    <NewHazardForm
                      field={field}
                      subtask={subtask}
                      onReport={(patch) => onUpdateSubtask(subtask.id, patch)}
                    />
                  </div>
                )}
	                {canJoin && (
	                  <button className="driver-main-button" onClick={() => { void confirmFieldClaim(subtask); }} type="button">
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
        </>
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
