# Defect acknowledgement evidence

The site dashboard uses the existing Defect POST endpoint. Send
`start_photo_uploads` with `evidence: "acknowledgement"`, `round_id`, and
`files` containing WebP names and byte sizes. The response supplies a reserved
Drive file ID and an upload URL for each image. PUT the image directly to the
URL, then submit `acknowledge` with the existing acknowledgement fields and
`evidence_file_ids`. The server verifies the files before recording evidence
and locking the round. Legacy requests using `evidence_uploads` remain supported.
