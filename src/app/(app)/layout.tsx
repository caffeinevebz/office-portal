import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { effectivePermissions } from "@/lib/auth/effective";
import { getDefaultOrg } from "@/lib/org";
import { FIRM } from "@/lib/firm";
import { AppShell } from "@/components/AppShell";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [org, permissions] = await Promise.all([
    getDefaultOrg(),
    effectivePermissions(user.role),
  ]);
  const branding = {
    name: org?.name ?? FIRM.name,
    tagline: org?.tagline ?? FIRM.tagline,
    hasLogo: !!org?.logoMime,
  };

  return (
    <AppShell user={user} permissions={permissions} branding={branding}>
      {children}
    </AppShell>
  );
}
