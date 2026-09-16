import { clearSessionCookieHeader } from "@/server/auth/session";
import { defineRoute } from "@/server/http/handler";

export const POST = defineRoute({ auth: false }, async () => {
  return new Response(null, { status: 204, headers: { "set-cookie": clearSessionCookieHeader() } });
});
