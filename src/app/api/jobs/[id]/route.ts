import { defineRoute, json } from "@/server/http/handler";
import { getJobDto } from "@/server/modules/jobs";

// Polled by the wizard while "Finding relevant knowledge…" / "Creating draft…" is showing.
export const GET = defineRoute({}, async ({ db, params }) => json(await getJobDto(db, params.id!)));
