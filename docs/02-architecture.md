# Playbook Manager — backend architecture

Companion to `01-analysis.md`. This document fixes the decisions needed before implementation:
stack, database schema, API contract, authentication, module layout, environment, migrations,
tests and the phased plan.

## 0. Stack

| Concern | Choice | Why (and the trade-off) |
| --- | --- | --- |
| Web framework | **Next.js 16 (App Router) + React 19 + TypeScript** | The design is a React component tree and the earlier prototype is Next.js, so one language and one deployable. Route Handlers give us a REST API without a second service. Trade-off: API and UI scale together; if the AI jobs need independent scaling we split the worker out (already planned, see §8). |
| Database | **PostgreSQL 16 with pgvector** | Relational data plus vector retrieval for "find relevant knowledge" in one engine. |
| Local database | **PGlite (embedded Postgres, WASM)** for development and tests | Docker is not running on developer machines here and `psql` is absent. PGlite runs the *same SQL and the same migrations* as production Postgres, including `vector`. Trade-off: single-connection, not for production. |
| ORM / migrations | **Drizzle ORM + drizzle-kit** | SQL-first schema in TypeScript, generated SQL migration files that we review and commit, one driver for `pg` and PGlite. Trade-off vs Prisma: less GUI tooling, more control; Prisma's engine does not run against PGlite. |
| Validation | **zod 4** | Shared request/response schemas between API and UI; the prototype already used zod. |
| Auth | **OIDC (openid-client) + signed session cookie (jose)** with a dev provider | Corporate SSO first (Entra ID; Autodesk ID as alternative). We avoid Auth.js because its v5 is still a beta tag and we need only one provider plus a service-layer role model. Trade-off: we own ~200 lines of OIDC plumbing. |
| AI | **APS AI Services gateway** (Claude Haiku 4.5 / Opus 4.1, Titan embeddings) | The only sanctioned LLM path documented in the repo (`docs/APS_REST_API.md`). |
| Files | Storage adapter: local disk (dev) / S3-compatible (prod) | Keeps large binaries out of Postgres. |
| Jobs | `jobs` table + worker loop (inline in dev, separate process in prod); upgrade path to **pg-boss** | No extra infrastructure to start; Postgres is the queue. |
| Tests | **vitest** (+ happy-dom, Testing Library) | Fast, runs the API and repositories against PGlite in-memory. |
| Styling | Design tokens as CSS variables + inline styles, exactly as the design export | The design system ships tokens and inline-styled components; Tailwind is not needed for fidelity. |

## 1. Database schema

Conventions: `uuid` primary keys (`gen_random_uuid()`), `timestamptz` audit columns `created_at` / `updated_at`,
soft delete only where the UI has an "archive" concept (playbooks, knowledge sources). Enums are Postgres enums.

