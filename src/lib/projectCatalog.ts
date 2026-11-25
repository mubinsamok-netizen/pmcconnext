import { findAllMaster } from "./sheetsCrud";
import { readCachedProjectList } from "./projectListCache";

// Unfiltered catalog only. Each caller still checks the current user's access.
export function readProjectCatalog() {
  return readCachedProjectList(() => findAllMaster("Projects", undefined, { fresh: true }));
}
