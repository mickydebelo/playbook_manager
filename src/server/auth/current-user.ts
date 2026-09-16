import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { users } from "../db/schema";
import type { UserDto } from "@/shared/contracts";
import { sessionFromRequest } from "./session";

export type CurrentUser = UserDto;

export function toUserDto(row: typeof users.$inferSelect): UserDto {
  return { id: row.id, name: row.name, email: row.email, avatarUrl: row.avatarUrl, role: row.role };
}

/** Resolves the signed-in user for a request, or null. Disabled users are treated as signed out. */
export async function currentUserFromRequest(db: Db, req: Request): Promise<CurrentUser | null> {
  const claims = await sessionFromRequest(req);
  if (!claims) return null;
  return loadActiveUser(db, claims.sub);
}

export async function loadActiveUser(db: Db, userId: string): Promise<CurrentUser | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row || row.disabledAt) return null;
  return toUserDto(row);
}
