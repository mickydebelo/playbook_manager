# Playbook Manager — design and codebase analysis

Source of truth for the frontend: `design/Playbook Manager.dc.html` (Claude Design export, 16 Sep 2026).
Reference implementation and domain knowledge: the earlier prototype at `../playbook-manager`
(Next.js 15, file-based JSON storage, Word round-trip, source pool). Its code is not reused as-is,
but its data model, docx export and document-parsing libraries inform the backend below.

## 1. User flows

### 1.1 Create playbook (four-step wizard)

| Step | Screen | User actions | System behaviour |
| --- | --- | --- | --- |
| 1 | Define brief | Enter customer name (required); optional logo and brand colour; pick industry (AECO, D&M, M&E, Public sector, Other); pick organisation size (Small / Medium / Large / Enterprise); describe objective (required, max 500 chars, live counter); add focus areas (chips, free text via Enter, or accept suggestions "based on your objective"); optional: source links (title + URL) and additional context. | Validation message "Add a customer name and objective to continue." Primary button is disabled while invalid; shows "Finding relevant knowledge…" while running, then moves to step 2. Cancel returns to My playbooks. |
| 2 | Find & trust | Review proposed structure (chapters with nested sections, per-node selected-source count, coverage dot: well covered / thin / none). Add chapter, add section. Select a node to see "Knowledge for: {section}". Search within section, toggle "Approved only" filter, tick sources per section, open a source preview (Preview / Metadata tabs, page navigation, zoom, "Open original", "Use in this section" toggle). | Footer shows "{n} sources selected across {m} sections". "Create draft" runs generation, then moves to step 3 with the first chapter selected. |
| 3 | Edit & create | Outline (flat, chapters + sections) with add-section. Editor: section number + title, "Last saved …", word count, "View changes"; "Edit text" toggles raw text vs formatted blocks (h1/h2/p/bullets); "Regenerate section" (AI); formatting toolbar. Right panel tabs: **Sources** (sources used by this section with "Relevant for", remove, "Add or find more sources" → step 2, AI "Suggested content" insert, tip), **Assistant** (chat, quick prompts: Shorten / Make it more executive / Tailor for {customer}), **Comments** (threaded list with author, time, add). | Autosave label; Save draft; Continue to review → step 4. |
| 4 | Review & deliver | Heading "Your playbook is ready / almost ready". Share for feedback (dialog: invite teammates, they can comment but not export until marked ready). More menu (duplicate, archive, version history). Tabs: **Document preview** (paged cover with customer name, subtitle derived from objective, date, "Version 1.0") and **Structure** (outline with source counts). Tailor checkboxes (six, generated from the brief). Readiness check (five criteria; failures link back to the step that fixes them). Export: format select (Word, PDF, PowerPoint, curated video, shareable web page), include source list, include comments, Export (async, toast on completion), Share link (copy). Save as template. | Readiness is computed from coverage + brief completeness. Export produces a downloadable artifact. |

Stepper: steps can be revisited; forward navigation past step 1 requires a valid brief.

### 1.2 My playbooks
List of the user's playbooks with filters All / Draft / In review / Delivered. Columns: Playbook, Customer · Industry, Status badge, Stage, Updated. Opening a row resumes the wizard at the playbook's current stage. Empty state: "No playbooks in this view." Create playbook button.

### 1.3 Knowledge library
Searchable grid of approved and reviewed sources (type badge PDF / W / P / URL, owner org, year, pages, tags such as Approved / Current / Customer-specific / Older version / relevance, "Used in N playbooks"). Filters All / Approved / Current / External. Upload source (file picker). Clicking a card opens it in the step-2 preview.

### 1.4 Templates
Cards (kind: Recommended / Focused / Short form / Industry / Blank; title; description; section count; usage count). "Use template" pre-fills the outline and focus areas and starts step 1.

### 1.5 Help
Static explanation of the four steps.

### 1.6 Shell
Top bar with Autodesk logo and the signed-in user (avatar, name, menu). Left navigation: Create playbook, My playbooks, Knowledge library, Templates. Toasts for transient outcomes.

## 2. Entities

