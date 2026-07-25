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
serve it. The version ships in the `<title>` (currently `v27.20`).

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
| `008a_password_kdf_columns` | Password salt/algo columns (**applied**) |
| `008_auth_hardening` | JWT auth, drops the global session flag (**not applied yet**) |

> **Deployment state:** `app-auth` is deployed and `008a` is applied. `008` is
> **not** applied and must not be until `SUPABASE_JWT_SECRET` is set — see
> below. Until then the app still runs on the old session flag.

### Finishing the auth migration

One manual step is required, because the JWT secret cannot be set through the
management API:

1. Supabase dashboard → **Project Settings → API → JWT Secret**, copy it.
2. **Edge Functions → Secrets** → add `SUPABASE_JWT_SECRET` with that value.
3. Confirm it took:
   `POST /functions/v1/app-auth` with `{"action":"health"}` should return
   `{"ok":true,"jwt_secret_configured":true}`.
4. Apply `20260725_008_auth_hardening.sql`.
5. Everyone signs in again.

Until step 2, `app-auth` detects the missing secret and deliberately falls
back to the old `session_active` flag rather than issuing tokens signed with a
garbage key. Sign-in keeps working; the bypass below stays open. Applying
`008` before step 2 would lock every user out, because it deletes the flag the
fallback depends on.

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

## Known issues

- **`app_role` is not enforced by the database.** Any valid token gets full
  access to the application tables; owner-vs-tech is still an app-layer check.
  Tightening that means per-table policies keyed on the `app_role` claim.
- **Password minimum is 4 characters**, enforced only in the UI and the Edge
  Function's length check.
- **Storage buckets `equipment-photos`, `invoice-photos` and `parts-diagrams`
  are public and listable**, so anyone with the URL can enumerate every file.
  Signed URLs would close this; not addressed here because it needs an upload
  path change too.
