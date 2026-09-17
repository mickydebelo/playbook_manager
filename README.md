# Playbook Manager

Authoring, tailoring and delivering digital transformation playbooks. The UI is the Claude Design
prototype in `design/` (source of truth, do not edit); see `docs/` for analysis and architecture.

## Run locally

Requires **Node 20.9+** and **npm 10+**. Nothing else is needed to start — no Docker, no Postgres.

```bash
npm install          # uses the Autodesk Artifactory mirror in .npmrc
npm run db:seed      # dev users, templates, sample playbooks (idempotent)
npm run dev          # http://localhost:3000 → sign in as a seeded user
```

That's it — no `.env` needed to start. Every setting has a working default: an embedded PGlite
database under `.data/pglite` (so there is no database to install) and local dev sign-in. The app
runs without Autodesk Platform Services (APS) credentials too; the AI steps just report that the
gateway is not configured until you add keys.

### Configuration (optional)

Create a `.env` file in the project root only when you want to change a default — most commonly to
turn on the AI features. A minimal one:

```dotenv
# Enable the AI steps (outline, drafting, assistant, retrieval). client id and client secret will be provided thos who need it.
APS_CLIENT_ID=your-client-id
APS_CLIENT_SECRET=your-client-secret


```


> **One process at a time** on the embedded database. Stop `npm run dev` before running `db:seed`,
> `db:migrate` or `worker`, and restart the dev server after adding a migration. Real PostgreSQL has
> no such limit.




## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run db:seed` | idempotent seed (core data + development knowledge corpus) |
| `npm run db:generate` / `db:migrate` | generate / apply SQL migrations |
| `npm run worker` | out-of-process job runner (`JOBS_MODE=worker`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | vitest: unit, service (PGlite), API route and component tests |

## Layout

```
design/      Claude Design export (UI source of truth)
docs/        analysis, architecture, APS gateway notes
drizzle/     SQL migrations (generated, committed)
src/app      Next.js routes and /api handlers
src/server   env, db, auth, http wrapper, modules/<domain>/{repository,service}
src/shared   zod contracts and enums shared by API and UI
src/features UI screens; workspace/ holds the wizard state
tests/       vitest suites
```

The wizard runs in four steps: **Define brief → Find & trust → Edit & create → Review & deliver**.
The **Knowledge library** ingests PDF, Word and PowerPoint (parsed, chunked and embedded in a
background job); a source becomes retrievable once a curator approves it via
`PATCH /api/knowledge/<id>` with `{"status":"approved"}`.
