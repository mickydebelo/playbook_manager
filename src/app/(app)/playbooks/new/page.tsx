import { redirect } from "next/navigation";
import { PlaybookWorkspace } from "@/features/playbooks/PlaybookWorkspace";
import { getServerUser } from "@/server/auth/server-session";

export const dynamic = "force-dynamic";

export default async function NewPlaybookPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const user = await getServerUser();
  if (!user) redirect("/login");
  const { template } = await searchParams;
  return <PlaybookWorkspace key={template ?? "new"} initial={null} user={user} startStep={1} templateId={template ?? null} />;
}
