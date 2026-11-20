export const DECISION_EVIDENCE_MAX_FILES = 10;
export const DECISION_EVIDENCE_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const DECISION_EVIDENCE_MAX_TOTAL_SIZE = 25 * 1024 * 1024;

const evidenceTypes: Record<string, string> = {
  webp: "image/webp",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function decisionEvidenceMime(name: string) {
  const extension = name.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();
  return extension && Object.hasOwn(evidenceTypes, extension) ? evidenceTypes[extension] : undefined;
}
