# focusflow_study_planner
Lightweight browser-based Study Planner

FocusFlow is a browser-based, local-first study planner built with vanilla HTML, CSS, and JavaScript ES modules. It needs no account, server-side database, API key, build step, or paid service. Your planner records stay in the browser profile on the device where you use the app.

## Run locally

From this project directory, run:

```powershell
python -m http.server 8001 --bind 127.0.0.1
```

Open `http://127.0.0.1:8001/`. Keep the terminal open while using the app; press Ctrl+C to stop the server. `start-focusflow.bat` starts the same local server when Python is installed. Port 8000 was unavailable in the earlier preview environment; this project uses port 8001. For PWA/service-worker behavior, use localhost or HTTPS; opening the HTML file directly may disable those browser features.

Run the requested automated checks with:

```powershell
node --test tests/smoke.test.cjs
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

IndexedDB is the primary store; LocalStorage is used as a fallback and for small preferences. A prior FocusFlow task list is migrated on first load. Data stays in the current browser profile and does not sync across browsers or devices. Browser storage is not encrypted. GitHub Pages project sites under one `github.io` host share a browser origin, so another Pages project on the same account could access this site's browser storage. Avoid entering highly sensitive personal information. Clearing site data, using a different browser profile/device, or uninstalling may remove it. Export a JSON backup regularly. Import replaces the current planner data after validation and confirmation.

The service worker caches the static application shell so it can reopen offline after its first successful online load. It does not cache planner records or provide cloud backup/synchronization. Notification and wake-lock support depend on browser permission and platform behavior. Interface text is currently English; the language preference is saved for future use but does not translate the interface yet.

## Static HTTPS deployment

The app uses relative asset paths and can be served from a static host, including GitHub Pages. It needs no server-side routes. To deploy, place these project files in an authorized GitHub repository and enable Pages for the chosen branch/folder (or configure the repository’s Pages workflow). A custom domain and public visibility settings are controlled by the repository owner. After publishing, open the HTTPS Pages URL once to install the service worker, then verify a reload and an offline reopen. No public URL exists until a repository is selected and the deployment reports success.

For Cloudflare Pages Git integration, connect this GitHub repository, choose `main` as the production branch, set the build command to `npm run build`, and set the build output directory to `dist`. The build stages only the static application files; no framework or environment variables are required.

## Project files

- `index.html`, `styles.css`, `app.js`: user interface and application behavior.
- `domain.js`: task, revision, and schedule rules.
- `storage.js`: IndexedDB persistence, fallback, and migration.
- `sw.js`, `manifest.webmanifest`, `icon.svg`: offline shell and install metadata.
- `tests/smoke.test.cjs`: dependency-free logic and static shell checks.
