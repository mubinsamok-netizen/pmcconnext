# Project cover storage and PDF attachment limits

Project create and edit use the existing multipart API with an optional
`cover` file. The browser creates a WebP with the longest side at most
2400 pixels without changing its aspect ratio or enlarging small images.
The browser caps the processed cover at 4 MB. The server checks the file
and stores the WebP in the site's Drive Photos folder, keeping the existing
`cover_file_id` and `cover_url` fields and Drive image display flow.

Attachment requests through Next.js reserve headroom for multipart fields
and JSON/base64 overhead by checking the request before sending it.
Project documents and lifecycle PDFs continue to use direct Drive uploads.
The existing smaller server fallback limit still applies only to fallback.

Previously stored Drive covers and Supabase cover URLs remain readable
through their existing handlers. New Drive uploads need no Supabase secrets.
