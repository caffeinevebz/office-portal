// Domain enums shared between the API validation layer and the UI.

/** Product name — shown in browser tabs next to the firm's name. */
export const APP_NAME = "Ledgify";

export const CLIENT_TYPES = [
  "Individual",
  "Proprietorship",
  "Partnership",
  "LLP",
  "Private Limited",
  "Public Limited",
  "HUF",
  "Trust",
] as const;

export const CLIENT_STATUSES = ["Active", "Inactive"] as const;

// The entity-specific statutory registration number that applies to a client
// of the given type, besides PAN / GSTIN / TAN (which are common to all).
// `key` is the Client column it maps to. Returns null for types that have no
// such number (Proprietorship, HUF, Trust) — they carry TAN + PAN/GSTIN only.
export type EntityRegField = {
  key: "aadhaar" | "cin" | "llpin" | "firmRegNo";
  label: string;
  placeholder: string;
  maxLength: number;
};

export function entityRegField(type: string | null | undefined): EntityRegField | null {
  switch (type) {
    case "Individual":
      return { key: "aadhaar", label: "Aadhaar No.", placeholder: "1234 5678 9012", maxLength: 14 };
    case "Private Limited":
    case "Public Limited":
      return { key: "cin", label: "CIN", placeholder: "U74999MH2016PTC123456", maxLength: 21 };
    case "LLP":
      return { key: "llpin", label: "LLP Registration No.", placeholder: "AAB-1234", maxLength: 12 };
    case "Partnership":
      return { key: "firmRegNo", label: "Firm Registration No.", placeholder: "Registrar of Firms no.", maxLength: 40 };
    default:
      return null;
  }
}

// Master task groups. The first six are the firm's statutory practice areas;
// "Other" is a catch-all for miscellaneous / legacy work.
export const TASK_CATEGORIES = [
  "Income Tax",
  "TDS",
  "GST",
  "MCA/ROC",
  "Audit",
  "Registration",
  "Other",
] as const;

// Legacy category values (pre-rename) mapped to their current master group.
// Applied as an idempotent backfill so old rows show under the right group.
export const LEGACY_CATEGORY_MAP: Record<string, (typeof TASK_CATEGORIES)[number]> = {
  "ROC/MCA": "MCA/ROC",
  Accounting: "Other",
};

// ── Income Tax ──────────────────────────────────────────────────────────────
// The kinds of engagement an Income Tax task can represent.
export const INCOME_TAX_TASK_TYPES = [
  "ITR Filing",
  "Rectification Application",
  "Grievance Filing",
  "PAN Application",
  "TAN Application",
  "Miscellaneous Applications",
] as const;

// ── TDS / TCS ───────────────────────────────────────────────────────────────
// Quarterly TDS/TCS return statements. The Income-tax Act 2025 renumbered the
// statements; we surface the new number alongside the erstwhile 1961-Act form.
export type TdsReturnForm = { newNo: string; oldNo: string; label: string };
export const TDS_RETURN_FORMS: TdsReturnForm[] = [
  { newNo: "138", oldNo: "24Q", label: "TDS on salaries" },
  { newNo: "140", oldNo: "26Q", label: "TDS on non-salary payments" },
  { newNo: "144", oldNo: "27Q", label: "TDS on payments to non-residents" },
  { newNo: "144A", oldNo: "27EQ", label: "TCS statement" },
];
/** Display label for a stored TDS form (keyed by the new-act number). */
export function tdsFormLabel(newNo?: string | null): string {
  const f = TDS_RETURN_FORMS.find((x) => x.newNo === newNo);
  return f ? `Form ${f.newNo} / ${f.oldNo}` : "";
}
export const TDS_RETURN_NATURE = ["Original", "Revised"] as const;

// ── GST ─────────────────────────────────────────────────────────────────────
export const GST_RETURN_TYPES = ["GSTR-1", "GSTR-3B", "GSTR-2B", "GSTR-9", "GSTR-9C"] as const;
export const GST_RETURN_LABELS: Record<string, string> = {
  "GSTR-1": "GSTR-1 · outward supplies",
  "GSTR-3B": "GSTR-3B · summary return",
  "GSTR-2B": "GSTR-2B · ITC reconciliation & filing",
  "GSTR-9": "GSTR-9 · annual return",
  "GSTR-9C": "GSTR-9C · reconciliation statement",
};
// Returns that can be filed monthly or quarterly (the rest are annual).
export const GST_PERIODIC_RETURNS = new Set(["GSTR-1", "GSTR-3B", "GSTR-2B"]);
export const GST_PERIODICITY = ["Monthly", "Quarterly"] as const;

