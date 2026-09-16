import { eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { customers } from "../../db/schema";
import type { CustomerDto } from "@/shared/contracts";
import type { Industry, SizeBand } from "@/shared/enums";

export type CustomerRow = typeof customers.$inferSelect;

export function toCustomerDto(row: CustomerRow): CustomerDto {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    sizeBand: row.sizeBand,
    brandColor: row.brandColor,
    logoAssetId: row.logoAssetId,
  };
}

export type CustomerFacts = {
  name: string;
  industry: Industry;
  sizeBand: SizeBand;
  brandColor: string | null;
  logoAssetId: string | null;
};

/**
 * Customers are shared across playbooks and matched case-insensitively by name.
 * The brief owns industry/size/branding in the UI, so saving a brief refreshes those facts here.
 */
export async function upsertCustomer(db: Db, actorId: string, facts: CustomerFacts): Promise<CustomerRow> {
  const name = facts.name.trim();
  const [existing] = await db
    .select()
    .from(customers)
    .where(sql`lower(${customers.name}) = ${name.toLowerCase()}`)
    .limit(1);
  const patch = {
    industry: facts.industry,
    sizeBand: facts.sizeBand,
    brandColor: facts.brandColor,
    logoAssetId: facts.logoAssetId,
    updatedAt: new Date(),
  };
  if (existing) {
    const [updated] = await db.update(customers).set(patch).where(eq(customers.id, existing.id)).returning();
    return updated!;
  }
  const [created] = await db
    .insert(customers)
    .values({ name, createdBy: actorId, ...patch })
    .returning();
  return created!;
}

export async function searchCustomers(db: Db, q: string, limit = 10): Promise<CustomerDto[]> {
  const rows = await db
    .select()
    .from(customers)
    .where(q ? sql`lower(${customers.name}) like ${"%" + q.toLowerCase() + "%"}` : sql`true`)
    .orderBy(customers.name)
    .limit(limit);
  return rows.map(toCustomerDto);
}
