import { sheets } from "./google";

export const ACCOUNTING_TRANSACTIONS_HEADERS = [
  "created_at",
  "line_source_type",
  "line_group_id",
  "line_user_id",
  "line_display_name",
  "message_id",
  "webhook_event_id",
  "document_type",
  "transfer_datetime",
  "amount",
  "fee",
  "bank_or_source",
  "sender_name",
  "sender_account_masked",
  "receiver_name",
  "receiver_account_masked",
  "transaction_ref",
  "merchant_or_vendor",
  "expense_category",
  "requester_name",
  "cost_owner_type",
  "cost_owner_name",
  "site_code",
  "site_name",
  "engineer_name",
  "employee_or_sender_name",
  "payee_name",
  "drive_file_url",
  "drive_file_id",
  "raw_ai_json",
  "confidence",
  "status",
  "review_note",
] as const;

export type AccountingTransaction = Partial<Record<(typeof ACCOUNTING_TRANSACTIONS_HEADERS)[number], string | number | boolean | null | undefined>>;

export const ACCOUNTING_SHEET_ID = process.env.AI_ACCOUNTING_SHEET_ID || "";
export const ACCOUNTING_UNKNOWN_FOLDER_ID = process.env.AI_ACCOUNTING_UNKNOWN_FOLDER_ID || "";

export async function appendAccountingTransaction(data: AccountingTransaction) {
  if (!ACCOUNTING_SHEET_ID) {
    throw new Error("AI_ACCOUNTING_SHEET_ID is not configured");
  }

  const payload = {
    created_at: new Date().toISOString(),
    ...data,
  };
  const row = ACCOUNTING_TRANSACTIONS_HEADERS.map((header) => payload[header] ?? "");

  await sheets.spreadsheets.values.append({
    spreadsheetId: ACCOUNTING_SHEET_ID,
    range: "Transactions!A:A",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [row],
    },
  });

  return payload;
}

