# Automatic Drive listing continuation

The files workspace starts its first Drive request after the client has painted the
page. Each next batch also yields a paint, preserving the files already displayed.

- Temporary network failures, HTTP 408/429 and server errors retry automatically,
  at most three requests per batch, with backoff and a bounded Retry-After delay.
- An expired/invalid encrypted continuation triggers at most two automatic listing
  restarts. Existing files stay visible and are deduplicated by Drive ID until the
  replacement listing completes.
- HTTP 401/403 and other non-transient errors are not retried automatically.
- After recovery is exhausted, the error and manual retry remain available. Retrying
  a page reuses successful pages instead of fetching the whole listing again.
- Paint scheduling is cancelled on cleanup. A 250ms fallback allows continuation in
  background tabs where animation frames are paused.

API payloads, site authorization, recursive folder traversal and file limits remain
unchanged. No Drive files or business records are written by this change.

Validation: `node --test tests/drive-listing-loading.test.cjs` exercises paint timing,
backoff, access denial, restart limits, retained files and selective revalidation.
These are offline tests; no real Drive outage is deliberately induced.
