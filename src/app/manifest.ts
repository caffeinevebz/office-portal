import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/constants";

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
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
