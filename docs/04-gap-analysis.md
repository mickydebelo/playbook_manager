# Implementation gap analysis — what is not built yet

> **Partly superseded.** Since this audit, the AI gateway client, the background job runner, knowledge
> retrieval, outline and section editing, section content with version history and the assistant have all been
> built, and steps 2 and 3 now run on the database. See `docs/05-backend-implementation.md`. Sections 3.1,
> 3.2, 3.4, 3.5, 3.6 and defects 1–4 below are done; everything else still stands.

Audited 16 September 2026 against the design (`design/Playbook Manager.dc.html`, markup lines 1–703, prototype
logic 704–965), the architecture (`docs/02-architecture.md`) and the running application. Every claim below was
checked against the code, the database or the live app.

## 0. Headline

| Measure | Now | Target |
| --- | --- | --- |
| API routes implemented | 11 routes, 14 operations | 51 entries listed in the contract (architecture §2) |
| Database tables with production code touching them | 9 of 21 | 21 |
| Server subsystems built | auth, http, db, playbooks, customers | + ai, storage, jobs, knowledge, sections, collaboration, exports |
| Wizard steps backed by the database | 1 of 4 | 4 |
| Automated tests | 44 passing | plus every subsystem in §3 |

Of roughly 95 interactive affordances in the design: **18 persist through the API**, about 24 work in the browser
but are lost on reload, about 27 run on prototype data, 21 are a toast or a timer only, and 5 are inert controls
that were never wired in the design either.

**Verified working (16 September 2026, using the keys now in `.env`):** the Autodesk Platform Services AI gateway.
Claude Haiku 4.5 and Claude Opus 4.1 both return completions and Titan Text Embeddings v2 returns 1024-dimension
vectors. Opus took about 6.4 seconds on a short prompt against roughly 1 second for Haiku, which is the argument for
running generation as a background job rather than inside a request. No application code calls the gateway yet.

## 1. Defects in what has already been shipped

These are not missing features. They are things that are built but wrong, and they should be fixed before new work
lands on top of them.

1. **The real outline is fetched and then discarded.** Creating a playbook from a template does materialise chapters
   and sections into the database, and `PlaybookDetail.outline` carries them to the client, but the wizard never reads
   `initial.outline` — it seeds from the prototype constant instead. Every playbook therefore shows the same eight mock
   chapters and opens on "3.2 Docs Workflow". The consequence is that "Use template" only half-works: the focus areas
   and the stored outline are correct, but the outline the user sees and edits is generic. This is the single highest-value
   fix in this document and it is small.
2. **The Knowledge library card click is a regression against the design.** The design opened that source in step 2's
   preview. The port shows a toast instead. This was a deliberate simplification when there was no playbook context,
   but it removes behaviour the design specifies.
3. **`showAiSuggestions` is dead.** The option is declared and read, but no caller ever passes it, so the step 3
   suggestion card is permanently on and the design's prop cannot be exercised.
4. **The autosave indicator is computed but never rendered.** `saving` is tracked through the brief save and exposed to
   the screens, yet nothing displays it. Saves are silent and only failures surface, as a toast.
5. **`/help` is unreachable.** The page exists and matches the design, but neither the design's navigation array nor the
   shell links to it.
6. **The Help and Library pages instantiate the entire wizard hook** to read one array each. Harmless today, wasteful
   once that hook starts fetching.
7. **Dead code from the port:** the template constant in `mock-data.ts` is superseded by the database, and an unused
   toast timer ref remains in the workspace hook.
8. **No unsaved-work protection.** A brief typed on `/playbooks/new` is not persisted until "Find relevant knowledge",
   so Cancel, a navigation click or a refresh discards it without warning. The same applies to every step 2–4 edit.

## 2. Screen status

Legend: **REAL** persists through the API · **LOCAL** works but is lost on reload · **MOCK** runs on prototype data ·
**STUB** toast or timer only · **INERT** present but wired to nothing in the design as well as the port.

### Step 1 — Define brief · largely REAL
| Affordance | Status | Gap |
| --- | --- | --- |
| Customer, industry, size, objective, focus areas, context, source links | REAL | debounced save; not persisted at all until the playbook is created |
| Validation message, 500-character cap, disabled primary action | REAL | — |
| Find relevant knowledge | REAL | creates the playbook and advances the stage, but runs no retrieval |
| Add customer logo | STUB | no picker, no upload; the flag never reaches the server |
| Add brand color | REAL, no picker | persists, but toggles one hard-coded colour |
| Suggested focus areas | MOCK | four hard-coded chips, despite the label "Suggested for you based on your objective" |
| Cancel | LOCAL | silently discards an unsaved brief |

