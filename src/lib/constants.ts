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

export const TASK_CATEGORIES = [
  "GST",
  "Income Tax",
  "TDS",
  "ROC/MCA",
  "Audit",
  "Accounting",
  "Registration",
  "Other",
] as const;

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

/** Assessment years for the ITR register: current AY and the two before. */
export function assessmentYears(now = new Date()): string[] {
  const fyStart = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return [0, 1, 2].map((back) => {
    const s = fyStart - back;
    return `${s}-${String(s + 1).slice(2)}`;
  });
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
  { label: "PF & ESI (Monthly)", title: "PF & ESI Payment", category: "Accounting", frequency: "Monthly", dueDay: 15, anchorMonth: 4, hint: "Provident fund & ESI, due 15th" },
  { label: "ITR Filing (Annual)", title: "Income Tax Return", category: "Income Tax", frequency: "Annually", dueDay: 31, anchorMonth: 7, hint: "Non-audit ITR, due 31 Jul" },
  { label: "Tax Audit (Annual)", title: "Tax Audit u/s 44AB", category: "Audit", frequency: "Annually", dueDay: 30, anchorMonth: 9, hint: "Due 30 Sep" },
  { label: "ROC AOC-4 (Annual)", title: "ROC AOC-4", category: "ROC/MCA", frequency: "Annually", dueDay: 30, anchorMonth: 10, hint: "Financial statements filing" },
  { label: "ROC MGT-7 (Annual)", title: "ROC MGT-7", category: "ROC/MCA", frequency: "Annually", dueDay: 29, anchorMonth: 11, hint: "Annual return filing" },
  { label: "DIR-3 KYC (Annual)", title: "DIR-3 KYC", category: "ROC/MCA", frequency: "Annually", dueDay: 30, anchorMonth: 9, hint: "Director KYC, due 30 Sep" },
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
  GST: "indigo",
  "Income Tax": "violet",
  TDS: "blue",
  "ROC/MCA": "amber",
  Audit: "red",
  Accounting: "green",
  Registration: "slate",
  Other: "slate",
};