// ── Audit ───────────────────────────────────────────────────────────────────
// The kinds of audit engagement (stored on an Audit task's `taskType`).
export const AUDIT_SUBCATEGORIES = [
  "Statutory Audit",
  "Tax Audit",
  "Internal Audit",
  "GST Audit",
  "Bank Audit",
  "Management Audit",
  "Trust and NGO Audit",
  "Cost Audit",
  "Special Audits",
  "Liquidation/Insolvency Audit",
  "Corporate Secretarial/Compliance Audit",
] as const;

// Default work-programme for each audit sub-category (editable per task).
export const AUDIT_CHECKLISTS: Record<string, string[]> = {
  "Statutory Audit": [
    "Engagement letter signed",
    "Books, ledgers & schedules obtained",
    "Vouching & verification completed",
    "Financial statements & notes finalized",
    "Audit report & CARO finalized (UDIN generated)",
    "Adopted by Board/AGM & filed with MCA",
  ],
  "Tax Audit": [
    "Books & tax computation obtained",
    "Form 3CA/3CB & 3CD prepared",
    "Clause-wise verification completed",
    "Management representation obtained",
    "Report uploaded & UDIN generated",
  ],
  "Internal Audit": [
    "Audit scope & plan agreed",
    "Process walkthroughs performed",
    "Controls tested & gaps noted",
    "Draft report discussed with management",
    "Final report issued & tracker updated",
  ],
  "GST Audit": [
    "Turnover reconciled (books vs returns)",
    "ITC reconciled (GSTR-2B vs books)",
    "GSTR-9 prepared",
    "GSTR-9C reconciliation prepared",
    "Filed & DSC affixed",
  ],
  "Bank Audit": [
    "Appointment & scope confirmed",
    "Advances & NPA classification verified",
    "LFAR prepared",
    "Tax audit & certificates issued",
    "Report submitted to the bank",
  ],
  "Management Audit": [
    "Objectives & scope defined",
    "Functional reviews completed",
    "Efficiency & effectiveness assessed",
    "Recommendations drafted",
    "Report presented to management",
  ],
  "Trust and NGO Audit": [
    "12A/80G & registrations verified",
    "Receipts & payments / income & expenditure prepared",
    "Form 10B/10BB prepared",
    "Application of income verified",
    "Report issued & UDIN generated",
  ],
  "Cost Audit": [
    "Cost records obtained",
    "Cost sheets & reconciliation verified",
    "Form CRA-3 prepared",
    "Board approval obtained",
    "CRA-4 filed with MCA",
  ],
  "Special Audits": [
    "Terms of reference obtained",
    "Scope-specific procedures performed",
    "Findings documented",
    "Draft report reviewed",
    "Final report issued",
  ],
  "Liquidation/Insolvency Audit": [
    "Appointment & CIRP details verified",
    "Books & records obtained",
    "Claims & transactions reviewed",
    "Report prepared per IBC",
    "Submitted to RP / liquidator",
  ],
  "Corporate Secretarial/Compliance Audit": [
    "Statutory registers verified",
    "Board/AGM minutes reviewed",
    "ROC filings checked",
    "Secretarial audit (MR-3) prepared",
    "Report finalized & UDIN generated",
  ],
};

// ── Periods ─────────────────────────────────────────────────────────────────
// Indian financial-year quarters (Apr–Mar).
export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
export const QUARTER_LABELS: Record<string, string> = {
  Q1: "Q1 · Apr–Jun",
  Q2: "Q2 · Jul–Sep",
  Q3: "Q3 · Oct–Dec",
  Q4: "Q4 · Jan–Mar",
};

// A per-task checklist item.
export type ChecklistItem = { label: string; done: boolean };

