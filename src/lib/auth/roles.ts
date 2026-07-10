// Role-based access control. Pure functions, safe to import on client or server.

export type Role =
  | "Partner"
  | "Admin"
  | "Manager"
  | "Accountant"
  | "Article Assistant";

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
  | "manageTeam";

// Which roles are granted each permission. Every authenticated user can *read*
// everything; these gate the write/delete actions.
const MATRIX: Record<Permission, Role[]> = {
  manageClients: ["Partner", "Admin", "Manager", "Accountant"],
  deleteClients: ["Partner", "Admin", "Manager"],
  manageTasks: ["Partner", "Admin", "Manager", "Accountant", "Article Assistant"],
  deleteTasks: ["Partner", "Admin", "Manager", "Accountant"],
  manageInvoices: ["Partner", "Admin", "Manager"],
  manageDocuments: ["Partner", "Admin", "Manager", "Accountant", "Article Assistant"],
  deleteDocuments: ["Partner", "Admin", "Manager", "Accountant"],
  manageSchedules: ["Partner", "Admin", "Manager"],
  manageReminders: ["Partner", "Admin", "Manager"],
  manageDsc: ["Partner", "Admin", "Manager", "Accountant"],
  deleteDsc: ["Partner", "Admin", "Manager"],
  // The inward register is maintained by the whole office, including articles.
  manageInward: ["Partner", "Admin", "Manager", "Accountant", "Article Assistant"],
  deleteInward: ["Partner", "Admin", "Manager"],
  manageTeam: ["Partner", "Admin"],
};

export function can(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[permission]?.includes(role as Role) ?? false;
}

// Short human description of each role's access level (shown in the UI).
export const ROLE_ACCESS: Record<string, string> = {
  Partner: "Full access, including the team and roles",
  Admin: "Full access, including the team and roles",
  Manager: "Clients, compliance, billing and documents; not the team",
  Accountant: "Clients, compliance and documents; view-only billing",
  "Article Assistant": "Compliance and documents; view-only clients & billing",
};
