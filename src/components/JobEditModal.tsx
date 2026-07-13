import { Archive, RefreshCw, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppData } from "../data/DataContext";
import type { Job, Status, Subtask, SubtaskAssignment, WorkMode } from "../types";
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
  onUpdateJob: (id: string, patch: Partial<Job>) => void | Promise<void>;
  onUpdateSubtask: (id: string, patch: Partial<Subtask>) => void | Promise<void>;
  onSetStatus: (id: string, status: Status) => void;
  onArchiveJob: (id: string) => void;
  onDeleteJob: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { drivers, vehicles, implementsList } = useAppData();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
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

  async function saveJob() {
    try {
      await Promise.resolve(onUpdateJob(job.id, jobForm));
      setSaveMessage({ type: "success", text: t("jobs.editSaveSuccess") });
    } catch (error) {
      setSaveMessage({ type: "error", text: error instanceof Error ? error.message : t("jobs.editSaveError") });
    }
  }

  function archiveJob() {
    onArchiveJob(job.id);
    onClose();
  }

  function modeKey(mode?: WorkMode) {
    if (mode === "Teammodus") return "team";
    if (mode === "Rollenmodus") return "role_based";
    if (mode === "Flächenteilung") return "area_split";
    return "single";
  }

  function assignmentCapacity(mode?: WorkMode, plannedCrews = 1) {
    return modeKey(mode) === "single" ? 1 : Math.max(1, plannedCrews);
  }

  function emptyAssignment(subtaskId: string, index: number): SubtaskAssignment {
    return { id: `${subtaskId}-assignment-${index}` };
  }

  function getAssignmentRows(subtask: Subtask, mode?: WorkMode) {
    const plannedCrews = subtask.plannedCrews ?? job.plannedCrews ?? 1;
    const capacity = assignmentCapacity(mode, plannedCrews);
    const existing: SubtaskAssignment[] = subtask.activeAssignments?.length
      ? subtask.activeAssignments
      : Array.from({ length: Math.max(subtask.activeDriverIds.length, subtask.activeVehicleIds?.length ?? 0, subtask.activeImplementIds?.length ?? 0) }, (_, index) => ({
          id: `${subtask.id}-assignment-${index}`,
          driverId: subtask.activeDriverIds[index],
          vehicleId: subtask.activeVehicleIds?.[index],
          implementId: subtask.activeImplementIds?.[index],
        }));
    const rowCount = Math.max(capacity, existing.length, 1);
    return Array.from({ length: rowCount }, (_, index) => existing[index] ?? emptyAssignment(subtask.id, index));
  }

  function persistAssignments(subtask: Subtask, rows: SubtaskAssignment[]) {
    const normalizedRows = rows.map((row, index) => ({ ...row, id: row.id || `${subtask.id}-assignment-${index}` }));
    const activeRows = normalizedRows.filter((row) => row.driverId || row.vehicleId || row.implementId || row.role || row.areaShare);
    const activeDriverIds = activeRows.map((row) => row.driverId).filter((id): id is string => Boolean(id));
    const activeVehicleIds = activeRows.map((row) => row.vehicleId).filter((id): id is string => Boolean(id));
    const activeImplementIds = activeRows.map((row) => row.implementId).filter((id): id is string => Boolean(id));
    const activeDriverNames = activeDriverIds
      .map((driverId) => drivers.find((driver) => driver.id === driverId || driver.profileId === driverId)?.name)
      .filter((name): name is string => Boolean(name));
    onUpdateSubtask(subtask.id, {
      activeAssignments: activeRows,
      activeDriverIds,
      activeDriverNames,
      activeVehicleIds,
      activeImplementIds,
      status: activeDriverIds.length > 0 && subtask.status === "offen" ? "reserviert" : activeDriverIds.length === 0 && subtask.status === "reserviert" ? "offen" : subtask.status,
    });
  }

  function updateAssignment(subtask: Subtask, rows: SubtaskAssignment[], index: number, patch: Partial<SubtaskAssignment>) {
    const nextRows = rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row));
    const changedRow = nextRows[index];
    if (patch.driverId && nextRows.some((row, rowIndex) => rowIndex !== index && row.driverId === patch.driverId)) {
      setSaveMessage({ type: "error", text: t("jobs.duplicateDriverAssignment") });
      return;
    }
    if (patch.vehicleId && nextRows.some((row, rowIndex) => rowIndex !== index && row.vehicleId === patch.vehicleId)) {
      setSaveMessage({ type: "error", text: t("jobs.duplicateVehicleAssignment") });
      return;
    }
    if (patch.driverId && !changedRow.vehicleId) {
      const driver = drivers.find((item) => item.id === patch.driverId || item.profileId === patch.driverId);
      const defaultVehicle = driver?.vehicle ? vehicles.find((vehicle) => vehicle.name === driver.vehicle && !vehicle.archivedAt) : undefined;
      if (defaultVehicle && !nextRows.some((row, rowIndex) => rowIndex !== index && row.vehicleId === defaultVehicle.id)) {
        nextRows[index] = { ...nextRows[index], vehicleId: defaultVehicle.id };
      }
    }
    setSaveMessage(null);
    persistAssignments(subtask, nextRows);
  }

  function removeAssignment(subtask: Subtask, rows: SubtaskAssignment[], index: number) {
    persistAssignments(subtask, rows.filter((_, rowIndex) => rowIndex !== index));
  }

  function addAssignment(subtask: Subtask, rows: SubtaskAssignment[]) {
    persistAssignments(subtask, [...rows, emptyAssignment(subtask.id, rows.length)]);
  }

  function updatePlannedCrews(subtask: Subtask, mode: WorkMode | undefined, rows: SubtaskAssignment[], value: number) {
    const nextValue = Math.max(1, Math.min(8, value || 1));
    const activeRowCount = rows.filter((row) => row.driverId || row.vehicleId || row.implementId).length;
    if (nextValue < activeRowCount) {
      setSaveMessage({ type: "error", text: t("jobs.plannedCrewsBelowAssignments") });
      return;
    }
    const capacity = assignmentCapacity(mode, nextValue);
    const nextRows = modeKey(mode) === "single"
      ? rows.slice(0, 1)
      : Array.from({ length: Math.max(capacity, activeRowCount) }, (_, index) => rows[index] ?? emptyAssignment(subtask.id, index));
    onUpdateSubtask(subtask.id, {
      plannedCrews: nextValue,
      activeAssignments: nextRows.filter((row) => row.driverId || row.vehicleId || row.implementId || row.role || row.areaShare),
    });
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
          {saveMessage && <p className={`modal-save-message ${saveMessage.type}`}>{saveMessage.text}</p>}

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
              const rows = getAssignmentRows(subtask, task?.mode);
              const plannedCrews = subtask.plannedCrews ?? job.plannedCrews ?? 1;
              const capacity = assignmentCapacity(task?.mode, plannedCrews);
              const key = modeKey(task?.mode);
              const needsImplement = (task?.requiredImplements ?? 0) > 0;
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
                    <input disabled={showArchived} min={1} max={8} value={plannedCrews} onChange={(event) => updatePlannedCrews(subtask, task?.mode, rows, Number(event.target.value))} type="number" />
                  </span>
                  <div className="driver-assignment-cell">
                    <div className="driver-assignment-main">
                      <div className="assignment-rows">
                        {rows.slice(0, key === "single" ? 1 : rows.length).map((assignment, index) => (
                          <div className="assignment-row" key={assignment.id}>
                            <span className="assignment-row-label">{t("jobs.assignmentColumn", { number: index + 1 })}</span>
                            {key === "role_based" && (
                              <select
                                aria-label={t("jobs.assignmentRole")}
                                disabled={showArchived}
                                value={assignment.role ?? ""}
                                onChange={(event) => updateAssignment(subtask, rows, index, { role: event.target.value })}
                              >
                                <option value="">{t("jobs.assignmentRole")}</option>
                                <option value="lead">{t("jobs.assignmentRoleLead")}</option>
                                <option value="driver">{t("terms.driver")}</option>
                                <option value="hauling">{t("jobs.assignmentRoleHauling")}</option>
                                <option value="support">{t("jobs.assignmentRoleSupport")}</option>
                              </select>
                            )}
                            {key === "area_split" && (
                              <input
                                aria-label={t("jobs.assignmentAreaShare")}
                                disabled={showArchived}
                                min={0}
                                max={100}
                                value={assignment.areaShare ?? ""}
                                onChange={(event) => updateAssignment(subtask, rows, index, { areaShare: Number(event.target.value) || undefined })}
                                placeholder={t("jobs.assignmentAreaShare")}
                                type="number"
                              />
                            )}
                            <select
                              aria-label={t("actions.assignDriver")}
                              disabled={showArchived}
                              value={assignment.driverId ?? ""}
                              onChange={(event) => updateAssignment(subtask, rows, index, { driverId: event.target.value || undefined })}
                            >
                              <option value="">{t("driver.noDriverAssigned")}</option>
                              {drivers.filter((driver) => !driver.archivedAt).map((driver) => (
                                <option disabled={rows.some((row, rowIndex) => rowIndex !== index && row.driverId === driver.id)} key={driver.id} value={driver.id}>{driver.name}</option>
                              ))}
                            </select>
                            <select
                              aria-label={t("terms.vehicle")}
                              disabled={showArchived}
                              value={assignment.vehicleId ?? ""}
                              onChange={(event) => updateAssignment(subtask, rows, index, { vehicleId: event.target.value || undefined })}
                            >
                              <option value="">{t("contractor.noVehicleAssigned")}</option>
                              {vehicles.filter((vehicle) => !vehicle.archivedAt).map((vehicle) => (
                                <option disabled={rows.some((row, rowIndex) => rowIndex !== index && row.vehicleId === vehicle.id)} key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>
                              ))}
                            </select>
                            {needsImplement && (
                              <select
                                aria-label={t("terms.implement")}
                                disabled={showArchived}
                                value={assignment.implementId ?? ""}
                                onChange={(event) => updateAssignment(subtask, rows, index, { implementId: event.target.value || undefined })}
                              >
                                <option value="">{t("contractor.noImplement")}</option>
                                {implementsList.filter((implement) => !implement.archivedAt).map((implement) => (
                                  <option key={implement.id} value={implement.id}>{implement.name}</option>
                                ))}
                              </select>
                            )}
                            {!showArchived && rows.length > 1 && (
                              <button className="secondary-action assignment-remove" onClick={() => removeAssignment(subtask, rows, index)} type="button">
                                {t("jobs.removeAssignment")}
                              </button>
                            )}
                          </div>
                        ))}
                        {!showArchived && key !== "single" && rows.length < capacity && (
                          <button className="secondary-action assignment-add" onClick={() => addAssignment(subtask, rows)} type="button">
                            {t("jobs.addAssignmentColumn")}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="driver-assignment-status">
                      <DriverChips subtask={subtask} />
                    </div>
                  </div>
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
              <button className="danger-action" onClick={() => { onDeleteJob(job.id); setConfirmDeleteOpen(false); onClose(); }} type="button"><Trash2 size={16} /> {t("actions.deletePermanent")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
