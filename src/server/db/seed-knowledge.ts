import { eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { knowledgeSources, sourceChunks } from "./schema";
import { embedMany, isAiConfigured } from "../ai/aps-client";

/**
 * Development knowledge corpus. These are the eight sources the design shows, turned into real
 * `knowledge_sources` rows with short passages so retrieval, relevance and citation work end to end.
 *
 * The passages are written fixtures, not extracts from real Autodesk documents. Replace this corpus
 * with the ingest pipeline (parse, chunk, embed real uploads) — see docs/04-gap-analysis.md §3.4.
 */
type SeedSource = {
  type: "pdf" | "docx" | "pptx" | "link";
  title: string;
  subtitle: string;
  ownerOrg: string;
  year: number;
  pageCount: number;
  status: "draft" | "approved";
  currency: "current" | "older";
  isExternal?: boolean;
  url?: string;
  tags: string[];
  passages: string[];
};

export const SEED_SOURCES: SeedSource[] = [
  {
    type: "pdf",
    title: "Document management implementation guide",
    subtitle: "Accelerating project delivery through connected document management",
    ownerOrg: "Technical Advisory",
    year: 2026,
    pageCount: 42,
    status: "approved",
    currency: "current",
    tags: ["document management", "cde", "adoption"],
    passages: [
      "A connected document management approach gives every project a single place where drawings, models and correspondence are issued, reviewed and approved. Establishing that place early removes the ambiguity about which file is current.",
      "Adoption vision: agree with the sponsor what good looks like at the end of the first year. Typical statements cover a single issue register per project, reviews completed inside the platform, and no drawing issued from personal storage.",
      "Key outcomes to measure are the proportion of projects using the common data environment, the median review turnaround, and the number of documents issued outside the platform. Baseline each one before the rollout begins.",
      "Roll out by project rather than by office. A pilot project with an engaged delivery lead produces better evidence than a department-wide mandate, and gives the champions network something concrete to point at.",
    ],
  },
  {
    type: "docx",
    title: "Project management playbook",
    subtitle: "Standard delivery approach for construction cloud programs",
    ownerOrg: "Technical Advisory",
    year: 2025,
    pageCount: 68,
    status: "approved",
    currency: "current",
    tags: ["project management", "governance", "delivery"],
    passages: [
      "Project setup covers the folder structure, the permission model, the naming convention and the issue workflow. Agreeing these four before the first model is uploaded avoids rework that is expensive to undo later.",
      "Governance defines who decides what. Name an information manager for each project, a platform owner for the organisation, and a change board that meets often enough to keep decisions ahead of delivery.",
      "The delivery approach is staged: mobilise, pilot, scale, sustain. Each stage has an exit test. Do not begin scaling while the pilot still has open workflow questions.",
      "Roles and responsibilities should be written down as a matrix mapping each discipline to its permissions. Review the matrix at every project kickoff rather than assuming the previous project's model still applies.",
    ],
  },
  {
    type: "pdf",
    title: "Customer case study – document workflow",
    subtitle: "How a 4,000-person consultancy moved to a common data environment",
    ownerOrg: "Customer success",
    year: 2024,
    pageCount: 12,
    status: "approved",
    currency: "current",
    tags: ["case study", "customer-specific", "cde"],
    passages: [
      "The consultancy ran three pilot projects across two regions before committing to a wider rollout. Each pilot had a named information manager and a weekly review with the platform owner.",
      "Business value came from shorter review cycles and fewer superseded drawings reaching site. The programme reported review turnaround falling from eleven days to four across the pilot projects.",
      "Strategic alignment mattered more than tooling. The programme was sponsored by the delivery director rather than by the technology team, which made the ways-of-working changes easier to hold in place.",
    ],
  },
  {
    type: "pptx",
    title: "Workflow guide",
    subtitle: "Cloud workflows from design to handover",
    ownerOrg: "Product marketing",
    year: 2022,
    pageCount: 36,
    status: "approved",
    currency: "older",
    tags: ["workflows", "handover"],
    passages: [
      "The design to construction workflow moves authored models into a shared coordination space, where clashes are resolved before issue. Handover then packages the approved information for the asset owner.",
      "Build workflows cover issue tracking, requests for information and the daily field report. Each should have one owner and one place of record.",
      "This material predates the current platform naming and should be checked against the latest product guidance before it is put in front of a customer.",
    ],
  },
  {
    type: "docx",
    title: "Document control best practices",
    subtitle: "Naming, versioning and approval patterns that scale",
    ownerOrg: "Technical Advisory",
    year: 2023,
    pageCount: 24,
    status: "approved",
    currency: "current",
    tags: ["document control", "naming", "governance"],
    passages: [
      "A naming convention works when it can be applied without judgement. Encode the project, originator, volume, level, type, role and number, and publish a one-page cheat sheet rather than a policy document.",
      "Versioning should distinguish the revision from the status. A document can be revision three and still be work in progress; the status field, not the revision, decides whether it may be used.",
      "Approval patterns that scale keep the number of approvers small and the deadline explicit. An approval with no due date is a queue, not a workflow.",
    ],
  },
  {
    type: "link",
    title: "ISO 19650 guidance on information management",
    subtitle: "Organization and digitization of information about buildings and civil engineering works",
    ownerOrg: "External source",
    year: 2022,
    pageCount: 1,
    status: "approved",
    currency: "current",
    isExternal: true,
    url: "https://www.iso.org/standard/68078.html",
    tags: ["iso 19650", "standards", "information management"],
    passages: [
      "ISO 19650 sets out concepts and principles for information management across the life cycle of a built asset, using building information modelling.",
      "The standard defines the information delivery cycle, the responsibilities of the appointing and appointed parties, and the common data environment as the agreed source of information for a project.",
      "Organisations adopting the standard usually start with the information requirements: what the asset owner needs, when, and in what form.",
    ],
  },
  {
    type: "pdf",
    title: "Change management framework for AEC firms",
    subtitle: "Sponsorship, champions and adoption measurement",
    ownerOrg: "Technical Advisory",
    year: 2025,
    pageCount: 30,
    status: "approved",
    currency: "current",
    tags: ["change management", "adoption", "training"],
    passages: [
      "Sponsorship is the single strongest predictor of adoption. Name one executive sponsor who will chair the steering group and be visible in the communication plan.",
      "A champions network spreads practice faster than formal training. Choose champions who are respected delivery people rather than the most technically curious, and give them time in their workload.",
      "Measure adoption with leading and lagging indicators together. Logins tell you about access; documents issued through the workflow tell you about behaviour.",
      "Training should be scheduled against the project calendar, not the platform release calendar. People learn a workflow when they are about to need it.",
    ],
  },
  {
    type: "pptx",
    title: "Adoption KPI catalogue",
    subtitle: "Leading and lagging indicators for platform adoption",
    ownerOrg: "Customer success",
    year: 2026,
    pageCount: 18,
    status: "approved",
    currency: "current",
    tags: ["kpi", "adoption", "measurement"],
    passages: [
      "Leading indicators show whether the change is taking hold: active users per project, proportion of projects configured to the standard, and champion coverage across offices.",
      "Lagging indicators show whether it paid off: review turnaround, rework attributable to superseded information, and the share of handovers accepted without resubmission.",
      "Pick no more than six indicators. A catalogue of thirty produces a dashboard nobody reads and no decisions.",
      "Set a baseline before the rollout. Adoption numbers without a baseline invite argument about whether anything changed.",
    ],
  },
];

export type KnowledgeSeedSummary = { sources: number; chunks: number; embedded: number };

/** Idempotent: sources are matched by title. Embeddings are added only when the gateway is configured. */
export async function seedKnowledge(db: Db, opts: { embed?: boolean } = {}): Promise<KnowledgeSeedSummary> {
  let created = 0;
  let chunkCount = 0;

  for (const source of SEED_SOURCES) {
    const [existing] = await db
      .select({ id: knowledgeSources.id })
      .from(knowledgeSources)
      .where(sql`lower(${knowledgeSources.title}) = ${source.title.toLowerCase()}`)
      .limit(1);
    if (existing) continue;

    const [row] = await db
      .insert(knowledgeSources)
      .values({
        type: source.type,
        title: source.title,
        subtitle: source.subtitle,
        ownerOrg: source.ownerOrg,
        year: source.year,
        pageCount: source.pageCount,
        url: source.url ?? null,
        status: source.status,
        currency: source.currency,
        isExternal: source.isExternal ?? false,
        tags: source.tags,
        indexedAt: new Date(),
      })
      .returning();
    created++;

    // The title and subtitle lead each source so a topical search matches the document itself.
    const texts = [`${source.title}. ${source.subtitle}`, ...source.passages];
    const inserted = await db
      .insert(sourceChunks)
      .values(texts.map((text, position) => ({ sourceId: row!.id, position, text })))
      .returning({ id: sourceChunks.id, text: sourceChunks.text });
    chunkCount += inserted.length;
  }

  const embedded = (opts.embed ?? true) && isAiConfigured() ? await backfillEmbeddings(db) : 0;
  return { sources: created, chunks: chunkCount, embedded };
}


/**
 * Embeds every chunk that does not have a vector yet. Safe to re-run: a seed that ran before the
 * credentials were in place can be completed simply by running it again.
 */
export async function backfillEmbeddings(db: Db, batch = 32): Promise<number> {
  let total = 0;
  for (;;) {
    const pending = await db
      .select({ id: sourceChunks.id, text: sourceChunks.text })
      .from(sourceChunks)
      .where(sql`${sourceChunks.embedding} is null`)
      .limit(batch);
    if (!pending.length) return total;
    const vectors = await embedMany(pending.map((p) => p.text));
    for (const [i, row] of pending.entries()) {
      await db.update(sourceChunks).set({ embedding: vectors[i]! }).where(eq(sourceChunks.id, row.id));
    }
    total += pending.length;
  }
}