/** The default checklist seeded for a new task, by category / kind. */
export function defaultChecklist(
  category: string,
  opts: { taskType?: string | null; gstReturnType?: string | null } = {},
): ChecklistItem[] {
  const mk = (labels: string[]): ChecklistItem[] => labels.map((label) => ({ label, done: false }));
  if (category === "TDS") {
    return mk([
      "Data / Documents received from client",
      "TDS return prepared",
      "Run e-return (for any error)",
      "Relevant files saved",
      "TDS return filed",
      "Request for TDS Certificate",
      "TDS Certificate downloaded",
      "TDS Certificate mailed to client",
    ]);
  }
  if (category === "GST") {
    return mk(["Data reconciled with books", "Return prepared", "Return filed & ARN saved"]);
  }
  if (category === "Income Tax" && opts.taskType === "ITR Filing") {
    return mk([
      "Data / Documents received from client",
      "Form 26AS, AIS & TIS downloaded",
      "Computation prepared",
      "Computation finalised",
      "ITR filed",
      "ITR e-verified",
    ]);
  }
  if (category === "Audit") {
    const items = AUDIT_CHECKLISTS[opts.taskType ?? ""];
    return items ? mk(items) : [];
  }
  return [];
}

/**
 * Task status derived from its checklist: none done → Pending, some done →
 * In Progress, all done → Completed. Returns null for an empty checklist
 * (nothing to derive from).
 */
export function checklistStatus(items: ChecklistItem[] | null | undefined): string | null {
  if (!items || items.length === 0) return null;
  const done = items.filter((i) => i.done).length;
  if (done === 0) return "Pending";
  if (done === items.length) return "Completed";
  return "In Progress";
}

// ── Filing register ─────────────────────────────────────────────────────────
// The register covers every kind of return the firm files, not just ITR.
export const RETURN_TYPES = ["ITR", "TDS", "GST", "MCA"] as const;

export const MCA_FORMS = [
  "AOC-4",
  "MGT-7",
  "MGT-7A",
  "ADT-1",
  "DIR-3 KYC",
  "LLP Form 11",
  "LLP Form 8",
  "CRA-4",
  "Other",
] as const;

/** Form-number options for a filing-register entry, by return type. */
export function filingFormOptions(returnType: string): string[] {
  switch (returnType) {
    case "ITR":
      return [...ITR_FORMS];
    case "TDS":
      return TDS_RETURN_FORMS.map((f) => `Form ${f.newNo} / ${f.oldNo}`);
    case "GST":
      return [...GST_RETURN_TYPES];
    case "MCA":
      return [...MCA_FORMS];
    default:
      return [];
  }
}

/** The register returnType a task's filing belongs to, by task category. */
export const CATEGORY_RETURN_TYPE: Record<string, (typeof RETURN_TYPES)[number]> = {
  "Income Tax": "ITR",
  TDS: "TDS",
  GST: "GST",
  "MCA/ROC": "MCA",
};

export const TASK_STATUSES = [
  "Pending",
  "In Progress",
  "Under Review",
  "Completed",
] as const;

export const TASK_PRIORITIES = ["Low", "Medium", "High"] as const;

export const STAFF_ROLES = [
  "Partner",
  "Manager",
  "Accountant",
  "Article Assistant",
  "Admin",
] as const;

export const INVOICE_STATUSES = ["Draft", "Sent", "Paid", "Overdue"] as const;

// GST applicability on an invoice.
export const GST_MODES = ["Auto", "Intra", "Inter", "None"] as const;
export const GST_MODE_LABELS: Record<string, string> = {
  Auto: "Auto (by client's GSTIN state)",
  Intra: "CGST + SGST (intra-state)",
  Inter: "IGST (inter-state)",
  None: "Not applicable (no GST)",
};

export const ITR_FORMS = [
  "ITR-1", "ITR-2", "ITR-3", "ITR-4", "ITR-5", "ITR-6", "ITR-7",
] as const;

export const ITR_REGIMES = ["New", "Old"] as const;

export const ITR_STATUSES = [
  "Documents Awaited",
  "In Preparation",
  "Filed",
  "E-Verified",
  "Processed",
  "Defective",
] as const;

export const ITR_STATUS_TONE: Record<string, keyof typeof TONE> = {
  "Documents Awaited": "slate",
  "In Preparation": "blue",
  Filed: "indigo",
  "E-Verified": "violet",
  Processed: "green",
  Defective: "red",
};

