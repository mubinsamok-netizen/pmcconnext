import {
  getSupabaseAuditLogs,
  getSupabaseBudget,
  getSupabaseCustomers,
  getSupabaseCustomerDecisions,
  getSupabaseDailyReports,
  getSupabaseDefectEvidence,
  getSupabaseDefectItems,
  getSupabaseDefectRounds,
  getSupabaseIssues,
  getSupabaseMaterials,
  getSupabaseMilestones,
  getSupabaseMonthlyReports,
  getSupabaseNotifications,
  getSupabaseProjectDocuments,
  getSupabaseProjectLifecycle,
  getSupabaseProjects,
  getSupabaseProjectWarranty,
  getSupabaseQcChecklists,
  getSupabaseSiteMemoEvidence,
  getSupabaseSiteMemos,
  getSupabaseSiteNotes,
  getSupabaseTasks,
  getSupabaseTeamMembers,
  getSupabaseUserProjectAccess,
  getSupabaseVariationOrders,
  getSupabaseVoDocuments,
  getSupabaseVoFinanceLedger,
  getSupabaseVoItems,
  getSupabaseVoPayments,
  getSupabaseVoTaskLinks,
  getSupabaseWeeklyReports,
  type SheetLikeRecord,
} from "@/lib/supabaseReadModel";
import { supabaseDelete, supabaseInsert, supabasePatch } from "@/lib/supabaseRest";
import { getSupabaseMasterSchema, getSupabaseSiteSchema } from "@/lib/supabaseSchema";

type SheetValue = string | number | boolean | null | undefined;
type SheetRow = { _rowIndex: number | string } & Record<string, string | number | undefined>;
type CrudResult = { success: true; inserted?: SheetLikeRecord };
type MasterTable = "Projects" | "Team" | "UserSites" | "Customers" | "Notifications" | "AuditLogs";
type SiteTable =
  | "Tasks"
  | "Milestones"
  | "Budget"
  | "Materials"
  | "Issues"
  | "Daily_Reports"
  | "Weekly_Reports"
  | "Monthly_Reports"
  | "Project_Documents"
  | "Project_Lifecycle"
  | "Project_Warranty"
  | "Customer_Decisions"
  | "Defect_Rounds"
  | "Defect_Items"
  | "Defect_Evidence"
  | "QC_Checklists"
  | "Site_Memos"
  | "Site_Memo_Evidence"
  | "Variation_Orders"
  | "VO_Items"
  | "VO_Documents"
  | "VO_Payments"
  | "VO_Task_Links"
  | "VO_Finance_Ledger"
  | "Site_Notes";

type TableConfig = {
  table: string;
  keyColumn: string;
  toDb: (data: Record<string, SheetValue>) => Record<string, unknown>;
  fromDb: (projectId?: string | null) => Promise<SheetLikeRecord[]>;
  includeCreatedAt?: boolean;
  includeUpdatedAt?: boolean;
};

function emptyToNull(value: unknown) {
  return value === "" || value === undefined ? null : value;
}

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function numberOrNull(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function boolOrNull(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return null;
}

function jsonOrEmptyArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (value === "" || value === null || value === undefined) return [];
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function jsonOrNull(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function jsonOrValue(value: unknown, fallback: unknown = null) {
  if (value === "" || value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function listOrNull(value: unknown) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const values = text(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : null;
}

function pick(data: Record<string, SheetValue>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys
    .filter((key) => data[key] !== undefined)
    .map((key) => [key, data[key]]));
}

function toProjectDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "project_id",
    "name",
    "client",
    "project_type",
    "description",
    "address",
    "province",
    "district",
    "status",
    "contract_no",
    "site_link",
    "pm_name",
    "se_name",
    "architect_name",
    "cover_file_id",
    "cover_url",
    "site_sheet_id",
    "drive_folder_id",
    "sales_customer_id",
    "sales_stage",
    "deposit_status",
    "line_group_id",
    "line_group_name",
  ]);

  if (data.start_date !== undefined) payload.start_date = emptyToNull(data.start_date);
  if (data.end_date !== undefined) payload.end_date = emptyToNull(data.end_date);
  if (data.budget !== undefined) payload.budget = numberOrNull(data.budget);
  if (data.active !== undefined) payload.active = boolOrNull(data.active);
  if (data.line_notify_enabled !== undefined) {
    payload.line_notify_enabled = boolOrNull(data.line_notify_enabled);
  }

  return payload;
}

function toTeamDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "member_id",
    "name",
    "role",
    "email",
    "phone",
    "google_sub",
    "avatar_url",
  ]);

  if (data.email !== undefined) payload.email = emptyToNull(data.email);
  if (data.phone !== undefined) payload.phone = emptyToNull(data.phone);
  if (data.google_sub !== undefined) payload.google_sub = emptyToNull(data.google_sub);
  if (data.auth_provider !== undefined) payload.auth_provider = emptyToNull(data.auth_provider);
  if (data.project_ids !== undefined) payload.project_ids = listOrNull(data.project_ids);
  if (data.active !== undefined) payload.active = boolOrNull(data.active);
  if (data.last_login_at !== undefined) payload.last_login_at = emptyToNull(data.last_login_at);
  if (data.password !== undefined) payload.password = emptyToNull(data.password);

  return payload;
}

function toUserProjectAccessDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "email",
    "google_sub",
    "project_id",
    "role",
  ]);

  if (data.email !== undefined) payload.email = emptyToNull(data.email);
  if (data.google_sub !== undefined) payload.google_sub = emptyToNull(data.google_sub);
  if (data.active !== undefined) payload.active = boolOrNull(data.active);
  return payload;
}

function toCustomerDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "id",
    "full_name",
    "nickname",
    "phone",
    "line_id",
    "address",
    "requirements",
    "interest_level",
    "status",
    "notes",
    "freebies",
    "created_by",
  ]);

  if (data.project_id !== undefined) payload.project_id = emptyToNull(data.project_id);
  if (data.contact_logs_json !== undefined) payload.contact_logs = jsonOrEmptyArray(data.contact_logs_json);
  if (data.last_contacted_at !== undefined) payload.last_contacted_at = emptyToNull(data.last_contacted_at);
  if (data.next_follow_up_date !== undefined) payload.next_follow_up_date = emptyToNull(data.next_follow_up_date);
  if (data.active !== undefined) payload.active = boolOrNull(data.active);
  return payload;
}

function toNotificationDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "notification_id",
    "target_email",
    "target_role",
    "target_google_sub",
    "type",
    "title",
    "message",
    "link",
    "created_by_email",
    "created_by_name",
  ]);

  if (data.project_id !== undefined) payload.project_id = emptyToNull(data.project_id);
  if (data.is_read !== undefined) payload.is_read = boolOrNull(data.is_read);
  if (data.created_at !== undefined) payload.created_at = emptyToNull(data.created_at);
  if (data.read_at !== undefined) payload.read_at = emptyToNull(data.read_at);
  return payload;
}

function toAuditLogDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "log_id",
    "actor_email",
    "actor_name",
    "actor_role",
    "actor_google_sub",
    "module",
    "action",
    "target_id",
    "summary",
  ]);

  if (data.project_id !== undefined) payload.project_id = emptyToNull(data.project_id);
  if (data.timestamp !== undefined) payload.timestamp = emptyToNull(data.timestamp);
  if (data.before_json !== undefined) payload.before_json = jsonOrNull(data.before_json);
  if (data.after_json !== undefined) payload.after_json = jsonOrNull(data.after_json);
  return payload;
}

function toTaskDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "task_id",
    "project_id",
    "name",
    "assignee",
    "status",
    "category",
    "priority",
    "notes",
    "task_type",
    "parent_task_id",
    "linked_vo_id",
    "vo_badge",
    "payment_note",
    "unlock_reason",
  ]);

  if (data.start !== undefined) payload.start_date = emptyToNull(data.start);
  if (data.end !== undefined) payload.end_date = emptyToNull(data.end);
  if (data.start_date !== undefined) payload.start_date = emptyToNull(data.start_date);
  if (data.end_date !== undefined) payload.end_date = emptyToNull(data.end_date);
  if (data.planned_start !== undefined) payload.planned_start = emptyToNull(data.planned_start);
  if (data.planned_end !== undefined) payload.planned_end = emptyToNull(data.planned_end);
  if (data.unlock_date !== undefined) payload.unlock_date = emptyToNull(data.unlock_date);
  if (data.percent_done !== undefined) payload.percent_done = numberOrNull(data.percent_done);
  if (data.duration_days !== undefined) payload.duration_days = numberOrNull(data.duration_days);
  if (data.order_index !== undefined) payload.order_index = numberOrNull(data.order_index);
  if (data.gantt_locked !== undefined) payload.gantt_locked = boolOrNull(data.gantt_locked);

  return payload;
}

function toMilestoneDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "milestone_id",
    "project_id",
    "title",
    "type",
    "color",
    "notes",
  ]);

  if (data.date !== undefined) payload.date = emptyToNull(data.date);
  return payload;
}

function toBudgetDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "budget_id",
    "project_id",
    "category",
  ]);

  ["planned", "actual", "variance"].forEach((key) => {
    if (data[key] !== undefined) payload[key] = numberOrNull(data[key]);
  });
  return payload;
}

function toMaterialDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "material_id",
    "project_id",
    "name",
    "supplier",
    "unit",
    "status",
  ]);

  ["quantity", "qty_plan", "qty_actual", "cost"].forEach((key) => {
    if (data[key] !== undefined) payload[key] = numberOrNull(data[key]);
  });
  ["order_date", "delivery_date"].forEach((key) => {
    if (data[key] !== undefined) payload[key] = emptyToNull(data[key]);
  });

  if (data.qty_actual === undefined && data.quantity !== undefined) {
    payload.qty_actual = numberOrNull(data.quantity);
  }
  if (data.quantity === undefined && data.qty_actual !== undefined) {
    payload.quantity = numberOrNull(data.qty_actual);
  }

  return payload;
}

function toIssueDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "issue_id",
    "project_id",
    "title",
    "priority",
    "status",
    "owner",
  ]);

  if (data.due_date !== undefined) payload.due_date = emptyToNull(data.due_date);
  return payload;
}

function toDailyReportDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "report_id",
    "project_id",
    "weather",
    "workers",
    "work_done",
    "issues",
    "photos_folder_id",
    "document_no",
    "project_name",
    "project_location",
    "project_owner",
    "solutions",
    "prepared_by_name",
    "prepared_by_position",
    "prepared_by_email",
    "pdf_folder_id",
    "pdf_file_id",
    "pdf_url",
    "photos_month_folder_id",
    "line_group_id",
    "line_status",
    "line_error",
  ]);

  if (data.date !== undefined) payload.report_date = emptyToNull(data.date);
  if (data.project_start_date !== undefined) payload.project_start_date = emptyToNull(data.project_start_date);
  if (data.project_end_date !== undefined) payload.project_end_date = emptyToNull(data.project_end_date);
  if (data.prepared_at !== undefined) payload.prepared_at = emptyToNull(data.prepared_at);
  if (data.line_sent_at !== undefined) payload.line_sent_at = emptyToNull(data.line_sent_at);
  if (data.personnel_json !== undefined) payload.personnel = jsonOrEmptyArray(data.personnel_json);
  if (data.machinery_json !== undefined) payload.machinery = jsonOrEmptyArray(data.machinery_json);
  if (data.materials_json !== undefined) payload.materials = jsonOrEmptyArray(data.materials_json);
  if (data.photos_json !== undefined) payload.photos = jsonOrEmptyArray(data.photos_json);

  return payload;
}

function toWeeklyReportDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "report_id",
    "project_id",
    "document_no",
    "project_name",
    "project_location",
    "project_owner",
    "field_engineer_name",
    "field_engineer_email",
    "field_engineer_position",
    "project_manager_name",
    "pdf_folder_id",
    "pdf_file_id",
    "pdf_url",
  ]);

  if (data.week_start !== undefined) payload.week_start = emptyToNull(data.week_start);
  if (data.week_end !== undefined) payload.week_end = emptyToNull(data.week_end);
  if (data.project_start_date !== undefined) payload.project_start_date = emptyToNull(data.project_start_date);
  if (data.project_end_date !== undefined) payload.project_end_date = emptyToNull(data.project_end_date);
  if (data.prepared_at !== undefined) payload.prepared_at = emptyToNull(data.prepared_at);
  if (data.work_quantities_json !== undefined) payload.work_quantities = jsonOrEmptyArray(data.work_quantities_json);
  if (data.materials_json !== undefined) payload.materials = jsonOrEmptyArray(data.materials_json);
  if (data.machinery_json !== undefined) payload.machinery = jsonOrEmptyArray(data.machinery_json);
  if (data.personnel_json !== undefined) payload.personnel = jsonOrEmptyArray(data.personnel_json);
  if (data.progress_json !== undefined) payload.progress = jsonOrEmptyArray(data.progress_json);
  if (data.instructions_json !== undefined) payload.instructions = jsonOrEmptyArray(data.instructions_json);
  if (data.approvals_json !== undefined) payload.approvals = jsonOrEmptyArray(data.approvals_json);

  return payload;
}

function toMonthlyReportDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "report_id",
    "project_id",
    "month",
    "document_no",
    "project_name",
    "project_location",
    "project_owner",
    "preface",
    "meeting_summary",
    "next_month_plan_note",
    "field_engineer_name",
    "field_engineer_email",
    "field_engineer_position",
    "project_manager_name",
    "pdf_folder_id",
    "pdf_file_id",
    "pdf_url",
  ]);

  if (data.month_start !== undefined) payload.month_start = emptyToNull(data.month_start);
  if (data.month_end !== undefined) payload.month_end = emptyToNull(data.month_end);
  if (data.project_start_date !== undefined) payload.project_start_date = emptyToNull(data.project_start_date);
  if (data.project_end_date !== undefined) payload.project_end_date = emptyToNull(data.project_end_date);
  if (data.prepared_at !== undefined) payload.prepared_at = emptyToNull(data.prepared_at);
  if (data.weekly_reports_json !== undefined) payload.weekly_reports = jsonOrEmptyArray(data.weekly_reports_json);
  if (data.daily_summary_json !== undefined) payload.daily_summary = jsonOrEmptyArray(data.daily_summary_json);
  if (data.progress_json !== undefined) payload.progress = jsonOrEmptyArray(data.progress_json);
  if (data.next_month_plan_json !== undefined) payload.next_month_plan = jsonOrEmptyArray(data.next_month_plan_json);
  if (data.photos_json !== undefined) payload.photos = jsonOrEmptyArray(data.photos_json);
  if (data.weather_json !== undefined) payload.weather = jsonOrEmptyArray(data.weather_json);
  if (data.personnel_json !== undefined) payload.personnel = jsonOrEmptyArray(data.personnel_json);
  if (data.machinery_json !== undefined) payload.machinery = jsonOrEmptyArray(data.machinery_json);
  if (data.materials_json !== undefined) payload.materials = jsonOrEmptyArray(data.materials_json);
  if (data.issues_json !== undefined) payload.issues = jsonOrEmptyArray(data.issues_json);
  if (data.approvals_json !== undefined) payload.approvals = jsonOrEmptyArray(data.approvals_json);
  if (data.certifications_json !== undefined) payload.certifications = jsonOrEmptyArray(data.certifications_json);
  if (data.inspections_json !== undefined) payload.inspections = jsonOrEmptyArray(data.inspections_json);

  return payload;
}

function toSiteNoteDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "note_id",
    "project_id",
    "title",
    "body",
    "category",
    "priority",
    "linked_module",
    "linked_ref",
    "created_by_name",
    "created_by_email",
    "updated_by_name",
    "updated_by_email",
  ]);

  if (data.pinned !== undefined) payload.pinned = boolOrNull(data.pinned);
  if (data.archived !== undefined) payload.archived = boolOrNull(data.archived);
  if (data.follow_up_date !== undefined) payload.follow_up_date = emptyToNull(data.follow_up_date);
  if (data.attachments_json !== undefined) payload.attachments = jsonOrEmptyArray(data.attachments_json);

  return payload;
}

function toSiteMemoDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "memo_id",
    "project_id",
    "document_no",
    "memo_type",
    "related_module",
    "related_ref",
    "title",
    "detail",
    "extension_reason",
    "status",
    "customer_name",
    "prepared_by_name",
    "prepared_by_email",
    "prepared_by_role",
    "pdf_file_id",
    "pdf_url",
    "acknowledgement_url",
    "line_group_id",
    "line_message",
    "acknowledged_by",
    "acknowledged_channel",
    "acknowledgement_note",
  ]);

  ["event_date", "issue_date", "acknowledged_date"].forEach((key) => {
    if (data[key] !== undefined) payload[key] = emptyToNull(data[key]);
  });
  ["issued_at", "sent_to_customer_at"].forEach((key) => {
    if (data[key] !== undefined) payload[key] = emptyToNull(data[key]);
  });
  if (data.requires_customer_ack !== undefined) payload.requires_customer_ack = boolOrNull(data.requires_customer_ack);
  if (data.has_time_impact !== undefined) payload.has_time_impact = boolOrNull(data.has_time_impact);
  if (data.extension_days !== undefined) payload.extension_days = numberOrNull(data.extension_days);
  if (data.attachments_json !== undefined) payload.attachments = jsonOrEmptyArray(data.attachments_json);
  if (data.acknowledgement_token !== undefined) payload.acknowledgement_token = emptyToNull(data.acknowledgement_token);

  return payload;
}

function toSiteMemoEvidenceDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "evidence_id",
    "memo_id",
    "project_id",
    "channel",
    "acknowledged_by",
    "file_name",
    "file_id",
    "file_url",
    "mime_type",
    "notes",
    "uploaded_by_name",
    "uploaded_by_email",
  ]);

  if (data.acknowledged_date !== undefined) payload.acknowledged_date = emptyToNull(data.acknowledged_date);
  return payload;
}

function toProjectDocumentDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "document_id",
    "project_id",
    "category",
    "title",
    "version_number",
    "file_name",
    "mime_type",
    "drive_file_id",
    "drive_url",
    "notes",
    "uploaded_by_email",
    "uploaded_by_name",
  ]);

  if (data.file_size !== undefined) payload.file_size = numberOrNull(data.file_size);
  return payload;
}

function toProjectLifecycleDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "lifecycle_id",
    "project_id",
    "current_status",
    "notes",
  ]);

  [
    "design_start_date",
    "design_done_date",
    "contract_signed_date",
    "drawing_start_date",
    "drawing_done_date",
    "permit_submitted_date",
    "permit_received_date",
    "permit_expiry_date",
    "temporary_electric_install_date",
    "temporary_electric_expiry_date",
    "temporary_water_install_date",
    "temporary_water_expiry_date",
    "demolition_waiting_date",
    "demolition_done_date",
    "construction_start_date",
    "construction_end_date",
  ].forEach((key) => {
    if (data[key] !== undefined) payload[key] = emptyToNull(data[key]);
  });

  return payload;
}

function toProjectWarrantyDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "warranty_id",
    "project_id",
    "structure_notes",
    "roof_notes",
    "architecture_notes",
  ]);

  [
    "handover_date",
    "structure_retention_date",
    "structure_expiry_date",
    "roof_retention_date",
    "roof_expiry_date",
    "architecture_retention_date",
    "architecture_expiry_date",
  ].forEach((key) => {
    if (data[key] !== undefined) payload[key] = emptyToNull(data[key]);
  });

  return payload;
}

function toDefectRoundDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "round_id",
    "project_id",
    "document_no",
    "revision_no",
    "title",
    "inspector_name",
    "inspector_email",
    "client_name",
    "project_name",
    "project_location",
    "status",
    "acknowledged_by",
    "acknowledged_channel",
    "acknowledgement_note",
    "pdf_file_id",
    "pdf_url",
    "issued_by_name",
    "issued_by_email",
    "notes",
    "approval_url",
    "line_group_id",
    "line_message",
  ]);

  ["inspection_date", "acknowledged_date"].forEach((key) => {
    if (data[key] !== undefined) payload[key] = emptyToNull(data[key]);
  });
  ["issued_at", "locked_at", "sent_to_customer_at"].forEach((key) => {
    if (data[key] !== undefined) payload[key] = emptyToNull(data[key]);
  });
  ["item_count", "open_count", "extension_days"].forEach((key) => {
    if (data[key] !== undefined) payload[key] = numberOrNull(data[key]);
  });
  if (data.snapshot_json !== undefined) payload.snapshot = jsonOrNull(data.snapshot_json);
  if (data.approval_token !== undefined) payload.approval_token = emptyToNull(data.approval_token);

  return payload;
}

function toDefectItemDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "item_id",
    "round_id",
    "project_id",
    "item_no",
    "zone",
    "discipline",
    "work_category",
    "description",
    "cause",
    "status",
    "owner",
    "remarks",
    "repair_note",
    "created_by_name",
    "created_by_email",
  ]);

  ["reported_date", "due_date"].forEach((key) => {
    if (data[key] !== undefined) payload[key] = emptyToNull(data[key]);
  });
  if (data.before_photos_json !== undefined) payload.before_photos = jsonOrEmptyArray(data.before_photos_json);
  if (data.after_photos_json !== undefined) payload.after_photos = jsonOrEmptyArray(data.after_photos_json);

  return payload;
}

function toDefectEvidenceDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "evidence_id",
    "round_id",
    "project_id",
    "evidence_type",
    "channel",
    "acknowledged_by",
    "file_name",
    "file_id",
    "file_url",
    "mime_type",
    "notes",
    "uploaded_by_name",
    "uploaded_by_email",
  ]);

  if (data.acknowledged_date !== undefined) payload.acknowledged_date = emptyToNull(data.acknowledged_date);
  return payload;
}

function toQcChecklistDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "qc_id",
    "project_id",
    "template_id",
    "document_no",
    "category",
    "phase",
    "title",
    "status",
    "approval_status",
    "inspected_by_name",
    "inspected_by_email",
    "customer_approved_by",
    "customer_approval_note",
    "pdf_file_id",
    "pdf_url",
    "line_group_id",
    "line_message",
    "issued_by_name",
    "issued_by_email",
    "notes",
    "approval_url",
  ]);

  if (data.inspection_date !== undefined) payload.inspection_date = emptyToNull(data.inspection_date);
  ["customer_approved_at", "sent_to_customer_at", "issued_at"].forEach((key) => {
    if (data[key] !== undefined) payload[key] = emptyToNull(data[key]);
  });
  if (data.items_json !== undefined) payload.items = jsonOrEmptyArray(data.items_json);
  if (data.evidence_files_json !== undefined) payload.evidence_files = jsonOrEmptyArray(data.evidence_files_json);
  if (data.active !== undefined) payload.active = boolOrNull(data.active);
  if (data.approval_token !== undefined) payload.approval_token = emptyToNull(data.approval_token);

  return payload;
}

function toCustomerDecisionDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "decision_id",
    "project_id",
    "phase",
    "title",
    "decision_status",
    "impact_if_changed",
    "result_note",
    "evidence_note",
    "notified_by_name",
    "notified_by_email",
    "line_group_id",
    "line_message",
    "decided_by",
    "document_no",
    "pdf_file_id",
    "pdf_url",
    "issued_by_name",
    "issued_by_email",
    "approval_url",
  ]);

  if (data.decision_before !== undefined) payload.decision_before = emptyToNull(data.decision_before);
  ["notified_at", "decided_at", "issued_at"].forEach((key) => {
    if (data[key] !== undefined) payload[key] = emptyToNull(data[key]);
  });
  if (data.order_index !== undefined) payload.order_index = numberOrNull(data.order_index);
  if (data.active !== undefined) payload.active = boolOrNull(data.active);
  if (data.evidence_files_json !== undefined) payload.evidence_files = jsonOrEmptyArray(data.evidence_files_json);
  if (data.approval_token !== undefined) payload.approval_token = emptyToNull(data.approval_token);

  return payload;
}

function toVariationOrderDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "vo_id",
    "project_id",
    "revision_no",
    "original_vo_id",
    "vo_type",
    "title",
    "description",
    "source_type",
    "source_ref_id",
    "source_description",
    "approval_url",
    "customer_approved_by",
    "customer_approval_note",
    "line_group_id",
    "line_message",
    "created_by_name",
    "created_by_email",
    "created_by_role",
    "status",
    "client_name",
    "task_plan_status",
    "invoice_no",
    "payment_status",
    "notes",
  ]);

  [
    "approval_deadline",
    "invoice_date",
    "due_date",
  ].forEach((key) => {
    if (data[key] !== undefined) payload[key] = emptyToNull(data[key]);
  });
  [
    "customer_approved_at",
    "sent_to_customer_at",
  ].forEach((key) => {
    if (data[key] !== undefined) payload[key] = emptyToNull(data[key]);
  });
  [
    "subtotal",
    "vat_rate",
    "withholding_tax",
    "vat_amount",
    "wht_amount",
    "grand_total",
    "net_payable",
    "contract_before",
    "contract_after",
    "amount_due",
    "amount_paid",
    "balance",
  ].forEach((key) => {
    if (data[key] !== undefined) payload[key] = numberOrNull(data[key]);
  });
  if (data.vat_exempt !== undefined) payload.vat_exempt = boolOrNull(data.vat_exempt);
  if (data.extension_days !== undefined) payload.extension_days = numberOrNull(data.extension_days);
  if (data.approval_token !== undefined) payload.approval_token = emptyToNull(data.approval_token);
  if (data.supporting_docs !== undefined) payload.supporting_docs = jsonOrValue(data.supporting_docs, []);
  if (data.linked_tasks_json !== undefined) payload.linked_tasks = jsonOrEmptyArray(data.linked_tasks_json);
  if (data.evidence_json !== undefined) payload.evidence = jsonOrValue(data.evidence_json, []);
  if (data.rejection_json !== undefined) payload.rejection = jsonOrNull(data.rejection_json);
  if (data.revision_history_json !== undefined) payload.revision_history = jsonOrEmptyArray(data.revision_history_json);
  if (data.document_refs_json !== undefined) payload.document_refs = jsonOrEmptyArray(data.document_refs_json);

  return payload;
}

function toVoItemDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "item_id",
    "vo_id",
    "project_id",
    "item_no",
    "description",
    "unit",
  ]);

  ["quantity", "unit_price", "amount"].forEach((key) => {
    if (data[key] !== undefined) payload[key] = numberOrNull(data[key]);
  });
  return payload;
}

function toVoPaymentDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "payment_id",
    "vo_id",
    "project_id",
    "invoice_no",
    "receipt_no",
    "payment_method",
    "payment_ref",
    "evidence_file",
    "recorded_by_name",
    "recorded_by_email",
  ]);

  if (data.paid_date !== undefined) payload.paid_date = emptyToNull(data.paid_date);
  if (data.amount_paid !== undefined) payload.amount_paid = numberOrNull(data.amount_paid);
  return payload;
}

function toVoDocumentDb(data: Record<string, SheetValue>) {
  return pick(data, [
    "document_id",
    "vo_id",
    "project_id",
    "document_type",
    "document_no",
    "title",
    "html_snapshot",
    "pdf_file_id",
    "pdf_url",
    "created_by_name",
    "created_by_email",
  ]);
}

function toVoTaskLinkDb(data: Record<string, SheetValue>) {
  return pick(data, [
    "link_id",
    "vo_id",
    "project_id",
    "task_id",
    "link_type",
    "plan_status",
    "task_note",
    "created_by_name",
    "created_by_email",
  ]);
}

function toVoFinanceLedgerDb(data: Record<string, SheetValue>) {
  const payload = pick(data, [
    "ledger_id",
    "vo_id",
    "project_id",
    "entry_type",
    "ref_no",
    "summary",
    "created_by_name",
    "created_by_email",
  ]);

  if (data.entry_date !== undefined) payload.entry_date = emptyToNull(data.entry_date);
  ["debit", "credit", "balance"].forEach((key) => {
    if (data[key] !== undefined) payload[key] = numberOrNull(data[key]);
  });
  return payload;
}

