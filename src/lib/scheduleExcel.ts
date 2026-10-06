export type ScheduleExcelRow = {
  wbs: string;
  name: string;
  level: string;
  depth: number;
  assignee: string;
  start: string;
  end: string;
  durationDays: number | null;
  progress: number;
  status: string;
  notes: string;
  color: string;
  isHeading: boolean;
};

export type ScheduleExcelMilestone = {
  title: string;
  date: string;
  type: string;
  notes: string;
  color: string;
};

export type ScheduleExcelInput = {
  projectCode: string;
  projectName: string;
  clientName: string;
  timelineStart: string;
  timelineEnd: string;
  rows: ScheduleExcelRow[];
  milestones: ScheduleExcelMilestone[];
};

type ExcelCell = {
  value: unknown;
  font: unknown;
  fill: unknown;
  alignment: unknown;
  border: unknown;
  numFmt: string;
};

type ExcelRow = {
  values: unknown[];
  height: number;
  outlineLevel: number;
  getCell: (column: number) => ExcelCell;
  eachCell: {
    (callback: (cell: ExcelCell, columnNumber: number) => void): void;
    (options: { includeEmpty: boolean }, callback: (cell: ExcelCell, columnNumber: number) => void): void;
  };
};

type ExcelWorksheet = {
  columns: unknown[];
  autoFilter: unknown;
  pageSetup: {
    printTitlesRow?: string;
    printArea?: string;
  };
  headerFooter: { oddFooter?: string };
  mergeCells: {
    (range: string): void;
    (top: number, left: number, bottom: number, right: number): void;
  };
  getCell: {
    (address: string): ExcelCell;
    (row: number, column: number): ExcelCell;
  };
  getRow: (row: number) => ExcelRow;
  getColumn: (column: number) => { width: number; letter: string };
};

type ExcelJSBrowser = {
  Workbook: new () => {
    creator: string;
    company: string;
    created: Date;
    modified: Date;
    calcProperties: { fullCalcOnLoad: boolean };
    addWorksheet: (name: string, options: unknown) => ExcelWorksheet;
    xlsx: { writeBuffer: () => Promise<ArrayBuffer | Uint8Array> };
  };
};

declare global {
  interface Window {
    ExcelJS?: ExcelJSBrowser;
  }
}

const NAVY = "0B2447";
const ORANGE = "F97316";
const GRID = "D9E2EC";
const WHITE = "FFFFFF";
let excelJsLoader: Promise<ExcelJSBrowser> | null = null;

function loadExcelJS() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Excel export is available in the browser only"));
  }
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (excelJsLoader) return excelJsLoader;

  excelJsLoader = new Promise<ExcelJSBrowser>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>("script[data-pmc-exceljs]");
    const script = existingScript || document.createElement("script");
    const handleLoad = () => {
      if (window.ExcelJS) resolve(window.ExcelJS);
      else reject(new Error("โหลดตัวสร้างไฟล์ Excel ไม่สำเร็จ"));
    };
    const handleError = () => reject(new Error("โหลดตัวสร้างไฟล์ Excel ไม่สำเร็จ"));

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (!existingScript) {
      script.src = "/vendor/exceljs/exceljs.min.js";
      script.async = true;
      script.dataset.pmcExceljs = "true";
      document.head.appendChild(script);
    }
  }).catch((error) => {
    excelJsLoader = null;
    throw error;
  });

  return excelJsLoader;
}

function parseDate(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function cleanHex(value: string, fallback = ORANGE) {
  const hex = value.replace("#", "").trim().toUpperCase();
  return /^[0-9A-F]{6}$/.test(hex) ? hex : fallback;
}

function mixWithWhite(value: string, ratio: number) {
  const hex = cleanHex(value);
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return channels
    .map((channel) => Math.round(channel + (255 - channel) * ratio).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function safeFileName(value: string) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "construction-schedule";
}

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(date);
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function makePeriods(start: Date, end: Date) {
  const totalDays = Math.max(1, daysBetween(start, end) + 1);
  const stepDays = totalDays <= 100 ? 7 : totalDays <= 240 ? 14 : 30;
  const periods: { start: Date; end: Date; label: string; month: string }[] = [];

  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, stepDays)) {
    const periodEnd = addDays(cursor, stepDays - 1);
    const visibleEnd = periodEnd > end ? end : periodEnd;
    periods.push({
      start: new Date(cursor),
      end: visibleEnd,
      label: stepDays === 30 ? monthLabel(cursor) : dateLabel(cursor),
      month: monthLabel(cursor),
    });
  }

  return periods;
}

