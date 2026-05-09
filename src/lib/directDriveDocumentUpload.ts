export type DirectDocumentUploadInput = {
  endpoint: string;
  category: string;
  title: string;
  notes: string;
  file: File;
};

export type DirectDocumentUploadResult = Record<string, string | number | undefined> & {
  document_id: string;
  category?: string;
  title?: string;
  version_number?: string | number;
  file_name?: string;
  mime_type?: string;
  file_size?: string | number;
  drive_file_id?: string;
  drive_url?: string;
  notes?: string;
  uploaded_by_email?: string;
  uploaded_by_name?: string;
};

type UploadSessionPayload = {
  upload_url?: string;
  category?: string;
  title?: string;
  notes?: string;
  version_number?: string;
  file_name?: string;
  stored_name?: string;
  mime_type?: string;
  file_size?: string;
};

type DriveUploadResponse = {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
};

const SERVER_UPLOAD_FALLBACK_LIMIT = 3.75 * 1024 * 1024;

async function readJson(response: Response) {
  return await response.json().catch(() => ({})) as Record<string, unknown>;
}

function payloadError(payload: Record<string, unknown>, fallback: string) {
  return String(payload.error || fallback);
}

async function uploadThroughServer({
  endpoint,
  category,
  title,
  notes,
  file,
}: DirectDocumentUploadInput) {
  if (file.size > SERVER_UPLOAD_FALLBACK_LIMIT) {
    throw new Error("เบราว์เซอร์ส่งไฟล์ตรงไป Google Drive ไม่ได้ และไฟล์นี้ใหญ่เกินทางสำรองของ Vercel กรุณาเปิดโฟลเดอร์ Drive แล้วอัปโหลดไฟล์ใน Drive โดยตรง");
  }

  const formData = new FormData();
  formData.append("category", category);
  formData.append("title", title || file.name);
  formData.append("notes", notes);
  formData.append("file", file);

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });
  const payload = await readJson(response);
  if (!response.ok || payload.error) {
    throw new Error(payloadError(payload, "อัปโหลดไฟล์ผ่านทางสำรองไม่สำเร็จ"));
  }

  return payload.data as DirectDocumentUploadResult;
}

export async function uploadProjectDocumentDirectly({
  endpoint,
  category,
  title,
  notes,
  file,
}: DirectDocumentUploadInput) {
  const sessionResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create_upload_session",
      category,
      title: title || file.name,
      notes,
      file_name: file.name,
      mime_type: file.type || "application/pdf",
      file_size: file.size,
    }),
  });
  const sessionPayload = await readJson(sessionResponse);
  if (!sessionResponse.ok || sessionPayload.error) {
    throw new Error(payloadError(sessionPayload, "สร้างช่องทางอัปโหลดไม่สำเร็จ"));
  }

  const session = (sessionPayload.data || {}) as UploadSessionPayload;
  if (!session.upload_url) {
    throw new Error("Google Drive ไม่ได้ส่ง upload URL กลับมา");
  }

  let uploadResponse: Response;
  try {
    uploadResponse = await fetch(session.upload_url, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || session.mime_type || "application/pdf",
      },
      body: file,
    });
  } catch {
    return uploadThroughServer({ endpoint, category, title, notes, file });
  }

  const driveFile = await uploadResponse.json().catch(() => ({})) as DriveUploadResponse;
  if (!uploadResponse.ok) {
    return uploadThroughServer({ endpoint, category, title, notes, file });
  }

  const completeResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "complete_upload",
      category: session.category || category,
      title: session.title || title || file.name,
      notes: session.notes || notes,
      version_number: session.version_number || "1",
      file_name: session.file_name || file.name,
      mime_type: session.mime_type || driveFile.mimeType || file.type || "application/pdf",
      file_size: session.file_size || driveFile.size || String(file.size),
      drive_file_id: driveFile.id,
      drive_url: driveFile.webViewLink || driveFile.webContentLink,
    }),
  });
  const completePayload = await readJson(completeResponse);
  if (!completeResponse.ok || completePayload.error) {
    throw new Error(payloadError(completePayload, "บันทึก version history ไม่สำเร็จ"));
  }

  return completePayload.data as DirectDocumentUploadResult;
}
