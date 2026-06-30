import { Download, FileSpreadsheet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppData } from "../data/DataContext";
import { formatArea, formatUnit } from "../i18n/format";
import type { Job, Subtask } from "../types";
import { ReportMapSummary } from "./ReportMapSummary";
import { FieldName, ProgressBar } from "./shared";

export function CompletionReport({ jobs, subtasks }: { jobs: Job[]; subtasks: Subtask[] }) {
  const { t, i18n } = useTranslation();
  const { drivers, fields } = useAppData();
  return (
    <section className="view-stack">
      {jobs.map((job) => {
        const related = subtasks.filter((subtask) => subtask.jobId === job.id);
        const fieldArea = job.fieldIds.reduce((sum, fieldId) => sum + (fields.find((field) => field.id === fieldId)?.areaHa ?? 0), 0);
        const doneArea = related.reduce((sum, subtask) => sum + (subtask.doneHa ?? 0), 0);
        const amount = related.reduce((sum, subtask) => sum + (subtask.doneAmount ?? 0), 0);
        const trips = related.reduce((sum, subtask) => sum + (subtask.trips ?? 0), 0);
        const progress = Math.round(related.reduce((sum, subtask) => sum + subtask.progress, 0) / related.length) || 0;
        const driverNames = Array.from(new Set(related.flatMap((subtask) => subtask.activeDriverIds)))
          .map((id) => drivers.find((driver) => driver.id === id)?.name)
          .filter(Boolean)
          .join(", ") || "Noch offen";

        return (
          <article className="panel report-card" key={job.id}>
            <div className="section-heading">
              <div>
                <h2>{job.jobNumber ? `${job.jobNumber} · ${job.title}` : job.title}</h2>
                <p>{job.timeWindow}</p>
              </div>
              <div className="export-actions">
                <button type="button"><Download size={18} /> PDF</button>
                <button type="button"><FileSpreadsheet size={18} /> Excel</button>
              </div>
            </div>
            <ProgressBar value={progress} />
            <div className="report-grid">
              <ReportItem label={t("report.plannedFields")} value={`${job.fieldIds.length} (${formatArea(fieldArea, i18n.language)})`} />
              <ReportItem label={t("report.completedArea")} value={formatArea(doneArea, i18n.language)} />
              <ReportItem label={t("report.plannedQuantity")} value={job.tasks[0]?.plannedAmount ? formatUnit(fieldArea * job.tasks[0].plannedAmount, job.tasks[0].unit?.replace("/ha", "") ?? "", i18n.language) : t("terms.task")} />
              <ReportItem label={t("report.completedQuantity")} value={`${formatUnit(amount, "m³", i18n.language)} · ${trips} ${t("metrics.Fuhren")}`} />
              <ReportItem label={t("report.drivers")} value={driverNames} />
              <ReportItem label={t("report.problems")} value={`${related.filter((subtask) => subtask.status === "Problem").length}`} />
            </div>
            <div className="rest-list">
              <strong>{t("report.remainingAreas")}</strong>
              {related.filter((subtask) => subtask.progress < 100).map((subtask) => (
                <span key={subtask.id}><FieldName id={subtask.fieldId} /> · {t("report.openPercent", { percent: 100 - subtask.progress })}</span>
              ))}
            </div>
            <div className="field-access-report">
              <strong>{t("report.gpsFeedback")}</strong>
              {job.fieldIds.map((fieldId) => {
                const fieldSubtasks = related.filter((subtask) => subtask.fieldId === fieldId);
                return <ReportMapSummary fieldId={fieldId} key={fieldId} subtasks={fieldSubtasks} />;
              })}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function ReportItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="report-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
