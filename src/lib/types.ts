// Shapes returned by the API routes (dates arrive as ISO strings over JSON).

export type Client = {
  id: string;
  name: string;
  type: string;
  pan: string | null;
  gstin: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  contactPerson: string | null;
  status: string;
  notes: string | null;
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

export type Task = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  clientId: string | null;
  assigneeId: string | null;
  scheduleId: string | null;
  client?: Client | null;
  assignee?: Staff | null;
};

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
  createdAt: string;
  clientId: string | null;
  assigneeId: string | null;
  client?: Client | null;
  assignee?: Staff | null;
  _count?: { tasks: number };
};

export type Invoice = {
  id: string;
  invoiceNumber: string;
  description: string | null;
  amount: number;
  taxRate: number;
  status: string;
  issueDate: string;
  dueDate: string | null;
  paidDate: string | null;
  clientId: string;
  client?: Client | null;
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
