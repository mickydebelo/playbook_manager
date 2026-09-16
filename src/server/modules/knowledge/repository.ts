import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { knowledgeSources, sections, sectionSources, sourceChunks } from "../../db/schema";

export type KnowledgeRow = typeof knowledgeSources.$inferSelect;

export type LibraryFilter = "all" | "approved" | "current" | "external";

/** Library grid: active sources, newest first, with the "used in N playbooks" rollup. */
export async function listSources(db: Db, opts: { q?: string; filter?: LibraryFilter } = {}) {
  const filters = [sql`${knowledgeSources.archivedAt} is null`];
  if (opts.filter === "approved") filters.push(eq(knowledgeSources.status, "approved"));
  if (opts.filter === "current") filters.push(eq(knowledgeSources.currency, "current"));
  if (opts.filter === "external") filters.push(eq(knowledgeSources.isExternal, true));
  const q = opts.q?.trim().toLowerCase();
  if (q) {
    const like = `%${q}%`;
    filters.push(sql`(lower(${knowledgeSources.title}) like ${like} or lower(${knowledgeSources.ownerOrg}) like ${like})`);
  }
  // Joined and grouped rather than a correlated subquery: the query builder does not carry the
  // outer column reference into a subquery in the select list, which silently yields zero.
  return db
    .select({ source: knowledgeSources, usedIn: sql<number>`count(distinct ${sections.playbookId})::int` })
    .from(knowledgeSources)
    .leftJoin(sectionSources, and(eq(sectionSources.sourceId, knowledgeSources.id), eq(sectionSources.selected, true)))
    .leftJoin(sections, eq(sections.id, sectionSources.sectionId))
    .where(and(...filters))
    .groupBy(knowledgeSources.id)
    .orderBy(desc(knowledgeSources.year), knowledgeSources.title);
}

export async function getSource(db: Db, id: string): Promise<KnowledgeRow | null> {
  const [row] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, id)).limit(1);
  return row ?? null;
}

export async function getSourcesByIds(db: Db, ids: string[]): Promise<KnowledgeRow[]> {
  if (!ids.length) return [];
  return db.select().from(knowledgeSources).where(inArray(knowledgeSources.id, ids));
}

export type ChunkMatch = { sourceId: string; chunkId: string; text: string; pageNo: number | null; distance: number };

/**
 * Nearest chunks by cosine distance. Only approved, non-archived sources are considered, so an
 * unreviewed upload can never be proposed for a customer deliverable.
 *
 * `customerId` is the confidentiality boundary: a document ingested for one customer must never be
 * proposed for another's playbook. It is enforced here in SQL rather than in the UI, so no caller
 * can forget it — an unowned (shared) source has `customer_id is null` and is always in scope.
 */
export async function searchChunksByVector(db: Db, embedding: number[], customerId: string | null, limit = 40): Promise<ChunkMatch[]> {
  const literal = `[${embedding.join(",")}]`;
  const rows = await db.execute<{ source_id: string; chunk_id: string; text: string; page_no: number | null; distance: number }>(sql`
    select c.source_id, c.id as chunk_id, c.text, c.page_no,
           (c.embedding <=> ${literal}::vector) as distance
    from source_chunks c
    join knowledge_sources k on k.id = c.source_id
    where c.embedding is not null
      and k.archived_at is null
      and k.status = 'approved'
      and (k.customer_id is null or k.customer_id = ${customerId}::uuid)
    order by c.embedding <=> ${literal}::vector
    limit ${limit}
  `);
  const list = Array.isArray(rows) ? rows : ((rows as unknown as { rows: typeof rows }).rows ?? []);
  return (list as { source_id: string; chunk_id: string; text: string; page_no: number | null; distance: number }[]).map((r) => ({
    sourceId: r.source_id,
    chunkId: r.chunk_id,
    text: r.text,
    pageNo: r.page_no,
    distance: Number(r.distance),
  }));
}

/**
 * Keyword fallback for when no embeddings exist yet (the gateway is optional in development).
 * Carries the same customer boundary as the vector path, for the same reason.
 */
export async function searchChunksByText(db: Db, terms: string[], customerId: string | null, limit = 40): Promise<ChunkMatch[]> {
  const cleaned = terms.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 2);
  if (!cleaned.length) return [];
  const pattern = cleaned.map((t) => t.replace(/[%_]/g, "")).join("|");
  const rows = await db
    .select({ sourceId: sourceChunks.sourceId, chunkId: sourceChunks.id, text: sourceChunks.text, pageNo: sourceChunks.pageNo })
    .from(sourceChunks)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, sourceChunks.sourceId))
    .where(
      and(
        sql`${knowledgeSources.archivedAt} is null`,
        eq(knowledgeSources.status, "approved"),
        sql`(${knowledgeSources.customerId} is null or ${knowledgeSources.customerId} = ${customerId}::uuid)`,
        sql`lower(${sourceChunks.text}) ~ ${pattern}`,
      ),
    )
    .limit(limit);
  return rows.map((r) => ({ ...r, distance: 0.5 }));
}

export async function hasEmbeddings(db: Db): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sourceChunks)
    .where(isNotNull(sourceChunks.embedding));
  return (row?.n ?? 0) > 0;
}

