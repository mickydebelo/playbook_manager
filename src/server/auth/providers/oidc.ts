import * as client from "openid-client";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { users } from "../../db/schema";
import { bootstrapAdminEmails, getEnv } from "../../env";
import { AppError } from "../../http/errors";
import { toUserDto } from "../current-user";
import type { UserDto } from "@/shared/contracts";

/**
 * Corporate SSO via OpenID Connect (authorization code + PKCE).
 * Works with Microsoft Entra ID and Autodesk ID; only the issuer/client settings differ.
 * The transient PKCE verifier and state are kept in a short-lived cookie by the route handler.
 */
let configPromise: Promise<client.Configuration> | null = null;

function getConfig(): Promise<client.Configuration> {
  if (!configPromise) {
    const env = getEnv();
    if (!env.OIDC_ISSUER || !env.OIDC_CLIENT_ID) throw new AppError("internal", "OIDC is not configured");
    configPromise = client.discovery(new URL(env.OIDC_ISSUER), env.OIDC_CLIENT_ID, env.OIDC_CLIENT_SECRET || undefined);
  }
  return configPromise;
}

export type OidcStart = { redirectUrl: string; state: string; codeVerifier: string };

export async function startOidcLogin(): Promise<OidcStart> {
  const config = await getConfig();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const redirectUrl = client
    .buildAuthorizationUrl(config, {
      redirect_uri: getEnv().OIDC_REDIRECT_URI,
      scope: "openid profile email",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
    })
    .toString();
  return { redirectUrl, state, codeVerifier };
}

export async function completeOidcLogin(
  db: Db,
  currentUrl: URL,
  expected: { state: string; codeVerifier: string },
): Promise<UserDto> {
  const config = await getConfig();
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: expected.codeVerifier,
    expectedState: expected.state,
  });
  const claims = tokens.claims();
  if (!claims?.sub) throw new AppError("unauthenticated", "Identity provider returned no subject");
  const email = String(claims.email ?? claims.preferred_username ?? "").toLowerCase();
  const name = String(claims.name ?? email);
  if (!email) throw new AppError("unauthenticated", "Identity provider returned no e-mail");

  const admins = bootstrapAdminEmails();
  const existing = await db
    .select()
    .from(users)
    .where(sql`${users.idpSubject} = ${claims.sub} OR lower(${users.email}) = ${email}`)
    .limit(1);
  const now = new Date();
  if (existing[0]) {
    const row = existing[0];
    if (row.disabledAt) throw new AppError("forbidden", "This account is disabled");
    const [updated] = await db
      .update(users)
      .set({ idpSubject: claims.sub, name, lastLoginAt: now, updatedAt: now, ...(admins.has(email) ? { role: "admin" as const } : {}) })
      .where(eq(users.id, row.id))
      .returning();
    return toUserDto(updated!);
  }
  const [created] = await db
    .insert(users)
    .values({ email, name, idpSubject: claims.sub, role: admins.has(email) ? "admin" : "author", lastLoginAt: now })
    .returning();
  return toUserDto(created!);
}
