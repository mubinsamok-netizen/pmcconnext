import { postNoteAttachmentAction, uploadDriveFile } from "@/lib/directDriveNoteUpload";
import { prepareProjectCover } from "@/lib/prepareProjectCover";

export type QcEvidenceUpload = { file_id: string; upload_url: string };

export async function uploadQcEvidence(
  endpoint: string,
  qcId: string,
  original: File,
  pending: QcEvidenceUpload | undefined,
  onSession: (session: QcEvidenceUpload) => void,
  onStatus: (status: string) => void,
) {
  const confirm = (session: QcEvidenceUpload) => postNoteAttachmentAction(endpoint, {
    action: "confirm_evidence", qc_id: qcId, file_id: session.file_id,
  });
  if (pending) {
    onStatus("กำลังตรวจสอบไฟล์ใน Drive");
    if (await confirm(pending).then(() => true, () => false)) return;
  }
  onStatus("กำลังเตรียมไฟล์");
  const file = original.type.startsWith("image/") ? await prepareProjectCover(original) : original;
  const mime = /\.pdf$/i.test(file.name) ? "application/pdf" : file.type || "application/octet-stream";
  onStatus("กำลังเปิดช่องทางอัปโหลด");
  const session: QcEvidenceUpload = pending ?? await postNoteAttachmentAction(endpoint, {
    action: "prepare_evidence", qc_id: qcId, file_name: file.name, mime_type: mime, file_size: file.size,
  });
  onSession(session);
  try {
    await uploadDriveFile(session.upload_url, file, mime, percent => onStatus(`อัปโหลด ${percent}%`));
  } catch {
    // Drive may have received the file even if the browser could not read its response.
  }
  onStatus("กำลังยืนยันไฟล์ใน Drive");
  await confirm(session);
}
