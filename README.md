# DG Equipment Repair & Services

Field-service app for an outdoor power equipment repair shop — work orders,
customers, machines, inventory, invoicing, and QuickBooks Online sync.

Built as a single-file installable PWA so it loads fast on a phone in a truck
and keeps working when signal drops.

## Layout

| File | What it is |
| --- | --- |
| `index.html` | The entire app — markup, styles, and all app logic in one file |
| `sw.js` | Service worker: caches the app shell, backs phone notifications |
| `manifest.json` | PWA manifest (install to home screen) |
| `icon.png` / `icon-512.png` / `apple-touch-icon.png` | App icons |
| `supabase/migrations/` | Database schema, in apply order |

There is no build step. `index.html` is the deployable artifact — edit it and
serve it. The version ships in the `<title>` (currently `v27.27`), and the menu footer
shows the same number — check it to confirm a deploy actually landed.

## Running it

Any static host works, but it must be served over **http/https**, not opened
as a `file://` path — service workers, the manifest, and notifications all
require an origin.

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Backend

Supabase project `ddxjszzceaullxheejnq`, reached directly from the browser via
PostgREST. The Supabase URL and **anon** key are embedded in `index.html` — that
key is meant to be public; Row Level Security is what actually guards the data
(see `supabase/migrations/20260327_006_security_rls.sql`).

### Schema

Migrations live in `supabase/migrations/` and are named so they sort in apply
order. Apply them through the Supabase SQL editor or `supabase db push`.

| Migration | Adds |
| --- | --- |
| `001_initial_schema` | `customers`, `equipment`, `work_orders`, `payments` |
| `002_inventory` | `inventory`, `inventory_transactions`, `parts_on_order`, `vendors` |
| `003_auth_config` | `app_users`, `app_config`, `qbo_tokens` |
| `004_leads_reminders` | `leads`, `maintenance_reminders` |
| `005_indexes_and_cleanup` | Indexes, backfills |
| `006_security_rls` | RLS policies, `is_app_session_valid()` |
| `007_session_backlog_indexes` | Session/backlog indexes |
| `008a_password_kdf_columns` | Password salt/algo columns |
| `008_auth_hardening` | JWT auth, drops the global session flag, storage writes |

All applied. `app-auth` is deployed and `APP_JWT_SECRET` is set.

### Required configuration

`app-auth` needs the project's **legacy JWT secret** (Settings → JWT Keys) set
as a function secret named **`APP_JWT_SECRET`**.

Not `SUPABASE_JWT_SECRET`: Supabase reserves the `SUPABASE_` prefix for the
variables it injects, and the platform does not inject the JWT secret itself.

If that secret is ever lost or cleared, `app-auth` stops issuing tokens and
falls back to setting a `session_active` row that no longer gates anything —
meaning **nobody can read any data**. Check with:

```
POST /functions/v1/app-auth  {"action":"health"}
→ {"ok":true,"jwt_secret_configured":true,"jwt_secret_source":"APP_JWT_SECRET"}
```

Do not rotate the JWT secret casually: it also signs the anon key embedded in
`index.html`, so rotating means rebuilding and redeploying the client.

Note that `001`–`007` had drifted from the live database — policies were added
and renamed by hand outside of migrations. `008` drops every policy in `public`
and rebuilds them, so it converges regardless of what the live state was.

When you change the schema, add a **new** migration file rather than editing an
applied one — that keeps this directory an accurate history of the live
database.

### Edge functions

`supabase/functions/app-auth/` is in this repo — it's the authentication
boundary, so it belongs under review. Deploy with:

```sh
supabase functions deploy app-auth
```

It needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET`
in its environment. The JWT secret must be the project's own, or PostgREST
won't accept the tokens it issues.

The project has other deployed functions not tracked here: `qbo-auth` and
`qbo-push` (QuickBooks OAuth and invoice push), `ai-proxy`, `invoice-jpg`,
`daily-backup`, `load-rotary-xref`, and `app`. Secrets live in their
environments, never in this repo.

## Offline behavior

- `sw.js` serves the app shell cache-first and revalidates in the background,
  so the app opens with no connection.
- Writes made while offline are queued in IndexedDB (`dg_offline_queue`) and
  replayed automatically on reconnect — see the offline queue block near the
  top of `index.html`.
- Supabase requests are never cached; they go to the network or fail.

## Authentication

Sign-in posts the username and password to the `app-auth` Edge Function over
TLS. That function verifies against `app_users` using the service role, then
returns a **JWT signed with the project's JWT secret** (`role=authenticated`,
12-hour expiry, plus an `app_role` claim of `owner` or `tech`). The browser
sends it as `Authorization: Bearer …` on every PostgREST request, and RLS
policies check `authenticated`. No token, no data — `anon` has no table
privileges at all.

Passwords are stored as **PBKDF2-SHA256 with a per-user salt** (210k
iterations). Rows written by the older scheme are plain unsalted SHA-256;
`app-auth` still verifies those, and rewrites the row to PBKDF2 on the next
successful sign-in, so they age out without anyone resetting a password.

Password changes go through `app-auth` (`action: "set_password"`, owner only).
The browser cannot write `password_hash` — migration 008 revokes that column
grant.

### What this replaced

Worth knowing, because the old design looked like security without being any:

Every table's policy called `is_app_session_valid()`, which checked one row —
`app_config.session_active = 'true'`. But `app_config` carried this policy:

```sql
CREATE POLICY write_app_config ON app_config FOR UPDATE TO anon
  USING ((key = 'session_active') OR is_app_session_valid());
```

The anon key is published in `index.html`, so **any caller could set the flag
themselves** and then read or write every "protected" table — customers, work
orders, payments, `app_users`, `qbo_tokens`. The gate opened for exactly the
people it was meant to stop. It was also a single global flag, so one person
signing out revoked database access for everyone still working.

Migration 008 removes the flag, the function, and all anon grants.

### Querying `app_users` from the browser

Migration 008 grants `SELECT`/`INSERT`/`UPDATE` on `app_users` **column by
column**, so password material can't be read through PostgREST. PostgREST
defaults to `select=*`, which asks for the ungranted columns too and fails the
whole request with `42501 permission denied for table app_users` (HTTP 403).

Every `app_users` request from `index.html` must therefore name its columns —
including writes, because `Prefer: return=representation` makes the response a
`RETURNING *`. `APP_USER_COLS` in `index.html` holds the granted set; use it
rather than spelling the columns out again.

### Anything that fires on its own needs a token first

`_getHeaders()` falls back to the anon key when `_sessionToken` is null, and
since migration 008 anon can read nothing — so any request that runs before
sign-in, after sign-out, or before the token is back in memory comes back 401.
The 401 handler reads that as an expired session, which is how background work
ended up signing people out of perfectly good sessions.

Two things make `_sessionToken` null while a valid token sits in `localStorage`:
the browser's **bfcache**, which restores the JS heap as it was snapshotted
(possibly from before sign-in) when you hit back, and **timers that outlive a
sign-out**. Call `_restoreSession()` before any self-triggered request —
timers, `visibilitychange` handlers, retries — rather than assuming
`_sessionToken` is populated.

## Known issues

- **New users can't be created from the app.** `password_hash` is `NOT NULL`
  with no default and `authenticated` holds no grant on it, so the insert in
  "Add User" fails with `23502`. Creating users needs to move into `app-auth`
  (which has the service role and already hashes passwords) as a
  `create_user` action, the way `set_password` works.
- **`app_role` is not enforced by the database.** Any valid token gets full
  access to the application tables; owner-vs-tech is still an app-layer check.
  Tightening that means per-table policies keyed on the `app_role` claim.
- **Password minimum is 4 characters**, enforced only in the UI and the Edge
  Function's length check.
- **Storage buckets `equipment-photos`, `invoice-photos` and `parts-diagrams`
  are public and listable**, so anyone can enumerate every file. Migration 008
  closed anonymous *writes* to these buckets — previously anyone could upload
  to or delete from `parts-diagrams` — but left public reads alone, because
  the app renders photos directly from bucket URLs and revoking reads would
  break that. Closing it properly means switching to signed URLs, which is an
  upload-path change as well.
