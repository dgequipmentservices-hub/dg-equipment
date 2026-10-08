# Archived features (removed in v27.80)

These features were taken out of the app in the October 2026 cleanup because
they weren't being used or didn't work out. Their code is kept here so they
can be revisited. **Nothing in this folder is loaded by the app.**

| File | What it was | Why it came out |
| --- | --- | --- |
| `schedule.js` / `.html` | Week calendar of scheduled jobs, town-day blocks | Didn't work out; replaced by the printable day sheet (Jobs → print) |
| `day-plan.js` / `.html` | Stops-and-jobs plan for a day | 4 plans ever, last in April |
| `quick-sale.js` / `.html` | Standalone counter-sale receipt screen | Not used; sales on a work order (+ Sale) still work |
| `parts-diagrams.js` / `.html` | Parts-manual library and diagram parts check | Didn't work out (4 diagrams) |
| `resources.js` / `.html` | Reference notes library | Backlogged — nothing added since April |
| `job-templates.js` / `.html` | Job Templates screen and the "Template" button on a new job | Backlogged. Saved labor templates still fill labor lines from a machine card |

The data these used is still in the database (tables `day_plans`,
`parts_diagrams`, `resources`, `job_templates`). Nothing was deleted.

The complete app exactly as it was before the cleanup (v27.70) is on the
GitHub branch `archive/v27.70-before-revamp`.
