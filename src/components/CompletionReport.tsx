import { Archive, CheckCircle2, Download, FileSpreadsheet, FileText, ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppData } from "../data/DataContext";
import { formatArea, formatUnit } from "../i18n/format";
import type { Job, JobCompletionStatus, Organization, Subtask, TaskTemplate } from "../types";
import { ReportMapSummary } from "./ReportMapSummary";
import { FieldName, ProgressBar } from "./shared";

type CompletionFilterStatus = "all" | "open" | "review" | "problem" | "checked" | "billable" | "invoiced";
type BillingUnit = "ha" | "hour" | "trip" | "quantity" | "flat";
type TaskBillingCondition = {
  billingUnit: BillingUnit;
  price?: number;
  currency?: string;
  validFrom?: string;
  validTo?: string;
};

const taskBillingMarker = "FM_TASK_BILLING:";
const customerConditionsMarker = "FM_CUSTOMER_CONDITIONS:";

function parseMarkerJson<T>(value: string | undefined, marker: string, fallback: T): T {
  const line = (value ?? "").split("\n").find((item) => item.startsWith(marker));
  if (!line) return fallback;
  try {
    return JSON.parse(line.slice(marker.length)) as T;
  } catch {
    return fallback;
  }
}

function billingConditionFromTaskTemplate(taskTemplate?: TaskTemplate): TaskBillingCondition {
  if (!taskTemplate) return { billingUnit: "ha", currency: "SEK" };
  const markerCondition = parseMarkerJson<TaskBillingCondition>(taskTemplate.resourceHint, taskBillingMarker, { billingUnit: taskTemplate.billingUnit ?? "ha", currency: "SEK" });
  return {
    ...markerCondition,
    billingUnit: taskTemplate.billingUnit ?? markerCondition.billingUnit ?? "ha",
    price: taskTemplate.standardPrice ?? markerCondition.price,
    currency: taskTemplate.standardPriceCurrency ?? markerCondition.currency ?? "SEK",
    validFrom: taskTemplate.standardPriceValidFrom ?? markerCondition.validFrom,
    validTo: taskTemplate.standardPriceValidTo ?? markerCondition.validTo,
  };
}

function customerConditionsFromOrganization(organization?: Organization) {
  return parseMarkerJson<Record<string, TaskBillingCondition>>(organization?.notes, customerConditionsMarker, {});
}

function subtaskWorkedMinutes(subtask: Subtask) {
  if (typeof subtask.workedMinutes === "number") return Math.max(0, subtask.workedMinutes);
  if (!subtask.workStartedAt || !subtask.workEndedAt) return 0;
  const startedAt = new Date(subtask.workStartedAt).getTime();
  const endedAt = new Date(subtask.workEndedAt).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) return 0;
  return Math.round((endedAt - startedAt) / 60000);
}

function formatDuration(minutes: number, language: string) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  const numberFormat = new Intl.NumberFormat(language);
  return hours > 0 ? `${numberFormat.format(hours)} h ${numberFormat.format(rest)} min` : `${numberFormat.format(rest)} min`;
}

