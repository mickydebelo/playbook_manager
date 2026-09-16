import { redirect } from "next/navigation";
import { MyPlaybooks } from "@/features/playbooks/MyPlaybooks";
import { getServerUser } from "@/server/auth/server-session";
import { getDb } from "@/server/db/client";
import { listPlaybooks } from "@/server/modules/playbooks/service";

export const dynamic = "force-dynamic";

export default async function PlaybooksPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");
  const playbooks = await listPlaybooks(await getDb(), user);
  return <MyPlaybooks initial={playbooks} />;
}
