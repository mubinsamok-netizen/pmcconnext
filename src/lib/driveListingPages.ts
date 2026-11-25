import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import { unstable_cache } from "next/cache";
import { drive } from "./google";
import type { DriveFolderFile } from "./drive";
import { driveFilesCacheTag } from "./driveFilesCache";

type Parent = { id: string; path: string[]; ancestors: string[] };
type Job = { parents: Parent[]; pageToken?: string };
type Continuation = { version: 2; root: string; jobs: Job[]; expires: number };
export type DriveListingPage = { data: DriveFolderFile[]; nextCursor: string | null; complete: boolean };
const FOLDER = "application/vnd.google-apps.folder";
const PAGE_RECORDS = 200;
const REQUESTS_PER_PAGE = 3;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function key() {
  const secret = process.env.NEXTAUTH_SECRET || process.env.GOOGLE_PRIVATE_KEY;
  if (!secret) throw new Error("Drive pagination requires a server signing secret");
  return createHash("sha256").update(secret).digest();
}

function encode(state: Continuation) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(deflateSync(JSON.stringify(state))), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function decode(cursor: string, root: string): Continuation {
  try {
    if (cursor.length > 1_000_000) throw new Error("Oversized cursor");
    const bytes = Buffer.from(cursor, "base64url");
    const cipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28));
    const raw = Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]);
    const state = JSON.parse(inflateSync(raw, { maxOutputLength: 8_000_000 }).toString()) as Continuation;
    if (state.version !== 2 || state.root !== root || state.expires < Date.now() || !Array.isArray(state.jobs)) throw new Error("Invalid cursor");
    return state;
  } catch {
    throw new Error("Invalid or expired Drive cursor; refresh the listing");
  }
}

async function readPage(root: string, cursor?: string): Promise<DriveListingPage> {
  const state = cursor ? decode(cursor, root) : {
    version: 2 as const, root, jobs: [{ parents: [{ id: root, path: [], ancestors: [root] }] }] as Job[], expires: 0,
  };
  const data: DriveFolderFile[] = [];
  let requests = 0;
  while (state.jobs.length && data.length < PAGE_RECORDS && requests < REQUESTS_PER_PAGE) {
    const slots = Math.min(REQUESTS_PER_PAGE - requests, state.jobs.length, PAGE_RECORDS - data.length);
    const jobs = state.jobs.splice(0, slots);
    const pageSize = Math.floor((PAGE_RECORDS - data.length) / slots);
    const results = await Promise.all(jobs.map(async (job) => {
      const q = job.parents.map(({ id }) => `'${id.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' in parents`).join(" or ");
      const response = await drive.files.list({
        q: `(${q}) and trashed = false`, pageSize, pageToken: job.pageToken,
        includeItemsFromAllDrives: true, supportsAllDrives: true, spaces: "drive", orderBy: "folder,name_natural",
        fields: "nextPageToken,files(id,name,mimeType,size,webViewLink,webContentLink,createdTime,modifiedTime,parents)",
      });
      return { job, response };
    }));
    requests += jobs.length;
    for (const { job, response } of results) {
      const children: Parent[] = [];
      for (const file of response.data.files || []) {
        if (!file.id) continue;
        const parent = job.parents.find((item) => file.parents?.includes(item.id)) || (job.parents.length === 1 ? job.parents[0] : undefined);
        if (!parent) continue;
        const isFolder = file.mimeType === FOLDER;
        data.push({
          id: file.id, name: file.name || file.id, mimeType: file.mimeType || "application/octet-stream",
          size: file.size || null, webViewLink: file.webViewLink || null, webContentLink: file.webContentLink || null,
          createdTime: file.createdTime || null, modifiedTime: file.modifiedTime || null,
          parents: file.parents || null, folderPath: parent.path.join(" / "), isFolder,
        });
        if (isFolder && !parent.ancestors.includes(file.id)) children.push({
          id: file.id, path: [...parent.path, file.name || file.id], ancestors: [...parent.ancestors, file.id],
        });
      }
      if (response.data.nextPageToken) state.jobs.push({ ...job, pageToken: response.data.nextPageToken });
      // Query each folder separately: its path is known even when Drive omits parents.
      for (const child of children) state.jobs.push({ parents: [child] });
    }
  }
  state.expires = Date.now() + 60 * 60 * 1000;
  const nextCursor = state.jobs.length ? encode(state) : null;
  return { data, nextCursor, complete: nextCursor === null };
}

export function readDriveListingPage(root: string, cursor?: string) {
  // Authenticate continuation before cache lookup; a cursor cannot select another site's folders.
  if (cursor) decode(cursor, root);
  const namespace = [process.env.VERCEL_GIT_COMMIT_REF, process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL].join("|");
  return unstable_cache(() => readPage(root, cursor), ["drive-pages-v2", namespace, root, hash(cursor || "start")], {
    revalidate: 60, tags: [driveFilesCacheTag(root)],
  })();
}
