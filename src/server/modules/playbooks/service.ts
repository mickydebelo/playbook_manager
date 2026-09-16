import { eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { briefs, chapters, playbooks, sections, templates } from "../../db/schema";
import type { CurrentUser } from "../../auth/current-user";
import { conflict, notFound, validationFailed } from "../../http/errors";
import type { BriefInput, CreatePlaybookInput, PlaybookDetail, PlaybookSummary, UpdatePlaybookInput } from "@/shared/contracts";
import type { PlaybookStatus } from "@/shared/enums";
import { upsertCustomer } from "../customers/service";
import { assertCanEdit, assertCanManage, assertCanRead } from "./access";
import { toDetail, toSummary } from "./mappers";
import * as repo from "./repository";

export const DEFAULT_TITLE = "Digital transformation playbook";

export async function listPlaybooks(db: Db, user: CurrentUser, filter: { status?: PlaybookStatus } = {}): Promise<PlaybookSummary[]> {
  const rows = await repo.listVisible(db, user.id, user.role === "admin", filter.status);
  return rows.map((r) => toSummary(r.playbook, r.customer));
}

export async function getPlaybook(db: Db, user: CurrentUser, id: string): Promise<PlaybookDetail> {
  const agg = await repo.loadAggregate(db, id);
  if (!agg) throw notFound("Playbook");
  assertCanRead({ ownerId: agg.playbook.ownerId, collaborators: agg.collaborators }, user);
  return toDetail(agg, user);
}

/** Step 1 → "Find relevant knowledge" on a new playbook: persists customer, playbook and brief in one transaction. */
export async function createPlaybook(db: Db, user: CurrentUser, input: CreatePlaybookInput): Promise<PlaybookDetail> {
  const id = await db.transaction(async (tx) => {
    const customer = await upsertCustomer(tx, user.id, {
      name: input.customerName,
      industry: input.industry,
      sizeBand: input.sizeBand,
      brandColor: input.brandColor,
      logoAssetId: input.logoAssetId,
    });

    let template: typeof templates.$inferSelect | null = null;
    if (input.templateId) {
      const [t] = await tx.select().from(templates).where(eq(templates.id, input.templateId)).limit(1);
      if (!t) throw notFound("Template");
      template = t;
    }

    const [pb] = await tx
      .insert(playbooks)
      .values({
        title: input.title?.trim() || (template ? `${template.title} playbook` : DEFAULT_TITLE),
        customerId: customer.id,
        ownerId: user.id,
        createdFromTemplateId: template?.id ?? null,
      })
      .returning();
    const playbookId = pb!.id;

    const focusAreas = uniq([...(template?.defaultFocusAreas ?? []), ...input.focusAreas]);
    await tx.insert(briefs).values({
      playbookId,
      objective: input.objective,
      focusAreas,
      additionalContext: input.additionalContext,
      brandColor: input.brandColor,
      logoAssetId: input.logoAssetId,
    });
    await repo.replaceBriefSources(tx, playbookId, input.sources);

    if (template) {
      await materialiseOutline(tx, playbookId, template.outline);
      await tx.update(templates).set({ usageCount: sql`${templates.usageCount} + 1` }).where(eq(templates.id, template.id));
    }
    return playbookId;
  });
  return getPlaybook(db, user, id);
}

/** Autosave of the brief (full replace). Refreshes the shared customer facts as well. */
export async function replaceBrief(db: Db, user: CurrentUser, id: string, input: BriefInput): Promise<PlaybookDetail> {
  const access = await repo.loadAccess(db, id);
  if (!access) throw notFound("Playbook");
  assertCanEdit(access, user);
  if (access.status === "archived") throw conflict("Archived playbooks are read-only");

  await db.transaction(async (tx) => {
    const customer = await upsertCustomer(tx, user.id, {
      name: input.customerName,
      industry: input.industry,
      sizeBand: input.sizeBand,
      brandColor: input.brandColor,
      logoAssetId: input.logoAssetId,
    });
    await tx
      .update(briefs)
      .set({
        objective: input.objective,
        focusAreas: uniq(input.focusAreas),
        additionalContext: input.additionalContext,
        brandColor: input.brandColor,
        logoAssetId: input.logoAssetId,
        updatedAt: new Date(),
      })
      .where(eq(briefs.playbookId, id));
    await repo.replaceBriefSources(tx, id, input.sources);
    await tx.update(playbooks).set({ customerId: customer.id, updatedAt: new Date() }).where(eq(playbooks.id, id));
  });
  return getPlaybook(db, user, id);
}

export async function updatePlaybook(db: Db, user: CurrentUser, id: string, patch: UpdatePlaybookInput): Promise<PlaybookDetail> {
  const access = await repo.loadAccess(db, id);
  if (!access) throw notFound("Playbook");
  if (patch.status !== undefined) assertCanManage(access, user);
  else assertCanEdit(access, user);
  if (access.status === "archived") throw conflict("Archived playbooks are read-only");
  if (patch.status === "archived") throw validationFailed({ status: "Use DELETE to archive a playbook" });

  const set: Partial<typeof playbooks.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.stage !== undefined) {
    if (patch.stage > 1) {
      const [brief] = await db.select().from(briefs).where(eq(briefs.playbookId, id)).limit(1);
      if (!brief?.objective.trim()) throw validationFailed({ objective: "Add a customer name and objective to continue." });
    }
    set.stage = patch.stage;
  }
  if (patch.status !== undefined) {
    set.status = patch.status;
    if (patch.status === "delivered") set.stage = 4;
  }
  await db.update(playbooks).set(set).where(eq(playbooks.id, id));
  return getPlaybook(db, user, id);
}

