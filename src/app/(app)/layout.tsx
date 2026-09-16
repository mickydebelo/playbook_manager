import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Shell } from "@/components/shell/Shell";
import { getServerUser } from "@/server/auth/server-session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getServerUser();
  if (!user) redirect("/login");
  return <Shell user={user}>{children}</Shell>;
}
