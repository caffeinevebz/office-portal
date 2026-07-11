import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getDefaultOrg } from "@/lib/org";
import { APP_NAME } from "@/lib/constants";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Browser-tab title: the app name, then the firm the portal is set up for.
export async function generateMetadata(): Promise<Metadata> {
  let firm: string | undefined;
  try {
    firm = (await getDefaultOrg())?.name?.trim() || undefined;
  } catch {
    // Database unreachable (e.g. during build) — fall back to the app name.
  }
  return {
    title: firm ? `${APP_NAME} · ${firm}` : APP_NAME,
    description:
      "Ledgify — office management for a Chartered Accountancy firm: clients, compliance, billing and team.",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