export async function duplicatePlaybook(db: Db, user: CurrentUser, id: string): Promise<PlaybookDetail> {
  const agg = await repo.loadAggregate(db, id);
  if (!agg) throw notFound("Playbook");
  assertCanRead({ ownerId: agg.playbook.ownerId, collaborators: agg.collaborators }, user);

  const newId = await db.transaction(async (tx) => {
    const [pb] = await tx
      .insert(playbooks)
      .values({
        title: `Copy of ${agg.playbook.title}`,
        customerId: agg.playbook.customerId,
        ownerId: user.id,
        stage: agg.playbook.stage,
        status: "draft",
        createdFromTemplateId: agg.playbook.createdFromTemplateId,
        tailorOptions: agg.playbook.tailorOptions,
      })
      .returning();
    const newId = pb!.id;
    await tx.insert(briefs).values({
      playbookId: newId,
      objective: agg.brief.objective,
      focusAreas: agg.brief.focusAreas,
      additionalContext: agg.brief.additionalContext,
      brandColor: agg.brief.brandColor,
      logoAssetId: agg.brief.logoAssetId,
    });
    await repo.replaceBriefSources(tx, newId, agg.sources.map((s) => ({ kind: s.kind, title: s.title, url: s.url })));
    await repo.copyOutline(tx, id, newId);
    return newId;
  });
  return getPlaybook(db, user, newId);
}

export async function archivePlaybook(db: Db, user: CurrentUser, id: string): Promise<void> {
  const access = await repo.loadAccess(db, id);
  if (!access) throw notFound("Playbook");
  assertCanManage(access, user);
  if (access.status === "archived") return;
  await db.update(playbooks).set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() }).where(eq(playbooks.id, id));
}

async function materialiseOutline(tx: Db, playbookId: string, outline: { title: string; sections: { title: string }[] }[]): Promise<void> {
  for (const [ci, ch] of outline.entries()) {
    const [chapter] = await tx.insert(chapters).values({ playbookId, position: ci, title: ch.title }).returning();
    if (ch.sections.length) {
      await tx.insert(sections).values(ch.sections.map((s, si) => ({ playbookId, chapterId: chapter!.id, position: si, title: s.title })));
    }
  }
}

function uniq(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((x) => {
    const k = x.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
