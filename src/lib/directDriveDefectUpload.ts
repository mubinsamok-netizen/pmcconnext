import { uploadDriveFile } from "@/lib/directDriveNoteUpload";
import { prepareProjectCover } from "@/lib/prepareProjectCover";

export type DefectPhotoProgress = {
  name: string;
  stage: "prepare" | "upload" | "confirm";
  percent: number;
};

export async function postDefectAction(endpoint: string, body: Record<string, unknown>, quiet: boolean) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(quiet && { "X-PMC-No-Global-Loading": "1" }) },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "บันทึก Defect ไม่สำเร็จ");
  return payload;
}

export async function uploadDefectPhotos(
  endpoint: string,
  target: { round_id: string; evidence?: "acknowledgement" } | { item_id: string },
  files: File[],
  onProgress: (index: number, progress: DefectPhotoProgress) => void,
) {
  const prepared = await Promise.all(files.map(async (file) => {
    try {
      return await prepareProjectCover(file);
    } catch {
      throw new Error(`เตรียมรูป ${file.name} ไม่สำเร็จ กรุณาเลือกไฟล์รูปที่เปิดได้`);
    }
  }));
  const result = await postDefectAction(endpoint, {
    action: "start_photo_uploads",
    ...target,
    files: prepared.map((file) => ({ name: file.name, size: file.size })),
  }, true);
  const sessions = result.data as { file_id: string; upload_url: string }[] | undefined;
  if (!sessions || sessions.length !== files.length || sessions.some((session) => !session.file_id || !session.upload_url)) {
    throw new Error("เปิดช่องทางอัปโหลดรูปไม่ครบ");
  }

  await Promise.all(prepared.map(async (file, index) => {
    onProgress(index, { name: file.name, stage: "upload", percent: 0 });
    try {
      await uploadDriveFile(sessions[index].upload_url, file, file.type, (percent) => {
        onProgress(index, { name: file.name, stage: "upload", percent });
      });
    } catch {
      // Drive can receive the bytes even when the browser cannot read its response.
      // The save endpoint verifies the reserved ID before recording any photo.
    }
    onProgress(index, { name: file.name, stage: "confirm", percent: 100 });
  }));
  return sessions.map((session) => session.file_id);
}
