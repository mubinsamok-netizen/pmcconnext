# Project cover storage

The project create and edit forms convert the cover to WebP before submitting.
They limit the longest side to 2400 px, preserve the aspect ratio, and use a
4 MB file cap to leave room for the multipart form in Vercel.

- `POST /api/projects` and `PUT /api/projects` accept the existing multipart
  fields, including an optional WebP file under `cover`. The server stores the
  picture in the private `project-images` bucket. The project response keeps
  the existing shape and returns the application image URL in `data.cover_url`
  on creation. On edit it persists the same URL in the updated project.
- `GET /api/projects/cover?projectId=…&fileId=…` requires a session and project
  access. Successful responses contain WebP bytes. Existing Drive image IDs
  can still be used if the Storage image is unavailable.
- Preview requires server-side `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` for the project containing the private bucket.
  The browser never receives those credentials.

This rollout covers project covers only. Drive synchronization and PDF staging
are separate work. Retain the referenced Storage objects if rolling back.
