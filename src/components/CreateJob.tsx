import { AlertTriangle, CheckCircle2, Plus, Save, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppData } from "../data/DataContext";
import { formatArea } from "../i18n/format";
import type { Job, Subtask, Task, TaskTemplate } from "../types";
import { getFieldGeoChecks } from "../utils/geo";
import { FieldSelectionMap } from "./FieldSelectionMap";

type CreateJobTemplate = {
  job: Job;
};

const taskBillingMarker = "FM_TASK_BILLING:";
const serviceLocationMarker = "FM_SERVICE_LOCATION:";

function stripMarkerBlock(value: string | undefined, marker: string) {
  const raw = value ?? "";
  const markerIndex = raw.indexOf(marker);
  const visibleText = markerIndex >= 0 ? raw.slice(0, markerIndex) : raw;
  return visibleText
    .split("\n")
    .filter((line) => !line.trim().startsWith(marker))
    .join("\n")
    .trim();
}

function visibleResourceHint(value: string | undefined) {
  return stripMarkerBlock(value, taskBillingMarker);
}

function withMarkerJson(value: string | undefined, marker: string, data: unknown) {
  const base = stripMarkerBlock(value, marker);
  return [base, `${marker}${JSON.stringify(data)}`].filter(Boolean).join("\n");
}

