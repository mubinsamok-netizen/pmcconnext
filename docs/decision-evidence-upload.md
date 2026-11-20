# Schedule decision evidence uploads

The schedule saves or edits the decision first. The background upload
converts images to aspect-ratio-preserving WebP using the project-cover
encoder. PDF, Word and Excel attachments retain their original bytes.

The site customer-decisions route accepts `start_evidence_uploads` with
`decision_id` and `files: [{ name, size }]`. It returns Drive IDs and
resumable URLs in file order. The browser uploads directly to each URL and
shows per-file progress.

`attach_evidence` takes the decision ID and the reserved `file_ids`. It
verifies the association with the project, decision and uploader from
Drive metadata, then updates only the decision's evidence field. Repeating
confirmation returns existing evidence without a second transfer. The
legacy save payload remains supported.