function intersects(start: Date | null, end: Date | null, periodStart: Date, periodEnd: Date) {
  if (!start && !end) return false;
  const rangeStart = start || end;
  const rangeEnd = end || start;
  return Boolean(rangeStart && rangeEnd && rangeStart <= periodEnd && rangeEnd >= periodStart);
}

export async function buildScheduleWorkbook(input: ScheduleExcelInput) {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  const generatedAt = new Date();
  const timelineStart = parseDate(input.timelineStart) || generatedAt;
  const timelineEnd = parseDate(input.timelineEnd) || timelineStart;
  const rowsWithDates = input.rows.filter((row) => parseDate(row.start) || parseDate(row.end));
  const workRows = input.rows.filter((row) => !row.isHeading);
  const averageProgress = workRows.length
    ? workRows.reduce((sum, row) => sum + row.progress, 0) / workRows.length
    : 0;

  workbook.creator = "PMC CONNEXT";
  workbook.company = "Pichayamongkol Construction Co., Ltd.";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  workbook.calcProperties.fullCalcOnLoad = true;

  const planSheet = workbook.addWorksheet("แผนงาน", {
    properties: { defaultRowHeight: 22 },
    views: [{ state: "frozen", xSplit: 2, ySplit: 5, showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
    },
  });
  planSheet.columns = [
    { key: "wbs", width: 12 },
    { key: "name", width: 43 },
    { key: "level", width: 15 },
    { key: "assignee", width: 22 },
    { key: "start", width: 14 },
    { key: "end", width: 14 },
    { key: "duration", width: 16 },
    { key: "progress", width: 12 },
    { key: "status", width: 18 },
    { key: "notes", width: 48 },
  ];

  planSheet.mergeCells("A1:J1");
  planSheet.getCell("A1").value = "แผนงานก่อสร้าง";
  planSheet.getCell("A1").font = { name: "Tahoma", size: 20, bold: true, color: { argb: WHITE } };
  planSheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  planSheet.getCell("A1").alignment = { vertical: "middle" };
  planSheet.getRow(1).height = 36;

  planSheet.mergeCells("A2:F2");
  planSheet.getCell("A2").value = `${input.projectCode} · ${input.projectName}`;
  planSheet.mergeCells("G2:J2");
  planSheet.getCell("G2").value = `ลูกค้า: ${input.clientName || "ไม่ระบุ"}`;
  planSheet.mergeCells("A3:F3");
  planSheet.getCell("A3").value = `ช่วงที่แสดง: ${dateLabel(timelineStart)} - ${dateLabel(timelineEnd)}`;
  planSheet.mergeCells("G3:J3");
  planSheet.getCell("G3").value = `งาน ${workRows.length} รายการ · มีวันที่ ${rowsWithDates.length} · ความก้าวหน้าเฉลี่ย ${Math.round(averageProgress)}%`;

  [2, 3].forEach((rowNumber) => {
    const row = planSheet.getRow(rowNumber);
    row.height = 23;
    row.eachCell((cell) => {
      cell.font = { name: "Tahoma", size: 10, bold: rowNumber === 2, color: { argb: NAVY } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F8FAFC" } };
      cell.alignment = { vertical: "middle" };
    });
  });

  const planHeaders = ["WBS", "รายการงาน", "ระดับ", "ผู้รับผิดชอบ", "วันเริ่ม", "วันสิ้นสุด", "ระยะเวลา (วัน)", "% งาน", "สถานะ", "หมายเหตุ"];
  const planHeaderRow = planSheet.getRow(5);
  planHeaderRow.values = planHeaders;
  planHeaderRow.height = 30;
  planHeaderRow.eachCell((cell) => {
    cell.font = { name: "Tahoma", size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "medium", color: { argb: ORANGE } } };
  });

  input.rows.forEach((item, index) => {
    const rowNumber = index + 6;
    const row = planSheet.getRow(rowNumber);
    const start = parseDate(item.start);
    const end = parseDate(item.end);
    const color = cleanHex(item.color);
    const softColor = mixWithWhite(color, item.isHeading ? 0.84 : 0.94);

    row.values = [
      item.wbs,
      item.name,
      item.level,
      item.assignee || "-",
      start || null,
      end || null,
      item.durationDays,
      item.progress / 100,
      item.status,
      item.notes || "-",
    ];
    row.height = item.notes.length > 65 ? 38 : item.isHeading ? 27 : 24;
    row.outlineLevel = Math.min(item.depth, 7);

    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cell.font = {
        name: "Tahoma",
        size: 10,
        bold: item.isHeading,
        color: { argb: item.isHeading ? NAVY : "1F2937" },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: [1, 3, 5, 6, 7, 8, 9].includes(columnNumber) ? "center" : "left",
        wrapText: true,
        indent: columnNumber === 2 ? Math.min(item.depth, 6) : 0,
      };
      cell.border = {
        bottom: { style: "hair", color: { argb: GRID } },
        right: { style: "hair", color: { argb: GRID } },
      };
      if (item.isHeading || columnNumber <= 2) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: softColor } };
      }
    });

    row.getCell(1).font = { name: "Tahoma", size: 10, bold: true, color: { argb: color } };
    row.getCell(1).border = {
      left: { style: "medium", color: { argb: color } },
      bottom: { style: "hair", color: { argb: GRID } },
      right: { style: "hair", color: { argb: GRID } },
    };
    row.getCell(5).numFmt = "dd/mm/yyyy";
    row.getCell(6).numFmt = "dd/mm/yyyy";
    row.getCell(8).numFmt = "0%";
  });

  const planLastRow = Math.max(5, input.rows.length + 5);
  planSheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: planLastRow, column: 10 } };
  planSheet.pageSetup.printTitlesRow = "1:5";
  planSheet.pageSetup.printArea = `A1:J${planLastRow}`;
  planSheet.headerFooter.oddFooter = "PMC CONNEXT | &D &T | หน้า &P / &N";

  const periods = makePeriods(timelineStart, timelineEnd);
  const timelineFirstColumn = 8;
  const timelineLastColumn = timelineFirstColumn + periods.length - 1;
  const ganttSheet = workbook.addWorksheet("Gantt", {
    properties: { defaultRowHeight: 22 },
    views: [{ state: "frozen", xSplit: 7, ySplit: 6, showGridLines: false, zoomScale: 85 }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.2, right: 0.2, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 },
    },
  });

  [12, 38, 21, 14, 14, 11, 38].forEach((width, index) => {
    ganttSheet.getColumn(index + 1).width = width;
  });
  periods.forEach((_, index) => {
    ganttSheet.getColumn(timelineFirstColumn + index).width = 11;
  });

  ganttSheet.mergeCells(1, 1, 1, timelineLastColumn);
  ganttSheet.getCell(1, 1).value = "แผนงานก่อสร้าง · Gantt Chart";
  ganttSheet.getCell(1, 1).font = { name: "Tahoma", size: 20, bold: true, color: { argb: WHITE } };
  ganttSheet.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  ganttSheet.getCell(1, 1).alignment = { vertical: "middle" };
  ganttSheet.getRow(1).height = 36;
  ganttSheet.mergeCells(2, 1, 2, Math.min(7, timelineLastColumn));
  ganttSheet.getCell(2, 1).value = `${input.projectCode} · ${input.projectName}`;
  if (timelineLastColumn > 7) {
    ganttSheet.mergeCells(2, 8, 2, timelineLastColumn);
    ganttSheet.getCell(2, 8).value = `ช่วงที่แสดง ${dateLabel(timelineStart)} - ${dateLabel(timelineEnd)}`;
    ganttSheet.getCell(2, 8).alignment = { horizontal: "right", vertical: "middle" };
  }
  ganttSheet.getRow(2).eachCell((cell) => {
    cell.font = { name: "Tahoma", size: 10, bold: true, color: { argb: NAVY } };
  });

  const ganttHeaders = ["WBS", "รายการงาน", "ผู้รับผิดชอบ", "วันเริ่ม", "วันสิ้นสุด", "% งาน", "หมายเหตุ"];
  ganttHeaders.forEach((label, index) => {
    ganttSheet.mergeCells(5, index + 1, 6, index + 1);
    const cell = ganttSheet.getCell(5, index + 1);
    cell.value = label;
    cell.font = { name: "Tahoma", size: 9, bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  let monthStartIndex = 0;
  periods.forEach((period, index) => {
    const nextMonth = periods[index + 1]?.month;
    if (period.month !== nextMonth) {
      const fromColumn = timelineFirstColumn + monthStartIndex;
      const toColumn = timelineFirstColumn + index;
      if (fromColumn < toColumn) ganttSheet.mergeCells(5, fromColumn, 5, toColumn);
      const monthCell = ganttSheet.getCell(5, fromColumn);
      monthCell.value = period.month;
      monthCell.font = { name: "Tahoma", size: 9, bold: true, color: { argb: WHITE } };
      monthCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      monthCell.alignment = { vertical: "middle", horizontal: "center" };
      monthStartIndex = index + 1;
    }

    const periodCell = ganttSheet.getCell(6, timelineFirstColumn + index);
    periodCell.value = period.label;
    periodCell.font = { name: "Tahoma", size: 8, bold: true, color: { argb: NAVY } };
    periodCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "E8EEF6" } };
    periodCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  ganttSheet.getRow(5).height = 24;
  ganttSheet.getRow(6).height = 30;

  input.rows.forEach((item, index) => {
    const rowNumber = index + 7;
    const row = ganttSheet.getRow(rowNumber);
    const start = parseDate(item.start);
    const end = parseDate(item.end);
    const color = cleanHex(item.color);
    const softColor = mixWithWhite(color, item.isHeading ? 0.84 : 0.96);

    row.values = [item.wbs, item.name, item.assignee || "-", start || null, end || null, item.progress / 100, item.notes || "-"];
    row.height = item.notes.length > 65 ? 36 : item.isHeading ? 27 : 24;
    row.outlineLevel = Math.min(item.depth, 7);

    for (let column = 1; column <= timelineLastColumn; column += 1) {
      const cell = row.getCell(column);
      cell.font = { name: "Tahoma", size: 9, bold: item.isHeading, color: { argb: item.isHeading ? NAVY : "1F2937" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: [1, 4, 5, 6].includes(column) ? "center" : "left",
        wrapText: true,
        indent: column === 2 ? Math.min(item.depth, 6) : 0,
      };
      cell.border = {
        bottom: { style: "hair", color: { argb: GRID } },
        right: { style: "hair", color: { argb: GRID } },
      };
      if (item.isHeading && column <= 7) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: softColor } };
      }
    }

    row.getCell(1).font = { name: "Tahoma", size: 9, bold: true, color: { argb: color } };
    row.getCell(1).border = {
      left: { style: "medium", color: { argb: color } },
      bottom: { style: "hair", color: { argb: GRID } },
      right: { style: "hair", color: { argb: GRID } },
    };
    row.getCell(4).numFmt = "dd/mm/yyyy";
    row.getCell(5).numFmt = "dd/mm/yyyy";
    row.getCell(6).numFmt = "0%";

    periods.forEach((period, periodIndex) => {
      if (!intersects(start, end, period.start, period.end)) return;
      const cell = row.getCell(timelineFirstColumn + periodIndex);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      cell.border = {
        top: { style: item.isHeading ? "medium" : "thin", color: { argb: color } },
        bottom: { style: item.isHeading ? "medium" : "thin", color: { argb: color } },
      };
    });
  });

  let ganttLastRow = input.rows.length + 6;
  if (input.milestones.length) {
    ganttLastRow += 2;
    ganttSheet.mergeCells(ganttLastRow, 1, ganttLastRow, timelineLastColumn);
    const milestoneHeader = ganttSheet.getCell(ganttLastRow, 1);
    milestoneHeader.value = "Milestone";
    milestoneHeader.font = { name: "Tahoma", size: 10, bold: true, color: { argb: WHITE } };
    milestoneHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };

    input.milestones.forEach((milestone) => {
      ganttLastRow += 1;
      const milestoneDate = parseDate(milestone.date);
      const color = cleanHex(milestone.color, "475569");
      const row = ganttSheet.getRow(ganttLastRow);
      row.values = ["M", milestone.title, milestone.type || "Milestone", milestoneDate || null, milestoneDate || null, null, milestone.notes || "-"];
      row.height = 24;
      for (let column = 1; column <= timelineLastColumn; column += 1) {
        const cell = row.getCell(column);
        cell.font = { name: "Tahoma", size: 9, bold: column <= 2, color: { argb: column === 1 ? color : "1F2937" } };
        cell.alignment = { vertical: "middle", horizontal: [1, 4, 5, 6].includes(column) ? "center" : "left", wrapText: true };
        cell.border = { bottom: { style: "hair", color: { argb: GRID } }, right: { style: "hair", color: { argb: GRID } } };
      }
      row.getCell(4).numFmt = "dd/mm/yyyy";
      row.getCell(5).numFmt = "dd/mm/yyyy";
      periods.forEach((period, periodIndex) => {
        if (!milestoneDate || milestoneDate < period.start || milestoneDate > period.end) return;
        const cell = row.getCell(timelineFirstColumn + periodIndex);
        cell.value = "◆";
        cell.font = { name: "Tahoma", size: 13, bold: true, color: { argb: color } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
    });
  }

  ganttSheet.pageSetup.printTitlesRow = "1:6";
  ganttSheet.pageSetup.printArea = `${ganttSheet.getColumn(1).letter}1:${ganttSheet.getColumn(timelineLastColumn).letter}${Math.max(ganttLastRow, 6)}`;
  ganttSheet.headerFooter.oddFooter = "PMC CONNEXT | Gantt Chart | หน้า &P / &N";

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
}

export async function downloadScheduleWorkbook(input: ScheduleExcelInput) {
  const bytes = await buildScheduleWorkbook(input);
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(`แผนงาน-${input.projectCode}-${input.projectName}`)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
