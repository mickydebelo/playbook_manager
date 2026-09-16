"use client";
import { useRef } from "react";
import { sx, sxm } from "@/lib/ui/sx";
import { Button, Badge } from "@/components/ds";
import type { WorkspaceVals } from "@/features/workspace/types";

export function KnowledgeLibrary({ v }: { v: WorkspaceVals }) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <div data-screen-label="Knowledge library" style={sx("flex:1;overflow:auto;padding:32px 48px;animation:pm-fade .2s ease")}>
      <div style={sx("display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:24px")}>
        <div><h1 style={sx("font:var(--text-h2);font-family:var(--font-legend);margin:0 0 8px")}>Knowledge library</h1><p style={sx("font:var(--text-body);color:var(--slate);margin:0")}>Approved and reviewed sources the playbook engine draws from.</p></div>
        <div>
          <input ref={picker} type="file" accept={v.uploadAccept} onChange={v.uploadSource} style={sx("display:none")} />
          <Button variant="secondary" disabled={v.uploading} onClick={() => picker.current?.click()}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V5M7 10l5-5 5 5M4 20h16" /></svg>{v.uploading ? "Indexing…" : "Upload source"}</Button>
        </div>
      </div>
      <div style={sx("display:flex;gap:12px;align-items:center;margin-bottom:20px;flex-wrap:wrap")}>
        <div style={sx("position:relative;flex:1;min-width:240px;max-width:420px")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={sx("position:absolute;left:12px;top:12px;color:var(--slate)")}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input value={v.libQuery} onChange={v.setLibQuery} placeholder="Search the library" style={sx("width:100%;height:40px;padding:0 12px 0 38px;border:1px solid var(--slate-200);border-radius:var(--radius-md);font:var(--text-body-sm)")} />
        </div>
        {v.libFilters.map((f: any) => (<button key={f.label} onClick={f.pick} style={sxm("height:32px;padding:0 14px;border-radius:var(--radius-sm);font:var(--text-body-sm);cursor:pointer", { border: `1px solid ${f.border}`, background: f.bg, color: f.color })}>{f.label}</button>))}
      </div>
      <div style={sx("display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px")}>
        {v.library.map((k: any) => (
          <div key={k.id} onClick={k.preview} style={sx("display:flex;gap:12px;padding:16px;border:1px solid var(--slate-200);border-radius:var(--radius-lg);cursor:pointer;background:var(--adsk-white)")} className="hv-shadow">
            <span style={sxm("width:36px;height:36px;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;font:var(--text-label);flex-shrink:0", { background: k.typeBg, color: k.typeColor })}>{k.typeLabel}</span>
            <div style={sx("flex:1;min-width:0;display:flex;flex-direction:column;gap:4px")}>
              <span style={sx("font:var(--text-body);font-weight:700;text-wrap:pretty")}>{k.title}</span>
              <span style={sx("font:var(--text-body-sm);color:var(--slate)")}>{k.org} · {k.year} · {k.pages} pages</span>
              <div style={sx("display:flex;flex-wrap:wrap;gap:6px;margin-top:6px")}>{k.tags.map((t: any) => (<Badge key={t.label} tone={t.tone}>{t.label}</Badge>))}</div>
              <span style={sx("font:var(--text-caption);color:var(--slate);margin-top:6px")}>Used in {k.usedIn} playbooks</span>
            </div>
          </div>
        ))}
      </div>
      {v.libraryEmpty ? (<div style={sx("padding:48px;text-align:center;font:var(--text-body-sm);color:var(--slate)")}>Nothing matches your search.</div>) : null}
    </div>
  );
}
