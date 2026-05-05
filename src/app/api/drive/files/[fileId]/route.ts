import { drive } from "@/lib/google";

export async function GET(_req: Request, ctx: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await ctx.params;

  if (!fileId) {
    return new Response("Missing file id", { status: 400 });
  }

  try {
    const [metadata, media] = await Promise.all([
      drive.files.get({ fileId, fields: "mimeType,name", supportsAllDrives: true }),
      drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" }),
    ]);

    const mimeType = metadata.data.mimeType || "application/octet-stream";
    const buffer = Buffer.from(media.data as ArrayBuffer);

    return new Response(buffer, {
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