| Entity | Purpose | Key fields visible in the UI |
| --- | --- | --- |
| **User** | Signed-in Autodesk employee | name, email, avatar, role |
| **Customer** | The organisation a playbook is written for | name, industry, size band, logo, brand colour |
| **Playbook** | One engagement's playbook; owns the wizard state | title, customer, status (draft / in_review / delivered / archived), stage (1–4), updated_at, version |
| **Brief** | Step-1 inputs (1:1 with playbook) | objective (≤500), focus areas, additional context, source links |
| **BriefSource** | Link the author supplied in the brief | title, url, kind (doc / link) |
| **Chapter** | Top-level outline node | number, title, order, coverage status |
| **Section** | Outline node under a chapter (nested one level in the design; model allows deeper) | number, title, order, coverage status, draft content, saved_at, word count |
| **SectionVersion** | Snapshot for "View changes" / version history / regenerate undo | content, created_by, created_at, reason (edit / regenerate / assistant / insert) |
| **KnowledgeSource** | Library item the engine draws from | type (pdf / docx / pptx / link), title, subtitle, owner org, year, page count, status (draft / approved / archived), currency (current / older), external flag, original file, preview pages |
| **SectionSource** | A source selected for a section (the tick boxes) | relevance (high / medium / low), relevance score, "relevant for" summary, selected_by |
| **SourceChunk** | Retrieval unit for AI structure/draft generation | text, page, embedding |
| **Comment** | Feedback on a section | author, body, created_at |
| **Collaborator** | Teammate invited to review | user, role (reviewer / editor), invited_by |
| **ShareLink** | Public read-only link to a delivered playbook | token, expires_at |
| **Template** | Reusable outline + default focus areas | kind, title, description, outline JSON, usage count |
| **Export** | Rendered deliverable | format, options (include sources / comments), status, artifact file |
| **Job** | Background work (find knowledge, draft, regenerate, export, ingest) | type, status, payload, result, error |
| **Asset** | Stored file (logo, source original, preview page, export) | storage key, mime, size, sha256 |
| **AssistantMessage** | Chat history per section (optional persistence) | role, text |
| **AuditEvent** | Who did what (compliance for customer-facing content) | actor, action, target, at |

## 3. Relationships

- User 1—* Playbook (owner). Playbook *—* User through Collaborator.
- Customer 1—* Playbook. A Customer may be reused across playbooks.
- Playbook 1—1 Brief; Brief 1—* BriefSource.
- Playbook 1—* Chapter 1—* Section; Section 0..1—* Section (parent_id, for deeper nesting).
- Section 1—* SectionVersion.
- Section *—* KnowledgeSource through SectionSource. Coverage status is derived from the count and relevance of SectionSources.
- KnowledgeSource 1—* SourceChunk; KnowledgeSource 1—* Asset (original, preview pages).
- Section 1—* Comment. Playbook 1—* AssistantMessage (scoped to a section).
- Playbook 1—* Export; Export 1—1 Asset. Playbook 1—* ShareLink.
- Template 1—* Playbook (created_from_template_id); Playbook 0..1 Template (saved_as_template_id).
- Job → any of the above via (target_type, target_id).

## 4. Actions that require backend APIs

Auth: sign-in (OIDC), session, current user.
Playbooks: list (filter by status), create, read (full workspace: brief, outline, selections, drafts), update brief, update status/stage, duplicate, archive, delete, version history.
Wizard step 1 → 2: `find-knowledge` job (propose outline from brief + template, retrieve candidate sources per section with relevance).
Outline: add / rename / reorder / remove chapter or section.
Selections: toggle a source for a section; list knowledge for a section (search, approved-only filter).
Step 2 → 3: `create-draft` job (generate section drafts from selected sources; cite sources).
Sections: get, save content (autosave), list versions, restore version, regenerate (AI job), insert suggested content, assistant chat.
Comments: list, add, delete own.
Collaboration: invite for feedback, list collaborators, create / revoke share link.
Review: tailor options (save), readiness check (compute), export (job) + download artifact, save as template.
Knowledge library: list / search / filter, get metadata, preview page image, download original, upload (multipart) → `ingest-source` job (parse, chunk, embed, render previews), approve / archive (curator).
Templates: list, get, use (materialise outline into a new playbook).
Customers: create on the fly from step 1, upload logo, set brand colour.
Jobs: poll job status (or server-sent events) for the loading states in steps 1, 2, 3 and 4.

## 5. Authentication and authorisation

