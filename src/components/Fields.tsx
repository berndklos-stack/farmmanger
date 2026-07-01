import { Archive, Camera, FileArchive, FileSpreadsheet, FileText, Plus, Trash2, Wheat, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppData } from "../data/DataContext";
import { formatArea } from "../i18n/format";
import type { FieldAttachment, FieldHazard, FieldMapPattern, FieldMapStyle, GeoPoint, Job, Subtask } from "../types";
import { formatCoordinates } from "../utils/geo";
import { FieldMap } from "./FieldMap";
import { FieldHazards } from "./FieldHazards";
import { StatusBadge, getTask } from "./shared";

type FieldHistoryFilters = {
  date: string;
  activityTime: string;
  job: string;
  contractor: string;
  task: string;
  status: string;
  actors: string;
  resources: string;
  work: string;
  note: string;
};

type FieldHistoryRow = FieldHistoryFilters & {
  id: string;
  sortValue: string;
  statusValue?: Subtask["status"];
};

type FieldWorkMapStatus = FieldMapStyle & {
  taskName: string;
  recordedAt: string;
  workState?: "manual" | "planned" | "active" | "completed";
  dueDate?: string;
  note?: string;
};

const fieldMapPatterns: FieldMapPattern[] = ["none", "whiteDots"];
const activeWorkStatuses: Subtask["status"][] = ["in Arbeit"];

function mixHexColor(baseColor: string, overlayColor: string, overlayWeight = 0.45) {
  const parse = (value: string) => {
    const match = value.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!match) return null;
    return [Number.parseInt(match[1], 16), Number.parseInt(match[2], 16), Number.parseInt(match[3], 16)];
  };
  const base = parse(baseColor);
  const overlay = parse(overlayColor);
  if (!base || !overlay) return baseColor;
  const mixed = base.map((channel, index) => Math.round(channel * (1 - overlayWeight) + overlay[index] * overlayWeight));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

type ExportColumn = {
  header: string;
  value: (row: FieldHistoryRow) => string;
  width: number;
};

