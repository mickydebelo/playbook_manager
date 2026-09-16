# Playbook Manager

Production application for authoring, tailoring and delivering digital transformation playbooks.
The UI is the Claude Design prototype in `design/` (source of truth, do not edit); the backend is being built
around it slice by slice. See `docs/01-analysis.md` and `docs/02-architecture.md`.

## Requirements

Node 20.9+ and npm 10+ are all you need to start; see [`requirements.txt`](requirements.txt) for the
full list, including what each optional piece (PostgreSQL, Chrome, APS credentials) unlocks and how it
fails when absent.

## Run locally

```bash
npm install                      # uses the Autodesk Artifactory mirror configured in .npmrc
[ -f .env ] || cp .env.example .env   # only if absent — never overwrite a .env holding real credentials
npm run db:seed                  # dev users, built-in templates, sample playbooks (idempotent)
npm run dev                      # http://localhost:3000 → sign in as a seeded user
```

> `.env` holds real secrets once you add the Autodesk Platform Services keys, and it is git-ignored, so it is the
> only copy. Do not run a bare `cp .env.example .env` against an existing file — it silently wipes them.

No Docker or Postgres install is needed for development: `DATABASE_URL` empty selects an embedded PGlite
database under `.data/pglite` and the same SQL migrations run there and on PostgreSQL.

> **One process at a time.** The embedded database may only be open in one process. Stop `npm run dev`
> before running `db:seed`, `db:migrate`, `worker` or `smoke:ai`, and restart the dev server after adding a
> migration — a running server only has the migrations that existed when it started. Real PostgreSQL has no
> such limit.

Without APS credentials the app still runs: sign-in, editing and export work, retrieval falls back to
keyword search, and the AI steps report that the gateway is not configured rather than failing obscurely.

### Walking the wizard

Sign in as a seeded user, then **New playbook**:

1. **Define brief** — customer, industry, size, objective and focus areas. Everything downstream is
   steered by this, so a specific objective produces a visibly different playbook from a vague one.
2. **Find & trust** — a background job proposes the chapter structure and retrieves candidate sources
   per section. The Preview tab shows the passages that actually matched, with page numbers and scores.
   Select the sources each section should be grounded in.
3. **Edit & create** — drafting runs section by section with a live progress bar; early sections become
   editable while the rest generate, and a mid-draft reload reattaches to the running job. Roughly four
   minutes for eighteen sections. Edits autosave with version history; the assistant answers about the
   open section and can propose a rewrite.
4. **Review & deliver** — the preview is the real rendered document, and **Export** produces Word or PDF
   from the same renderer, so the two cannot drift.

### Getting documents into the library

The **Knowledge library** accepts PDF, Word and PowerPoint up to 100 MB. Upload parses, chunks, embeds
and page-numbers the document in a background job; it appears immediately as `Indexing`, then as
`Unreviewed`. **Only an approved source is retrievable**, so approval is a deliberate curator step:

```bash
curl -X PATCH http://localhost:3000/api/knowledge/<sourceId> \
  -H 'x-requested-with: playbook-manager' -H 'content-type: application/json' \
  -d '{"status":"approved"}'        # cookie from the browser session; curator or admin only
```

A document uploaded with a `customerId` is confidential to that customer: it is proposed for their
playbooks and never for anyone else's, enforced in SQL rather than in the UI. Anyone may bring in a
customer's document; only a curator may add to the shared library.

To ingest from a watched folder instead of uploading, point `INGEST_LOCAL_DIR` at a directory and use
`GET /api/knowledge/connectors/local_folder` to list it and `POST` to the same route with a `fileId`.
SharePoint sits behind the same interface and is wired against Microsoft Graph, but is unverified until
credentials exist.

### Checking it end to end

```bash
npm run typecheck && npm test && npx next build

# a full wizard run against a running server, on its own database so the dev data is untouched
npm run seed:isolated
npm run dev:isolated                                   # port 3100, .data/isolated
BASE=http://localhost:3100 npx tsx scripts/e2e-run.ts  # brief → draft → preview → export → ingest

# what the ingest parsers make of real files, before trusting them with a corpus
npx tsx scripts/parse-probe.ts ~/some/report.pdf ~/some/deck.pptx
```

