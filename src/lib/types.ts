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
  client?: Client | null;
  assignee?: Staff | null;
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
