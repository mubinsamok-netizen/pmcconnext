import { getAppRole, type AppRole } from "@/lib/roles";

export type AppPermission =
  | "team.manage"
  | "siteDocument.upload"
  | "siteMemo.create"
  | "siteMemo.issue"
  | "siteMemo.acknowledge"
  | "vo.create"
  | "vo.submitToClient"
  | "vo.approveOnBehalf"
  | "vo.recordClientDecision"
  | "vo.addToPlan"
  | "vo.createInvoice"
  | "vo.recordPayment"
  | "vo.cancel"
  | "vo.expiryCheck"
  | "vo.overdueCheck"
  | "vo.generateMonthlyReport";

const PERMISSION_MATRIX: Record<AppRole, AppPermission[]> = {
  Admin: [
    "team.manage",
    "siteDocument.upload",
    "siteMemo.create",
    "siteMemo.issue",
    "siteMemo.acknowledge",
    "vo.create",
    "vo.submitToClient",
    "vo.approveOnBehalf",
    "vo.recordClientDecision",
    "vo.addToPlan",
    "vo.createInvoice",
    "vo.recordPayment",
    "vo.cancel",
    "vo.expiryCheck",
    "vo.overdueCheck",
    "vo.generateMonthlyReport",
  ],
  "Project Manager": [
    "siteMemo.create",
    "siteMemo.issue",
    "siteMemo.acknowledge",
    "vo.create",
    "vo.submitToClient",
    "vo.approveOnBehalf",
    "vo.recordClientDecision",
    "vo.addToPlan",
    "vo.cancel",
    "vo.expiryCheck",
    "vo.overdueCheck",
    "vo.generateMonthlyReport",
  ],
  Engineer: [
    "siteDocument.upload",
    "siteMemo.create",
    "siteMemo.issue",
    "siteMemo.acknowledge",
  ],
  Foreman: [
    "siteDocument.upload",
    "siteMemo.create",
    "siteMemo.issue",
    "siteMemo.acknowledge",
  ],
  Staff: [
    "vo.create",
    "vo.approveOnBehalf",
    "vo.recordClientDecision",
    "vo.createInvoice",
    "vo.recordPayment",
    "vo.expiryCheck",
    "vo.overdueCheck",
    "vo.generateMonthlyReport",
  ],
};

export function hasPermission(role: string | null | undefined, permission: AppPermission) {
  return PERMISSION_MATRIX[getAppRole(role)].includes(permission);
}

export function getRolePermissions(role: string | null | undefined) {
  return PERMISSION_MATRIX[getAppRole(role)];
}

export function permissionDeniedMessage(permission: AppPermission) {
  return `ไม่มีสิทธิ์ทำรายการนี้ (${permission})`;
}
