# Autodesk Design System

A design system built from Autodesk's approved brand model (`uploads/brand-model-APPROVED-v1.md`, approved by Michelle Carangi, brand team, 3 August 2026), the Artifakt Designer typeface collection, official logo files, 20 approved abstract brand images, and the corporate PowerPoint template (`corporate-PPT-template-artifakt.pptx`, 97 slides). Every color, type rule, and geometry value below traces back to one of those sources — nothing here is invented or drawn from generic brand conventions.

**Sources kept in the project (not assumed accessible elsewhere):**
- `uploads/brand-model-APPROVED-v1.md` — the full governing brand model, decision log (D-001–D-007), and open conflicts (C-001, C-002). Treat this as the source of truth for any question this readme doesn't answer.
- `uploads/corporate-PPT-template-artifakt.pptx` — 97 designed slides across title, divider, agenda, big-idea, quote, timeline, chart, org-chart and icon-grid layouts; mined for the composition system and the icon/logo assets in `assets/`.
- Artifakt Legend and Artifakt Element OTFs (9 weights + italics each) — full sets under `assets/fonts/` (5 weights of each shipped; all originals remain in `uploads/`).
- Official logo PNGs (primary, alternate stacked, black/white) and the Make Anything tagline lockup.
- 20 approved abstract brand images (`uploads/Abstract-Autodesk*.jpg`) — placeholder imagery only, swap for DAM-sourced finals before shipping.

## Company context

Autodesk makes software for architecture, engineering, construction, product design, manufacturing, and media & entertainment. The brand promise is "Design and make a better world for all"; the tagline is **"Make Anything."** The current brand system (post-refresh) is built on Autodesk Black, Autodesk White, and the added primary color Hello Yellow.

## Components

Standard UI primitives (no Figma or product codebase was attached, so this is an authored-from-brand-guidelines set, sized for typical product/marketing surfaces):

- **Buttons** (`components/buttons/`) — `Button` (primary, inverse, secondary, secondary-inverse, accent, ghost), `IconButton`
- **Data display** (`components/data-display/`) — `Card`, `Badge`
- **Forms** (`components/forms/`) — `Input`, `Select`, `Checkbox`, `Radio`, `Switch`
- **Navigation** (`components/navigation/`) — `Tabs`
- **Overlay** (`components/overlay/`) — `Dialog`, `Tooltip`

## Templates

- `templates/pitch-deck/` — six slide devices measured against the corporate PPTX's own composition patterns: split-panel title, image-led divider, big statistic (Hello Yellow field), oversized numerals, quote, and numbered-badge agenda.
- `templates/display-ad/` — 300×250 display ad, black and light variants, geometry read directly from the brand model's measured PSD spec (§11): 158px copy panel, 12.5px single top-right radius, 4px CTA corners, per-format logo width.

## Index

- `styles.css` — root stylesheet, imports everything under `tokens/`
- `tokens/colors.css`, `typography.css`, `spacing.css`, `fonts.css`
- `assets/fonts/` — Artifakt OTFs · `assets/logos/` — primary/alternate logo, Make Anything tagline · `assets/imagery/` — 12 abstract brand stills · `assets/icons/` — 18 icons extracted from the corporate PPTX's icon-grid slides (sample of the approved 880-icon library; the full set is in the PPTX, not yet extracted)
- `guidelines/` — foundation specimen cards (see Design System tab): Colors (primary, secondary, tertiary, tints, proportions), Type (families, scale, weights, on-dark), Spacing (scale, grid, radius), Brand (logo, tagline, prohibited use, imagery, iconography)
- `SKILL.md` — Claude Code-compatible skill wrapper

## Content fundamentals

Voice is **optimistic, trusted, and human**; tone modulates by audience but voice doesn't. Written in first/second person (we/you). Sentence case everywhere except browser titles, API names, and formal program names. No terminal punctuation on headlines. Serial comma always. Active voice; brevity is a stated best practice — "adding voice doesn't mean adding words."

