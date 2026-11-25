# Project details cover and loading

Scope: `/dashboard/sites/[projectId]/details`. UAT remains 1.0.001.

The details page previously treated a nonempty `cover_file_id` as a literal Drive
ID, even when legacy data stored a full share URL. It also requested the original
file rather than the card thumbnail already used by the projects list.

`getProjectCoverSources` normalizes trimmed IDs, Drive `/file/d/` links, `?id=`
links and existing same-origin proxy paths. It requests
`/api/drive/files/<id>?thumbnail=card`, reusing the existing 760x460 maximum WebP
conversion and private one-hour response cache. A real Drive link is recognized by
its hostname; external image URLs with `/d/` in their paths remain external images.
A distinct cover URL can supply a backup if the primary source fails. Duplicate
sources are requested only once. Unsafe or malformed source strings are omitted.

`ProjectDetailsCover` starts the above-the-fold image eagerly with high fetch
priority and asynchronous decoding. The project data does not wait for the image.
It displays a loading placeholder, tries the next source on failure, and shows a
readable error/empty state instead of a broken-image icon when no image is usable.
Duplicate failure events cannot accidentally skip the next source.

The route loading skeleton matches the existing responsive details layout during
navigation. All existing project fields, Maps links and workspace labels remain.
The page still calls the existing authorized `getMasterProject` once; no extra
site-module, Drive listing or progress query is introduced. No session/project
permission checks, shared image API implementation, original downloads, database
schema, stored project data or dependencies are changed.

Validation covers URL normalization, fallback transitions, original detail fields,
smaller thumbnail output, cache reuse and unchanged original-file downloads.
