# Defect photos

The before- and after-repair forms resize images at their original aspect
ratio and encode WebP in the browser. Each batch contains up to four photos.
The existing project-cover encoder limits the longest edge to 2400 pixels
and caps each WebP at 4 MB.

POST `start_photo_uploads` to the site Defect API with `round_id` for
before photos or `item_id` for after photos, and `files: [{ name, size }]`.
The response returns the reserved file ID and resumable URL in input order.
The browser PUTs each WebP directly to Drive and displays its byte progress.

Send `before_photo_ids` with `add_item` or `after_photo_ids` with
`update_item_status`. The API checks Drive metadata and the upload binding
to the site, round, item or before-photo phase, and uploader before saving
the existing Defect photo reference fields. Older clients and customer
acknowledgement retain their existing attachment contract.
