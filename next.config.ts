import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // nodemailer (Google SMTP delivery) uses Node APIs that shouldn't be bundled.
  serverExternalPackages: ["nodemailer"],
};

export default nextConfig;