/** Replaces the candidate set for a section, preserving any selections the user already made. */
export async function replaceCandidates(
  db: Db,
  sectionId: string,
  candidates: { sourceId: string; relevance: "high" | "medium" | "low"; score: number; relevantFor: string }[],
): Promise<void> {
  const existing = await db.select().from(sectionSources).where(eq(sectionSources.sectionId, sectionId));
  const selected = new Map(existing.filter((e) => e.selected).map((e) => [e.sourceId, e]));
  await db.delete(sectionSources).where(eq(sectionSources.sectionId, sectionId));

  const merged = new Map<string, (typeof sectionSources.$inferInsert)>();
  for (const c of candidates) {
    merged.set(c.sourceId, {
      sectionId,
      sourceId: c.sourceId,
      relevance: c.relevance,
      score: c.score,
      relevantFor: c.relevantFor,
      selected: selected.has(c.sourceId),
      selectedBy: selected.get(c.sourceId)?.selectedBy ?? null,
    });
  }
  // A source the user picked stays on the list even if the new search would not have proposed it.
  for (const [sourceId, row] of selected) {
    if (!merged.has(sourceId)) {
      merged.set(sourceId, {
        sectionId,
        sourceId,
        relevance: row.relevance,
        score: row.score,
        relevantFor: row.relevantFor,
        selected: true,
        selectedBy: row.selectedBy,
      });
    }
  }
  if (merged.size) await db.insert(sectionSources).values([...merged.values()]);
}

export async function listCandidatesForSection(db: Db, sectionId: string) {
  return db
    .select({ link: sectionSources, source: knowledgeSources })
    .from(sectionSources)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, sectionSources.sourceId))
    .where(eq(sectionSources.sectionId, sectionId))
    .orderBy(desc(sectionSources.selected), desc(sectionSources.score));
}

export async function setSelection(db: Db, sectionId: string, sourceId: string, selected: boolean, userId: string) {
  const [existing] = await db
    .select()
    .from(sectionSources)
    .where(and(eq(sectionSources.sectionId, sectionId), eq(sectionSources.sourceId, sourceId)))
    .limit(1);
  if (existing) {
    await db
      .update(sectionSources)
      .set({ selected, selectedBy: selected ? userId : null })
      .where(and(eq(sectionSources.sectionId, sectionId), eq(sectionSources.sourceId, sourceId)));
    return;
  }
  // Selecting a source that was never proposed (picked from the library) still records the link.
  await db.insert(sectionSources).values({ sectionId, sourceId, selected, selectedBy: selected ? userId : null, relevance: "medium", relevantFor: "" });
}

/** A few representative passages per source, for grounding a draft. */
export async function chunksForSources(db: Db, sourceIds: string[], perSource = 3): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!sourceIds.length) return out;
  // The limit is applied per source in SQL; fetching every chunk of every source and slicing in
  // JavaScript is fine for the seed corpus and badly wrong once documents are chunked for real.
  const rows = await db.execute<{ source_id: string; text: string }>(sql`
    select source_id, text from (
      select c.source_id, c.text,
             row_number() over (partition by c.source_id order by c.position) as rn
      from source_chunks c
      where c.source_id in (${sql.join(sourceIds.map((id) => sql`${id}::uuid`), sql`, `)})
    ) ranked
    where rn <= ${perSource}
    order by source_id, rn
  `);
  const list = Array.isArray(rows) ? rows : ((rows as unknown as { rows: { source_id: string; text: string }[] }).rows ?? []);
  for (const row of list as { source_id: string; text: string }[]) {
    out.set(row.source_id, [...(out.get(row.source_id) ?? []), row.text]);
  }
  return out;
}

/**
 * The passages from a chosen set of sources that best match a section's topic.
 *
 * Unlike `searchChunksByVector` this does not filter on approval status — the consultant has
 * already selected these sources deliberately — but it does cap how much any one source can
 * contribute, so a long document cannot crowd out the others.
 */
export async function topChunksForSection(
  db: Db,
  opts: { sourceIds: string[]; embedding: number[]; perSource?: number; total?: number },
): Promise<ChunkMatch[]> {
  const { sourceIds, embedding, perSource = 3, total = 12 } = opts;
  if (!sourceIds.length) return [];
  const literal = `[${embedding.join(",")}]`;
  // Bound parameters, not string interpolation, even though these ids come from our own tables.
  const idList = sql.join(sourceIds.map((id) => sql`${id}::uuid`), sql`, `);
  const rows = await db.execute<{ source_id: string; chunk_id: string; text: string; page_no: number | null; distance: number }>(sql`
    select source_id, chunk_id, text, page_no, distance from (
      select c.source_id, c.id as chunk_id, c.text, c.page_no,
             (c.embedding <=> ${literal}::vector) as distance,
             row_number() over (partition by c.source_id order by c.embedding <=> ${literal}::vector) as rn
      from source_chunks c
      where c.embedding is not null and c.source_id in (${idList})
    ) ranked
    where rn <= ${perSource}
    order by distance
    limit ${total}
  `);
  const list = Array.isArray(rows) ? rows : ((rows as unknown as { rows: unknown[] }).rows ?? []);
  return (list as { source_id: string; chunk_id: string; text: string; page_no: number | null; distance: number }[]).map((r) => ({
    sourceId: r.source_id,
    chunkId: r.chunk_id,
    text: r.text,
    pageNo: r.page_no,
    distance: Number(r.distance),
  }));
}
