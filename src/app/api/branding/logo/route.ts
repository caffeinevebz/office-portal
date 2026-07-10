import { fail, route } from "@/lib/api";
import { getDefaultOrg } from "@/lib/org";

// Public: the default organization's logo image (shown on the login screen
// and in the sidebar). 404 when none is uploaded.
export const GET = route(async () => {
  const org = await getDefaultOrg();
  if (!org?.logo || !org.logoMime) return fail("No logo", 404);
  return new Response(Buffer.from(org.logo), {
    headers: { "Content-Type": org.logoMime, "Cache-Control": "no-store" },
  });
});
