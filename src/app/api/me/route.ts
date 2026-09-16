import { defineRoute, json } from "@/server/http/handler";

export const GET = defineRoute({}, async ({ user }) => json(user));
