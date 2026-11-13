import sharp from "sharp";
import { uploadFile } from "@/lib/drive";
import { makeProjectCoverPreviewUrl } from "@/lib/projectCover";

const PREVIEW_WARNING = "บันทึกรูปต้นฉบับแล้ว แต่เตรียมรูปย่อไม่สำเร็จ ระบบจะใช้วิธีแสดงรูปเดิม";

type UploadedCover = Awaited<ReturnType<typeof uploadFile>> & { previewFileId?: string; previewUrl?: string; previewWarning?: string };

async function preparePreview(bytes: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(bytes).rotate().resize({ width: 760, height: 460, fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
  } catch { return null; }
}

export async function uploadProjectCoverFiles(file: File, projectId: string, parentId: string): Promise<UploadedCover> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const stamp = Date.now();
  // CPU work overlaps the original upload. Always handle conversion failures, even if the upload fails first.
  const prepared = preparePreview(bytes);
  const original = await uploadFile(`cover-${projectId}-${stamp}-${file.name}`, file.type || "application/octet-stream", bytes, parentId);
  const previewBytes = await prepared;
  if (!original.id || !previewBytes) return { ...original, previewWarning: PREVIEW_WARNING };

  try {
    const basename = file.name.replace(/\.[^.]+$/, "");
    const preview = await uploadFile(`cover-preview-${projectId}-${stamp}-${basename}.webp`, "image/webp", previewBytes, parentId);
    if (!preview.id) return { ...original, previewWarning: PREVIEW_WARNING };
    return { ...original, previewFileId: preview.id, previewUrl: makeProjectCoverPreviewUrl(original.id, preview.id) };
  } catch {
    // A preview/quota failure must not discard a successfully uploaded original or fail project saving.
    console.warn("Project cover preview upload failed; retaining the original cover");
    return { ...original, previewWarning: PREVIEW_WARNING };
  }
}
