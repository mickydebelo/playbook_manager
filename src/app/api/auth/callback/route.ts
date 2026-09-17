import { jwtVerify } from "jose";
import { completeOidcLogin } from "@/server/auth/providers/oidc";
import { readCookie, sessionCookieHeader, signSession } from "@/server/auth/session";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/http/errors";
import { defineRoute } from "@/server/http/handler";

export const GET = defineRoute({ auth: false }, async ({ req, db }) => {
  const env = getEnv();
  const transient = readCookie(req.headers.get("cookie"), "pm_oidc");
  if (!transient) throw new AppError("unauthenticated", "Sign-in session expired, start again");
  const { payload } = await jwtVerify(transient, new TextEncoder().encode(env.SESSION_SECRET));
  const user = await completeOidcLogin(db, new URL(req.url), {
    state: String(payload.state),
    codeVerifier: String(payload.codeVerifier),
  });
  const token = await signSession({ sub: user.id, role: user.role, email: user.email, name: user.name });
  const next = typeof payload.next === "string" && payload.next.startsWith("/") ? payload.next : "/welcome";
  const headers = new Headers({ location: new URL(next, env.APP_BASE_URL).toString() });
  headers.append("set-cookie", sessionCookieHeader(token));
  headers.append("set-cookie", "pm_oidc=; Path=/api/auth; HttpOnly; Max-Age=0");
  return new Response(null, { status: 302, headers });
});
