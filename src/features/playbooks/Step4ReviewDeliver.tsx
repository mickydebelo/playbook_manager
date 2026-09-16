"use client";
import { Fragment } from "react";
import { sx, sxm } from "@/lib/ui/sx";
import { Button, Checkbox, Tabs } from "@/components/ds";
import type { WorkspaceVals } from "@/features/workspace/types";

export function Step4ReviewDeliver({ v }: { v: WorkspaceVals }) {
  return (
    <div data-screen-label="4 Review and deliver" style={sx("flex:1;min-height:0;overflow:auto;padding:24px 40px 0;animation:pm-fade .2s ease")}>
      <div style={sx("display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:16px")}>
        <div>
          <div style={sx("font:var(--text-label);letter-spacing:.06em;color:var(--slate);text-transform:uppercase;margin-bottom:12px")}>Review & deliver</div>
          <h1 style={sx("font:var(--text-h2);font-family:var(--font-legend);margin:0 0 8px")}>Your playbook is <span style={sx("background:var(--hello-yellow);padding:0 6px")}>{v.readyWord}</span></h1>
          <p style={sx("font:var(--text-body);color:var(--slate);margin:0")}>Review your playbook, tailor it for {v.customerName}, and export it in your preferred format.</p>
        </div>
        <div style={sx("display:flex;gap:10px;flex-shrink:0")}>
          <Button variant="secondary" onClick={v.openShare}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-4-6" /></svg>Share for feedback</Button>
          <button onClick={v.toast_more} aria-label="More" style={sx("width:40px;height:40px;border:1px solid var(--slate-200);border-radius:var(--radius-sm);background:var(--adsk-white);cursor:pointer;font-weight:700;letter-spacing:.1em")} className="hv-op75">···</button>
        </div>
      </div>
      <div style={sx("display:grid;grid-template-columns:minmax(0,1.4fr) minmax(320px,1fr);gap:32px;padding-bottom:24px")}>
        <div>
          <Tabs items={v.reviewTabs} active={v.reviewTab} onChange={v.setReviewTab} />
          {v.reviewIsDoc ? (
            <div style={sx("margin-top:16px;border:1px solid var(--slate-200);border-radius:var(--radius-md);background:var(--warm-slate-100);overflow:hidden")}>
              <div style={sx("display:flex;align-items:center;justify-content:center;gap:16px;height:44px;background:var(--adsk-white);border-bottom:1px solid var(--slate-200);font:var(--text-body-sm)")}>
                <button onClick={v.docPrevPage} aria-label="Previous page" style={sx("width:28px;height:28px;border:none;background:none;cursor:pointer")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" /></svg></button>
                <span>{v.docPage} / {v.docPageCount}</span>
                <button onClick={v.docNextPage} aria-label="Next page" style={sx("width:28px;height:28px;border:none;background:none;cursor:pointer")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg></button>
                <span style={sx("width:1px;height:20px;background:var(--slate-200)")} />
                <button onClick={v.docZoomOut} aria-label="Zoom out" style={sx("width:28px;height:28px;border:none;background:none;cursor:pointer")}>−</button><span style={sx("min-width:44px;text-align:center")}>{v.docZoom}%</span><button onClick={v.docZoomIn} aria-label="Zoom in" style={sx("width:28px;height:28px;border:none;background:none;cursor:pointer")}>+</button>
              </div>
              {v.hasDocument ? (
                <div style={sx("padding:24px;display:flex;justify-content:center;overflow:auto;max-height:70vh")}>
                  {/* A transformed element keeps its original layout box, so the wrapper is sized to
                      the scaled dimensions. Without this the page is clipped rather than scrollable. */}
                  <div style={sxm("flex-shrink:0;box-shadow:var(--shadow-card);background:var(--adsk-white)", { width: `${Math.round(794 * v.docScale)}px`, height: `${Math.round(1123 * v.docScale)}px` })}>
                    <iframe
                      ref={v.previewRef}
                      title="Document preview"
                      src={v.previewUrl}
                      sandbox="allow-same-origin"
                      style={sxm("width:794px;height:1123px;border:none;display:block;transform-origin:top left", { transform: `scale(${v.docScale})` })}
                    />
                  </div>
                </div>
              ) : (
                <div style={sx("padding:48px;text-align:center;font:var(--text-body-sm);color:var(--slate)")}>Create a draft to see the document.</div>
              )}
            </div>
          ) : null}
          {v.reviewIsStructure ? (
            <div style={sx("margin-top:16px;border:1px solid var(--slate-200);border-radius:var(--radius-md);padding:8px")}>
              {v.outlineFlat.map((o) => (
                <div key={o.key} style={sxm("display:flex;align-items:center;gap:10px;height:40px;font:var(--text-body-sm)", { padding: `0 8px 0 ${o.pad}`, fontWeight: o.weight, borderTop: o.borderTop })}><span style={sx("flex:1")}>{o.n} {o.title}</span><span style={sx("color:var(--slate);font-weight:400")}>{o.count} sources</span></div>
              ))}
            </div>
          ) : null}
        </div>
        <div style={sx("display:flex;flex-direction:column;gap:16px")}>
          <div style={sx("border:1px solid var(--slate-200);border-radius:var(--radius-lg);padding:20px;display:flex;gap:16px")}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={sx("flex-shrink:0")}><path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h8M16 17h4" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="14" cy="17" r="2" /></svg>
            <div style={sx("display:flex;flex-direction:column;gap:12px;flex:1")}>
              <div><div style={sx("font:var(--text-h4)")}>Tailor for {v.customerName}</div><div style={sx("font:var(--text-body-sm);color:var(--slate)")}>Adjust the playbook for your customer and audience.</div></div>
              {v.tailor.map((t: any, i: number) => (<Checkbox key={i} label={t.label} checked={t.checked} onChange={t.toggle} />))}
            </div>
          </div>
          <div style={sx("border:1px solid var(--slate-200);border-radius:var(--radius-lg);padding:20px;display:flex;gap:16px")}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={sx("flex-shrink:0")}><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></svg>
            <div style={sx("display:flex;flex-direction:column;gap:12px;flex:1")}>
              <div><div style={sx("font:var(--text-h4)")}>Readiness check</div><div style={sx("font:var(--text-body-sm);color:var(--slate)")}>We&apos;ve checked your playbook against key criteria.</div></div>
              {v.readiness.map((r: any, i: number) => (
                <div key={i} style={sx("display:flex;align-items:center;gap:10px;font:var(--text-body-sm)")}>
                  <span style={sxm("width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0", { background: r.bg, color: r.fg })}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d={r.path} /></svg></span>
                  {r.ok ? (<span style={{ fontWeight: r.weight }}>{r.label}</span>) : null}
                  {r.fail ? (<Fragment><button onClick={r.fix} style={sx("border:none;background:none;padding:0;cursor:pointer;font:var(--text-body-sm);color:var(--adsk-black);text-decoration:underline;text-align:left")}>{r.label}</button><span style={sx("font:var(--text-caption);color:var(--slate)")}>{r.hint}</span></Fragment>) : null}
                </div>
              ))}
            </div>
          </div>
          <div style={sx("border:1px solid var(--slate-200);border-radius:var(--radius-lg);padding:20px;display:flex;gap:16px")}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={sx("flex-shrink:0")}><path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8z" /><path d="M14 3v5h5M8 13h8M8 17h5" /></svg>
            <div style={sx("display:flex;flex-direction:column;gap:12px;flex:1;min-width:0")}>
              <div><div style={sx("font:var(--text-h4)")}>Export and share</div><div style={sx("font:var(--text-body-sm);color:var(--slate)")}>Choose a format and share with your team or customer.</div></div>
              <select value={v.exportFormat} onChange={v.setExportFormat} style={sx("height:44px;padding:0 12px;border:1px solid var(--slate-200);border-radius:var(--radius-md);font:var(--text-body-sm);background:var(--adsk-white)")}>
                {v.exportFormats.map((f: { value: string; label: string; supported: boolean }) => (
                  <option key={f.value} value={f.value} disabled={!f.supported}>{f.label}</option>
                ))}
              </select>
              <div style={sx("display:flex;gap:24px;flex-wrap:wrap")}>
                <Checkbox label="Include source list" checked={v.includeSources} onChange={v.setIncludeSources} />
                <Checkbox label="Include comments" checked={v.includeComments} onChange={v.setIncludeComments} disabled={v.commentsUnavailable} />
              </div>
              <div style={sx("display:grid;grid-template-columns:1fr 1fr;gap:10px")}>
                <Button variant="primary" size="lg" disabled={v.exportDisabled} onClick={v.exportPlaybook} style={v.centerStyle}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4v11M7 10l5 5 5-5M4 20h16" /></svg>{v.exportLabel}</Button>
                <Button variant="secondary" size="lg" onClick={v.shareLink} style={v.centerStyle}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></svg>Share link</Button>
              </div>
              {v.downloadName ? (
                <a href={v.downloadUrl} download={v.downloadName} style={sx("display:inline-flex;align-items:center;gap:8px;font:var(--text-body-sm);color:var(--adsk-black)")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4v11M7 10l5 5 5-5M4 20h16" /></svg>
                  <span style={sx("text-decoration:underline")}>Download {v.downloadName}</span>
                </a>
              ) : null}
              <div style={sx("display:none")}>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={sx("display:flex;justify-content:space-between;align-items:center;padding:16px 0 24px;border-top:1px solid var(--slate-100)")}>
        <Button variant="ghost" onClick={v.goStep3}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>Back</Button>
        <Button variant="ghost" onClick={v.saveTemplate}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8z" /><path d="M14 3v5h5" /></svg><span style={sx("text-decoration:underline")}>Save as template</span></Button>
      </div>
    </div>
  );
}
