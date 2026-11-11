# Files workspace: complete, progressive Drive listing

## API contract

Endpoint: `/api/sites/{projectId}/drive-files`. All operations retain the existing
session and project authorization checks before cache access. No business data or
Drive files are written by listing or invalidation.

- POST JSON `{action:"page",cursor?:string}` returns
  `{success:true,data:DriveFolderFile[],nextCursor:string|null,complete:boolean}`.
  Omit the cursor to start at the configured project Drive folder; send the returned
  cursor unchanged to continue. Each response lists at most 200 metadata records
  (including folders), using at most three Google requests, with independent folders
  read concurrently. Each Google request targets one folder, preserving its path
  even if returned metadata does not contain `parents`. Every pending folder and Google nextPageToken is carried
  forward. There is no total record cap or folder depth cap. Folder paths are preserved.
- POST without a JSON body expires the authorized folder cache and returns
  `{success:true}`. The subsequent listing request fills the shared 60-second cache.
- Legacy GET retains `{success:true,data:DriveFolderFile[],project}` and adds
  `complete:true`. It reads the complete tree in one response for existing callers,
  including Lifecycle. `?fresh=1` still bypasses the cache. A missing Drive folder
  returns an empty list. The files workspace uses progressive POST requests instead.
- Continuations are compressed and encrypted with AES-256-GCM using a server secret,
  bound to the authorized root and traversal version and expire after one hour. Invalid/expired cursors
  return 400; refreshing starts a new traversal. Authorization failures retain their
  existing status; Drive failures return 500; failed invalidation returns 503.
- Cache entries use a new versioned folder tag (v3) so truncated legacy cache entries are
  not reused. Each page is cached for 60 seconds and shares the invalidation tag.

## Client behavior

Documents and Defect render independently. Drive batches render immediately, while
remaining pages are fetched automatically. Search, folder filters and 20-row UI
pagination use the records already received; the UI explicitly marks counts/search as
incomplete until the final batch. Daily Reports and their nested folders are included.
Drive file IDs are deduplicated, including files already registered as documents.

A failed continuation retains completed batches and offers a retry. Manual refresh
retains the previous list while rebuilding, then replaces it on completion, allowing
removed files to disappear. Project changes do not retain another project's list.
Focus/reconnect events do not restart traversal. A successful existing upload remains
successful while document revalidation and Drive refresh continue in the background.
Upload, preview, opening files, permissions and business-data write paths are unchanged.

## Scope and limitations

Completeness covers API-accessible files beneath the project's configured Drive root,
including nested Daily Reports folders. It does not enumerate unrelated Drive roots
or follow Drive shortcuts. Google changes during traversal are not a transactionally
consistent snapshot; refresh to reconcile concurrent changes. Very large trees require
more batches and legacy GET callers still wait for the full tree. Per-request bounds
reduce work before rendering, not the total Google work necessary to enumerate all files.

## Validation

Synthetic traversal tests include 1,235 files, a Daily Report eight nested folders
below its category, real nextPageToken handling, per-page budgets, empty folders,
cycles, missing parent metadata, single-folder query compatibility, continuation
tampering, expiry, root binding and retry after a Drive error.
API tests preserve authorization and legacy invalidation behavior. Render tests cover
independent documents/Defect and sites without Drive. Browser QA uses only synthetic
endpoints with the real FilesWorkspace and SWR hook; no live records are modified.
