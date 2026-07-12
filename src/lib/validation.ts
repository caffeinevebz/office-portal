import { z } from "zod";
import {
  CLIENT_TYPES,
  CLIENT_STATUSES,
  TASK_CATEGORIES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  INVOICE_STATUSES,
  DOC_CATEGORIES,
  SCHEDULE_FREQUENCIES,
  DSC_CLASSES,
  DSC_AUTHORITIES,
  DSC_STATUSES,
  PACKET_MODES,
  GST_MODES,
  ITR_FORMS,
  ITR_REGIMES,
  ITR_STATUSES,
} from "./constants";

// Accept only one of the allowed domain values.
const oneOf = (values: readonly string[], label: string) =>
  z.string().refine((v) => values.includes(v), { message: `Invalid ${label}` });

const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

// Empty string / null / undefined -> null; otherwise a Date.
const optionalDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : null));

export const clientCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  type: oneOf(CLIENT_TYPES, "client type"),
  status: oneOf(CLIENT_STATUSES, "status").default("Active"),
  pan: optionalText,
  gstin: optionalText,
  tan: optionalText,
  aadhaar: optionalText,
  cin: optionalText,
  llpin: optionalText,
  firmRegNo: optionalText,
  email: optionalText,
  phone: optionalText,
  address: optionalText,
  contactPerson: optionalText,
  groupId: optionalText,
  notes: optionalText,
});
export const clientUpdateSchema = clientCreateSchema.partial();

// A firm / trade name a client operates under.
export const tradeNameSchema = z.object({
  name: z.string().trim().min(1, "Trade name is required"),
  gstin: optionalText,
  pan: optionalText,
  address: optionalText,
});

// A client group with a manually-assigned unique code.
export const clientGroupSchema = z.object({
  name: z.string().trim().min(1, "Group name is required"),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(16)
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and hyphens only"),
  notes: optionalText,
});

export const staffCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Valid email required"),
  role: z.string().trim().min(1, "Role is required"),
  phone: optionalText,
  active: z.boolean().default(true),
  // Optional login password. If omitted/blank, the member cannot sign in yet.
  password: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().min(6, "Password must be at least 6 characters").optional(),
  ),
});
export const staffUpdateSchema = staffCreateSchema.partial();

const optionalMonth = z
  .preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.coerce.number().int().min(1).max(12).nullable(),
  )
  .optional();

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: optionalText,
  category: oneOf(TASK_CATEGORIES, "category").default("Other"),
  status: oneOf(TASK_STATUSES, "status").default("Pending"),
  priority: oneOf(TASK_PRIORITIES, "priority").default("Medium"),
  dueDate: optionalDate,
  clientId: optionalText,
  assigneeId: optionalText,
  isReturnFiling: z.boolean().optional(),
  filingDate: optionalDate,
  ackNumber: optionalText,
  // Category-specific metadata (see constants for the option lists).
  taskType: optionalText,
  financialYear: optionalText,
  periodMonth: optionalMonth,
  periodQuarter: optionalText,
  tdsForm: optionalText,
  returnNature: optionalText,
  gstReturnType: optionalText,
  gstPeriodicity: optionalText,
  // Json column: null/absent → omit (Prisma treats undefined as no-op).
  checklist: z
    .array(z.object({ label: z.string().trim().min(1), done: z.boolean() }))
    .nullish()
    .transform((v) => v ?? undefined),
});
export const taskUpdateSchema = taskCreateSchema.partial();

// Recording a filing for a return task (auto-completes it).
export const taskFilingSchema = z.object({
  filingDate: z.string().min(1, "Filing date is required").transform((v) => new Date(v)),
  ackNumber: optionalText,
});

export const invoiceCreateSchema = z.object({
  // Optional: auto-generated (PREFIX/FY/NNN) when blank.
  invoiceNumber: optionalText,
  clientId: z.string().trim().min(1, "Client is required"),
  tradeNameId: optionalText,
  organizationId: optionalText,
  description: optionalText,
  amount: z.coerce.number().min(0, "Amount must be positive"),
  taxRate: z.coerce.number().min(0).max(100).default(18),
  gstMode: oneOf(GST_MODES, "GST mode").default("Auto"),
  status: oneOf(INVOICE_STATUSES, "status").default("Draft"),
  issueDate: optionalDate,
  dueDate: optionalDate,
});
export const invoiceUpdateSchema = invoiceCreateSchema.partial();

export const documentCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  category: oneOf(DOC_CATEGORIES, "category").default("Other"),
  clientId: optionalText,
  financialYear: optionalText,
  note: optionalText,
});
export const documentUpdateSchema = documentCreateSchema.partial();

export const scheduleCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  category: oneOf(TASK_CATEGORIES, "category").default("Other"),
  frequency: oneOf(SCHEDULE_FREQUENCIES, "frequency").default("Monthly"),
  dueDay: z.coerce.number().int().min(1).max(31).default(10),
  anchorMonth: z.coerce.number().int().min(1).max(12).default(4),
  priority: oneOf(TASK_PRIORITIES, "priority").default("Medium"),
  active: z.boolean().default(true),
  clientId: optionalText,
  assigneeId: optionalText,
  notes: optionalText,
});
export const scheduleUpdateSchema = scheduleCreateSchema.partial();

