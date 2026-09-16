import { listDevUsers } from "@/server/auth/providers/dev";
import { getEnv } from "@/server/env";
import { forbidden } from "@/server/http/errors";
import { defineRoute, json } from "@/server/http/handler";

export const GET = defineRoute({ auth: false }, async ({ db }) => {
  const env = getEnv();
  if (env.NODE_ENV === "production" || env.AUTH_PROVIDER !== "dev" || !env.DEV_LOGIN_ENABLED) throw forbidden("Development sign-in is disabled");
  return json(await listDevUsers(db));
});
