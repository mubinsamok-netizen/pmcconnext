# QC Checklist evidence upload

The dashboard first submits the existing `save` action with checklist fields and no files. It then uses two JSON actions on the same authenticated QC endpoint.

- `prepare_evidence` accepts `qc_id`, `file_name`, `file_size` in bytes and `mime_type`. It returns `file_id` and a short-lived Drive `upload_url`. The browser PUTs the file bytes to that URL.
- `confirm_evidence` accepts `qc_id` and `file_id`. It returns `success` after verifying the uploaded file's owner, size and MIME type and attaching it to the checklist. Confirming an attached ID again returns success.

The browser resizes photos proportionally and encodes them as WebP. PDFs retain their original bytes. Upload status is shown per file. Existing clients that pass `evidence_uploads` on save retain their existing behavior.
