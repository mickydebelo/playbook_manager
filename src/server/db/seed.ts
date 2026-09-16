import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { briefs, chapters, customers, playbooks, sections, templates, users } from "./schema";
import type { Industry, PlaybookStatus, SizeBand, Stage, TemplateKind } from "@/shared/enums";

/**
 * Idempotent seed. Development users, the six built-in templates from the design, and (optionally)
 * the five sample playbooks the "My playbooks" screen shows in the design.
 */
export const DEV_USERS = [
  { email: "micky.debelo@autodesk.com", name: "Micky Debelo", role: "admin" as const },
  { email: "aleksandra.marjanovic@autodesk.com", name: "Aleksandra Marjanovic", role: "author" as const },
];

type OutlineDef = { title: string; sections: { title: string }[] }[];
const DT_OUTLINE: OutlineDef = [
  { title: "Executive Summary", sections: [] },
  { title: "Business Strategy", sections: [{ title: "Adoption Vision" }, { title: "Business Outcomes" }, { title: "Governance" }] },
  { title: "Project Management", sections: [{ title: "Project Setup" }, { title: "Docs Workflow" }, { title: "Build Workflow" }, { title: "Adoption & KPIs" }] },
  { title: "Technology & Workflows", sections: [] },
  { title: "Change Management", sections: [] },
  { title: "Training & Adoption", sections: [] },
  { title: "Implementation Roadmap", sections: [] },
  { title: "Appendix", sections: [] },
];

export const BUILTIN_TEMPLATES: { kind: TemplateKind; title: string; description: string; outline: OutlineDef; focus: string[]; hasImage: boolean; usage: number }[] = [
  { kind: "recommended", title: "Digital transformation", description: "Full eight-chapter structure from vision to roadmap. Best for enterprise programs.", outline: DT_OUTLINE, focus: ["Business strategy", "Change management"], hasImage: true, usage: 42 },
  { kind: "focused", title: "Common data environment", description: "Document control, naming, workflows and governance for a CDE rollout.", outline: ["Vision and scope", "Document control", "Naming and metadata", "Workflows", "Governance"].map((t) => ({ title: t, sections: [] })), focus: ["Document control"], hasImage: false, usage: 27 },
  { kind: "focused", title: "Change management", description: "Sponsorship, champions network, communication plan and adoption measures.", outline: ["Sponsorship", "Champions network", "Communication plan", "Adoption measures"].map((t) => ({ title: t, sections: [] })), focus: ["Change management"], hasImage: false, usage: 19 },
  { kind: "short_form", title: "Executive briefing", description: "Two-page summary for leadership: outcomes, investment, timeline.", outline: ["Outcomes", "Investment", "Timeline"].map((t) => ({ title: t, sections: [] })), focus: ["Business strategy"], hasImage: false, usage: 33 },
  { kind: "industry", title: "Manufacturing design automation", description: "Data model, automation candidates, pilot selection and scaling plan.", outline: ["Current state", "Data model", "Automation candidates", "Pilot selection", "Scaling plan", "Governance"].map((t) => ({ title: t, sections: [] })), focus: ["Design automation"], hasImage: false, usage: 11 },
  { kind: "blank", title: "Start from scratch", description: "Empty outline. Add chapters and sections as you go.", outline: [], focus: [], hasImage: false, usage: 8 },
];

const SAMPLE_PLAYBOOKS: { title: string; customer: string; industry: Industry; size: SizeBand; status: PlaybookStatus; stage: Stage; objective: string; focus: string[]; daysAgo: number }[] = [
  { title: "Digital transformation playbook", customer: "Northwind Engineering", industry: "aeco", size: "large", status: "draft", stage: 3, objective: "Support the adoption of a connected document and project management platform across the organization, with a focus on business strategy and project management.", focus: ["Business strategy"], daysAgo: 0 },
  { title: "Common data environment rollout", customer: "Harbor & Vale", industry: "aeco", size: "medium", status: "in_review", stage: 4, objective: "Stand up a common data environment aligned to ISO 19650 across all regional offices.", focus: ["Document control", "Governance"], daysAgo: 1 },
  { title: "Design automation adoption", customer: "Meridian Manufacturing", industry: "dm", size: "large", status: "delivered", stage: 4, objective: "Identify and scale design automation candidates across the product engineering teams.", focus: ["Design automation"], daysAgo: 13 },
  { title: "BIM standards playbook", customer: "Cobalt Infrastructure", industry: "aeco", size: "enterprise", status: "draft", stage: 2, objective: "Define BIM standards and delivery workflows for infrastructure programmes.", focus: ["Project management"], daysAgo: 19 },
  { title: "Media pipeline modernization", customer: "Studio Lark", industry: "me", size: "small", status: "delivered", stage: 4, objective: "Modernize the media production pipeline with cloud collaboration and review workflows.", focus: ["Change management"], daysAgo: 35 },
];

export async function seedDatabase(db: Db, opts: { withSamples?: boolean } = {}): Promise<{ users: number; templates: number; playbooks: number }> {
  let userCount = 0;
  const userIds = new Map<string, string>();
  for (const u of DEV_USERS) {
    const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = ${u.email}`).limit(1);
    if (existing) {
      userIds.set(u.email, existing.id);
      continue;
    }
    const [created] = await db.insert(users).values(u).returning();
    userIds.set(u.email, created!.id);
    userCount++;
  }

  let templateCount = 0;
  for (const t of BUILTIN_TEMPLATES) {
    const [existing] = await db.select().from(templates).where(and(eq(templates.title, t.title), eq(templates.isBuiltin, true))).limit(1);
    if (existing) continue;
    await db.insert(templates).values({ kind: t.kind, title: t.title, description: t.description, outline: t.outline, defaultFocusAreas: t.focus, usageCount: t.usage, isBuiltin: true, hasImage: t.hasImage });
    templateCount++;
  }

  let playbookCount = 0;
  if (opts.withSamples) {
    const ownerId = userIds.get(DEV_USERS[0]!.email)!;
    for (const s of SAMPLE_PLAYBOOKS) {
      const [customer] = await db.select().from(customers).where(sql`lower(${customers.name}) = ${s.customer.toLowerCase()}`).limit(1);
      const customerId = customer
        ? customer.id
        : (await db.insert(customers).values({ name: s.customer, industry: s.industry, sizeBand: s.size, createdBy: ownerId }).returning())[0]!.id;
      const [existing] = await db.select({ id: playbooks.id }).from(playbooks).where(and(eq(playbooks.title, s.title), eq(playbooks.customerId, customerId))).limit(1);
      if (existing) continue;
      const when = new Date(Date.now() - s.daysAgo * 86_400_000);
      const [pb] = await db.insert(playbooks).values({ title: s.title, customerId, ownerId, status: s.status, stage: s.stage, createdAt: when, updatedAt: when }).returning();
      await db.insert(briefs).values({ playbookId: pb!.id, objective: s.objective, focusAreas: s.focus });
      for (const [ci, ch] of DT_OUTLINE.entries()) {
        const [chapter] = await db.insert(chapters).values({ playbookId: pb!.id, position: ci, title: ch.title }).returning();
        if (ch.sections.length) await db.insert(sections).values(ch.sections.map((x, si) => ({ playbookId: pb!.id, chapterId: chapter!.id, position: si, title: x.title })));
      }
      playbookCount++;
    }
  }
  return { users: userCount, templates: templateCount, playbooks: playbookCount };
}
