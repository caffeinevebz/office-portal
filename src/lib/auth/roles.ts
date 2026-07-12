// Access-control catalog. Permissions are a fixed set defined in code; which
// roles (user categories) get which permission is a mix of these built-in
// defaults and admin overrides stored in the database. Roles themselves can be
// added by an admin. This module is pure — safe to import on client or server.

export type Permission =
  | "manageClients"
  | "deleteClients"
  | "manageTasks"
  | "deleteTasks"
  | "manageInvoices"
  | "manageDocuments"
  | "deleteDocuments"
  | "manageSchedules"
  | "manageReminders"
  | "manageDsc"
  | "deleteDsc"
  | "manageInward"
  | "deleteInward"
  | "manageOrgs"
  | "manageItr"
  | "deleteItr"
  | "manageTeam"
  | "manageRoles";

export const PERMISSION_CATEGORIES = [
  "Clients",
  "Tasks",
  "Billing",
  "Documents & registers",
  "Reminders",
  "Firm administration",
] as const;

export const PERMISSION_META: Record<
  Permission,
  { label: string; category: (typeof PERMISSION_CATEGORIES)[number] }
> = {
  manageClients: { label: "Add & edit clients (and import)", category: "Clients" },
  deleteClients: { label: "Delete clients", category: "Clients" },
  manageTasks: { label: "Add & edit tasks, change status", category: "Tasks" },
  deleteTasks: { label: "Delete tasks", category: "Tasks" },
  manageSchedules: { label: "Manage recurring obligations & generate", category: "Tasks" },
  manageItr: { label: "Manage ITR filings", category: "Tasks" },
  deleteItr: { label: "Delete ITR filings", category: "Tasks" },
  manageInvoices: { label: "Create, edit & delete invoices", category: "Billing" },
  manageDocuments: { label: "Manage documents", category: "Documents & registers" },
  deleteDocuments: { label: "Delete documents", category: "Documents & registers" },
  manageDsc: { label: "Manage DSC register & record custody", category: "Documents & registers" },
  deleteDsc: { label: "Delete DSCs", category: "Documents & registers" },
  manageInward: { label: "Maintain inward/outward register", category: "Documents & registers" },
  deleteInward: { label: "Delete inward/outward entries", category: "Documents & registers" },
  manageReminders: { label: "Configure & send reminders", category: "Reminders" },
  manageOrgs: { label: "Firm settings & billing organizations", category: "Firm administration" },
  manageTeam: { label: "Manage the team & send invitations", category: "Firm administration" },
  manageRoles: { label: "Manage roles & access levels", category: "Firm administration" },
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_META) as Permission[];

/** Roles that ship with the app and cannot be deleted. */
export const SYSTEM_ROLES = [
  "Partner",
  "Admin",
  "Manager",
  "Accountant",
  "Article Assistant",
] as const;

/** Partner is the super-admin and always holds every permission. */
export const SUPERADMIN_ROLE = "Partner";

// Built-in default: which system roles get each permission.
export const DEFAULT_MATRIX: Record<Permission, string[]> = {
  manageClients: ["Partner", "Admin", "Manager", "Accountant"],
  deleteClients: ["Partner", "Admin", "Manager"],
  manageTasks: ["Partner", "Admin", "Manager", "Accountant", "Article Assistant"],
  deleteTasks: ["Partner", "Admin", "Manager", "Accountant"],
  manageSchedules: ["Partner", "Admin", "Manager"],
  manageItr: ["Partner", "Admin", "Manager", "Accountant", "Article Assistant"],
  deleteItr: ["Partner", "Admin", "Manager", "Accountant"],
  manageInvoices: ["Partner", "Admin", "Manager"],
  manageDocuments: ["Partner", "Admin", "Manager", "Accountant", "Article Assistant"],
  deleteDocuments: ["Partner", "Admin", "Manager", "Accountant"],
  manageDsc: ["Partner", "Admin", "Manager", "Accountant"],
  deleteDsc: ["Partner", "Admin", "Manager"],
  manageInward: ["Partner", "Admin", "Manager", "Accountant", "Article Assistant"],
  deleteInward: ["Partner", "Admin", "Manager"],
  manageReminders: ["Partner", "Admin", "Manager"],
  manageOrgs: ["Partner", "Admin"],
  manageTeam: ["Partner", "Admin"],
  manageRoles: ["Partner", "Admin"],
};

/** Built-in default for a (role, permission) — before DB overrides. */
export function defaultAllowed(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  if (role === SUPERADMIN_ROLE) return true;
  return DEFAULT_MATRIX[permission]?.includes(role) ?? false;
}

/** Short description of the built-in system roles (fallback for the UI). */
export const ROLE_ACCESS: Record<string, string> = {
  Partner: "Full access, including the team, roles and firm settings",
  Admin: "Full access, including the team, roles and firm settings",
  Manager: "Clients, compliance, billing and documents; not firm settings",
  Accountant: "Clients, compliance and documents; view-only billing",
  "Article Assistant": "Compliance and documents; view-only clients & billing",
};
