# ACP Capacity Warning Build

## Scope
- Add a LIVE-only, Admin-only capacity authority with head-only counts for freelancers, teams, and active Pit Calls.
- Compute the three requested indicators and worst-level overall status using fixed conservative thresholds.
- Add an on-demand compact `PLATFORM CAPACITY · LIVE` block to the Launch page.
- Add one daily, failure-isolated capacity check that sends a single alert to `info@pitcall.net` only on upward state transitions, with server-side state and TEST suppression.
- Replace the obsolete Platform Rules introduction with the exact requested copy.

## Technical approach
- Add a forward-only database migration for LIVE capacity state and a restricted daily check function/job, with explicit grants for any new public table.
- Add a server function protected by the existing Admin auth pattern; it will use privileged server reads scoped explicitly to LIVE and return counts/status only.
- Add a dedicated React Email template and a public internal callback route protected by the existing hook secret, reusing the managed email helper and existing daily scheduling conventions.
- Keep the email recipient fixed in server code, use idempotent transition keys, and only advance notification state after a successful send.
- Add focused boundary and transition tests/helpers without creating LIVE business data; verify build, database behavior, access control, TEST isolation, and the Launch/Platform Rules UI.