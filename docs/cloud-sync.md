# FocusFlow optional cloud sync

## Architecture and status

FocusFlow remains local-first. Supabase Auth provides email/password accounts and Postgres stores one versioned planner workspace per user. The browser uses only the Supabase project URL and a publishable key (or legacy anon key); no service-role key or database password belongs in this app. The SQL migration at `supabase/migrations/202610280001_user_workspaces.sql` enables row-level security, restricts every operation to `auth.uid() = user_id`, limits each workspace to 4 MiB and bounds the supported top-level collections.

Each device keeps its own local planner. Sync is manual: sign in, review local and cloud copies, then explicitly upload or restore one full copy. Before restoring, FocusFlow downloads a local recovery backup. Before replacing a cloud row, it downloads the previous cloud copy. Revision-based compare-and-swap rejects stale writes/deletes so one device cannot silently overwrite a newer revision. Sync requests use HTTPS, bearer sessions kept in the current tab's `sessionStorage`, and `credentials: omit`. The public project URL/key are saved in this browser's LocalStorage; these are public client settings, not private credentials.

This is not end-to-end encryption. Supabase receives the planner JSON and stores it in its Postgres project. Do not sync highly sensitive records. A same-origin script compromise can access the current tab's planner and sync session. GitHub Pages project sites under the same `github.io` host share an origin, so FocusFlow disables cloud sign-in on `*.github.io` and directs users to the separate Cloudflare Pages hostname. The sync module also rejects auth and data requests from `*.github.io`.

The repository does not contain a Supabase project, database ID, account, SMTP configuration, or private key. Therefore no live cloud sync or two-device sync has been verified yet. A successful sign-in alone is not proof that the migration or sync works.

## Provider choice and current free-plan limits

Supabase is selected because it combines hosted email/password authentication, Postgres, a browser API, and database-enforced row-level security for a static site. Cloudflare D1 is also attractive and Pages Functions can bind to it, but D1 does not itself provide user authentication; adding an identity provider and enforcing ownership would add another service and setup step. Cloudflare Access's published self-hosted-app instructions require a hostname belonging to an active Cloudflare zone, which the project's `pages.dev` hostname does not satisfy. Firebase Firestore has a generous no-cost database quota, but it requires a separate Firebase Auth and Firestore rules setup.

At the time of this brief (2026-10-28), the official Supabase pricing page lists the Free plan as $0 with 50,000 monthly active users, a 500 MB database, 5 GB egress, 5 GB cached egress, 1 GB file storage, and up to two active projects. Free projects pause after one week of inactivity. The default hosted email sender is best-effort and limited to two emails per hour; production-grade confirmation and password recovery may require a separately configured SMTP service, which may have its own cost or limits. Free-plan quotas and policies can change, projects can pause, and the free plan does not promise permanent availability. No billing activation is needed for the documented initial setup; do not upgrade to a paid plan for this project without a separate decision.

Official references:

- [Supabase pricing and plan quotas](https://supabase.com/pricing)
- [Supabase free-project inactivity pausing](https://supabase.com/kb/faqs/platform/free-project-pausing)
- [Supabase email/password authentication and email sending limits](https://supabase.com/docs/guides/auth/passwords)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Cloudflare Pages Functions bindings, including D1](https://developers.cloudflare.com/pages/functions/bindings/)
- [Cloudflare D1 pricing and Free limits](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare Access self-hosted application prerequisites](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
- [Firebase Firestore pricing and free quotas](https://firebase.google.com/docs/firestore/pricing)

## One-time Supabase setup

1. Create a Supabase account and a new Free project. Choose a database password and keep it in your password manager; FocusFlow never needs it. Do not enable billing or choose a paid plan.
2. In Supabase **SQL Editor**, run the complete migration from `supabase/migrations/202610280001_user_workspaces.sql`. Confirm it finishes successfully. This creates the table, row-level security policies, size/shape constraints, and revision timestamp trigger.
3. In **Authentication → Providers**, ensure Email/password is enabled. Keep email confirmation enabled. The built-in sender is currently limited to two emails per hour and is best-effort; use a custom SMTP service only if you choose to configure one and have reviewed its terms/costs.
4. In **Project Settings → API**, copy the **Project URL** and **publishable key** (or legacy `anon` public key). Never copy the `service_role`/secret key or database password into FocusFlow, a source file, GitHub, or chat.
5. Deploy the code containing this sync feature to the static host. On each device/browser, open **Settings → Optional cloud sync**, paste that Project URL and public key, and save. Create an account, confirm its email, then sign in. Each browser needs the same public project settings and account.
6. Export a local JSON backup before the first sync. Select **Review local and cloud copies**. Read the counts and timestamp. Choose **Upload this device** to create/replace the cloud copy, or **Restore cloud copy here** to replace this browser's local planner. FocusFlow downloads a JSON recovery file before a replacement. There is no automatic upload; after editing on another device, review and choose again.

The cloud workspace contains the full supported planner JSON, including task, timetable, note, subject/chapter/topic, exam, revision, session, goal, timer, profile, UI, and settings data. A database row is limited to 4 MiB and the supported arrays are bounded. If it reaches that limit, keep a local backup and reduce data before syncing.

## Sign-out, export, and deletion

Sign-out clears the current tab's saved session and leaves local records and remote records intact. **Download cloud backup** exports the current remote workspace as JSON. **Delete cloud planner data** first downloads an export, then deletes the signed-in user's row only. To delete the Supabase login itself, first export data, then delete the user in Supabase **Authentication → Users**; the foreign key cascades and removes that user's planner row. No client-side admin key or account-deletion endpoint is used.

Supabase Free does not include automatic database backups on the pricing comparison at time of writing. Use FocusFlow's JSON export as the user-controlled recovery copy. Keep additional exports somewhere private; the JSON file is not encrypted.

## Security and operational limits

- The server-side RLS policies bind every selected, inserted, updated, or deleted row to the authenticated JWT's `auth.uid()`. Changing `user_id` in a browser request does not grant access to a different user's row.
- The app validates the project URL against HTTPS `*.supabase.co`, rejects secret/service-role key formats, bounds requests, validates downloaded workspaces through the existing backup parser, and uses revision checks for write/delete conflicts. Postgres also checks the workspace shape, supported version, collection sizes, and byte limit. Detailed validation is repeated in the browser before a downloaded workspace is applied.
- Sync currently uses manual user actions and provider limits; it has no custom server-side request-rate limiter or automatic background sync. This avoids overwriting remote work without a visible conflict choice.
- Password reset is provided by Supabase's hosted email flow; the email sender's current free rate limit may make it unavailable at times. Account recovery still depends on the provider and access to the registered email.
- Planner data and auth sessions remain accessible to scripts running at the same site origin. The Cloudflare Pages site and GitHub Pages site have distinct hosts; sibling `github.io` project sites share a host/origin, receive an in-app warning, and cannot use cloud sync.
- No provider account, migration, end-to-end encryption, two-device sync, production API call, or deployed integration has been configured or verified from this repository-only implementation.
