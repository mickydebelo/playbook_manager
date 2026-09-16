import { redirect } from "next/navigation";

// The design opens on "Create playbook".
export default function Home() {
  redirect("/playbooks/new");
}
