"use client";
import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { sx, sxm } from "@/lib/ui/sx";
import { ICONS } from "@/features/workspace/icons";
import type { UserDto } from "@/shared/contracts";
import { api } from "@/lib/api-client";
import { ToastProvider } from "./Toast";

/** Application frame from the design (lines 27–59, 690–702): top bar, left navigation, main area. */
const NAV: { id: string; label: string; icon: keyof typeof ICONS; href: string; match: (p: string) => boolean }[] = [
  { id: "create", label: "Create playbook", icon: "plus", href: "/playbooks/new", match: (p) => p === "/playbooks/new" || /^\/playbooks\/[^/]+$/.test(p) && p !== "/playbooks" },
  { id: "playbooks", label: "My playbooks", icon: "doc", href: "/playbooks", match: (p) => p === "/playbooks" },
  { id: "library", label: "Knowledge library", icon: "lib", href: "/library", match: (p) => p.startsWith("/library") },
  { id: "templates", label: "Templates", icon: "grid", href: "/templates", match: (p) => p.startsWith("/templates") },
];

export function Shell({ user, children }: { user: UserDto; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function signOut() {
    await api.post("/api/auth/logout");
    router.push("/login");
  }

  return (
    <div
      data-screen-label="Playbook Manager"
      style={sx("position:relative;display:flex;flex-direction:column;height:100vh;min-height:720px;font-family:var(--font-element);color:var(--adsk-black);background:var(--adsk-white);font-size:14px;line-height:20px")}
    >
      {/* Top bar */}
      <div style={sx("display:flex;align-items:center;justify-content:space-between;height:56px;padding:0 24px;border-bottom:1px solid var(--slate-100);flex-shrink:0")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-height brand mark, as in the design */}
        <img src="/brand/autodesk-logo.png" alt="Autodesk" style={sx("height:22px;width:auto")} />
        <div style={sx("position:relative")}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            style={sx("display:flex;align-items:center;gap:10px;background:none;border:none;padding:0;cursor:pointer;color:var(--adsk-black)")}
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt={user.name} style={sx("width:32px;height:32px;border-radius:50%;object-fit:cover;border:1px solid var(--slate-200)")} />
            ) : (
              <div style={sx("width:32px;height:32px;border-radius:50%;background:var(--warm-slate-100);border:1px solid var(--slate-200);display:flex;align-items:center;justify-content:center;font:var(--text-label)")}>{initials}</div>
            )}
            <span style={sx("font:var(--text-body-sm)")}>{user.name}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {menuOpen ? (
            <div role="menu" style={sx("position:absolute;right:0;top:40px;min-width:200px;background:var(--adsk-white);border:1px solid var(--slate-200);border-radius:var(--radius-md);box-shadow:var(--shadow-card);padding:8px;z-index:20;display:flex;flex-direction:column;gap:2px")}>
              <div style={sx("padding:8px 12px;font:var(--text-caption);color:var(--slate)")}>{user.email}</div>
              <button type="button" role="menuitem" onClick={signOut} className="hv-slate100" style={sx("text-align:left;height:36px;padding:0 12px;border:none;border-radius:var(--radius-sm);background:none;font:var(--text-body-sm);cursor:pointer")}>
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div style={sx("display:flex;flex:1;min-height:0")}>
        {/* Sidebar */}
        <nav style={sx("width:clamp(168px,18vw,208px);flex-shrink:0;background:var(--warm-slate-100);display:flex;flex-direction:column;padding:24px 16px 32px;border-right:1px solid var(--slate-100)")}>
          <div style={sx("font:var(--text-h4);font-family:var(--font-legend);padding:0 8px;margin-bottom:24px")}>Playbook manager</div>
          <div style={sx("display:flex;flex-direction:column;gap:4px")}>
            {NAV.map((n) => {
              const active = n.match(pathname);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => router.push(n.href)}
                  aria-current={active ? "page" : undefined}
                  className="hv-slate300"
                  style={sxm("display:flex;align-items:center;gap:12px;height:44px;padding:0 12px;border:none;border-radius:var(--radius-md);color:var(--adsk-black);font:var(--text-body-sm);cursor:pointer;text-align:left", {
                    background: active ? "var(--warm-slate-300)" : "transparent",
                  })}
                >
                  <span style={sx("width:20px;height:20px;display:inline-flex")} dangerouslySetInnerHTML={{ __html: ICONS[n.icon] }} />
                  {n.label}
                </button>
              );
            })}
          </div>
          <div style={sx("margin-top:auto;padding:0 8px")}>
            <div style={sx("width:28px;height:2px;background:var(--adsk-black);margin-bottom:16px")} />
            <div style={sx("font:var(--text-body-sm);color:var(--slate)")}>Make Anything</div>
          </div>
        </nav>

        {/* Main */}
        <main style={sx("flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;position:relative")}>
          <ToastProvider>{children}</ToastProvider>
        </main>
      </div>
    </div>
  );
}
