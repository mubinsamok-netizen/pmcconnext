import { drive, MASTER_SHEET_ID, sheets, SHEET_ID } from "./google";

export const MASTER_SCHEMA = {
  Projects: [
    "project_id",
    "name",
    "client",
    "start_date",
    "end_date",
    "status",
    "budget",
    "site_sheet_id",
    "drive_folder_id",
    "active",
    "created_at",
    "updated_at",
    "project_type",
    "description",
    "address",
    "province",
    "district",
    "contract_no",
    "site_link",
    "pm_name",
    "se_name",
    "cover_file_id",
    "cover_url",
    "sales_customer_id",
    "sales_stage",
    "deposit_status",
    "line_group_id",
    "line_group_name",
    "line_notify_enabled",
  ],
  Team: [
    "member_id",
    "name",
    "role",
    "email",
    "password",
    "phone",
    "project_ids",
    "active",
    "created_at",
    "updated_at",
    "google_sub",
    "avatar_url",
    "auth_provider",
    "last_login_at",
  ],
  UserSites: [
    "user_site_id",
    "email",
    "project_id",
    "role",
    "active",
    "created_at",
    "updated_at",
    "google_sub",
  ],
  AuditLogs: [
    "log_id",
    "timestamp",
    "actor_email",
    "actor_name",
    "actor_role",
    "actor_google_sub",
    "project_id",
    "module",
    "action",
    "target_id",
    "summary",
    "before_json",
    "after_json",
  ],
  Notifications: [
    "notification_id",
    "project_id",
    "target_email",
    "target_role",
    "target_google_sub",
    "type",
    "title",
    "message",
    "link",
    "is_read",
    "created_at",
    "read_at",
    "created_by_email",
    "created_by_name",
  ],
  Customers: [
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
  ],
};

