import { z } from "zod";
import {
  CLIENT_TYPES,
  CLIENT_STATUSES,
  TASK_CATEGORIES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  STAFF_ROLES,
  INVOICE_STATUSES,
  DOC_CATEGORIES,
  SCHEDULE_FREQUENCIES,
  DSC_CLASSES,
  DSC_AUTHORITIES,
  DSC_STATUSES,
  PACKET_MODES,
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
  email: optionalText,
  phone: optionalText,
  address: optionalText,
  contactPerson: optionalText,
  notes: optionalText,
});
export const clientUpdateSchema = clientCreateSchema.partial();

export const staffCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Valid email required"),
  role: oneOf(STAFF_ROLES, "role"),
  phone: optionalText,
  active: z.boolean().default(true),
  // Optional login password. If omitted/blank, the member cannot sign in yet.
  password: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().min(6, "Password must be at least 6 characters").optional(),
  ),
});
export const staffUpdateSchema = staffCreateSchema.partial();

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: optionalText,
  category: oneOf(TASK_CATEGORIES, "category").default("Other"),
  status: oneOf(TASK_STATUSES, "status").default("Pending"),
  priority: oneOf(TASK_PRIORITIES, "priority").default("Medium"),
  dueDate: optionalDate,
  clientId: optionalText,
  assigneeId: optionalText,
});
export const taskUpdateSchema = taskCreateSchema.partial();

export const invoiceCreateSchema = z.object({
  invoiceNumber: z.string().trim().min(1, "Invoice number is required"),
  clientId: z.string().trim().min(1, "Client is required"),
  description: optionalText,
  amount: z.coerce.number().min(0, "Amount must be positive"),
  taxRate: z.coerce.number().min(0).max(100).default(18),
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
