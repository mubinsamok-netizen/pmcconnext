export const PROJECT_COVER_MAX_BYTES = 4_000_000;
export const PROJECT_COVER_MAX_EDGE = 2400;

export async function prepareProjectCover(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("เปิดรูปปกไม่ได้ กรุณาเลือกไฟล์รูปภาพที่ใช้งานได้");
  });

  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("เบราว์เซอร์ไม่สามารถเตรียมรูปปกได้");

    for (const maxEdge of [PROJECT_COVER_MAX_EDGE, 1800, 1200]) {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
      if (!blob || blob.type !== "image/webp") throw new Error("เบราว์เซอร์ไม่สามารถแปลงรูปเป็น WebP ได้");
      if (blob.size <= PROJECT_COVER_MAX_BYTES) {
        return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: blob.type });
      }
    }
    throw new Error("รูปปกยังมีขนาดใหญ่เกินไป กรุณาเลือกรูปอื่น");
  } finally {
    bitmap.close();
  }
}