function numberFromForm(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function serviceLocationFromNotes(value: string | undefined) {
  const line = (value ?? "").split("\n").find((item) => item.startsWith(serviceLocationMarker));
  if (!line) return undefined;
  try {
    return JSON.parse(line.slice(serviceLocationMarker.length)) as Job["serviceLocation"];
  } catch {
    return undefined;
  }
}

function parseTemplateTimeWindow(value: string) {
  const dateMatch = value.match(/(\d{4}-\d{2}-\d{2})/);
  const timeMatch = value.match(/(\d{2}:\d{2}|--:--)-(\d{2}:\d{2}|--:--)/);
  const dateMode: "wish" | "fixed" | "" = value.includes("Fixtermin") || value.includes("Fixed") || value.includes("Fast") ? "fixed" : dateMatch ? "wish" : "";
  return {
    dateMode,
    requestedDate: dateMatch?.[1] ?? "",
    requestedStartTime: timeMatch?.[1] && timeMatch[1] !== "--:--" ? timeMatch[1] : "",
    requestedEndTime: timeMatch?.[2] && timeMatch[2] !== "--:--" ? timeMatch[2] : "",
  };
}

export function CreateJob({
  initialTemplate,
  onSave,
  onSaved,
}: {
  initialTemplate?: CreateJobTemplate | null;
  onSave: (job: Job, subtasks: Subtask[]) => void;
  onSaved?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { addTaskTemplate, authProfile, currentRole, fields, jobTypes, organizations, organizationRelationships, permissions, taskTemplates } = useAppData();
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [jobScope, setJobScope] = useState<"field" | "service">("field");
  const [selectedFarmerOrganizationId, setSelectedFarmerOrganizationId] = useState("");
  const [selectedContractorOrganizationId, setSelectedContractorOrganizationId] = useState("");
  const [fieldSearch, setFieldSearch] = useState("");
  const [selectedJobTypeId, setSelectedJobTypeId] = useState("");
  const [taskToAdd, setTaskToAdd] = useState("");
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [jobTitle, setJobTitle] = useState("");
  const [jobNotes, setJobNotes] = useState("");
  const [dateMode, setDateMode] = useState<"wish" | "fixed" | "">("");
  const [requestedDate, setRequestedDate] = useState("");
  const [requestedStartTime, setRequestedStartTime] = useState("");
  const [requestedEndTime, setRequestedEndTime] = useState("");
  const [priority, setPriority] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [serviceAddress, setServiceAddress] = useState("");
  const [serviceLat, setServiceLat] = useState("");
  const [serviceLng, setServiceLng] = useState("");
  const [showQuickTaskForm, setShowQuickTaskForm] = useState(false);
  const [quickTaskForm, setQuickTaskForm] = useState({
    name: "",
    billingUnit: "hour" as NonNullable<TaskTemplate["billingUnit"]>,
    unit: "h",
    standardPrice: "",
    standardPriceCurrency: "SEK",
    resourceHint: "",
    requiredDrivers: 1,
    requiredVehicles: 1,
    requiredImplements: 0,
  });
  const lastFilteredFarmerOrganizationId = useRef("");
  const selectedJobType = jobTypes.find((jobType) => jobType.id === selectedJobTypeId);
  const activeRelationshipPartnerIds = useMemo(() => {
    const ids = new Set<string>();
    if (!authProfile?.organizationId) return ids;
    organizationRelationships
      .filter((relationship) => relationship.status === "active")
      .forEach((relationship) => {
        if (relationship.farmerOrganizationId === authProfile.organizationId) ids.add(relationship.contractorOrganizationId);
        if (relationship.contractorOrganizationId === authProfile.organizationId) ids.add(relationship.farmerOrganizationId);
      });
    return ids;
  }, [authProfile?.organizationId, organizationRelationships]);
  const farmerOrganizations = organizations.filter((organization) => (
    organization.kind === "farmer"
    && !organization.archivedAt
    && (
      !(currentRole === "farmer_admin" || currentRole === "farmer_employee")
      || !authProfile?.organizationId
      || organization.id === authProfile.organizationId
    )
    && (
      currentRole !== "contractor_admin"
      || !authProfile?.organizationId
      || organization.id === authProfile.organizationId
      || activeRelationshipPartnerIds.has(organization.id)
    )
  ));
  const contractorOrganizations = organizations.filter((organization) => (
    !organization.archivedAt
    && organization.kind === "contractor"
    && (
      currentRole !== "farmer_admin"
      || !authProfile?.organizationId
      || organization.id === authProfile.organizationId
      || activeRelationshipPartnerIds.has(organization.id)
    )
  ));
  const selectedFarmerOrganization = farmerOrganizations.find((organization) => organization.id === selectedFarmerOrganizationId);
  const selectedContractorOrganization = contractorOrganizations.find((organization) => organization.id === selectedContractorOrganizationId);
  const selectedTaskOptions = selectedTasks
    .map((taskId) => taskTemplates.find((task) => task.id === taskId))
    .filter((task): task is TaskTemplate => Boolean(task));
  const taskCount = (selectedJobType?.tasks.length ?? 0) + selectedTaskOptions.length;
  const templateTaskCount = initialTemplate?.job.tasks.length ?? 0;
  const dateLabel = dateMode === "fixed" ? t("createJob.fixedDate") : t("createJob.requestedDate");
  const plannedTimeWindow = dateMode && requestedDate ? `${dateLabel}: ${requestedDate}${requestedStartTime || requestedEndTime ? `, ${requestedStartTime || "--:--"}-${requestedEndTime || "--:--"}` : ""}` : "";
  const fieldsForSelectedFarmer = useMemo(() => (
    selectedFarmerOrganizationId
      ? fields.filter((field) => field.organizationId === selectedFarmerOrganizationId && !field.archivedAt)
      : []
  ), [fields, selectedFarmerOrganizationId]);
  const selectedAreaHa = selectedFields.reduce((sum, fieldId) => sum + (fieldsForSelectedFarmer.find((field) => field.id === fieldId)?.areaHa ?? 0), 0);
  const templateTasksFallback = initialTemplate && taskCount === 0 ? initialTemplate.job.tasks : [];
  const plannedTasks = [
    ...(selectedJobType?.tasks ?? []),
    ...selectedTaskOptions.map((taskOption) => ({
      id: taskOption.id,
      name: taskOption.name,
      timePerHa: taskOption.timePerHa,
    })),
    ...templateTasksFallback,
  ];
  const calculatedEstimatedHours = Math.ceil(plannedTasks.reduce((sum, task) => sum + selectedAreaHa * (task.timePerHa ?? 0), 0) * 2) / 2;
  const normalizedFieldSearch = fieldSearch.trim().toLowerCase();
  const visibleFields = normalizedFieldSearch
    ? fieldsForSelectedFarmer.filter((field) =>
        [field.name, field.crop, field.accessPoint.label]
          .some((value) => value.toLowerCase().includes(normalizedFieldSearch)),
      )
    : fieldsForSelectedFarmer;
  const selectedFieldSet = useMemo(() => new Set(selectedFields), [selectedFields]);
  const allFieldsSelected = fieldsForSelectedFarmer.length > 0 && fieldsForSelectedFarmer.every((field) => selectedFieldSet.has(field.id));
  const allVisibleFieldsSelected = visibleFields.length > 0 && visibleFields.every((field) => selectedFieldSet.has(field.id));

  useEffect(() => {
    if ((currentRole === "farmer_admin" || currentRole === "farmer_employee") && authProfile?.organizationId) {
      setSelectedFarmerOrganizationId(authProfile.organizationId);
    }
  }, [authProfile?.organizationId, currentRole]);

  useEffect(() => {
    if (lastFilteredFarmerOrganizationId.current === selectedFarmerOrganizationId) return;
    lastFilteredFarmerOrganizationId.current = selectedFarmerOrganizationId;
    setSelectedFields((current) => current.filter((fieldId) => fieldsForSelectedFarmer.some((field) => field.id === fieldId)));
  }, [fieldsForSelectedFarmer, selectedFarmerOrganizationId]);

  useEffect(() => {
    if (!initialTemplate) return;
    const sourceJob = initialTemplate.job;
    const parsedTimeWindow = parseTemplateTimeWindow(sourceJob.timeWindow);
    const matchingTaskTemplateIds = sourceJob.tasks
      .map((task) => taskTemplates.find((template) => template.name === task.name)?.id)
      .filter((taskId): taskId is string => Boolean(taskId));
    setSelectedFields(sourceJob.fieldIds);
    setJobScope(sourceJob.fieldIds.length > 0 ? "field" : "service");
    setSelectedFarmerOrganizationId(sourceJob.farmerOrganizationId ?? "");
    setSelectedContractorOrganizationId(sourceJob.contractorOrganizationId ?? "");
    setSelectedJobTypeId(sourceJob.jobTypeId && jobTypes.some((jobType) => jobType.id === sourceJob.jobTypeId) ? sourceJob.jobTypeId : "");
    setSelectedTasks(Array.from(new Set(matchingTaskTemplateIds)));
    setJobTitle(`${sourceJob.title} Kopie`);
    setJobNotes(sourceJob.notes);
    setDateMode(parsedTimeWindow.dateMode);
    setRequestedDate(parsedTimeWindow.requestedDate);
    setRequestedStartTime(parsedTimeWindow.requestedStartTime);
    setRequestedEndTime(parsedTimeWindow.requestedEndTime);
    setPriority(sourceJob.priority ?? "");
    const sourceServiceLocation = sourceJob.serviceLocation ?? serviceLocationFromNotes(sourceJob.notes);
    setServiceAddress(sourceServiceLocation?.address ?? "");
    setServiceLat(sourceServiceLocation?.lat !== undefined ? String(sourceServiceLocation.lat) : "");
    setServiceLng(sourceServiceLocation?.lng !== undefined ? String(sourceServiceLocation.lng) : "");
    setFieldSearch("");
    setTaskToAdd("");
    setSavedNotice("");
    setShowQuickTaskForm(false);
  }, [initialTemplate, jobTypes, taskTemplates]);

  function addSelectedTask() {
    if (!taskToAdd) return;
    setSelectedTasks((current) => current.includes(taskToAdd) ? current : [...current, taskToAdd]);
  }

  function removeSelectedTask(taskValue: string) {
    setSelectedTasks((current) => current.filter((item) => item !== taskValue));
  }

  function addQuickTask() {
    const taskName = quickTaskForm.name.trim();
    if (!taskName) {
      setSavedNotice(t("createJob.quickTaskMissingName"));
      return;
    }
    const ownerOrganizationId = authProfile?.organizationId || selectedContractorOrganizationId || selectedFarmerOrganizationId || undefined;
    const existingTask = taskTemplates.find((task) => (
      task.name.trim().toLowerCase() === taskName.toLowerCase()
      && (!ownerOrganizationId || task.organizationId === ownerOrganizationId)
    ));
    if (existingTask) {
      setSelectedTasks((current) => current.includes(existingTask.id) ? current : [...current, existingTask.id]);
      setTaskToAdd("");
      setSavedNotice(t("createJob.quickTaskAlreadyExists"));
      return;
    }
    const price = numberFromForm(quickTaskForm.standardPrice);
    const validFrom = new Date().toISOString().slice(0, 10);
    const progressMetric = quickTaskForm.billingUnit === "ha"
      ? "Fläche"
      : quickTaskForm.billingUnit === "trip"
        ? "Fuhren"
        : quickTaskForm.billingUnit === "quantity"
          ? "Menge"
          : "Zeit";
    const quickTask: TaskTemplate = {
      id: crypto.randomUUID(),
      organizationId: ownerOrganizationId,
      isSystemTemplate: false,
      templateOwnerType: "organization",
      createdByAdmin: currentRole === "support_admin",
      name: taskName,
      workSteps: [taskName],
      timePerHa: 0,
      mode: "Einzelmodus",
      maxVehicles: Math.max(quickTaskForm.requiredVehicles, 1),
      progressMetric,
      requiredDrivers: quickTaskForm.requiredDrivers,
      requiredVehicles: quickTaskForm.requiredVehicles,
      requiredImplements: quickTaskForm.requiredImplements,
      resourceHint: withMarkerJson(quickTaskForm.resourceHint.trim(), taskBillingMarker, {
        billingUnit: quickTaskForm.billingUnit,
        price,
        currency: quickTaskForm.standardPriceCurrency || "SEK",
        validFrom,
      }),
      unit: quickTaskForm.unit.trim() || (quickTaskForm.billingUnit === "hour" ? "h" : quickTaskForm.billingUnit),
      billingUnit: quickTaskForm.billingUnit,
      standardPrice: price,
      standardPriceCurrency: quickTaskForm.standardPriceCurrency || "SEK",
      standardPriceValidFrom: validFrom,
    };
    addTaskTemplate(quickTask);
    setSelectedTasks((current) => current.includes(quickTask.id) ? current : [...current, quickTask.id]);
    setTaskToAdd("");
    setQuickTaskForm({
      name: "",
      billingUnit: "hour",
      unit: "h",
      standardPrice: "",
      standardPriceCurrency: "SEK",
      resourceHint: "",
      requiredDrivers: 1,
      requiredVehicles: 1,
      requiredImplements: 0,
    });
    setShowQuickTaskForm(false);
    setSavedNotice(t("createJob.quickTaskSaved"));
  }

  function toggleSelectedField(fieldId: string) {
    if (!fieldsForSelectedFarmer.some((field) => field.id === fieldId)) return;
    setSelectedFields((current) => current.includes(fieldId) ? current.filter((item) => item !== fieldId) : [...current, fieldId]);
  }

  function selectAllFields() {
    setSelectedFields(fieldsForSelectedFarmer.map((field) => field.id));
  }

  function selectVisibleFields() {
    setSelectedFields((current) => Array.from(new Set([...current, ...visibleFields.map((field) => field.id)])));
  }

  function clearSelectedFields() {
    setSelectedFields([]);
  }

  function saveJob() {
    const validSelectedFields = selectedFields.filter((fieldId) => fieldsForSelectedFarmer.some((field) => field.id === fieldId));
    const needsFields = jobScope === "field";
    if (!selectedFarmerOrganization || !selectedContractorOrganization || (needsFields && validSelectedFields.length === 0) || (taskCount === 0 && templateTaskCount === 0)) {
      setSavedNotice(t("createJob.missingRequiredFields"));
      return;
    }
    const plannedCrewsValue = selectedJobType?.defaultCrews ?? 1;
    const estimatedHoursValue = calculatedEstimatedHours || selectedJobType?.defaultEstimatedHours || 0;
    const priorityValue = priority || "normal";
    const parsedServiceLat = numberFromForm(serviceLat);
    const parsedServiceLng = numberFromForm(serviceLng);
    const serviceLocation = jobScope === "service" && (serviceAddress.trim() || parsedServiceLat !== undefined || parsedServiceLng !== undefined)
      ? {
          address: serviceAddress.trim() || undefined,
          lat: parsedServiceLat,
          lng: parsedServiceLng,
          label: serviceAddress.trim() || t("createJob.serviceLocation"),
        }
      : undefined;
    const jobTypeTasks: Task[] = selectedJobType
      ? selectedJobType.tasks.map((task) => ({
          ...task,
          id: crypto.randomUUID(),
          estimatedHours: needsFields && task.timePerHa ? selectedAreaHa * task.timePerHa : task.estimatedHours,
        }))
      : [];
    const additionalTasks: Task[] = selectedTaskOptions.map((taskOption) => ({
          id: crypto.randomUUID(),
          name: taskOption.name,
          subtasks: taskOption.workSteps,
          mode: taskOption.mode,
          allowMultipleWorkers: taskOption.mode !== "Einzelmodus",
          maxVehicles: taskOption.mode === "Einzelmodus" ? 1 : taskOption.maxVehicles,
          progressMetric: [taskOption.progressMetric],
          requiredDrivers: taskOption.requiredDrivers,
          requiredVehicles: taskOption.requiredVehicles,
          requiredImplements: taskOption.requiredImplements,
          estimatedHours: needsFields ? selectedAreaHa * taskOption.timePerHa : 0,
          timePerHa: taskOption.timePerHa,
          targetValue: taskOption.progressMetric === "Menge" ? 25 : undefined,
          plannedAmount: taskOption.progressMetric === "Menge" ? 25 : undefined,
          unit: taskOption.unit || (taskOption.progressMetric === "Fläche" ? "ha" : taskOption.progressMetric === "Fuhren" ? t("driver.trips") : taskOption.progressMetric === "Zeit" ? "h" : undefined),
          mapStyle: taskOption.mapStyle,
        }));
    const sourceTemplateTasks: Task[] = initialTemplate && taskCount === 0
      ? initialTemplate.job.tasks.map((task) => ({
          ...task,
          id: crypto.randomUUID(),
          subtasks: task.subtasks?.map((subtaskName) => subtaskName),
        }))
      : [];
    const tasks = sourceTemplateTasks.length > 0 ? sourceTemplateTasks : [...jobTypeTasks, ...additionalTasks];

    const job: Job = {
      id: crypto.randomUUID(),
      title: jobTitle.trim() || selectedJobType?.name || selectedTaskOptions.map((taskOption) => taskOption.name).join(", ") || initialTemplate?.job.title || t("jobs.newJob"),
      customer: selectedFarmerOrganization.name,
      contractor: selectedContractorOrganization.name,
      farmerOrganizationId: selectedFarmerOrganization.id,
      contractorOrganizationId: selectedContractorOrganization.id,
      fieldIds: needsFields ? validSelectedFields : [],
      tasks,
      jobTypeId: selectedJobType?.id,
      jobTypeName: selectedJobType?.name,
      plannedCrews: plannedCrewsValue,
      estimatedHours: estimatedHoursValue,
      timeWindow: plannedTimeWindow,
      priority: priorityValue,
      serviceLocation,
      notes: jobNotes.trim() || selectedJobType?.resourceSummary || initialTemplate?.job.notes || t("createJob.freeDispatchPlanning"),
    };

    // Flächenaufträge entstehen aus Fläche mal Aufgabe, allgemeine Aufträge direkt je Aufgabe.
    const subtaskFieldIds = needsFields ? validSelectedFields : [""];
    const generatedSubtasks: Subtask[] = subtaskFieldIds.flatMap((fieldId) =>
      tasks.map((task) => ({
        id: crypto.randomUUID(),
        jobId: job.id,
        fieldId,
        taskId: task.id,
        status: "offen",
        progress: 0,
        activeDriverIds: [],
        plannedCrews: plannedCrewsValue,
        estimatedHours: needsFields
          ? (((fieldsForSelectedFarmer.find((field) => field.id === fieldId)?.areaHa ?? 0) * (task.timePerHa ?? 0)) || (task.estimatedHours ?? estimatedHoursValue))
          : (task.estimatedHours ?? estimatedHoursValue),
        targetValue: task.targetValue,
        targetUnit: task.unit,
      })),
    );

    onSave(job, generatedSubtasks);
    setSavedNotice(t("createJob.saved"));
    onSaved?.();
  }

  return (
    <section className="create-layout create-layout-single">
      <div className="panel form-panel">
        <div className="section-heading">
          <h2>{t("createJob.defineTaskFirst")}</h2>
          <span>{t("createJob.tasksCount", { count: taskCount })}</span>
        </div>
        <div className="form-row create-template-row">
          <label>
            {t("createJob.orderType")}
            <select
              value={jobScope}
              onChange={(event) => {
                const nextScope = event.target.value as "field" | "service";
                setJobScope(nextScope);
                if (nextScope === "service") setSelectedFields([]);
              }}
            >
              <option value="field">{t("createJob.orderTypeField")}</option>
              <option value="service">{t("createJob.orderTypeService")}</option>
            </select>
          </label>
          <label>
            {t("createJob.customerOrganization")}
            <select
              disabled={currentRole === "farmer_admin" || currentRole === "farmer_employee"}
              value={selectedFarmerOrganizationId}
              onChange={(event) => setSelectedFarmerOrganizationId(event.target.value)}
            >
              <option value="">{t("createJob.selectFarmer")}</option>
              {farmerOrganizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select>
          </label>
          <label>
            {t("createJob.contractorOrganization")}
            <select value={selectedContractorOrganizationId} onChange={(event) => setSelectedContractorOrganizationId(event.target.value)}>
              <option value="">{t("createJob.selectContractor")}</option>
              {contractorOrganizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select>
          </label>
          <label>
            {t("terms.priority")}
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="">{t("createJob.selectOption")}</option>
              <option value="normal">{t("createJob.priorityNormal")}</option>
              <option value="high">{t("createJob.priorityHigh")}</option>
              <option value="urgent">{t("createJob.priorityUrgent")}</option>
              <option value="low">{t("createJob.priorityLow")}</option>
            </select>
          </label>
          <label>
            {t("terms.job")}
            <input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder={selectedJobType?.name ?? t("jobs.newJob")} />
          </label>
        </div>
        <div className="resource-editor-block create-date-block">
          <div className="form-row create-date-grid">
            <label>
              {t("createJob.dateMode")}
              <select value={dateMode} onChange={(event) => setDateMode(event.target.value as "wish" | "fixed")}>
                <option value="">{t("createJob.selectOption")}</option>
                <option value="wish">{t("createJob.requestedDate")}</option>
                <option value="fixed">{t("createJob.fixedDate")}</option>
              </select>
            </label>
            <label>
              {dateLabel}
              <input value={requestedDate} onChange={(event) => setRequestedDate(event.target.value)} type="date" />
            </label>
            <div className="time-range-row">
              <label>
                {t("createJob.startTime")}
                <input value={requestedStartTime} onChange={(event) => setRequestedStartTime(event.target.value)} type="time" />
              </label>
              <label>
                {t("createJob.endTime")}
                <input value={requestedEndTime} onChange={(event) => setRequestedEndTime(event.target.value)} type="time" />
              </label>
            </div>
            <label>
              {t("createJob.timeWindow")}
              <input readOnly value={plannedTimeWindow} />
            </label>
            <label>
              {t("terms.notes")}
              <input value={jobNotes} onChange={(event) => setJobNotes(event.target.value)} placeholder={t("createJob.accessHazardHint")} />
            </label>
          </div>
        </div>
        {jobScope === "service" && (
          <div className="service-location-panel">
            <div>
              <strong>{t("createJob.serviceLocation")}</strong>
              <span>{t("createJob.serviceLocationHint")}</span>
            </div>
            <div className="service-location-grid">
              <label>{t("createJob.serviceAddress")}<input value={serviceAddress} onChange={(event) => setServiceAddress(event.target.value)} placeholder={t("createJob.serviceAddressPlaceholder")} /></label>
              <label>{t("createJob.latitude")}<input inputMode="decimal" value={serviceLat} onChange={(event) => setServiceLat(event.target.value)} placeholder="56.75399" /></label>
              <label>{t("createJob.longitude")}<input inputMode="decimal" value={serviceLng} onChange={(event) => setServiceLng(event.target.value)} placeholder="15.87492" /></label>
            </div>
          </div>
        )}
        <div className="form-row">
          <label>
            {t("createJob.jobType")}
            <select value={selectedJobTypeId} onChange={(event) => setSelectedJobTypeId(event.target.value)}>
              <option value="">{t("createJob.noJobType")}</option>
              {jobTypes.map((jobType) => <option key={jobType.id} value={jobType.id}>{jobType.name}</option>)}
            </select>
          </label>
        </div>
        {selectedJobType && (
          <div className="resource-need-box">
            <strong>{selectedJobType.description}</strong>
            {selectedJobType.tasks.map((task) => {
              const resourceHint = visibleResourceHint(task.resourceHint);
              return (
                <span key={task.id}>
                  {task.name}: {task.requiredDrivers ?? 0} {t("terms.driver")} · {task.requiredVehicles ?? 0} {t("terms.vehicle")} · {task.requiredImplements ?? 0} {t("terms.implement")}
                  {resourceHint ? ` · ${resourceHint}` : ""}
                  {task.timePerHa ? ` · ${task.timePerHa} ${t("createJob.hoursPerHa")}` : ""}
                </span>
              );
            })}
          </div>
        )}
        <div className="form-row">
          <label>
            {selectedJobType ? t("createJob.additionalTask") : t("terms.task")}
            <select value={taskToAdd} onChange={(event) => setTaskToAdd(event.target.value)}>
              <option value="">{t("createJob.selectOption")}</option>
              {taskTemplates.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}
            </select>
          </label>
          <button className="secondary-action task-add-button" disabled={!taskToAdd || selectedTasks.includes(taskToAdd)} onClick={addSelectedTask} type="button">
            <Plus size={18} /> {selectedJobType ? t("createJob.addAdditionalTask") : t("createJob.addTask")}
          </button>
        </div>
        <div className="quick-task-panel">
          <div className="quick-task-head">
            <div>
              <strong>{t("createJob.quickTaskTitle")}</strong>
              <span>{t("createJob.quickTaskHint")}</span>
            </div>
            <button className="secondary-action" onClick={() => setShowQuickTaskForm((current) => !current)} type="button">
              <Plus size={16} /> {t("createJob.quickTaskToggle")}
            </button>
          </div>
          {showQuickTaskForm && (
            <div className="quick-task-grid">
              <label>{t("terms.task")}<input value={quickTaskForm.name} onChange={(event) => setQuickTaskForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("createJob.quickTaskNamePlaceholder")} /></label>
              <label>{t("pricing.billingUnit")}<select value={quickTaskForm.billingUnit} onChange={(event) => setQuickTaskForm((current) => ({ ...current, billingUnit: event.target.value as NonNullable<TaskTemplate["billingUnit"]>, unit: event.target.value === "hour" ? "h" : event.target.value === "flat" ? "pauschal" : current.unit }))}>
                <option value="hour">{t("pricing.units.hour")}</option>
                <option value="flat">{t("pricing.units.flat")}</option>
                <option value="quantity">{t("pricing.units.quantity")}</option>
                <option value="trip">{t("pricing.units.trip")}</option>
                <option value="ha">{t("pricing.units.ha")}</option>
              </select></label>
              <label>{t("masterData.taskUnit")}<input value={quickTaskForm.unit} onChange={(event) => setQuickTaskForm((current) => ({ ...current, unit: event.target.value }))} placeholder={t("masterData.taskUnitPlaceholder")} /></label>
              <label>{t("pricing.standardPrice")}<input inputMode="decimal" value={quickTaskForm.standardPrice} onChange={(event) => setQuickTaskForm((current) => ({ ...current, standardPrice: event.target.value }))} /></label>
              <label>{t("pricing.currency")}<select value={quickTaskForm.standardPriceCurrency} onChange={(event) => setQuickTaskForm((current) => ({ ...current, standardPriceCurrency: event.target.value }))}>
                {["SEK", "EUR", "DKK", "NOK"].map((currency) => <option key={currency} value={currency}>{currency}</option>)}
              </select></label>
              <label>{t("terms.driver")}<input min={0} max={10} type="number" value={quickTaskForm.requiredDrivers} onChange={(event) => setQuickTaskForm((current) => ({ ...current, requiredDrivers: Number(event.target.value) }))} /></label>
              <label>{t("terms.vehicle")}<input min={0} max={10} type="number" value={quickTaskForm.requiredVehicles} onChange={(event) => setQuickTaskForm((current) => ({ ...current, requiredVehicles: Number(event.target.value) }))} /></label>
              <label>{t("terms.implement")}<input min={0} max={10} type="number" value={quickTaskForm.requiredImplements} onChange={(event) => setQuickTaskForm((current) => ({ ...current, requiredImplements: Number(event.target.value) }))} /></label>
              <label className="quick-task-wide">{t("createJob.resourceNeed")}<input value={quickTaskForm.resourceHint} onChange={(event) => setQuickTaskForm((current) => ({ ...current, resourceHint: event.target.value }))} placeholder={t("createJob.dispatchPlannerDecides")} /></label>
              <button className="primary-action quick-task-save" onClick={addQuickTask} type="button">
                <Save size={16} /> {t("createJob.quickTaskSave")}
              </button>
            </div>
          )}
        </div>
        {selectedTaskOptions.length > 0 && (
          <div className="selected-task-list">
            <strong>{selectedJobType ? t("createJob.additionalTasks") : t("createJob.selectedTasks")}</strong>
            {selectedTaskOptions.map((taskOption) => (
              <div className="selected-task-card" key={taskOption.id}>
                <div>
                  <b>{taskOption.name}</b>
                  <span>{taskOption.timePerHa} {t("createJob.hoursPerHa")}</span>
                  <span>{t("createJob.subtasks")}: {taskOption.workSteps.join(", ")}</span>
                </div>
                <button
                  aria-label={t("createJob.removeTask", { task: taskOption.name })}
                  onClick={() => removeSelectedTask(taskOption.id)}
                  type="button"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        {jobScope === "field" ? (
        <div className="inline-field-assignment">
          <div className="section-heading">
            <h2>{t("createJob.assignFieldsAfterTask")}</h2>
            <div className="template-field-actions">
              <span>{t("fields.selected", { count: selectedFields.length })}</span>
              {initialTemplate && (
                <button className="secondary-action" disabled={fieldsForSelectedFarmer.length === 0 || allFieldsSelected} onClick={selectAllFields} type="button">
                  <CheckCircle2 size={16} /> {t("createJob.selectAllFields")}
                </button>
              )}
            </div>
          </div>
          <label className="field-search">
            {t("createJob.searchFields")}
            <input
              placeholder={t("createJob.searchFieldsPlaceholder")}
              type="search"
              value={fieldSearch}
              onChange={(event) => setFieldSearch(event.target.value)}
            />
          </label>
          <p className="map-selection-hint">{t("createJob.mapFieldSelectionHint")}</p>
          <div className="field-bulk-actions">
            <button className="secondary-action" disabled={fieldsForSelectedFarmer.length === 0 || allFieldsSelected} onClick={selectAllFields} type="button">
              <CheckCircle2 size={18} /> {t("createJob.selectAllFields")}
            </button>
            <button className="secondary-action" disabled={visibleFields.length === 0 || allVisibleFieldsSelected} onClick={selectVisibleFields} type="button">
              <CheckCircle2 size={18} /> {t("createJob.selectVisibleFields", { count: visibleFields.length })}
            </button>
            <button className="secondary-action" disabled={selectedFields.length === 0} onClick={clearSelectedFields} type="button">
              <X size={18} /> {t("createJob.clearFieldSelection")}
            </button>
          </div>
          <FieldSelectionMap fields={visibleFields} onToggleField={toggleSelectedField} selectedFieldIds={selectedFields} />
          {visibleFields.length === 0 && <p className="permission-note">{t("createJob.noFieldSearchResults")}</p>}
          {visibleFields.length > 0 && (
            <div className="field-pick-list">
              <div className="field-pick-list-heading">
                <strong>{t("createJob.fieldQuickSelection")}</strong>
                <span>{t("createJob.visibleFieldsCount", { count: visibleFields.length })}</span>
              </div>
              {visibleFields.map((field) => (
                <label className={selectedFieldSet.has(field.id) ? "active" : ""} key={field.id}>
                  <input
                    checked={selectedFieldSet.has(field.id)}
                    onChange={() => toggleSelectedField(field.id)}
                    type="checkbox"
                  />
                  <span>
                    <strong>{field.name}</strong>
                    <small>{formatArea(field.areaHa, i18n.language)} · {field.crop}</small>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="selected-field-list">
            {selectedFields.map((fieldId) => {
              const field = fields.find((item) => item.id === fieldId);
              if (!field) return null;
              return (
                <div className="selected-field-card" key={field.id}>
                  <button aria-label={t("createJob.removeField", { field: field.name })} onClick={() => toggleSelectedField(field.id)} type="button">
                    <X size={16} />
                  </button>
                  <div>
                    <strong>{field.name}</strong>
                    <span>{formatArea(field.areaHa, i18n.language)} · {field.crop}</span>
                  </div>
                  <div className="geo-check-list">
                    {getFieldGeoChecks(field).map((check) => (
                      <span className={check.ok ? "geo-check ok" : "geo-check warning"} key={check.label}>
                        {check.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                        {t(check.label)}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="geo-warning-list">
            {selectedFields.flatMap((fieldId) => {
              const field = fields.find((item) => item.id === fieldId);
              if (!field) return [];
              return getFieldGeoChecks(field)
                .filter((check) => !check.ok)
                .map((check) => <p key={`${field.id}-${check.label}`}><AlertTriangle size={16} /> {field.name}: {t(check.warning)}</p>);
            })}
          </div>
        </div>
        ) : (
          <div className="inline-field-assignment service-order-note">
            <div className="section-heading">
              <h2>{t("createJob.noFieldAssignmentTitle")}</h2>
              <span>{t("createJob.serviceOrderBadge")}</span>
            </div>
            <p className="permission-note">{t("createJob.noFieldAssignmentHint")}</p>
          </div>
        )}

        {permissions.canCreateJobs && (
          <button className="primary-action wide create-job-save-button" onClick={saveJob} type="button">
            <Save size={20} /> {t("actions.saveJob")}
          </button>
        )}
        {!permissions.canCreateJobs && <p className="permission-note">{t("permissions.jobsReadOnly")}</p>}
        {savedNotice && <p className="save-notice">{savedNotice}</p>}
      </div>
    </section>
  );
}
