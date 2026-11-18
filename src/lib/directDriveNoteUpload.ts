import { validateAttachmentRequest } from "@/lib/attachmentUpload";

async function uploadPdf(endpoint: string, file: File, noteId: string) {
  const session = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "start_pdf_upload", file_name: file.name, file_size: file.size, note_id: noteId }),
  });
  const data = await session.json().catch(() => ({}));
  if (!session.ok || !data.upload_url || !data.note_id) {
    throw new Error(data.error || "เปิดช่องทางอัปโหลด PDF ไม่สำเร็จ");
  }

  const uploaded = await fetch(data.upload_url, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: file,
  }).catch(() => {
    throw new Error("เบราว์เซอร์ส่ง PDF ไป Google Drive ไม่สำเร็จ กรุณาลองใหม่");
  });
  const result = await uploaded.json().catch(() => ({}));
  if (!uploaded.ok || !result.id) throw new Error("Google Drive รับไฟล์ PDF ไม่สำเร็จ");
  return { noteId: String(data.note_id), fileId: String(result.id) };
}

export async function prepareNoteAttachments(endpoint: string, formData: FormData) {
  const files = formData.getAll("files").filter((item): item is File => item instanceof File && Boolean(item.name));
  const pdfs = files.filter(file => file.type === "application/pdf" || /\.pdf$/i.test(file.name));
  if (files.length > 8) throw new Error("แนบไฟล์ได้สูงสุด 8 ไฟล์");
  if (!pdfs.length) return formData;
  if (!["title", "body"].some(key => String(formData.get(key) || "").trim())) {
    throw new Error("กรุณากรอกหัวข้อหรือรายละเอียด");
  }
  if (pdfs.some(file => file.size === 0)) throw new Error("ไฟล์ PDF ว่างเปล่า กรุณาเลือกไฟล์ใหม่");
  formData.delete("files");
  files.filter(file => !pdfs.includes(file)).forEach(file => formData.append("files", file));
  validateAttachmentRequest(formData);

  let noteId = "";
  for (const file of pdfs) {
    const result = await uploadPdf(endpoint, file, noteId);
    noteId = result.noteId;
    formData.append("pdf_file_id", result.fileId);
  }
  formData.set("draft_note_id", noteId);
  return formData;
}
