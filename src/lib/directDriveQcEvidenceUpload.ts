import { postNoteAttachmentAction, uploadDriveFile } from "@/lib/directDriveNoteUpload";
import { prepareProjectCover } from "@/lib/prepareProjectCover";

export type QcEvidenceUpload = { file_id: string; upload_url: string };

async function prepareFile(original: File) {
  const file = original.type.startsWith("image/") ? await prepareProjectCover(original) : original;
  const mime = /\.pdf$/i.test(file.name) ? "application/pdf" : file.type || "application/octet-stream";
  return { file, mime };
}

async function openSession(endpoint: string, qcId: string, file: File, mime: string): Promise<QcEvidenceUpload> {
  return postNoteAttachmentAction(endpoint, {
    action: "prepare_evidence", qc_id: qcId, file_name: file.name, mime_type: mime, file_size: file.size,
  });
}

export async function prepareQcEvidence(endpoint: string, qcId: string, original: File) {
  const prepared = await prepareFile(original);
  return { ...prepared, session: await openSession(endpoint, qcId, prepared.file, prepared.mime) };
}

export async function uploadQcEvidence(
  endpoint: string,
  qcId: string,
  original: File,
  pending: QcEvidenceUpload | undefined,
  onSession: (session: QcEvidenceUpload) => void,
  onStatus: (status: string) => void,
  preparation?: ReturnType<typeof prepareQcEvidence>,
) {
  const confirm = (session: QcEvidenceUpload) => postNoteAttachmentAction(endpoint, {
    action: "confirm_evidence", qc_id: qcId, file_id: session.file_id,
  });
  if (pending) {
    onStatus("กำลังตรวจสอบไฟล์ใน Drive");
    const confirmed = await confirm(pending).catch(() => null);
    if (confirmed) return confirmed;
  }
  onStatus("กำลังเตรียมไฟล์");
  const ready = preparation ? await preparation : undefined;
  const { file, mime } = ready ?? await prepareFile(original);
  onStatus("กำลังเปิดช่องทางอัปโหลด");
  const session = pending ?? ready?.session ?? await openSession(endpoint, qcId, file, mime);
  onSession(session);
  try {
    await uploadDriveFile(session.upload_url, file, mime, percent => onStatus(`อัปโหลด ${percent}%`));
  } catch {
    // Drive may have received the file even if the browser could not read its response.
  }
  onStatus("กำลังยืนยันไฟล์ใน Drive");
  return confirm(session);
}