```sql
-- Identity ------------------------------------------------------------------
users(id, email unique, name, avatar_url, role user_role[author|curator|admin], idp_subject, last_login_at, created_at, updated_at)

-- Customers -----------------------------------------------------------------
customers(id, name, industry industry[aeco|dm|me|public_sector|other], size_band size_band[small|medium|large|enterprise],
          logo_asset_id → assets, brand_color char(7) null, created_by → users, created_at, updated_at)
          unique (lower(name))

-- Playbooks -----------------------------------------------------------------
playbooks(id, title, customer_id → customers, owner_id → users,
          status playbook_status[draft|in_review|delivered|archived], stage smallint 1..4,
          version int default 1, created_from_template_id → templates null, saved_as_template_id → templates null,
          tailor_options jsonb  -- {terminology,industry,size,products,focus,executiveSummary: bool}
          archived_at null, created_at, updated_at)
briefs(playbook_id pk → playbooks, objective text ≤500, focus_areas text[], additional_context text,
       logo_asset_id → assets null, brand_color char(7) null, updated_at)
brief_sources(id, playbook_id → playbooks, kind brief_source_kind[doc|link], title, url, position, created_at)

-- Outline -------------------------------------------------------------------
chapters(id, playbook_id → playbooks, position, title, created_at, updated_at)
sections(id, playbook_id → playbooks, chapter_id → chapters, parent_section_id → sections null,
         position, title, content_md text default '', word_count int, content_saved_at null,
         coverage coverage[none|thin|ok] default 'none', created_at, updated_at)
section_versions(id, section_id → sections, content_md, reason version_reason[edit|regenerate|assistant|insert|restore],
                 created_by → users, created_at)
comments(id, section_id → sections, author_id → users, body, created_at, deleted_at null)
assistant_messages(id, playbook_id → playbooks, section_id → sections, role msg_role[user|assistant], body, created_at)

-- Knowledge -----------------------------------------------------------------
knowledge_sources(id, type source_type[pdf|docx|pptx|link], title, subtitle, owner_org, year smallint,
                  page_count int, url null, original_asset_id → assets null,
                  status source_status[draft|approved|archived], currency source_currency[current|older],
                  is_external bool, customer_id → customers null (customer-specific sources),
                  tags text[], indexed_at null, uploaded_by → users, created_at, updated_at)
source_pages(id, source_id → knowledge_sources, page_no, preview_asset_id → assets)       -- step-2 preview images
source_chunks(id, source_id → knowledge_sources, page_no, position, text, embedding vector(1024))
section_sources(section_id → sections, source_id → knowledge_sources, pk(section_id, source_id),
                relevance relevance[high|medium|low], score real, relevant_for text, selected bool,
                selected_by → users null, created_at)

-- Collaboration & delivery --------------------------------------------------
collaborators(playbook_id, user_id, pk(playbook_id,user_id), role collab_role[reviewer|editor], invited_by → users, created_at)
share_links(id, playbook_id → playbooks, token unique, expires_at null, created_by → users, created_at, revoked_at null)
templates(id, kind template_kind[recommended|focused|short_form|industry|blank], title, description,
          outline jsonb  -- [{title, sections:[{title}]}]
          default_focus_areas text[], usage_count int default 0, is_builtin bool, created_by → users null, created_at, updated_at)
exports(id, playbook_id → playbooks, format export_format[docx|pdf|pptx|mp4|web], include_sources bool, include_comments bool,
        status job_status, artifact_asset_id → assets null, requested_by → users, job_id → jobs, created_at, completed_at null)

-- Infrastructure ------------------------------------------------------------
assets(id, storage_key unique, file_name, mime_type, size_bytes, sha256, uploaded_by → users null, created_at)
jobs(id, type job_type[find_knowledge|create_draft|regenerate_section|export_playbook|ingest_source],
     status job_status[queued|running|succeeded|failed], target_type, target_id, payload jsonb, result jsonb null,
     error text null, attempts int, run_after, started_at null, finished_at null, created_by → users, created_at)
audit_events(id, actor_id → users null, action, target_type, target_id, metadata jsonb, created_at)
```

Indexes: `playbooks(owner_id, status, updated_at desc)`, `sections(playbook_id, chapter_id, position)`,
`section_sources(source_id)` (for "Used in N playbooks"), `source_chunks` HNSW on `embedding` (cosine),
`jobs(status, run_after)`, `knowledge_sources(status, currency)`, GIN on `knowledge_sources.tags`.

Derived, not stored: readiness check, "Used in N playbooks", coverage counts per chapter, stage labels.

## 2. API / service contract

All routes live under `/api`. JSON in and out. Every response is either the resource or `{ error: { code, message, details? } }`.
Error codes: `unauthenticated` 401, `forbidden` 403, `not_found` 404, `validation_failed` 422 (zod issues in `details`),
`conflict` 409, `rate_limited` 429, `internal` 500. Mutations require the session cookie; state-changing requests
must carry the `x-requested-with: playbook-manager` header (CSRF guard for cookie auth).

### Auth
| Method & path | Purpose |
| --- | --- |
| `GET  /api/auth/login` | Redirect to the OIDC provider (or dev sign-in page when `AUTH_PROVIDER=dev`). |
| `GET  /api/auth/callback` | OIDC code exchange → upsert user → set session cookie → redirect. |
| `POST /api/auth/dev-login` | Dev only. `{ email }` of a seeded user → session cookie. |
| `POST /api/auth/logout` | Clear session. |
| `GET  /api/me` | `{ id, name, email, avatarUrl, role }`. |

