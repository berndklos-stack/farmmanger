import { Archive, RefreshCw, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Job, Status, Subtask } from "../types";
import { DriverChips, FieldName, ProgressBar, StatusBadge, getTask } from "./shared";

const nextStatuses: Status[] = ["offen", "reserviert", "in Arbeit", "pausiert", "teilweise erledigt", "erledigt", "Problem"];

export function JobEditModal({
  job,
  jobs,
  subtasks,
  showArchived = false,
  onClose,
  onUpdateJob,
  onUpdateSubtask,
  onSetStatus,
  onArchiveJob,
  onDeleteJob,
}: {
  job: Job;
  jobs: Job[];
  subtasks: Subtask[];
  showArchived?: boolean;
  onClose: () => void;
  onUpdateJob: (id: string, patch: Partial<Job>) => void;
  onUpdateSubtask: (id: string, patch: Partial<Subtask>) => void;
  onSetStatus: (id: string, status: Status) => void;
  onArchiveJob: (id: string) => void;
  onDeleteJob: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [jobForm, setJobForm] = useState({
    title: job.title,
    timeWindow: job.timeWindow,
    priority: job.priority ?? "normal",
    notes: job.notes,
    estimatedHours: job.estimatedHours ?? 0,
    plannedCrews: job.plannedCrews ?? 1,
  });
  const related = subtasks.filter((subtask) => subtask.jobId === job.id);

  useEffect(() => {
    setJobForm({
      title: job.title,
      timeWindow: job.timeWindow,
      priority: job.priority ?? "normal",
      notes: job.notes,
      estimatedHours: job.estimatedHours ?? 0,
      plannedCrews: job.plannedCrews ?? 1,
    });
  }, [job]);

  function saveJob() {
    onUpdateJob(job.id, jobForm);
    onClose();
  }

  function archiveJob() {
    onArchiveJob(job.id);
    onClose();
  }

  return (
    <>
      <div className="modal-backdrop" role="presentation">
        <div className="resource-modal job-edit-modal" role="dialog" aria-modal="true" aria-labelledby="job-edit-title">
          <div className="section-heading">
            <div>
              <h2 id="job-edit-title">{t("jobs.editJob")}</h2>
              <p>{job.jobNumber ? `${t("jobs.jobNumberShort")}: ${job.jobNumber} · ${job.title}` : job.title}</p>
            </div>
            <button className="secondary-action icon-action" onClick={onClose} type="button"><X size={18} /></button>
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
            <span>{t("terms.customer")}: {job.customer}</span>
            <span>{t("terms.contractor")}: {job.contractor}</span>
            <span>{t("createJob.plannedCrews")}: {job.plannedCrews ?? 1}</span>
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
                    <input disabled={showArchived} min={0} step={0.5} value={subtask.estimatedHours ?? task?.estimatedHours ?? job.estimatedHours ?? 0} onChange={(event) => onUpdateSubtask(subtask.id, { estimatedHours: Number(event.target.value) })} type="number" />
                  </span>
                  <span>
                    <input disabled={showArchived} min={1} max={8} value={subtask.plannedCrews ?? job.plannedCrews ?? 1} onChange={(event) => onUpdateSubtask(subtask.id, { plannedCrews: Number(event.target.value) })} type="number" />
                  </span>
                  <span><DriverChips subtask={subtask} /></span>
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

          <div className="modal-actions">
            <button className="secondary-action" type="button"><RefreshCw size={18} /> {t("actions.recalculateSubtasks")}</button>
            {!showArchived && <button className="danger-action" onClick={archiveJob} type="button"><Archive size={16} /> {t("actions.archive")}</button>}
            {showArchived && <button className="danger-action" onClick={() => setConfirmDeleteOpen(true)} type="button"><Trash2 size={16} /> {t("actions.deletePermanent")}</button>}
            {!showArchived && <button className="primary-action" onClick={saveJob} type="button"><Save size={16} /> {t("masterData.saveChanges")}</button>}
          </div>
        </div>
      </div>

      {confirmDeleteOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal warning-modal" role="dialog" aria-modal="true">
            <div className="section-heading">
              <h2>{t("actions.deletePermanent")}</h2>
              <button className="secondary-action icon-action" onClick={() => setConfirmDeleteOpen(false)} type="button"><X size={18} /></button>
            </div>
            <p>{t("archive.confirmPermanentDelete", { item: job.title })}</p>
            <div className="modal-actions">
              <button className="secondary-action" onClick={() => setConfirmDeleteOpen(false)} type="button">{t("actions.cancel")}</button>
              <button className="danger-action" onClick={() => { onDeleteJob(job.id); setConfirmDeleteOpen(false); onClose(); }} type="button"><Trash2 size={16} /> {t("actions.deletePermanent")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
