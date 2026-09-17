"use client";
import Link from "next/link";
import { sx } from "@/lib/ui/sx";
import { ICONS, type IconName } from "@/features/workspace/icons";
import type { UserDto } from "@/shared/contracts";

/** Quick links into the main areas of the app, shown as cards on the landing screen. */
const QUICK_START: { icon: IconName; title: string; desc: string; href: string; cta: string }[] = [
  { icon: "plus", title: "Create a playbook", desc: "Start from a brief and let retrieval propose a structure and sources.", href: "/playbooks/new", cta: "Start now" },
  { icon: "doc", title: "My playbooks", desc: "Pick up a draft, continue editing, or review and deliver.", href: "/playbooks", cta: "Open" },
  { icon: "lib", title: "Knowledge library", desc: "Upload and curate the PDFs, decks and docs the assistant draws from.", href: "/library", cta: "Browse" },
  { icon: "grid", title: "Templates", desc: "Reuse a proven chapter structure as a starting point.", href: "/templates", cta: "Explore" },
];

/** The four wizard stages, mirroring the copy in useWorkspace's helpSteps. */
const STEPS: { n: string; title: string; desc: string }[] = [
  { n: "1", title: "Define brief", desc: "Describe the customer, objective and focus areas. Optional sources and context sharpen the search." },
  { n: "2", title: "Find & trust", desc: "Review the proposed structure and pick approved sources per section. Every source shows status, age and relevance." },
  { n: "3", title: "Edit & create", desc: "Refine each section with the editor or the assistant. Citations stay attached to the text they support." },
  { n: "4", title: "Review & deliver", desc: "Tailor for the customer, pass the readiness check, then export or share for feedback." },
];

export function WelcomeScreen({ user }: { user: UserDto }) {
  const firstName = user.name.split(/\s+/)[0] || user.name;
  return (
    <div data-screen-label="Welcome" style={sx("flex:1;overflow:auto;padding:32px 48px;animation:pm-fade .2s ease")}>
      {/* Hero */}
      <div style={sx("display:flex;flex-direction:column;gap:12px;max-width:720px")}>
        <span style={sx("font:var(--text-label);letter-spacing:.08em;text-transform:uppercase;color:var(--slate)")}>Playbook Manager</span>
        <h1 style={sx("font:var(--text-h1);font-family:var(--font-legend);margin:0")}>Welcome, {firstName}</h1>
        <p style={sx("font:var(--text-body-lg);color:var(--slate);margin:0;text-wrap:pretty")}>
          Build digital transformation playbooks your customers trust. Describe the engagement, let retrieval assemble a
          structure from approved knowledge, refine it with the AI assistant, then tailor and deliver.
        </p>
      </div>

      {/* Quick start */}
      <h2 style={sx("font:var(--text-h4);margin:32px 0 16px")}>Get started</h2>
      <div style={sx("display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;max-width:1040px")}>
        {QUICK_START.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="hv-shadow"
            style={sx("text-decoration:none;color:var(--adsk-black);border:1px solid var(--slate-200);border-radius:var(--radius-lg);padding:20px;display:flex;flex-direction:column;gap:12px;background:var(--adsk-white);transition:box-shadow .15s ease")}
          >
            <span aria-hidden style={sx("width:40px;height:40px;border-radius:50%;background:var(--warm-slate-100);display:flex;align-items:center;justify-content:center;color:var(--adsk-black)")} dangerouslySetInnerHTML={{ __html: ICONS[c.icon] }} />
            <span style={sx("font:var(--text-h4);font-size:16px")}>{c.title}</span>
            <span style={sx("font:var(--text-body-sm);color:var(--slate);flex:1;text-wrap:pretty")}>{c.desc}</span>
            <span style={sx("display:inline-flex;align-items:center;gap:6px;font:var(--text-button);color:var(--adsk-black)")}>
              {c.cta}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </Link>
        ))}
      </div>

      {/* How it works */}
      <h2 style={sx("font:var(--text-h4);margin:36px 0 16px")}>How a playbook comes together</h2>
      <div style={sx("display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;max-width:1040px")}>
        {STEPS.map((h) => (
          <div key={h.n} style={sx("border:1px solid var(--slate-200);border-radius:var(--radius-lg);padding:20px;display:flex;flex-direction:column;gap:8px")}>
            <span style={sx("font:var(--text-h2);font-family:var(--font-legend)")}>{h.n}</span>
            <span style={sx("font:var(--text-h4)")}>{h.title}</span>
            <span style={sx("font:var(--text-body-sm);color:var(--slate);text-wrap:pretty")}>{h.desc}</span>
          </div>
        ))}
      </div>

      <div style={sx("margin-top:32px")}>
        <Link href="/playbooks/new" style={sx("display:inline-flex;align-items:center;gap:8px;height:52px;padding:0 28px;border-radius:var(--radius-sm);background:var(--adsk-black);color:var(--adsk-white);text-decoration:none;font:700 16px/20px var(--font-element)")}>
          Create playbook
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>
      </div>
    </div>
  );
}