### Playbooks (vertical slice — implemented)
| Method & path | Body / query | Response |
| --- | --- | --- |
| `GET  /api/playbooks?status=draft\|in_review\|delivered` | — | `PlaybookSummary[]` (owned or shared with the caller, newest first) |
| `POST /api/playbooks` | `CreatePlaybookInput` = `{ customerName, industry, sizeBand, objective, focusAreas[], additionalContext?, sources?[{kind,title,url}], brandColor?, templateId? }` | `201 PlaybookDetail` |
| `GET  /api/playbooks/:id` | — | `PlaybookDetail` = summary + `brief` + `customer` + `outline` + `collaborators` |
| `PATCH /api/playbooks/:id` | `{ title?, stage?, status? }` | `PlaybookDetail` |
| `PUT  /api/playbooks/:id/brief` | `BriefInput` (same fields as create, full replace) | `PlaybookDetail` |
| `POST /api/playbooks/:id/duplicate` | — | `201 PlaybookDetail` |
| `DELETE /api/playbooks/:id` | — | archives (status `archived`) → `204` |

### Playbooks — later phases
| Method & path | Purpose |
| --- | --- |
| `POST /api/playbooks/:id/find-knowledge` | Enqueue `find_knowledge` → `202 { jobId }` |
| `POST /api/playbooks/:id/create-draft` | Enqueue `create_draft` → `202 { jobId }` |
| `POST /api/playbooks/:id/chapters`, `PATCH/DELETE /api/chapters/:id` | Outline editing |
| `POST /api/chapters/:id/sections`, `PATCH/DELETE /api/sections/:id` | Outline editing (title, position, parent) |
| `GET  /api/sections/:id/knowledge?q=&approvedOnly=` | Candidate sources with relevance for the step-2 middle column |
| `PUT  /api/sections/:id/sources/:sourceId` `{ selected }` | Tick / untick |
| `PUT  /api/sections/:id/content` `{ contentMd, baseVersionId }` | Autosave; 409 on stale base |
| `GET  /api/sections/:id/versions`, `POST /api/sections/:id/versions/:vid/restore` | History |
| `POST /api/sections/:id/regenerate` | Enqueue `regenerate_section` |
| `POST /api/sections/:id/assistant` `{ message }` | Chat turn (streams text) |
| `POST /api/sections/:id/suggestions/intro` | AI "customer-specific introduction" |
| `GET/POST /api/sections/:id/comments`, `DELETE /api/comments/:id` | Comments |
| `POST /api/playbooks/:id/collaborators` `{ emails[], role }`, `DELETE …/:userId` | Share for feedback |
| `POST /api/playbooks/:id/share-links`, `DELETE …/:linkId`, public `GET /share/:token` | Share link |
| `PUT  /api/playbooks/:id/tailor` | Tailor options |
| `GET  /api/playbooks/:id/readiness` | Computed readiness checks |
| `POST /api/playbooks/:id/exports` `{ format, includeSources, includeComments }` → `202`, `GET /api/exports/:id`, `GET /api/exports/:id/download` | Export |
| `POST /api/playbooks/:id/save-as-template` | Template from outline |

### Knowledge library, templates, customers, jobs
| Method & path | Purpose |
| --- | --- |
| `GET  /api/knowledge?q=&filter=all\|approved\|current\|external` | Library grid |
| `GET  /api/knowledge/:id`, `GET …/:id/pages/:n`, `GET …/:id/original` | Preview + metadata + download |
| `POST /api/knowledge` (multipart) → `202 { sourceId, jobId }` | Upload → `ingest_source` |
| `POST /api/knowledge/:id/approve`, `POST …/archive` | Curator actions |
| `GET  /api/templates`, `POST /api/templates/:id/use` → `201 PlaybookDetail` | Templates |
| `GET  /api/customers?q=`, `POST /api/customers/:id/logo` (multipart) | Customer lookup, logo |
| `GET  /api/jobs/:id` | `{ id, type, status, progress?, error? }` polled by the wizard's loading states |

