import { sheets, SHEET_ID } from "./google";
import { SCHEMA } from "./sheetsSetup";

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

export async function findAll(tableName: keyof typeof SCHEMA) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${tableName}`,
    });

    const rows = res.data.values || [];
    if (rows.length === 0) return [];

    const headers = rows[0];
    const dataRows = rows.slice(1);

    return dataRows.map((row, rowIndex) => {
      const obj: any = { _rowIndex: rowIndex + 2 }; // 1-based index + 1 for header
      headers.forEach((header, colIndex) => {
        obj[header] = row[colIndex] || "";
      });
      return obj;
    });
  } catch (error) {
    console.error(`Error in findAll(${tableName}):`, error);
    throw error;
  }
}

export async function insert(tableName: keyof typeof SCHEMA, data: Record<string, any>) {
  try {
    const headers = SCHEMA[tableName];
    const now = new Date().toISOString();
    
    // Auto-fill dates if not provided
    const payload = { ...data };
    if (headers.includes("created_at") && !payload.created_at) payload.created_at = now;
    if (headers.includes("updated_at") && !payload.updated_at) payload.updated_at = now;

    // Create row array based on header order
    const row = headers.map((h) => payload[h] || "");

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
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

export async function update(tableName: keyof typeof SCHEMA, rowIndex: number, patch: Record<string, any>) {
  try {
    const headers = SCHEMA[tableName];
    
    // Get existing row first to merge updates
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
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
      spreadsheetId: SHEET_ID,
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
