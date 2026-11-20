# Schedule decision evidence uploads

The schedule saves or edits the decision first. The background upload
converts images to aspect-ratio-preserving WebP using the project-cover
encoder. PDF, Word and Excel attachments retain their original bytes.

The browser starts preparing WebP when files are selected. A save with
`upload_files: [{ name, size }]` opens Drive sessions in parallel with
the decision write and returns them in `upload_sessions` after the save.
The browser starts the transfer after that response. If preparation in
the save request fails, the browser uses the separate session endpoint.
`Server-Timing` reports the overlapping `decision_save` and
`drive_sessions` phases.

After the first selection, `prepare_evidence_context` can initialize the
authorized server connection to Google while the form is open. It creates
no Drive folders or files. Uploading never depends on this request succeeding.

In Sheets mode, saving with evidence and confirming evidence validate
the headers from the same fresh decision-table read used for the write.
If the table is missing or invalid, only that table is repaired and read
again before proceeding.

The site customer-decisions route accepts `start_evidence_uploads` with
`decision_id` and `files: [{ name, size }]`. It returns Drive IDs and
resumable URLs in file order. The browser uploads directly to each URL and
shows per-file progress.

`attach_evidence` takes the decision ID and the reserved `file_ids`. It
verifies the association with the project, decision and uploader from
Drive metadata, then updates only the decision's evidence field. Repeating
confirmation returns existing evidence without a second transfer. The
legacy save payload remains supported.
