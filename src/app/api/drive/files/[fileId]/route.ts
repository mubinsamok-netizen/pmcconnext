import sharp from "sharp";
import { drive } from "@/lib/google";

const DRIVE_FILE_CACHE_TTL_MS = 60 * 60 * 1000;
const driveFileCache = new Map<string, {
  expiresAt: number;
  mimeType: string;
  buffer: Buffer;
}>();

export async function GET(req: Request, ctx: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await ctx.params;

  if (!fileId) {
    return new Response("Missing file id", { status: 400 });
  }

  const card = new URL(req.url).searchParams.get("thumbnail") === "card";
  const cacheKey = `${fileId}:${card ? "card-v1" : "original"}`;
  try {
    const cached = driveFileCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return new Response(new Uint8Array(cached.buffer), {
        headers: {
          "Content-Type": cached.mimeType,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    const [metadata, media] = await Promise.all([
      drive.files.get({ fileId, fields: "mimeType,name", supportsAllDrives: true }),
      drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" }),
    ]);

    let mimeType = metadata.data.mimeType || "application/octet-stream";
    let buffer: Buffer = Buffer.from(media.data as ArrayBuffer);
    if (card && mimeType.startsWith("image/")) {
      try {
        const thumbnail = await sharp(buffer).rotate().resize({ width: 760, height: 460, fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
        if (thumbnail.length < buffer.length) { buffer = thumbnail; mimeType = "image/webp"; }
      } catch (error) { console.warn("Project cover thumbnail failed; serving original", error); }
    }
    driveFileCache.set(cacheKey, {
      expiresAt: Date.now() + DRIVE_FILE_CACHE_TTL_MS,
      mimeType,
      buffer,
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Failed to read Drive file:", error);
    return new Response("File not found", { status: 404 });
  }
}