export const reminderSettingsSchema = z
  .object({
    enabled: z.boolean(),
    leadDays: z.coerce.number().int().min(0).max(60),
    notifyAssignee: z.boolean(),
    notifyClient: z.boolean(),
    channelEmail: z.boolean(),
    channelWhatsapp: z.boolean(),
    notifyDscExpiry: z.boolean(),
    dscLeadDays: z.coerce.number().int().min(0).max(180),
  })
  .partial();

export const dscCreateSchema = z.object({
  holderName: z.string().trim().min(1, "Holder name is required"),
  class: oneOf(DSC_CLASSES, "class").default("Class 3"),
  authority: oneOf(DSC_AUTHORITIES, "authority").default("eMudhra"),
  serialNumber: optionalText,
  email: optionalText,
  phone: optionalText,
  issueDate: optionalDate,
  expiryDate: z.string().min(1, "Expiry date is required").transform((v) => new Date(v)),
  status: oneOf(DSC_STATUSES, "status").default("Active"),
  location: optionalText,
  notes: optionalText,
  clientId: optionalText,
});
export const dscUpdateSchema = dscCreateSchema.partial();

export const packetCreateSchema = z.object({
  receivedFrom: z.string().trim().min(1, "Delivered-by person is required"),
  contents: z.string().trim().min(1, "Contents description is required"),
  purpose: optionalText,
  mode: oneOf(PACKET_MODES, "mode").default("Hand Delivery"),
  courierRef: optionalText,
  location: optionalText,
  notes: optionalText,
  receivedAt: optionalDate,
  clientId: optionalText,
});
export const packetUpdateSchema = packetCreateSchema.partial();

export const organizationSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  tagline: z.string().trim().default("Chartered Accountants"),
  address: optionalText,
  phone: optionalText,
  email: optionalText,
  pan: optionalText,
  gstin: optionalText,
  sacCode: z.string().trim().default("9982"),
  bankName: optionalText,
  bankAccount: optionalText,
  bankIfsc: optionalText,
  bankUpi: optionalText,
  invoiceNote: optionalText,
  invoicePrefix: z
    .union([
      z.string().trim().max(10).regex(/^[A-Za-z0-9]+$/, "Letters and numbers only"),
      z.literal(""),
      z.null(),
    ])
    .optional()
    .transform((v) => (v ? v.toUpperCase() : null)),
});
export const organizationUpdateSchema = organizationSchema.partial();

export const itrCreateSchema = z.object({
  clientId: z.string().trim().min(1, "Client is required"),
  financialYear: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, "Financial year must look like 2025-26"),
  formType: oneOf(ITR_FORMS, "ITR form").default("ITR-1"),
  regime: oneOf(ITR_REGIMES, "regime").default("New"),
  status: oneOf(ITR_STATUSES, "status").default("Documents Awaited"),
  filedOn: optionalDate,
  ackNumber: optionalText,
  refundAmount: z
    .preprocess(
      (v) => (v === "" || v == null ? null : v),
      z.coerce.number().min(0).nullable(),
    )
    .optional(),
  assigneeId: optionalText,
  notes: optionalText,
});
export const itrUpdateSchema = itrCreateSchema.partial();

export const roleCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Role name is required")
    .max(40)
    .regex(/^[A-Za-z0-9 &./-]+$/, "Use letters, numbers and spaces only"),
  description: optionalText,
});

export const roleUpdateSchema = z.object({
  description: optionalText,
});

export const rolePermissionSchema = z.object({
  permission: z.string().trim().min(1),
  allowed: z.boolean(),
});

export const emailSettingsSchema = z.object({
  provider: z
    .union([z.literal("google"), z.literal("resend")])
    .optional(),
  fromName: optionalText,
  fromEmail: z
    .union([z.string().trim().email("Valid email required"), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
  replyTo: z
    .union([z.string().trim().email("Valid email required"), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
  // Blank/omitted = keep the stored secret; the literal "clear" removes it.
  appPassword: z.string().trim().optional(),
  resendApiKey: z.string().trim().optional(),
});

export const invitationCreateSchema = z.object({
  email: z.string().trim().email("Valid email required"),
  name: optionalText,
  role: z.string().trim().min(1, "Role is required"),
});

export const invitationAcceptSchema = z.object({
  token: z.string().trim().min(1),
  name: z.string().trim().min(1, "Name is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const packetMovementSchema = z.object({
  direction: z.string().refine((v) => v === "In" || v === "Out", {
    message: 'direction must be "In" or "Out"',
  }),
  person: z.string().trim().min(1, "Person is required"),
  mode: oneOf(PACKET_MODES, "mode").default("Hand Delivery"),
  courierRef: optionalText,
  note: optionalText,
});

// Turn a ZodError into a single readable message.
export function zodMessage(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join(", ");
}
