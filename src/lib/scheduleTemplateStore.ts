import { findAllMasterRaw, insertMaster } from "./sheetsCrud";
import { ensureMasterSchema } from "./sheetsSetup";
import { isSupabaseBackend, supabaseInsert, supabaseSelect } from "./supabaseRest";
import { getSupabaseMasterSchema } from "./supabaseSchema";
import { decodeTemplateItems, encodeTemplateItems, type SavedScheduleTemplate } from "./scheduleTemplates";

type TemplateRecord = { template_id: string; name: string; items_json: string };

async function ensureSheets() {
  const result = await ensureMasterSchema();
  if (!result.success) throw new Error("เตรียมที่เก็บแม่แบบไม่สำเร็จ กรุณาลองใหม่");
}

// Read and write the same primary store. A temporary database failure must not split the library across backends.
export async function listSavedScheduleTemplates(): Promise<SavedScheduleTemplate[]> {
  let rows: TemplateRecord[];
  if (isSupabaseBackend()) {
    rows = await supabaseSelect<TemplateRecord>("schedule_templates", { order: "created_at.desc" }, { schema: getSupabaseMasterSchema() });
  } else {
    await ensureSheets();
    rows = (await findAllMasterRaw("ScheduleTemplates")) as unknown as TemplateRecord[];
    rows.reverse();
  }
  return rows.map((row) => ({ id: row.template_id, name: row.name, items: decodeTemplateItems(row.items_json) }));
}

export async function saveScheduleTemplate(template: SavedScheduleTemplate, createdBy: string) {
  const row = { template_id: template.id, name: template.name, items_json: encodeTemplateItems(template.items),
    created_by: createdBy, created_at: new Date().toISOString() };
  if (isSupabaseBackend()) {
    await supabaseInsert("schedule_templates", row, { schema: getSupabaseMasterSchema() });
  } else {
    await ensureSheets();
    await insertMaster("ScheduleTemplates", row);
  }
}
