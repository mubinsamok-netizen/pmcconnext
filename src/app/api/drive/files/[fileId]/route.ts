import { drive } from "@/lib/google";

const DRIVE_FILE_CACHE_TTL_MS = 60 * 60 * 1000;
const driveFileCache = new Map<string, {
  expiresAt: number;
  mimeType: string;
  buffer: Buffer;
}>();

export async function GET(_req: Request, ctx: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await ctx.params;

  if (!fileId) {
    return new Response("Missing file id", { status: 400 });
  }

  try {
    const cached = driveFileCache.get(fileId);
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

    const mimeType = metadata.data.mimeType || "application/octet-stream";
    const buffer = Buffer.from(media.data as ArrayBuffer);
    driveFileCache.set(fileId, {
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
