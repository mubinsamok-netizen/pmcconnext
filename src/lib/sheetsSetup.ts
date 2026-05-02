import { sheets, SHEET_ID } from "./google";

export const SCHEMA = {
  Projects: [
    "project_id",
    "name",
    "client",
    "start_date",
    "end_date",
    "status",
    "budget",
    "drive_folder_id",
    "created_at",
    "updated_at",
  ],
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
  Team: [
    "member_id",
    "name",
    "role",
    "email",
    "password",
    "phone",
    "project_ids",
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
};

export async function ensureSchema() {
  try {
    const doc = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const existingSheets = doc.data.sheets?.map((s) => s.properties?.title) || [];

    for (const [sheetName, headers] of Object.entries(SCHEMA)) {
      if (!existingSheets.includes(sheetName)) {
        console.log(`Creating sheet: ${sheetName}`);
        // Create the sheet
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SHEET_ID,
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

        // Add headers
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${sheetName}!A1`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [headers],
          },
        });
      } else {
        // Just verify/update headers (optional, for safety we can just overwrite A1)
        const headerRes = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: `${sheetName}!1:1`,
        });
        
        const currentHeaders = headerRes.data.values?.[0] || [];
        if (currentHeaders.length < headers.length) {
          console.log(`Updating headers for ${sheetName}`);
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${sheetName}!A1`,
            valueInputOption: "USER_ENTERED",
            requestBody: {
              values: [headers],
            },
          });
        }
      }
    }
    console.log("Schema ensure completed.");
    return { success: true };
  } catch (error) {
    console.error("Failed to ensure schema:", error);
    return { success: false, error };
  }
}
