import { NextResponse } from "next/server";
import { findAllRaw, insertMany } from "@/lib/sheetsCrud";
import { SCHEDULE_TEMPLATE_CATEGORIES, SCHEDULE_TEMPLATE_TASKS, type ScheduleTemplateTask } from "@/lib/scheduleTemplateData";
import { isSupabaseReadEnabled, readWithSheetsFallback } from "@/lib/supabaseRest";
import { getSupabaseTasks } from "@/lib/supabaseReadModel";
import { randomUUID } from "node:crypto";
import { getSiteApiContext } from "@/lib/siteApi";
import { listSavedScheduleTemplates } from "@/lib/scheduleTemplateStore";
import { templateStructure } from "@/lib/scheduleTemplates";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

function filterProjectTasks<T extends Record<string, string | number | undefined>>(tasks: T[], projectId?: string | null) {
  if (!projectId) return tasks;
  return tasks.filter((task) => String(task.project_id || "") === projectId);
}

function makeTaskId(index: number) {
  return `TSK-TPL-${randomUUID()}-${index}`;
}

const CATEGORY_ROOT_ALIASES: Record<string, string[]> = {
  "1-1": ["งานเตรียมการ"],
  "1-2": ["งานโครงสร้าง"],
  "1-3": ["งานโครงหลังคา", "งานโครงสร้างหลังคา"],
  "1-4": ["งานโรงรถ"],
  "1-5": ["งานสถาปัตย์", "งานสถาปัตยกรรม", "งานสถาปัตยกรรมตกแต่ง"],
  "1-6": ["งานระบบไฟฟ้า", "งานระบบไฟฟ้าภายใน"],
  "1-7": ["งานสุขาภิบาล", "งานระบบสุขาภิบาล"],
  "1-8": ["งานรั้ว", "งานรั้วรอบบ้านและรั้วหน้างาน"],
  "1-9": ["งานภูมิทัศน์", "งานปรับภูมิทัศน์ภายนอก และบริเวณ"],
  "1-10": ["งานสี", "งานสี และเก็บความเรียบร้อย"],
  "1-11": ["งานทำความสะอาดและส่งมอบ"],
  "1-12": ["งานส่งมอบบ้าน"],
  "1-13": ["งานระบบปรับอากาศ", "งานระบบปรับอากาศและระบายอากาศ"],
  "1-14": ["งานสระว่ายน้ำ", "งานสระว่ายน้ำชั้น 2"],
  "1-15": ["งานระบบลิฟท์"],
  "1-16": ["งานทางหนีไฟ", "งานทางหนีไฟ / ความปลอดภัย"],
};

function normalizeTaskName(value: unknown) {
  return String(value || "")
    .replace(/\s*\(ถ้ามี\)\s*/g, "")
    .replace(/\s+/g, "")
    .trim()
    .toLocaleLowerCase("th-TH");
}

function getTaskOrderValue(task: Record<string, string | number | undefined>) {
  const value = Number(task.order_index || 0);
  return Number.isFinite(value) ? value : 0;
}

function findExistingTemplateTask(
  existingTasks: Array<Record<string, string | number | undefined>>,
  name: string,
  parentTaskId: string,
) {
  const normalizedName = normalizeTaskName(name);
  return existingTasks.find((task) => (
    String(task.parent_task_id || "") === parentTaskId &&
    normalizeTaskName(task.name) === normalizedName
  ));
}

function findExistingCategoryRoot(
  existingTasks: Array<Record<string, string | number | undefined>>,
  categoryId: string,
  categoryName: string,
) {
  const aliases = new Set(
    [...(CATEGORY_ROOT_ALIASES[categoryId] || []), categoryName].map(normalizeTaskName),
  );

  return existingTasks.find((task) => (
    !String(task.parent_task_id || "") &&
    (aliases.has(normalizeTaskName(task.name)) || aliases.has(normalizeTaskName(task.category)))
  ));
}

