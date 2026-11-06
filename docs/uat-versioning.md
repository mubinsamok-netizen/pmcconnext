# UAT versioning

The login badge, sidebar badge (desktop/mobile) and browser title all use
`UAT_LABEL` from `src/lib/appVersion.ts`. Initial version: `UAT v1.0.000`.

Deploying, building or fixing an issue does not increment this version.
Only after the user explicitly confirms Pass for the deployed version, increment
the final number once (for example `1.0.000` to `1.0.001`), commit and push on
`zoneidea-upgrade-performance`. This increment requires a new deployment;
previous immutable Preview URLs retain their existing version.

Keep at least three digits in the final number. Keep all UI labels and the title
on the shared constant so they cannot drift. No Pass has been confirmed for
`1.0.000` yet.
