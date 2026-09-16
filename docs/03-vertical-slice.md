# Vertical slice — Playbooks, brief and customers

Status: implemented and tested (Phase 0 + Phase 1 of `02-architecture.md` §8).

## What runs end to end

| Layer | Implementation |
| --- | --- |
| UI | `src/features/playbooks/Step1DefineBrief.tsx` (Step 1), `MyPlaybooks.tsx`, `PlaybookWorkspace.tsx` + `Stepper.tsx`; state in `src/features/workspace/useWorkspace.ts` |
| Client | `src/lib/api-client.ts` — JSON, CSRF header, typed error envelope, 401 → `/login` |
| API | `POST/GET /api/playbooks`, `GET/PATCH/DELETE /api/playbooks/:id`, `PUT /api/playbooks/:id/brief`, `POST /api/playbooks/:id/duplicate`, `GET /api/templates`, `GET /api/me`, `/api/auth/*` |
| Service | `src/server/modules/playbooks/service.ts` (transactions, authorisation, stage/status rules), `modules/customers/service.ts` (case-insensitive upsert) |
| Data | Drizzle schema for the whole model (21 tables) in `src/server/db/schema/`, migration `drizzle/0000_init.sql`, PGlite locally / PostgreSQL in production |
| Auth | HS256 session cookie (`jose`), dev provider (seeded users), OIDC provider with PKCE (`openid-client`), role + object-level rules in `modules/playbooks/access.ts` |
| Tests | 44 tests: contracts, access rules, style helper, service against PGlite, API handlers with real `Request`s, Step 1 and My playbooks components (happy-dom) |

User journey covered: sign in → Create playbook → fill brief (validation message, 500-character cap, focus areas,
optional sources/context) → **Find relevant knowledge** creates the playbook and opens step 2 of the new record →
brief edits on an existing playbook autosave (800 ms debounce, only when valid) → My playbooks lists real rows with
status filters and reopens a playbook at its stored stage → templates from the database pre-fill the outline.

## Design fidelity

- Markup and inline style declarations are carried over verbatim from `design/Playbook Manager.dc.html` through the
  `sx()` helper; hover rules map to six utility classes in `globals.css`; design-system components are ported 1:1
  (`src/components/ds`).
- Deliberate deviations: the DS `Checkbox` stops click propagation (ticking a source no longer also opens its preview,
  which the prototype did); the signed-in user comes from the session (initials avatar when no picture).
- Known regression: the Knowledge library card click shows a toast instead of opening the source in step 2's preview
  as the design does. Recorded as defect 2 in `04-gap-analysis.md`.
- Known defect: the outline written from a template is never rendered — the wizard still shows the prototype outline.
  Defect 1 in `04-gap-analysis.md`, and the first thing to fix.
- The design references `assets/profile.png`, which is not part of the export; the shell falls back to initials.

## Prototype data still in place (replaced by later phases)

`src/features/workspace/mock-data.ts`: `SOURCES` (Phase 3), `CHAPTERS` / `INITIAL_SEL` (Phase 4), `DRAFT` (Phase 5);
timers standing in for `create_draft`, `regenerate_section`, assistant replies and export (Phases 5–6).
Each is annotated with the phase that removes it.

## Operational notes

- The public npm registry is blocked on the Autodesk network; `.npmrc` points at the Artifactory mirror.
- PGlite 0.5 ships pgvector as `@electric-sql/pglite-pgvector`; the extension is loaded in `src/server/db/client.ts`
  and `CREATE EXTENSION IF NOT EXISTS vector` runs before migrations on every driver.
- The database handle lives on `globalThis`: Next.js dev keeps separate module graphs for route handlers and server
  components, and a module-level singleton opened the embedded database twice (surfaced as a 404 after create).
- `AUTH_PROVIDER=dev` is refused when `NODE_ENV=production` regardless of other flags.

## Next steps (Phase 2 start)

1. Point `OIDC_*` at the Entra ID app registration and smoke-test `/api/auth/login` → `/api/auth/callback`.
2. Collaborators + share dialog (`POST /api/playbooks/:id/collaborators`) and comments, replacing the mock comments list.
3. Audit events on create / brief change / status change.
