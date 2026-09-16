import { z } from "zod";
import { devLogin } from "@/server/auth/providers/dev";
import { sessionCookieHeader, signSession } from "@/server/auth/session";
import { defineRoute, json } from "@/server/http/handler";

export const POST = defineRoute(
  { auth: false, body: z.object({ email: z.string().email() }) },
  async ({ db, body }) => {
    const user = await devLogin(db, body.email);
    const token = await signSession({ sub: user.id, role: user.role, email: user.email, name: user.name });
    return json(user, { headers: { "set-cookie": sessionCookieHeader(token) } });
  },
);
