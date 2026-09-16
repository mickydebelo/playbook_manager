import { redirect } from "next/navigation";
import { getServerUser } from "@/server/auth/server-session";
import { getEnv } from "@/server/env";
import { DevLoginForm } from "./DevLoginForm";
import { sx } from "@/lib/ui/sx";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getServerUser();
  const { next } = await searchParams;
  const target = next && next.startsWith("/") ? next : "/";
  if (user) redirect(target);
  const env = getEnv();
  const dev = env.AUTH_PROVIDER === "dev" && env.DEV_LOGIN_ENABLED && env.NODE_ENV !== "production";
  return (
    <div style={sx("min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--warm-slate-100);font-family:var(--font-element);color:var(--adsk-black)")}>
      <div style={sx("width:420px;background:var(--adsk-white);border:1px solid var(--slate-100);border-radius:var(--radius-xl);box-shadow:var(--shadow-card);padding:40px;display:flex;flex-direction:column;gap:24px")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/autodesk-logo.png" alt="Autodesk" style={sx("height:22px;width:auto;align-self:flex-start")} />
        <div>
          <h1 style={sx("font:var(--text-h2);font-family:var(--font-legend);margin:0 0 8px")}>Playbook manager</h1>
          <p style={sx("font:var(--text-body);color:var(--slate);margin:0")}>Sign in with your Autodesk account to author and deliver playbooks.</p>
        </div>
        {dev ? (
          <DevLoginForm next={target} />
        ) : (
          <a href={`/api/auth/login?next=${encodeURIComponent(target)}`} style={sx("display:inline-flex;align-items:center;justify-content:center;height:48px;padding:0 28px;border-radius:var(--radius-sm);background:var(--adsk-black);color:var(--adsk-white);font:700 16px/20px var(--font-element);text-decoration:none")}>
            Continue with Autodesk SSO
          </a>
        )}
      </div>
    </div>
  );
}