export async function GET() {
  return NextResponse.json({
    success: true,
    data: SCHEDULE_TEMPLATE_CATEGORIES,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const projectId = String(body.project_id || "").trim();
    if (!projectId) return NextResponse.json({ error: "Missing project_id" }, { status: 400 });
    const context = await getSiteApiContext(projectId);
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });

    const templateId = String(body.template_id || "builtin");
    let categories = [...SCHEDULE_TEMPLATE_CATEGORIES] as Array<{ id: string }>;
    let templateTasks: ScheduleTemplateTask[] = [...SCHEDULE_TEMPLATE_TASKS];
    if (templateId !== "builtin") {
      const saved = (await listSavedScheduleTemplates()).find((template) => template.id === templateId);
      if (!saved) return NextResponse.json({ error: "ไม่พบแม่แบบที่เลือก" }, { status: 404 });
      const structure = templateStructure(saved.items);
      categories = structure.categories;
      templateTasks = structure.tasks;
    }
    const importAllCategories = body.import_all === true;
    const selectedCategoryIds: string[] = importAllCategories
      ? categories.map((category) => category.id)
      : Array.isArray(body.category_ids)
        ? body.category_ids.map((categoryId: unknown) => {
          const id = String(categoryId);
          // The library identifies groups by their root item; retain legacy category IDs too.
          return templateId === "builtin"
            ? templateTasks.find((task) => !task.parentTemplateId && task.templateId === id)?.categoryId || id
            : id;
        })
        : [];

    if (selectedCategoryIds.length === 0) {
      return NextResponse.json({ error: "Select at least one template category" }, { status: 400 });
    }

    const categoryIdSet = new Set<string>(categories.map((category) => category.id));
    const validCategoryIds = [...new Set(selectedCategoryIds.filter((categoryId: string) => categoryIdSet.has(categoryId)))];

    if (validCategoryIds.length === 0) {
      return NextResponse.json({ error: "No valid template categories selected" }, { status: 400 });
    }

    const sheetId = context.siteSheetId;

    const readSheetsTasks = async () => filterProjectTasks(await findAllRaw("Tasks", sheetId), projectId);
    const existingTasks = isSupabaseReadEnabled("site")
      ? await readWithSheetsFallback("tasks", () => getSupabaseTasks(projectId), readSheetsTasks)
      : await readSheetsTasks();

    const selected = templateTasks
      .filter((task) => validCategoryIds.includes(task.categoryId))
      .sort((a, b) => a.order - b.order);
    const templateIdToTaskId = new Map<string, string>();
    const reusedTaskIds = new Set<string>();
    const taskRows: Array<Record<string, string>> = [];
    let reusedCount = 0;
    let generatedIdIndex = 0;
    let appendOrder = Math.max(0, ...existingTasks.map(getTaskOrderValue));

    for (const categoryId of validCategoryIds) {
      const categoryTasks = selected.filter((task) => task.categoryId === categoryId);
      const rootTemplate = categoryTasks.find((task) => !task.parentTemplateId);
      if (!rootTemplate) continue;

      const availableRoots = existingTasks.filter((task) => !reusedTaskIds.has(String(task.task_id)));
      const existingRoot = templateId === "builtin"
        ? findExistingCategoryRoot(availableRoots, categoryId, rootTemplate.categoryName)
        : findExistingTemplateTask(availableRoots, rootTemplate.name, "");
      const rootBaseOrder = existingRoot ? getTaskOrderValue(existingRoot) : appendOrder + 1;
      let categoryInsertIndex = 0;

      for (const task of categoryTasks) {
        const parentTaskId = task.parentTemplateId ? templateIdToTaskId.get(task.parentTemplateId) || "" : "";
        const existingTask = task.templateId === rootTemplate.templateId && existingRoot
          ? existingRoot
          : findExistingTemplateTask(existingTasks.filter((item) => !reusedTaskIds.has(String(item.task_id))), task.name, parentTaskId);

        if (existingTask?.task_id) {
          reusedTaskIds.add(String(existingTask.task_id));
          templateIdToTaskId.set(task.templateId, String(existingTask.task_id));
          reusedCount += 1;
          continue;
        }

        generatedIdIndex += 1;
        categoryInsertIndex += 1;
        const taskId = makeTaskId(generatedIdIndex);
        templateIdToTaskId.set(task.templateId, taskId);
        const orderIndex = existingRoot
          ? rootBaseOrder + (categoryInsertIndex / 10000)
          : rootBaseOrder + categoryInsertIndex - 1;

        taskRows.push({
          task_id: taskId,
          project_id: projectId,
          name: task.name,
          assignee: "",
          start: "",
          end: "",
          status: "To Do",
          percent_done: "0",
          category: task.categoryName,
          duration_days: "",
          priority: "ปกติ",
          notes: task.notes,
          order_index: String(orderIndex),
          task_type: task.taskType,
          parent_task_id: parentTaskId,
          planned_start: "",
          planned_end: "",
        });
      }

      if (!existingRoot) {
        appendOrder = rootBaseOrder + categoryInsertIndex - 1;
      }
    }

    const result = taskRows.length ? await insertMany("Tasks", taskRows, sheetId) : { inserted: [] };
    const insertedTasks = result.inserted.length ? result.inserted : taskRows;

    return NextResponse.json({
      success: true,
      data: insertedTasks,
      count: insertedTasks.length,
      reused_count: reusedCount,
      category_count: validCategoryIds.length,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
