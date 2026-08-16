import { FileText, ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppData } from "../data/DataContext";
import { formatArea, formatUnit } from "../i18n/format";
import type { Job, Organization, Subtask, TaskTemplate } from "../types";

type BillingUnit = "ha" | "hour" | "trip" | "quantity" | "flat";

type TaskBillingCondition = {
  billingUnit: BillingUnit;
  price?: number;
  currency?: string;
  validFrom?: string;
  validTo?: string;
};

type InvoiceLine = {
  description: string;
  quantity: number;
  quantityLabel: string;
  unitLabel: string;
  unitPrice?: number;
  currency: string;
  netAmount?: number;
};

type InvoiceRecord = {
  invoiceNumber: string;
  invoiceDate: string;
  jobs: Job[];
  customer?: Organization;
  seller?: Organization;
  lines: InvoiceLine[];
  currency: string;
  netTotal: number;
  vatRate: number;
  vatAmount: number;
  grossTotal: number;
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

function organizationAddress(organization?: Organization) {
  if (!organization) return "";
  return organization.address
    || [
      organization.street,
      [organization.postalCode, organization.city].filter(Boolean).join(" "),
      organization.country,
    ].filter(Boolean).join(", ");
}

function escapeHtml(value: string | number | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isGermanOrganization(organization?: Organization) {
  const value = `${organization?.country ?? ""} ${organization?.vatId ?? ""}`.toLowerCase();
  return value.includes("deutschland") || value.includes("germany") || value.includes("de");
}

function vatRateForSeller(organization?: Organization) {
  return isGermanOrganization(organization) ? 0.19 : 0.25;
}

function formatMoney(value: number, currency: string, language: string) {
  try {
    return new Intl.NumberFormat(language, { currency, style: "currency" }).format(value);
  } catch {
    return `${new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;
  }
}

function nextInvoiceNumber(records: InvoiceRecord[]) {
  const year = new Date().getFullYear();
  const max = records
    .map((record) => record.invoiceNumber.match(new RegExp(`^${year}-(\\d+)$`))?.[1])
    .filter((value): value is string => Boolean(value))
    .reduce((currentMax, value) => Math.max(currentMax, Number(value)), 0);
  return `${year}-${String(max + 1).padStart(4, "0")}`;
}

function invoiceLegalText(seller: Organization | undefined, translate: (key: string) => string) {
  return isGermanOrganization(seller) ? translate("invoices.legalGermany") : translate("invoices.legalSweden");
}

export function InvoiceModule({
  jobs,
  onUpdateJob,
  subtasks,
}: {
  jobs: Job[];
  onUpdateJob: (id: string, patch: Partial<Job>) => void;
  subtasks: Subtask[];
}) {
  const { t, i18n } = useTranslation();
  const { authProfile, organizations, taskTemplates } = useAppData();
  const [customerFilter, setCustomerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "billable" | "invoiced">("all");
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState("");
  const currentOrganization = organizations.find((organization) => organization.id === authProfile?.organizationId);

  function lineForJob(job: Job): InvoiceLine {
    const related = subtasks.filter((subtask) => subtask.jobId === job.id);
    const firstTask = job.tasks[0];
    const matchingTemplate = taskTemplates.find((template) => template.id === firstTask?.id || template.name === firstTask?.name);
    const customer = organizations.find((organization) => organization.id === job.farmerOrganizationId || organization.name === job.customer);
    const customerCondition = firstTask?.name ? customerConditionsFromOrganization(customer)[firstTask.name] : undefined;
    const condition = customerCondition ?? billingConditionFromTaskTemplate(matchingTemplate);
    const doneArea = related.reduce((sum, subtask) => sum + (subtask.doneHa ?? 0), 0);
    const amount = related.reduce((sum, subtask) => sum + (subtask.doneAmount ?? 0), 0);
    const trips = related.reduce((sum, subtask) => sum + (subtask.trips ?? 0), 0);
    const workedMinutes = related.reduce((sum, subtask) => sum + subtaskWorkedMinutes(subtask), 0);
    const billingUnit = condition.billingUnit ?? "ha";
    const quantity = billingUnit === "hour"
      ? workedMinutes / 60
      : billingUnit === "trip"
        ? trips
        : billingUnit === "quantity"
          ? amount
          : billingUnit === "flat"
            ? 1
            : doneArea;
    const unitLabel = t(`pricing.units.${billingUnit}`);
    const currency = condition.currency ?? "SEK";
    const unitPrice = condition.price;
    return {
      description: [job.jobNumber, job.title, firstTask?.name].filter(Boolean).join(" · "),
      quantity,
      quantityLabel: billingUnit === "flat" ? unitLabel : `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(quantity)} ${unitLabel}`,
      unitLabel,
      unitPrice,
      currency,
      netAmount: typeof unitPrice === "number" ? quantity * unitPrice : undefined,
    };
  }

  const billableJobs = useMemo(() => jobs.filter((job) => job.completionStatus === "billable"), [jobs]);
  const invoiceRecords = useMemo(() => {
    const grouped = new Map<string, Job[]>();
    jobs
      .filter((job) => job.invoiceNumber?.trim())
      .forEach((job) => {
        const invoiceNumber = job.invoiceNumber?.trim() ?? "";
        grouped.set(invoiceNumber, [...(grouped.get(invoiceNumber) ?? []), job]);
      });
    return Array.from(grouped.entries()).map(([invoiceNumber, recordJobs]) => {
      const firstJob = recordJobs[0];
      const customer = organizations.find((organization) => organization.id === firstJob?.farmerOrganizationId || organization.name === firstJob?.customer);
      const seller = organizations.find((organization) => organization.id === firstJob?.contractorOrganizationId) ?? currentOrganization;
      const lines = recordJobs.map((job) => lineForJob(job));
      const currency = lines.find((line) => line.currency)?.currency ?? "SEK";
      const netTotal = lines.reduce((sum, line) => sum + (line.netAmount ?? 0), 0);
      const vatRate = vatRateForSeller(seller);
      const vatAmount = netTotal * vatRate;
      return {
        invoiceNumber,
        invoiceDate: firstJob?.invoiceDate ?? "",
        jobs: recordJobs,
        customer,
        seller,
        lines,
        currency,
        netTotal,
        vatRate,
        vatAmount,
        grossTotal: netTotal + vatAmount,
      };
    }).sort((a, b) => b.invoiceNumber.localeCompare(a.invoiceNumber, i18n.language, { numeric: true }));
  }, [currentOrganization, i18n.language, jobs, organizations, subtasks, taskTemplates]);

  const customers = Array.from(new Set([
    ...billableJobs.map((job) => job.customer),
    ...invoiceRecords.map((record) => record.customer?.name ?? record.jobs[0]?.customer),
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b, i18n.language));
  const filteredRecords = invoiceRecords.filter((record) => (
    (customerFilter === "all" || record.customer?.name === customerFilter || record.jobs.some((job) => job.customer === customerFilter))
    && (statusFilter === "all" || statusFilter === "invoiced")
  ));
  const filteredBillableJobs = billableJobs.filter((job) => (
    (customerFilter === "all" || job.customer === customerFilter)
    && (statusFilter === "all" || statusFilter === "billable")
  ));
  const activeInvoice = invoiceRecords.find((record) => record.invoiceNumber === selectedInvoiceNumber) ?? invoiceRecords[0];

  function createInvoice(job: Job) {
    const invoiceNumber = window.prompt(t("invoices.invoiceNumberPrompt"), nextInvoiceNumber(invoiceRecords));
    if (!invoiceNumber?.trim()) return;
    onUpdateJob(job.id, {
      completionStatus: "invoiced",
      completionStatusChangedAt: new Date().toISOString(),
      completionStatusChangedBy: authProfile?.fullName ?? authProfile?.email ?? t("report.systemUser"),
      invoiceDate: new Date().toISOString(),
      invoiceNumber: invoiceNumber.trim(),
    });
  }

  function printInvoice(record: InvoiceRecord) {
    const seller = record.seller;
    const customer = record.customer;
    const sellerAddress = organizationAddress(seller);
    const customerAddress = organizationAddress(customer);
    const invoiceDate = record.invoiceDate ? new Date(record.invoiceDate) : new Date();
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + 30);
    const rows = record.lines.map((line, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(line.description)}</td>
        <td>${escapeHtml(line.quantityLabel)}</td>
        <td>${line.unitPrice !== undefined ? escapeHtml(formatMoney(line.unitPrice, line.currency, i18n.language)) : "-"}</td>
        <td>${line.netAmount !== undefined ? escapeHtml(formatMoney(line.netAmount, line.currency, i18n.language)) : "-"}</td>
      </tr>
    `).join("");
    const html = `<!doctype html>
      <html lang="${escapeHtml(i18n.language)}">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(t("invoices.invoice"))} ${escapeHtml(record.invoiceNumber)}</title>
          <style>
            @page { margin: 16mm; }
            body { color: #17231c; font-family: Inter, Arial, sans-serif; margin: 0; }
            header { align-items: start; border-bottom: 4px solid #2f6b3e; display: flex; gap: 24px; justify-content: space-between; padding-bottom: 18px; }
            .logo { max-height: 70px; max-width: 180px; object-fit: contain; }
            .brand { color: #2f6b3e; font-size: 13px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
            h1 { font-size: 34px; margin: 16px 0 6px; }
            h2 { font-size: 15px; margin: 0 0 8px; text-transform: uppercase; }
            p { margin: 3px 0; }
            .muted { color: #59685e; }
            .address-grid, .meta-grid, .totals { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; margin-top: 20px; }
            .box { border: 1px solid #c9d9c4; border-radius: 8px; padding: 12px; }
            table { border-collapse: collapse; margin-top: 24px; width: 100%; }
            th { background: #eaf3e4; color: #23372c; text-align: left; }
            th, td { border-bottom: 1px solid #dfe8da; padding: 9px 8px; vertical-align: top; }
            td:nth-child(1), td:nth-child(3), td:nth-child(4), td:nth-child(5), th:nth-child(1), th:nth-child(3), th:nth-child(4), th:nth-child(5) { text-align: right; }
            .totals { grid-template-columns: 1fr 320px; }
            .total-lines div { display: flex; justify-content: space-between; padding: 5px 0; }
            .total-lines strong { font-size: 20px; }
            .legal, footer { border-top: 1px solid #c9d9c4; color: #59685e; font-size: 11px; margin-top: 24px; padding-top: 10px; }
            .billing { white-space: pre-line; }
          </style>
        </head>
        <body>
          <header>
            <div>
              <div class="brand">Farm-Manager</div>
              <h1>${escapeHtml(t("invoices.invoice"))}</h1>
              <p class="muted">${escapeHtml(t("invoices.invoiceNumber"))}: <strong>${escapeHtml(record.invoiceNumber)}</strong></p>
            </div>
            ${seller?.logoUrl ? `<img alt="" class="logo" src="${escapeHtml(seller.logoUrl)}" />` : ""}
          </header>
          <section class="address-grid">
            <div class="box">
              <h2>${escapeHtml(t("invoices.seller"))}</h2>
              <p><strong>${escapeHtml(seller?.name ?? "-")}</strong></p>
              <p>${escapeHtml(sellerAddress)}</p>
              <p>${escapeHtml([seller?.phone, seller?.email].filter(Boolean).join(" · "))}</p>
              <p>${escapeHtml(t("masterData.organizationNumber"))}: ${escapeHtml(seller?.organizationNumber ?? "-")}</p>
              <p>${escapeHtml(t("masterData.vatId"))}: ${escapeHtml(seller?.vatId ?? "-")}</p>
            </div>
            <div class="box">
              <h2>${escapeHtml(t("invoices.customer"))}</h2>
              <p><strong>${escapeHtml(customer?.name ?? record.jobs[0]?.customer ?? "-")}</strong></p>
              <p>${escapeHtml(customerAddress)}</p>
              <p>${escapeHtml([customer?.phone, customer?.email].filter(Boolean).join(" · "))}</p>
              <p>${escapeHtml(t("masterData.customerNumber"))}: ${escapeHtml(customer?.customerNumber ?? "-")}</p>
              <p>${escapeHtml(t("masterData.vatId"))}: ${escapeHtml(customer?.vatId ?? "-")}</p>
            </div>
          </section>
          <section class="meta-grid">
            <div class="box"><h2>${escapeHtml(t("invoices.invoiceDate"))}</h2><p>${escapeHtml(invoiceDate.toLocaleDateString(i18n.language))}</p></div>
            <div class="box"><h2>${escapeHtml(t("invoices.dueDate"))}</h2><p>${escapeHtml(dueDate.toLocaleDateString(i18n.language))}</p></div>
          </section>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>${escapeHtml(t("invoices.description"))}</th>
                <th>${escapeHtml(t("invoices.quantity"))}</th>
                <th>${escapeHtml(t("invoices.unitPrice"))}</th>
                <th>${escapeHtml(t("invoices.netAmount"))}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <section class="totals">
            <div class="box billing">
              <h2>${escapeHtml(t("invoices.paymentDetails"))}</h2>
              <p>${escapeHtml(seller?.billingDetails || t("invoices.noPaymentDetails"))}</p>
            </div>
            <div class="box total-lines">
              <div><span>${escapeHtml(t("invoices.netTotal"))}</span><span>${escapeHtml(formatMoney(record.netTotal, record.currency, i18n.language))}</span></div>
              <div><span>${escapeHtml(t("invoices.vat"))} ${Math.round(record.vatRate * 100)}%</span><span>${escapeHtml(formatMoney(record.vatAmount, record.currency, i18n.language))}</span></div>
              <div><strong>${escapeHtml(t("invoices.grossTotal"))}</strong><strong>${escapeHtml(formatMoney(record.grossTotal, record.currency, i18n.language))}</strong></div>
            </div>
          </section>
          <section class="legal">${escapeHtml(invoiceLegalText(seller, t))}</section>
          <footer>${escapeHtml(t("invoices.generatedFooter"))}</footer>
        </body>
      </html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const preview = window.open(url, "_blank");
    if (!preview) URL.revokeObjectURL(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return (
    <section className="view-stack invoices-view">
      <div className="panel invoices-control-panel">
        <div className="section-heading">
          <div>
            <h2>{t("invoices.title")}</h2>
            <p>{t("invoices.hint")}</p>
          </div>
          <span>{invoiceRecords.length} {t("invoices.outgoingBook")}</span>
        </div>
        <div className="invoice-filter-row">
          <label>{t("report.customerFilter")}<select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}>
            <option value="all">{t("report.allCustomers")}</option>
            {customers.map((customer) => <option key={customer} value={customer}>{customer}</option>)}
          </select></label>
          <label>{t("terms.status")}<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "billable" | "invoiced")}>
            <option value="all">{t("report.statusAll")}</option>
            <option value="billable">{t("report.statusBillable")}</option>
            <option value="invoiced">{t("report.statusInvoiced")}</option>
          </select></label>
          <label>{t("invoices.invoicePreview")}<select disabled={invoiceRecords.length === 0} value={selectedInvoiceNumber || activeInvoice?.invoiceNumber || ""} onChange={(event) => setSelectedInvoiceNumber(event.target.value)}>
            {invoiceRecords.length === 0 ? <option value="">{t("report.noInvoiceNumbers")}</option> : invoiceRecords.map((record) => <option key={record.invoiceNumber} value={record.invoiceNumber}>{record.invoiceNumber}</option>)}
          </select></label>
          <button className="primary-action" disabled={!activeInvoice} onClick={() => activeInvoice && printInvoice(activeInvoice)} type="button">
            <FileText size={16} /> {t("invoices.openPdfPreview")}
          </button>
        </div>
      </div>
      {filteredBillableJobs.length > 0 && (
        <div className="panel">
          <div className="section-heading compact-section-heading">
            <h2>{t("invoices.readyForInvoice")}</h2>
            <span>{filteredBillableJobs.length}</span>
          </div>
          <div className="invoice-job-list">
            {filteredBillableJobs.map((job) => (
              <div className="invoice-job-row" key={job.id}>
                <strong>{job.jobNumber ?? job.id}</strong>
                <span>{job.title}</span>
                <span>{job.customer}</span>
                <button onClick={() => createInvoice(job)} type="button"><ReceiptText size={16} /> {t("invoices.createInvoice")}</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="panel invoice-book-panel">
        <div className="section-heading compact-section-heading">
          <h2>{t("invoices.outgoingBook")}</h2>
          <span>{filteredRecords.length}</span>
        </div>
        <div className="invoice-book-table">
          <div className="invoice-book-row invoice-book-header">
            <span>{t("invoices.invoiceNumber")}</span>
            <span>{t("invoices.invoiceDate")}</span>
            <span>{t("invoices.customer")}</span>
            <span>{t("invoices.netTotal")}</span>
            <span>{t("invoices.vat")}</span>
            <span>{t("invoices.grossTotal")}</span>
            <span>{t("report.actions")}</span>
          </div>
          {filteredRecords.length === 0 && <p className="muted">{t("invoices.noInvoices")}</p>}
          {filteredRecords.map((record) => (
            <div className="invoice-book-row" key={record.invoiceNumber}>
              <strong>{record.invoiceNumber}</strong>
              <span>{record.invoiceDate ? new Date(record.invoiceDate).toLocaleDateString(i18n.language) : "-"}</span>
              <span>{record.customer?.name ?? record.jobs[0]?.customer ?? "-"}</span>
              <span>{formatMoney(record.netTotal, record.currency, i18n.language)}</span>
              <span>{formatMoney(record.vatAmount, record.currency, i18n.language)}</span>
              <span>{formatMoney(record.grossTotal, record.currency, i18n.language)}</span>
              <button onClick={() => printInvoice(record)} type="button"><FileText size={16} /> PDF</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
