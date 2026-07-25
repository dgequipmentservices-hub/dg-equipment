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

When you change the schema, add a **new** migration file rather than editing an
applied one — that keeps this directory an accurate history of the live
database.

### Edge functions (not in this repo)

QuickBooks Online integration runs in two Supabase Edge Functions, deployed
separately:

- `qbo-auth` — OAuth handshake and token refresh
- `qbo-push` — pushes invoices into QBO

`index.html` calls them at `https://<project>.supabase.co/functions/v1/qbo-auth`
and `.../qbo-push`. The QBO client secret lives in the edge function's
environment, never in this repo.

## Offline behavior

- `sw.js` serves the app shell cache-first and revalidates in the background,
  so the app opens with no connection.
- Writes made while offline are queued in IndexedDB (`dg_offline_queue`) and
  replayed automatically on reconnect — see the offline queue block near the
  top of `index.html`.
- Supabase requests are never cached; they go to the network or fail.

## Known issues

Recorded here so they don't get rediscovered:

- **Passwords are hashed with MD5** (`index.html`, `saveUser`). MD5 is not a
  password hash — it's fast and has published collisions. Moving to Supabase
  Auth, or at minimum a salted slow hash, would require a one-time reset of
  existing logins.
- **RLS is a single global switch.** Every table's `session_required` policy
  checks one row: `app_config.session_active = 'true'`. While that flag is on,
  anyone holding the public anon key has full read/write to every table, from
  anywhere. Per-user policies tied to real auth would close this.
- **`app_users` is readable by `anon`** (the `login_select` policy), which
  exposes usernames and password hashes to any unauthenticated caller. Login
  should go through an edge function or Supabase Auth instead of a client-side
  table read.
