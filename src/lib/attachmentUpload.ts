const MAX_REQUEST_BYTES = 4_000_000;
const PDF_SIZE_ERROR = "ไฟล์แนบรวมใหญ่เกิน 4 MB สำหรับฟอร์มนี้ กรุณาลดขนาดไฟล์หรือแบ่งอัปโหลด";

export function validateAttachmentRequest(body: FormData | string) {
  let bytes = 0;
  if (typeof body === "string") {
    bytes = new Blob([body]).size;
  } else {
    for (const [key, value] of body.entries()) {
      bytes += new Blob([key]).size + 512;
      bytes += typeof value === "string" ? new Blob([value]).size : value.size + new Blob([value.name]).size;
    }
  }
  if (bytes > MAX_REQUEST_BYTES) throw new Error(PDF_SIZE_ERROR);
}

export function fetchWithAttachmentLimit(input: RequestInfo | URL, init: RequestInit & { body: FormData | string }) {
  validateAttachmentRequest(init.body);
  return fetch(input, init);
}
