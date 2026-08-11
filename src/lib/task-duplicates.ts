import "server-only";
import { prisma } from "@/lib/prisma";
import { MONTHS, TDS_RETURN_FORMS, GST_RETURN_TYPES } from "@/lib/constants";
import type { Task } from "@prisma/client";

// Guarding against the same statutory obligation being raised twice.
//
// A firm's real risk is two tasks for *the same return, the same client, the
// same period* — Form 140 / 26Q for Q1 raised once by hand and again from a
// recurring obligation, say. Ordinary work is not like that: "Book-keeping"
// or "Advisory call" may legitimately repeat any number of times.
//
// So a task is only judged when it carries enough to identify an obligation:
// **something filed** and **a period it is filed for**. Anything short of
// that produces no key and is never treated as a duplicate — a missed
// duplicate is a nuisance, a false one blocks real work.
//
// Two tasks for one obligation can be worded quite differently: the form
// picker stores "140", a recurring obligation the firm typed itself may say
// "TDS 26Q". Both name the same statement, so the key canonicalises what it
// can — the erstwhile 1961-Act form numbers onto the current ones, and the
// obligation's own title when no picker field was filled in.

/**
 * The fields that decide whether two tasks are the same obligation. Every one
 * is optional: callers weigh a task before it exists, assembled from a form
 * that may have left most of the form fields empty.
 */
export type TaskIdentity = {
  [K in
    | "clientId"
    | "category"
    | "title"
    | "taskType"
    | "financialYear"
    | "periodMonth"
    | "periodQuarter"
    | "tdsForm"
    | "returnNature"
    | "gstWorkType"
    | "gstReturnType"
    | "gstin"
    | "noticeForm"
    | "noticeRef"]?: Task[K] | null;
};

