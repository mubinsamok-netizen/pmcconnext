# Project document upload from the all-files page

POST JSON to `/api/sites/{projectId}/documents` with
`action: "create_upload_session"`, `verify_upload: true`, category, title,
notes, file_name, mime_type, and file_size. The server returns the existing
session metadata plus a reserved `drive_file_id`. The browser PUTs the
original PDF to the session URL and reports byte progress.

POST JSON to the same route with `action: "complete_upload"`,
`verify_upload: true`, the original session's metadata (including
version_number), and its reserved drive_file_id. The server verifies the
Drive file, uploader and site binding before recording it. The response
contains the saved document in `data`. If the browser cannot read Drive's
response, confirmation still uses the reserved ID. Status 409 means the
file was not found yet. Retrying confirmation only sends metadata.
The lifecycle form retains its existing request format.

Check `Server-Timing` for project context, version read, folder lookup,
Drive ID reservation, session creation, Drive confirmation, and metadata
write, depending on the request stage. Parallel durations overlap.

The all-files form prepares the session after a short pause once a PDF and
title are present. It sends the PDF only on submit. A prepared session is
reused for up to 30 seconds for the same file and form values. If it fails
before transfer, the submit action opens a fresh session. The server times
session lookup, project reads, site authorization and Sheets schema checks
separately. Folder lookups reuse the same root/category result briefly and
retry once on a missing Drive parent.
