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
type SheetRow = { _rowIndex: number } & Record<string, string>;

const MASTER_READ_CACHE_TTL_MS = 5 * 60 * 1000;
const MASTER_READ_STALE_TTL_MS = 30 * 60 * 1000;
const SITE_READ_CACHE_TTL_MS = 2 * 60 * 1000;
const SITE_READ_STALE_TTL_MS = 30 * 60 * 1000;
const masterReadCache = new Map<string, {
  expiresAt: number;
  staleUntil: number;
  rows?: SheetRow[];
  promise?: Promise<SheetRow[]>;
}>();
const siteReadCache = new Map<string, {
  expiresAt: number;
  staleUntil: number;
  rows?: SheetRow[];
  promise?: Promise<SheetRow[]>;
}>();

function isQuotaExceeded(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Quota exceeded");
}

function clearMasterReadCache(tableName?: MasterTable) {
  if (!tableName) {
    masterReadCache.clear();
    return;
  }
  masterReadCache.delete(`${MASTER_SHEET_ID}:${String(tableName)}`);
}

function getReadCacheKey(spreadsheetId: string, tableName: string) {
  return `${spreadsheetId}:${tableName}`;
}

function clearSiteReadCache(spreadsheetId: string, tableName?: string) {
  if (!tableName) {
    Array.from(siteReadCache.keys())
      .filter((key) => key.startsWith(`${spreadsheetId}:`))
      .forEach((key) => siteReadCache.delete(key));
    return;
  }
  siteReadCache.delete(getReadCacheKey(spreadsheetId, tableName));
}

function rowsToRecords(rows: unknown[][]) {
  if (rows.length === 0) return [] as SheetRow[];

  const headers = rows[0].map((header) => String(header || ""));
  const dataRows = rows.slice(1);

  return dataRows.map((row, rowIndex) => {
    const obj = { _rowIndex: rowIndex + 2 } as SheetRow;
    headers.forEach((header, colIndex) => {
      obj[header] = String(row[colIndex] || "");
    });
    return obj;
  });
}