const MASTER_TABLES: Partial<Record<MasterTable, TableConfig>> = {
  Projects: {
    table: "projects",
    keyColumn: "project_id",
    toDb: toProjectDb,
    fromDb: getSupabaseProjects,
  },
  Team: {
    table: "team_members",
    keyColumn: "member_id",
    toDb: toTeamDb,
    fromDb: getSupabaseTeamMembers,
  },
  UserSites: {
    table: "user_project_access",
    keyColumn: "access_id",
    toDb: toUserProjectAccessDb,
    fromDb: getSupabaseUserProjectAccess,
  },
  Customers: {
    table: "customers",
    keyColumn: "id",
    toDb: toCustomerDb,
    fromDb: getSupabaseCustomers,
  },
  Notifications: {
    table: "notifications",
    keyColumn: "notification_id",
    toDb: toNotificationDb,
    fromDb: getSupabaseNotifications,
    includeUpdatedAt: false,
  },
  AuditLogs: {
    table: "audit_logs",
    keyColumn: "log_id",
    toDb: toAuditLogDb,
    fromDb: getSupabaseAuditLogs,
    includeCreatedAt: false,
    includeUpdatedAt: false,
  },
};

const SITE_TABLES: Partial<Record<SiteTable, TableConfig>> = {
  Tasks: {
    table: "tasks",
    keyColumn: "task_id",
    toDb: toTaskDb,
    fromDb: (projectId) => getSupabaseTasks(projectId),
  },
  Milestones: {
    table: "milestones",
    keyColumn: "milestone_id",
    toDb: toMilestoneDb,
    fromDb: (projectId) => getSupabaseMilestones(projectId),
  },
  Budget: {
    table: "budget",
    keyColumn: "budget_id",
    toDb: toBudgetDb,
    fromDb: (projectId) => getSupabaseBudget(projectId),
  },
  Materials: {
    table: "materials",
    keyColumn: "material_id",
    toDb: toMaterialDb,
    fromDb: (projectId) => getSupabaseMaterials(projectId),
  },
  Issues: {
    table: "issues",
    keyColumn: "issue_id",
    toDb: toIssueDb,
    fromDb: (projectId) => getSupabaseIssues(projectId),
  },
  Daily_Reports: {
    table: "daily_reports",
    keyColumn: "report_id",
    toDb: toDailyReportDb,
    fromDb: (projectId) => getSupabaseDailyReports(projectId),
  },
  Weekly_Reports: {
    table: "weekly_reports",
    keyColumn: "report_id",
    toDb: toWeeklyReportDb,
    fromDb: (projectId) => getSupabaseWeeklyReports(projectId),
  },
  Monthly_Reports: {
    table: "monthly_reports",
    keyColumn: "report_id",
    toDb: toMonthlyReportDb,
    fromDb: (projectId) => getSupabaseMonthlyReports(projectId),
  },
  Project_Documents: {
    table: "project_documents",
    keyColumn: "document_id",
    toDb: toProjectDocumentDb,
    fromDb: (projectId) => getSupabaseProjectDocuments(projectId),
  },
  Project_Lifecycle: {
    table: "project_lifecycle",
    keyColumn: "lifecycle_id",
    toDb: toProjectLifecycleDb,
    fromDb: (projectId) => getSupabaseProjectLifecycle(projectId),
  },
  Project_Warranty: {
    table: "project_warranty",
    keyColumn: "warranty_id",
    toDb: toProjectWarrantyDb,
    fromDb: (projectId) => getSupabaseProjectWarranty(projectId),
  },
  Customer_Decisions: {
    table: "customer_decisions",
    keyColumn: "decision_id",
    toDb: toCustomerDecisionDb,
    fromDb: (projectId) => getSupabaseCustomerDecisions(projectId),
  },
  Defect_Rounds: {
    table: "defect_rounds",
    keyColumn: "round_id",
    toDb: toDefectRoundDb,
    fromDb: (projectId) => getSupabaseDefectRounds(projectId),
  },
  Defect_Items: {
    table: "defect_items",
    keyColumn: "item_id",
    toDb: toDefectItemDb,
    fromDb: (projectId) => getSupabaseDefectItems(projectId),
  },
  Defect_Evidence: {
    table: "defect_evidence",
    keyColumn: "evidence_id",
    toDb: toDefectEvidenceDb,
    fromDb: (projectId) => getSupabaseDefectEvidence(projectId),
  },
  QC_Checklists: {
    table: "qc_checklists",
    keyColumn: "qc_id",
    toDb: toQcChecklistDb,
    fromDb: (projectId) => getSupabaseQcChecklists(projectId),
  },
  Site_Memos: {
    table: "site_memos",
    keyColumn: "memo_id",
    toDb: toSiteMemoDb,
    fromDb: (projectId) => getSupabaseSiteMemos(projectId),
  },
  Site_Memo_Evidence: {
    table: "site_memo_evidence",
    keyColumn: "evidence_id",
    toDb: toSiteMemoEvidenceDb,
    fromDb: (projectId) => getSupabaseSiteMemoEvidence(projectId),
  },
  Variation_Orders: {
    table: "variation_orders",
    keyColumn: "vo_id",
    toDb: toVariationOrderDb,
    fromDb: (projectId) => getSupabaseVariationOrders(projectId),
  },
  VO_Items: {
    table: "vo_items",
    keyColumn: "item_id",
    toDb: toVoItemDb,
    fromDb: (projectId) => getSupabaseVoItems(projectId),
  },
  VO_Documents: {
    table: "vo_documents",
    keyColumn: "document_id",
    toDb: toVoDocumentDb,
    fromDb: (projectId) => getSupabaseVoDocuments(projectId),
  },
  VO_Payments: {
    table: "vo_payments",
    keyColumn: "payment_id",
    toDb: toVoPaymentDb,
    fromDb: (projectId) => getSupabaseVoPayments(projectId),
  },
  VO_Task_Links: {
    table: "vo_task_links",
    keyColumn: "link_id",
    toDb: toVoTaskLinkDb,
    fromDb: (projectId) => getSupabaseVoTaskLinks(projectId),
  },
  VO_Finance_Ledger: {
    table: "vo_finance_ledger",
    keyColumn: "ledger_id",
    toDb: toVoFinanceLedgerDb,
    fromDb: (projectId) => getSupabaseVoFinanceLedger(projectId),
  },
  Site_Notes: {
    table: "site_notes",
    keyColumn: "note_id",
    toDb: toSiteNoteDb,
    fromDb: (projectId) => getSupabaseSiteNotes(projectId),
  },
};

