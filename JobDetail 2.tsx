import { Archive, CopyPlus, Plus, RefreshCw, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppData } from "../data/DataContext";
import type { Job, Status, Subtask } from "../types";
import { DriverChips, FieldName, ProgressBar, StatusBadge, getTask } from "./shared";

const nextStatuses: Status[] = ["offen", "reserviert", "in Arbeit", "pausiert", "teilweise erledigt", "erledigt", "Problem"];

function formatWorkedMinutes(minutes?: number) {
  if (!minutes) return "";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0 && remainingMinutes > 0) return `${hours} h ${remainingMinutes} min`;
  if (hours > 0) return `${hours} h`;
  return `${remainingMinutes} min`;
}
const statusSortOrder: Record<Status, number> = {
  Problem: 0,
  offen: 1,
  reserviert: 2,
  "in Arbeit": 3,
  pausiert: 4,
  "teilweise erledigt": 5,
  erledigt: 6,
};

function formatHours(value: number | undefined) {
  return `${(value ?? 0).toFixed(2)} h`;
}

function getJobStatus(items: Subtask[]): Status {
  if (items.some((item) => item.status === "Problem")) return "Problem";
  if (items.length > 0 && items.every((item) => item.status === "erledigt")) return "erledigt";
  if (items.some((item) => item.status === "in Arbeit")) return "in Arbeit";
  if (items.some((item) => item.status === "pausiert")) return "pausiert";
  if (items.some((item) => item.status === "teilweise erledigt")) return "teilweise erledigt";
  if (items.some((item) => item.status === "reserviert")) return "reserviert";
  return "offen";
}

function hasDriverActivity(subtask: Subtask) {
  return Boolean(
    subtask.status !== "offen"
    || subtask.note
    || subtask.driverNote
    || subtask.doneHa
    || subtask.doneAmount
    || subtask.trips
    || subtask.accessUsed
    || subtask.driverPhotos?.length
    || subtask.newHazardReported
  );
}

