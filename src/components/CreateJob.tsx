import { AlertTriangle, CheckCircle2, Plus, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppData } from "../data/DataContext";
import { formatArea } from "../i18n/format";
import type { Job, Subtask, Task, TaskTemplate } from "../types";
import { getFieldGeoChecks } from "../utils/geo";
import { FieldSelectionMap } from "./FieldSelectionMap";

type CreateJobTemplate = {
  job: Job;
};

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
  const { authProfile, currentRole, fields, jobTypes, organizations, permissions, taskTemplates } = useAppData();
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
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
  const selectedJobType = jobTypes.find((jobType) => jobType.id === selectedJobTypeId);
  const farmerOrganizations = organizations.filter((organization) => (
    organization.kind === "farmer"
    && !organization.archivedAt
    && (!(currentRole === "farmer_admin" || currentRole === "farmer_employee") || !authProfile?.organizationId || organization.id === authProfile.organizationId)
  ));
  const contractorOrganizations = organizations.filter((organization) => !organization.archivedAt);
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
    setSelectedFields((current) => current.filter((fieldId) => fieldsForSelectedFarmer.some((field) => field.id === fieldId)));
  }, [fieldsForSelectedFarmer]);

  useEffect(() => {
    if (!initialTemplate) return;
    const sourceJob = initialTemplate.job;
    const parsedTimeWindow = parseTemplateTimeWindow(sourceJob.timeWindow);
    const matchingTaskTemplateIds = sourceJob.tasks
      .map((task) => taskTemplates.find((template) => template.name === task.name)?.id)
      .filter((taskId): taskId is string => Boolean(taskId));
    setSelectedFields(sourceJob.fieldIds);
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
    setFieldSearch("");
    setTaskToAdd("");
    setSavedNotice("");
  }, [initialTemplate, jobTypes, taskTemplates]);

  function addSelectedTask() {
    if (!taskToAdd) return;
    setSelectedTasks((current) => current.includes(taskToAdd) ? current : [...current, taskToAdd]);
  }

  function removeSelectedTask(taskValue: string) {
    setSelectedTasks((current) => current.filter((item) => item !== taskValue));
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
    if (!selectedFarmerOrganization || !selectedContractorOrganization || validSelectedFields.length === 0 || (taskCount === 0 && templateTaskCount === 0)) {
      setSavedNotice(t("createJob.missingRequiredFields"));
      return;
    }
    const plannedCrewsValue = selectedJobType?.defaultCrews ?? 1;
    const estimatedHoursValue = calculatedEstimatedHours || selectedJobType?.defaultEstimatedHours || 0;
    const priorityValue = priority || "normal";
    const jobTypeTasks: Task[] = selectedJobType
      ? selectedJobType.tasks.map((task) => ({
          ...task,
          id: crypto.randomUUID(),
          estimatedHours: task.timePerHa ? selectedAreaHa * task.timePerHa : task.estimatedHours,
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
          estimatedHours: selectedAreaHa * taskOption.timePerHa,
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
      fieldIds: validSelectedFields,
      tasks,
      jobTypeId: selectedJobType?.id,
      jobTypeName: selectedJobType?.name,
      plannedCrews: plannedCrewsValue,
      estimatedHours: estimatedHoursValue,
      timeWindow: plannedTimeWindow,
      priority: priorityValue,
      notes: jobNotes.trim() || selectedJobType?.resourceSummary || initialTemplate?.job.notes || t("createJob.freeDispatchPlanning"),
    };

    // Teilaufträge entstehen direkt aus jeder Kombination aus Fläche und Aufgabe.
    const generatedSubtasks: Subtask[] = validSelectedFields.flatMap((fieldId) =>
      tasks.map((task, index) => ({
        id: crypto.randomUUID(),
        jobId: job.id,
        fieldId,
        taskId: task.id,
        status: "offen",
        progress: 0,
        activeDriverIds: [],
        plannedCrews: plannedCrewsValue,
        estimatedHours: ((fieldsForSelectedFarmer.find((field) => field.id === fieldId)?.areaHa ?? 0) * (task.timePerHa ?? 0)) || (task.estimatedHours ?? estimatedHoursValue),
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
            {selectedJobType.tasks.map((task) => (
              <span key={task.id}>
                {task.name}: {task.requiredDrivers ?? 0} {t("terms.driver")} · {task.requiredVehicles ?? 0} {t("terms.vehicle")} · {task.requiredImplements ?? 0} {t("terms.implement")} · {task.resourceHint}
                {task.timePerHa ? ` · ${task.timePerHa} ${t("createJob.hoursPerHa")}` : ""}
              </span>
            ))}
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
