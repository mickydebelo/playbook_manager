import { notFound, redirect } from "next/navigation";
import { PlaybookWorkspace } from "@/features/playbooks/PlaybookWorkspace";
import { getServerUser } from "@/server/auth/server-session";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/http/errors";
import { getPlaybook } from "@/server/modules/playbooks/service";
import { stageSchema } from "@/shared/contracts";

export const dynamic = "force-dynamic";

export default async function PlaybookPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const user = await getServerUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const { step } = await searchParams;
  let playbook;
  try {
    playbook = await getPlaybook(await getDb(), user, id);
  } catch (err) {
    if (err instanceof AppError && (err.code === "not_found" || err.code === "forbidden")) {
      if (process.env.NODE_ENV !== "production") console.warn(`[playbooks/${id}] ${err.code}: ${err.message}`);
      notFound();
    }
    throw err;
  }
  const parsedStep = stageSchema.safeParse(step);
  const startStep = parsedStep.success ? Math.min(parsedStep.data, playbook.stage) : playbook.stage;
  return <PlaybookWorkspace key={playbook.id} initial={playbook} user={user} startStep={startStep} />;
}