async function findAllFromSheet(spreadsheetId: string, tableName: string) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tableName}`,
    });

    return rowsToRecords(res.data.values || []);
  } catch (error) {
    if (isQuotaExceeded(error)) {
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

async function findAllFromSiteCache(spreadsheetId: string, tableName: string) {
  const cacheKey = getReadCacheKey(spreadsheetId, tableName);
  const cached = siteReadCache.get(cacheKey);
  const now = Date.now();

  if (cached?.rows && cached.expiresAt > now) {
    return cached.rows;
  }

  if (cached?.promise) {
    return cached.promise;
  }

  const promise = findAllFromSheet(spreadsheetId, tableName)
    .then((rows) => {
      siteReadCache.set(cacheKey, {
        expiresAt: Date.now() + SITE_READ_CACHE_TTL_MS,
        staleUntil: Date.now() + SITE_READ_STALE_TTL_MS,
        rows,
      });
      return rows;
    })
    .catch((error) => {
      if (isQuotaExceeded(error) && cached?.rows && cached.staleUntil > Date.now()) {
        console.warn(`Using stale site ${tableName} rows because Google Sheets read quota is temporarily exceeded.`);
        siteReadCache.set(cacheKey, {
          expiresAt: Date.now() + 30 * 1000,
          staleUntil: cached.staleUntil,
          rows: cached.rows,
        });
        return cached.rows;
      }
      siteReadCache.delete(cacheKey);
      throw error;
    });

  siteReadCache.set(cacheKey, {
    expiresAt: cached?.expiresAt || 0,
    staleUntil: cached?.staleUntil || 0,
    rows: cached?.rows,
    promise,
  });

  return promise;
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
  return findAllFromSiteCache(spreadsheetId, String(tableName));
}

export async function findAllBatch(tableNames: SiteTable[], spreadsheetId: string = SHEET_ID) {
  const uniqueTableNames = Array.from(new Set(tableNames.map(String)));
  const result = {} as Record<SiteTable, SheetRow[]>;
  const pendingTables: string[] = [];
  const pendingPromises: Promise<void>[] = [];
  const now = Date.now();

  uniqueTableNames.forEach((tableName) => {
    const cacheKey = getReadCacheKey(spreadsheetId, tableName);
    const cached = siteReadCache.get(cacheKey);

    if (cached?.rows && cached.expiresAt > now) {
      result[tableName as SiteTable] = cached.rows;
      return;
    }

    if (cached?.promise) {
      pendingPromises.push(cached.promise.then((rows) => {
        result[tableName as SiteTable] = rows;
      }));
      return;
    }

    pendingTables.push(tableName);
  });

  if (pendingTables.length > 0) {
    const batchPromise = sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: pendingTables,
    })
      .then((response) => {
        pendingTables.forEach((tableName, index) => {
          const rows = rowsToRecords(response.data.valueRanges?.[index]?.values || []);
          siteReadCache.set(getReadCacheKey(spreadsheetId, tableName), {
            expiresAt: Date.now() + SITE_READ_CACHE_TTL_MS,
            staleUntil: Date.now() + SITE_READ_STALE_TTL_MS,
            rows,
          });
          result[tableName as SiteTable] = rows;
        });
      })
      .catch((error) => {
        if (isQuotaExceeded(error)) {
          const recoverableTables = pendingTables.filter((tableName) => {
            const cached = siteReadCache.get(getReadCacheKey(spreadsheetId, tableName));
            return Boolean(cached?.rows && cached.staleUntil > Date.now());
          });

          if (recoverableTables.length === pendingTables.length) {
            pendingTables.forEach((tableName) => {
              const cached = siteReadCache.get(getReadCacheKey(spreadsheetId, tableName));
              const rows = cached?.rows || [];
              console.warn(`Using stale site ${tableName} rows because Google Sheets read quota is temporarily exceeded.`);
              siteReadCache.set(getReadCacheKey(spreadsheetId, tableName), {
                expiresAt: Date.now() + 30 * 1000,
                staleUntil: cached?.staleUntil || 0,
                rows,
              });
              result[tableName as SiteTable] = rows;
            });
            return;
          }
        }

        pendingTables.forEach((tableName) => siteReadCache.delete(getReadCacheKey(spreadsheetId, tableName)));
        throw error;
      });

    pendingTables.forEach((tableName) => {
      siteReadCache.set(getReadCacheKey(spreadsheetId, tableName), {
        expiresAt: 0,
        staleUntil: 0,
        promise: batchPromise.then(() => result[tableName as SiteTable] || []),
      });
    });
    pendingPromises.push(batchPromise);
  }

  await Promise.all(pendingPromises);
  return result;
}

export async function findAllMaster(tableName: MasterTable) {
  const cacheKey = `${MASTER_SHEET_ID}:${String(tableName)}`;
  const cached = masterReadCache.get(cacheKey);
  const now = Date.now();

  if (cached?.rows && cached.expiresAt > now) {
    return cached.rows;
  }

  if (cached?.promise) {
    return cached.promise;
  }

  const promise = findAllFromSheet(MASTER_SHEET_ID, String(tableName))
    .then((rows) => {
      masterReadCache.set(cacheKey, {
        expiresAt: Date.now() + MASTER_READ_CACHE_TTL_MS,
        staleUntil: Date.now() + MASTER_READ_STALE_TTL_MS,
        rows,
      });
      return rows;
    })
    .catch((error) => {
      if (isQuotaExceeded(error) && cached?.rows && cached.staleUntil > Date.now()) {
        console.warn(`Using stale master ${String(tableName)} rows because Google Sheets read quota is temporarily exceeded.`);
        masterReadCache.set(cacheKey, {
          expiresAt: Date.now() + 30 * 1000,
          staleUntil: cached.staleUntil,
          rows: cached.rows,
        });
        return cached.rows;
      }
      masterReadCache.delete(cacheKey);
      throw error;
    });

  masterReadCache.set(cacheKey, {
    expiresAt: cached?.expiresAt || 0,
    staleUntil: cached?.staleUntil || 0,
    rows: cached?.rows,
    promise,
  });

  return promise;
}

export async function insert(tableName: SiteTable, data: Record<string, SheetValue>, spreadsheetId: string = SHEET_ID) {
  const result = await insertToSheet(spreadsheetId, SITE_SCHEMA, String(tableName), data);
  clearSiteReadCache(spreadsheetId, String(tableName));
  return result;
}

export async function insertMaster(tableName: MasterTable, data: Record<string, SheetValue>) {
  const result = await insertToSheet(MASTER_SHEET_ID, MASTER_SCHEMA, String(tableName), data);
  clearMasterReadCache(tableName);
  return result;
}

export async function update(tableName: SiteTable, rowIndex: number, patch: Record<string, SheetValue>, spreadsheetId: string = SHEET_ID) {
  const result = await updateInSheet(spreadsheetId, SITE_SCHEMA, String(tableName), rowIndex, patch);
  clearSiteReadCache(spreadsheetId, String(tableName));
  return result;
}

export async function updateMaster(tableName: MasterTable, rowIndex: number, patch: Record<string, SheetValue>) {
  const result = await updateInSheet(MASTER_SHEET_ID, MASTER_SCHEMA, String(tableName), rowIndex, patch);
  clearMasterReadCache(tableName);
  return result;
}

export async function deleteRow(tableName: SiteTable, rowIndex: number, spreadsheetId: string = SHEET_ID) {
  const result = await deleteRowFromSheet(spreadsheetId, String(tableName), rowIndex);
  clearSiteReadCache(spreadsheetId, String(tableName));
  return result;
}

export async function deleteRowMaster(tableName: MasterTable, rowIndex: number) {
  const result = await deleteRowFromSheet(MASTER_SHEET_ID, String(tableName), rowIndex);
  clearMasterReadCache(tableName);
  return result;
}
