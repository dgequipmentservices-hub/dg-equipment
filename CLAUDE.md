# Working in this repo

## Shipping

`main` is production. GitHub Pages redeploys automatically on every push to it
— a "pages build and deployment" run, about 40 seconds — and that is what the
phones and the shop desktop load. There is no build step: `index.html` is the
deployable artifact.

**Standing instruction from the owner: merge the PR yourself once the work is
finished and checked.** Don't leave a finished branch parked waiting for a
click. Work still goes branch → PR → squash merge (that's what the history
looks like — `Title (#12)`), but the merge is yours to press when the work is
done.

Hold off and ask first only when a change could lose data or lock people out —
a migration that rewrites or drops existing rows, anything touching auth, RLS,
or the JWT secret. Say what the risk is and let the owner decide.

Bump the version on every shipped change, in both places, so a deploy can be
confirmed from the phone:

- `<title>DG Equipment vXX.XX</title>` near the top of `index.html`
- the `BUILD <date> · VXX.XX` stamp in the hamburger menu footer

The owner checks that footer to know whether an update landed. If it still
shows the old number, the app is running the old build — closing and reopening
it is enough, since the service worker serves the shell network-first.

## Database

Supabase project `ddxjszzceaullxheejnq`, reached straight from the browser via
PostgREST. Schema changes go in two steps, both needed:

1. Add a new migration file under `supabase/migrations/` — never edit an
   applied one; that directory is the history of the live database.
2. Apply it to the live project.

Applying it is what makes it real; merging the PR only ships the client. A
column the client writes but the database lacks fails every save, so apply
before the code that needs it goes live.

## Testing

There is no test suite. Before shipping, at minimum:

- Syntax-check the inline scripts (`new Function(...)` over each `<script>`
  block catches a stray brace in a 16,000-line file).
- Exercise changed logic directly — the count and invoice math can be pulled
  into a Node sandbox with stubs for `patch`, `post`, and `document`.
- Render changed UI in headless Chromium (`/opt/pw-browsers/chromium`) when the
  layout matters, and send the screenshot along.

Say plainly what was and wasn't verified. "Not tested against the live app with
a real sign-in" is worth writing down when it's true.