### Step 2 — Find & trust · MOCK throughout
| Affordance | Status | Gap |
| --- | --- | --- |
| Suggested structure, expand/collapse, selection | MOCK | see defect 1 — the stored outline is ignored |
| Add chapter, Add section | MOCK | mutates prototype state; no endpoint; lost on reload |
| Coverage dots and per-row counts | MOCK | coverage is never computed |
| Knowledge list, search, approved-only filter | MOCK | no `/api/knowledge`; search matches title and owner only |
| Source tick boxes, Use in this section | MOCK | `section_sources` is never written |
| Source preview, paging, zoom, metadata | MOCK | one fake cover for every page and every source |
| Open original | STUB | no stored file, no URL |
| Create draft | STUB | one-second timer; only the stage number persists |
| Rename or delete an outline node | Absent from the design too | new nodes are permanently "New chapter" / "New section" |
| `···` on source cards (line 282) | INERT | a decorative span in the design; no menu was ever specified |

### Step 3 — Edit & create · MOCK throughout
| Affordance | Status | Gap |
| --- | --- | --- |
| Section content, rich view and raw text | LOCAL over MOCK | generated client-side; never saved anywhere |
| "Last saved" label and word count | STUB | the timestamp is a hard-coded string |
| Formatting toolbar, ten controls | STUB | each toasts; no rich-text editor exists |
| Block-type select (Paragraph / Heading 2 / 3) | INERT | no handler in the design or the port |
| Regenerate section | STUB | 900 ms timer and a string replacement |
| Sources panel, remove from section | MOCK | the only wired `···` in the design; deletes immediately, no undo |
| Suggested content → Insert | LOCAL | string substitution, not a model call; one-shot |
| Assistant chat | STUB | canned reply after 700 ms; `assistant_messages` unused |
| Comments | LOCAL | seeded with one hard-coded comment; `comments` table unused |
| View changes | STUB | no history panel, no `section_versions` read |
| Save draft | STUB | sets a label and toasts; no content is saved |
| Continue to review | REAL (partial) | persists the stage only |
| `···` on outline rows (line 371) | INERT | decorative in the design |

### Step 4 — Review & deliver · MOCK throughout
| Affordance | Status | Gap |
| --- | --- | --- |
| Document preview, paging, zoom | MOCK | static cover; page count hard-coded to 42 |
| Structure tab | MOCK | mock outline and counts |
| Tailor checkboxes ×6 | LOCAL | `playbooks.tailor_options` exists but the update contract does not accept it |
| Readiness check ×5 | MOCK | two rows are hard-coded true; the mock data always yields two thin sections, so it permanently reads "almost ready" |
| Export, five formats | STUB | 1.2-second timer; no renderer, no `exports` row, no download |
| Include source list / comments | LOCAL | never sent anywhere |
| Share for feedback | STUB | no recipient field in the dialog; "2 teammates" is a constant; nothing is written |
| Share link | STUB | nothing is copied to the clipboard, in the design either |
| Save as template | STUB | `saved_as_template_id` never written |
| `···` More | STUB | names duplicate, archive and version history; the first two already have working endpoints |
| Mark as delivered | Missing | the API supports the status change and the list renders it, but no control sets it |

### My playbooks · REAL
Counts, filters, status badges, stage labels, relative dates, resume-at-stage and the empty state all work against the
database. The filter is applied client-side even though the endpoint supports `?status=`. Missing: pagination, search,
sorting and per-row actions for the duplicate and archive endpoints that already exist.

### Knowledge library · MOCK
Grid, search and filters run on eight prototype sources. Upload is a stub. Card click is defect 2. Nothing reads
`knowledge_sources`.

### Templates · REAL, half-effective
Cards are server-rendered from the seeded table and "Use template" applies focus areas, materialises the outline and
increments the usage count. The design's promise that templates pre-fill the outline only half-lands because of defect 1.
No create, edit, delete or preview.

### Help · static, unreachable (defect 5)

### Shell · REAL
Top bar, user menu with a working sign-out, navigation and toasts. The design's `assets/profile.png` was not part of the
export and no avatar is seeded, so the avatar is always initials.

## 3. Backend subsystems not built

### 3.1 AI integration — highest value, credentials ready
`src/server/ai/` does not exist. Needed: a gateway client with client-credentials token caching and refresh on 401,
`invoke` and `embed` helpers, per-model timeouts, prompt templates, token accounting and a spend guard. Six features
depend on it: outline proposal, per-section retrieval and relevance, section drafting, regeneration, the assistant, and
the customer-specific introduction. The gateway is staging-only; `APS_BASE_URL` already isolates that.

### 3.2 Background jobs
The `jobs` table exists with no code. Needed: an enqueue helper, a worker loop with claim, retry and backoff, a status
endpoint for the wizard's loading states, and progress reporting. Five job types are specified and none run. Given the
Opus latency measured above, generation cannot run inside a request.

### 3.3 File storage
The `assets` table exists with no code. Needed: the adapter interface with local and S3 drivers, an authenticated upload
route with type and size validation, a download route, and preview image generation. This blocks customer logos, source
originals, page previews and export artifacts.

### 3.4 Knowledge library and retrieval
Four tables unused: `knowledge_sources`, `source_pages`, `source_chunks`, `section_sources`. Needed: the ingest pipeline
(parse PDF, DOCX and PPTX, chunk, embed, render page images), library search and facets, curator approve and archive,
relevance scoring and the "used in N playbooks" rollup. The earlier prototype at `../playbook-manager` has working
parsers worth porting rather than rewriting.

