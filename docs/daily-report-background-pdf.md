# Daily report PDF generation

The site Daily Reports form submits the existing multipart endpoint
`POST /api/reports` with `defer_pdf=true`. The endpoint checks project access
and commits the report before responding with the report and blank PDF fields.
Next.js `after` creates the existing month folders and PDF and patches the
saved report with the Drive references. Configured LINE notifications run
after those references are saved. The legacy request without the flag retains
its synchronous PDF response.

The dashboard adds the saved row immediately and polls the existing
`GET /api/reports?project_id=…&view=dashboard` while recent PDF links are
pending. It displays a local status instead of a page overlay. If the link
is absent after 90 seconds, the row offers a manual refresh. Background work
uses the platform's request duration and is not a durable queue.
