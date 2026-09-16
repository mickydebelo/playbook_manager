import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "../env";
import type { UserRole } from "@/shared/enums";

export const SESSION_COOKIE = "pm_session";

export type SessionClaims = { sub: string; role: UserRole; email: string; name: string };

function key(): Uint8Array {
  return new TextEncoder().encode(getEnv().SESSION_SECRET);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  const ttlSeconds = getEnv().SESSION_TTL_HOURS * 3600;
  return new SignJWT({ role: claims.role, email: claims.email, name: claims.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(key());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      role: (payload.role as UserRole) ?? "author",
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
    };
  } catch {
    return null;
  }
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionCookieHeader(token: string): string {
  const env = getEnv();
  const maxAge = env.SESSION_TTL_HOURS * 3600;
  const secure = env.APP_BASE_URL.startsWith("https://") ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Claims from a raw Request (route handlers and tests). */
export async function sessionFromRequest(req: Request): Promise<SessionClaims | null> {
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  return token ? verifySession(token) : null;
}
