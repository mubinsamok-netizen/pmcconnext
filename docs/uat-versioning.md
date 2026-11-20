# UAT versioning

The login badge, sidebar badge (desktop/mobile) and browser title all use
`UAT_LABEL` from `src/lib/appVersion.ts`. Initial version: `UAT v1.0.000`.

Deploying, building or fixing an issue does not increment this version.
Only after the user explicitly confirms Pass for the deployed version, increment
the final number once (for example `1.0.000` to `1.0.001`), commit and push on
`zoneidea-upgrade-performance`. This increment requires a new deployment;
previous immutable Preview URLs retain their existing version.

Keep at least three digits in the final number. Keep all UI labels and the title
on the shared constant so they cannot drift.

On 2026-11-11 (Asia/Bangkok), the user accepted all five performance improvements
and explicitly requested the increment from `1.0.000` to `1.0.001`.

The user accepted the Site Notes workflow and requested the increment to
`UAT v1.0.002`. Future increments require another user confirmation.

On 2026-11-19 (Asia/Bangkok), the user accepted the Daily Reports workflow
and requested the increment to `UAT v1.0.003`.

The user accepted the Variation Orders workflow and requested the increment to
`UAT v1.0.004`.

The user accepted the Sales CRM workflow and requested the increment to
`UAT v1.0.005`.

The user accepted the Memo page 10 workflow and requested the increment to
`UAT v1.0.006`.

The user accepted the Contractor Database page 6 workflow and requested the
increment to `UAT v1.0.007`.

The user accepted the Variation Orders page 12 workflow and requested the
increment to `UAT v1.0.008`.

The user accepted the Defect page 13 workflow and requested the increment to
`UAT v1.0.009`.

The user accepted the All Photos and Files page 17 upload workflow and requested
the increment to `UAT v1.0.010`.

The user accepted the Lifecycle page 18 PDF upload workflow and requested the
increment to `UAT v1.0.011`.

The user accepted the Defect page 21 photo upload workflow and requested the
increment to `UAT v1.0.012`.
