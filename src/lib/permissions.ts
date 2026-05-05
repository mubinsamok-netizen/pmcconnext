import { getAppRole, type AppRole } from "@/lib/roles";

export type AppPermission =
  | "team.manage"
  | "payment.create"
  | "payment.submit"
  | "payment.review"
  | "payment.approve"
  | "payment.requestInfo"
  | "payment.reject"
  | "payment.transfer"
  | "payment.close"
  | "payment.uploadAttachment"
  | "payment.generateDocument"
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
    "payment.create",
    "payment.submit",
    "payment.review",
    "payment.approve",
    "payment.requestInfo",
    "payment.reject",
    "payment.transfer",
    "payment.close",
    "payment.uploadAttachment",
    "payment.generateDocument",
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
    "payment.create",
    "payment.submit",
    "payment.uploadAttachment",
    "payment.generateDocument",
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
    "payment.create",
    "payment.submit",
    "payment.uploadAttachment",
    "payment.generateDocument",
  ],
  Staff: [
    "payment.review",
    "payment.approve",
    "payment.requestInfo",
    "payment.reject",
    "payment.transfer",
    "payment.close",
    "payment.uploadAttachment",
    "payment.generateDocument",
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
