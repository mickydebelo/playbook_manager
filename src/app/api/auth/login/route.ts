import { SignJWT } from "jose";
import { startOidcLogin } from "@/server/auth/providers/oidc";
import { getEnv } from "@/server/env";
import { defineRoute } from "@/server/http/handler";

/** Entry point for sign-in. Dev provider → /login page; OIDC → identity provider with PKCE state in a short-lived cookie. */
export const GET = defineRoute({ auth: false }, async ({ req }) => {
  const env = getEnv();
  const url = new URL(req.url);
  const next = url.searchParams.get("next") ?? "/welcome";
  if (env.AUTH_PROVIDER === "dev") {
    return Response.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, env.APP_BASE_URL), 302);
  }
  const start = await startOidcLogin();
  const transient = await new SignJWT({ state: start.state, codeVerifier: start.codeVerifier, next })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(env.SESSION_SECRET));
  return new Response(null, {
    status: 302,
    headers: {
      location: start.redirectUrl,
      "set-cookie": `pm_oidc=${transient}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${env.APP_BASE_URL.startsWith("https://") ? "; Secure" : ""}`,
    },
  });
});
