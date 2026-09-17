import { redirect } from "next/navigation";

// Authenticated users land on the welcome/landing screen; the (app) layout gates auth from there.
export default function Home() {
  redirect("/welcome");
}
