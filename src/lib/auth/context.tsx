"use client";

import { createContext, useContext } from "react";
import type { Permission } from "./roles";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type AuthValue = { user: AuthUser | null; permissions: string[] };

const AuthContext = createContext<AuthValue>({ user: null, permissions: [] });

export function AuthProvider({
  user,
  permissions,
  children,
}: {
  user: AuthUser;
  permissions: string[];
  children: React.ReactNode;
}) {
  return (
    <AuthContext.Provider value={{ user, permissions }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const { user, permissions } = useContext(AuthContext);
  return {
    user,
    permissions,
    can: (permission: Permission) => permissions.includes(permission),
  };
}