/** Financial-year label for a date (Indian FY, Apr–Mar), e.g. "2026-27". */
export function financialYearLabel(d = new Date()): string {
  const y = d.getFullYear();
  const start = d.getMonth() + 1 >= 4 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

/** Short FY label for invoice/receipt numbers, e.g. "26-27". */
export function fyShort(d = new Date()): string {
  return financialYearLabel(d).slice(2);
}

/** Recent financial years (most recent first) for the ITR register. */
export function financialYears(now = new Date(), count = 5): string[] {
  const start = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: count }, (_, i) => {
    const s = start - i;
    return `${s}-${String(s + 1).slice(2)}`;
  });
}

/**
 * Income-tax period label for a financial year. India's Income-tax Act 2025
 * replaces "Assessment Year" with "Tax Year" from FY 2026-27 onwards:
 *   FY 2025-26 and earlier → "AY <fy+1>"  (e.g. FY 2025-26 → AY 2026-27)
 *   FY 2026-27 and onwards → "TY <fy>"    (e.g. FY 2026-27 → TY 2026-27)
 */
export function incomeTaxYearLabel(fyLabel: string): string {
  const start = parseInt(fyLabel.slice(0, 4), 10);
  if (Number.isNaN(start)) return fyLabel;
  const range = (s: number) => `${s}-${String(s + 1).slice(2)}`;
  return start >= 2026 ? `TY ${range(start)}` : `AY ${range(start + 1)}`;
}

/**
 * Picker label combining the income-tax period with its financial year, e.g.
 * "AY 2026-27 (FY 2025-26)" or "TY 2026-27 (FY 2026-27)". Lets a user pick the
 * Assessment Year or Tax Year while the task is stored against the FY.
 */
export function taxPeriodOption(fyLabel: string): string {
  return `${incomeTaxYearLabel(fyLabel)} (FY ${fyLabel})`;
}

/** Best-effort firm initials for invoice numbers, e.g.
 *  "Anil P.S.Bhansali & Co." → "APSB". Overridable in Firm Settings. */
export function deriveInitials(name?: string | null): string {
  if (!name) return "INV";
  const STOP = new Set([
    "and", "co", "company", "associates", "associate", "chartered",
    "accountants", "accountant", "llp", "pvt", "private", "ltd", "limited", "the",
  ]);
  const initials = name
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
    .filter((t) => !STOP.has(t.toLowerCase()))
    .map((t) => t[0]!.toUpperCase())
    .join("")
    .slice(0, 6);
  return initials || "INV";
}

export const DOC_CATEGORIES = [
  "PAN",
  "GST",
  "ITR",
  "Financial Statement",
  "Agreement",
  "Other",
] as const;

export const PACKET_MODES = ["Hand Delivery", "Courier", "Post", "Other"] as const;

export const PACKET_STATUSES = ["In Custody", "Returned"] as const;

export const DSC_CLASSES = ["Class 3", "Class 2 (legacy)", "DGFT"] as const;

export const DSC_AUTHORITIES = [
  "eMudhra",
  "Sify SafeScrypt",
  "Capricorn",
  "VSign",
  "PantaSign",
  "XtraTrust",
  "IDSign",
  "Other",
] as const;

export const DSC_STATUSES = ["Active", "Revoked", "Surrendered"] as const;

export const DSC_CUSTODY = ["With Firm", "With Client"] as const;

export const SCHEDULE_FREQUENCIES = [
  "Monthly",
  "Quarterly",
  "Half-Yearly",
  "Annually",
] as const;

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

// A small library of common Indian statutory obligations. Selecting one on the
// Recurring page pre-fills the schedule form; the firm can still tweak it.
export type StatutoryPreset = {
  label: string;
  title: string;
  category: (typeof TASK_CATEGORIES)[number];
  frequency: (typeof SCHEDULE_FREQUENCIES)[number];
  dueDay: number;
  anchorMonth: number; // 1-12 (relevant for non-monthly)
  hint: string;
};