export const SITE_SCHEMA = {
  Tasks: [
    "task_id",
    "project_id",
    "name",
    "assignee",
    "start",
    "end",
    "status",
    "percent_done",
    "created_at",
    "updated_at",
    "category",
    "duration_days",
    "priority",
    "notes",
    "order_index",
    "task_type",
    "parent_task_id",
    "weight",
    "planned_start",
    "planned_end",
    "linked_vo_id",
    "vo_badge",
    "payment_note",
    "gantt_locked",
    "unlock_date",
    "unlock_reason",
  ],
  Milestones: [
    "milestone_id",
    "project_id",
    "title",
    "date",
    "type",
    "color",
    "notes",
    "created_at",
    "updated_at",
  ],
  Daily_Reports: [
    "report_id",
    "project_id",
    "date",
    "weather",
    "workers",
    "work_done",
    "issues",
    "photos_folder_id",
    "created_at",
    "updated_at",
    "document_no",
    "project_name",
    "project_location",
    "project_start_date",
    "project_end_date",
    "project_owner",
    "personnel_json",
    "machinery_json",
    "materials_json",
    "solutions",
    "prepared_by_name",
    "prepared_by_position",
    "prepared_by_email",
    "prepared_at",
    "photos_json",
    "pdf_folder_id",
    "pdf_file_id",
    "pdf_url",
    "photos_month_folder_id",
    "line_group_id",
    "line_status",
    "line_sent_at",
    "line_error",
  ],
  Weekly_Reports: [
    "report_id",
    "project_id",
    "week_start",
    "week_end",
    "document_no",
    "project_name",
    "project_location",
    "project_start_date",
    "project_end_date",
    "project_owner",
    "work_quantities_json",
    "materials_json",
    "machinery_json",
    "personnel_json",
    "progress_json",
    "instructions_json",
    "approvals_json",
    "field_engineer_name",
    "field_engineer_email",
    "field_engineer_position",
    "project_manager_name",
    "prepared_at",
    "pdf_folder_id",
    "pdf_file_id",
    "pdf_url",
    "created_at",
    "updated_at",
  ],
  Monthly_Reports: [
    "report_id",
    "project_id",
    "month",
    "month_start",
    "month_end",
    "document_no",
    "project_name",
    "project_location",
    "project_start_date",
    "project_end_date",
    "project_owner",
    "preface",
    "meeting_summary",
    "next_month_plan_note",
    "weekly_reports_json",
    "daily_summary_json",
    "progress_json",
    "next_month_plan_json",
    "photos_json",
    "weather_json",
    "personnel_json",
    "machinery_json",
    "materials_json",
    "issues_json",
    "approvals_json",
    "certifications_json",
    "inspections_json",
    "field_engineer_name",
    "field_engineer_email",
    "field_engineer_position",
    "project_manager_name",
    "prepared_at",
    "pdf_folder_id",
    "pdf_file_id",
    "pdf_url",
    "created_at",
    "updated_at",
  ],
  Budget: [
    "budget_id",
    "project_id",
    "category",
    "planned",
    "actual",
    "variance",
    "created_at",
    "updated_at",
  ],
  Materials: [
    "material_id",
    "project_id",
    "name",
    "unit",
    "qty_plan",
    "qty_actual",
    "cost",
    "created_at",
    "updated_at",
  ],
  Issues: [
    "issue_id",
    "project_id",
    "title",
    "priority",
    "status",
    "due_date",
    "owner",
    "created_at",
    "updated_at",
  ],
  Defect_Rounds: [
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
  ],
  Defect_Items: [
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
  ],
  Defect_Evidence: [
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
  ],
  Project_Lifecycle: [
    "lifecycle_id",
    "project_id",
    "current_status",
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
    "notes",
    "created_at",
    "updated_at",
  ],
  Project_Documents: [
    "document_id",
    "project_id",
    "category",
    "title",
    "version_number",
    "file_name",
    "mime_type",
    "file_size",
    "drive_file_id",
    "drive_url",
    "notes",
    "uploaded_by_email",
    "uploaded_by_name",
    "created_at",
    "updated_at",
  ],
  Project_Warranty: [
    "warranty_id",
    "project_id",
    "handover_date",
    "structure_retention_date",
    "structure_expiry_date",
    "structure_notes",
    "roof_retention_date",
    "roof_expiry_date",
    "roof_notes",
    "architecture_retention_date",
    "architecture_expiry_date",
    "architecture_notes",
    "created_at",
    "updated_at",
  ],
  Variation_Orders: [
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
  ],
  Payment_Claims: [
    "claim_id",
    "project_id",
    "doc_no",
    "type",
    "status",
    "site_name",
    "project_name",
    "prepared_by",
    "payee_name",
    "payee_kind",
    "payee_id_masked",
    "bank_name",
    "account_no_masked",
    "created_date",
    "due_date",
    "pay_period",
    "installment",
    "description",
    "gross_amount",
    "vat_amount",
    "wht_amount",
    "retention_amount",
    "net_payable",
    "attachments_json",
    "remarks",
    "transfer_date",
    "transfer_ref",
    "closed_at",
    "created_by_name",
    "created_by_email",
    "updated_by_name",
    "updated_by_email",
    "created_at",
    "updated_at",
  ],
  Payment_Claim_Items: [
    "item_id",
    "claim_id",
    "project_id",
    "item_no",
    "description",
    "quantity",
    "unit",
    "unit_price",
    "amount",
    "created_at",
    "updated_at",
  ],
  Payment_Claim_Audit: [
    "audit_id",
    "claim_id",
    "project_id",
    "action",
    "from_status",
    "to_status",
    "note",
    "actor_name",
    "actor_email",
    "actor_role",
    "created_at",
  ],
  Payment_Claim_Documents: [
    "document_id",
    "claim_id",
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
  ],
  Site_Notes: [
    "note_id",
    "project_id",
    "title",
    "body",
    "category",
    "priority",
    "pinned",
    "archived",
    "follow_up_date",
    "linked_module",
    "linked_ref",
    "attachments_json",
    "created_by_name",
    "created_by_email",
    "updated_by_name",
    "updated_by_email",
    "created_at",
    "updated_at",
  ],
  Site_Memos: [
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
    "acknowledged_by",
    "acknowledged_channel",
    "acknowledged_date",
    "acknowledgement_note",
    "created_at",
    "updated_at",
  ],
  Site_Memo_Evidence: [
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
  ],
  VO_Items: [
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
  ],
  VO_Documents: [
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
  ],
  VO_Payments: [
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
  ],
  VO_Task_Links: [
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
  ],
  VO_Finance_Ledger: [
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
  ],
};

