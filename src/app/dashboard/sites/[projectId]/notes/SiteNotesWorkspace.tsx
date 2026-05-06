"use client";

import {
  Archive,
  ExternalLink,
  FileUp,
  Image as ImageIcon,
  Paperclip,
  Pin,
  Plus,
  RefreshCw,
  Search,
  StickyNote,
} from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

type Attachment = {
  file_id?: string;
  file_name?: string;
  file_url?: string;
  mime_type?: string;
  file_size?: string | number;
};

type SiteNote = Record<string, string | number | undefined> & {
  note_id: string;
  title?: string;
  body?: string;
  category?: string;
  priority?: string;
  pinned?: string;
  archived?: string;
  follow_up_date?: string;
  linked_module?: string;
  linked_ref?: string;
  attachments_json?: string;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
};

const CATEGORIES = [
  ["all", "ทั้งหมด"],
  ["general", "ทั่วไป"],
  ["vo", "VO"],
  ["defect", "Defect"],
  ["payment", "Payment"],
  ["report", "Daily Report"],
  ["safety", "Safety"],
];

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES);

const PRIORITY_LABELS: Record<string, string> = {
  normal: "ปกติ",
  important: "สำคัญ",
  urgent: "ด่วน",
};

const PRIORITY_STYLES: Record<string, string> = {
  normal: "border-gray-200 bg-gray-50 text-gray-600",
  important: "border-amber-200 bg-amber-50 text-amber-700",
  urgent: "border-red-200 bg-red-50 text-red-700",
};

function parseAttachments(value?: string | number) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed as Attachment[] : [];
  } catch {
    return [] as Attachment[];
  }
}

