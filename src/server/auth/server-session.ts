import { cookies } from "next/headers";
import { getDb } from "../db/client";
import { loadActiveUser, type CurrentUser } from "./current-user";
import { SESSION_COOKIE, verifySession } from "./session";

/** Current user for React Server Components and layouts (reads the Next.js cookie store). */
export async function getServerUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySession(token);
  if (!claims) return null;
  return loadActiveUser(await getDb(), claims.sub);
}
