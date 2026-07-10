import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
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

  const org = await getDefaultOrg();
  const branding = {
    name: org?.name ?? FIRM.name,
    tagline: org?.tagline ?? FIRM.tagline,
    hasLogo: !!org?.logoMime,
  };

  return (
    <AppShell user={user} branding={branding}>
      {children}
    </AppShell>
  );
}
