type CoverProject = { cover_file_id?: string; cover_url?: string };
const isDriveId = (value: string) => /^[a-zA-Z0-9_-]{20,}$/.test(value);

function driveId(value: string) {
  if (isDriveId(value)) return value;
  try {
    const url = new URL(value, "https://project-cover.invalid");
    const driveHost = ["drive.google.com", "docs.google.com", "lh3.googleusercontent.com"].includes(url.hostname);
    const proxy = url.origin === "https://project-cover.invalid" && url.pathname.startsWith("/api/drive/files/");
    if (!driveHost && !proxy) return "";
    const id = proxy ? url.pathname.split("/").pop() || "" : url.pathname.match(/\/d\/([^/]+)/)?.[1] || url.searchParams.get("id") || "";
    const decoded = decodeURIComponent(id);
    return isDriveId(decoded) ? decoded : "";
  } catch { return ""; }
}

export function makeProjectCoverPreviewUrl(originalId: string, previewId: string) {
  return `/api/drive/files/${encodeURIComponent(previewId)}?coverPreview=1&source=${encodeURIComponent(originalId)}`;
}

function storedPreview(source: string) {
  try {
    const url = new URL(source, "https://project-cover.invalid");
    if (url.origin !== "https://project-cover.invalid" || !url.pathname.startsWith("/api/drive/files/") || url.searchParams.get("coverPreview") !== "1") return null;
    return { previewId: driveId(url.pathname), originalId: url.searchParams.get("source") || "" };
  } catch { return null; }
}

export function getProjectCoverSources(project: CoverProject): string[] {
  const savedUrl = String(project.cover_url || "").trim();
  const preview = storedPreview(savedUrl);
  const originalId = driveId(String(project.cover_file_id || "").trim());
  const preferred = preview && preview.previewId && isDriveId(preview.originalId) && preview.originalId === originalId && preview.previewId !== originalId
    ? [makeProjectCoverPreviewUrl(originalId, preview.previewId)] : [];
  const sources = [project.cover_file_id, project.cover_url].flatMap((value) => {
    const source = String(value || "").trim();
    // Never show a stale generated preview after a cover ID has been changed or cleared.
    if (!source || storedPreview(source)) return [];
    const id = driveId(source);
    if (id) return [`/api/drive/files/${encodeURIComponent(id)}?thumbnail=card`];
    if (source.startsWith("/") && !source.startsWith("//")) return [source];
    try {
      const url = new URL(source);
      if (["http:", "https:"].includes(url.protocol)) return [source];
    } catch { /* Invalid legacy values should not create a broken image request. */ }
    if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(source)) return [source];
    return [];
  });
  return [...new Set([...preferred, ...sources])];
}
