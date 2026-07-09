import { addMonths, startOfMonth, startOfDay, subMonths, format } from "date-fns";
import { MONTHS } from "./constants";

export type ScheduleRule = {
  title: string;
  frequency: string;
  dueDay: number;
  anchorMonth: number;
};

export type Occurrence = {
  dueDate: Date;
  periodKey: string; // e.g. "2026-07" — stable per occurrence for idempotent generation
  title: string;
};

const daysInMonth = (year: number, month1: number) =>
  new Date(year, month1, 0).getDate();

// Is a 1-based month a "due month" for this frequency, given the anchor month?
function isDueMonth(frequency: string, month1: number, anchor: number): boolean {
  const diff = ((month1 - anchor) % 12 + 12) % 12;
  switch (frequency) {
    case "Monthly":
      return true;
    case "Quarterly":
      return diff % 3 === 0;
    case "Half-Yearly":
      return diff % 6 === 0;
    case "Annually":
      return month1 === anchor;
    default:
      return false;
  }
}

// Indian financial year of a date: April–March. Returns e.g. "2026-27".
function fyLabel(startYear: number) {
  return `FY ${startYear}-${String(startYear + 1).slice(2)}`;
}

// Human label for the period a due date relates to (the return usually covers
// the period ending just before it is due).
export function periodLabel(frequency: string, dueDate: Date): string {
  const prev = subMonths(dueDate, 1);
  const pm = prev.getMonth() + 1; // 1-12
  const py = prev.getFullYear();
  const fyStart = pm >= 4 ? py : py - 1;

  switch (frequency) {
    case "Monthly":
      return format(prev, "MMM yyyy");
    case "Quarterly": {
      const q = pm >= 4 && pm <= 6 ? 1 : pm >= 7 && pm <= 9 ? 2 : pm >= 10 ? 3 : 4;
      return `Q${q} ${fyLabel(fyStart)}`;
    }
    case "Half-Yearly": {
      const h = pm >= 4 && pm <= 9 ? 1 : 2;
      return `H${h} ${fyLabel(fyStart)}`;
    }
    case "Annually":
      // Annual filings (ITR, ROC, audit) are for the previous financial year.
      return fyLabel(fyStart - 1);
    default:
      return format(dueDate, "MMM yyyy");
  }
}

/** All occurrences whose due date falls between today and `months` ahead. */
export function computeOccurrences(rule: ScheduleRule, months: number): Occurrence[] {
  const today = startOfDay(new Date());
  const horizon = addMonths(today, months);
  const anchor = Math.min(12, Math.max(1, rule.anchorMonth || 1));
  const out: Occurrence[] = [];

  let cur = startOfMonth(today);
  while (cur <= horizon) {
    const year = cur.getFullYear();
    const m1 = cur.getMonth() + 1;
    if (isDueMonth(rule.frequency, m1, anchor)) {
      const day = Math.min(rule.dueDay || 1, daysInMonth(year, m1));
      const dueDate = new Date(year, m1 - 1, day, 12, 0, 0, 0);
      if (dueDate >= today && dueDate <= horizon) {
        out.push({
          dueDate,
          periodKey: `${year}-${String(m1).padStart(2, "0")}`,
          title: `${rule.title} — ${periodLabel(rule.frequency, dueDate)}`,
        });
      }
    }
    cur = addMonths(cur, 1);
  }
  return out;
}

/** Short description of when a schedule fires, for the schedules table. */
export function describeSchedule(rule: ScheduleRule): string {
  const ord = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const day = ord(rule.dueDay);
  const anchor = Math.min(12, Math.max(1, rule.anchorMonth || 1));
  const monthName = (m1: number) => MONTHS[(((m1 - 1) % 12) + 12) % 12].slice(0, 3);

  switch (rule.frequency) {
    case "Monthly":
      return `Monthly · ${day}`;
    case "Quarterly": {
      const ms = [0, 3, 6, 9].map((o) => monthName(((anchor - 1 + o) % 12) + 1));
      return `Quarterly · ${day} of ${ms.join(", ")}`;
    }
    case "Half-Yearly": {
      const ms = [0, 6].map((o) => monthName(((anchor - 1 + o) % 12) + 1));
      return `Half-yearly · ${day} of ${ms.join(", ")}`;
    }
    case "Annually":
      return `Annually · ${day} ${monthName(anchor)}`;
    default:
      return rule.frequency;
  }
}
