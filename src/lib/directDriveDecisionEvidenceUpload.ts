import { decisionEvidenceMime } from "@/lib/decisionEvidenceUpload";
import { uploadDriveFile } from "@/lib/directDriveNoteUpload";
import { prepareProjectCover } from "@/lib/prepareProjectCover";

export type DecisionEvidenceProgress = {
  name: string;
  stage: "prepare" | "upload" | "confirm";
  percent: number;
};

export type EvidenceUploadSession = { file_id: string; upload_url: string };

export function prepareDecisionEvidence(source: File[]) {
  return Promise.all(source.map(async (file) => {
    const mimeType = decisionEvidenceMime(file.name);
    if (!file.type.startsWith("image/") && mimeType && mimeType !== "image/webp") return file;
    try {
      return await prepareProjectCover(file);
    } catch {
      throw new Error(`เตรียมไฟล์ ${file.name} ไม่สำเร็จ กรุณาเลือกไฟล์ที่เปิดได้`);
    }
  }));
}

export async function uploadDecisionEvidence(
  decisionId: string,
  files: File[],
  post: (body: Record<string, unknown>) => Promise<{ data?: EvidenceUploadSession[] }>,
  progress: (index: number, file: DecisionEvidenceProgress) => void,
  prepared?: EvidenceUploadSession[],
) {
  const data = prepared ?? (await post({
    action: "start_evidence_uploads",
    decision_id: decisionId,
    files: files.map(({ name, size }) => ({ name, size })),
  })).data;
  if (!data || data.length !== files.length || data.some((session) => !session.file_id || !session.upload_url)) {
    throw new Error("เปิดช่องทางอัปโหลดหลักฐานไม่ครบ");
  }
  await Promise.all(files.map(async (file, index) => {
    const mimeType = decisionEvidenceMime(file.name);
    if (!mimeType) throw new Error(`ไฟล์ ${file.name} ไม่รองรับ`);
    progress(index, { name: file.name, stage: "upload", percent: 0 });
    try {
      await uploadDriveFile(data[index].upload_url, file, mimeType, (percent) => {
        progress(index, { name: file.name, stage: "upload", percent });
      });
    } catch {
      // A blocked response can hide a successful upload. Confirm the reserved ID.
    }
    progress(index, { name: file.name, stage: "confirm", percent: 100 });
  }));
  return data.map((session) => session.file_id);
}
