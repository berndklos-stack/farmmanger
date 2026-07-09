import { AlertTriangle, CheckCircle2, ClipboardList, MapPinned, Navigation, Route } from "lucide-react";
import type { ElementType } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppData } from "../data/DataContext";
import { formatArea } from "../i18n/format";
import { decideVacationRequest, loadVacationRequests, readVacationRequests, subscribeVacationRequests, type VacationRequest } from "../lib/vacationRequests";
import type { Job, Subtask } from "../types";
import { formatCoordinates } from "../utils/geo";
import { FieldName, ProgressBar, StatusBadge, getTask } from "./shared";

type DriverEquipmentLogEntry = {
  id?: string;
  eventType?: string;
  recordedAt?: string;
  driverName?: string;
  placement?: string;
  note?: string;
  vehicleNames?: string[];
  implementNames?: string[];
  machineProblem?: boolean;
  problemRecipient?: string;
};

type Props = {
  jobs: Job[];
  subtasks: Subtask[];
  onOpenFields: () => void;
  onOpenJobs: () => void;
};

function readEquipmentProblemRows() {
  try {
    const raw = window.localStorage.getItem("farm-manager.driverEquipmentLog");
    const rows = raw ? JSON.parse(raw) as DriverEquipmentLogEntry[] : [];
    return rows.filter((row) => row.machineProblem || row.placement === "defect").slice(0, 8);
  } catch {
    return [];
  }
}

