# Files workspace loading and refresh

## API contract

The existing endpoint is `/api/sites/{projectId}/drive-files`.

- GET keeps `{success:true,data:DriveFolderFile[],project}` and adds optional
  `limitReached:boolean`. A true value means the existing 500-record listing limit
  was reached (folders count toward that limit). It is conservative when exactly
  500 records exist. The UI explains that search/counts cover loaded records and
  links to the existing Drive folder for all files. No Drive folder returns empty
  data as before. `?fresh=1` remains compatible for Lifecycle/other callers.
- POST expires only the authorized project's Drive-list cache and returns
  `{success:true}`. It does not write business data or files, or list Drive contents.
  The workspace awaits this response then issues a normal GET, which fills the
  shared 60-second cache for later readers. This separates invalidation from cache
  fill because same-request expiration also invalidates a newly filled entry.
- Both methods use the existing site context/session/project authorization checks.
  Existing 401/403/context errors are retained. Failed cache expiration returns 503;
  other failures return 500 with `{error:string}`.

## Read budget and compatibility

The existing recursive listing retains its depth, result shape and folder-walk output
ordering. Each traversal level lists parent groups in waves. A wave reserves a page
size per request whose combined budget cannot exceed the remaining record limit.
Google nextPageTokens are queued and followed while budget remains. Concurrency
remains bounded at five, and existing callers keep their options.

This is a bounded version of the existing combined listing, not a new folder-browser
or server-side UI pagination mode. Search, category/photo-folder filters and 20-item
client pagination continue using the combined loaded records. Very large sites can
still reach the pre-existing 500-record/depth-four limits; the UI now makes the record
limit visible rather than implying completeness. A dense synthetic fixture decreased
metadata reads from 2,600 to 500, and API calls from six to five, for 500 returned rows.
This is a workload comparison, not a measured live latency guarantee.

## Independent sources and uploads

Documents, Defect and Drive retain separate loading/error statuses. Any available
matching rows render immediately; an empty filtered view shows loading only when its
relevant source is still pending. Sites without a Drive folder do not request its list.
The Drive status describes manual refresh rather than claiming automatic minute polling.
A failed refresh preserves the visible list and reports a retryable error.

After the existing direct upload and metadata registration succeed, the uploaded
record is inserted into local SWR data without duplication. Document revalidation and
Drive cache refresh run without holding the successful upload transition/form open.
Refresh failure does not relabel a completed upload as failed. Upload protocols,
permissions, file opening, previews and business-data write paths are unchanged.

## Validation

- Drive tests cover sparse trees, dense trees, true nextPageToken pagination, paths,
  ordering, maxDepth and the combined metadata budget.
- API tests cover authorized GET/POST behavior, forbidden access, missing folders,
  listing-limit metadata and failed expiration.
- Render tests verify documents and Defect independently render with other sources
  pending, and missing Drive folders skip that request.
- An isolated Next.js runtime with synthetic records verifies cache hit -> POST
  invalidation -> GET refill -> subsequent cache hit.
- Browser fixture uses the actual FilesWorkspace, with synthetic endpoints only:
  30-document pagination/search, Defect-first rendering, and a completed PDF upload
  while Drive refresh remains unanswered. Desktop and 390px mobile layouts checked.
