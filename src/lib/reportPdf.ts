import { createGoogleDocFromHtml, deleteDriveFile, exportGoogleDocToPdf, uploadFile } from "./drive";
import { renderHtmlToPdfBuffer } from "./pdfRenderer";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function createPdfReportFile({
  html,
  documentNo,
  pdfFolderId,
}: {
  html: string;
  documentNo: string;
  pdfFolderId: string;
}) {
  let pdfBuffer: Buffer | null = null;
  let chromeError: unknown;

  try {
    pdfBuffer = await renderHtmlToPdfBuffer(html, documentNo);
  } catch (error) {
    chromeError = error;
    console.warn("Chrome PDF render failed; falling back to Google Drive export:", error);
  }

  if (!pdfBuffer) {
    let sourceDocId = "";
    try {
      const sourceDoc = await createGoogleDocFromHtml(`${documentNo}.source`, html, pdfFolderId);
      sourceDocId = sourceDoc.id || "";
      if (!sourceDocId) throw new Error("Google Drive did not return a source document ID");
      pdfBuffer = await exportGoogleDocToPdf(sourceDocId);
    } catch (driveError) {
      const chromeMessage = chromeError ? getErrorMessage(chromeError) : "not attempted";
      throw new Error(`Failed to create PDF. Chrome: ${chromeMessage}. Google Drive export: ${getErrorMessage(driveError)}`);
    } finally {
      if (sourceDocId) {
        await deleteDriveFile(sourceDocId);
      }
    }
  }

  return await uploadFile(`${documentNo}.pdf`, "application/pdf", pdfBuffer, pdfFolderId);
}
