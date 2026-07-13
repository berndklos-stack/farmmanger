import { Archive, CopyPlus, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Job, Status, Subtask } from "../types";
import { JobEditModal } from "./JobEditModal";
import { ProgressBar, StatusBadge } from "./shared";

const nextStatuses: Status[] = ["offen", "reserviert", "in Arbeit", "pausiert", "teilweise erledigt", "erledigt", "Problem"];

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

export function JobDetail({
  jobs,
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
  statusFilter,
  activeCount,
  archivedCount,
}: {
  jobs: Job[];
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
  statusFilter?: Status | "all";
  activeCount: number;
  archivedCount: number;
}) {
  const { t } = useTranslation();
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const editingJob = jobs.find((job) => job.id === editingJobId) ?? null;
  const [jobFilters, setJobFilters] = useState({
    number: "",
    title: "",
    customer: "",
    timeWindow: "",
    status: "all",
    notes: "",
  });

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

  useEffect(() => {
    if (!statusFilter) return;
    setJobFilters((current) => ({ ...current, status: statusFilter }));
  }, [statusFilter]);

  function openEditor(job: Job) {
    onSelectJob(job.id);
    setEditingJobId(job.id);
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

  return (
    <section className="jobs-overview">
      <div className="panel">
        <div className="job-list-titlebar">
          <strong>{t("jobs.jobList")}</strong>
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
            <div className={job.id === editingJobId ? "job-table-row job-table-data active" : "job-table-row job-table-data"} key={job.id} onClick={() => openEditor(job)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openEditor(job); }}>
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
        <JobEditModal
          job={editingJob}
          jobs={jobs}
          subtasks={subtasks}
          showArchived={showArchived}
          onClose={() => setEditingJobId(null)}
          onUpdateJob={onUpdateJob}
          onUpdateSubtask={onUpdateSubtask}
          onSetStatus={onSetStatus}
          onArchiveJob={(id) => {
            onArchiveJob(id);
            setEditingJobId(null);
          }}
          onDeleteJob={(id) => {
            onDeleteJob(id);
            setEditingJobId(null);
          }}
        />
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
              <button className="danger-action" onClick={() => { deleteSelectedJobs(); setConfirmBulkDeleteOpen(false); }} type="button"><Trash2 size={16} /> {t("actions.deletePermanent")}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
