import { MASTER_SHEET_ID, sheets, SHEET_ID } from "./google";
import { MASTER_SCHEMA, SITE_SCHEMA } from "./sheetsSetup";

// Convert A1 notation column index (0-based) to Letter
const colToLetter = (col: number) => {
  let letter = "";
  let temp = col;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
};

type SheetValue = string | number | boolean | null | undefined;
type SiteTable = keyof typeof SITE_SCHEMA;
type MasterTable = keyof typeof MASTER_SCHEMA;
type SheetSchema = Record<string, readonly string[]>;

async function findAllFromSheet(spreadsheetId: string, tableName: string) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tableName}`,
    });

    const rows = res.data.values || [];
    if (rows.length === 0) return [];

    const headers = rows[0];
    const dataRows = rows.slice(1);

    return dataRows.map((row, rowIndex) => {
      const obj = { _rowIndex: rowIndex + 2 } as { _rowIndex: number } & Record<string, string>; // 1-based index + 1 for header
      headers.forEach((header, colIndex) => {
        obj[header] = row[colIndex] || "";
      });
      return obj;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Quota exceeded")) {
      console.warn(`Read quota exceeded in findAll(${tableName}).`);
    } else {
      console.error(`Error in findAll(${tableName}):`, error);
    }
    throw error;
  }
}

export async function findAllRaw(tableName: string, spreadsheetId: string = SHEET_ID) {
  return findAllFromSheet(spreadsheetId, tableName);
}

async function insertToSheet(
  spreadsheetId: string,
  schema: SheetSchema,
  tableName: string,
  data: Record<string, SheetValue>
) {
  try {
    const headers = schema[tableName];
    const now = new Date().toISOString();
    
    // Auto-fill dates if not provided
    const payload = { ...data };
    if (headers.includes("created_at") && !payload.created_at) payload.created_at = now;
    if (headers.includes("updated_at") && !payload.updated_at) payload.updated_at = now;

    // Create row array based on header order
    const row = headers.map((h) => payload[h] || "");

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tableName}!A:A`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [row],
      },
    });

    return { success: true, inserted: payload };
  } catch (error) {
    console.error(`Error in insert(${tableName}):`, error);
    throw error;
  }
}

async function updateInSheet(
  spreadsheetId: string,
  schema: SheetSchema,
  tableName: string,
  rowIndex: number,
  patch: Record<string, SheetValue>
) {
  try {
    const headers = schema[tableName];
    
    // Get existing row first to merge updates
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tableName}!A${rowIndex}:${colToLetter(headers.length - 1)}${rowIndex}`,
    });
    
    const existingRow = res.data.values?.[0] || [];
    const now = new Date().toISOString();
    
    const mergedRow = headers.map((h, i) => {
      if (h === "updated_at") return now;
      if (patch[h] !== undefined) return patch[h];
      return existingRow[i] || "";
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tableName}!A${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [mergedRow],
      },
    });

    return { success: true };
  } catch (error) {
    console.error(`Error in update(${tableName}):`, error);
    throw error;
  }
}

async function deleteRowFromSheet(spreadsheetId: string, tableName: string, rowIndex: number) {
  try {
    if (rowIndex <= 1) {
      throw new Error("Cannot delete header row");
    }

    const doc = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = doc.data.sheets?.find((s) => s.properties?.title === tableName);
    const sheetId = sheet?.properties?.sheetId;

    if (sheetId === undefined || sheetId === null) {
      throw new Error(`Sheet ${tableName} not found`);
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowIndex - 1,
                endIndex: rowIndex,
              },
            },
          },
        ],
      },
    });

    return { success: true };
  } catch (error) {
    console.error(`Error in deleteRow(${tableName}):`, error);
    throw error;
  }
}

export async function findAll(tableName: SiteTable, spreadsheetId: string = SHEET_ID) {
  return findAllFromSheet(spreadsheetId, String(tableName));
}

export async function findAllMaster(tableName: MasterTable) {
  return findAllFromSheet(MASTER_SHEET_ID, String(tableName));
}

export async function insert(tableName: SiteTable, data: Record<string, SheetValue>, spreadsheetId: string = SHEET_ID) {
  return insertToSheet(spreadsheetId, SITE_SCHEMA, String(tableName), data);
}

export async function insertMaster(tableName: MasterTable, data: Record<string, SheetValue>) {
  return insertToSheet(MASTER_SHEET_ID, MASTER_SCHEMA, String(tableName), data);
}

export async function update(tableName: SiteTable, rowIndex: number, patch: Record<string, SheetValue>, spreadsheetId: string = SHEET_ID) {
  return updateInSheet(spreadsheetId, SITE_SCHEMA, String(tableName), rowIndex, patch);
}

export async function updateMaster(tableName: MasterTable, rowIndex: number, patch: Record<string, SheetValue>) {
  return updateInSheet(MASTER_SHEET_ID, MASTER_SCHEMA, String(tableName), rowIndex, patch);
}

export async function deleteRow(tableName: SiteTable, rowIndex: number, spreadsheetId: string = SHEET_ID) {
  return deleteRowFromSheet(spreadsheetId, String(tableName), rowIndex);
}

export async function deleteRowMaster(tableName: MasterTable, rowIndex: number) {
  return deleteRowFromSheet(MASTER_SHEET_ID, String(tableName), rowIndex);
}
