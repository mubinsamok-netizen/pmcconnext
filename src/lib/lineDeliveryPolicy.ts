const BLOCKED_BRANCH = "zoneidea-upgrade-performance";

function branchName(value?: string) {
  return String(value || "").trim().replace(/^refs\/heads\//, "");
}

export function isLineDeliveryDisabled() {
  const branches = [
    process.env.PMC_BUILD_GIT_BRANCH,
    process.env.VERCEL_GIT_COMMIT_REF,
    process.env.GITHUB_HEAD_REF,
    process.env.GITHUB_REF_NAME,
  ].map(branchName).filter(Boolean);
  // Build metadata survives promotion/redeployment. Unknown builds fail closed.
  return branches.length === 0 || branches.includes(BLOCKED_BRANCH);
}

export function assertLineDeliveryEnabled() {
  if (isLineDeliveryDisabled()) {
    console.warn("LINE delivery blocked by branch policy");
    throw Object.assign(new Error("ปิดการส่ง LINE สำหรับ branch ทดสอบนี้ ข้อความไม่ได้ถูกส่งถึงลูกค้า"), {
      code: "LINE_DELIVERY_DISABLED_FOR_BRANCH",
    });
  }
}
