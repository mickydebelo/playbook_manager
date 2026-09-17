import { redirect } from "next/navigation";
import { WelcomeScreen } from "@/features/welcome/WelcomeScreen";
import { getServerUser } from "@/server/auth/server-session";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const user = await getServerUser();
  if (!user) redirect("/login");
  return <WelcomeScreen user={user} />;
}