### 3.5 Outline and section editing
`chapters` and `sections` are only written on create-from-template and duplicate. There is no endpoint to add, rename,
reorder, nest or delete either, and `sections.coverage` is never computed. Note that reordering is absent from the
design as well, so it needs a design decision before it needs an endpoint.

### 3.6 Section content and version history
`section_versions` is unused and section content is never written at all. Needed: a content save endpoint with conflict
detection, debounced autosave, the version list, restore, and the diff behind "View changes".

### 3.7 Collaboration
`collaborators` is read-only with no invite endpoint, and `comments`, `assistant_messages` and `share_links` have no
code. The reviewer-cannot-export rule is implemented and tested in the service layer, but nothing can create a reviewer.

### 3.8 Export and delivery
`exports` is unused and no format renders. Word and PDF can reuse the prototype's pipeline. PowerPoint, the web export
and the curated video need decisions before they can be scheduled.

### 3.9 Audit
`audit_events` is unused. For customer-facing content, create, brief change, status change, share and export should all
be recorded.

## 4. Cross-cutting gaps

| Area | Gap |
| --- | --- |
| Corporate sign-in | The OpenID Connect provider is written but has never been exercised: the three `OIDC_*` variables are empty and there is no test. Everything runs on the development provider. |
| Role management | Roles are enforced but can only be changed by editing the database. `BOOTSTRAP_ADMIN_EMAILS` is untested. |
| Concurrency | The brief save is last-write-wins. Two people editing one playbook overwrite each other silently. No ETag or version check. |
| Rate limiting | None. This matters before the AI endpoints are exposed, for both cost and gateway quota. |
| Observability | `console.error` only. No structured logs, request ids, metrics or tracing; job failures would be invisible. |
| Lint and CI | ESLint is not installed and there is no configuration or pipeline. Nothing runs `typecheck` or `test` automatically. |
| Version control | The repository is initialised but has **no commits**. All work is untracked. `.env` is correctly ignored and no untracked file contains the credentials. |
| Environment validation | `APS_ENVIRONMENT`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are in `.env` but not declared in `src/server/env.ts`, so they are silently ignored. `APS_ENVIRONMENT` is legacy from the earlier prototype and has no effect on the base URL. |
| UI state type safety | The render-value bag is an untyped record, so a mistyped key fails silently at runtime. A cross-check found no broken keys today, but nothing prevents one. |
| Error surfaces | No React error boundary, no custom 500 page, no offline or retry handling. Failures surface only as toasts. |
| List ergonomics | No pagination, search or sort on My playbooks; every visible playbook is loaded. |
| Accessibility | Three keyboard interactions exist in the design and all three are implemented, plus two the port added. Missing everywhere: Escape to close the preview and the share dialog, focus trapping in the dialog, and arrow-key navigation of the outline. No audit has been run. |
| Responsive | Only the narrow breakpoint in step 3 is implemented; nothing below roughly 1180 pixels has been checked. |
| Seed reporting | The seed prints rows *created*, so a second run prints zeros and looks like a failure. It should report totals. |

## 5. Data model coverage

| Table | Code today |
| --- | --- |
| `users`, `customers`, `playbooks`, `briefs`, `brief_sources`, `templates` | full read and write in use |
| `chapters`, `sections` | written on create-from-template and duplicate only; never read by the UI (defect 1) |
| `collaborators` | read and authorisation only; no writes |
| `assets`, `assistant_messages`, `audit_events`, `comments`, `exports`, `jobs`, `knowledge_sources`, `section_sources`, `section_versions`, `share_links`, `source_chunks`, `source_pages` | **no production code at all** |

Columns written but never used: `playbooks.tailor_options`, `playbooks.saved_as_template_id`, `playbooks.version`
(exposed but never incremented), `sections.coverage` (never computed).

## 6. Test gaps

Covered: contracts, access rules, the style helper, the playbooks service against a real database, the playbooks API
handlers, and the two API-backed screens.

Not covered: the OpenID Connect provider, the workspace state hook, the brief state converters, the design-system
components, and every subsystem in §3. There is no end-to-end test and no coverage threshold.

## 7. Suggested order of work

1. **Defects in §1**, starting with rendering the stored outline. Small, and it makes templates deliver what they promise.
2. **Lint and CI, and a first commit.** Cheap, and everything after benefits.
3. **Corporate sign-in.** Fill the three OIDC variables, exercise the round trip, add a provider test. Unblocks a pilot.
4. **AI client and job runner together.** Neither is useful alone and everything else depends on both.
5. **Storage adapter.** Small; unblocks logos, source files and exports.
6. **Knowledge ingest and library.** The largest single piece; port the prototype's parsers.
7. **Outline and section CRUD, then content and versions.** Makes steps 2 and 3 real.
8. **Retrieval and drafting.** The AI features the design promises, on top of items 4 and 6.
9. **Collaboration, then export.** The delivery half of step 4.
10. **Hardening.** Rate limits, audit, observability, concurrency control, pagination, accessibility.
