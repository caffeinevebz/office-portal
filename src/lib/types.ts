// Shapes returned by the API routes (dates arrive as ISO strings over JSON).

export type TradeName = {
  id: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  clientId: string;
  createdAt: string;
};

export type ClientGroup = {
  id: string;
  name: string;
  code: string;
  notes: string | null;
  createdAt: string;
  _count?: { clients: number };
};

export type Client = {
  id: string;
  name: string;
  type: string;
  pan: string | null;
  gstin: string | null;
  tan: string | null;
  aadhaar: string | null;
  cin: string | null;
  llpin: string | null;
  firmRegNo: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  contactPerson: string | null;
  status: string;
  notes: string | null;
  groupId: string | null;
  group?: ClientGroup | null;
  tradeNames?: TradeName[];
  createdAt: string;
  updatedAt: string;
  _count?: { tasks: number; invoices: number; documents: number };
};

export type Staff = {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  active: boolean;
  createdAt: string;
  _count?: { tasks: number };
};

export type Invitation = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
  expired: boolean;
};

export type RoleInfo = {
  name: string;
  description: string | null;
  isSystem: boolean;
  isSuperadmin: boolean;
  staffCount: number;
  permissions: string[];
};

export type PermissionMeta = { key: string; label: string; category: string };

export type RolesResponse = {
  roles: RoleInfo[];
  permissions: PermissionMeta[];
  categories: string[];
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  isReturnFiling: boolean;
  filingDate: string | null;
  ackNumber: string | null;
  taskType: string | null;
  financialYear: string | null;
  periodMonth: number | null;
  periodQuarter: string | null;
  tdsForm: string | null;
  returnNature: string | null;
  gstReturnType: string | null;
  gstPeriodicity: string | null;
  checklist: ChecklistItem[] | null;
  createdAt: string;
  clientId: string | null;
  assigneeId: string | null;
  scheduleId: string | null;
  client?: Client | null;
  assignee?: Staff | null;
};

export type ChecklistItem = { label: string; done: boolean };

export type ComplianceSchedule = {
  id: string;
  title: string;
  category: string;
  frequency: string;
  dueDay: number;
  anchorMonth: number;
  priority: string;
  active: boolean;
  notes: string | null;
  source: string | null;
  sourceKey: string | null;
  createdAt: string;
  clientId: string | null;
  assigneeId: string | null;
  client?: Client | null;
  assignee?: Staff | null;
  _count?: { tasks: number };
};

export type Organization = {
  id: string;
  name: string;
  tagline: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  pan: string | null;
  gstin: string | null;
  sacCode: string;
  bankName: string | null;
  bankAccount: string | null;
  bankIfsc: string | null;
  bankUpi: string | null;
  invoiceNote: string | null;
  invoicePrefix: string | null;
  isDefault: boolean;
  hasLogo: boolean;
  createdAt: string;
  _count?: { invoices: number };
};

export type Invoice = {
  id: string;
  invoiceNumber: string;
  description: string | null;
  amount: number;
  taxRate: number;
  gstMode: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  paidDate: string | null;
  receiptNumber: string | null;
  clientId: string;
  client?: Client | null;
  tradeNameId: string | null;
  tradeName?: TradeName | null;
  organizationId: string | null;
  organization?: { id: string; name: string } | null;
};

export type ItrFiling = {
  id: string;
  financialYear: string | null;
  formType: string;
  regime: string;
  status: string;
  filedOn: string | null;
  ackNumber: string | null;
  refundAmount: number | null;
  notes: string | null;
  createdAt: string;
  clientId: string;
  assigneeId: string | null;
  client?: Client | null;
  assignee?: Staff | null;
};

export type DocumentRecord = {
  id: string;
  name: string;
  category: string;
  financialYear: string | null;
  note: string | null;
  uploadedAt: string;
  clientId: string | null;
  client?: Client | null;
};

export type ClientDetail = Client & {
  tasks: Task[];
  invoices: Invoice[];
  documents: DocumentRecord[];
};

export type ReminderSettings = {
  id: string;
  enabled: boolean;
  leadDays: number;
  notifyAssignee: boolean;
  notifyClient: boolean;
  channelEmail: boolean;
  channelWhatsapp: boolean;
  notifyDscExpiry: boolean;
  dscLeadDays: number;
  updatedAt: string;
};

export type PacketMovement = {
  id: string;
  direction: string;
  outwardNumber: string | null;
  person: string;
  mode: string;
  courierRef: string | null;
  note: string | null;
  byName: string;
  createdAt: string;
  packetId: string;
};

export type DocPacket = {
  id: string;
  inwardNumber: string;
  receivedFrom: string;
  contents: string;
  purpose: string | null;
  mode: string;
  courierRef: string | null;
  location: string | null;
  notes: string | null;
  status: string;
  receivedByName: string;
  receivedAt: string;
  createdAt: string;
  clientId: string | null;
  client?: Client | null;
  movements?: PacketMovement[];
};

export type DscMovement = {
  id: string;
  direction: string;
  note: string | null;
  byName: string;
  createdAt: string;
  dscId: string;
};

export type Dsc = {
  id: string;
  holderName: string;
  class: string;
  authority: string;
  serialNumber: string | null;
  email: string | null;
  phone: string | null;
  issueDate: string | null;
  expiryDate: string;
  status: string;
  custody: string;
  location: string | null;
  notes: string | null;
  createdAt: string;
  clientId: string | null;
  client?: Client | null;
  movements?: DscMovement[];
};

export type ReminderCandidate = {
  taskId: string | null;
  taskTitle: string;
  clientName: string | null;
  channel: "Email" | "WhatsApp";
  recipientType: "Staff" | "Client";
  recipientName: string;
  to: string;
  subject: string;
  body: string;
  dueDate: string;
  dedupeKey: string;
};

export type NotificationLog = {
  id: string;
  createdAt: string;
  channel: string;
  recipientType: string;
  recipientName: string;
  to: string;
  subject: string;
  body: string;
  status: string;
  taskId: string | null;
};
