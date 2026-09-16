"use client";
import { sx, sxm } from "@/lib/ui/sx";
import { Button } from "@/components/ds";
import type { WorkspaceVals } from "@/features/workspace/types";

export function TemplatesScreen({ v }: { v: WorkspaceVals }) {
  return (
    <div data-screen-label="Templates" style={sx("flex:1;overflow:auto;padding:32px 48px;animation:pm-fade .2s ease")}>
      <div style={sx("margin-bottom:24px")}><h1 style={sx("font:var(--text-h2);font-family:var(--font-legend);margin:0 0 8px")}>Templates</h1><p style={sx("font:var(--text-body);color:var(--slate);margin:0")}>Start from a proven structure. Templates pre-fill the outline and focus areas.</p></div>
      <div style={sx("display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px")}>
        {v.templates.map((t: any, i: number) => (
          <div key={t.id ?? i} style={sx("display:flex;flex-direction:column;border:1px solid var(--slate-100);border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-card);background:var(--adsk-white)")}>
            <div style={sxm("height:120px;position:relative;overflow:hidden", { background: t.bg })}>
              {t.hasImage ? (<img src="/brand/cover.jpg" alt="" style={sx("width:100%;height:100%;object-fit:cover")} />) : null}
              <span style={sxm("position:absolute;left:16px;bottom:12px;font:var(--text-label);letter-spacing:.06em;text-transform:uppercase", { color: t.fg })}>{t.kind}</span>
            </div>
            <div style={sx("padding:20px;display:flex;flex-direction:column;gap:8px;flex:1")}>
              <div style={sx("font:var(--text-h4)")}>{t.title}</div>
              <div style={sx("font:var(--text-body-sm);color:var(--slate);text-wrap:pretty")}>{t.desc}</div>
              <div style={sx("font:var(--text-caption);color:var(--slate);margin-top:auto")}>{t.sections} sections · used {t.uses} times</div>
              <div style={sx("margin-top:8px")}><Button variant="secondary" size="sm" onClick={t.use}>Use template</Button></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
