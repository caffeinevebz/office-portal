import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/constants";
import { brandIcon } from "@/lib/brand";

// Web-app manifest: lets the portal be installed on a phone's home screen
// and open full-screen like a native app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description:
      "Office management for a Chartered Accountancy firm — clients, compliance, billing and team.",
    start_url: "/",
    display: "standalone",
    background_color: "#1c3b2f",
    theme_color: "#1c3b2f",
    icons: [
      { src: brandIcon(192), sizes: "192x192", type: "image/png" },
      { src: brandIcon(512), sizes: "512x512", type: "image/png" },
      {
        src: brandIcon(512),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
