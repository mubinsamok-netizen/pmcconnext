import type { VoItemInput } from "@/lib/variationOrders";

export const VO_SPREADSHEET_HEADERS = [
  "ประเภทแถว",
  "ลำดับรายการหลัก",
  "รายการ",
  "ปริมาณ",
  "หน่วย",
  "วัสดุ/หน่วย",
  "วัสดุรวม",
  "ค่าแรง/หน่วย",
  "ค่าแรงรวม",
  "รวมเป็นเงิน",
  "งานเพิ่ม/ลด",
] as const;

type SpreadsheetValue = unknown;

export type VoSpreadsheetParseResult = {
  items: VoItemInput[];
  errors: string[];
  warnings: string[];
  skippedRows: number;
  counts: {
    group: number;
    detail: number;
    note: number;
  };
};

const HEADER_ALIASES = {
  rowType: ["ประเภทแถว", "ประเภท", "rowtype", "type"],
  itemNo: ["ลำดับรายการหลัก", "ลำดับกลุ่ม", "itemno", "groupno", "ลำดับ"],
  description: ["รายการ", "รายละเอียด", "description", "item"],
  quantity: ["ปริมาณ", "จำนวน", "quantity", "qty"],
  unit: ["หน่วย", "unit"],
  materialUnitPrice: ["วัสดุ/หน่วย", "ค่าวัสดุ/หน่วย", "materialunitprice", "materialprice"],
  materialAmount: ["วัสดุรวม", "ค่าวัสดุรวม", "materialamount", "materialtotal"],
  laborUnitPrice: ["ค่าแรง/หน่วย", "แรง/หน่วย", "laborunitprice", "laborprice"],
  laborAmount: ["ค่าแรงรวม", "แรงรวม", "laboramount", "labortotal"],
  amount: ["รวมเป็นเงิน", "ยอดรวม", "รวม", "amount", "total"],
  changeType: ["งานเพิ่ม/ลด", "ประเภทงาน", "การเปลี่ยนแปลง", "changetype", "adddeduct"],
} as const;

type HeaderKey = keyof typeof HEADER_ALIASES;
type ColumnMap = Record<HeaderKey, number>;

function normalizedHeader(value: SpreadsheetValue) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_()\-.]/g, "");
}

function findColumn(row: SpreadsheetValue[], aliases: readonly string[]) {
  const normalizedAliases = aliases.map(normalizedHeader);
  return row.findIndex((value) => normalizedAliases.includes(normalizedHeader(value)));
}

function columnMapFor(row: SpreadsheetValue[]): ColumnMap {
  return Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, findColumn(row, aliases)])
  ) as ColumnMap;
}

function readColumn(row: SpreadsheetValue[], columnMap: ColumnMap, key: HeaderKey) {
  const index = columnMap[key];
  return index >= 0 ? row[index] : undefined;
}

function textValue(value: SpreadsheetValue) {
  return String(value ?? "").trim();
}

function spreadsheetNumber(value: SpreadsheetValue) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? "").trim();
  if (!cleaned || cleaned === "-") return 0;
  const isNegative = /^\(.*\)$/.test(cleaned);
  const numeric = Number(cleaned.replace(/[(),฿\s]/g, ""));
  if (!Number.isFinite(numeric)) return 0;
  return isNegative ? -numeric : numeric;
}

function hasSpreadsheetValue(value: SpreadsheetValue) {
  const text = textValue(value);
  return text !== "" && text !== "-";
}

function rowTypeFor(value: SpreadsheetValue) {
  const normalized = normalizedHeader(value);
  if (["รายการหลัก", "กลุ่ม", "หมวด", "group", "main"].includes(normalized)) return "group" as const;
  if (["รายละเอียดย่อย", "รายการย่อย", "รายละเอียด", "detail", "item"].includes(normalized)) return "detail" as const;
  if (["หมายเหตุ", "note", "remark"].includes(normalized)) return "note" as const;
  return null;
}

function changeTypeFor(value: SpreadsheetValue) {
  const normalized = normalizedHeader(value);
  if (["งานลด", "ลด", "deduct", "decrease", "minus", "vo-", "-"].includes(normalized)) return "deduct" as const;
  return "add" as const;
}

function approximatelyEqual(left: number, right: number) {
  return Math.abs(left - right) <= 0.01;
}

