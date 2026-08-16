# app.ux — working rules

## Database

Migrations live in `scripts/`, numbered `NNN-<slug>.sql`, three digits, applied in order.
A `NNN-ROLLBACK.sql` next to one restores the previous state.

### ⛔ The repo is not the database

A migration file in `scripts/` is a record of intent. It is **not** evidence that the
statement ran, and a commit message saying a migration was or was not applied is not
evidence either.

This has already cost real work. Commits `3310b44` and `c8c8d22` stated that
`scripts/111-conversion-amount-aware.sql` was "NOT applied". It had been applied and was
running in production. Three separate measurement rounds built conclusions on those
messages before anyone queried the database. The full account is in
`scripts/111-CORRECTION-applied-status.md`.

**Before changing any database function, capture what is actually running:**

```sql
select pg_get_functiondef('public.<function>(<argtypes>)'::regprocedure);
```

Build the replacement on that output, not on the newest-looking file in `scripts/`.
Diff the two — if they disagree, the disagreement is the finding, and it comes before
whatever you were sent to do.

### Replacing a function

* `CREATE OR REPLACE` the **whole** function, based on the live body verbatim. Do not
  retype it, do not tidy it, do not "improve" it in passing. Change only the lines the
  task requires and show the diff.
* Every migration carries an install guard that **refuses** rather than half-applies when
  a dependency it does not create is missing.
* The rollback file must restore the definition that was live **at the time of the
  change** — not an older file from `scripts/`. Rolling back through a stale migration
  silently reverts everything applied in between.
* Migrations are run by a human, from the Supabase SQL Editor. Deliver the file; do not
  execute it.

### ⛔ SECURITY DEFINER functions carry a standing obligation

`SECURITY DEFINER` removes RLS from **every** table the function touches, not only the
statement that needed it. Once a function is DEFINER, its own queries are the only tenant
boundary that remains.

**Every query inside such a function must scope itself** — typically
`company_id = p_company_id`, with `p_company_id` validated against
`public.user_company_ids()` first. An unscoped read added later will return other
tenants' rows, nothing will stop it, and the tests will pass.

Functions currently in this position, with the obligation recorded at the top of the file
that defines each body:

| function | body defined in | made DEFINER by |
|---|---|---|
| `finalize_document_with_period_guard` | `scripts/105-finalize-with-period-guard-free-patur-cap.sql` | `scripts/139-finalize-period-guard-security-definer.sql` |
| `finalize_document_with_period_guard_service` | `scripts/107`, `scripts/126` | defined DEFINER |
| `finalize_document_with_usage_guard` | `scripts/047`, `scripts/075` | defined DEFINER |
| `recompute_document_accounting` | `scripts/111-conversion-amount-aware.sql` | defined DEFINER |

`auth.uid()` still identifies the **caller** under `SECURITY DEFINER` — it reads the
request's JWT claim from a GUC, not the session user. Ownership tests and `finalized_by`
keep working as written. Do not "fix" them.

### A migration that runs must be committed

`scripts/139-finalize-period-guard-security-definer.sql` ran in production and existed
only as an untracked file in a git worktree. It took three failed searches to find it.
Code running against production with no source in the repo is the failure mode this
section exists to prevent — commit the file in the same session it is applied, and say in
the commit message that it **has already been applied**, so nobody reads it as pending.

⚠️ Open, unresolved: migration numbers **134** and **135** have no file and no git history
anywhere. A gap is not proof of an orphan, and the repo cannot distinguish "number
skipped" from "ran and was lost".

## Environments

One Supabase database serves every environment. A test through a preview URL writes real
production rows. There is no staging copy.
