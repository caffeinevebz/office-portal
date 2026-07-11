// The Income Tax Department's statutory compliance calendar
// (incometax.gov.in → Compliance Calendar), expressed as recurring
// schedules the generation engine understands. Syncing upserts these as
// firm-wide schedules keyed by `sourceKey`, so re-syncs are idempotent and
// never duplicate — and any dates the department revises are updated in place.

export const IT_CALENDAR_SOURCE = "income-tax";

export type ItCalendarEntry = {
  key: string; // stable identifier → ComplianceSchedule.sourceKey
  title: string;
  category: string; // Task category
  frequency: "Monthly" | "Quarterly" | "Annually";
  dueDay: number;
  anchorMonth: number; // 1-12; for Annually = the due month
  priority: "Low" | "Medium" | "High";
  notes: string;
};

export const IT_CALENDAR: ItCalendarEntry[] = [
  {
    key: "tds-payment",
    title: "TDS/TCS payment for the previous month",
    category: "TDS",
    frequency: "Monthly",
    dueDay: 7,
    anchorMonth: 4,
    priority: "High",
    notes: "Deposit of tax deducted/collected during the preceding month (Challan ITNS-281). March deduction is due 30 April.",
  },
  {
    key: "advance-tax",
    title: "Advance tax installment",
    category: "Income Tax",
    frequency: "Quarterly",
    dueDay: 15,
    anchorMonth: 6,
    priority: "High",
    notes: "u/s 211: 15% by 15 Jun, 45% by 15 Sep, 75% by 15 Dec, 100% by 15 Mar.",
  },
  {
    key: "tds-return-q1",
    title: "TDS returns (24Q/26Q) – Q1 (Apr–Jun)",
    category: "TDS",
    frequency: "Annually",
    dueDay: 31,
    anchorMonth: 7,
    priority: "High",
    notes: "Quarterly TDS statements for the first quarter, due 31 July.",
  },
  {
    key: "tds-return-q2",
    title: "TDS returns (24Q/26Q) – Q2 (Jul–Sep)",
    category: "TDS",
    frequency: "Annually",
    dueDay: 31,
    anchorMonth: 10,
    priority: "High",
    notes: "Quarterly TDS statements for the second quarter, due 31 October.",
  },
  {
    key: "tds-return-q3",
    title: "TDS returns (24Q/26Q) – Q3 (Oct–Dec)",
    category: "TDS",
    frequency: "Annually",
    dueDay: 31,
    anchorMonth: 1,
    priority: "High",
    notes: "Quarterly TDS statements for the third quarter, due 31 January.",
  },
  {
    key: "tds-return-q4",
    title: "TDS returns (24Q/26Q) – Q4 (Jan–Mar)",
    category: "TDS",
    frequency: "Annually",
    dueDay: 31,
    anchorMonth: 5,
    priority: "High",
    notes: "Quarterly TDS statements for the fourth quarter, due 31 May.",
  },
  {
    key: "form16",
    title: "Issue Form 16 to employees",
    category: "TDS",
    frequency: "Annually",
    dueDay: 15,
    anchorMonth: 6,
    priority: "Medium",
    notes: "Salary TDS certificates for the previous financial year, due 15 June.",
  },
  {
    key: "sft-61a",
    title: "SFT (Form 61A) – Statement of Financial Transactions",
    category: "Income Tax",
    frequency: "Annually",
    dueDay: 31,
    anchorMonth: 5,
    priority: "Medium",
    notes: "Specified financial transactions of the previous financial year, due 31 May.",
  },
  {
    key: "itr-nonaudit",
    title: "ITR filing – non-audit cases",
    category: "Income Tax",
    frequency: "Annually",
    dueDay: 31,
    anchorMonth: 7,
    priority: "High",
    notes: "Individuals/HUF/firms not liable to audit, due 31 July of the assessment year.",
  },
  {
    key: "tax-audit-44ab",
    title: "Tax audit report (Form 3CA/3CB-3CD)",
    category: "Audit",
    frequency: "Annually",
    dueDay: 30,
    anchorMonth: 9,
    priority: "High",
    notes: "u/s 44AB for the previous financial year, due 30 September.",
  },
  {
    key: "itr-audit",
    title: "ITR filing – audit cases",
    category: "Income Tax",
    frequency: "Annually",
    dueDay: 31,
    anchorMonth: 10,
    priority: "High",
    notes: "Assessees subject to audit, due 31 October of the assessment year.",
  },
  {
    key: "belated-revised-itr",
    title: "Belated / revised ITR – last date",
    category: "Income Tax",
    frequency: "Annually",
    dueDay: 31,
    anchorMonth: 12,
    priority: "Medium",
    notes: "u/s 139(4)/139(5): belated or revised returns for the assessment year, due 31 December.",
  },
];
