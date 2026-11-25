import type { DecisionEvidenceProgress } from "@/lib/directDriveDecisionEvidenceUpload";

export type EvidenceUpload = {
  id: string;
  title: string;
  files: DecisionEvidenceProgress[];
  error?: string;
  retry?: () => void;
};

export function DecisionEvidenceUploadProgress({ uploads }: { uploads: EvidenceUpload[] }) {
  return uploads.map((upload) => (
    <section key={upload.id} className="schedule-screen-only space-y-2 rounded-xl border border-orange-100 bg-orange-50 p-3 text-sm text-orange-900">
      <h3 className="font-semibold">{upload.title}</h3>
      {upload.error ? (
        <>
          <p role="alert">{upload.error}</p>
          {upload.retry && <button type="button" onClick={upload.retry} className="font-bold underline">ลองยืนยันไฟล์เดิมอีกครั้ง</button>}
        </>
      ) : (
        <ul aria-label="ความคืบหน้าอัปโหลดหลักฐานการตัดสินใจ" className="space-y-2">
          {upload.files.map((file, index) => (
            <li key={index}>
              <p className="break-all font-medium">{file.name}</p>
              {file.stage === "upload" ? (
                <>
                  <p>ส่งไป Google Drive {file.percent}%</p>
                  <progress className="w-full" aria-label={file.name} value={file.percent} max={100} />
                </>
              ) : <p role="status">{file.stage === "prepare" ? "กำลังเตรียมไฟล์" : "กำลังยืนยันไฟล์ใน Drive"}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  ));
}
