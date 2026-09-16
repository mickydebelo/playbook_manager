import { redirect } from "next/navigation";
import { LibraryView } from "@/features/library/LibraryView";
import { getServerUser } from "@/server/auth/server-session";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");
  return <LibraryView user={user} />;
}
