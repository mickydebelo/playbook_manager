"use client";
import { sx } from "@/lib/ui/sx";
import type { WorkspaceVals } from "@/features/workspace/types";

export function HelpScreen({ v }: { v: WorkspaceVals }) {
  return (
    <div data-screen-label="Help" style={sx("flex:1;overflow:auto;padding:32px 48px;animation:pm-fade .2s ease")}>
      <h1 style={sx("font:var(--text-h2);font-family:var(--font-legend);margin:0 0 8px")}>Help</h1>
      <p style={sx("font:var(--text-body);color:var(--slate);margin:0 0 24px;max-width:640px")}>How a playbook comes together, in four steps.</p>
      <div style={sx("display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;max-width:1000px")}>
        {v.helpSteps.map((h: any) => (
          <div key={h.n} style={sx("border:1px solid var(--slate-200);border-radius:var(--radius-lg);padding:20px;display:flex;flex-direction:column;gap:8px")}>
            <span style={sx("font:var(--text-h2);font-family:var(--font-legend)")}>{h.n}</span>
            <span style={sx("font:var(--text-h4)")}>{h.title}</span>
            <span style={sx("font:var(--text-body-sm);color:var(--slate);text-wrap:pretty")}>{h.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
