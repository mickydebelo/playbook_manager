# Backend implementation — AI, jobs, knowledge, outline and sections

What was built after the gap analysis, and what it means for the screens. Verified 16 September 2026
against the live Autodesk Platform Services gateway and a browser walkthrough.

## 1. What now runs end to end

Create a playbook → a background job proposes the chapter structure with Claude Haiku 4.5 and retrieves
candidate sources per section by vector search → the consultant picks sources in step 2 → a second job
drafts every section with Claude Opus 4.1, grounded in the selected sources → step 3 shows, edits and
autosaves the real text with version history and an assistant that answers about the section in front of it.

Measured on the seeded corpus:

| Step | Work | Time |
| --- | --- | --- |
| `find_knowledge` | outline proposal + 16 section searches | 18–40 s |
| `create_draft` | 16 sections, two at a time, Opus | ~210 s |
| `regenerate_section` | one section | ~25 s |
| assistant turn | Haiku, inline in the request | ~1–2 s |
| embedding backfill | 36 chunks | ~13 s |

## 2. Subsystems added

### AI gateway client — `src/server/ai/`
`aps-client.ts` wraps the gateway documented in `APS_REST_API.md`: OAuth2 client credentials with a cached
token (refreshed a minute before expiry, one shared request across concurrent callers), `invokeModel` for the
fast and quality tiers, `invokeJson` with a tolerant JSON extractor (the models sometimes fence or preface
their JSON), and `embedText` / `embedMany` for Titan. A 401 from the gateway triggers one forced token
refresh and retry. Per-tier timeouts reflect the measured latency gap between Haiku and Opus.

`prompts/playbook.ts` holds every prompt in one reviewable place, written to the brand model's house style
(sentence case, active voice, the banned-buzzword list, no invented customer facts).

### Background jobs — `src/server/modules/jobs/`
A `jobs` table queue with atomic claiming (`FOR UPDATE SKIP LOCKED`), attempt counting, exponential backoff,
coarse progress reporting and a handler registry. `JOBS_MODE=inline` drains the queue in the web process just
after enqueue; `JOBS_MODE=worker` runs `npm run worker` as a separate process. `GET /api/jobs/:id` is what the
wizard polls for its loading states, and the progress label is shown on the button ("Drafting Governance").

Three handlers are registered: `find_knowledge`, `create_draft`, `regenerate_section`.
`export_playbook` and `ingest_source` are still unimplemented.

### Knowledge and retrieval — `src/server/modules/knowledge/`
Library listing with search and the approved/current/external facets, per-section candidates, and selection.
Retrieval is pgvector cosine search over `source_chunks`, restricted to approved, non-archived sources so
unreviewed material can never be proposed for a customer deliverable. Relevance bands are derived from cosine
distance rather than a second model call: high below 0.42, medium below 0.58, tuned against the seeded corpus.
When no embeddings exist the search falls back to keyword matching, so the app still works without credentials.

`seed-knowledge.ts` provides a development corpus: the eight sources the design shows, as real rows with short
passages, embedded through Titan. The embedding step is a resumable backfill, so a seed run made before the
credentials were in place can be completed by running it again. **These passages are written fixtures, not
extracts from real Autodesk documents** — the ingest pipeline that parses real uploads is still to build.

### Outline and sections — `src/server/modules/sections/`
Chapter and section create, rename, delete, reorder and move, each renumbering its siblings. Section content
saves with a snapshot of the previous text into `section_versions`, and an optimistic check on
`baseSavedAt` returns 409 rather than silently overwriting a collaborator. Version list and restore are
implemented. Coverage (the outline dot) is computed from selected sources: none, thin at one, ok at two or more.

### Assistant — `src/server/modules/assistant/`
A section-scoped chat on the fast model, with history persisted to `assistant_messages` and replayed to the
model, plus the design's "customer-specific introduction" suggestion.

## 3. API added

25 route files now, up from 11. New: `/api/jobs/:id`, `/api/playbooks/:id/find-knowledge`,
`/api/playbooks/:id/create-draft`, `/api/playbooks/:id/chapters`, `/api/chapters/:id`(+`/sections`),
`/api/sections/:id` (get, patch, delete), `/api/sections/:id/content`, `/api/sections/:id/versions`
(+ restore), `/api/sections/:id/regenerate`, `/api/sections/:id/knowledge`,
`/api/sections/:id/sources/:sourceId`, `/api/sections/:id/assistant`,
`/api/sections/:id/suggestions/intro`, `/api/knowledge`.

## 4. Two defects found and fixed during the build

1. **The job claim lost every camelCase column.** The atomic claim is raw SQL, and `returning *` hands back
   snake_case keys, so `job.targetId` was `undefined` and every handler failed with "not found". The claim now
   returns only the id and reads the row back through the schema. The tests passed before the fix because they
   only asserted single-word columns; they now assert `targetId`, `targetType` and the timestamps.
2. **Correlated subqueries in the select list silently returned zero.** Both "used in N playbooks" and the
   outline's selected-source count were written as correlated subqueries referencing the outer table, and the
   query builder did not carry the reference through. Both are now grouped joins, with regression tests.

Defect 1 from the gap analysis is also fixed: the wizard renders the stored outline, so a template's structure
and an AI-proposed structure both appear.

## 5. Still not built

Export in any format, file storage and upload, real document ingest (PDF, DOCX, PPTX parsing and page
previews), collaborators and sharing, comments persistence, tailor options, and the audit trail.
Rich-text editing remains markdown-only; the toolbar still explains itself rather than formatting.
See `docs/04-gap-analysis.md`, which stays the backlog.

## 6. Operational notes

- **The embedded database allows one process at a time.** PGlite opens a data directory exclusively in
  practice: running `npm run db:seed` while `npm run dev` is up gives the two processes divergent views, and a
  migration applied by one is invisible to the other until it restarts. Stop the dev server before seeding or
  migrating, or point them at different directories. This does not apply to a real PostgreSQL `DATABASE_URL`.
- Restart the dev server after generating a migration; the running process applied only the migrations that
  existed when it started.
- `npm run smoke:ai` exercises the whole AI path against the real gateway and deletes its test playbook afterwards.
- Drafting a sixteen-section playbook costs roughly 2,700 output tokens on Opus. There is still no rate limit
  or spend cap on the AI routes; that remains a hardening item before the app is exposed beyond a pilot.
