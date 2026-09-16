import { eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { users } from "../../db/schema";
import { getEnv } from "../../env";
import { forbidden, notFound } from "../../http/errors";
import { toUserDto } from "../current-user";
import type { UserDto } from "@/shared/contracts";

/**
 * Development sign-in: pick an existing user by e-mail. Refused outside development/test even if
 * DEV_LOGIN_ENABLED is set, so a stray flag can never open production.
 */
export async function devLogin(db: Db, email: string): Promise<UserDto> {
  const env = getEnv();
  if (env.NODE_ENV === "production" || env.AUTH_PROVIDER !== "dev" || !env.DEV_LOGIN_ENABLED) {
    throw forbidden("Development sign-in is disabled");
  }
  const [row] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);
  if (!row || row.disabledAt) throw notFound("User");
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.id));
  return toUserDto(row);
}

/** Users offered on the development sign-in page. */
export async function listDevUsers(db: Db): Promise<UserDto[]> {
  const rows = await db.select().from(users).orderBy(users.name);
  return rows.filter((r) => !r.disabledAt).map(toUserDto);
}