export function Fields({
  jobs,
  selectedFieldId,
  subtasks,
  onSelectField,
}: {
  jobs: Job[];
  selectedFieldId: string;
  subtasks: Subtask[];
  onSelectField: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { addField, archiveField, archiveFieldAttachment, deleteField, drivers, fields, implementsList, jobTypes, organizations, permissions, taskTemplates, updateField, uploadFieldAttachments, vehicles } = useAppData();
  const [boundaryOverrides, setBoundaryOverrides] = useState<Record<string, GeoPoint[]>>({});
  const [showArchivedFields, setShowArchivedFields] = useState(false);
  const [showArchivedAttachments, setShowArchivedAttachments] = useState(false);
  const [fieldDeleteTarget, setFieldDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isBulkReleaseOpen, setIsBulkReleaseOpen] = useState(false);
  const [bulkReleaseFieldIds, setBulkReleaseFieldIds] = useState<string[]>([]);
  const [bulkReleaseContractorIds, setBulkReleaseContractorIds] = useState<string[]>([]);
  const [releaseContractorToAdd, setReleaseContractorToAdd] = useState("");
  const [bulkReleaseContractorToAdd, setBulkReleaseContractorToAdd] = useState("");
  const [bulkReleaseNotice, setBulkReleaseNotice] = useState("");
  const [bulkReleaseNoticeType, setBulkReleaseNoticeType] = useState<"applied" | "removed">("applied");
  const [historyFilters, setHistoryFilters] = useState<FieldHistoryFilters>({
    date: "",
    activityTime: "",
    job: "",
    contractor: "",
    task: "",
    status: "",
    actors: "",
    resources: "",
    work: "",
    note: "",
  });
  const photoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const activeFields = fields.filter((field) => !field.archivedAt);
  const archivedFields = fields.filter((field) => Boolean(field.archivedAt));
  const visibleFields = showArchivedFields ? archivedFields : activeFields;
  const visibleFieldAreaHa = visibleFields.reduce((sum, field) => sum + field.areaHa, 0);
  const contractorOrganizations = organizations.filter((organization) => organization.kind === "contractor" && !organization.archivedAt);
  const baseSelected = visibleFields.find((field) => field.id === selectedFieldId) ?? visibleFields[0];
  const selected = useMemo(
    () => baseSelected ? ({
      ...baseSelected,
      boundary: boundaryOverrides[baseSelected?.id] ?? baseSelected?.boundary ?? [],
    }) : undefined,
    [baseSelected, boundaryOverrides],
  );
  const fieldMapStatuses = useMemo(() => {
    const next: Record<string, FieldWorkMapStatus> = {};
    const findConfiguredMapStyle = (taskName?: string) => {
      if (!taskName) return undefined;
      const normalized = taskName.trim().toLowerCase();
      return taskTemplates.find((template) => template.name.trim().toLowerCase() === normalized)?.mapStyle
        ?? jobTypes.flatMap((jobType) => jobType.tasks).find((task) => task.name.trim().toLowerCase() === normalized)?.mapStyle;
    };
    fields.forEach((field) => {
      const fieldSubtasks = subtasks
        .filter((subtask) => subtask.fieldId === field.id)
        .map((subtask) => {
          const job = jobs.find((item) => item.id === subtask.jobId);
          const task = getTask(subtask, jobs);
          const mapStyle = task?.mapStyle ?? findConfiguredMapStyle(task?.name);
          return { job, mapStyle, subtask, task };
        })
        .filter((item) => Boolean(item.mapStyle));
      const active = fieldSubtasks.find((item) => activeWorkStatuses.includes(item.subtask.status));
      const completed = fieldSubtasks
        .filter((item) => item.subtask.status === "erledigt")
        .sort((a, b) => Date.parse(b.subtask.completedAt ?? b.subtask.statusChangedAt ?? b.subtask.updatedAt ?? "") - Date.parse(a.subtask.completedAt ?? a.subtask.statusChangedAt ?? a.subtask.updatedAt ?? ""))[0];
      const planned = active ?? completed ?? fieldSubtasks.find((item) => item.subtask.status !== "erledigt");
      if (planned?.task && planned.mapStyle) {
        const activeColor = mixHexColor(planned.mapStyle.color, "#f4c542", 0.48);
        next[field.id] = {
          ...planned.mapStyle,
          color: active ? activeColor : planned.mapStyle.color,
          label: active ? `${planned.mapStyle.label} · ${t("fields.workStateActive")}` : planned.mapStyle.label,
          taskName: planned.task.name,
          recordedAt: planned.subtask.completedAt ?? planned.subtask.statusChangedAt ?? planned.subtask.updatedAt ?? planned.job?.timeWindow ?? "",
          workState: active ? "active" : completed ? "completed" : "planned",
        };
        return;
      }
      if (field.manualWorkPlan) {
        next[field.id] = {
          ...field.manualWorkPlan.mapStyle,
          label: field.manualWorkPlan.label,
          taskName: field.manualWorkPlan.label,
          recordedAt: field.manualWorkPlan.dueDate ?? field.manualWorkPlan.createdAt,
          workState: "manual",
          dueDate: field.manualWorkPlan.dueDate,
          note: field.manualWorkPlan.note,
        };
      }
    });
    return next;
  }, [fields, jobTypes, jobs, subtasks, taskTemplates, t]);
  const cropSuggestions = useMemo(() => {
    const suggestions = new Map<string, string>();
    fields.forEach((field) => {
      const crop = field.crop.trim();
      if (!crop) return;
      suggestions.set(crop.toLocaleLowerCase(i18n.language), crop);
    });
    return Array.from(suggestions.values()).sort((a, b) => a.localeCompare(b, i18n.language));
  }, [fields, i18n.language]);
  const [fieldForm, setFieldForm] = useState({
    name: "",
    areaHa: "0",
    crop: "",
    tenure: "Eigentum",
    accessLabel: "",
    accessDescription: "",
    mapStyleColor: "#dff8cf",
    mapStylePattern: "none",
    manualWorkLabel: "",
    manualWorkDueDate: "",
    manualWorkNote: "",
    manualWorkColor: "#f1c453",
    manualWorkPattern: "none",
  });

  useEffect(() => {
    if (!selected) return;
    setFieldForm({
      name: selected.name,
      areaHa: String(selected.areaHa),
      crop: selected.crop,
      tenure: selected.tenure,
      accessLabel: selected.accessPoint.label,
      accessDescription: selected.accessDescription,
      mapStyleColor: selected.mapStyle?.color ?? "#dff8cf",
      mapStylePattern: selected.mapStyle?.pattern ?? "none",
      manualWorkLabel: selected.manualWorkPlan?.label ?? "",
      manualWorkDueDate: selected.manualWorkPlan?.dueDate ?? "",
      manualWorkNote: selected.manualWorkPlan?.note ?? "",
      manualWorkColor: selected.manualWorkPlan?.mapStyle.color ?? "#f1c453",
      manualWorkPattern: selected.manualWorkPlan?.mapStyle.pattern ?? "none",
    });
  }, [selected?.id]);

  if (!selected) {
    return (
      <section className="panel">
        <div className="section-heading">
          <h2>{t("fields.noFields")}</h2>
          <div className="segmented-control">
            <button className={!showArchivedFields ? "active" : ""} onClick={() => setShowArchivedFields(false)} type="button">
              {t("archive.active")} · {activeFields.length}
            </button>
            <button className={showArchivedFields ? "active" : ""} onClick={() => setShowArchivedFields(true)} type="button">
              {t("archive.archived")} · {archivedFields.length}
            </button>
          </div>
        </div>
        <p className="muted">{showArchivedFields ? t("fields.noArchivedFields") : t("fields.noFields")}</p>
        {permissions.canEditFields && !showArchivedFields && (
          <button className="primary-action" onClick={() => createNewField()} type="button">
            {t("masterData.newField")}
          </button>
        )}
        {!permissions.canEditFields && <p className="permission-note">{t("permissions.fieldsReadOnly")}</p>}
      </section>
    );
  }
  const selectedField = selected;
  const selectedSubtasks = subtasks.filter((subtask) => subtask.fieldId === selectedField.id && subtask.status !== "erledigt");
  const statusList = Array.from(new Set(selectedSubtasks.map((subtask) => subtask.status)));
  const allSelectedFieldSubtasks = subtasks.filter((subtask) => subtask.fieldId === selectedField.id);
  const formatHistoryDateTime = (value?: string) => {
    if (!value) return t("report.notDocumented");
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(parsed);
  };
  const formatHistoryDate = (value?: string) => {
    if (!value) return t("report.notDocumented");
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat(i18n.language, { dateStyle: "short" }).format(parsed);
  };
  const resolveDriverName = (id: string) => drivers.find((driver) => (
    driver.id === id
    || driver.profileId === id
    || driver.name.trim().toLowerCase() === id.trim().toLowerCase()
  ))?.name;
  const fieldHistoryRows: FieldHistoryRow[] = [
    ...allSelectedFieldSubtasks.map((subtask) => {
      const job = jobs.find((item) => item.id === subtask.jobId);
      const task = getTask(subtask, jobs);
      const driverNames = Array.from(new Set([
        ...subtask.activeDriverIds.map(resolveDriverName).filter((name): name is string => Boolean(name)),
        ...(subtask.activeDriverNames ?? []),
      ])).join(", ");
      const vehicleNames = (subtask.activeVehicleIds ?? [])
        .map((id) => vehicles.find((vehicle) => vehicle.id === id))
        .filter(Boolean)
        .map((vehicle) => [vehicle!.name, vehicle!.licensePlate].filter(Boolean).join(" "))
        .join(", ");
      const implementNames = (subtask.activeImplementIds ?? [])
        .map((id) => implementsList.find((implement) => implement.id === id)?.name)
        .filter(Boolean)
        .join(", ");
      const workValues = [
        subtask.doneHa !== undefined ? `${subtask.doneHa} ha` : "",
        subtask.doneAmount !== undefined ? `${subtask.doneAmount} ${subtask.targetUnit ?? t("driver.quantity")}` : "",
        subtask.trips !== undefined ? `${subtask.trips} ${t("metrics.Fuhren")}` : "",
        subtask.targetValue !== undefined ? `${t("jobs.target", { value: subtask.targetValue, unit: subtask.targetUnit ?? "" })}` : "",
        `${subtask.progress}%`,
      ].filter(Boolean).join(" · ");
      const photoValues = (subtask.driverPhotos ?? []).map((photo) => `${photo.name} (${formatHistoryDateTime(photo.uploadedAt)})`);
      const noteValues = [
        subtask.driverNote ?? subtask.note ?? "",
        subtask.accessUsed ? `${t("report.accessPoint", { value: subtask.accessUsed })}` : "",
        subtask.accessOk !== undefined ? `${t("report.accessOk", { value: subtask.accessOk ? t("report.yes") : t("report.no") })}` : "",
        subtask.newHazardReported ? t("report.newHazards", { count: 1 }) : "",
        photoValues.length > 0 ? `${t("terms.photos")}: ${photoValues.join(", ")}` : "",
      ].filter(Boolean).join(" · ");
      const completionTime = subtask.completedAt ?? (subtask.status === "erledigt" ? subtask.statusChangedAt ?? subtask.updatedAt : undefined);
      const activityTime = completionTime ?? subtask.statusChangedAt ?? subtask.updatedAt ?? subtask.driverPhotos?.at(-1)?.uploadedAt;
      return {
        id: subtask.id,
        sortValue: activityTime || job?.timeWindow || job?.jobNumber || subtask.id,
        date: subtask.status === "erledigt" ? formatHistoryDate(completionTime ?? activityTime) : job?.timeWindow || t("report.notDocumented"),
        activityTime: formatHistoryDateTime(activityTime),
        job: [job?.jobNumber, job?.title, job?.customer].filter(Boolean).join(" · ") || subtask.jobId,
        contractor: job?.contractor ?? t("report.notDocumented"),
        task: task?.name ?? subtask.taskId,
        status: t(`status.${subtask.status}`),
        statusValue: subtask.status,
        actors: driverNames || t("contractor.noDriverAssigned"),
        resources: [vehicleNames, implementNames].filter(Boolean).join(" · ") || t("contractor.noVehicleAssigned"),
        work: workValues,
        note: noteValues || t("report.none"),
      };
    }),
    ...selectedField.history.map((item, index) => ({
      id: `manual-${selectedField.id}-${index}`,
      sortValue: item,
      date: item.split(":")[0] || t("report.notDocumented"),
      activityTime: t("report.notDocumented"),
      job: t("fields.manualHistory"),
      contractor: t("report.notDocumented"),
      task: item,
      status: t("fields.documented"),
      actors: t("report.notDocumented"),
      resources: t("report.notDocumented"),
      work: "",
      note: item,
    })),
  ].sort((a, b) => b.sortValue.localeCompare(a.sortValue));
  const filteredFieldHistoryRows = fieldHistoryRows.filter((row) => (
    (Object.keys(historyFilters) as Array<keyof FieldHistoryFilters>).every((key) => (
      row[key].toLowerCase().includes(historyFilters[key].trim().toLowerCase())
    ))
  ));
  const historyPreviewRows = fieldHistoryRows.slice(0, 3);

  function updateHistoryFilter(key: keyof FieldHistoryFilters, value: string) {
    setHistoryFilters((current) => ({ ...current, [key]: value }));
  }

  const historyExportColumns: ExportColumn[] = [
    { header: t("fields.historyDate"), value: (row) => row.date, width: 18 },
    { header: t("fields.historyActivityTime"), value: (row) => row.activityTime, width: 18 },
    { header: t("terms.job"), value: (row) => row.job, width: 24 },
    { header: t("fields.historyContractor"), value: (row) => row.contractor, width: 18 },
    { header: t("terms.task"), value: (row) => row.task, width: 20 },
    { header: t("terms.status"), value: (row) => row.status, width: 12 },
    { header: t("fields.historyActors"), value: (row) => row.actors, width: 18 },
    { header: t("fields.historyResources"), value: (row) => row.resources, width: 20 },
    { header: t("fields.historyWork"), value: (row) => row.work || "-", width: 16 },
    { header: t("fields.historyNotes"), value: (row) => row.note, width: 28 },
  ];
  const fieldExportDetails = [
    [t("terms.fieldParcel"), selectedField.name],
    [`${t("terms.field")} ha`, formatArea(selectedField.areaHa, i18n.language)],
    [t("fields.crop"), selectedField.crop],
    [t("fields.ownership"), selectedField.tenure],
    [t("terms.accessPoint"), selectedField.accessPoint.label],
    [t("fields.accessCoordinates"), formatCoordinates(selectedField.accessPoint)],
    [t("terms.accessInstructions"), selectedField.accessDescription],
    [t("terms.hazards"), selectedField.hazards.map((hazard) => `${hazard.title}: ${t(`hazards.${hazard.type}`)} ${hazard.description} (${formatCoordinates(hazard.location)})`).join(" · ") || t("hazards.none")],
  ];

  function safeExportFilename(value: string, extension: string) {
    const base = value.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "flaeche";
    return `${base}-historie.${extension}`;
  }

  function downloadBlob(filename: string, type: string, content: BlobPart[]) {
    const blob = new Blob(content, { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function escapeHtml(value: string) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function downloadHistoryExcel() {
    const detailsRows = fieldExportDetails.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("");
    const headerCells = historyExportColumns.map((column) => `<th>${escapeHtml(column.header)}</th>`).join("");
    const dataRows = fieldHistoryRows.map((row) => (
      `<tr>${historyExportColumns.map((column) => `<td>${escapeHtml(column.value(row))}</td>`).join("")}</tr>`
    )).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><h1>${escapeHtml(t("terms.history"))} - ${escapeHtml(selectedField.name)}</h1><table>${detailsRows}</table><br /><table border="1"><thead><tr>${headerCells}</tr></thead><tbody>${dataRows}</tbody></table></body></html>`;
    downloadBlob(safeExportFilename(selectedField.name, "xls"), "application/vnd.ms-excel;charset=utf-8", ["\ufeff", html]);
  }

  function downloadHistoryPdf() {
    const pageWidth = 842;
    const pageHeight = 595;
    const margin = 28;
    const innerWidth = pageWidth - margin * 2;
    const encoder = new TextEncoder();
    const pages: number[][] = [];
    let commands: number[] = [];
    let y = pageHeight - margin;

    const pushAscii = (target: number[], value: string) => {
      for (let index = 0; index < value.length; index += 1) target.push(value.charCodeAt(index) & 0xff);
    };
    const winAnsiMap: Record<string, number> = {
      "€": 128, "‚": 130, "ƒ": 131, "„": 132, "…": 133, "†": 134, "‡": 135, "ˆ": 136, "‰": 137,
      "Š": 138, "‹": 139, "Œ": 140, "Ž": 142, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149,
      "–": 150, "—": 151, "˜": 152, "™": 153, "š": 154, "›": 155, "œ": 156, "ž": 158, "Ÿ": 159,
    };
    const pushPdfLiteral = (target: number[], value: string) => {
      target.push(40);
      Array.from(value).forEach((char) => {
        const mapped = winAnsiMap[char] ?? char.charCodeAt(0);
        const code = mapped >= 0 && mapped <= 255 ? mapped : 45;
        if (code === 40 || code === 41 || code === 92) target.push(92);
        target.push(code);
      });
      target.push(41);
    };
    const addCommand = (value: string) => pushAscii(commands, value);
    const addRect = (x: number, rectY: number, width: number, height: number, fill: [number, number, number]) => {
      addCommand(`q ${fill.join(" ")} rg ${x} ${rectY} ${width} ${height} re f Q\n`);
    };
    const addLine = (x1: number, y1: number, x2: number, y2: number, stroke: [number, number, number]) => {
      addCommand(`q ${stroke.join(" ")} RG 0.6 w ${x1} ${y1} m ${x2} ${y2} l S Q\n`);
    };
    const addText = (x: number, textY: number, text: string, size = 8, color: [number, number, number] = [0.1, 0.16, 0.12], font: "F1" | "F2" = "F1") => {
      addCommand(`BT /${font} ${size} Tf ${color.join(" ")} rg ${x} ${textY} Td `);
      pushPdfLiteral(commands, text);
      addCommand(" Tj ET\n");
    };
    const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();
    const wrapText = (value: string, width: number, size: number, maxLines = 2) => {
      const maxChars = Math.max(8, Math.floor(width / (size * 0.48)));
      const words = normalizeText(value).split(" ").filter(Boolean);
      const lines: string[] = [];
      let line = "";
      words.forEach((word) => {
        const next = line ? `${line} ${word}` : word;
        if (next.length <= maxChars) {
          line = next;
          return;
        }
        if (line) lines.push(line);
        line = word;
      });
      if (line) lines.push(line);
      const clipped = lines.slice(0, maxLines);
      if (lines.length > maxLines && clipped.length > 0) clipped[clipped.length - 1] = `${clipped[clipped.length - 1].slice(0, Math.max(0, maxChars - 3))}...`;
      return clipped.length > 0 ? clipped : [""];
    };
    const addPage = () => {
      if (commands.length > 0) pages.push(commands);
      commands = [];
      y = pageHeight - margin;
    };

    const addTitle = () => {
      addRect(0, pageHeight - 78, pageWidth, 78, [0.15, 0.42, 0.24]);
      addText(margin, pageHeight - 42, `${t("terms.history")} - ${selectedField.name}`, 18, [1, 1, 1], "F2");
      addText(margin, pageHeight - 61, new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date()), 8.5, [0.88, 0.95, 0.89]);
      y = pageHeight - 100;
    };

    addTitle();
    const detailColumnWidth = (innerWidth - 12) / 2;
    fieldExportDetails.forEach(([label, value], index) => {
      const x = margin + (index % 2) * (detailColumnWidth + 12);
      const row = Math.floor(index / 2);
      const cardY = y - row * 47;
      addRect(x, cardY - 28, detailColumnWidth, 39, [0.96, 0.98, 0.95]);
      addText(x + 8, cardY - 2, label, 7.5, [0.38, 0.45, 0.4], "F2");
      wrapText(value || "-", detailColumnWidth - 16, 8.2, 2).forEach((line, lineIndex) => {
        addText(x + 8, cardY - 15 - lineIndex * 10, line, 8.2, [0.1, 0.16, 0.12]);
      });
    });
    y -= Math.ceil(fieldExportDetails.length / 2) * 47 + 14;

    const columnWidths = [58, 70, 104, 82, 72, 50, 70, 82, 56, 142];
    let runningX = margin;
    const pdfColumns = historyExportColumns.map((column, index) => {
      const x = runningX;
      runningX += columnWidths[index];
      return { ...column, x, pdfWidth: columnWidths[index] - 4 };
    });
    const addTableHeader = () => {
      addRect(margin, y - 13, innerWidth, 18, [0.91, 0.95, 0.89]);
      pdfColumns.forEach((column) => addText(column.x + 2, y - 7, wrapText(column.header, column.pdfWidth, 6.4, 1)[0], 6.4, [0.1, 0.25, 0.14], "F2"));
      y -= 20;
    };
    addTableHeader();
    fieldHistoryRows.forEach((row, rowIndex) => {
      const rowHeight = 28;
      if (y < margin + rowHeight) {
        addPage();
        addTitle();
        addTableHeader();
      }
      if (rowIndex % 2 === 0) addRect(margin, y - 20, innerWidth, rowHeight, [0.99, 1, 0.98]);
      pdfColumns.forEach((column) => {
        wrapText(column.value(row), column.pdfWidth, 6.2, 2).forEach((line, lineIndex) => {
          addText(column.x + 2, y - 2 - lineIndex * 8.5, line, 6.2, [0.14, 0.22, 0.17]);
        });
      });
      addLine(margin, y - 21, pageWidth - margin, y - 21, [0.88, 0.92, 0.86]);
      y -= rowHeight;
    });
    addPage();
    const objects: Uint8Array[] = [
      encoder.encode("<< /Type /Catalog /Pages 2 0 R >>"),
      encoder.encode(""),
      encoder.encode("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
      encoder.encode("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),
    ];
    const pageRefs: string[] = [];
    pages.forEach((content) => {
      const pageObjectNumber = objects.length + 1;
      const contentObjectNumber = objects.length + 2;
      pageRefs.push(`${pageObjectNumber} 0 R`);
      objects.push(encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`));
      const header = encoder.encode(`<< /Length ${content.length} >>\nstream\n`);
      const footer = encoder.encode("\nendstream");
      const stream = new Uint8Array(header.length + content.length + footer.length);
      stream.set(header, 0);
      stream.set(new Uint8Array(content), header.length);
      stream.set(footer, header.length + content.length);
      objects.push(stream);
    });
    objects[1] = encoder.encode(`<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`);
    const pdfParts: Uint8Array[] = [encoder.encode("%PDF-1.4\n")];
    const offsets: number[] = [];
    let byteLength = pdfParts[0].length;
    objects.forEach((object, index) => {
      offsets.push(byteLength);
      const prefix = encoder.encode(`${index + 1} 0 obj\n`);
      const suffix = encoder.encode("\nendobj\n");
      pdfParts.push(prefix, object, suffix);
      byteLength += prefix.length + object.length + suffix.length;
    });
    const xrefOffset = byteLength;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((offset) => {
      xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    pdfParts.push(encoder.encode(xref));
    const totalLength = pdfParts.reduce((sum, part) => sum + part.length, 0);
    const pdfBytes = new Uint8Array(totalLength);
    let offset = 0;
    pdfParts.forEach((part) => {
      pdfBytes.set(part, offset);
      offset += part.length;
    });
    downloadBlob(safeExportFilename(selectedField.name, "pdf"), "application/pdf", [pdfBytes.buffer as ArrayBuffer]);
  }

  const historyTable = (
    <div className="field-history-table">
      <div className="field-history-row field-history-head">
        <span>{t("fields.historyDate")}</span>
        <span>{t("fields.historyActivityTime")}</span>
        <span>{t("terms.job")}</span>
        <span>{t("fields.historyContractor")}</span>
        <span>{t("terms.task")}</span>
        <span>{t("terms.status")}</span>
        <span>{t("fields.historyActors")}</span>
        <span>{t("fields.historyResources")}</span>
        <span>{t("fields.historyWork")}</span>
        <span>{t("fields.historyNotes")}</span>
      </div>
      <div className="field-history-row field-history-filter">
        {(Object.keys(historyFilters) as Array<keyof FieldHistoryFilters>).map((key) => (
          <input
            aria-label={t(`fields.historyFilter.${key}`)}
            key={key}
            onChange={(event) => updateHistoryFilter(key, event.target.value)}
            placeholder={t(`fields.historyFilter.${key}`)}
            value={historyFilters[key]}
          />
        ))}
      </div>
      {filteredFieldHistoryRows.map((row) => (
        <div className="field-history-row field-history-data" key={row.id}>
          <span>{row.date}</span>
          <span>{row.activityTime}</span>
          <span>{row.job}</span>
          <span>{row.contractor}</span>
          <span>{row.task}</span>
          <span>{row.statusValue ? <StatusBadge status={row.statusValue} /> : row.status}</span>
          <span>{row.actors}</span>
          <span>{row.resources}</span>
          <span>{row.work || "-"}</span>
          <span>{row.note}</span>
        </div>
      ))}
      {filteredFieldHistoryRows.length === 0 && <p className="muted job-table-empty">{t("fields.noHistoryMatches")}</p>}
    </div>
  );

  function calculateCenter(points: GeoPoint[]) {
    if (points.length === 0) return selectedField.center;
    const totals = points.reduce(
      (sum, point) => ({ lat: sum.lat + point.lat, lng: sum.lng + point.lng }),
      { lat: 0, lng: 0 },
    );
    return {
      lat: totals.lat / points.length,
      lng: totals.lng / points.length,
    };
  }

  function updateSelectedBoundary(boundary: GeoPoint[]) {
    const center = calculateCenter(boundary);
    setBoundaryOverrides((current) => ({
      ...current,
      [selectedField.id]: boundary,
    }));
    updateField(selectedField.id, { boundary, center });
  }

  function updateFormValue(key: keyof typeof fieldForm, value: string) {
    setFieldForm((current) => ({ ...current, [key]: value }));
  }

  function addContractorRelease(contractorId = releaseContractorToAdd) {
    if (!contractorId) return;
    const currentIds = selectedField.releasedContractorIds ?? [];
    if (currentIds.includes(contractorId)) return;
    const releasedContractorIds = [...currentIds, contractorId];
    updateField(selectedField.id, { releasedContractorIds });
    setReleaseContractorToAdd("");
  }

  function removeContractorRelease(contractorId: string) {
    const releasedContractorIds = (selectedField.releasedContractorIds ?? []).filter((id) => id !== contractorId);
    updateField(selectedField.id, { releasedContractorIds });
  }

  function toggleBulkReleaseField(fieldId: string) {
    setBulkReleaseFieldIds((current) => current.includes(fieldId)
      ? current.filter((id) => id !== fieldId)
      : [...current, fieldId]);
  }

  function addBulkReleaseContractor(contractorId = bulkReleaseContractorToAdd) {
    if (!contractorId) return;
    setBulkReleaseContractorIds((current) => current.includes(contractorId) ? current : [...current, contractorId]);
    setBulkReleaseContractorToAdd("");
  }

  function removeBulkReleaseContractor(contractorId: string) {
    setBulkReleaseContractorIds((current) => current.filter((id) => id !== contractorId));
  }

  function selectAllVisibleFieldsForRelease() {
    setBulkReleaseFieldIds(visibleFields.map((field) => field.id));
  }

  function clearBulkReleaseSelection() {
    setBulkReleaseFieldIds([]);
  }

  function applyBulkRelease(remove = false) {
    if (bulkReleaseFieldIds.length === 0 || bulkReleaseContractorIds.length === 0) return;
    const fieldCount = bulkReleaseFieldIds.length;
    const contractorCount = bulkReleaseContractorIds.length;
    bulkReleaseFieldIds.forEach((fieldId) => {
      const field = fields.find((item) => item.id === fieldId);
      if (!field) return;
      const currentIds = field.releasedContractorIds ?? [];
      const releasedContractorIds = remove
        ? currentIds.filter((id) => !bulkReleaseContractorIds.includes(id))
        : Array.from(new Set([...currentIds, ...bulkReleaseContractorIds]));
      updateField(fieldId, { releasedContractorIds });
    });
    setBulkReleaseNotice("");
    window.setTimeout(() => {
      setBulkReleaseNoticeType(remove ? "removed" : "applied");
      setBulkReleaseNotice(t(remove ? "fields.bulkReleaseRemovedNotice" : "fields.bulkReleaseAppliedNotice", { fields: fieldCount, contractors: contractorCount }));
    }, 0);
  }

  function saveFieldMasterData() {
    const manualWorkPlan = fieldForm.manualWorkLabel.trim()
      ? {
          id: selectedField.manualWorkPlan?.id ?? crypto.randomUUID(),
          label: fieldForm.manualWorkLabel.trim(),
          dueDate: fieldForm.manualWorkDueDate || undefined,
          note: fieldForm.manualWorkNote.trim() || undefined,
          createdAt: selectedField.manualWorkPlan?.createdAt ?? new Date().toISOString(),
          mapStyle: {
            label: fieldForm.manualWorkLabel.trim(),
            color: fieldForm.manualWorkColor,
            pattern: fieldForm.manualWorkPattern as FieldMapPattern,
          },
        }
      : undefined;
    const manualPlanChanged = JSON.stringify(selectedField.manualWorkPlan ?? null) !== JSON.stringify(manualWorkPlan ?? null);
    const manualHistory = manualPlanChanged && manualWorkPlan
      ? [`${new Date().toLocaleDateString(i18n.language)}: ${t("fields.manualWorkPlannedHistory", { label: manualWorkPlan.label, date: manualWorkPlan.dueDate || t("report.notDocumented") })}`, ...selectedField.history]
      : selectedField.history;
    updateField(selectedField.id, {
      name: fieldForm.name,
      areaHa: Number(fieldForm.areaHa) || 0,
      crop: fieldForm.crop,
      tenure: fieldForm.tenure as "Eigentum" | "Pacht",
      mapStyle: {
        label: t("fields.normalMapStyle"),
        color: fieldForm.mapStyleColor,
        pattern: fieldForm.mapStylePattern as FieldMapPattern,
      },
      manualWorkPlan,
      history: manualHistory,
      accessPoint: {
        ...selectedField.accessPoint,
        label: fieldForm.accessLabel,
      },
      accessDescription: fieldForm.accessDescription,
    });
  }

  function updateAccessPoint(accessPoint: typeof selectedField.accessPoint) {
    updateField(selectedField.id, { accessPoint });
    setFieldForm((current) => ({ ...current, accessLabel: accessPoint.label }));
  }

  function addHazard(hazard: FieldHazard) {
    updateField(selectedField.id, { hazards: [...selectedField.hazards, hazard] });
  }

  function addAttachments(kind: FieldAttachment["kind"], fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    void uploadFieldAttachments(selectedField.id, kind, files);
  }

  function createNewField() {
    const reference = activeFields[0] ?? fields[0];
    const id = crypto.randomUUID();
    const center = reference?.center ?? { lat: 55.72, lng: 13.18 };
    const offsetCenter = { lat: center.lat + 0.002, lng: center.lng + 0.002 };
    addField({
      id,
      name: t("masterData.newFieldName"),
      areaHa: 1,
      crop: "",
      tenure: "Eigentum",
      center: offsetCenter,
      accessPoint: { ...offsetCenter, label: t("terms.accessPoint") },
      accessDescription: "",
      boundary: [
        { lat: offsetCenter.lat + 0.0005, lng: offsetCenter.lng - 0.0005 },
        { lat: offsetCenter.lat + 0.0005, lng: offsetCenter.lng + 0.0005 },
        { lat: offsetCenter.lat - 0.0005, lng: offsetCenter.lng + 0.0005 },
        { lat: offsetCenter.lat - 0.0005, lng: offsetCenter.lng - 0.0005 },
      ],
      hazards: [],
      attachments: [],
      restrictedZones: [],
      releasedContractorIds: [],
      history: [],
      mapStyle: { label: t("fields.normalMapStyle"), color: "#dff8cf", pattern: "none" },
    });
    onSelectField(id);
  }

  function archiveSelectedField() {
    archiveField(selectedField.id);
    const nextField = activeFields.find((field) => field.id !== selectedField.id);
    if (nextField) onSelectField(nextField.id);
  }

  function deleteSelectedField() {
    setFieldDeleteTarget({ id: selectedField.id, name: selectedField.name });
  }

  function confirmDeleteField() {
    if (!fieldDeleteTarget) return;
    deleteField(fieldDeleteTarget.id);
    const nextField = visibleFields.find((field) => field.id !== fieldDeleteTarget.id) ?? fields.find((field) => field.id !== fieldDeleteTarget.id);
    if (nextField) onSelectField(nextField.id);
    setFieldDeleteTarget(null);
  }

  return (
    <section className="fields-layout">
      <div className="panel field-list-panel">
        <div className="section-heading">
          <h2>{t("fields.fields")}</h2>
          <div className="field-list-stats" aria-label={t("fields.fieldStats")}>
            <span>{visibleFields.length} {t("nav.fields")}</span>
            <span>{formatArea(visibleFieldAreaHa, i18n.language)}</span>
          </div>
        </div>
        <div className="segmented-control archive-toggle">
          <button className={!showArchivedFields ? "active" : ""} onClick={() => setShowArchivedFields(false)} type="button">
            {t("archive.active")} · {activeFields.length}
          </button>
          <button className={showArchivedFields ? "active" : ""} onClick={() => setShowArchivedFields(true)} type="button">
            {t("archive.archived")} · {archivedFields.length}
          </button>
        </div>
        {permissions.canEditFields && !showArchivedFields && (
          <button className="primary-action wide" onClick={createNewField} type="button">
            {t("masterData.newField")}
          </button>
        )}
        {permissions.canEditFields && !showArchivedFields && (
          <button className="field-bulk-open" onClick={() => setIsBulkReleaseOpen(true)} type="button">
            <Plus size={16} />
            <span>{t("fields.bulkRelease")}</span>
            <small>{t("fields.bulkReleaseSelected", { count: bulkReleaseFieldIds.length })}</small>
          </button>
        )}
        <div className="field-list-scroll">
          {visibleFields.map((field) => (
            <button
              key={field.id}
              className={field.id === selected.id ? "field-list-item active" : "field-list-item"}
              onClick={() => onSelectField(field.id)}
              type="button"
            >
              <span className="map-dot" />
              <div>
                <strong>{field.name}</strong>
              </div>
            </button>
          ))}
          {visibleFields.length === 0 && <p className="muted">{showArchivedFields ? t("fields.noArchivedFields") : t("fields.noFields")}</p>}
        </div>
        {!permissions.canEditFields && <p className="permission-note">{t("permissions.fieldsReadOnly")}</p>}
      </div>

      <div className="field-detail">
        <FieldMap
          contextFields={activeFields}
          editable={permissions.canEditFields && !showArchivedFields}
          field={selected}
          fieldMapStatuses={fieldMapStatuses}
          statuses={statusList}
          onBoundaryChange={updateSelectedBoundary}
          onAccessPointChange={updateAccessPoint}
          onHazardAdd={addHazard}
        />

        <div className="panel">
          <div className="section-heading">
            <h2>{selected.name}</h2>
            <span>{formatArea(selected.areaHa, i18n.language)}</span>
          </div>
          <div className="master-data-form">
            <div className="section-heading">
              <h2>{t("masterData.fieldMasterData")}</h2>
              {permissions.canEditFields && (
                <div className="modal-actions field-master-actions">
                  {!showArchivedFields && (
                    <button className="primary-action" onClick={saveFieldMasterData} type="button">
                      {t("masterData.saveChanges")}
                    </button>
                  )}
                  {!showArchivedFields && (
                    <button className="danger-action" onClick={archiveSelectedField} type="button">
                      <Archive size={16} /> {t("actions.archive")}
                    </button>
                  )}
                  <button className="danger-action" onClick={deleteSelectedField} type="button">
                    <Trash2 size={16} /> {t("actions.deletePermanent")}
                  </button>
                </div>
              )}
            </div>
            {!permissions.canEditFields && <p className="permission-note">{t("permissions.fieldsReadOnly")}</p>}
            <div className="form-row">
              <label>
                {t("terms.fieldParcel")}
                <input disabled={!permissions.canEditFields || showArchivedFields} value={fieldForm.name} onChange={(event) => updateFormValue("name", event.target.value)} />
              </label>
              <label>
                {t("terms.field")} ha
                <input disabled={!permissions.canEditFields || showArchivedFields} value={fieldForm.areaHa} onChange={(event) => updateFormValue("areaHa", event.target.value)} type="number" min="0" step="0.1" />
              </label>
              <label>
                {t("fields.crop")}
                <select disabled={!permissions.canEditFields || showArchivedFields} value={fieldForm.crop} onChange={(event) => updateFormValue("crop", event.target.value)}>
                  {fieldForm.crop.trim() && !cropSuggestions.includes(fieldForm.crop.trim()) && (
                    <option value={fieldForm.crop}>{fieldForm.crop}</option>
                  )}
                  {cropSuggestions.map((crop) => <option key={crop} value={crop}>{crop}</option>)}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                {t("fields.ownership")}
                <select disabled={!permissions.canEditFields || showArchivedFields} value={fieldForm.tenure} onChange={(event) => updateFormValue("tenure", event.target.value)}>
                  <option value="Eigentum">{t("masterData.owned")}</option>
                  <option value="Pacht">{t("masterData.leased")}</option>
                </select>
              </label>
              <label>
                {t("terms.accessPoint")}
                <input disabled={!permissions.canEditFields || showArchivedFields} value={fieldForm.accessLabel} onChange={(event) => updateFormValue("accessLabel", event.target.value)} />
              </label>
              <label>
                {t("terms.accessInstructions")}
                <input disabled={!permissions.canEditFields || showArchivedFields} value={fieldForm.accessDescription} onChange={(event) => updateFormValue("accessDescription", event.target.value)} />
              </label>
            </div>
            <div className="field-map-style-box">
              <strong>{t("fields.mapDisplay")}</strong>
              <div className="form-row">
                <label>
                  {t("fields.normalMapColor")}
                  <input disabled={!permissions.canEditFields || showArchivedFields} value={fieldForm.mapStyleColor} onChange={(event) => updateFormValue("mapStyleColor", event.target.value)} type="color" />
                </label>
                <label>
                  {t("mapStatus.pattern")}
                  <select disabled={!permissions.canEditFields || showArchivedFields} value={fieldForm.mapStylePattern} onChange={(event) => updateFormValue("mapStylePattern", event.target.value)}>
                    {fieldMapPatterns.map((pattern) => <option key={pattern} value={pattern}>{t(`mapStatus.patterns.${pattern}`)}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div className="field-map-style-box">
              <strong>{t("fields.manualWorkPlan")}</strong>
              <div className="form-row">
                <label>
                  {t("fields.manualWorkLabel")}
                  <input disabled={!permissions.canEditFields || showArchivedFields} placeholder={t("fields.manualWorkPlaceholder")} value={fieldForm.manualWorkLabel} onChange={(event) => updateFormValue("manualWorkLabel", event.target.value)} />
                </label>
                <label>
                  {t("fields.manualWorkDueDate")}
                  <input disabled={!permissions.canEditFields || showArchivedFields || !fieldForm.manualWorkLabel.trim()} value={fieldForm.manualWorkDueDate} onChange={(event) => updateFormValue("manualWorkDueDate", event.target.value)} type="date" />
                </label>
                <label>
                  {t("fields.manualWorkColor")}
                  <input disabled={!permissions.canEditFields || showArchivedFields || !fieldForm.manualWorkLabel.trim()} value={fieldForm.manualWorkColor} onChange={(event) => updateFormValue("manualWorkColor", event.target.value)} type="color" />
                </label>
              </div>
              <div className="form-row">
                <label>
                  {t("mapStatus.pattern")}
                  <select disabled={!permissions.canEditFields || showArchivedFields || !fieldForm.manualWorkLabel.trim()} value={fieldForm.manualWorkPattern} onChange={(event) => updateFormValue("manualWorkPattern", event.target.value)}>
                    {fieldMapPatterns.map((pattern) => <option key={pattern} value={pattern}>{t(`mapStatus.patterns.${pattern}`)}</option>)}
                  </select>
                </label>
                <label>
                  {t("terms.notes")}
                  <input disabled={!permissions.canEditFields || showArchivedFields || !fieldForm.manualWorkLabel.trim()} value={fieldForm.manualWorkNote} onChange={(event) => updateFormValue("manualWorkNote", event.target.value)} />
                </label>
              </div>
            </div>
            <div className="field-release-box">
              <div>
                <strong>{t("fields.contractorRelease")}</strong>
                <span>{t("fields.contractorReleaseHint")}</span>
              </div>
              {contractorOrganizations.length === 0 ? (
                <span className="muted">{t("fields.noContractorsForRelease")}</span>
              ) : (
                <>
                  <div className="field-release-chip-row">
                    {(selected.releasedContractorIds ?? []).map((contractorId) => {
                      const organization = contractorOrganizations.find((item) => item.id === contractorId);
                      if (!organization) return null;
                      return (
                        <span className="field-release-chip" key={contractorId}>
                          {organization.name}
                          {permissions.canEditFields && !showArchivedFields && (
                            <button onClick={() => removeContractorRelease(contractorId)} type="button"><X size={14} /></button>
                          )}
                        </span>
                      );
                    })}
                    {(selected.releasedContractorIds ?? []).length === 0 && <span className="muted">{t("fields.noContractorSelected")}</span>}
                  </div>
                  {permissions.canEditFields && !showArchivedFields && (
                    <div className="field-release-add-row">
                      <select value={releaseContractorToAdd} onChange={(event) => setReleaseContractorToAdd(event.target.value)}>
                        <option value="">{t("fields.selectContractorToRelease")}</option>
                        {contractorOrganizations
                          .filter((organization) => !(selected.releasedContractorIds ?? []).includes(organization.id))
                          .map((organization) => (
                            <option key={organization.id} value={organization.id}>{organization.name}</option>
                          ))}
                      </select>
                      <button className="secondary-action" disabled={!releaseContractorToAdd} onClick={() => addContractorRelease()} type="button">
                        <Plus size={16} /> {t("fields.addContractorRelease")}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="field-status-box">
            <strong>{t("fields.openJobsOnField")}</strong>
            {selectedSubtasks.length === 0 ? (
              <span className="muted">{t("fields.noOpenSubtasks")}</span>
            ) : (
              selectedSubtasks.map((subtask) => (
                <span key={subtask.id}>
                  {getTask(subtask, jobs)?.name} <StatusBadge status={subtask.status} />
                </span>
              ))
            )}
          </div>
          <div className="field-geo-detail-grid">
            <div className="driver-hazards-panel">
              <strong>{t("terms.hazards")}</strong>
              <FieldHazards compact hazards={selected.hazards} />
            </div>
          </div>
          <div className="attachment-list">
            <div className="section-heading compact-heading">
              <strong>{t("mapEdit.attachments")}</strong>
              <div className="attachment-toolbar">
                {permissions.canEditFields && !showArchivedFields && (
                  <>
                    <input
                      accept="image/*"
                      hidden
                      multiple
                      onChange={(event) => {
                        addAttachments("photo", event.target.files);
                        event.target.value = "";
                      }}
                      ref={photoInputRef}
                      type="file"
                    />
                    <input
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*,application/pdf"
                      hidden
                      multiple
                      onChange={(event) => {
                        addAttachments("document", event.target.files);
                        event.target.value = "";
                      }}
                      ref={documentInputRef}
                      type="file"
                    />
                    <button className="secondary-action" onClick={() => photoInputRef.current?.click()} type="button"><Camera size={15} /> {t("mapEdit.addPhoto")}</button>
                    <button className="secondary-action" onClick={() => documentInputRef.current?.click()} type="button"><FileArchive size={15} /> {t("mapEdit.addDocument")}</button>
                  </>
                )}
                <div className="segmented-control">
                  <button className={!showArchivedAttachments ? "active" : ""} onClick={() => setShowArchivedAttachments(false)} type="button">
                    {t("archive.active")}
                  </button>
                  <button className={showArchivedAttachments ? "active" : ""} onClick={() => setShowArchivedAttachments(true)} type="button">
                    {t("archive.archived")}
                  </button>
                </div>
              </div>
            </div>
            {selected.attachments.filter((attachment) => showArchivedAttachments ? attachment.archivedAt : !attachment.archivedAt).length === 0 ? (
              <span className="muted">{t("mapEdit.noAttachments")}</span>
            ) : (
              selected.attachments.filter((attachment) => showArchivedAttachments ? attachment.archivedAt : !attachment.archivedAt).map((attachment) => (
                <span key={attachment.id}>
                  {attachment.kind === "photo" && attachment.placeholderUrl ? (
                    <img alt={attachment.name} className="attachment-thumb" src={attachment.placeholderUrl} />
                  ) : attachment.kind === "photo" ? (
                    <Camera size={16} />
                  ) : (
                    <FileArchive size={16} />
                  )}
                  {attachment.placeholderUrl ? (
                    <a href={attachment.placeholderUrl} rel="noreferrer" target="_blank">{attachment.name}</a>
                  ) : (
                    attachment.name
                  )}
                  {attachment.sizeBytes ? ` · ${Math.round(attachment.sizeBytes / 1024)} KB` : ""}
                  {permissions.canEditFields && !showArchivedAttachments && (
                    <button className="inline-icon-button" onClick={() => archiveFieldAttachment(selected.id, attachment.id)} title={t("actions.archive")} type="button">
                      <Archive size={15} />
                    </button>
                  )}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <div className="section-heading">
            <h2>{t("terms.history")}</h2>
            <button className="primary-action" onClick={() => setIsHistoryModalOpen(true)} type="button">
              <Wheat size={18} /> {t("fields.openHistory")}
            </button>
          </div>
          <p className="muted">{t("fields.historyRows", { count: filteredFieldHistoryRows.length })}</p>
          <div className="field-history-preview">
            {historyPreviewRows.length === 0 ? (
              <span className="muted">{t("resourceHistory.empty")}</span>
            ) : (
              historyPreviewRows.map((row) => (
                <div className="field-history-preview-row" key={row.id}>
                  <span>{row.date}</span>
                  <strong>{row.task}</strong>
                  <span>{[row.status, row.work].filter(Boolean).join(" · ")}</span>
                  <span>{row.note}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      {isHistoryModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal field-history-modal" role="dialog" aria-modal="true" aria-labelledby="field-history-modal-title">
            <div className="section-heading">
              <div>
                <h2 id="field-history-modal-title">{t("terms.history")} · {selected.name}</h2>
                <span>{t("fields.historyRows", { count: filteredFieldHistoryRows.length })}</span>
              </div>
              <div className="modal-actions field-history-export-actions">
                <button className="secondary-action" onClick={downloadHistoryExcel} type="button">
                  <FileSpreadsheet size={16} /> Excel
                </button>
                <button className="secondary-action" onClick={downloadHistoryPdf} type="button">
                  <FileText size={16} /> PDF
                </button>
                <button className="secondary-action icon-action" onClick={() => setIsHistoryModalOpen(false)} type="button">
                  <X size={18} />
                </button>
              </div>
            </div>
            {historyTable}
          </div>
        </div>
      )}
      {isBulkReleaseOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal field-bulk-modal" role="dialog" aria-modal="true" aria-labelledby="field-bulk-release-title">
            <div className="section-heading">
              <div>
                <h2 id="field-bulk-release-title">{t("fields.bulkRelease")}</h2>
                <span>{t("fields.bulkReleaseSelected", { count: bulkReleaseFieldIds.length })}</span>
              </div>
              <button className="secondary-action icon-action" onClick={() => setIsBulkReleaseOpen(false)} type="button">
                <X size={18} />
              </button>
            </div>
            <div className="field-bulk-summary">
              <span>{t("fields.bulkReleaseSelected", { count: bulkReleaseFieldIds.length })}</span>
              <span>{bulkReleaseContractorIds.length} {t("masterData.contractorOrganizations")}</span>
            </div>
            {bulkReleaseNotice && <p className={bulkReleaseNoticeType === "removed" ? "field-bulk-notice removed" : "field-bulk-notice"}>{bulkReleaseNotice}</p>}
            <div className="field-bulk-dialog-grid">
              <div className="field-bulk-dialog-section">
                <div className="field-bulk-section-head">
                  <strong>{t("fields.fields")}</strong>
                  <span>{visibleFields.length}</span>
                </div>
                <div className="field-bulk-mini-actions">
                  <button className="secondary-action" onClick={selectAllVisibleFieldsForRelease} type="button">{t("fields.selectAllVisible")}</button>
                  <button className="secondary-action" onClick={clearBulkReleaseSelection} type="button">{t("fields.clearSelection")}</button>
                </div>
                <div className="field-bulk-field-list">
                  {visibleFields.map((field) => (
                    <label className={bulkReleaseFieldIds.includes(field.id) ? "field-bulk-field active" : "field-bulk-field"} key={field.id}>
                      <input
                        checked={bulkReleaseFieldIds.includes(field.id)}
                        onChange={() => toggleBulkReleaseField(field.id)}
                        type="checkbox"
                      />
                      <span>
                        <strong>{field.name}</strong>
                        <small>{formatArea(field.areaHa, i18n.language)} · {field.crop}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="field-bulk-dialog-section">
                <div className="field-bulk-section-head">
                  <strong>{t("fields.contractorRelease")}</strong>
                  <span>{bulkReleaseContractorIds.length}</span>
                </div>
                {contractorOrganizations.length === 0 ? (
                  <span className="muted">{t("fields.noContractorsForRelease")}</span>
                ) : (
                  <>
                    <div className="field-release-add-row">
                      <select value={bulkReleaseContractorToAdd} onChange={(event) => setBulkReleaseContractorToAdd(event.target.value)}>
                        <option value="">{t("fields.selectContractorToRelease")}</option>
                        {contractorOrganizations
                          .filter((organization) => !bulkReleaseContractorIds.includes(organization.id))
                          .map((organization) => (
                            <option key={organization.id} value={organization.id}>{organization.name}</option>
                          ))}
                      </select>
                      <button className="secondary-action" disabled={!bulkReleaseContractorToAdd} onClick={() => addBulkReleaseContractor()} type="button">
                        <Plus size={16} /> {t("fields.addContractorRelease")}
                      </button>
                    </div>
                    <div className="field-release-chip-row">
                      {bulkReleaseContractorIds.map((contractorId) => {
                        const organization = contractorOrganizations.find((item) => item.id === contractorId);
                        if (!organization) return null;
                        return (
                          <span className="field-release-chip" key={contractorId}>
                            {organization.name}
                            <button onClick={() => removeBulkReleaseContractor(contractorId)} type="button"><X size={14} /></button>
                          </span>
                        );
                      })}
                      {bulkReleaseContractorIds.length === 0 && <span className="muted">{t("fields.noContractorSelected")}</span>}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button className="secondary-action" onClick={() => setIsBulkReleaseOpen(false)} type="button">{t("actions.cancel")}</button>
              <button className="danger-action" disabled={bulkReleaseFieldIds.length === 0 || bulkReleaseContractorIds.length === 0} onClick={() => applyBulkRelease(true)} type="button">{t("fields.removeBulkRelease")}</button>
              <button className="primary-action" disabled={bulkReleaseFieldIds.length === 0 || bulkReleaseContractorIds.length === 0} onClick={() => applyBulkRelease(false)} type="button">{t("fields.applyBulkRelease")}</button>
            </div>
          </div>
        </div>
      )}
      {fieldDeleteTarget && (
        <div className="modal-backdrop" role="presentation">
          <div className="resource-modal warning-modal" role="dialog" aria-modal="true">
            <div className="section-heading">
              <h2>{t("actions.deletePermanent")}</h2>
              <button className="secondary-action icon-action" onClick={() => setFieldDeleteTarget(null)} type="button">×</button>
            </div>
            <p>{t("archive.confirmPermanentDelete", { item: fieldDeleteTarget.name })}</p>
            <div className="modal-actions">
              <button className="secondary-action" onClick={() => setFieldDeleteTarget(null)} type="button">{t("actions.cancel")}</button>
              <button className="danger-action" onClick={confirmDeleteField} type="button"><Trash2 size={16} /> {t("actions.deletePermanent")}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
