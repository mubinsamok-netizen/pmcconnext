import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  outputFileTracingIncludes: {
    "/api/reports": ["node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/weekly-reports": ["node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/monthly-reports": ["node_modules/@sparticuz/chromium/bin/**/*"],
  },
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "http://localhost:3000",
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
