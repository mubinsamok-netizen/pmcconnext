# Direct PDF uploads for site notes

The authenticated site notes route accepts a JSON POST with
`action: "start_pdf_upload"`, `file_name`, `file_size`, and an optional
`note_id` for subsequent attachments. After checking site access it returns
`note_id` and a Google Drive resumable `upload_url`. Treat the URL as a
temporary credential. The browser sends the original file via PUT.

The existing multipart POST saves the note using `draft_note_id` and one
`pdf_file_id` per completed upload. The server reads Drive metadata to
verify the file's owner, site, note ID, MIME type, and expected size before
writing the note. The response and attachment links keep their existing shape.
Non-PDF files keep the existing multipart flow.

Files live in the site's Drive folder under Site Notes and the note ID.
An interrupted submission can leave an uploaded PDF without a note.