`scripts/e2e-run.ts` writes the preview HTML and both export files to `.data/e2e/`, and prints the
outline, a sample drafted section and the per-section progress as it goes. Pass `PLAYBOOK=<id>` to reuse
an existing playbook and skip the four minutes of drafting.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | vitest: unit, service (PGlite), API route and component tests |
| `npm run db:generate` | generate a SQL migration from `src/server/db/schema` into `drizzle/` |
| `npm run db:migrate` | apply migrations to the configured database |
| `npm run db:seed` | idempotent seed (core data + the development knowledge corpus, embedded via Titan) |
| `npm run worker` | out-of-process job runner, for `JOBS_MODE=worker` |
| `npm run smoke:ai` | end-to-end check of the AI path against the real gateway (`-- --draft` also drafts a section) |
| `npm run dev:isolated` / `seed:isolated` | a second server and database on port 3100, for smoke runs that must not touch dev data |
| `npx tsx scripts/e2e-run.ts` | drives the whole wizard over the API, writing artifacts to `.data/e2e/` |
| `npx tsx scripts/parse-probe.ts <files>` | reports what the ingest parsers extract from real documents |

## What is real today (vertical slice)

- Sign-in (dev provider locally; OIDC provider implemented for corporate SSO), signed session cookie, roles.
- Step 1 **Define brief** creates a playbook + customer + brief through `POST /api/playbooks` and autosaves
  edits through `PUT /api/playbooks/:id/brief`; advancing steps persists the stage.
- **My playbooks** lists the caller's playbooks from the database with status filters and resumes at the stored stage.
- Templates come from the database; "Use template" applies the focus areas and materialises the outline.
- **Step 2 Find & trust** is live: a background job proposes the chapter structure with Claude Haiku and
  retrieves candidate sources per section by vector search; selections, coverage and counts all persist.
- **Step 3 Edit & create** is live: sections are drafted by Claude Opus from the selected sources and
  arrive one at a time behind a live progress bar, edits autosave with version history and conflict
  detection, and the assistant answers about the open section and can propose a rewrite.
- **Step 4 Review & deliver** is live: the preview is the real rendered document, and export produces
  Word (Office Open XML written directly) and PDF (that same HTML printed by headless Chrome) into the
  storage adapter, with an authenticated download.
- **Knowledge library ingest** is live: PDF, Word and PowerPoint are parsed, chunked with real page
  numbers, embedded and page-indexed by a background job. Customer-tagged documents are confidential to
  that customer, enforced in SQL in retrieval. Local-folder and SharePoint connectors sit behind one
  interface; only the local one is verified.
- Duplicate and archive endpoints with owner/collaborator/admin authorisation.

Still inert: sharing and collaborator invitations, comments persistence (so "include comments" in export
is disabled rather than lying), tailor options actually steering generation, PowerPoint and video export,
and rich-text editing. Ingested sources are approved through the API; there is no curator screen yet.

[`docs/04-gap-analysis.md`](docs/04-gap-analysis.md) holds the original screen-by-screen audit and the
suggested order of work. It predates the AI, jobs, storage, knowledge, sections, export and ingest slices
listed above, so read it as the plan that was followed rather than as current status.

## Layout

```
design/      Claude Design export (UI source of truth)
docs/        analysis, architecture, APS gateway notes
drizzle/     SQL migrations (generated, committed)
src/app      Next.js routes and /api handlers (thin adapters)
src/server   env, db (drizzle + PGlite/pg), auth, http wrapper, modules/<domain>/{repository,service}
src/shared   zod contracts and enums shared by API and UI
src/features UI screens ported from the design; workspace/ holds the wizard state
tests/       vitest suites (helpers/db.ts spins up an in-memory PGlite per file)
scripts/     smoke and verification runners (not part of the build)
```

Two server modules are deliberately dependency-free, because the package mirror is not reliably
reachable from this network: `modules/export/` writes .docx as Office Open XML and prints PDF with the
installed browser, and `modules/ingest/` reads ZIP containers and PDF content streams on Node's `zlib`.
Both are covered by unit tests that build real documents and read them back.