function getKeyValue(config: TableConfig, data: Record<string, SheetValue>, rowKey?: string | number) {
  return text(rowKey || data[config.keyColumn]);
}

function withTimestamps(config: TableConfig, payload: Record<string, unknown>, operation: "insert" | "update") {
  const now = new Date().toISOString();
  const next = { ...payload };
  if (operation === "insert" && config.includeCreatedAt !== false && next.created_at === undefined) {
    next.created_at = now;
  }
  if (config.includeUpdatedAt !== false) {
    next.updated_at = now;
  }
  return next;
}

function isMasterConfig(config: TableConfig) {
  return Object.values(MASTER_TABLES).includes(config);
}

async function getSchemaForConfig(config: TableConfig, projectId?: string | null) {
  if (isMasterConfig(config)) return getSupabaseMasterSchema();
  return await getSupabaseSiteSchema(projectId);
}

export function getSupabaseMasterConfig(tableName: string) {
  return MASTER_TABLES[tableName as MasterTable] || null;
}

export function getSupabaseSiteConfig(tableName: string) {
  return SITE_TABLES[tableName as SiteTable] || null;
}

export async function findAllSupabase(config: TableConfig, projectId?: string | null) {
  return await config.fromDb(projectId) as SheetRow[];
}

export async function insertSupabase(
  config: TableConfig,
  data: Record<string, SheetValue>,
  projectId?: string | null
): Promise<CrudResult> {
  const resolvedProjectId = text(projectId || data.project_id);
  const schema = await getSchemaForConfig(config, resolvedProjectId);
  const rows = await supabaseInsert<unknown>(config.table, withTimestamps(config, config.toDb(data), "insert"), { schema });
  const keyValue = getKeyValue(config, data);
  const inserted = (await config.fromDb(resolvedProjectId)).find((row) => text(row[config.keyColumn]) === keyValue) || rows[0] as SheetLikeRecord | undefined;
  return { success: true, inserted };
}

export async function updateSupabase(
  config: TableConfig,
  rowKey: string | number,
  patch: Record<string, SheetValue>,
  projectId?: string | null
): Promise<CrudResult> {
  const keyValue = getKeyValue(config, patch, rowKey);
  if (!keyValue) throw new Error(`Missing ${config.keyColumn} for Supabase update`);
  const schema = await getSchemaForConfig(config, text(projectId || patch.project_id));
  await supabasePatch<unknown>(config.table, config.keyColumn, keyValue, withTimestamps(config, config.toDb(patch), "update"), { schema });
  return { success: true };
}

export async function deleteSupabase(
  config: TableConfig,
  rowKey: string | number,
  projectId?: string | null
): Promise<CrudResult> {
  const keyValue = text(rowKey);
  if (!keyValue) throw new Error(`Missing ${config.keyColumn} for Supabase delete`);
  const schema = await getSchemaForConfig(config, projectId);
  await supabaseDelete<unknown>(config.table, config.keyColumn, keyValue, { schema });
  return { success: true };
}
