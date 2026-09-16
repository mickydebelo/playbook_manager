import { redirect } from "next/navigation";
import { HelpView } from "@/features/help/HelpView";
import { getServerUser } from "@/server/auth/server-session";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");
  return <HelpView user={user} />;
}
