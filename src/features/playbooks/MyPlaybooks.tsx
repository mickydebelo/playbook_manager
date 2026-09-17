"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ds";
import { sx, sxm } from "@/lib/ui/sx";
import type { PlaybookSummary } from "@/shared/contracts";
import { INDUSTRY_SHORT, PLAYBOOK_STATUS_LABELS, PLAYBOOK_STATUS_TONES, STAGE_LABELS, type PlaybookStatus } from "@/shared/enums";

/** "My playbooks" (design lines 592–618), backed by GET /api/playbooks (server-rendered, filtered client-side like the prototype). */
const FILTERS: { label: string; status: PlaybookStatus | null }[] = [
  { label: "All", status: null },
  { label: "Draft", status: "draft" },
  { label: "In review", status: "in_review" },
  { label: "Delivered", status: "delivered" },
];

export function formatUpdated(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  if (d >= startOfToday) return `Today, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  if (d >= startOfYesterday) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function stageLabel(p: PlaybookSummary): string {
  return p.status === "delivered" ? "Delivered" : STAGE_LABELS[p.stage];
}

export function MyPlaybooks({ initial }: { initial: PlaybookSummary[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("All");
  const active = FILTERS.find((f) => f.label === filter) ?? FILTERS[0]!;
  const rows = useMemo(() => initial.filter((p) => !active.status || p.status === active.status), [initial, active]);

  return (
    <div data-screen-label="My playbooks" style={sx("flex:1;overflow:auto;padding:32px 48px;animation:pm-fade .2s ease")}>
      <div style={sx("display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:24px")}>
        <div>
          <h1 style={sx("font:var(--text-h2);font-family:var(--font-legend);margin:0 0 8px")}>My playbooks</h1>
          <p style={sx("font:var(--text-body);color:var(--slate);margin:0")}>{initial.length} playbooks · pick up where you left off.</p>
        </div>
        <Button variant="primary" onClick={() => router.push("/playbooks/new")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>Create playbook
        </Button>
      </div>
      <div style={sx("display:flex;gap:8px;margin-bottom:16px")}>
        {FILTERS.map((f) => {
          const on = f.label === filter;
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => setFilter(f.label)}
              aria-pressed={on}
              style={sxm("height:32px;padding:0 14px;border-radius:var(--radius-sm);font:var(--text-body-sm);cursor:pointer", {
                border: `1px solid ${on ? "var(--adsk-black)" : "var(--slate-200)"}`,
                background: on ? "var(--adsk-black)" : "var(--adsk-white)",
                color: on ? "var(--adsk-white)" : "var(--adsk-black)",
              })}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      <div style={sx("border:1px solid var(--slate-200);border-radius:var(--radius-md);overflow:hidden")}>
        <div style={sx("display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1.4fr) minmax(90px,auto) minmax(0,1fr) minmax(0,1fr);gap:16px;padding:12px 20px;background:var(--warm-slate-100);font:var(--text-label);color:var(--slate);text-transform:uppercase;letter-spacing:.04em")}>
          <span>Playbook</span><span>Customer</span><span>Status</span><span>Stage</span><span>Updated</span>
        </div>
        {rows.map((p) => (
          <div
            key={p.id}
            role="link"
            tabIndex={0}
            onClick={() => router.push(`/playbooks/${p.id}?step=${p.stage}`)}
            onKeyDown={(e) => { if (e.key === "Enter") router.push(`/playbooks/${p.id}?step=${p.stage}`); }}
            className="hv-slate100"
            style={sx("display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1.4fr) minmax(90px,auto) minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:center;padding:14px 20px;border-top:1px solid var(--slate-100);cursor:pointer;font:var(--text-body-sm)")}
          >
            <span style={sx("font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{p.title}</span>
            <span style={sx("color:var(--slate)")}>{p.customer.name} · {INDUSTRY_SHORT[p.customer.industry]}</span>
            <span><Badge tone={PLAYBOOK_STATUS_TONES[p.status]}>{PLAYBOOK_STATUS_LABELS[p.status]}</Badge></span>
            <span style={sx("color:var(--slate)")}>{stageLabel(p)}</span>
            <span style={sx("color:var(--slate)")}>{formatUpdated(p.updatedAt)}</span>
          </div>
        ))}
        {rows.length === 0 ? (
          initial.length === 0 ? (
            <div style={sx("padding:56px 40px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px")}>
              <div style={sx("width:44px;height:44px;border-radius:var(--radius-md);background:var(--warm-slate-100);display:flex;align-items:center;justify-content:center;color:var(--slate)")}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></svg>
              </div>
              <div style={sx("font:var(--text-h4);font-size:18px")}>Create your first playbook</div>
              <div style={sx("font:var(--text-body-sm);color:var(--slate);max-width:420px")}>Start from a customer brief and the engine proposes a structure, gathers sources and drafts each section.</div>
              <Button variant="primary" onClick={() => router.push("/playbooks/new")} style={{ marginTop: 4 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>Create playbook
              </Button>
            </div>
          ) : (
            <div style={sx("padding:40px;text-align:center;font:var(--text-body-sm);color:var(--slate)")}>No {active.label.toLowerCase()} playbooks yet.</div>
          )
        ) : null}
      </div>
    </div>
  );
}