function formatMoneyValue(value: number, currency: string, language: string) {
  try {
    return new Intl.NumberFormat(language, { currency, style: "currency" }).format(value);
  } catch {
    return `${new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;
  }
}

function billingSummaryForJob(
  job: Job,
  doneArea: number,
  amount: number,
  trips: number,
  workedMinutes: number,
  taskTemplates: TaskTemplate[],
  organizations: Organization[],
  language: string,
  translate: (key: string) => string,
) {
  const firstTask = job.tasks[0];
  const matchingTemplate = taskTemplates.find((template) => template.id === firstTask?.id || template.name === firstTask?.name);
  const customer = organizations.find((organization) => organization.id === job.farmerOrganizationId || organization.name === job.customer);
  const customerConditions = customerConditionsFromOrganization(customer);
  const customerCondition = firstTask?.name ? customerConditions[firstTask.name] : undefined;
  const condition = customerCondition ?? billingConditionFromTaskTemplate(matchingTemplate);
  const billingUnit = condition.billingUnit ?? "ha";
  const billableQuantity = billingUnit === "hour"
    ? workedMinutes / 60
    : billingUnit === "trip"
      ? trips
      : billingUnit === "quantity"
        ? amount
        : billingUnit === "flat"
          ? 1
          : doneArea;
  const unitLabel = translate(`pricing.units.${billingUnit}`);
  const currency = condition.currency ?? "SEK";
  const quantityLabel = billingUnit === "flat"
    ? unitLabel
    : `${new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(billableQuantity)} ${unitLabel}`;
  const priceLabel = typeof condition.price === "number"
    ? `${formatMoneyValue(condition.price, currency, language)} / ${unitLabel}`
    : translate("pricing.noCondition");
  const amountLabel = typeof condition.price === "number"
    ? formatMoneyValue(billableQuantity * condition.price, currency, language)
    : "-";
  const validity = [condition.validFrom, condition.validTo].filter(Boolean).join(" - ");
  return {
    amountLabel,
    label: validity ? `${priceLabel} · ${validity}` : priceLabel,
    quantityLabel,
  };
}

export function CompletionReport({
  jobs,
  onArchiveJob,
  onUpdateJob,
  subtasks,
}: {
  jobs: Job[];
  onArchiveJob: (id: string) => void;
  onUpdateJob: (id: string, patch: Partial<Job>) => void;
  subtasks: Subtask[];
}) {
  const { t, i18n } = useTranslation();
  const { authProfile, currentRole, drivers, fields, organizations, taskTemplates } = useAppData();
  const [customerFilter, setCustomerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<CompletionFilterStatus>("all");
  const [expandedJobId, setExpandedJobId] = useState("");
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState("");
  const canManageCompletion = currentRole === "support_admin" || currentRole === "contractor_admin";
  const actorName = authProfile?.fullName ?? t("report.systemUser");
  const jobSummaries = useMemo(() => jobs.map((job) => {
    const related = subtasks.filter((subtask) => subtask.jobId === job.id);
    const doneCount = related.filter((subtask) => subtask.status === "erledigt").length;
    const problemCount = related.filter((subtask) => subtask.status === "Problem").length;
    const hasCompletionProcess = Boolean(job.completionStatus || job.invoiceNumber || job.archivedAt);
    const allDone = related.length > 0 && doneCount === related.length;
    const completionStatus: CompletionFilterStatus = job.completionStatus === "invoiced" || (job.archivedAt && job.invoiceNumber)
      ? "invoiced"
      : job.completionStatus === "billable"
        ? "billable"
        : job.completionStatus === "checked" || job.archivedAt
          ? "checked"
          : problemCount > 0 && hasCompletionProcess
            ? "problem"
            : job.completionStatus === "review" || allDone
              ? "review"
              : "open";
    const fieldArea = job.fieldIds.reduce((sum, fieldId) => sum + (fields.find((field) => field.id === fieldId)?.areaHa ?? 0), 0);
    const doneArea = related.reduce((sum, subtask) => sum + (subtask.doneHa ?? 0), 0);
    const amount = related.reduce((sum, subtask) => sum + (subtask.doneAmount ?? 0), 0);
    const trips = related.reduce((sum, subtask) => sum + (subtask.trips ?? 0), 0);
    const workedMinutes = related.reduce((sum, subtask) => sum + subtaskWorkedMinutes(subtask), 0);
    const billing = billingSummaryForJob(job, doneArea, amount, trips, workedMinutes, taskTemplates, organizations, i18n.language, (key) => t(key));
    const progress = Math.round(related.reduce((sum, subtask) => sum + subtask.progress, 0) / related.length) || 0;
    const driverNames = Array.from(new Set([
      ...related.flatMap((subtask) => subtask.activeDriverIds),
      ...related.flatMap((subtask) => subtask.performedDriverIds ?? []),
    ]))
      .map((id) => drivers.find((driver) => driver.id === id)?.name)
      .filter(Boolean)
      .join(", ") || t("report.open");
    return {
      job,
      related,
      fieldArea,
      doneArea,
      amount,
      trips,
      workedMinutes,
      billing,
      progress,
      driverNames,
      problemCount,
      doneCount,
      completionStatus,
      isCompletionRelevant: hasCompletionProcess || allDone,
    };
  }).filter((summary) => summary.isCompletionRelevant), [drivers, fields, i18n.language, jobs, organizations, subtasks, t, taskTemplates]);
  const customers = useMemo(() => Array.from(new Set(jobSummaries.map(({ job }) => job.customer).filter(Boolean))).sort((a, b) => a.localeCompare(b, i18n.language)), [i18n.language, jobSummaries]);
  const invoiceNumbers = useMemo(() => Array.from(new Set(jobSummaries
    .map(({ job }) => job.invoiceNumber?.trim())
    .filter((invoiceNumber): invoiceNumber is string => Boolean(invoiceNumber))))
    .sort((a, b) => b.localeCompare(a, i18n.language, { numeric: true })), [i18n.language, jobSummaries]);
  const activeInvoiceNumber = selectedInvoiceNumber || invoiceNumbers[0] || "";
  const filteredSummaries = jobSummaries.filter(({ completionStatus, job }) => (
    (customerFilter === "all" || job.customer === customerFilter)
    && (statusFilter === "all" || completionStatus === statusFilter)
  ));
  const counts = {
    all: jobSummaries.length,
    open: jobSummaries.filter((row) => row.completionStatus === "open").length,
    review: jobSummaries.filter((row) => row.completionStatus === "review").length,
    problem: jobSummaries.filter((row) => row.completionStatus === "problem").length,
    checked: jobSummaries.filter((row) => row.completionStatus === "checked").length,
    billable: jobSummaries.filter((row) => row.completionStatus === "billable").length,
    invoiced: jobSummaries.filter((row) => row.completionStatus === "invoiced").length,
  };
  function updateCompletionStatus(job: Job, status: JobCompletionStatus) {
    if (!canManageCompletion) return;
    const now = new Date().toISOString();
    const patch: Partial<Job> = {
      completionStatus: status,
      completionStatusChangedAt: now,
      completionStatusChangedBy: actorName,
    };
    if (status === "invoiced") {
      const invoiceNumber = window.prompt(t("report.invoiceNumberPrompt"), job.invoiceNumber ?? "");
      if (!invoiceNumber?.trim()) return;
      patch.invoiceNumber = invoiceNumber.trim();
      patch.invoiceDate = now;
    }
    onUpdateJob(job.id, patch);
  }

  function archiveInvoicedJob(job: Job) {
    if (!canManageCompletion || job.completionStatus !== "invoiced" || !job.invoiceNumber?.trim()) return;
    onArchiveJob(job.id);
  }

  function escapeHtml(value: string) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function printInvoiceAttachment(invoiceNumber: string) {
    const invoiceSummaries = jobSummaries.filter(({ job }) => job.invoiceNumber?.trim() === invoiceNumber);
    if (invoiceSummaries.length === 0) return;
    const createdAt = new Date().toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" });
    const totalArea = invoiceSummaries.reduce((sum, row) => sum + row.doneArea, 0);
    const totalAmount = invoiceSummaries.reduce((sum, row) => sum + row.amount, 0);
    const totalTrips = invoiceSummaries.reduce((sum, row) => sum + row.trips, 0);
    const customersForInvoice = Array.from(new Set(invoiceSummaries.map(({ job }) => job.customer).filter(Boolean))).join(", ");
    const fieldName = (fieldId: string) => fields.find((field) => field.id === fieldId)?.name ?? fieldId;
    const taskName = (job: Job, subtask: Subtask) => job.tasks.find((task) => task.id === subtask.taskId)?.name ?? subtask.taskId;
    const subtaskDriverNames = (subtask: Subtask, fallback: string) => Array.from(new Set([
      ...(subtask.performedDriverNames ?? []),
      ...(subtask.activeDriverNames ?? []),
    ])).filter(Boolean).join(", ") || fallback;
    const formatDate = (value?: string) => {
      if (!value) return "";
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" });
    };
    const rows = invoiceSummaries.map(({ amount, billing, doneArea, driverNames, fieldArea, job, progress, related, trips, workedMinutes }) => {
      const detailRows = related.map((subtask) => `
        <tr>
          <td>${escapeHtml(fieldName(subtask.fieldId))}</td>
          <td>${escapeHtml(taskName(job, subtask))}</td>
          <td>${escapeHtml(subtask.status)}</td>
          <td>${subtask.progress}%</td>
          <td>${escapeHtml(subtaskDriverNames(subtask, driverNames))}</td>
          <td>${subtask.doneHa ? escapeHtml(formatArea(subtask.doneHa, i18n.language)) : "-"}</td>
          <td>${subtask.doneAmount ? escapeHtml(formatUnit(subtask.doneAmount, subtask.targetUnit ?? "", i18n.language)) : "-"}</td>
          <td>${subtask.trips ?? "-"}</td>
          <td>${escapeHtml(formatDate(subtask.completedAt ?? subtask.statusChangedAt ?? subtask.updatedAt))}</td>
        </tr>
      `).join("");
      return `
        <section class="job-section">
          <div class="job-heading">
            <div>
              <h2>${escapeHtml(job.jobNumber ? `${job.jobNumber} · ${job.title}` : job.title)}</h2>
              <p>${escapeHtml([job.customer, job.timeWindow].filter(Boolean).join(" · "))}</p>
            </div>
            <strong>${progress}%</strong>
          </div>
          <div class="summary-grid">
            <div><span>${escapeHtml(t("report.plannedFields"))}</span><strong>${job.fieldIds.length} (${escapeHtml(formatArea(fieldArea, i18n.language))})</strong></div>
            <div><span>${escapeHtml(t("report.completedArea"))}</span><strong>${escapeHtml(formatArea(doneArea, i18n.language))}</strong></div>
            <div><span>${escapeHtml(t("report.completedQuantity"))}</span><strong>${escapeHtml(formatUnit(amount, "m³", i18n.language))} · ${trips} ${escapeHtml(t("metrics.Fuhren"))}</strong></div>
            <div><span>${escapeHtml(t("report.drivers"))}</span><strong>${escapeHtml(driverNames)}</strong></div>
            <div><span>${escapeHtml(t("pricing.timeRecorded"))}</span><strong>${escapeHtml(formatDuration(workedMinutes, i18n.language))}</strong></div>
            <div><span>${escapeHtml(t("pricing.billingBasis"))}</span><strong>${escapeHtml(billing.label)}</strong></div>
            <div><span>${escapeHtml(t("pricing.billableQuantity"))}</span><strong>${escapeHtml(billing.quantityLabel)}</strong></div>
            <div><span>${escapeHtml(t("pricing.estimatedAmount"))}</span><strong>${escapeHtml(billing.amountLabel)}</strong></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(t("terms.field"))}</th>
                <th>${escapeHtml(t("terms.task"))}</th>
                <th>${escapeHtml(t("terms.status"))}</th>
                <th>${escapeHtml(t("terms.progress"))}</th>
                <th>${escapeHtml(t("report.drivers"))}</th>
                <th>${escapeHtml(t("report.completedArea"))}</th>
                <th>${escapeHtml(t("report.completedQuantity"))}</th>
                <th>${escapeHtml(t("metrics.Fuhren"))}</th>
                <th>${escapeHtml(t("report.completedAt"))}</th>
              </tr>
            </thead>
            <tbody>${detailRows}</tbody>
          </table>
        </section>
      `;
    }).join("");
    const html = `<!doctype html>
      <html lang="${escapeHtml(i18n.language)}">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(t("report.invoiceAttachmentTitle"))} ${escapeHtml(invoiceNumber)}</title>
          <style>
            @page { margin: 18mm; }
            body { color: #16231c; font-family: Inter, Arial, sans-serif; margin: 0; }
            .brand { color: #2f6b3e; font-size: 13px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
            h1 { font-size: 30px; margin: 8px 0 8px; }
            h2 { font-size: 18px; margin: 0; }
            p { color: #536258; margin: 4px 0 0; }
            .header { border-bottom: 4px solid #2f6b3e; margin-bottom: 18px; padding-bottom: 16px; }
            .meta-grid, .summary-grid { display: grid; gap: 10px; grid-template-columns: repeat(4, 1fr); margin-top: 14px; }
            .meta-grid div, .summary-grid div { border: 1px solid #c9d9c4; border-radius: 8px; padding: 10px; }
            span { color: #536258; display: block; font-size: 11px; font-weight: 800; text-transform: uppercase; }
            strong { font-weight: 900; }
            .job-section { break-inside: avoid; border-top: 1px solid #dfe8da; margin-top: 22px; padding-top: 14px; }
            .job-heading { align-items: start; display: flex; justify-content: space-between; gap: 12px; }
            table { border-collapse: collapse; font-size: 11px; margin-top: 12px; width: 100%; }
            th { background: #eaf3e4; color: #24382d; text-align: left; }
            th, td { border-bottom: 1px solid #dfe8da; padding: 7px 6px; vertical-align: top; }
            tr:nth-child(even) td { background: #f7faf4; }
            .footer { border-top: 1px solid #c9d9c4; color: #536258; font-size: 11px; margin-top: 24px; padding-top: 8px; }
          </style>
        </head>
        <body>
          <header class="header">
            <div class="brand">Farm-Manager</div>
            <h1>${escapeHtml(t("report.invoiceAttachmentTitle"))}</h1>
            <p>${escapeHtml(t("report.invoiceAttachmentSubtitle"))}</p>
            <div class="meta-grid">
              <div><span>${escapeHtml(t("report.invoiceNumber"))}</span><strong>${escapeHtml(invoiceNumber)}</strong></div>
              <div><span>${escapeHtml(t("report.customerFilter"))}</span><strong>${escapeHtml(customersForInvoice || "-")}</strong></div>
              <div><span>${escapeHtml(t("report.jobsCount"))}</span><strong>${invoiceSummaries.length}</strong></div>
              <div><span>${escapeHtml(t("report.createdAt"))}</span><strong>${escapeHtml(createdAt)}</strong></div>
            </div>
            <div class="meta-grid">
              <div><span>${escapeHtml(t("report.completedArea"))}</span><strong>${escapeHtml(formatArea(totalArea, i18n.language))}</strong></div>
              <div><span>${escapeHtml(t("report.completedQuantity"))}</span><strong>${escapeHtml(formatUnit(totalAmount, "m³", i18n.language))}</strong></div>
              <div><span>${escapeHtml(t("metrics.Fuhren"))}</span><strong>${totalTrips}</strong></div>
              <div><span>${escapeHtml(t("report.completionStatus.invoiced"))}</span><strong>${escapeHtml(t("report.invoiceAttachment"))}</strong></div>
            </div>
          </header>
          ${rows}
          <footer class="footer">${escapeHtml(t("report.invoiceAttachmentFooter"))}</footer>
        </body>
      </html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, "_blank");
    if (!printWindow) URL.revokeObjectURL(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return (
    <section className="view-stack">
      <div className="panel completion-control-panel">
        <div className="section-heading">
          <div>
            <h2>{t("report.completionOverview")}</h2>
            <p>{t("report.completionHint")}</p>
          </div>
          <span>{filteredSummaries.length} / {jobSummaries.length}</span>
        </div>
        <div className="completion-metrics">
          <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")} type="button"><span>{t("report.statusAll")}</span><strong>{counts.all}</strong></button>
          <button className={statusFilter === "open" ? "active" : ""} onClick={() => setStatusFilter("open")} type="button"><span>{t("report.statusOpen")}</span><strong>{counts.open}</strong></button>
          <button className={statusFilter === "review" ? "active" : ""} onClick={() => setStatusFilter("review")} type="button"><span>{t("report.statusReview")}</span><strong>{counts.review}</strong></button>
          <button className={statusFilter === "problem" ? "active" : ""} onClick={() => setStatusFilter("problem")} type="button"><span>{t("report.statusProblem")}</span><strong>{counts.problem}</strong></button>
          <button className={statusFilter === "checked" ? "active" : ""} onClick={() => setStatusFilter("checked")} type="button"><span>{t("report.statusChecked")}</span><strong>{counts.checked}</strong></button>
          <button className={statusFilter === "billable" ? "active" : ""} onClick={() => setStatusFilter("billable")} type="button"><span>{t("report.statusBillable")}</span><strong>{counts.billable}</strong></button>
          <button className={statusFilter === "invoiced" ? "active" : ""} onClick={() => setStatusFilter("invoiced")} type="button"><span>{t("report.statusInvoiced")}</span><strong>{counts.invoiced}</strong></button>
        </div>
        <div className="completion-filter-row">
          <label>
            {t("report.customerFilter")}
            <select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}>
              <option value="all">{t("report.allCustomers")}</option>
              {customers.map((customer) => <option key={customer} value={customer}>{customer}</option>)}
            </select>
          </label>
          <label>
            {t("report.statusFilter")}
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CompletionFilterStatus)}>
              <option value="all">{t("report.statusAll")}</option>
              <option value="open">{t("report.statusOpen")}</option>
              <option value="review">{t("report.statusReview")}</option>
              <option value="problem">{t("report.statusProblem")}</option>
              <option value="checked">{t("report.statusChecked")}</option>
              <option value="billable">{t("report.statusBillable")}</option>
              <option value="invoiced">{t("report.statusInvoiced")}</option>
            </select>
          </label>
        </div>
        <div className="invoice-attachment-row">
          <strong>{t("report.invoiceAttachments")}</strong>
          <div>
            <select disabled={invoiceNumbers.length === 0} value={activeInvoiceNumber} onChange={(event) => setSelectedInvoiceNumber(event.target.value)}>
              {invoiceNumbers.length === 0 ? (
                <option value="">{t("report.noInvoiceNumbers")}</option>
              ) : (
                invoiceNumbers.map((invoiceNumber) => <option key={invoiceNumber} value={invoiceNumber}>{invoiceNumber}</option>)
              )}
            </select>
            <button disabled={!activeInvoiceNumber} onClick={() => activeInvoiceNumber && printInvoiceAttachment(activeInvoiceNumber)} type="button">
              <FileText size={16} /> PDF
            </button>
          </div>
        </div>
      </div>
      {filteredSummaries.length === 0 && (
        <div className="panel">
          <p className="muted">{t("report.noCompletionJobs")}</p>
        </div>
      )}
      {filteredSummaries.length > 0 && (
        <div className="panel completion-table-panel">
          <div className="completion-table">
            <div className="completion-table-row completion-table-header">
              <span>{t("jobs.jobNumberShort")}</span>
              <span>{t("terms.job")}</span>
              <span>{t("terms.customer")}</span>
              <span>{t("terms.status")}</span>
              <span>{t("terms.progress")}</span>
              <span>{t("pricing.timeRecorded")}</span>
              <span>{t("report.invoiceNumber")}</span>
              <span>{t("report.actions")}</span>
            </div>
            {filteredSummaries.map((summary) => {
              const { amount, billing, completionStatus, doneArea, doneCount, driverNames, fieldArea, job, problemCount, progress, related, trips, workedMinutes } = summary;
              const isExpanded = expandedJobId === job.id;
              return (
                <div className={`completion-table-item status-${completionStatus}`} key={job.id}>
                  <button className="completion-table-row completion-table-main-row" onClick={() => setExpandedJobId(isExpanded ? "" : job.id)} type="button">
                    <strong>{job.jobNumber ?? job.id}</strong>
                    <span>
                      <b>{job.title}</b>
                      <small>{job.timeWindow || t("time.noWindow")}</small>
                    </span>
                    <span>{job.customer}</span>
                    <span className={`status-badge completion-status status-${completionStatus}`}>{t(`report.completionStatus.${completionStatus}`)}</span>
                    <span>
                      <ProgressBar value={progress} />
                      <small>{doneCount}/{related.length} · {progress}%</small>
                    </span>
                    <span>{formatDuration(workedMinutes, i18n.language)}</span>
                    <span>{job.invoiceNumber || "-"}</span>
                    <span>{isExpanded ? t("report.hideDetails") : t("report.showDetails")}</span>
                  </button>
                  {isExpanded && (
                    <div className="completion-table-detail">
                      <div className="completion-workflow-row">
                        <div>
                          <strong>{t("report.workflowTitle")}</strong>
                          <span>
                            {job.completionStatusChangedAt
                              ? t("report.workflowChanged", {
                                by: job.completionStatusChangedBy ?? t("report.systemUser"),
                                time: new Date(job.completionStatusChangedAt).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }),
                              })
                              : t("report.workflowPending")}
                            {job.invoiceNumber ? ` · ${t("report.invoiceNumber")}: ${job.invoiceNumber}` : ""}
                          </span>
                        </div>
                        <div className="completion-workflow-actions">
                          <button disabled={!canManageCompletion || completionStatus === "open" || completionStatus === "problem"} onClick={() => updateCompletionStatus(job, "checked")} type="button">
                            <CheckCircle2 size={16} /> {t("report.markChecked")}
                          </button>
                          <button disabled={!canManageCompletion || completionStatus !== "checked"} onClick={() => updateCompletionStatus(job, "billable")} type="button">
                            <ReceiptText size={16} /> {t("report.markBillable")}
                          </button>
                          <button disabled={!canManageCompletion || completionStatus !== "billable"} onClick={() => updateCompletionStatus(job, "invoiced")} type="button">
                            <ReceiptText size={16} /> {t("report.markInvoiced")}
                          </button>
                          <button disabled={!canManageCompletion || completionStatus !== "invoiced" || Boolean(job.archivedAt)} onClick={() => archiveInvoicedJob(job)} type="button">
                            <Archive size={16} /> {t("actions.archive")}
                          </button>
                          <button onClick={() => job.invoiceNumber && printInvoiceAttachment(job.invoiceNumber)} disabled={!job.invoiceNumber} type="button">
                            <Download size={16} /> PDF
                          </button>
                          <button type="button">
                            <FileSpreadsheet size={16} /> Excel
                          </button>
                        </div>
                      </div>
                      <div className="report-grid">
                        <ReportItem label={t("report.completionProgress")} value={`${doneCount}/${related.length} · ${progress}%`} />
                        <ReportItem label={t("report.plannedFields")} value={`${job.fieldIds.length} (${formatArea(fieldArea, i18n.language)})`} />
                        <ReportItem label={t("report.completedArea")} value={formatArea(doneArea, i18n.language)} />
                        <ReportItem label={t("report.plannedQuantity")} value={job.tasks[0]?.plannedAmount ? formatUnit(fieldArea * job.tasks[0].plannedAmount, job.tasks[0].unit?.replace("/ha", "") ?? "", i18n.language) : t("terms.task")} />
                        <ReportItem label={t("report.completedQuantity")} value={`${formatUnit(amount, "m³", i18n.language)} · ${trips} ${t("metrics.Fuhren")}`} />
                        <ReportItem label={t("pricing.timeRecorded")} value={formatDuration(workedMinutes, i18n.language)} />
                        <ReportItem label={t("pricing.billingBasis")} value={billing.label} />
                        <ReportItem label={t("pricing.billableQuantity")} value={billing.quantityLabel} />
                        <ReportItem label={t("pricing.estimatedAmount")} value={billing.amountLabel} />
                        <ReportItem label={t("report.drivers")} value={driverNames} />
                        <ReportItem label={t("report.problems")} value={`${problemCount}`} />
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
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
