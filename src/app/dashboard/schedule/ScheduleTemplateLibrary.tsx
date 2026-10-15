"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { FileSpreadsheet, Loader2, Plus, Save, X } from "lucide-react";
import { SCHEDULE_TEMPLATE_TASKS } from "@/lib/scheduleTemplateData";
import { projectTemplateItems, templateStructure, validateTemplateItems,
  type SavedScheduleTemplate, type TemplateItem } from "@/lib/scheduleTemplates";

import ScheduleTemplateGrid from "./ScheduleTemplateGrid";

const standard: SavedScheduleTemplate = {
  id: "builtin", name: "แม่แบบมาตรฐาน",
  items: SCHEDULE_TEMPLATE_TASKS.map((task) => ({ id: task.templateId, name: task.name,
    notes: task.notes, parentId: task.parentTemplateId, type: task.taskType })),
};
const button = "inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50";
const input = "min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900";

async function loadLibrary(url: string) {
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "โหลดแม่แบบไม่สำเร็จ");
  return json as { data: SavedScheduleTemplate[] };
}

export default function ScheduleTemplateLibrary({ projectName, projectTasks, importing, onClose, onImport }: {
  projectName: string;
  projectTasks: Parameters<typeof projectTemplateItems>[0];
  importing: boolean;
  onClose: () => void;
  onImport: (templateId: string, categoryIds: string[]) => Promise<boolean>;
}) {
  const { data, error, isLoading, mutate } = useSWR("/api/schedule-templates", loadLibrary);
  const [selectedId, setSelectedId] = useState("builtin");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [draft, setDraft] = useState<TemplateItem[] | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [discardAction, setDiscardAction] = useState<"close" | "cancel" | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const templates = useMemo(() => [standard, ...(data?.data || [])], [data]);
  const selected = templates.find((template) => template.id === selectedId) || standard;
  const structure = useMemo(() => templateStructure(draft || selected.items), [draft, selected]);
  const busy = saving || importing;
  const selectedCount = structure.categories.filter((category) => selectedCategories.includes(category.id))
    .reduce((sum, category) => sum + category.taskCount, 0);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  function close() {
    if (busy) return;
    if (discardAction) { setDiscardAction(null); return; }
    if (draft) setDiscardAction("close");
    else onClose();
  }

  function beginEdit(items: TemplateItem[], title: string) {
    setDraft(items.map((item) => ({ ...item })));
    setName(title);
    setMessage("");
  }

  async function save() {
    if (!draft || busy) return;
    setMessage("");
    setSaving(true);
    try {
      const items = validateTemplateItems(draft);
      const response = await fetch("/api/schedule-templates", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, items }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "บันทึกแม่แบบไม่สำเร็จ");
      const saved = json.data as SavedScheduleTemplate;
      await mutate((current) => ({ data: [saved, ...(current?.data || [])] }), { revalidate: false });
      setSelectedId(saved.id);
      setSelectedCategories(templateStructure(saved.items).categories.map((category) => category.id));
      setDraft(null);
      setMessage(`บันทึกแม่แบบ “${saved.name}” แล้ว เลือกใช้กับโครงการได้ทันที`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "บันทึกแม่แบบไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); close(); }}
      aria-labelledby="template-library-title"
      className={`schedule-screen-only m-auto w-[calc(100%_-_1rem)] max-h-[94dvh] rounded-xl bg-white p-0 text-gray-900 shadow-2xl backdrop:bg-black/40 ${draft ? "max-w-[1440px] h-[94dvh]" : "max-w-4xl"}`}>
      <div className={`flex max-h-[94dvh] flex-col ${draft ? "h-full" : ""}`}>
        <header inert={Boolean(discardAction)} className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 p-5">
          <div>
            <h3 id="template-library-title" className="text-lg font-bold">{draft ? "ปรับแต่งแม่แบบแผนงาน" : "แม่แบบแผนงาน"}</h3>
            <p className="mt-1 text-sm text-gray-500">{draft ? "เปิดรายการเดิมมาแก้เฉพาะที่ต้องการ แล้วบันทึกเป็นแม่แบบใหม่ไว้ใช้กับทุกโครงการ" : `เลือกแม่แบบสำหรับ ${projectName}`}</p>
          </div>
          <button type="button" onClick={close} disabled={busy} aria-label="ปิดคลังแม่แบบ" className={button}><X size={18} /></button>
        </header>
        <div inert={Boolean(discardAction)} className={`min-h-0 flex-1 ${draft ? "flex flex-col overflow-hidden" : "overflow-y-auto p-5"}`}>
          {message && <p role="status" className="shrink-0 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
          {!draft ? (
            <>
              <label className="block text-sm font-semibold">เลือกแม่แบบ
                <select value={selectedId} disabled={busy} onChange={(event) => {
                  setSelectedId(event.target.value); setSelectedCategories([]); setMessage("");
                }} className={`${input} mt-2 w-full`}>
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </label>
              {isLoading && <p role="status" className="mt-2 text-sm text-gray-500">กำลังโหลดแม่แบบที่บันทึกไว้…</p>}
              {error && <div role="alert" className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                โหลดแม่แบบที่บันทึกไว้ไม่สำเร็จ <button type="button" className="underline" onClick={() => void mutate().catch(() => undefined)}>ลองใหม่</button>
              </div>}
              <div className="my-4 flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => beginEdit(selected.items, `${selected.name} (ปรับปรุง)`)} className={button}>เปิดตารางเพื่อปรับแม่แบบ</button>
                <button type="button" disabled={busy || !projectTasks.length} onClick={() => beginEdit(projectTemplateItems(projectTasks), `แผนงาน ${projectName}`)} className={button}>
                  <Save size={16} /> บันทึกแผนงานปัจจุบันเป็นแม่แบบ
                </button>
                <button type="button" disabled={busy} onClick={() => beginEdit([], "")} className={button}><Plus size={16} /> สร้างแม่แบบเปล่า</button>
              </div>
              <p className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">เลือกหมวดที่จะนำเข้า ระบบจะเติมรายการที่ขาดและคงข้อมูลของงานเดิมไว้</p>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button type="button" disabled={busy} className={button} onClick={() => setSelectedCategories(structure.categories.map((category) => category.id))}>เลือกทั้งหมด</button>
                <button type="button" disabled={busy} className={button} onClick={() => setSelectedCategories([])}>ล้างที่เลือก</button>
                <span className="text-sm text-gray-500">{selectedCategories.length} หมวด · {selectedCount} รายการ</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {structure.categories.map((category) => <label key={category.id} className={`flex items-start gap-3 rounded-xl border p-3 ${selectedCategories.includes(category.id) ? "border-orange-300 bg-orange-50" : "border-gray-200"}`}>
                  <input type="checkbox" disabled={busy} checked={selectedCategories.includes(category.id)} className="mt-1" onChange={() => setSelectedCategories((current) => current.includes(category.id) ? current.filter((id) => id !== category.id) : [...current, category.id])} />
                  <span className="min-w-0 text-sm"><strong className="block">{category.wbs} {category.name}</strong><span className="text-gray-500">{category.taskCount} รายการ</span></span>
                </label>)}
              </div>
            </>
          ) : (
            <>
              <div className="flex shrink-0 flex-wrap items-center gap-3 px-5 pb-4">
                <label className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm font-semibold">ชื่อแม่แบบใหม่
                  <input value={name} maxLength={150} disabled={busy} onChange={(event) => setName(event.target.value)} placeholder="เช่น บ้าน 2 ชั้น แบบ A" className={`${input} min-w-[180px] flex-1`} />
                </label>
                <span className="rounded-md bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">ฉบับร่าง · แม่แบบต้นฉบับยังคงเดิม</span>
              </div>
              <ScheduleTemplateGrid items={draft} disabled={busy || Boolean(discardAction)} onChange={setDraft} />
            </>
          )}
        </div>
        <footer inert={Boolean(discardAction)} className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-100 p-4">
          {draft ? <>
            <button type="button" disabled={busy} onClick={() => setDiscardAction("cancel")} className={button}>กลับไปเลือกแม่แบบ</button>
            <button type="button" disabled={busy || !name.trim() || !draft.length} onClick={save} className={`${button} border-orange-600 bg-orange-600 !text-white hover:bg-orange-700`}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {saving ? "กำลังบันทึก…" : "บันทึกเป็นแม่แบบใหม่"}
            </button>
          </> : <>
            <button type="button" disabled={busy} onClick={close} className={button}>ปิด</button>
            <button type="button" disabled={busy || !selectedCategories.length} onClick={async () => { if (await onImport(selectedId, selectedCategories)) onClose(); else setMessage("นำเข้าแม่แบบไม่สำเร็จ กรุณาลองใหม่"); }} className={`${button} border-orange-600 bg-orange-600 !text-white hover:bg-orange-700`}>
              {importing ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />} เติมโครงสร้างแผนงาน
            </button>
          </>}
        </footer>
        {/* Render confirmations inside the native dialog's top layer. */}
        {discardAction && <div className="absolute inset-0 z-10 grid place-items-center bg-black/40 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="template-confirm-title" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h4 id="template-confirm-title" className="font-bold">ออกโดยไม่บันทึก?</h4>
            <p className="my-3 text-sm text-gray-600">การปรับแต่งร่างแม่แบบนี้จะไม่ถูกบันทึก</p>
            <div className="flex justify-end gap-2">
              <button autoFocus type="button" className={button} onClick={() => { setDiscardAction(null); }}>ยกเลิก</button>
              <button type="button" className={`${button} bg-red-600 !text-white hover:bg-red-700`} onClick={() => {
                if (discardAction === "close") onClose();
                else { setDraft(null); setDiscardAction(null); setMessage(""); }
              }}>ยืนยัน</button>
            </div>
          </div>
        </div>}
      </div>
    </dialog>
  );
}
