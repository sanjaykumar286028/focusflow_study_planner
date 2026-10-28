# FocusFlow improvement log

This log records engineering lessons that should shape future changes. It contains no user data or credentials.

| Observation | Root cause | Prevention used |
| --- | --- | --- |
| A navigation/host security test failed after UI composition changed. | The assertion described the old wrapper implementation rather than the user-visible host guard. | Assert the current security behavior and exact UI condition; rerun the full suite after refactors. |
| An earlier sync cursor was initially project-scoped. | Local browser state can outlive sign-out and be reused by another account on the same device. | Bind the cursor and automatic-sync opt-in to both provider URL and authenticated user ID. |
| A remote update can arrive while a local edit dialog is open. | Form input may be unsaved and therefore absent from the planner snapshot. | Pause and surface a conflict while the editor is open; keep a local recovery snapshot before applying remote data. |
| In-memory and persistent copies can diverge if storage fails during remote apply. | Replacing the live model before confirming IndexedDB persistence changes the current view despite a failed write. | Keep the previous model and restore it if persistence fails; write the recovery snapshot first. |
| A service worker can keep an older shell after code changes. | The shell cache key did not match the implementation revision. | Increment the cache version whenever shell assets or sync behavior changes and update the test expectation. |

## Release discipline

Before each further sync change, predict data-loss, cross-account, retry, and stale-cache risks. After the change, run syntax checks, all tests, static build, artifact checks, and `git diff --check`. Separate code-level results from provider, browser, and production verification; do not call mocked or source-inspection results end-to-end tests.
