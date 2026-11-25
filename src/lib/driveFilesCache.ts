import { revalidateTag, unstable_cache } from "next/cache";
import { listDriveFolderFiles, type DriveFolderFile } from "./drive";

// Same Data Cache API as projectListCache; Drive listings are slow, so reuse them briefly.
const CACHE_SECONDS = 60;
const LIST_OPTIONS = { recursive: true, maxDepth: Number.POSITIVE_INFINITY, pageSize: 500, maxFiles: Number.POSITIVE_INFINITY };

export function driveFilesCacheTag(folderId: string) {
  return `pmc-drive-files-v3:${process.env.VERCEL_ENV || "local"}:${folderId}`;
}

export function invalidateDriveFilesCache(folderId: string) {
  try {
    revalidateTag(driveFilesCacheTag(folderId), { expire: 0 });
    return true;
  } catch (error) {
    console.error("Drive file cache invalidation failed; entries expire after 60 seconds", error);
    return false;
  }
}

export async function readDriveFolderFiles(folderId: string, fresh = false): Promise<DriveFolderFile[]> {
  const load = () => listDriveFolderFiles(folderId, LIST_OPTIONS);
  if (fresh) {
    // Legacy callers still get a direct, fresh read. The files workspace uses
    // POST invalidation followed by a separate GET to refill the shared cache.
    const files = await load();
    invalidateDriveFilesCache(folderId);
    return files;
  }
  return unstable_cache(load, [driveFilesCacheTag(folderId)], { revalidate: CACHE_SECONDS, tags: [driveFilesCacheTag(folderId)] })();
}
