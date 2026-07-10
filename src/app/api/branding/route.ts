import { ok, route } from "@/lib/api";
import { getDefaultOrg } from "@/lib/org";
import { FIRM } from "@/lib/firm";

// Public: the default organization's display identity, used on the login and
// setup screens before any session exists. Exposes nothing sensitive.
export const GET = route(async () => {
  const org = await getDefaultOrg();
  return ok({
    name: org?.name ?? FIRM.name,
    tagline: org?.tagline ?? FIRM.tagline,
    hasLogo: !!org?.logoMime,
  });
});
