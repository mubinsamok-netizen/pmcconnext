import { supabaseSelect } from "@/lib/supabaseRest";

export type SheetLikeRecord = Record<string, string | number | undefined>;

type SupabaseProject = {
  project_id: string;
  name: string;
  client: string | null;
  project_type: string | null;
  description: string | null;
  address: string | null;
  province: string | null;
  district: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  budget: number | string | null;
  contract_no: string | null;
  site_link: string | null;
  pm_name: string | null;
  se_name: string | null;
  cover_file_id: string | null;
  cover_url: string | null;
  site_sheet_id: string | null;
  drive_folder_id: string | null;
  sales_customer_id: string | null;
  sales_stage: string | null;
  deposit_status: string | null;
  line_group_id: string | null;
  line_group_name: string | null;
  line_notify_enabled: boolean | null;
  active: boolean | null;
};

type SupabaseTeamMember = {
  member_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  project_ids: string | string[] | null;
  active: boolean | null;
  google_sub: string | null;
  avatar_url: string | null;
  auth_provider: string | null;
  last_login_at: string | null;
  password_hash?: string | null;
};

type SupabaseUserProjectAccess = {
  access_id: number | string;
  email: string | null;
  google_sub: string | null;
  project_id: string;
  role: string | null;
  active: boolean | null;
};

type SupabaseNotification = {
  notification_id: string;
  project_id: string | null;
  target_email: string | null;
  target_role: string | null;
  target_google_sub: string | null;
  type: string | null;
  title: string | null;
  message: string | null;
  link: string | null;
  is_read: boolean | null;
  read_at: string | null;
  created_by_email: string | null;
  created_by_name: string | null;
  created_at: string | null;
};

type SupabaseAuditLog = {
  log_id: string;
  timestamp: string | null;
  actor_email: string | null;
  actor_name: string | null;
  actor_role: string | null;
  actor_google_sub: string | null;
  project_id: string | null;
  module: string;
  action: string;
  target_id: string | null;
  summary: string | null;
  before_json: unknown;
  after_json: unknown;
};

type SupabaseTask = {
  task_id: string;
  project_id: string;
  name: string;
  assignee: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  percent_done: number | string | null;
  category: string | null;
  duration_days: number | string | null;
  priority: string | null;
  notes: string | null;
  order_index: number | string | null;
  task_type: string | null;
  parent_task_id: string | null;
  planned_start: string | null;
  planned_end: string | null;
  linked_vo_id: string | null;
  vo_badge: string | null;
  payment_note: string | null;
  gantt_locked: boolean | null;
  unlock_date: string | null;
  unlock_reason: string | null;
};

type SupabaseMilestone = {
  milestone_id: string;
  project_id: string;
  title: string;
  date: string | null;
  type: string | null;
  color: string | null;
  notes: string | null;
};