export function parseVoSpreadsheetRows(
  rawRows: SpreadsheetValue[][],
  options: { allowHeaderless?: boolean } = {}
): VoSpreadsheetParseResult {
  const rows = rawRows.slice(0, 501);
  const errors: string[] = [];
  const warnings: string[] = [];
  const items: VoItemInput[] = [];
  let skippedRows = 0;
  let headerIndex = -1;
  let columnMap: ColumnMap | null = null;

  for (let index = 0; index < Math.min(rows.length, 15); index += 1) {
    const candidateMap = columnMapFor(rows[index] || []);
    if (candidateMap.rowType >= 0 && candidateMap.description >= 0) {
      headerIndex = index;
      columnMap = candidateMap;
      break;
    }
  }

  if (!columnMap && options.allowHeaderless) {
    columnMap = {
      rowType: 0,
      itemNo: 1,
      description: 2,
      quantity: 3,
      unit: 4,
      materialUnitPrice: 5,
      materialAmount: 6,
      laborUnitPrice: 7,
      laborAmount: 8,
      amount: 9,
      changeType: 10,
    };
  }

  if (!columnMap) {
    return {
      items: [],
      errors: ["ไม่พบหัวตาราง 'ประเภทแถว' และ 'รายการ' กรุณาใช้ Excel Template ของระบบ"],
      warnings: [],
      skippedRows: 0,
      counts: { group: 0, detail: 0, note: 0 },
    };
  }

  const startIndex = headerIndex >= 0 ? headerIndex + 1 : 0;
  let currentGroupNo = 0;
  let currentChangeType: "add" | "deduct" = "add";

  rows.slice(startIndex).forEach((row, offset) => {
    const sheetRow = startIndex + offset + 1;
    const candidateValues = Object.keys(HEADER_ALIASES).map((key) => readColumn(row, columnMap as ColumnMap, key as HeaderKey));
    if (!candidateValues.some(hasSpreadsheetValue)) {
      skippedRows += 1;
      return;
    }

    const rowTypeText = readColumn(row, columnMap as ColumnMap, "rowType");
    const rowType = rowTypeFor(rowTypeText);
    const description = textValue(readColumn(row, columnMap as ColumnMap, "description"));
    if (!rowType) {
      errors.push(`แถว ${sheetRow}: ประเภทแถว '${textValue(rowTypeText) || "ว่าง"}' ไม่ถูกต้อง`);
      return;
    }
    if (!description) {
      errors.push(`แถว ${sheetRow}: กรุณาระบุรายการหรือข้อความหมายเหตุ`);
      return;
    }

    if (rowType === "group") {
      currentGroupNo += 1;
      currentChangeType = changeTypeFor(readColumn(row, columnMap as ColumnMap, "changeType"));
    }
    if (rowType !== "group" && currentGroupNo === 0) {
      warnings.push(`แถว ${sheetRow}: ไม่มีรายการหลักก่อนหน้า ระบบจะจัดรายการนี้ไว้ในกลุ่มแรก`);
      currentGroupNo = 1;
    }

    const quantityRaw = readColumn(row, columnMap as ColumnMap, "quantity");
    const materialUnitRaw = readColumn(row, columnMap as ColumnMap, "materialUnitPrice");
    const materialAmountRaw = readColumn(row, columnMap as ColumnMap, "materialAmount");
    const laborUnitRaw = readColumn(row, columnMap as ColumnMap, "laborUnitPrice");
    const laborAmountRaw = readColumn(row, columnMap as ColumnMap, "laborAmount");
    const amountRaw = readColumn(row, columnMap as ColumnMap, "amount");
    const quantity = rowType === "note" ? 0 : spreadsheetNumber(quantityRaw) || (rowType === "detail" ? 1 : 0);
    const materialUnitPrice = spreadsheetNumber(materialUnitRaw);
    let laborUnitPrice = spreadsheetNumber(laborUnitRaw);
    const importedAmount = spreadsheetNumber(amountRaw);

    if (rowType !== "note" && !hasSpreadsheetValue(materialUnitRaw) && !hasSpreadsheetValue(laborUnitRaw) && hasSpreadsheetValue(amountRaw) && quantity !== 0) {
      laborUnitPrice = importedAmount / quantity;
      warnings.push(`แถว ${sheetRow}: ใช้ยอดรวมเป็นค่าแรงต่อหน่วยสำหรับรายการเหมารวม`);
    }

    const calculatedMaterialAmount = quantity * materialUnitPrice;
    const calculatedLaborAmount = quantity * laborUnitPrice;
    const calculatedAmount = calculatedMaterialAmount + calculatedLaborAmount;
    if (rowType !== "note" && hasSpreadsheetValue(materialAmountRaw) && !approximatelyEqual(spreadsheetNumber(materialAmountRaw), calculatedMaterialAmount)) {
      warnings.push(`แถว ${sheetRow}: วัสดุรวมไม่ตรงสูตร ระบบจะคำนวณใหม่จากปริมาณ × วัสดุ/หน่วย`);
    }
    if (rowType !== "note" && hasSpreadsheetValue(laborAmountRaw) && !approximatelyEqual(spreadsheetNumber(laborAmountRaw), calculatedLaborAmount)) {
      warnings.push(`แถว ${sheetRow}: ค่าแรงรวมไม่ตรงสูตร ระบบจะคำนวณใหม่จากปริมาณ × ค่าแรง/หน่วย`);
    }
    if (rowType !== "note" && hasSpreadsheetValue(amountRaw) && (hasSpreadsheetValue(materialUnitRaw) || hasSpreadsheetValue(laborUnitRaw)) && !approximatelyEqual(importedAmount, calculatedAmount)) {
      warnings.push(`แถว ${sheetRow}: รวมเป็นเงินไม่ตรงสูตร ระบบจะใช้ผลคำนวณจากค่าวัสดุและค่าแรง`);
    }

    items.push({
      row_type: rowType,
      change_type: rowType === "group" ? currentChangeType : undefined,
      item_no: rowType === "group" ? currentGroupNo : items.length + 1,
      sort_order: items.length + 1,
      parent_item_no: rowType === "group" ? "" : currentGroupNo,
      description,
      quantity: rowType === "note" ? "" : String(quantity),
      unit: rowType === "note" ? "" : textValue(readColumn(row, columnMap as ColumnMap, "unit")) || (rowType === "group" ? "LS" : ""),
      material_unit_price: rowType === "note" ? "" : String(materialUnitPrice || ""),
      labor_unit_price: rowType === "note" ? "" : String(laborUnitPrice || ""),
    });
  });

  if (rawRows.length > 501) warnings.push("นำเข้าเฉพาะ 500 แถวแรกเพื่อป้องกันไฟล์ขนาดใหญ่เกินไป");
  if (items.length === 0 && errors.length === 0) errors.push("ไม่พบรายการที่สามารถนำเข้าได้");

  return {
    items,
    errors,
    warnings: [...new Set(warnings)].slice(0, 20),
    skippedRows,
    counts: {
      group: items.filter((item) => item.row_type === "group").length,
      detail: items.filter((item) => item.row_type === "detail").length,
      note: items.filter((item) => item.row_type === "note").length,
    },
  };
}
