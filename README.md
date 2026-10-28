# focusflow_study_planner
Lightweight browser-based Study Planner

FocusFlow is a browser-based, local-first study planner built with vanilla HTML, CSS, and JavaScript ES modules. The planner works without an account or remote service. Optional manual cloud sync can be configured with Supabase; it is not enabled until you provide a project URL/public key, apply the database migration, and sign in.

## Run locally

From this project directory, run:

```powershell
python -m http.server 8001 --bind 127.0.0.1
```

Open `http://127.0.0.1:8001/`. Keep the terminal open while using the app; press Ctrl+C to stop the server. `start-focusflow.bat` starts the same local server when Python is installed. Port 8000 was unavailable in the earlier preview environment; this project uses port 8001. For PWA/service-worker behavior, use localhost or HTTPS; opening the HTML file directly may disable those browser features.

Run the requested automated checks with:

```powershell
node --test tests/*.test.cjs
```

## Features

- Dashboard summaries for tasks, focus time, syllabus completion, goals, revisions, timetable, and upcoming exams; metrics are calculated from saved records.
- Tasks and homework with create/edit/complete/reopen/delete, title search, status, priority, subject and due-date filters.
- Daily, weekly, and monthly timetable with planned break lengths and overlapping-session warning.
- Focus, break, and stopwatch timer; completed focus sessions add actual elapsed time to progress.
- Spaced revision reminders with expanding review intervals.
- Subjects, chapters, topics, and completion tracking for syllabus progress.
- Exam dates and countdowns.
- Notes with links and checklists, saved locally as you edit.
- Progress analytics calculated from recorded sessions, task completion, and syllabus state.
- Daily, weekly, and monthly study goals.
- A rule-based study coach that creates generic prompts and task drafts; it does not verify course facts or use an AI service.
- Light/dark appearance, browser notification preference, JSON export/import, and clearing local planner data.
- Responsive layout, keyboard-operable controls, focus indicators, reduced-motion support, and an installable offline app shell on supported browsers.

## Data, privacy, and backup

IndexedDB is the primary store; LocalStorage is used as a fallback and for small preferences. A prior FocusFlow task list is migrated on first load. By default, data stays in the current browser profile. Browser storage is not encrypted. GitHub Pages project sites under one `github.io` host share a browser origin, so a script on another project site under that host could access this site's browser storage. The app warns on GitHub Pages and disables cloud sign-in there; use the separate Cloudflare Pages origin for optional cloud sync. Avoid entering highly sensitive information on the shared `github.io` origin. Clearing site data, using a different browser profile/device, or uninstalling may remove local data. Export a JSON backup regularly. Import replaces the current planner data after validation and confirmation.

The service worker caches the static application shell so it can reopen offline after its first successful online load. It does not cache planner records or authenticated responses. Local work remains available offline; cloud sync requires a network connection and runs only after explicit opt-in. Notification and wake-lock support depend on browser permission and platform behavior. Interface text is currently English; the language preference is saved for future use but does not translate the interface yet.

## Optional cloud sync

Cloud sync uses Supabase Auth and a Postgres row protected by row-level security. Manual sync requires reviewing the local and cloud copies. After that baseline, you can opt into automatic whole-workspace sync with a debounce, visible-tab polling, bounded retries, conflict pause, and an IndexedDB recovery copy before a remote snapshot is applied. It syncs only while the browser tab is active and connected; it is not end-to-end encrypted or configured in the current production deployment. See [docs/cloud-sync.md](docs/cloud-sync.md) for setup, free-plan limits, deletion, privacy, and recovery details.

## Static HTTPS deployment

The app uses relative asset paths and can be served from a static host, including GitHub Pages. It needs no server-side routes. To deploy, place these project files in an authorized GitHub repository and enable Pages for the chosen branch/folder (or configure the repository’s Pages workflow). A custom domain and public visibility settings are controlled by the repository owner. After publishing, open the HTTPS Pages URL once to install the service worker, then verify a reload and an offline reopen. No public URL exists until a repository is selected and the deployment reports success.

For Cloudflare Pages Git integration, connect this GitHub repository, choose `main` as the production branch, set the build command to `npm run build`, and set the build output directory to `dist`. The build stages only the static application files; no framework or environment variables are required.

## Project files

- `index.html`, `styles.css`, `app.js`: user interface and application behavior.
- `domain.js`: task, revision, and schedule rules.
- `storage.js`: IndexedDB persistence, fallback, and migration.
- `sw.js`, `manifest.webmanifest`, `icon.svg`: offline shell and install metadata.
- `tests/smoke.test.cjs`: dependency-free logic and static shell checks.
