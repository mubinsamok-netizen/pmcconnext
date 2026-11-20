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