export const STATUTORY_PRESETS: StatutoryPreset[] = [
  { label: "GSTR-1 (Monthly)", title: "GSTR-1", category: "GST", frequency: "Monthly", dueDay: 11, anchorMonth: 4, hint: "Outward supplies, due 11th" },
  { label: "GSTR-3B (Monthly)", title: "GSTR-3B", category: "GST", frequency: "Monthly", dueDay: 20, anchorMonth: 4, hint: "Monthly summary return, due 20th" },
  { label: "GSTR-1 (Quarterly · QRMP)", title: "GSTR-1 (QRMP)", category: "GST", frequency: "Quarterly", dueDay: 13, anchorMonth: 7, hint: "QRMP scheme, due 13th after quarter" },
  { label: "CMP-08 (Composition)", title: "CMP-08", category: "GST", frequency: "Quarterly", dueDay: 18, anchorMonth: 7, hint: "Composition statement, due 18th after quarter" },
  { label: "TDS Payment (Monthly)", title: "TDS Payment", category: "TDS", frequency: "Monthly", dueDay: 7, anchorMonth: 4, hint: "Deposit of TDS, due 7th" },
  { label: "TDS Return (Quarterly)", title: "TDS Return", category: "TDS", frequency: "Quarterly", dueDay: 31, anchorMonth: 7, hint: "Quarterly TDS statement" },
  { label: "Advance Tax (Quarterly)", title: "Advance Tax", category: "Income Tax", frequency: "Quarterly", dueDay: 15, anchorMonth: 6, hint: "Instalments: 15 Jun/Sep/Dec/Mar" },
  { label: "PF & ESI (Monthly)", title: "PF & ESI Payment", category: "Other", frequency: "Monthly", dueDay: 15, anchorMonth: 4, hint: "Provident fund & ESI, due 15th" },
  { label: "ITR Filing (Annual)", title: "Income Tax Return", category: "Income Tax", frequency: "Annually", dueDay: 31, anchorMonth: 7, hint: "Non-audit ITR, due 31 Jul" },
  { label: "Tax Audit (Annual)", title: "Tax Audit u/s 44AB", category: "Audit", frequency: "Annually", dueDay: 30, anchorMonth: 9, hint: "Due 30 Sep" },
  { label: "ROC AOC-4 (Annual)", title: "ROC AOC-4", category: "MCA/ROC", frequency: "Annually", dueDay: 30, anchorMonth: 10, hint: "Financial statements filing" },
  { label: "ROC MGT-7 (Annual)", title: "ROC MGT-7", category: "MCA/ROC", frequency: "Annually", dueDay: 29, anchorMonth: 11, hint: "Annual return filing" },
  { label: "DIR-3 KYC (Annual)", title: "DIR-3 KYC", category: "MCA/ROC", frequency: "Annually", dueDay: 30, anchorMonth: 9, hint: "Director KYC, due 30 Sep" },
];

// Tailwind class fragments used for coloured status/category badges.
type BadgeTone = { bg: string; text: string; ring: string };

const TONE: Record<string, BadgeTone> = {
  slate: { bg: "bg-slate-100", text: "text-slate-700", ring: "ring-slate-200" },
  green: { bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-200" },
  amber: { bg: "bg-amber-100", text: "text-amber-700", ring: "ring-amber-200" },
  blue: { bg: "bg-blue-100", text: "text-blue-700", ring: "ring-blue-200" },
  indigo: { bg: "bg-brand-100", text: "text-brand-700", ring: "ring-brand-200" },
  red: { bg: "bg-rose-100", text: "text-rose-700", ring: "ring-rose-200" },
  violet: { bg: "bg-violet-100", text: "text-violet-700", ring: "ring-violet-200" },
};

export function badgeTone(name: keyof typeof TONE): BadgeTone {
  return TONE[name] ?? TONE.slate;
}

export const TASK_STATUS_TONE: Record<string, keyof typeof TONE> = {
  Pending: "slate",
  "In Progress": "blue",
  "Under Review": "amber",
  Completed: "green",
};

export const PRIORITY_TONE: Record<string, keyof typeof TONE> = {
  Low: "slate",
  Medium: "blue",
  High: "red",
};

export const INVOICE_STATUS_TONE: Record<string, keyof typeof TONE> = {
  Draft: "slate",
  Sent: "blue",
  Paid: "green",
  Overdue: "red",
};

export const CLIENT_STATUS_TONE: Record<string, keyof typeof TONE> = {
  Active: "green",
  Inactive: "slate",
};

export const CATEGORY_TONE: Record<string, keyof typeof TONE> = {
  "Income Tax": "violet",
  TDS: "blue",
  GST: "indigo",
  "MCA/ROC": "amber",
  Audit: "red",
  Registration: "slate",
  Other: "slate",
  // legacy values still render until backfilled
  "ROC/MCA": "amber",
  Accounting: "green",
};
