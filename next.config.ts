import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";

function buildGitBranch() {
  try {
    const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (branch) return branch;
  } catch {
    // Vercel checkouts may not include .git; use deployment metadata below.
  }
  return process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "";
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  outputFileTracingIncludes: {
    "/api/reports": ["node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/weekly-reports": ["node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/monthly-reports": ["node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/sites/*/payment-requests": [
      "public/fonts/THSarabunNew.ttf",
      "public/fonts/THSarabunNew-Bold.ttf",
      "public/logo.png",
    ],
  },
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "http://localhost:3000",
    // Public build metadata only; no LINE credentials are embedded in the bundle.
    PMC_BUILD_GIT_BRANCH: buildGitBranch(),
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
