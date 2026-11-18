export async function postNoteAttachmentAction(endpoint: string, body: Record<string, string | number>) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error || "จัดการไฟล์แนบไม่สำเร็จ");
  return data;
}

export async function uploadNoteFile(endpoint: string, noteId: string, file: File, onProgress: (percent: number) => void) {
  const mimeType = /\.pdf$/i.test(file.name) ? "application/pdf" : file.type || "application/octet-stream";
  const session = await postNoteAttachmentAction(endpoint, {
    action: "start_attachment_upload",
    file_name: file.name,
    file_size: file.size,
    mime_type: mimeType,
    note_id: noteId,
  });
  if (!session.upload_url) throw new Error("เปิดช่องทางอัปโหลดไม่สำเร็จ");

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", session.upload_url);
    xhr.responseType = "json";
    xhr.setRequestHeader("Content-Type", mimeType);
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.floor(event.loaded / event.total * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && typeof xhr.response?.id === "string") {
        resolve(xhr.response.id);
      } else {
        reject(new Error("Google Drive รับไฟล์ไม่สำเร็จ"));
      }
    };
    xhr.onerror = () => reject(new Error("เชื่อมต่อ Google Drive ไม่สำเร็จ"));
    xhr.onabort = () => reject(new Error("การอัปโหลดถูกยกเลิก"));
    xhr.send(file);
  });
}
