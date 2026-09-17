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
              {v.canCurate ? (
                <div style={sx("display:flex;gap:8px;margin-top:10px")} onClick={(e) => e.stopPropagation()}>
                  {k.status !== "approved" ? (
                    <button type="button" onClick={() => v.approveSource(k.id)} style={sx("height:28px;padding:0 12px;border:1px solid var(--morning-600);border-radius:var(--radius-sm);background:var(--morning-600);color:var(--adsk-white);font:var(--text-caption);cursor:pointer")} className="hv-op80">Approve</button>
                  ) : null}
                  {k.status !== "archived" ? (
                    <button type="button" onClick={() => v.archiveSource(k.id)} style={sx("height:28px;padding:0 12px;border:1px solid var(--slate-200);border-radius:var(--radius-sm);background:var(--adsk-white);font:var(--text-caption);cursor:pointer")} className="hv-slate100">Archive</button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {v.libraryEmpty ? (
        v.libraryFiltering ? (
          <div style={sx("padding:48px;text-align:center;font:var(--text-body-sm);color:var(--slate)")}>Nothing matches your search.</div>
        ) : (
          <div style={sx("padding:56px 40px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px")}>
            <div style={sx("width:44px;height:44px;border-radius:var(--radius-md);background:var(--warm-slate-100);display:flex;align-items:center;justify-content:center;color:var(--slate)")}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V5M7 10l5-5 5 5M4 20h16" /></svg>
            </div>
            <div style={sx("font:var(--text-h4);font-size:18px")}>No sources yet</div>
            <div style={sx("font:var(--text-body-sm);color:var(--slate);max-width:420px")}>Upload a PDF, Word or PowerPoint file. It is parsed, chunked and page-indexed in the background, then a curator approves it to make it retrievable.</div>
            <Button variant="secondary" disabled={v.uploading} onClick={() => picker.current?.click()} style={{ marginTop: 4 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V5M7 10l5-5 5 5M4 20h16" /></svg>{v.uploading ? "Indexing…" : "Upload source"}</Button>
          </div>
        )
      ) : null}
    </div>
  );
}
