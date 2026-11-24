# QC Checklist evidence upload

The dashboard first submits the existing `save` action with checklist fields and no files. It then uses two JSON actions on the same authenticated QC endpoint.

- `prepare_evidence` accepts `qc_id`, `file_name`, `file_size` in bytes and `mime_type`. It returns `file_id` and a short-lived Drive `upload_url`. The browser PUTs the file bytes to that URL.
- `confirm_evidence` accepts `qc_id` and `file_id`. It returns `success` and the updated checklist in `data` after verifying the uploaded file's owner, size and MIME type and attaching it to the checklist. Confirming an attached ID again returns success.

The browser resizes photos proportionally and encodes them as WebP. PDFs retain their original bytes. Upload status is shown per file. Existing clients that pass `evidence_uploads` on save retain their existing behavior.

The save action also returns the saved checklist in `data`. The dashboard applies both responses to its current list without waiting for a separate refresh.

For the first selected file, the dashboard can convert the file and request its
upload session while the checklist save is in flight. It sends file bytes only
after the save succeeds. In Sheets mode, confirmation validates the QC table
headers and repairs that table if needed before writing.
