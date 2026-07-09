"use client";

import { createContext, useContext } from "react";
import { can as canFn, type Permission } from "./roles";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

const AuthContext = createContext<AuthUser | null>(null);

export function AuthProvider({
  user,
  children,
}: {
  user: AuthUser;
  children: React.ReactNode;
}) {
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const user = useContext(AuthContext);
  return {
    user,
    can: (permission: Permission) => canFn(user?.role, permission),
  };
}