export function JobDetail({
  jobs,
  selectedJob,
  subtasks,
  onUpdateJob,
  onUpdateSubtask,
  onSelectJob,
  onSetStatus,
  onArchiveJob,
  onRestoreJob,
  onDeleteJob,
  onDuplicateJob,
  onCreateJob,
  showArchived,
  onShowArchivedChange,
  activeCount,
  archivedCount,
}: {
  jobs: Job[];
  selectedJob: Job;
  subtasks: Subtask[];
  onUpdateJob: (id: string, patch: Partial<Job>) => void;
  onUpdateSubtask: (id: string, patch: Partial<Subtask>) => void;
  onSelectJob: (id: string) => void;
  onSetStatus: (id: string, status: Status) => void;
  onArchiveJob: (id: string) => void;
  onRestoreJob: (id: string) => void;
  onDeleteJob: (id: string) => void;
  onDuplicateJob: (id: string) => void;
  onCreateJob: () => void;
  showArchived: boolean;
  onShowArchivedChange: (value: boolean) => void;
  activeCount: number;
  archivedCount: number;
}) {
  const { t } = useTranslation();
  const { drivers, vehicles } = useAppData();
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const editingJob = jobs.find((job) => job.id === editingJobId) ?? null;
  const related = editingJob ? subtasks.filter((subtask) => subtask.jobId === editingJob.id) : [];
  const [jobForm, setJobForm] = useState({
    title: selectedJob.title,
    timeWindow: selectedJob.timeWindow,
    priority: selectedJob.priority ?? "normal",
    notes: selectedJob.notes,
    estimatedHours: selectedJob.estimatedHours ?? 0,
    plannedCrews: selectedJob.plannedCrews ?? 1,
  });
  const [jobFilters, setJobFilters] = useState({
    number: "",
    title: "",
    customer: "",
    timeWindow: "",
    status: "all",
    notes: "",
  });

  useEffect(() => {
    if (!editingJob) return;
    setJobForm({
      title: editingJob.title,
      timeWindow: editingJob.timeWindow,
      priority: editingJob.priority ?? "normal",
      notes: editingJob.notes,
      estimatedHours: editingJob.estimatedHours ?? 0,
      plannedCrews: editingJob.plannedCrews ?? 1,
    });
  }, [editingJob]);

  const jobRows = useMemo(() => jobs.map((job, index) => {
    const jobSubtasks = subtasks.filter((subtask) => subtask.jobId === job.id);
    const progress = jobSubtasks.length > 0
      ? Math.round(jobSubtasks.reduce((sum, subtask) => sum + subtask.progress, 0) / jobSubtasks.length)
      : 0;
    return { job, progress, status: getJobStatus(jobSubtasks), subtaskCount: jobSubtasks.length, index };
  }), [jobs, subtasks]);
  const filteredJobRows = useMemo(() => jobRows.filter(({ job, status }) => {
    const matches = (value: string | number | undefined, filter: string) => String(value ?? "").toLowerCase().includes(filter.trim().toLowerCase());
    return matches(job.jobNumber, jobFilters.number)
      && matches(job.title, jobFilters.title)
      && matches(job.customer, jobFilters.customer)
      && matches(job.timeWindow, jobFilters.timeWindow)
      && (jobFilters.status === "all" || status === jobFilters.status)
      && matches(job.notes, jobFilters.notes);
  }).sort((a, b) => statusSortOrder[a.status] - statusSortOrder[b.status] || a.index - b.index), [jobFilters, jobRows]);
  const selectedJobs = useMemo(() => jobs.filter((job) => selectedJobIds.includes(job.id)), [jobs, selectedJobIds]);
  const filteredJobIds = useMemo(() => filteredJobRows.map(({ job }) => job.id), [filteredJobRows]);
  const allFilteredSelected = filteredJobIds.length > 0 && filteredJobIds.every((id) => selectedJobIds.includes(id));

  useEffect(() => {
    setSelectedJobIds((current) => current.filter((id) => jobs.some((job) => job.id === id)));
  }, [jobs]);

  useEffect(() => {
    setSelectedJobIds([]);
  }, [showArchived]);

  function openEditor(job: Job) {
    onSelectJob(job.id);
    setEditingJobId(job.id);
  }

  function saveJob() {
    if (!editingJob) return;
    onUpdateJob(editingJob.id, jobForm);
    setEditingJobId(null);
  }

  function archiveEditingJob() {
    if (!editingJob) return;
    onArchiveJob(editingJob.id);
    setEditingJobId(null);
  }

  function toggleSelectedJob(id: string) {
    setSelectedJobIds((current) => current.includes(id) ? current.filter((jobId) => jobId !== id) : [...current, id]);
  }

  function toggleAllFilteredJobs() {
    setSelectedJobIds((current) => {
      if (allFilteredSelected) return current.filter((id) => !filteredJobIds.includes(id));
      return Array.from(new Set([...current, ...filteredJobIds]));
    });
  }

  function archiveSelectedJobs() {
    selectedJobs.forEach((job) => onArchiveJob(job.id));
    setSelectedJobIds([]);
  }

  function restoreSelectedJobs() {
    selectedJobs.forEach((job) => onRestoreJob(job.id));
    setSelectedJobIds([]);
  }

  function deleteSelectedJobs() {
    selectedJobs.forEach((job) => onDeleteJob(job.id));
    setSelectedJobIds([]);
  }

  function duplicateJob(id: string) {
    onDuplicateJob(id);
    setEditingJobId(null);
    setSelectedJobIds([]);
  }

  function assignDriverToSubtask(subtask: Subtask, driverId: string) {
    if (!driverId) {
      onUpdateSubtask(subtask.id, {
        activeDriverIds: [],
        activeDriverNames: [],
        activeVehicleIds: [],
        status: subtask.status === "reserviert" ? "offen" : subtask.status,
      });
      return;
    }
    const driver = drivers.find((item) => item.id === driverId || item.profileId === driverId);
    const vehicle = driver?.vehicle ? vehicles.find((item) => item.name === driver.vehicle && !item.archivedAt) : undefined;
    onUpdateSubtask(subtask.id, {
      activeDriverIds: [driverId],
      activeDriverNames: driver ? [driver.name] : [],
      activeVehicleIds: vehicle ? [vehicle.id] : [],
      status: subtask.status === "offen" ? "reserviert" : subtask.status,
    });
  }

  function assignedDriverSelectValue(subtask: Subtask) {
    const assignedDriver = drivers.find((driver) => (
      subtask.activeDriverIds.includes(driver.id)
      || Boolean(driver.profileId && subtask.activeDriverIds.includes(driver.profileId))
    ));
    return assignedDriver?.id ?? "";
  }

  return (
    <section className="jobs-overview">
      <div className="panel">
        <div className="section-heading">
          <div>
            <h2>{t("jobs.jobs")}</h2>
            <p>{selectedJob.jobNumber ? `${t("jobs.jobNumberShort")}: ${selectedJob.jobNumber} · ` : ""}{t("jobs.fieldsTasks", { fields: selectedJob.fieldIds.length, tasks: selectedJob.tasks.length })}</p>
          </div>
          <div className="modal-actions">
            <div className="segmented-control archive-toggle compact-toggle">
              <button className={!showArchived ? "active" : ""} onClick={() => onShowArchivedChange(false)} type="button">
                {t("archive.active")} · {activeCount}
              </button>
              <button className={showArchived ? "active" : ""} onClick={() => onShowArchivedChange(true)} type="button">
                {t("archive.archived")} · {archivedCount}
              </button>
            </div>
            {!showArchived && (
              <button className="primary-action" onClick={onCreateJob} type="button">
                <Plus size={18} /> {t("jobs.newJob")}
              </button>
            )}
          </div>
        </div>

        <div className="job-list-header">
          <strong>{t("jobs.jobList")}</strong>
          <span>{jobs.length}</span>
        </div>
        <div className="job-bulk-toolbar">
          {!showArchived && (
            <button className="secondary-action" disabled={selectedJobs.length !== 1} onClick={() => selectedJobs[0] && duplicateJob(selectedJobs[0].id)} type="button">
              <CopyPlus size={16} /> {t("jobs.useAsTemplate")}
            </button>
          )}
          {showArchived && (
            <button className="secondary-action" disabled={selectedJobs.length !== 1} onClick={() => selectedJobs[0] && duplicateJob(selectedJobs[0].id)} type="button">
              <CopyPlus size={16} /> {t("jobs.useAsTemplate")}
            </button>
          )}
          {!showArchived && (
            <button className="danger-action" disabled={selectedJobs.length === 0} onClick={archiveSelectedJobs} type="button">
              <Archive size={16} /> {t("jobs.archiveSelected")}
            </button>
          )}
          {showArchived && (
            <button className="primary-action" disabled={selectedJobs.length === 0} onClick={restoreSelectedJobs} type="button">
              <RotateCcw size={16} /> {t("jobs.restoreSelected")}
            </button>
          )}
          {showArchived && (
            <button className="danger-action" disabled={selectedJobs.length === 0} onClick={() => setConfirmBulkDeleteOpen(true)} type="button">
              <Trash2 size={16} /> {t("jobs.deleteSelected")}
            </button>
          )}
        </div>
        <div className="job-table-list">
          <div className="job-table-row job-table-head">
            <span>{t("terms.action")}</span>
            <span>{t("jobs.jobNumberShort")}</span>
            <span>{t("terms.job")}</span>
            <span>{t("terms.customer")}</span>
            <span>{t("createJob.timeWindow")}</span>
            <span>{t("terms.status")}</span>
            <span>{t("terms.progress")}</span>
            <span>{t("terms.notes")}</span>
          </div>
          <div className="job-table-row job-table-filter">
            <label className="job-head-select">
              <input
                aria-label={t("jobs.selectAllVisible")}
                checked={allFilteredSelected}
                disabled={filteredJobIds.length === 0}
                onChange={toggleAllFilteredJobs}
                type="checkbox"
              />
            </label>
            <input aria-label={`${t("jobs.filterBy")} ${t("jobs.jobNumberShort")}`} value={jobFilters.number} onChange={(event) => setJobFilters((current) => ({ ...current, number: event.target.value }))} />
            <input aria-label={`${t("jobs.filterBy")} ${t("terms.job")}`} value={jobFilters.title} onChange={(event) => setJobFilters((current) => ({ ...current, title: event.target.value }))} />
            <input aria-label={`${t("jobs.filterBy")} ${t("terms.customer")}`} value={jobFilters.customer} onChange={(event) => setJobFilters((current) => ({ ...current, customer: event.target.value }))} />
            <input aria-label={`${t("jobs.filterBy")} ${t("createJob.timeWindow")}`} value={jobFilters.timeWindow} onChange={(event) => setJobFilters((current) => ({ ...current, timeWindow: event.target.value }))} />
            <select aria-label={`${t("jobs.filterBy")} ${t("terms.status")}`} value={jobFilters.status} onChange={(event) => setJobFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="all">{t("jobs.allStatuses")}</option>
              {nextStatuses.map((status) => (
                <option key={status} value={status}>{t(`status.${status}`)}</option>
              ))}
            </select>
            <span />
            <input aria-label={`${t("jobs.filterBy")} ${t("terms.notes")}`} value={jobFilters.notes} onChange={(event) => setJobFilters((current) => ({ ...current, notes: event.target.value }))} />
          </div>
          {filteredJobRows.map(({ job, progress, status, subtaskCount }) => (
            <div className={job.id === selectedJob.id ? "job-table-row job-table-data active" : "job-table-row job-table-data"} key={job.id} onClick={() => openEditor(job)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openEditor(job); }}>
              <label className="job-row-select" onClick={(event) => event.stopPropagation()}>
                <input checked={selectedJobIds.includes(job.id)} aria-label={t("jobs.selectJob", { job: job.title })} onChange={() => toggleSelectedJob(job.id)} type="checkbox" />
              </label>
              <strong>{job.jobNumber ?? job.id}</strong>
              <span>{job.title}<small>{job.fieldIds.length} {t("terms.field")} · {subtaskCount} {t("terms.subtask")} · {formatHours(job.estimatedHours)}</small></span>
              <span>{job.customer}</span>
              <span>{job.timeWindow}</span>
              <span><StatusBadge status={status} /></span>
              <span><ProgressBar value={progress} /> {progress}%</span>
              <small>{job.notes || "-"}</small>
            </div>
          ))}
          {filteredJobRows.length === 0 && <p className="muted job-table-empty">{t("jobs.noMatchingJobs")}</p>}
        </div>
      </div>

      {editingJob && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal job-edit-modal" role="dialog" aria-modal="true" aria-labelledby="job-edit-title">
            <div className="section-heading">
              <div>
                <h2 id="job-edit-title">{t("jobs.editJob")}</h2>
                <p>{editingJob.jobNumber ? `${t("jobs.jobNumberShort")}: ${editingJob.jobNumber} · ${editingJob.title}` : editingJob.title}</p>
              </div>
              <button className="secondary-action icon-action" onClick={() => setEditingJobId(null)} type="button"><X size={18} /></button>
            </div>

            <div className="master-data-form">
              <div className="form-row resource-form-row modal-form-row">
                <label>{t("terms.job")}<input disabled={showArchived} value={jobForm.title} onChange={(event) => setJobForm((current) => ({ ...current, title: event.target.value }))} /></label>
                <label>{t("createJob.timeWindow")}<input disabled={showArchived} value={jobForm.timeWindow} onChange={(event) => setJobForm((current) => ({ ...current, timeWindow: event.target.value }))} /></label>
                <label>{t("terms.priority")}<select disabled={showArchived} value={jobForm.priority} onChange={(event) => setJobForm((current) => ({ ...current, priority: event.target.value }))}><option value="low">{t("createJob.priorityLow")}</option><option value="normal">{t("createJob.priorityNormal")}</option><option value="high">{t("createJob.priorityHigh")}</option><option value="urgent">{t("createJob.priorityUrgent")}</option></select></label>
                <label>{t("createJob.estimatedHours")}<input disabled={showArchived} min={0} step={0.5} value={jobForm.estimatedHours} onChange={(event) => setJobForm((current) => ({ ...current, estimatedHours: Number(event.target.value) }))} type="number" /></label>
                <label>{t("createJob.plannedCrews")}<input disabled={showArchived} min={1} max={8} value={jobForm.plannedCrews} onChange={(event) => setJobForm((current) => ({ ...current, plannedCrews: Number(event.target.value) }))} type="number" /></label>
                <label>{t("terms.notes")}<input disabled={showArchived} value={jobForm.notes} onChange={(event) => setJobForm((current) => ({ ...current, notes: event.target.value }))} /></label>
              </div>
            </div>

            <div className="job-meta">
              <span>{t("terms.customer")}: {editingJob.customer}</span>
              <span>{t("terms.contractor")}: {editingJob.contractor}</span>
              <span>{t("createJob.plannedCrews")}: {editingJob.plannedCrews ?? 1}</span>
            </div>

            <div className="table-card">
              <div className="table-row table-head">
                <span>{t("terms.field")}</span>
                <span>{t("terms.task")}</span>
                <span>{t("createJob.workMode")}</span>
                <span>{t("terms.status")}</span>
                <span>{t("terms.progress")}</span>
                <span>{t("createJob.estimatedHours")}</span>
                <span>{t("createJob.plannedCrews")}</span>
                <span>{t("jobs.driverVehicles")}</span>
                <span>{t("terms.action")}</span>
              </div>
              {related.map((subtask) => {
                const task = getTask(subtask, jobs);
                const target = subtask.targetValue ?? task?.targetValue;
                const doneValue = subtask.doneAmount ?? subtask.doneHa ?? subtask.trips ?? 0;
                const isOverTarget = Boolean(target && doneValue > target);
                return (
                  <div className="table-row" key={subtask.id}>
                    <span><FieldName id={subtask.fieldId} /></span>
                    <span>{task?.name}</span>
                    <span>
                      {task?.mode ? t(`mode.${task.mode}`) : ""}
                      <small className="table-subline">
                        {t("jobs.activeWorkers", { active: subtask.activeDriverIds.length, max: task?.maxVehicles ?? 1 })}
                        {target ? ` · ${t("jobs.target", { value: target, unit: subtask.targetUnit ?? task?.unit ?? "" })}` : ""}
                      </small>
                    </span>
                    <span><StatusBadge status={subtask.status} /></span>
                    <span>
                      <ProgressBar value={subtask.progress} /> {subtask.progress}%
                      {isOverTarget && <small className="target-warning">{t("jobs.targetExceeded")}</small>}
                    </span>
                    <span>
                      <input disabled={showArchived} min={0} step={0.5} value={subtask.estimatedHours ?? task?.estimatedHours ?? editingJob.estimatedHours ?? 0} onChange={(event) => onUpdateSubtask(subtask.id, { estimatedHours: Number(event.target.value) })} type="number" />
                    </span>
                    <span>
                      <input disabled={showArchived} min={1} max={8} value={subtask.plannedCrews ?? editingJob.plannedCrews ?? 1} onChange={(event) => onUpdateSubtask(subtask.id, { plannedCrews: Number(event.target.value) })} type="number" />
                    </span>
                    <span>
                      <select
                        aria-label={t("actions.assignDriver")}
                        disabled={showArchived}
                        value={assignedDriverSelectValue(subtask)}
                        onChange={(event) => assignDriverToSubtask(subtask, event.target.value)}
                      >
                        <option value="">{t("driver.noDriverAssigned")}</option>
                        {drivers.filter((driver) => !driver.archivedAt).map((driver) => (
                          <option key={driver.id} value={driver.id}>{driver.name}</option>
                        ))}
                      </select>
                      <DriverChips subtask={subtask} />
                    </span>
                    <span>
                      <select
                        aria-label={t("jobs.changeStatus")}
                        disabled={showArchived}
                        value={subtask.status}
                        onChange={(event) => onSetStatus(subtask.id, event.target.value as Status)}
                      >
                        {nextStatuses.map((status) => <option key={status} value={status}>{t(`status.${status}`)}</option>)}
                      </select>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="job-activity-panel">
              <div className="section-heading">
                <div>
                  <h3>{t("jobs.activityLog")}</h3>
                  <p>{t("jobs.activityLogHint")}</p>
                </div>
                <span className="pill success">{related.filter(hasDriverActivity).length}</span>
              </div>
              <div className="job-activity-list">
                {related.filter(hasDriverActivity).length === 0 && (
                  <p className="muted">{t("jobs.noDriverActivities")}</p>
                )}
                {related.filter(hasDriverActivity).map((subtask) => {
                  const task = getTask(subtask, jobs);
                  const values = [
                    subtask.workedMinutes ? `Arbeitszeit ${formatWorkedMinutes(subtask.workedMinutes)}` : "",
                    subtask.doneHa !== undefined ? t("jobs.activityArea", { value: subtask.doneHa }) : "",
                    subtask.doneAmount !== undefined ? t("jobs.activityQuantity", { value: subtask.doneAmount }) : "",
                    subtask.trips !== undefined ? t("jobs.activityTrips", { value: subtask.trips }) : "",
                  ].filter(Boolean);
                  return (
                    <article className="job-activity-card" key={subtask.id}>
                      <div className="job-activity-head">
                        <div>
                          <strong>{task?.name}</strong>
                          <span><FieldName id={subtask.fieldId} /></span>
                        </div>
                        <StatusBadge status={subtask.status} />
                      </div>
                      <div className="job-activity-meta">
                        <div className="job-activity-drivers">
                          <span>{t("jobs.driverVehicles")}:</span>
                          <DriverChips subtask={subtask} />
                        </div>
                        {values.length > 0 && <span>{t("jobs.activityValues")}: {values.join(" · ")}</span>}
                        {subtask.accessUsed && <span>{t("report.accessPoint", { value: subtask.accessUsed })}</span>}
                        {subtask.accessOk !== undefined && <span>{t("report.accessOk", { value: subtask.accessOk ? t("report.yes") : t("report.no") })}</span>}
                        {(subtask.driverNote || subtask.note) && <span>{t("report.driverNotes", { value: subtask.driverNote ?? subtask.note })}</span>}
                        {subtask.newHazardReported && <span>{t("report.newHazards", { count: 1 })}</span>}
                      </div>
                      {subtask.driverPhotos && subtask.driverPhotos.length > 0 && (
                        <div className="job-photo-grid">
                          {subtask.driverPhotos.map((photo) => (
                            <a href={photo.url} key={photo.id} rel="noreferrer" target="_blank" title={photo.name}>
                              <img alt={photo.name} src={photo.url} />
                              <span>{photo.name}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="modal-actions">
              <button className="secondary-action" type="button"><RefreshCw size={18} /> {t("actions.recalculateSubtasks")}</button>
              <button className="secondary-action" onClick={() => duplicateJob(editingJob.id)} type="button"><CopyPlus size={16} /> {t("jobs.useAsTemplate")}</button>
              {!showArchived && <button className="danger-action" onClick={archiveEditingJob} type="button"><Archive size={16} /> {t("actions.archive")}</button>}
              {showArchived && <button className="primary-action" onClick={() => { onRestoreJob(editingJob.id); setEditingJobId(null); }} type="button"><RotateCcw size={16} /> {t("actions.restore")}</button>}
              {showArchived && <button className="danger-action" onClick={() => setConfirmDeleteOpen(true)} type="button"><Trash2 size={16} /> {t("actions.deletePermanent")}</button>}
              {!showArchived && <button className="primary-action" onClick={saveJob} type="button"><Save size={16} /> {t("masterData.saveChanges")}</button>}
            </div>
          </div>
        </div>
      )}

      {confirmDeleteOpen && editingJob && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal warning-modal" role="dialog" aria-modal="true">
            <div className="section-heading">
              <h2>{t("actions.deletePermanent")}</h2>
              <button className="secondary-action icon-action" onClick={() => setConfirmDeleteOpen(false)} type="button"><X size={18} /></button>
            </div>
            <p>{t("archive.confirmPermanentDelete", { item: editingJob.title })}</p>
            <div className="modal-actions">
              <button className="secondary-action" onClick={() => setConfirmDeleteOpen(false)} type="button">{t("actions.cancel")}</button>
              <button className="danger-action" onClick={() => { onDeleteJob(editingJob.id); setConfirmDeleteOpen(false); setEditingJobId(null); }} type="button"><Trash2 size={16} /> {t("actions.deletePermanent")}</button>
            </div>
          </div>
        </div>
      )}

      {confirmBulkDeleteOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal warning-modal" role="dialog" aria-modal="true">
            <div className="section-heading">
              <h2>{t("actions.deletePermanent")}</h2>
              <button className="secondary-action icon-action" onClick={() => setConfirmBulkDeleteOpen(false)} type="button"><X size={18} /></button>
            </div>
            <p>{t("jobs.confirmBulkDelete", { count: selectedJobs.length })}</p>
            <div className="modal-actions">
              <button className="secondary-action" onClick={() => setConfirmBulkDeleteOpen(false)} type="button">{t("actions.cancel")}</button>
              <button className="danger-action" onClick={() => { deleteSelectedJobs(); setConfirmBulkDeleteOpen(false); }} type="button"><Trash2 size={16} /> {t("actions.deletePermanent")}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