Examples straight from the model:
- Do: *"Small firm succeeds with BIM"* — Don't: *"Small firm goes big with BIM"* (wordplay)
- Do: *"Improve your design workflows"* — Don't: *"Power up your design workflows"* (jargon)
- CTAs start with a verb, sentence case, no "Learn more" outside ads/social (it's approved there — see C-001)
- No emoji anywhere in the source material.
- Buzzwords banned outright: cutting edge, impactful, leverage, pain point, revolutionary, synergy, purpose-built. Handle with care: innovative, robust, ecosystem, transform.
- Trademarks are adjectives ("AutoCAD software"), never nouns/verbs/possessives/plurals/abbreviations.

## Visual foundations

**Color.** Autodesk Black + Autodesk White + Hello Yellow are primary and must total 85% of any layout's graphic elements; Hello Yellow and the four tertiary colors (Dawn, Dusk, Twilight, Morning) together cap at 15%. Hello Yellow is a reveal — one moment per composition, never a field, never paired directly with white text (1.07:1 contrast, fails AA). Only the listed tint/shade steps are approved; no intermediate values, no tints/shades of black or white.

**Type.** Artifakt Legend Bold for every headline, with no exceptions — Artifakt Element Regular for body; Artifakt Element Bold for subheads sitting over body copy. Everything sits on a 4px grid — type size + line height must total a multiple of 4. Arial substitutes for anything that can't embed a custom font (email, PPTX/DOCX/XLSX leaving Autodesk).

**Spacing & grid.** 4px base unit; all spacing in 1×/2×/3×/4×/6×/8×/10×/12× steps. Every element and color block aligns to the grid — nothing placed by eye.

**Corners.** A fixed scale, not a single radius: 4px (buttons, tags) · 8px (inputs, small cards) · 16px (standard cards) · 24px (modals, dividers) · 32px (hero/banner). Sharp corners read as structure (grids, tables); rounded corners read as emphasis (callouts, quote cards) — the two are never mixed without reason.

**Imagery.** Abstract/textural, journalistic or staged (never "stocky"), cool-leaning with pops of color and yellow, no people-in-window framing, no baked-in logos when used as ad/deck imagery (the 6 "zoom background" images with a logo bar are excluded from that use). Ratios: 1:1, 4:3, 16:9, 3:2 only.

**Visual devices.** Two brand-specific motifs, both built on the Autodesk "A" symbol: **the window** (symbol as a mask or opaque overlay onto imagery, no people inside it) and **the thread** (a thin outline of the symbol woven through low-contrast, overall-dark-or-light imagery, in white/black/yellow only, cleared for use without case-by-case approval per ruling D-001). Neither is built into the components/templates here — both require a specific source image chosen to the brand's depth/contrast rules, so they're documented, not fabricated.

**Backgrounds.** Solid Autodesk Black or Warm Slate 100 panels, or full-bleed photography — no gradients as backgrounds, no repeating patterns/textures beyond the two visual devices above.

**Shadows.** One soft card shadow (`--shadow-card`) for elevated surfaces (cards, dialogs); no inner shadows, no glow, no drop shadow on the logo (explicitly prohibited).

**Corners/borders on cards.** 16px radius, hairline 1px border in Slate 100 on light backgrounds, no border on dark cards (shadow only).

**Hover/press states.** No color-shift system is specified in the approved sources; components here use opacity (~0.8 hover, ~0.4 disabled) as the least brand-risky interpretation — flagged as a `[not specified in approved sources]` extrapolation, not a brand rule.

**Transparency/blur.** Used only for scrim overlays darkening imagery behind white headline text (see the divider and quote slide templates) — never as a stylistic blur/frosted-glass effect.

**Animation.** Not specified for UI motion in the approved sources; the brand does define four approved brand *animations* (Orbs, Bloom, Lattice, Prototype) for use as imagery, which are DAM assets, not something to recreate here.

**Composition system (decks specifically).** See brand model §11b: one idea per slide, one dominant element at ≥3× the scale of supporting text, asymmetric (not centered) layouts, deliberate whitespace, one yellow "reveal" per slide, no layout repeated back-to-back, ≤5 bullets and ≤14 words per bullet, decks open and close dark.

## Iconography

The brand model describes an 880-file icon library (general, industry-specific, and educational sets); the corporate PPTX itself embeds only 20 icon files as actual media (18 SVG + 2 PNG — every icon-shaped asset in that file's `ppt/media/`, not a curated subset). All 20 are in `assets/icons/` — flat, single-color, no stroke-only style observed, no emoji, no unicode-glyph icons anywhere in the source material. The other ~860 icons in the full library aren't embedded in this PPTX and would need the DAM/icon-library source directly.

## Intentional additions

- `IconButton`, `Tabs`, `Dialog`, `Tooltip`, `Switch` — no source defines a component inventory (brand-guidelines-only run), so these were added as the smallest standard set a real product surface needs alongside Button/Card/forms. Sized to the same token scale as everything else.

## Caveats — please help me iterate

- **No Figma or product codebase was attached.** Components are an authored-from-brand-guidelines set, not a recreation of a real Autodesk product UI — if you have a live surface (Fusion, Construction Cloud, etc.) to point me at, I can rebuild these against it.
- **Icons are the 20 icon files embedded in the PPTX**, not the full 880-icon library referenced in the brand model — that full set lives in a DAM/library not attached here.
- **The window and the thread** (the two named visual devices) are documented but not built into a component or template — they require a specifically-chosen source image per the brand's depth/contrast rules, which I don't have a licensed source for beyond the 20 placeholder abstracts.
- **Hover/press states, animation easing, and blur usage** aren't specified in the approved sources for UI (only for print/deck composition) — I made minimal, low-risk choices (opacity shifts, no motion) and flagged them above rather than inventing a fuller system.
- Corporate PPTX theme XML has its own Dusk value (`#F2510A`) that's one digit off the brand model's approved `#F2520A` — I used the brand model's value everywhere (it's the higher-priority source per the model's own rules) and flag the PPTX as the outlier.
