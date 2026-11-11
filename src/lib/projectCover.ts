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

export function getProjectCoverSources(project: CoverProject): string[] {
  const sources = [project.cover_file_id, project.cover_url].flatMap((value) => {
    const source = String(value || "").trim();
    if (!source) return [];
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
  return [...new Set(sources)];
}
