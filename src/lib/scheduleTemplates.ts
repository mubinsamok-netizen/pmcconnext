import type { ScheduleTemplateCategory, ScheduleTemplateTask } from "./scheduleTemplateData";

export type TemplateItem = {
  id: string;
  name: string;
  notes: string;
  parentId: string;
  type: "heading" | "subtask";
};

export type SavedScheduleTemplate = {
  id: string;
  name: string;
  items: TemplateItem[];
};

export class TemplateValidationError extends Error {}

// Keep only reusable structure; dates, progress, assignees and project IDs never travel with a template.
export function validateTemplateItems(input: unknown): TemplateItem[] {
  if (!Array.isArray(input) || !input.length || input.length > 1000) {
    throw new TemplateValidationError("แม่แบบต้องมี 1–1,000 รายการ");
  }
  const items = input.map((value): TemplateItem => {
    if (!value || typeof value !== "object") throw new TemplateValidationError("รูปแบบรายการไม่ถูกต้อง");
    const { id, name, notes = "", parentId = "", type } = value;
    if (typeof id !== "string" || !id.trim() || id.length > 150 ||
        typeof name !== "string" || !name.trim() || name.length > 300 ||
        typeof notes !== "string" || notes.length > 2000 || typeof parentId !== "string" ||
        (type !== "heading" && type !== "subtask")) {
      throw new TemplateValidationError("กรุณากรอกชื่อทุกรายการ (ไม่เกิน 300 ตัวอักษร) และตรวจสอบประเภทงาน");
    }
    return { id, name: name.trim(), notes: notes.trim(), parentId, type };
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  if (byId.size !== items.length) throw new TemplateValidationError("รหัสรายการซ้ำกัน");
  for (const item of items) {
    const visited = new Set([item.id]);
    let parentId = item.parentId;
    while (parentId) {
      const parent = byId.get(parentId);
      if (!parent || parent.type !== "heading" || visited.has(parentId)) {
        throw new TemplateValidationError("โครงสร้างหัวข้อแม่ไม่ถูกต้อง หรือมีการอ้างอิงวนซ้ำ");
      }
      visited.add(parentId);
      parentId = parent.parentId;
    }
  }
  const ordered: TemplateItem[] = [];
  const visit = (parentId: string) => {
    items.filter((item) => item.parentId === parentId).forEach((item) => {
      ordered.push(item);
      visit(item.id);
    });
  };
  visit("");
  return ordered;
}

export function templateStructure(items: TemplateItem[]) {
  const tasks: ScheduleTemplateTask[] = [];
  const categories: ScheduleTemplateCategory[] = [];
  const visit = (item: TemplateItem, wbs: string, root: TemplateItem) => {
    tasks.push({ templateId: item.id, name: item.name, notes: item.notes, parentTemplateId: item.parentId,
      taskType: item.type, order: tasks.length + 1, wbs, categoryId: root.id, categoryName: root.name });
    items.filter((child) => child.parentId === item.id).forEach((child, index) => visit(child, `${wbs}.${index + 1}`, root));
  };
  items.filter((item) => !item.parentId).forEach((root, index) => {
    const before = tasks.length;
    const wbs = `${index + 1}`;
    visit(root, wbs, root);
    categories.push({ id: root.id, name: root.name, wbs, taskCount: tasks.length - before });
  });
  return { tasks, categories };
}

export function removeTemplateBranch(items: TemplateItem[], id: string) {
  const removed = new Set([id]);
  // Also handles draft lists whose parents have not yet been sorted before their children.
  for (let size = -1; size !== removed.size;) {
    size = removed.size;
    items.forEach((item) => { if (removed.has(item.parentId)) removed.add(item.id); });
  }
  return items.filter((item) => !removed.has(item.id));
}

export function projectTemplateItems(tasks: Array<{
  task_id: string; name: string; notes?: string; parent_task_id?: string; task_type?: string;
}>) {
  const parents = new Set(tasks.map((task) => task.parent_task_id).filter(Boolean));
  return tasks.map((task): TemplateItem => ({
    id: task.task_id, name: task.name, notes: task.notes || "", parentId: task.parent_task_id || "",
    type: task.task_type === "heading" || parents.has(task.task_id) ? "heading" : "subtask",
  }));
}

export function encodeTemplateItems(items: TemplateItem[]) {
  const json = JSON.stringify(items.map((item) => [item.id, item.name, item.notes, item.parentId, item.type]));
  if (json.length > 45000) throw new TemplateValidationError("แม่แบบมีข้อมูลมากเกินไป กรุณาแบ่งเป็นแม่แบบย่อยหรือลดหมายเหตุ");
  return json;
}

export function decodeTemplateItems(json: string) {
  const rows: unknown = JSON.parse(json);
  if (!Array.isArray(rows)) throw new TemplateValidationError("ข้อมูลแม่แบบไม่ถูกต้อง");
  return validateTemplateItems(rows.map((row) => {
    if (!Array.isArray(row)) throw new TemplateValidationError("ข้อมูลแม่แบบไม่ถูกต้อง");
    const [id, name, notes, parentId, type] = row;
    return { id, name, notes, parentId, type };
  }));
}