Service layer: every route handler is a thin adapter — parse with zod, resolve the session, call a
`modules/<name>/service.ts` function that enforces authorisation and business rules, map errors. Services take a
`db` handle so tests can run them against PGlite without HTTP.

## 3. Authentication strategy

1. **Identity**: OpenID Connect authorization-code flow with PKCE via `openid-client`. Provider configured by
   `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET`. Entra ID first (tenant-scoped issuer); Autodesk ID works
   with the same code path.
2. **Session**: on callback we upsert `users` by `idp_subject` (fallback e-mail), then issue a compact JWT
   (HS256, `SESSION_SECRET`) holding `{ sub: userId, role, exp }` in an `httpOnly; Secure; SameSite=Lax` cookie
   named `pm_session`, TTL `SESSION_TTL_HOURS`. No server-side session table is needed; revocation is by rotating
   the secret or by the user's `disabled_at` check on each request (cheap primary-key read).
3. **Development**: `AUTH_PROVIDER=dev` enables `POST /api/auth/dev-login` for seeded users only. It is refused when
   `NODE_ENV=production` regardless of configuration.
4. **Authorisation**: `requireUser()` in every handler; `assertCanRead/Edit/Manage(playbook, user)` in the playbooks
   service (owner, collaborator role, or admin). Curator-only routes check `user.role`. Rules are unit-tested.
5. **CSRF**: cookie auth + custom header requirement on mutations; `SameSite=Lax` blocks cross-site form posts.
6. **Bootstrap**: e-mails in `BOOTSTRAP_ADMIN_EMAILS` become `admin` on first sign-in.

## 4. Backend folder / module structure

```
src/
  app/                       Next.js routes (UI pages + /api route handlers; handlers are adapters only)
    (app)/                   authenticated shell: /playbooks, /playbooks/new, /playbooks/[id], /library, /templates, /help
    login/
    api/…                    one route.ts per resource, see §2
  components/
    ds/                      Button, Badge, Checkbox, Tabs, Dialog — ported 1:1 from the design-system bundle
    shell/                   TopBar, SideNav, Toast
  features/
    workspace/               wizard state (prototype state ported; slices replaced by real data progressively)
    playbooks/               Step1DefineBrief, Step2FindTrust, Step3EditCreate, Step4ReviewDeliver, MyPlaybooks
    library/ templates/ help/
  lib/
    api-client.ts            typed fetch wrapper used by client components
    ui/sx.ts                 "display:flex;gap:8px" → React style object (keeps design markup verbatim)
  shared/                    zod schemas + TS types shared by API and UI (contracts.ts, enums.ts)
  server/
    db/  client.ts (pg or PGlite by env)  schema/*.ts  migrate.ts  seed.ts
    auth/ session.ts  providers/dev.ts  providers/oidc.ts  require-user.ts
    http/ handler.ts (route wrapper: auth, zod, error mapping)  errors.ts
    modules/
      playbooks/ repository.ts service.ts mappers.ts
      customers/ knowledge/ templates/ sections/ collaboration/ exports/
      jobs/ queue.ts worker.ts handlers/*.ts
    ai/ aps-client.ts (token cache, invoke, embed)  prompts/*.ts
    storage/ adapter.ts local.ts s3.ts
tests/ setup.ts  helpers/db.ts (fresh PGlite + migrations per file)  api/*.test.ts
drizzle/                     generated SQL migrations (committed)
docs/                        this documentation + APS_REST_API.md
design/                      Claude Design export — UI source of truth, untouched
```

## 5. Environment variables

See `.env.example` for the full list with comments. Groups: app (`APP_BASE_URL`), database
(`DATABASE_URL`, `PGLITE_DATA_DIR`), sessions/auth (`SESSION_SECRET`, `SESSION_TTL_HOURS`, `AUTH_PROVIDER`,
`DEV_LOGIN_ENABLED`, `OIDC_*`, `BOOTSTRAP_ADMIN_EMAILS`), APS AI (`APS_BASE_URL`, `APS_CLIENT_ID`,
`APS_CLIENT_SECRET`, `APS_MODEL_FAST`, `APS_MODEL_QUALITY`, `APS_EMBED_MODEL`), storage (`STORAGE_DRIVER`,
`STORAGE_LOCAL_DIR`, `S3_*`, `AWS_*`), jobs (`JOBS_MODE`). All are read once through `src/server/env.ts`
(zod-validated) so a misconfigured deployment fails at boot, not on first request.

