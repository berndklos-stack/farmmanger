import type { Status, Subtask, Task } from "../types";
import { useAppData } from "../data/DataContext";
import { useTranslation } from "react-i18next";

export const statusClass: Record<Status, string> = {
  offen: "status-open",
  reserviert: "status-reserved",
  "in Arbeit": "status-active",
  pausiert: "status-paused",
  "teilweise erledigt": "status-partial",
  erledigt: "status-done",
  Problem: "status-problem",
};

export function StatusBadge({ status }: { status: Status }) {
  const { t } = useTranslation();
  return <span className={`status-badge ${statusClass[status]}`}>{t(`status.${status}`)}</span>;
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress-track" aria-label={`Fortschritt ${value} Prozent`}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

export function FieldName({ id }: { id: string }) {
  const { t } = useTranslation();
  const { allFields, fields } = useAppData();
  return <>{allFields.find((field) => field.id === id)?.name ?? fields.find((field) => field.id === id)?.name ?? t("fields.unknownField")}</>;
}

export function DriverChips({ subtask }: { subtask: Subtask }) {
  const { t } = useTranslation();
  const { drivers } = useAppData();
  const activeDriverLabels = subtask.activeDriverIds.map((id, index) => {
    const driver = drivers.find((item) => item.id === id || item.profileId === id);
    const fallbackName = subtask.activeDriverNames?.[index];
    return {
      key: `active-${id}`,
      label: driver ? `${driver.name} · ${driver.vehicle}` : fallbackName ?? t("driver.unknownDriver"),
    };
  });
  const activeDriverNames = new Set([
    ...activeDriverLabels.map((item) => item.label.split(" · ")[0].trim().toLowerCase()),
    ...(subtask.activeDriverNames ?? []).map((name) => name.trim().toLowerCase()),
  ]);
  const performedDriverLabels = [
    ...(subtask.performedDriverIds ?? []).map((id, index) => {
      const driver = drivers.find((item) => item.id === id || item.profileId === id);
      return driver?.name ?? subtask.performedDriverNames?.[index] ?? "";
    }),
    ...(subtask.performedDriverNames ?? []),
  ]
    .map((name) => name.trim())
    .filter((name, index, names) => name && names.findIndex((item) => item.toLowerCase() === name.toLowerCase()) === index)
    .filter((name) => !activeDriverNames.has(name.toLowerCase()))
    .map((name) => ({ key: `performed-${name}`, label: name }));

  if (activeDriverLabels.length === 0 && performedDriverLabels.length === 0) {
    return <span className="muted">{t("report.open")}</span>;
  }

  return (
    <div className="chip-row">
      {[...activeDriverLabels, ...performedDriverLabels].map((item) => (
        <span className="chip" key={item.key}>
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function getTask(
  subtask: Subtask,
  jobs: { id: string; tasks: Task[] }[],
) {
  return jobs.find((job) => job.id === subtask.jobId)?.tasks.find((task) => task.id === subtask.taskId);
}
