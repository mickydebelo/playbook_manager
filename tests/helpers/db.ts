import { createPgliteDatabase, setDbHandleForTests, type Db, type DbHandle } from "@/server/db/client";
import { seedDatabase, DEV_USERS } from "@/server/db/seed";
import { users } from "@/server/db/schema";
import { signSession, SESSION_COOKIE } from "@/server/auth/session";
import { CSRF_HEADER, CSRF_VALUE } from "@/server/http/handler";
import type { UserDto } from "@/shared/contracts";
import { eq, sql } from "drizzle-orm";

export type TestContext = {
  handle: DbHandle;
  db: Db;
  admin: UserDto; // Micky Debelo
  author: UserDto; // Aleksandra Marjanovic
  outsider: UserDto; // a third user with no access to anything
};

/** Fresh in-memory PGlite database with migrations and dev users. One per test file keeps files independent. */
export async function createTestContext(): Promise<TestContext> {
  const handle = await createPgliteDatabase();
  setDbHandleForTests(handle);
  await seedDatabase(handle.db, { withSamples: false });
  const [outsiderRow] = await handle.db.insert(users).values({ email: "outsider@example.com", name: "Olive Outsider", role: "author" }).returning();
  const pick = async (email: string): Promise<UserDto> => {
    const [row] = await handle.db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    return { id: row!.id, name: row!.name, email: row!.email, avatarUrl: row!.avatarUrl, role: row!.role };
  };
  return {
    handle,
    db: handle.db,
    admin: await pick(DEV_USERS[0]!.email),
    author: await pick(DEV_USERS[1]!.email),
    outsider: { id: outsiderRow!.id, name: outsiderRow!.name, email: outsiderRow!.email, avatarUrl: null, role: "author" },
  };
}

export async function destroyTestContext(ctx: TestContext): Promise<void> {
  setDbHandleForTests(null);
  await ctx.handle.close();
}

export async function disableUser(ctx: TestContext, userId: string): Promise<void> {
  await ctx.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, userId));
}

/** Build a Request as the browser would send it: session cookie + CSRF header + JSON body. */
export async function apiRequest(
  path: string,
  init: { method?: string; body?: unknown; as?: UserDto | null; csrf?: boolean } = {},
): Promise<Request> {
  const headers = new Headers();
  if (init.as) {
    const token = await signSession({ sub: init.as.id, role: init.as.role, email: init.as.email, name: init.as.name });
    headers.set("cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}`);
  }
  if (init.csrf ?? true) headers.set(CSRF_HEADER, CSRF_VALUE);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://localhost:3000${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

export const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });

export const validBrief = {
  customerName: "Northwind Engineering",
  industry: "aeco" as const,
  sizeBand: "large" as const,
  objective: "Support the adoption of a connected document and project management platform.",
  focusAreas: ["Business strategy"],
  additionalContext: "",
  sources: [{ kind: "link" as const, title: "Product overview", url: "https://www.autodesk.com/products" }],
  brandColor: null,
  logoAssetId: null,
};
