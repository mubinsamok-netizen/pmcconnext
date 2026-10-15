import { templateStructure, type TemplateItem } from "./scheduleTemplates";

type IdFactory = () => string;
export type TemplateColumn = "name" | "notes";

export function orderedTemplateItems(items: TemplateItem[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return templateStructure(items).tasks.map((task) => byId.get(task.templateId)!);
}

export function branchIds(items: TemplateItem[], selected: Iterable<string>) {
  const ids = new Set(selected);
  for (let size = -1; size !== ids.size;) {
    size = ids.size;
    items.forEach((item) => { if (ids.has(item.parentId)) ids.add(item.id); });
  }
  return ids;
}

function checkSize(items: TemplateItem[]) {
  if (items.length > 1000) throw new Error("แม่แบบรองรับได้ไม่เกิน 1,000 รายการ กรุณาแบ่งเป็นแม่แบบย่อย");
  return items;
}

export function insertTemplateRow(items: TemplateItem[], anchorId: string, mode: "sibling" | "child" | "root", makeId: IdFactory) {
  const ordered = orderedTemplateItems(items);
  const anchor = ordered.find((item) => item.id === anchorId);
  if (mode === "child" && anchor?.type !== "heading") throw new Error("เลือกแถวหัวข้อก่อนเพิ่มงานย่อย");
  const item: TemplateItem = { id: makeId(), name: "", notes: "",
    parentId: mode === "root" ? "" : mode === "child" ? anchor!.id : anchor?.parentId || "",
    type: mode === "root" ? "heading" : mode === "child" ? "subtask" : anchor?.type || "heading" };
  const subtree = branchIds(ordered, anchor ? [anchor.id] : []);
  const after = mode === "root" || !anchor ? ordered.length : ordered.reduce((last, row, index) => subtree.has(row.id) ? index + 1 : last, 0);
  const next = [...ordered.slice(0, after), item, ...ordered.slice(after)];
  return { items: checkSize(next), id: item.id };
}

export function duplicateTemplateRows(items: TemplateItem[], selected: string[], makeId: IdFactory) {
  const ordered = orderedTemplateItems(items);
  const chosen = new Set(selected);
  const byId = new Map(items.map((item) => [item.id, item]));
  const roots = ordered.filter((item) => {
    if (!chosen.has(item.id)) return false;
    let parent = byId.get(item.parentId);
    while (parent) {
      if (chosen.has(parent.id)) return false;
      parent = byId.get(parent.parentId);
    }
    return true;
  });
  let next = [...ordered];
  const copied: string[] = [];
  for (const root of roots) {
    const ids = branchIds(ordered, [root.id]);
    const branch = ordered.filter((item) => ids.has(item.id));
    const remap = new Map(branch.map((item) => [item.id, makeId()]));
    const copies = branch.map((item) => ({ ...item, id: remap.get(item.id)!, parentId: remap.get(item.parentId) || item.parentId }));
    const after = next.findIndex((item) => item.id === branch.at(-1)!.id) + 1;
    next = [...next.slice(0, after), ...copies, ...next.slice(after)];
    copied.push(...copies.map((item) => item.id));
  }
  return { items: checkSize(next), ids: copied };
}

export function changeTemplateLevel(items: TemplateItem[], id: string, direction: "in" | "out") {
  const ordered = orderedTemplateItems(items);
  const row = ordered.find((item) => item.id === id);
  if (!row) return items;
  const ids = branchIds(ordered, [id]);
  const branch = ordered.filter((item) => ids.has(item.id));
  if (direction === "in") {
    const siblings = ordered.filter((item) => item.parentId === row.parentId);
    const previous = siblings[siblings.findIndex((item) => item.id === id) - 1];
    if (!previous) throw new Error("ต้องมีแถวก่อนหน้าในระดับเดียวกัน จึงจะเยื้องเข้าได้");
    return ordered.map((item) => item.id === id ? { ...item, parentId: previous.id }
      : item.id === previous.id ? { ...item, type: "heading" as const } : item);
  }
  const parent = ordered.find((item) => item.id === row.parentId);
  if (!parent) throw new Error("แถวนี้อยู่ระดับหลักแล้ว");
  const remaining = ordered.filter((item) => !ids.has(item.id));
  const parentBranch = branchIds(remaining, [parent.id]);
  const after = remaining.reduce((last, item, index) => parentBranch.has(item.id) ? index + 1 : last, 0);
  return [...remaining.slice(0, after), ...branch.map((item) => item.id === id ? { ...item, parentId: parent.parentId } : item), ...remaining.slice(after)];
}

// Excel encloses cells containing tabs/newlines in quotes and doubles embedded quotes.
export function parseTemplateClipboard(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const input = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"' && (quoted || cell === "")) {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === "\t" || char === "\n")) {
      row.push(cell); cell = "";
      if (char === "\n") { rows.push(row); row = []; }
    } else cell += char;
  }
  if (quoted) throw new Error("ข้อความที่วางมีเครื่องหมายคำพูดไม่ครบ กรุณาคัดลอกเซลล์จาก Excel ใหม่");
  if (cell || row.length || !input.endsWith("\n")) { row.push(cell); rows.push(row); }
  return rows;
}

export function pasteTemplateCells(items: TemplateItem[], visibleIds: string[], anchorId: string, column: TemplateColumn, values: string[][], makeId: IdFactory) {
  if (!values.length) return items;
  const start = visibleIds.indexOf(anchorId);
  if (start < 0) throw new Error("กรุณาเลือกเซลล์เริ่มต้น");
  const columns: TemplateColumn[] = column === "name" ? ["name", "notes"] : ["notes"];
  if (values.some((row) => row.length > columns.length)) throw new Error(column === "name"
    ? "วางได้ 2 คอลัมน์: ชื่อรายการ และหมายเหตุ กรุณาไม่คัดลอกเลขลำดับหรือประเภทงาน"
    : "คอลัมน์หมายเหตุวางได้ครั้งละ 1 คอลัมน์");
  if (values.some((row) => row.some((value, index) => value.length > (columns[index] === "name" ? 300 : 2000)))) {
    throw new Error("ชื่อรายการต้องไม่เกิน 300 ตัวอักษร และหมายเหตุต้องไม่เกิน 2,000 ตัวอักษร");
  }
  let next = [...items];
  let lastId = anchorId;
  values.forEach((cells, index) => {
    let targetId = visibleIds[start + index];
    if (!targetId) {
      const added = insertTemplateRow(next, lastId, "sibling", makeId);
      next = added.items;
      targetId = added.id;
    }
    next = next.map((item) => {
      if (item.id !== targetId) return item;
      const changed = { ...item };
      cells.forEach((value, cellIndex) => { changed[columns[cellIndex]] = value; });
      return changed;
    });
    lastId = targetId;
  });
  return checkSize(next);
}
