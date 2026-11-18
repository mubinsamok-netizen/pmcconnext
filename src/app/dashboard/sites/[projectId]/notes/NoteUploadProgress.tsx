"use client";

export type NoteUploadTask = {
  id: string;
  noteId: string;
  file: File;
  fileId?: string;
  percent: number;
  status: "queued" | "preparing" | "uploading" | "verifying" | "failed";
  error?: string;
};

export function NoteUploadProgress({ tasks, retry }: { tasks: NoteUploadTask[]; retry: (task: NoteUploadTask) => void }) {
  if (!tasks.length) return null;
  return (
    <ul className="mt-3 space-y-2" aria-label="ความคืบหน้าไฟล์แนบ">
      {tasks.map(task => {
        const labels = {
          queued: "รออัปโหลด",
          preparing: "กำลังเตรียมรูป",
          uploading: `กำลังอัปโหลด ${task.percent}%`,
          verifying: "กำลังตรวจสอบไฟล์",
          failed: task.error || "อัปโหลดไม่สำเร็จ",
        };
        return (
          <li key={task.id} className="rounded-lg border border-gray-200 p-2 text-xs">
            <span className="block break-all font-semibold">{task.file.name}</span>
            <span className={task.status === "failed" ? "text-red-700" : "text-gray-600"}>{labels[task.status]}</span>
            {task.status === "uploading" && (
              <progress className="block w-full" max={100} value={task.percent} aria-label={task.file.name} />
            )}
            {task.status === "failed" && (
              <button type="button" data-no-global-loading="true" onClick={() => retry(task)} className="ml-2 font-bold text-orange-700 underline">ลองอีกครั้ง</button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