- Users are Autodesk employees (Technical Advisory). Sign-in must be corporate SSO via OpenID Connect. The earlier prototype already carries Microsoft Entra ID credentials for SharePoint, so Entra ID is the natural first provider; Autodesk ID (APS three-legged OAuth) is a viable alternative if the app is later exposed on APS.
- Roles: `author` (default; creates and edits own playbooks), `curator` (approves and archives knowledge sources, manages templates), `admin` (user and role management). Roles are stored in the database, not in the identity provider, so they can be changed without an IdP ticket.
- Object-level rules: a playbook is readable and editable by its owner and by collaborators with role `editor`; `reviewer` collaborators can read and comment but cannot export or change status ("they can comment but not export until you mark the playbook as ready"). Share links grant anonymous read of the delivered web export only.
- All API routes are authenticated; server components read the session server-side. Mutations are checked in the service layer, not in the UI.

## 6. Persistence

- Relational data (everything in §2 except file bytes) → PostgreSQL. Outline nodes are rows, not a JSON blob, so selections, comments, versions and coverage can be queried and indexed per section.
- Section content is stored as Markdown-flavoured text (the design's editor parses `#`, `##`, `-`), with a `content_html` cache column reserved for a later rich-text editor.
- Embeddings for retrieval → `pgvector` column on `source_chunks` (Titan Text Embeddings v2, 1024 dims, matches the APS gateway in `APS_REST_API.md`).
- Versions: every save that changes content creates a `section_versions` row (debounced by the autosave interval).

## 7. File and storage requirements

- Customer logos (PNG/SVG/JPG, ≤2 MB).
- Knowledge source originals (PDF, DOCX, PPTX; tens of MB) and derived preview page images (PNG per page for the step-2 preview).
- Export artifacts (DOCX, PDF, PPTX; web export as static HTML). Video export is out of scope for the backend until a renderer is chosen.
- Storage adapter with two implementations: local disk (development, tests) and S3-compatible object storage (production). Files are addressed by an `assets` row; downloads go through an authenticated route that streams or redirects to a signed URL.

## 8. Third-party integrations

- **APS AI Services gateway** (`APS_REST_API.md`): Claude Haiku 4.5 (fast: structure proposal, suggestions, chat) and Claude Opus 4.1 (quality: section drafting, regenerate), Titan embeddings for retrieval. Auth is APS OAuth2 client-credentials; tokens cached until expiry. Staging host only for now.
- **Corporate SSO** (Entra ID OIDC).
- Later, carried over from the prototype: SharePoint publish (Graph API), Autodesk Help MCP for "check against Autodesk Help".

## 9. Background jobs

| Job | Trigger | Work | UI state |
| --- | --- | --- | --- |
| `find_knowledge` | Step 1 → "Find relevant knowledge" | Build outline (template or LLM), embed brief + section titles, vector search per section, score relevance, write chapters/sections/section_source candidates | Button label "Finding relevant knowledge…" |
| `create_draft` | Step 2 → "Create draft" | For each section: assemble selected chunks, call LLM, store content + version, compute word count | "Creating draft…" |
| `regenerate_section` | Step 3 | Same as above for one section | "Regenerating…", editor dimmed |
| `export_playbook` | Step 4 | Render DOCX/PDF/PPTX/HTML, store asset | "Exporting…", toast on completion |
| `ingest_source` | Library upload | Parse, extract text, chunk, embed, render preview pages, write metadata | Upload progress / "Indexing" badge |
| `recompute_readiness` | After selections or drafts change | Cheap; can run inline | Readiness card |

Jobs are rows in a `jobs` table processed by a worker loop in the same Node process (development) or a separate worker (production). The UI polls `GET /api/jobs/:id` or subscribes to server-sent events.

## 10. Validation and error states visible in the UI

- Brief: customer name and objective required; objective capped at 500 characters with a counter; inline message under the footer; primary button disabled.
- Step 2: "No sources match your search." when the filtered list is empty; zero-coverage dot for sections without sources.
- Step 3: "No sources selected for this section yet."; saved-state label; disabled Regenerate while running.
- Step 4: readiness failures rendered as links ("Add focus areas in the brief", "Go to 3.4, 8.") ; "almost ready" heading when any check fails.
- Lists: "No playbooks in this view.", "Nothing matches your search."
- Toasts for save, export, share, template, logo actions.
- Not yet in the design but required for production: API error toasts (network failure, 403, 409 on concurrent edit), session-expired redirect, upload type/size rejection.