function formatDate(value?: string | number) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function formatShortDate(value?: string | number) {
  if (!value) return "";
  const date = new Date(`${String(value)}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function isImage(attachment: Attachment) {
  return String(attachment.mime_type || "").startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(String(attachment.file_name || ""));
}

function imageSrc(attachment: Attachment) {
  return attachment.file_id ? `/api/drive/files/${encodeURIComponent(attachment.file_id)}` : attachment.file_url || "";
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
      <StickyNote className="mx-auto text-gray-300" size={34} />
      <h3 className="mt-3 font-bold text-gray-900">ยังไม่มีบันทึก</h3>
      <p className="mt-1 text-sm text-gray-500">เพิ่มบันทึกหน้างานแรกจากฟอร์มด้านซ้าย</p>
    </div>
  );
}

function NoteCard({
  note,
  onTogglePin,
  onArchive,
}: {
  note: SiteNote;
  onTogglePin: (note: SiteNote) => void;
  onArchive: (note: SiteNote) => void;
}) {
  const attachments = parseAttachments(note.attachments_json);
  const images = attachments.filter(isImage).slice(0, 3);
  const priority = String(note.priority || "normal");
  const pinned = String(note.pinned || "") === "TRUE";

  return (
    <article className={`rounded-xl border bg-white p-4 shadow-sm ${pinned ? "border-orange-200 ring-2 ring-orange-50" : "border-gray-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {pinned ? <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-bold text-orange-700"><Pin size={12} /> ปักหมุด</span> : null}
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
              {CATEGORY_LABELS[String(note.category || "general")] || note.category || "ทั่วไป"}
            </span>
            <span className={`rounded-full border px-2 py-1 text-xs font-bold ${PRIORITY_STYLES[priority] || PRIORITY_STYLES.normal}`}>
              {PRIORITY_LABELS[priority] || priority}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-bold text-gray-900">{note.title || "บันทึกหน้างาน"}</h3>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onTogglePin(note)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-orange-600"
            title={pinned ? "เลิกปักหมุด" : "ปักหมุด"}
          >
            <Pin size={16} />
          </button>
          <button
            type="button"
            onClick={() => onArchive(note)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            title="เก็บเข้าคลัง"
          >
            <Archive size={16} />
          </button>
        </div>
      </div>

      {note.body ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{note.body}</p> : null}

      {images.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {images.map((attachment) => (
            <a key={attachment.file_id || attachment.file_name} href={attachment.file_url || imageSrc(attachment)} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageSrc(attachment)} alt={attachment.file_name || "attachment"} className="h-28 w-full object-cover transition group-hover:scale-[1.02]" />
            </a>
          ))}
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <a
              key={attachment.file_id || attachment.file_name}
              href={attachment.file_url || imageSrc(attachment)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-white hover:text-blue-700"
            >
              {isImage(attachment) ? <ImageIcon size={14} /> : <Paperclip size={14} />}
              <span className="truncate">{attachment.file_name || "ไฟล์แนบ"}</span>
              <ExternalLink size={12} />
            </a>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-xs font-semibold text-gray-400">
        <span>{note.created_by_name || "System"}</span>
        <span>{formatDate(note.updated_at || note.created_at)}</span>
        {note.follow_up_date ? <span className="text-orange-600">Follow-up: {formatShortDate(note.follow_up_date)}</span> : null}
        {note.linked_module ? <span>{note.linked_module}{note.linked_ref ? ` / ${note.linked_ref}` : ""}</span> : null}
      </div>
    </article>
  );
}

export function SiteNotesWorkspace({ projectId }: { projectId: string }) {
  const endpoint = `/api/sites/${encodeURIComponent(projectId)}/notes`;
  const { data, error, isLoading, mutate } = useSWR<{ success?: boolean; data?: SiteNote[]; error?: string }>(endpoint, fetcher);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const notes = useMemo(() => data?.data || [], [data?.data]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return notes.filter((note) => {
      const archived = String(note.archived || "") === "TRUE";
      if (archived !== showArchived) return false;
      if (category !== "all" && String(note.category || "general") !== category) return false;
      if (!normalized) return true;
      return [note.title, note.body, note.category, note.priority, note.linked_module, note.linked_ref, note.created_by_name]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [category, notes, query, showArchived]);

  const pinnedCount = notes.filter((note) => String(note.pinned || "") === "TRUE" && String(note.archived || "") !== "TRUE").length;
  const urgentCount = notes.filter((note) => String(note.priority || "") === "urgent" && String(note.archived || "") !== "TRUE").length;
  const activeCount = notes.filter((note) => String(note.archived || "") !== "TRUE").length;
  const attachmentCount = notes.reduce((sum, note) => sum + parseAttachments(note.attachments_json).length, 0);

  function createNote(formData: FormData) {
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch(endpoint, { method: "POST", body: formData });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.error) throw new Error(payload.error || "บันทึกไม่สำเร็จ");
        formRef.current?.reset();
        await mutate();
        setMessage("บันทึกหน้างานเรียบร้อยแล้ว");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  function patchNote(note: SiteNote, patch: Record<string, unknown>) {
    startTransition(async () => {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_note", note_id: note.note_id, ...patch }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.error) throw new Error(payload.error || "อัปเดตไม่สำเร็จ");
        await mutate();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "อัปเดตไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-bold uppercase text-gray-500">บันทึกใช้งาน</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{activeCount}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-bold uppercase text-gray-500">ปักหมุด</div>
          <div className="mt-2 text-2xl font-bold text-orange-600">{pinnedCount}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-bold uppercase text-gray-500">ด่วน</div>
          <div className="mt-2 text-2xl font-bold text-red-600">{urgentCount}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-bold uppercase text-gray-500">ไฟล์แนบ</div>
          <div className="mt-2 text-2xl font-bold text-blue-700">{attachmentCount}</div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <form ref={formRef} action={createNote} className="h-fit rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Plus className="text-orange-600" size={18} />
            <h3 className="font-bold text-gray-900">เพิ่มบันทึก</h3>
          </div>
          <div className="space-y-3">
            <input name="title" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400" placeholder="หัวข้อ เช่น ลูกค้าแจ้งเปลี่ยนวัสดุ" />
            <textarea name="body" className="min-h-36 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm leading-6 outline-none focus:border-orange-400" placeholder="รายละเอียดบันทึกหน้างาน" />
            <div className="grid grid-cols-2 gap-2">
              <select name="category" defaultValue="general" className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400">
                {CATEGORIES.filter(([value]) => value !== "all").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select name="priority" defaultValue="normal" className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400">
                <option value="normal">ปกติ</option>
                <option value="important">สำคัญ</option>
                <option value="urgent">ด่วน</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input name="linked_module" className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400" placeholder="เกี่ยวกับ เช่น VO" />
              <input name="linked_ref" className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400" placeholder="เลขอ้างอิง" />
            </div>
            <input name="follow_up_date" type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50">
              <FileUp size={16} />
              แนบรูป/ไฟล์
              <input name="files" type="file" multiple className="sr-only" />
            </label>
            <label className="flex items-center gap-2 rounded-lg bg-orange-50 px-3 py-2 text-sm font-bold text-orange-700">
              <input name="pinned" type="checkbox" className="h-4 w-4 rounded border-orange-300" />
              ปักหมุดบันทึกนี้
            </label>
            <button disabled={isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60">
              {isPending ? <RefreshCw className="animate-spin" size={16} /> : <Plus size={16} />}
              บันทึก
            </button>
          </div>
        </form>

        <section className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCategory(value)}
                    className={`rounded-lg border px-3 py-2 text-sm font-bold ${category === value ? "border-orange-200 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowArchived((value) => !value)}
                  className={`rounded-lg border px-3 py-2 text-sm font-bold ${showArchived ? "border-gray-700 bg-gray-900 text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                >
                  คลัง
                </button>
              </div>
              <label className="relative min-w-0 lg:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-400"
                  placeholder="ค้นหาบันทึก"
                />
              </label>
            </div>
          </div>

          {message ? (
            <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${message.includes("ไม่") || message.includes("กรุณา") ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
              {message}
            </div>
          ) : null}
          {error || data?.error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {data?.error || "โหลดบันทึกไม่สำเร็จ"}
            </div>
          ) : null}

          {isLoading ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm font-bold text-gray-500">
              <RefreshCw className="mx-auto mb-3 animate-spin text-gray-400" size={24} />
              กำลังโหลดบันทึก
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid gap-3">
              {filtered.map((note) => (
                <NoteCard
                  key={note.note_id}
                  note={note}
                  onTogglePin={(item) => patchNote(item, { pinned: String(item.pinned || "") !== "TRUE" })}
                  onArchive={(item) => patchNote(item, { archived: showArchived ? false : true })}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
