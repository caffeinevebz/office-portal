// Domain enums shared between the API validation layer and the UI.

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

export const DOC_CATEGORIES = [
  "PAN",
  "GST",
  "ITR",
  "Financial Statement",
  "Agreement",
  "Other",
] as const;

// Tailwind class fragments used for coloured status/category badges.
type BadgeTone = { bg: string; text: string; ring: string };

const TONE: Record<string, BadgeTone> = {
  slate: { bg: "bg-slate-100", text: "text-slate-700", ring: "ring-slate-200" },
  green: { bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-200" },
  amber: { bg: "bg-amber-100", text: "text-amber-700", ring: "ring-amber-200" },
  blue: { bg: "bg-blue-100", text: "text-blue-700", ring: "ring-blue-200" },
  indigo: { bg: "bg-indigo-100", text: "text-indigo-700", ring: "ring-indigo-200" },
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
