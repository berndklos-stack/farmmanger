import { useAppData } from "../data/DataContext";
import { useTranslation } from "react-i18next";
import type { Subtask } from "../types";
import { FieldName } from "./shared";

export function ReportMapSummary({ fieldId, subtasks }: { fieldId: string; subtasks: Subtask[] }) {
  const { t } = useTranslation();
  const { fields } = useAppData();
  const field = fields.find((item) => item.id === fieldId);
  const usedAccess = subtasks.find((subtask) => subtask.accessUsed)?.accessUsed ?? field?.accessPoint.label ?? t("report.notDocumented");
  const reportedProblems = subtasks.filter((subtask) => subtask.status === "Problem" || subtask.note);
  const newHazards = subtasks.filter((subtask) => subtask.newHazardReported);
  const accessOk = subtasks.every((subtask) => subtask.accessOk !== false);
  const driverNotes = subtasks.map((subtask) => subtask.driverNote ?? subtask.note).filter(Boolean);

  return (
    <div className="access-report-row">
      <strong><FieldName id={fieldId} /></strong>
      <span>{t("report.accessPoint", { value: usedAccess })}</span>
      <span>{t("report.reportedProblems", { count: reportedProblems.length })}</span>
      <span>{t("report.newHazards", { count: newHazards.length })}</span>
      <span>{t("report.accessOk", { value: accessOk ? t("report.yes") : t("report.no") })}</span>
      <span>{t("report.driverNotes", { value: driverNotes.join("; ") || t("report.none") })}</span>
    </div>
  );
}
