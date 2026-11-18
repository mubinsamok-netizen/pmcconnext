import { createHash, randomUUID } from "node:crypto";
import { uploadFile } from "@/lib/drive";
import sharp from "sharp";
import { PROJECT_COVER_MAX_BYTES, PROJECT_COVER_MAX_EDGE } from "@/lib/prepareProjectCover";

function coverObjectUrl(projectId: string, fileId: string, authenticated = false) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("ยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase Storage");
  const projectKey = createHash("sha256").update(projectId).digest("hex");
  return {
    url: `${url.replace(/\/$/, "")}/storage/v1/object/${authenticated ? "authenticated/" : ""}project-images/${projectKey}/${fileId}.webp`,
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  };
}

export async function readProjectCover(projectId: string, fileId: string) {
  const object = coverObjectUrl(projectId, fileId, true);
  return fetch(object.url, { headers: object.headers, cache: "no-store" });
}

export async function uploadProjectCoverFiles(file: File, projectId: string, parentId: string) {
  if (file.size > PROJECT_COVER_MAX_BYTES) throw new Error("รูปปกมีขนาดเกิน 4 MB หลังแปลง");
  const bytes = Buffer.from(await file.arrayBuffer());
  const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" });
  const metadata = await image.metadata();
  const alreadyPrepared = metadata.format === "webp" && (metadata.pages ?? 1) === 1 &&
    Math.max(metadata.width ?? Infinity, metadata.height ?? Infinity) <= PROJECT_COVER_MAX_EDGE &&
    !metadata.exif && !metadata.xmp && !metadata.iptc;
  const webp = alreadyPrepared ? bytes : await image.rotate().resize({
    width: PROJECT_COVER_MAX_EDGE,
    height: PROJECT_COVER_MAX_EDGE,
    fit: "inside",
    withoutEnlargement: true,
  }).webp({ quality: 90 }).toBuffer();
  if (webp.length > PROJECT_COVER_MAX_BYTES) throw new Error("รูปปกมีขนาดเกิน 4 MB หลังแปลง");

  const fileId = randomUUID();
  const basename = file.name.replace(/\.[^.]+$/, "");
  const uploaded = await uploadFile(`cover-${projectId}-${fileId}-${basename}.webp`, "image/webp", webp, parentId);
  if (!uploaded.id) throw new Error("Google Drive ไม่ได้ส่งรหัสรูปปกกลับมา");
  return uploaded;
}
