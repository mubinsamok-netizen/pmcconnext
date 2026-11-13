# Project cover upload compatibility

## API contract

Existing `POST /api/projects` and `PUT /api/projects` multipart fields are unchanged. `cover` remains the optional image File; all existing project fields and authorization checks remain in place. No database migration is required.

For a new cover upload, the server stores two files in the existing cover upload folder:

- Original: byte-for-byte input, original MIME type, ID retained in `cover_file_id`.
- Display preview: auto-oriented WebP, maximum 760 × 460 pixels, quality 75, without enlargement. Its reference is stored in `cover_url` as `/api/drive/files/{previewId}?coverPreview=1&source={originalId}`.

The original and preview IDs are distinct. No files are deleted. Both files remain visible to the existing all-files listing. Existing upload folder resolution is unchanged.

The successful project response retains its existing shape. If preview conversion or upload fails after the original succeeds, the project is still saved with the original reference and the existing optional `warning` field explains the fallback. Original upload failures retain existing error/quota handling. Updates without a new cover retain existing references.

## Display and downloads

The shared cover resolver prefers the prepared preview only when its source matches the current `cover_file_id`. Site cards, project details and edit previews use this resolver. A failed preview request falls back to the existing original thumbnail path. Changed/cleared original references never reuse a stale generated preview.

Prepared previews use the existing Drive file endpoint without `thumbnail=card`: it fetches only the preview file and returns its already-optimized bytes. It does not fetch or resize the large original. Existing cache and authorization behavior remain unchanged.

Legacy Drive IDs, Drive URLs, supported external URLs and inline images retain their existing read path. No existing images are migrated or rewritten. Original downloads remain available through the original Drive file or `/api/drive/files/{cover_file_id}` without thumbnail parameters.

## Expected impact and limits

New covers shift resizing to upload time, reducing bytes fetched from Drive when a prepared preview is displayed on a cold read. The additional preview upload can add time to saving a cover and consumes additional Drive storage. Existing covers retain the previous on-demand thumbnail behavior. This change does not optimize other image or document uploads.

## Verification

`tests/project-cover-upload.test.cjs` exercises real Sharp conversion with mocked external storage: original preservation, dimensions/format, create/update persistence, failed preview fallback, unchanged metadata-only updates, denied access, stale-reference rejection, and direct preview reads without original download/resizing. Existing cover, site-list, authorization, project-health and backend-read regression suites are also run. These tests do not modify live project data.