type SupabaseDailyReport = {
  report_id: string;
  project_id: string;
  report_date: string | null;
  weather: string | null;
  workers: string | null;
  work_done: string | null;
  issues: string | null;
  photos_folder_id: string | null;
  document_no: string | null;
  project_name: string | null;
  project_location: string | null;
  project_start_date: string | null;
  project_end_date: string | null;
  project_owner: string | null;
  personnel: unknown;
  machinery: unknown;
  materials: unknown;
  solutions: string | null;
  prepared_by_name: string | null;
  prepared_by_position: string | null;
  prepared_by_email: string | null;
  prepared_at: string | null;
  photos: unknown;
  pdf_folder_id: string | null;
  pdf_file_id: string | null;
  pdf_url: string | null;
  photos_month_folder_id: string | null;
  line_group_id: string | null;
  line_status: string | null;
  line_sent_at: string | null;
  line_error: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseWeeklyReport = {
  report_id: string;
  project_id: string;
  week_start: string | null;
  week_end: string | null;
  document_no: string | null;
  project_name: string | null;
  project_location: string | null;
  project_start_date: string | null;
  project_end_date: string | null;
  project_owner: string | null;
  work_quantities: unknown;
  materials: unknown;
  machinery: unknown;
  personnel: unknown;
  progress: unknown;
  instructions: unknown;
  approvals: unknown;
  field_engineer_name: string | null;
  field_engineer_email: string | null;
  field_engineer_position: string | null;
  project_manager_name: string | null;
  prepared_at: string | null;
  pdf_folder_id: string | null;
  pdf_file_id: string | null;
  pdf_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseMonthlyReport = {
  report_id: string;
  project_id: string;
  month: string | null;
  month_start: string | null;
  month_end: string | null;
  document_no: string | null;
  project_name: string | null;
  project_location: string | null;
  project_start_date: string | null;
  project_end_date: string | null;
  project_owner: string | null;
  preface: string | null;
  meeting_summary: string | null;
  next_month_plan_note: string | null;
  weekly_reports: unknown;
  daily_summary: unknown;
  progress: unknown;
  next_month_plan: unknown;
  photos: unknown;
  weather: unknown;
  personnel: unknown;
  machinery: unknown;
  materials: unknown;
  issues: unknown;
  approvals: unknown;
  certifications: unknown;
  inspections: unknown;
  field_engineer_name: string | null;
  field_engineer_email: string | null;
  field_engineer_position: string | null;
  project_manager_name: string | null;
  prepared_at: string | null;
  pdf_folder_id: string | null;
  pdf_file_id: string | null;
  pdf_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseSiteNote = {
  note_id: string;
  project_id: string;
  title: string;
  body: string | null;
  category: string | null;
  priority: string | null;
  pinned: boolean | null;
  archived: boolean | null;
  follow_up_date: string | null;
  linked_module: string | null;
  linked_ref: string | null;
  attachments: unknown;
  created_by_name: string | null;
  created_by_email: string | null;
  updated_by_name: string | null;
  updated_by_email: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseSiteMemo = {
  memo_id: string;
  project_id: string;
  document_no: string | null;
  memo_type: string | null;
  related_module: string | null;
  related_ref: string | null;
  title: string | null;
  event_date: string | null;
  issue_date: string | null;
  detail: string | null;
  requires_customer_ack: boolean | null;
  has_time_impact: boolean | null;
  extension_days: number | string | null;
  extension_reason: string | null;
  status: string | null;
  customer_name: string | null;
  prepared_by_name: string | null;
  prepared_by_email: string | null;
  prepared_by_role: string | null;
  attachments: unknown;
  pdf_file_id: string | null;
  pdf_url: string | null;
  issued_at: string | null;
  acknowledgement_token: string | null;
  acknowledgement_url: string | null;
  sent_to_customer_at: string | null;
  line_group_id: string | null;
  line_message: string | null;
  acknowledged_by: string | null;
  acknowledged_channel: string | null;
  acknowledged_date: string | null;
  acknowledgement_note: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseSiteMemoEvidence = {
  evidence_id: string;
  memo_id: string;
  project_id: string;
  channel: string | null;
  acknowledged_by: string | null;
  acknowledged_date: string | null;
  file_name: string | null;
  file_id: string | null;
  file_url: string | null;
  mime_type: string | null;
  notes: string | null;
  uploaded_by_name: string | null;
  uploaded_by_email: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseVariationOrder = {
  vo_id: string;
  project_id: string;
  revision_no: string | null;
  original_vo_id: string | null;
  vo_type: string | null;
  title: string | null;
  description: string | null;
  source_type: string | null;
  source_ref_id: string | null;
  source_description: string | null;
  subtotal: number | string | null;
  vat_rate: number | string | null;
  vat_exempt: boolean | null;
  withholding_tax: number | string | null;
  vat_amount: number | string | null;
  wht_amount: number | string | null;
  grand_total: number | string | null;
  net_payable: number | string | null;
  contract_before: number | string | null;
  contract_after: number | string | null;
  approval_deadline: string | null;
  approval_token: string | null;
  approval_url: string | null;
  customer_approved_at: string | null;
  customer_approved_by: string | null;
  customer_approval_note: string | null;
  sent_to_customer_at: string | null;
  line_group_id: string | null;
  line_message: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  created_by_role: string | null;
  status: string | null;
  client_name: string | null;
  supporting_docs: unknown;
  linked_tasks: unknown;
  evidence: unknown;
  rejection: unknown;
  revision_history: unknown;
  task_plan_status: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount_due: number | string | null;
  amount_paid: number | string | null;
  balance: number | string | null;
  payment_status: string | null;
  document_refs: unknown;
  notes: string | null;
  extension_days: number | string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseProjectDocument = {
  document_id: string;
  project_id: string;
  category: string | null;
  title: string | null;
  version_number: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | string | null;
  drive_file_id: string | null;
  drive_url: string | null;
  notes: string | null;
  uploaded_by_email: string | null;
  uploaded_by_name: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseProjectLifecycle = {
  lifecycle_id: string;
  project_id: string;
  current_status: string | null;
  design_start_date: string | null;
  design_done_date: string | null;
  contract_signed_date: string | null;
  drawing_start_date: string | null;
  drawing_done_date: string | null;
  permit_submitted_date: string | null;
  permit_received_date: string | null;
  permit_expiry_date: string | null;
  temporary_electric_install_date: string | null;
  temporary_electric_expiry_date: string | null;
  temporary_water_install_date: string | null;
  temporary_water_expiry_date: string | null;
  demolition_waiting_date: string | null;
  demolition_done_date: string | null;
  construction_start_date: string | null;
  construction_end_date: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseProjectWarranty = {
  warranty_id: string;
  project_id: string;
  handover_date: string | null;
  structure_retention_date: string | null;
  structure_expiry_date: string | null;
  structure_notes: string | null;
  roof_retention_date: string | null;
  roof_expiry_date: string | null;
  roof_notes: string | null;
  architecture_retention_date: string | null;
  architecture_expiry_date: string | null;
  architecture_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseRow = Record<string, unknown>;

type SheetRowOptions = {
  dateFields?: string[];
  timestampFields?: string[];
  jsonFields?: string[];
  nullableJsonFields?: string[];
  boolFields?: string[];
  columnMap?: Record<string, string>;
};

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function dateText(value: unknown) {
  return text(value).slice(0, 10);
}

function timestampText(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function boolText(value: unknown) {
  if (value === true) return "TRUE";
  if (value === false) return "FALSE";
  return "";
}

function listText(value: unknown) {
  return Array.isArray(value) ? value.map(text).filter(Boolean).join(",") : text(value);
}

function jsonText(value: unknown) {
  if (value === null || value === undefined) return "[]";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function nullableJsonText(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function sheetRowFromSupabase(
  row: SupabaseRow,
  keyColumn: string,
  fields: string[],
  {
    dateFields = [],
    timestampFields = [],
    jsonFields = [],
    nullableJsonFields = [],
    boolFields = [],
    columnMap = {},
  }: SheetRowOptions = {}
) {
  const output: SheetLikeRecord = {
    _rowIndex: text(row[keyColumn]),
  };

  fields.forEach((field) => {
    const value = row[columnMap[field] || field];
    if (dateFields.includes(field)) output[field] = dateText(value);
    else if (timestampFields.includes(field)) output[field] = timestampText(value);
    else if (jsonFields.includes(field)) output[field] = jsonText(value);
    else if (nullableJsonFields.includes(field)) output[field] = nullableJsonText(value);
    else if (boolFields.includes(field)) output[field] = boolText(value);
    else output[field] = text(value);
  });

  return output;
}

export async function getSupabaseProjects() {
  const rows = await supabaseSelect<SupabaseProject>("projects", {
    order: "project_id.asc",
  });

  return rows.map((row): SheetLikeRecord => ({
    _rowIndex: row.project_id,
    project_id: row.project_id,
    name: row.name,
    client: text(row.client),
    project_type: text(row.project_type),
    description: text(row.description),
    address: text(row.address),
    province: text(row.province),
    district: text(row.district),
    status: text(row.status),
    start_date: dateText(row.start_date),
    end_date: dateText(row.end_date),
    budget: text(row.budget),
    contract_no: text(row.contract_no),
    site_link: text(row.site_link),
    pm_name: text(row.pm_name),
    se_name: text(row.se_name),
    cover_file_id: text(row.cover_file_id),
    cover_url: text(row.cover_url),
    site_sheet_id: text(row.site_sheet_id),
    drive_folder_id: text(row.drive_folder_id),
    sales_customer_id: text(row.sales_customer_id),
    sales_stage: text(row.sales_stage),
    deposit_status: text(row.deposit_status),
    line_group_id: text(row.line_group_id),
    line_group_name: text(row.line_group_name),
    line_notify_enabled: boolText(row.line_notify_enabled),
    active: boolText(row.active),
  }));
}

export async function getSupabaseTeamMembers() {
  const rows = await supabaseSelect<SupabaseTeamMember>("team_members", {
    order: "name.asc",
  });

  return rows.map((row): SheetLikeRecord => ({
    _rowIndex: row.member_id,
    member_id: row.member_id,
    name: row.name,
    email: text(row.email),
    password: "",
    phone: text(row.phone),
    role: text(row.role),
    project_ids: listText(row.project_ids),
    active: boolText(row.active),
    google_sub: text(row.google_sub),
    avatar_url: text(row.avatar_url),
    auth_provider: text(row.auth_provider),
    last_login_at: timestampText(row.last_login_at),
  }));
}

export async function getSupabaseTeamMemberCredentials() {
  const rows = await supabaseSelect<SupabaseTeamMember>("team_members", {
    order: "name.asc",
  });

  return rows.map((row): SheetLikeRecord => ({
    _rowIndex: row.member_id,
    member_id: row.member_id,
    name: row.name,
    email: text(row.email),
    password: "",
    password_hash: text(row.password_hash),
    phone: text(row.phone),
    role: text(row.role),
    project_ids: listText(row.project_ids),
    active: boolText(row.active),
    google_sub: text(row.google_sub),
    avatar_url: text(row.avatar_url),
    auth_provider: text(row.auth_provider),
    last_login_at: timestampText(row.last_login_at),
  }));
}

export async function getSupabaseUserProjectAccess() {
  const rows = await supabaseSelect<SupabaseUserProjectAccess>("user_project_access", {
    order: "project_id.asc",
  });

  return rows.map((row): SheetLikeRecord => ({
    _rowIndex: row.access_id,
    user_site_id: text(row.access_id),
    email: text(row.email),
    google_sub: text(row.google_sub),
    project_id: row.project_id,
    role: text(row.role),
    active: boolText(row.active),
  }));
}

export async function getSupabaseCustomers() {
  const rows = await supabaseSelect<SupabaseRow>("customers", {
    order: "created_at.desc",
  });

  return rows.map((row) => sheetRowFromSupabase(row, "id", [
    "id",
    "full_name",
    "nickname",
    "phone",
    "line_id",
    "address",
    "requirements",
    "interest_level",
    "status",
    "contact_logs_json",
    "last_contacted_at",
    "project_id",
    "notes",
    "freebies",
    "created_by",
    "active",
    "created_at",
    "updated_at",
    "next_follow_up_date",
  ], {
    dateFields: ["next_follow_up_date"],
    timestampFields: ["last_contacted_at", "created_at", "updated_at"],
    jsonFields: ["contact_logs_json"],
    boolFields: ["active"],
    columnMap: {
      contact_logs_json: "contact_logs",
    },
  }));
}

export async function getSupabaseNotifications() {
  const rows = await supabaseSelect<SupabaseNotification>("notifications", {
    order: "created_at.desc",
  });

  return rows.map((row): SheetLikeRecord => ({
    _rowIndex: row.notification_id,
    notification_id: row.notification_id,
    project_id: text(row.project_id),
    target_email: text(row.target_email),
    target_role: text(row.target_role),
    target_google_sub: text(row.target_google_sub),
    type: text(row.type),
    title: text(row.title),
    message: text(row.message),
    link: text(row.link),
    is_read: boolText(row.is_read),
    created_at: timestampText(row.created_at),
    read_at: timestampText(row.read_at),
    created_by_email: text(row.created_by_email),
    created_by_name: text(row.created_by_name),
  }));
}

export async function getSupabaseAuditLogs() {
  const rows = await supabaseSelect<SupabaseAuditLog>("audit_logs", {
    order: "timestamp.desc",
  });

  return rows.map((row): SheetLikeRecord => ({
    _rowIndex: row.log_id,
    log_id: row.log_id,
    timestamp: timestampText(row.timestamp),
    actor_email: text(row.actor_email),
    actor_name: text(row.actor_name),
    actor_role: text(row.actor_role),
    actor_google_sub: text(row.actor_google_sub),
    project_id: text(row.project_id),
    module: text(row.module),
    action: text(row.action),
    target_id: text(row.target_id),
    summary: text(row.summary),
    before_json: nullableJsonText(row.before_json),
    after_json: nullableJsonText(row.after_json),
  }));
}

export async function getSupabaseTasks(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "order_index.asc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseTask>("tasks", params);

  return rows.map((row): SheetLikeRecord => ({
    _rowIndex: row.task_id,
    task_id: row.task_id,
    project_id: row.project_id,
    name: row.name,
    assignee: text(row.assignee),
    start: dateText(row.start_date),
    end: dateText(row.end_date),
    status: text(row.status),
    percent_done: text(row.percent_done),
    category: text(row.category),
    duration_days: text(row.duration_days),
    priority: text(row.priority),
    notes: text(row.notes),
    order_index: text(row.order_index),
    task_type: text(row.task_type),
    parent_task_id: text(row.parent_task_id),
    planned_start: dateText(row.planned_start),
    planned_end: dateText(row.planned_end),
    linked_vo_id: text(row.linked_vo_id),
    vo_badge: text(row.vo_badge),
    payment_note: text(row.payment_note),
    gantt_locked: boolText(row.gantt_locked),
    unlock_date: dateText(row.unlock_date),
    unlock_reason: text(row.unlock_reason),
  }));
}

export async function getSupabaseMilestones(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "date.asc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseMilestone>("milestones", params);

  return rows.map((row): SheetLikeRecord => ({
    _rowIndex: row.milestone_id,
    milestone_id: row.milestone_id,
    project_id: row.project_id,
    title: row.title,
    date: dateText(row.date),
    type: text(row.type),
    color: text(row.color),
    notes: text(row.notes),
  }));
}

export async function getSupabaseBudget(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "category.asc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseRow>("budget", params);

  return rows.map((row) => sheetRowFromSupabase(row, "budget_id", [
    "budget_id",
    "project_id",
    "category",
    "planned",
    "actual",
    "variance",
    "created_at",
    "updated_at",
  ], {
    timestampFields: ["created_at", "updated_at"],
  }));
}

export async function getSupabaseMaterials(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "delivery_date.desc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseRow>("materials", params);

  return rows.map((row) => sheetRowFromSupabase(row, "material_id", [
    "material_id",
    "project_id",
    "name",
    "supplier",
    "quantity",
    "unit",
    "qty_plan",
    "qty_actual",
    "cost",
    "order_date",
    "delivery_date",
    "status",
    "created_at",
    "updated_at",
  ], {
    dateFields: ["order_date", "delivery_date"],
    timestampFields: ["created_at", "updated_at"],
  }));
}

export async function getSupabaseIssues(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "due_date.asc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseRow>("issues", params);

  return rows.map((row) => sheetRowFromSupabase(row, "issue_id", [
    "issue_id",
    "project_id",
    "title",
    "priority",
    "status",
    "due_date",
    "owner",
    "created_at",
    "updated_at",
  ], {
    dateFields: ["due_date"],
    timestampFields: ["created_at", "updated_at"],
  }));
}

export async function getSupabaseDailyReports(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "report_date.desc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseDailyReport>("daily_reports", params);

  return rows.map((row): SheetLikeRecord => ({
    _rowIndex: row.report_id,
    report_id: row.report_id,
    project_id: row.project_id,
    date: dateText(row.report_date),
    weather: text(row.weather),
    workers: text(row.workers),
    work_done: text(row.work_done),
    issues: text(row.issues),
    photos_folder_id: text(row.photos_folder_id),
    document_no: text(row.document_no),
    project_name: text(row.project_name),
    project_location: text(row.project_location),
    project_start_date: dateText(row.project_start_date),
    project_end_date: dateText(row.project_end_date),
    project_owner: text(row.project_owner),
    personnel_json: jsonText(row.personnel),
    machinery_json: jsonText(row.machinery),
    materials_json: jsonText(row.materials),
    solutions: text(row.solutions),
    prepared_by_name: text(row.prepared_by_name),
    prepared_by_position: text(row.prepared_by_position),
    prepared_by_email: text(row.prepared_by_email),
    prepared_at: timestampText(row.prepared_at),
    photos_json: jsonText(row.photos),
    pdf_folder_id: text(row.pdf_folder_id),
    pdf_file_id: text(row.pdf_file_id),
    pdf_url: text(row.pdf_url),
    photos_month_folder_id: text(row.photos_month_folder_id),
    line_group_id: text(row.line_group_id),
    line_status: text(row.line_status),
    line_sent_at: timestampText(row.line_sent_at),
    line_error: text(row.line_error),
    created_at: timestampText(row.created_at),
    updated_at: timestampText(row.updated_at),
  }));
}

export async function getSupabaseWeeklyReports(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "week_start.desc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseWeeklyReport>("weekly_reports", params);

  return rows.map((row): SheetLikeRecord => ({
    _rowIndex: row.report_id,
    report_id: row.report_id,
    project_id: row.project_id,
    week_start: dateText(row.week_start),
    week_end: dateText(row.week_end),
    document_no: text(row.document_no),
    project_name: text(row.project_name),
    project_location: text(row.project_location),
    project_start_date: dateText(row.project_start_date),
    project_end_date: dateText(row.project_end_date),
    project_owner: text(row.project_owner),
    work_quantities_json: jsonText(row.work_quantities),
    materials_json: jsonText(row.materials),
    machinery_json: jsonText(row.machinery),
    personnel_json: jsonText(row.personnel),
    progress_json: jsonText(row.progress),
    instructions_json: jsonText(row.instructions),
    approvals_json: jsonText(row.approvals),
    field_engineer_name: text(row.field_engineer_name),
    field_engineer_email: text(row.field_engineer_email),
    field_engineer_position: text(row.field_engineer_position),
    project_manager_name: text(row.project_manager_name),
    prepared_at: timestampText(row.prepared_at),
    pdf_folder_id: text(row.pdf_folder_id),
    pdf_file_id: text(row.pdf_file_id),
    pdf_url: text(row.pdf_url),
    created_at: timestampText(row.created_at),
    updated_at: timestampText(row.updated_at),
  }));
}

export async function getSupabaseMonthlyReports(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "month_start.desc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseMonthlyReport>("monthly_reports", params);

  return rows.map((row): SheetLikeRecord => ({
    _rowIndex: row.report_id,
    report_id: row.report_id,
    project_id: row.project_id,
    month: text(row.month),
    month_start: dateText(row.month_start),
    month_end: dateText(row.month_end),
    document_no: text(row.document_no),
    project_name: text(row.project_name),
    project_location: text(row.project_location),
    project_start_date: dateText(row.project_start_date),
    project_end_date: dateText(row.project_end_date),
    project_owner: text(row.project_owner),
    preface: text(row.preface),
    meeting_summary: text(row.meeting_summary),
    next_month_plan_note: text(row.next_month_plan_note),
    weekly_reports_json: jsonText(row.weekly_reports),
    daily_summary_json: jsonText(row.daily_summary),
    progress_json: jsonText(row.progress),
    next_month_plan_json: jsonText(row.next_month_plan),
    photos_json: jsonText(row.photos),
    weather_json: jsonText(row.weather),
    personnel_json: jsonText(row.personnel),
    machinery_json: jsonText(row.machinery),
    materials_json: jsonText(row.materials),
    issues_json: jsonText(row.issues),
    approvals_json: jsonText(row.approvals),
    certifications_json: jsonText(row.certifications),
    inspections_json: jsonText(row.inspections),
    field_engineer_name: text(row.field_engineer_name),
    field_engineer_email: text(row.field_engineer_email),
    field_engineer_position: text(row.field_engineer_position),
    project_manager_name: text(row.project_manager_name),
    prepared_at: timestampText(row.prepared_at),
    pdf_folder_id: text(row.pdf_folder_id),
    pdf_file_id: text(row.pdf_file_id),
    pdf_url: text(row.pdf_url),
    created_at: timestampText(row.created_at),
    updated_at: timestampText(row.updated_at),
  }));
}

export async function getSupabaseSiteNotes(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "updated_at.desc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseSiteNote>("site_notes", params);

  return rows.map((row): SheetLikeRecord => ({
    _rowIndex: row.note_id,
    note_id: row.note_id,
    project_id: row.project_id,
    title: row.title,
    body: text(row.body),
    category: text(row.category),
    priority: text(row.priority),
    pinned: boolText(row.pinned),
    archived: boolText(row.archived),
    follow_up_date: dateText(row.follow_up_date),
    linked_module: text(row.linked_module),
    linked_ref: text(row.linked_ref),
    attachments_json: jsonText(row.attachments),
    created_by_name: text(row.created_by_name),
    created_by_email: text(row.created_by_email),
    updated_by_name: text(row.updated_by_name),
    updated_by_email: text(row.updated_by_email),
    created_at: timestampText(row.created_at),
    updated_at: timestampText(row.updated_at),
  }));
}

export async function getSupabaseSiteMemos(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "updated_at.desc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseSiteMemo>("site_memos", params);

  return rows.map((row) => sheetRowFromSupabase(row, "memo_id", [
    "memo_id",
    "project_id",
    "document_no",
    "memo_type",
    "related_module",
    "related_ref",
    "title",
    "event_date",
    "issue_date",
    "detail",
    "requires_customer_ack",
    "has_time_impact",
    "extension_days",
    "extension_reason",
    "status",
    "customer_name",
    "prepared_by_name",
    "prepared_by_email",
    "prepared_by_role",
    "attachments_json",
    "pdf_file_id",
    "pdf_url",
    "issued_at",
    "acknowledgement_token",
    "acknowledgement_url",
    "sent_to_customer_at",
    "line_group_id",
    "line_message",
    "acknowledged_by",
    "acknowledged_channel",
    "acknowledged_date",
    "acknowledgement_note",
    "created_at",
    "updated_at",
  ], {
    dateFields: ["event_date", "issue_date", "acknowledged_date"],
    timestampFields: ["issued_at", "sent_to_customer_at", "created_at", "updated_at"],
    jsonFields: ["attachments_json"],
    boolFields: ["requires_customer_ack", "has_time_impact"],
    columnMap: {
      attachments_json: "attachments",
    },
  }));
}

export async function getSupabaseSiteMemoEvidence(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "created_at.desc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseSiteMemoEvidence>("site_memo_evidence", params);

  return rows.map((row) => sheetRowFromSupabase(row, "evidence_id", [
    "evidence_id",
    "memo_id",
    "project_id",
    "channel",
    "acknowledged_by",
    "acknowledged_date",
    "file_name",
    "file_id",
    "file_url",
    "mime_type",
    "notes",
    "uploaded_by_name",
    "uploaded_by_email",
    "created_at",
    "updated_at",
  ], {
    dateFields: ["acknowledged_date"],
    timestampFields: ["created_at", "updated_at"],
  }));
}

export async function getSupabaseProjectDocuments(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "created_at.desc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseProjectDocument>("project_documents", params);

  return rows.map((row): SheetLikeRecord => ({
    _rowIndex: row.document_id,
    document_id: row.document_id,
    project_id: row.project_id,
    category: text(row.category),
    title: text(row.title),
    version_number: text(row.version_number),
    file_name: text(row.file_name),
    mime_type: text(row.mime_type),
    file_size: text(row.file_size),
    drive_file_id: text(row.drive_file_id),
    drive_url: text(row.drive_url),
    notes: text(row.notes),
    uploaded_by_email: text(row.uploaded_by_email),
    uploaded_by_name: text(row.uploaded_by_name),
    created_at: timestampText(row.created_at),
    updated_at: timestampText(row.updated_at),
  }));
}

export async function getSupabaseProjectLifecycle(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "project_id.asc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseProjectLifecycle>("project_lifecycle", params);

  return rows.map((row): SheetLikeRecord => ({
    _rowIndex: row.lifecycle_id,
    lifecycle_id: row.lifecycle_id,
    project_id: row.project_id,
    current_status: text(row.current_status),
    design_start_date: dateText(row.design_start_date),
    design_done_date: dateText(row.design_done_date),
    contract_signed_date: dateText(row.contract_signed_date),
    drawing_start_date: dateText(row.drawing_start_date),
    drawing_done_date: dateText(row.drawing_done_date),
    permit_submitted_date: dateText(row.permit_submitted_date),
    permit_received_date: dateText(row.permit_received_date),
    permit_expiry_date: dateText(row.permit_expiry_date),
    temporary_electric_install_date: dateText(row.temporary_electric_install_date),
    temporary_electric_expiry_date: dateText(row.temporary_electric_expiry_date),
    temporary_water_install_date: dateText(row.temporary_water_install_date),
    temporary_water_expiry_date: dateText(row.temporary_water_expiry_date),
    demolition_waiting_date: dateText(row.demolition_waiting_date),
    demolition_done_date: dateText(row.demolition_done_date),
    construction_start_date: dateText(row.construction_start_date),
    construction_end_date: dateText(row.construction_end_date),
    notes: text(row.notes),
    created_at: timestampText(row.created_at),
    updated_at: timestampText(row.updated_at),
  }));
}

export async function getSupabaseProjectWarranty(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "project_id.asc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseProjectWarranty>("project_warranty", params);

  return rows.map((row): SheetLikeRecord => ({
    _rowIndex: row.warranty_id,
    warranty_id: row.warranty_id,
    project_id: row.project_id,
    handover_date: dateText(row.handover_date),
    structure_retention_date: dateText(row.structure_retention_date),
    structure_expiry_date: dateText(row.structure_expiry_date),
    structure_notes: text(row.structure_notes),
    roof_retention_date: dateText(row.roof_retention_date),
    roof_expiry_date: dateText(row.roof_expiry_date),
    roof_notes: text(row.roof_notes),
    architecture_retention_date: dateText(row.architecture_retention_date),
    architecture_expiry_date: dateText(row.architecture_expiry_date),
    architecture_notes: text(row.architecture_notes),
    created_at: timestampText(row.created_at),
    updated_at: timestampText(row.updated_at),
  }));
}

export async function getSupabaseDefectRounds(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "inspection_date.desc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseRow>("defect_rounds", params);

  return rows.map((row) => sheetRowFromSupabase(row, "round_id", [
    "round_id",
    "project_id",
    "document_no",
    "revision_no",
    "title",
    "inspection_date",
    "inspector_name",
    "inspector_email",
    "client_name",
    "project_name",
    "project_location",
    "status",
    "item_count",
    "open_count",
    "acknowledged_by",
    "acknowledged_channel",
    "acknowledged_date",
    "acknowledgement_note",
    "pdf_file_id",
    "pdf_url",
    "issued_at",
    "issued_by_name",
    "issued_by_email",
    "locked_at",
    "snapshot_json",
    "notes",
    "created_at",
    "updated_at",
    "extension_days",
    "approval_token",
    "approval_url",
    "sent_to_customer_at",
    "line_group_id",
    "line_message",
  ], {
    dateFields: ["inspection_date", "acknowledged_date"],
    timestampFields: ["issued_at", "locked_at", "created_at", "updated_at", "sent_to_customer_at"],
    nullableJsonFields: ["snapshot_json"],
    columnMap: { snapshot_json: "snapshot" },
  }));
}

export async function getSupabaseDefectItems(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "item_no.asc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseRow>("defect_items", params);

  return rows.map((row) => sheetRowFromSupabase(row, "item_id", [
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
    "reported_date",
    "due_date",
    "remarks",
    "before_photos_json",
    "after_photos_json",
    "repair_note",
    "created_by_name",
    "created_by_email",
    "created_at",
    "updated_at",
  ], {
    dateFields: ["reported_date", "due_date"],
    timestampFields: ["created_at", "updated_at"],
    jsonFields: ["before_photos_json", "after_photos_json"],
    columnMap: {
      before_photos_json: "before_photos",
      after_photos_json: "after_photos",
    },
  }));
}

export async function getSupabaseDefectEvidence(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "created_at.desc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseRow>("defect_evidence", params);

  return rows.map((row) => sheetRowFromSupabase(row, "evidence_id", [
    "evidence_id",
    "round_id",
    "project_id",
    "evidence_type",
    "channel",
    "acknowledged_by",
    "acknowledged_date",
    "file_name",
    "file_id",
    "file_url",
    "mime_type",
    "notes",
    "uploaded_by_name",
    "uploaded_by_email",
    "created_at",
    "updated_at",
  ], {
    dateFields: ["acknowledged_date"],
    timestampFields: ["created_at", "updated_at"],
  }));
}

export async function getSupabaseQcChecklists(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "inspection_date.desc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseRow>("qc_checklists", params);

  return rows.map((row) => sheetRowFromSupabase(row, "qc_id", [
    "qc_id",
    "project_id",
    "template_id",
    "document_no",
    "category",
    "phase",
    "title",
    "status",
    "approval_status",
    "inspection_date",
    "inspected_by_name",
    "inspected_by_email",
    "customer_approved_at",
    "customer_approved_by",
    "customer_approval_note",
    "items_json",
    "evidence_files_json",
    "pdf_file_id",
    "pdf_url",
    "line_group_id",
    "line_message",
    "sent_to_customer_at",
    "issued_at",
    "issued_by_name",
    "issued_by_email",
    "notes",
    "active",
    "created_at",
    "updated_at",
    "approval_token",
    "approval_url",
  ], {
    dateFields: ["inspection_date"],
    timestampFields: ["customer_approved_at", "sent_to_customer_at", "issued_at", "created_at", "updated_at"],
    jsonFields: ["items_json", "evidence_files_json"],
    boolFields: ["active"],
    columnMap: {
      items_json: "items",
      evidence_files_json: "evidence_files",
    },
  }));
}

export async function getSupabaseCustomerDecisions(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "order_index.asc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseRow>("customer_decisions", params);

  return rows.map((row) => sheetRowFromSupabase(row, "decision_id", [
    "decision_id",
    "project_id",
    "phase",
    "title",
    "decision_before",
    "decision_status",
    "impact_if_changed",
    "result_note",
    "evidence_note",
    "notified_at",
    "notified_by_name",
    "notified_by_email",
    "line_group_id",
    "line_message",
    "decided_at",
    "decided_by",
    "order_index",
    "active",
    "created_at",
    "updated_at",
    "document_no",
    "evidence_files_json",
    "pdf_file_id",
    "pdf_url",
    "issued_at",
    "issued_by_name",
    "issued_by_email",
    "approval_token",
    "approval_url",
  ], {
    timestampFields: ["notified_at", "decided_at", "created_at", "updated_at", "issued_at"],
    jsonFields: ["evidence_files_json"],
    boolFields: ["active"],
    columnMap: {
      evidence_files_json: "evidence_files",
    },
  }));
}

export async function getSupabaseVariationOrders(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "created_at.desc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseVariationOrder>("variation_orders", params);

  return rows.map((row) => sheetRowFromSupabase(row, "vo_id", [
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
    "subtotal",
    "vat_rate",
    "vat_exempt",
    "withholding_tax",
    "vat_amount",
    "wht_amount",
    "grand_total",
    "net_payable",
    "contract_before",
    "contract_after",
    "approval_deadline",
    "approval_token",
    "approval_url",
    "customer_approved_at",
    "customer_approved_by",
    "customer_approval_note",
    "sent_to_customer_at",
    "line_group_id",
    "line_message",
    "created_by_name",
    "created_by_email",
    "created_by_role",
    "status",
    "client_name",
    "supporting_docs",
    "linked_tasks_json",
    "evidence_json",
    "rejection_json",
    "revision_history_json",
    "task_plan_status",
    "invoice_no",
    "invoice_date",
    "due_date",
    "amount_due",
    "amount_paid",
    "balance",
    "payment_status",
    "document_refs_json",
    "notes",
    "created_at",
    "updated_at",
    "extension_days",
  ], {
    dateFields: ["approval_deadline", "invoice_date", "due_date"],
    timestampFields: ["customer_approved_at", "sent_to_customer_at", "created_at", "updated_at"],
    jsonFields: ["linked_tasks_json", "evidence_json", "revision_history_json", "document_refs_json"],
    nullableJsonFields: ["rejection_json"],
    boolFields: ["vat_exempt"],
    columnMap: {
      linked_tasks_json: "linked_tasks",
      evidence_json: "evidence",
      rejection_json: "rejection",
      revision_history_json: "revision_history",
      document_refs_json: "document_refs",
    },
  }));
}

export async function getSupabaseVoItems(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "item_no.asc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseRow>("vo_items", params);

  return rows.map((row) => sheetRowFromSupabase(row, "item_id", [
    "item_id",
    "vo_id",
    "project_id",
    "item_no",
    "description",
    "unit",
    "quantity",
    "unit_price",
    "amount",
    "created_at",
    "updated_at",
  ], {
    timestampFields: ["created_at", "updated_at"],
  }));
}

export async function getSupabaseVoPayments(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "paid_date.desc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseRow>("vo_payments", params);

  return rows.map((row) => sheetRowFromSupabase(row, "payment_id", [
    "payment_id",
    "vo_id",
    "project_id",
    "invoice_no",
    "receipt_no",
    "paid_date",
    "amount_paid",
    "payment_method",
    "payment_ref",
    "evidence_file",
    "recorded_by_name",
    "recorded_by_email",
    "created_at",
    "updated_at",
  ], {
    dateFields: ["paid_date"],
    timestampFields: ["created_at", "updated_at"],
  }));
}

export async function getSupabaseVoDocuments(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "created_at.desc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseRow>("vo_documents", params);

  return rows.map((row) => sheetRowFromSupabase(row, "document_id", [
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
    "created_at",
    "updated_at",
  ], {
    timestampFields: ["created_at", "updated_at"],
  }));
}

export async function getSupabaseVoTaskLinks(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "created_at.desc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseRow>("vo_task_links", params);

  return rows.map((row) => sheetRowFromSupabase(row, "link_id", [
    "link_id",
    "vo_id",
    "project_id",
    "task_id",
    "link_type",
    "plan_status",
    "task_note",
    "created_by_name",
    "created_by_email",
    "created_at",
    "updated_at",
  ], {
    timestampFields: ["created_at", "updated_at"],
  }));
}

export async function getSupabaseVoFinanceLedger(projectId?: string | null) {
  const params: Record<string, string> = {
    order: "entry_date.desc",
  };
  if (projectId) params.project_id = `eq.${projectId}`;

  const rows = await supabaseSelect<SupabaseRow>("vo_finance_ledger", params);

  return rows.map((row) => sheetRowFromSupabase(row, "ledger_id", [
    "ledger_id",
    "vo_id",
    "project_id",
    "entry_type",
    "ref_no",
    "entry_date",
    "debit",
    "credit",
    "balance",
    "summary",
    "created_by_name",
    "created_by_email",
    "created_at",
    "updated_at",
  ], {
    dateFields: ["entry_date"],
    timestampFields: ["created_at", "updated_at"],
  }));
}