## 6. Migration strategy

- Schema lives in `src/server/db/schema/*.ts`. `npm run db:generate` produces a numbered SQL file in `drizzle/`
  which is reviewed and committed with the code change that needs it.
- `npm run db:migrate` (and the test harness) applies pending migrations with Drizzle's migrator against whichever
  driver `DATABASE_URL` selects. The same files run on PGlite and on Postgres, so local, CI and production never diverge.
- Migrations are forward-only and additive by default (add column nullable → backfill → add constraint). Destructive
  changes get a two-release deprecation.
- Deployment order: run migrations as a release step before the new app version starts serving.
- Data migration from the earlier prototype (customers, `playbook.json` outlines, `source-pool/_catalog.json`) is a
  one-off `scripts/import-prototype.ts` in Phase 3; it maps chapters/sections to rows and pool entries to
  `knowledge_sources`, preserving `sourcePoolId` in `tags` for traceability.
- Seeds (`npm run db:seed`): built-in templates, the dev user, and a small approved knowledge set for local work.

## 7. Test strategy

| Layer | Tool | What is covered |
| --- | --- | --- |
| Unit | vitest | zod contracts (brief validation incl. the 500-char cap), `sx` helper, readiness computation, relevance scoring, authorisation rules |
| Repository / service | vitest + PGlite (fresh in-memory DB + migrations per test file) | CRUD, filters, ownership scoping, duplication, archive semantics |
| API | vitest calling route handlers directly with `Request` objects | Status codes, error envelope, auth/CSRF guards, response shapes against shared schemas |
| Component | vitest + happy-dom + Testing Library | Step 1 validation message and disabled state, list filters, empty states |
| End-to-end (Phase 2+) | Playwright against `next dev` with PGlite | Create → find → draft → export happy path |
| AI | contract tests with recorded gateway fixtures; live smoke behind `APS_LIVE=1` | Prompt/response parsing, token refresh on 401 |

CI gate: `npm run typecheck && npm test`. Coverage target 80% on `src/server/**`.

## 8. Phased implementation plan

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| **0 — Foundation (this iteration)** | Project scaffold, tokens, design-system components ported, full schema + first migration, env loading, DB client (PGlite/pg), session + dev auth, HTTP handler wrapper, error model, test harness. Full UI ported from the design with prototype state. | `npm run dev` renders the design; `npm test` green. |
| **1 — Vertical slice (this iteration)** | Playbooks + brief + customers: create from Step 1, autosave brief, list with filters, resume at stage, duplicate, archive. | Step 1 and My playbooks use the API and database only; tests for schema, service, API and Step 1 component. |
| **2 — Identity & collaboration** | OIDC provider (Entra), roles, collaborators, share-for-feedback dialog, comments, audit events. | Real SSO login in staging; reviewer cannot export. |
| **3 — Knowledge library** | Upload → ingest job (parse PDF/DOCX/PPTX using the prototype's parsers, chunk, embed via APS, preview pages), library grid, preview panel, curator approve/archive, prototype data import. | Library and step-2 preview show real sources. |
| **4 — Find & trust** | Outline editing, `find_knowledge` job (template outline + vector retrieval + relevance), selections, coverage, templates "use". | Step 2 fully live; readiness check computed. |
| **5 — Edit & create** | `create_draft` and `regenerate_section` jobs (Opus), autosave with versions, assistant chat (Haiku, streaming), suggested intro, view changes. | Step 3 fully live. |
| **6 — Review & deliver** | Tailor options applied to generation, DOCX/PDF export (reuse prototype `docx` code), web export via share link, save as template, duplicate/archive/version history menu. | Step 4 fully live; PPTX and video marked as later. |
| **7 — Hardening** | Separate worker process (pg-boss), S3 storage, rate limits on AI routes, observability (request logs, job metrics), Playwright e2e, load test of retrieval. | Production readiness review. |