const norm = (v: string | null | undefined) =>
  (v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();

/** "FY 2025-26", "2025-26" and "2025-2026" all name one year. */
function fyKey(v: string | null | undefined): string {
  const digits = norm(v).replace(/^(fy|ay|ty)/, "");
  if (digits.length < 4) return "";
  // Keep the opening year and the last two digits of the closing one, so the
  // two ways of writing a year meet: 202526 and 20252026 both become 202526.
  return `${digits.slice(0, 4)}${digits.slice(-2)}`;
}

/** Period words stripped out, so "AOC-4 – FY 2025-26" keys as "aoc4". */
function titleKey(title: string): string {
  return norm(
    title
      .replace(/\b(fy|ay|ty)\s*\d{2,4}\s*[-–/]?\s*\d{0,4}\b/gi, "")
      .replace(/\b\d{4}\s*[-–/]\s*\d{2,4}\b/g, "")
      .replace(new RegExp(`\\b(${MONTHS.join("|")})\\b`, "gi"), "")
      .replace(/\b[qh][1-4]\b/gi, ""),
  );
}

/** The task's title, or "" — an unsaved task may not have typed one yet. */
const titleOf = (t: TaskIdentity) => t.title ?? "";

/** The period a task is filed for, or "" when it names none. */
function periodKey(t: TaskIdentity): string {
  return [
    fyKey(t.financialYear),
    t.periodQuarter ? norm(t.periodQuarter) : "",
    t.periodMonth ? `m${t.periodMonth}` : "",
  ]
    .filter(Boolean)
    .join("-");
}

// Longer form numbers first, so "144A" is not swallowed by "144".
const TDS_FORM_TOKENS = TDS_RETURN_FORMS.flatMap((f) => [
  { token: f.newNo, form: f.newNo },
  { token: f.oldNo, form: f.newNo },
]).sort((a, b) => b.token.length - a.token.length);

/**
 * The current form number for whatever the caller wrote — the new-act number,
 * the erstwhile 1961-Act one, or a title mentioning either. "" when none.
 */
function tdsFormKey(v: string | null | undefined): string {
  const s = norm(v);
  if (!s) return "";
  const hit = TDS_FORM_TOKENS.find((t) => s.includes(norm(t.token)));
  return hit ? hit.form : "";
}

/** The GST return a string names, e.g. "GSTR 3B monthly" → "gstr3b". */
function gstReturnKey(v: string | null | undefined): string {
  const s = norm(v);
  if (!s) return "";
  // "GSTR-9C" before "GSTR-9", else the annual return swallows the statement.
  const hit = [...GST_RETURN_TYPES]
    .sort((a, b) => b.length - a.length)
    .find((t) => s.includes(norm(t)));
  return hit ? norm(hit) : "";
}

/**
 * What is being filed. Empty when the task names nothing specific — which is
 * most ad-hoc work, and is why such tasks are never judged.
 *
 * Each branch reads the picker field first and falls back to the title, so a
 * task generated from a recurring obligation — which carries only the title
 * the firm typed — is weighed against hand-raised work naming the same form.
 */
function subjectKey(t: TaskIdentity): string {
  switch (t.category) {
    case "TDS": {
      const form = tdsFormKey(t.tdsForm) || tdsFormKey(titleOf(t));
      if (!form) return "";
      // A revised return is genuinely separate work from the original.
      const revised = t.returnNature
        ? norm(t.returnNature) === "revised"
        : /revis/i.test(titleOf(t));
      return `${form}|${revised ? "revised" : "original"}`;
    }
    case "GST": {
      if (t.gstWorkType === "Notice reply") {
        // Two notices can arrive on the same form, so only the reference
        // makes one reply the same as another.
        return t.noticeRef ? `notice|${norm(t.noticeRef)}` : "";
      }
      const ret = gstReturnKey(t.gstReturnType) || gstReturnKey(titleOf(t));
      // Each registration files its own return, so the GSTIN is part of it.
      return ret ? `${ret}|${norm(t.gstin)}` : "";
    }
    case "Income Tax":
    case "Audit":
      return norm(t.taskType) || titleKey(titleOf(t));
    default:
      // MCA/ROC, Registration and the rest carry no form field — the title
      // is what names the filing, with its period removed.
      return titleKey(titleOf(t));
  }
}

/**
 * A stable key for the obligation a task represents, or null when the task
 * does not identify one closely enough to judge.
 */
export function complianceKey(t: TaskIdentity): string | null {
  if (!t.clientId) return null; // internal work belongs to no client
  const subject = subjectKey(t);
  const period = periodKey(t);
  // Both halves are required: a return without a period, or a period without
  // a return, does not pin down an obligation.
  if (!subject || !period) return null;
  return [t.clientId, norm(t.category), subject, period].join("::");
}

/** The columns `complianceKey` reads — every query below selects exactly these. */
export const IDENTITY_SELECT = {
  id: true,
  title: true,
  status: true,
  dueDate: true,
  clientId: true,
  category: true,
  taskType: true,
  financialYear: true,
  periodMonth: true,
  periodQuarter: true,
  tdsForm: true,
  returnNature: true,
  gstWorkType: true,
  gstReturnType: true,
  gstin: true,
  noticeForm: true,
  noticeRef: true,
  client: { select: { name: true } },
} as const;

/** A task already covering the same obligation. */
export type TaskDuplicate = {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  clientName: string | null;
};

/**
 * Find a task that already covers the same obligation. Completed ones count —
 * a return filed last week must not be raised again.
 */
export async function findTaskDuplicate(
  candidate: TaskIdentity,
  excludeId?: string,
): Promise<TaskDuplicate | null> {
  const key = complianceKey(candidate);
  if (!key) return null;

  // Narrow in SQL on what is indexed and cheap, then compare keys exactly —
  // the key encodes normalisation the database cannot express.
  const siblings = await prisma.task.findMany({
    where: {
      clientId: candidate.clientId,
      category: candidate.category ?? undefined,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: IDENTITY_SELECT,
  });

  const hit = siblings.find((s) => complianceKey(s) === key);
  return hit
    ? {
        id: hit.id,
        title: hit.title,
        status: hit.status,
        dueDate: hit.dueDate,
        clientName: hit.client?.name ?? null,
      }
    : null;
}

const shortDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

/** Readable rejection naming the task that already covers this obligation. */
export function duplicateTaskMessage(dup: TaskDuplicate): string {
  const due = dup.dueDate ? ` due ${shortDate(dup.dueDate)}` : "";
  return (
    `“${dup.title}”${due} already covers this for ${dup.clientName ?? "this client"} ` +
    `(${dup.status.toLowerCase()}). Open that task instead of raising a second one.`
  );
}

/** A set of tasks in the register that all cover the same obligation. */
export type DuplicateTaskGroup = {
  key: string;
  label: string;
  clientName: string;
  tasks: { id: string; title: string; status: string; dueDate: string | null }[];
};

/**
 * Obligations that already have more than one task against them, so the extras
 * can be closed or deleted. Read over the whole register.
 */
export async function findExistingTaskDuplicates(): Promise<DuplicateTaskGroup[]> {
  const tasks = await prisma.task.findMany({
    select: IDENTITY_SELECT,
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, DuplicateTaskGroup>();
  for (const t of tasks) {
    const key = complianceKey(t);
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        // The first task's title names the obligation well enough to act on.
        label: t.title,
        clientName: t.client?.name ?? "—",
        tasks: [],
      });
    }
    groups.get(key)!.tasks.push({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    });
  }

  return [...groups.values()]
    .filter((g) => g.tasks.length > 1)
    .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.label.localeCompare(b.label));
}