export const SCHEMA = SITE_SCHEMA;

type SheetSchema = Record<string, readonly string[]>;
type EnsureSchemaResult = { success: true } | { success: false; error: unknown };

const SCHEMA_CACHE_TTL_MS = 10 * 60 * 1000;
const schemaEnsureCache = new Map<string, { expiresAt: number; promise?: Promise<EnsureSchemaResult> }>();

function getSchemaCacheKey(spreadsheetId: string, schema: SheetSchema) {
  const signature = Object.entries(schema)
    .map(([sheetName, headers]) => `${sheetName}:${headers.join(",")}`)
    .join("|");
  return `${spreadsheetId}:${signature}`;
}

async function ensureSchemaFor(spreadsheetId: string, schema: SheetSchema): Promise<EnsureSchemaResult> {
  const cacheKey = getSchemaCacheKey(spreadsheetId, schema);
  const cached = schemaEnsureCache.get(cacheKey);
  const now = Date.now();

  if (cached?.expiresAt && cached.expiresAt > now) {
    return { success: true };
  }

  if (cached?.promise) {
    return cached.promise;
  }

  const promise = ensureSchemaForUncached(spreadsheetId, schema);
  schemaEnsureCache.set(cacheKey, { expiresAt: 0, promise });

  const result = await promise;
  if (result.success) {
    schemaEnsureCache.set(cacheKey, { expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS });
  } else {
    schemaEnsureCache.delete(cacheKey);
  }

  return result;
}

async function ensureSchemaForUncached(spreadsheetId: string, schema: SheetSchema): Promise<EnsureSchemaResult> {
  try {
    const doc = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties.title",
    });
    const existingSheets = doc.data.sheets?.map((s) => s.properties?.title) || [];
    const existingSchemaSheets = Object.keys(schema).filter((sheetName) => existingSheets.includes(sheetName));
    const headerRows = new Map<string, unknown[]>();

    if (existingSchemaSheets.length > 0) {
      const headerRes = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: existingSchemaSheets.map((sheetName) => `${sheetName}!1:1`),
      });

      headerRes.data.valueRanges?.forEach((valueRange, index) => {
        headerRows.set(existingSchemaSheets[index], valueRange.values?.[0] || []);
      });
    }

    for (const [sheetName, headers] of Object.entries(schema)) {
      if (!existingSheets.includes(sheetName)) {
        console.log(`Creating sheet: ${sheetName}`);
        try {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [
                {
                  addSheet: {
                    properties: { title: sheetName },
                  },
                },
              ],
            },
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "";
          if (!message.includes("already exists")) {
            throw error;
          }
        }

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A1`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [Array.from(headers)],
          },
        });
      } else {
        const currentHeaders = headerRows.get(sheetName) || [];
        const headerMismatch =
          currentHeaders.length < headers.length ||
          headers.some((header, index) => currentHeaders[index] !== header);

        if (headerMismatch) {
          console.log(`Updating headers for ${sheetName}`);
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!A1`,
            valueInputOption: "USER_ENTERED",
            requestBody: {
              values: [Array.from(headers)],
            },
          });
        }
      }
    }
    console.log("Schema ensure completed.");
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Quota exceeded")) {
      console.warn("Skipped schema ensure because Google Sheets read quota is temporarily exceeded.");
    } else {
      console.warn("Failed to ensure schema:", error);
    }
    return { success: false, error };
  }
}

export async function ensureSchema(spreadsheetId: string = SHEET_ID) {
  return ensureSchemaFor(spreadsheetId, SITE_SCHEMA);
}

export async function ensureMasterSchema() {
  return ensureSchemaFor(MASTER_SHEET_ID, MASTER_SCHEMA);
}

export async function createSiteSpreadsheet(title: string, parentFolderId?: string) {
  const result = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: "application/vnd.google-apps.spreadsheet",
      ...(parentFolderId ? { parents: [parentFolderId] } : {}),
    },
    supportsAllDrives: true,
    fields: "id, name",
  });

  const spreadsheetId = result.data.id;
  if (!spreadsheetId) {
    throw new Error("Failed to create site spreadsheet");
  }

  await ensureSchema(spreadsheetId);

  return spreadsheetId;
}