export function Dashboard({ jobs, subtasks, onOpenFields, onOpenJobs }: Props) {
  const { t, i18n } = useTranslation();
  const { fields } = useAppData();
  const [vacationRequests, setVacationRequests] = useState<VacationRequest[]>(() => readVacationRequests());
  useEffect(() => subscribeVacationRequests(() => setVacationRequests(readVacationRequests())), []);
  useEffect(() => {
    void loadVacationRequests().then(setVacationRequests);
  }, []);
  const totalArea = fields.reduce((sum, field) => sum + field.areaHa, 0);
  const jobRows = jobs.map((job) => {
    const related = subtasks.filter((subtask) => subtask.jobId === job.id);
    const progress = related.length > 0
      ? Math.round(related.reduce((sum, item) => sum + item.progress, 0) / related.length)
      : 0;
    const completed = related.length > 0 && related.every((subtask) => subtask.status === "erledigt");
    return { job, progress, completed };
  });
  const openJobs = jobRows.filter((row) => !row.completed).length;
  const doneJobs = jobRows.filter((row) => row.completed).length;
  const problems = subtasks.filter((subtask) => subtask.status === "Problem");
  const machineProblems = readEquipmentProblemRows();
  const openVacationRequests = vacationRequests.filter((request) => request.status === "requested");
  const hazardCount = fields.reduce((sum, field) => sum + field.hazards.length, 0);

  function handleVacationDecision(request: VacationRequest, status: "approved" | "rejected") {
    const reason = window.prompt(t(status === "approved" ? "vacationApproval.approveReasonPrompt" : "vacationApproval.rejectReasonPrompt"), "");
    if (reason === null) return;
    void decideVacationRequest(request.id, status, t("vacationApproval.disposition"), reason.trim()).then(setVacationRequests);
  }

  return (
    <section className="view-stack">
      <div className="hero-band">
        <div>
          <h2>{t("dashboard.hero")}</h2>
        </div>
      </div>

      <div className="metric-grid">
        <Metric icon={ClipboardList} label={t("dashboard.activeJobs")} value={jobs.length.toString()} />
        <Metric icon={Route} label={t("dashboard.openJobs")} value={openJobs.toString()} />
        <Metric icon={CheckCircle2} label={t("dashboard.completedJobs")} value={doneJobs.toString()} />
        <Metric icon={MapPinned} label={t("dashboard.fields")} value={`${fields.length} · ${formatArea(totalArea, i18n.language)}`} />
      </div>

      <div className="split-grid">
        <div className="panel">
          <div className="section-heading">
            <h2>{t("dashboard.activeJobs")}</h2>
            <span>{jobs.length} {t("dashboard.jobs")}</span>
          </div>
          <div className="job-list">
            {jobRows.map(({ job, progress }) => {
              return (
                <button className="job-row" key={job.id} onClick={onOpenJobs} type="button">
                  <div>
                    <small>{t("jobs.jobNumberShort")}: {job.jobNumber ?? job.id}</small>
                    <strong>{job.title}</strong>
                    <span>{t("jobs.fieldsTasksTime", { fields: job.fieldIds.length, tasks: job.tasks.length, time: job.timeWindow })}</span>
                  </div>
                  <ProgressBar value={progress || 0} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="section-heading">
            <h2>{t("dashboard.gpsNavigation")}</h2>
            <span>{fields.length} {t("dashboard.accessPoints")}</span>
          </div>
          <div className="gps-summary">
            <div>
              <Navigation size={22} />
              <strong>{t("dashboard.osmActive")}</strong>
              <span>{t("dashboard.gpsSummary", { count: hazardCount })}</span>
            </div>
            <div>
              <MapPinned size={22} />
              <strong>{fields[0]?.name ?? t("fields.noFieldYet")}</strong>
              <span>{t("fields.accessCoordinate", { coords: fields[0] ? formatCoordinates(fields[0].accessPoint) : "-" })}</span>
            </div>
          </div>
          <button className="primary-action wide" onClick={onOpenFields} type="button">
            <MapPinned size={20} /> {t("dashboard.openMap")}
          </button>
        </div>
      </div>

      <div className="split-grid">
        <div className="panel">
          <div className="section-heading">
            <h2>{t("dashboard.alertsProblems")}</h2>
            <span>{problems.length + machineProblems.length + openVacationRequests.length} {t("dashboard.open")}</span>
          </div>
          <div className="alert-list">
            {openVacationRequests.map((request) => (
              <div className="alert-item vacation-alert-item" key={request.id}>
                <AlertTriangle size={19} />
                <div>
                  <strong>{t("vacationApproval.requestTitle")} · {request.driverName}</strong>
                  <span>{request.from}-{request.to} · {request.days} {t("driver.days")}{request.note ? ` · ${request.note}` : ""}</span>
                  <small>{t("vacationApproval.submittedAt", { time: new Date(request.createdAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) })}</small>
                  {request.history.slice(0, 2).map((entry) => (
                    <small key={entry.id}>{t(`vacationApproval.history.${entry.action}`)} · {entry.actorName} · {new Date(entry.createdAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}{entry.reason ? ` · ${entry.reason}` : ""}</small>
                  ))}
                </div>
                <div className="vacation-decision-actions">
                  <button className="secondary-action compact-action" onClick={() => handleVacationDecision(request, "rejected")} type="button">{t("vacationApproval.reject")}</button>
                  <button className="primary-action compact-action" onClick={() => handleVacationDecision(request, "approved")} type="button">{t("vacationApproval.approve")}</button>
                </div>
              </div>
            ))}
            {machineProblems.map((problem) => (
              <div className="alert-item" key={problem.id ?? `${problem.recordedAt}-${problem.driverName}`}>
                <AlertTriangle size={19} />
                <div>
                  <strong>{t("dashboard.machineProblem")} · {[...(problem.vehicleNames ?? []), ...(problem.implementNames ?? [])].join(" · ") || t("terms.vehicle")}</strong>
                  <span>{[problem.driverName, problem.problemRecipient ? t(`driver.notify.${problem.problemRecipient}`) : "", problem.note].filter(Boolean).join(" · ")}</span>
                </div>
                <span className="status-badge status-problem">{t("dashboard.notificationQueued")}</span>
              </div>
            ))}
            {problems.map((subtask) => (
              <div className="alert-item" key={subtask.id}>
                <AlertTriangle size={19} />
                <div>
                  <strong><FieldName id={subtask.fieldId} /> · {getTask(subtask, jobs)?.name}</strong>
                  <span>{subtask.note ?? t("dashboard.queryRequired")}</span>
                </div>
                <StatusBadge status={subtask.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ icon: Icon, label, value }: { icon: ElementType; label: string; value: string }) {
  return (
    <div className="metric-card">
      <Icon size={22} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
