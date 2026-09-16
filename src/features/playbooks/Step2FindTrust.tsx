"use client";
import { Fragment } from "react";
import { sx, sxm } from "@/lib/ui/sx";
import { Button, Badge, Checkbox, ProgressBar, Tabs } from "@/components/ds";
import type { WorkspaceVals } from "@/features/workspace/types";

export function Step2FindTrust({ v }: { v: WorkspaceVals }) {
  return (
    <div data-screen-label="2 Find and trust" style={sx("flex:1;min-height:0;display:flex;flex-direction:column;padding:24px 32px 0;animation:pm-fade .2s ease")}>
      <div style={sx("margin-bottom:20px")}>
        <div style={sx("font:var(--text-label);letter-spacing:.06em;color:var(--slate);text-transform:uppercase;margin-bottom:12px")}>Find & trust</div>
        <h1 style={sx("font:var(--text-h2);font-family:var(--font-legend);margin:0 0 8px;text-wrap:pretty")}>Review the suggested structure and explore <span style={sx("background:var(--hello-yellow);padding:0 6px")}>relevant knowledge</span></h1>
        <p style={sx("font:var(--text-body);color:var(--slate);margin:0")}>Select a section to see recommended sources. Review and choose the content you want to include in your playbook.</p>
      </div>
      <div style={sxm("flex:1;min-height:0;display:grid;gap:16px", { gridTemplateColumns: v.step2Cols })}>
        {/* Structure */}
        <div style={sx("border:1px solid var(--slate-200);border-radius:var(--radius-md);display:flex;flex-direction:column;min-height:0;overflow:hidden")}>
          <div style={sx("display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:12px 8px 12px 16px;border-bottom:1px solid var(--slate-100)")}>
            <span style={sx("font:var(--text-h4);font-size:16px")}>Suggested structure</span>
            <div style={sx("display:flex;gap:8px")}>
              <button onClick={v.addChapter} style={sx("display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 12px;border:1px solid var(--slate-200);border-radius:var(--radius-sm);background:var(--adsk-white);font:var(--text-body-sm);cursor:pointer;white-space:nowrap")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>Add chapter</button>
            </div>
          </div>
          <div style={sx("flex:1;overflow:auto;padding:4px 8px")}>
            {v.outline.map((o, i) => (
              <div key={o.key ?? i}>
                <div onClick={o.select} style={sxm("display:flex;align-items:center;gap:8px;height:40px;border-radius:var(--radius-sm);cursor:pointer", { padding: `0 8px 0 ${o.pad}`, background: o.bg, color: o.color, borderTop: o.borderTop })} className="hv-slate100">
                  {o.isChapter ? <button onClick={o.toggle} aria-label="Toggle" style={sx("width:20px;height:20px;border:none;background:none;cursor:pointer;color:var(--slate);display:flex;align-items:center;justify-content:center;padding:0")}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: `rotate(${o.rot})` }}><path d="M9 6l6 6-6 6" /></svg></button> : null}
                  <span style={sxm("flex:1;font:var(--text-body-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis", { fontWeight: o.weight })}>{o.n} {o.title}</span>
                  <span style={sx("font:var(--text-body-sm);color:var(--slate)")}>{o.count}</span>
                  <span style={sxm("width:10px;height:10px;border-radius:50%", { background: o.statusBg })}></span>
                </div>
              </div>
            ))}
            <button onClick={v.addSection} style={sx("margin:12px 8px;display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border:1px solid var(--slate-200);border-radius:var(--radius-sm);background:var(--adsk-white);font:var(--text-body-sm);cursor:pointer")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>Add section</button>
          </div>
          <div style={sx("display:flex;flex-wrap:wrap;gap:12px 16px;padding:12px 16px;border-top:1px solid var(--slate-100);font:var(--text-caption);color:var(--slate)")}>
            <span style={sx("display:inline-flex;align-items:center;gap:6px")}><span style={sx("width:8px;height:8px;border-radius:50%;background:var(--morning-600)")}></span>Well covered</span>
            <span style={sx("display:inline-flex;align-items:center;gap:6px")}><span style={sx("width:8px;height:8px;border-radius:50%;background:var(--dawn)")}></span>Thin coverage</span>
            <span style={sx("display:inline-flex;align-items:center;gap:6px")}><span style={sx("width:8px;height:8px;border-radius:50%;background:var(--slate-300)")}></span>No sources yet</span>
          </div>
        </div>

        {/* Knowledge */}
        <div style={sx("border:1px solid var(--slate-200);border-radius:var(--radius-md);display:flex;flex-direction:column;min-height:0;overflow:hidden")}>
          <div style={sx("padding:16px 16px 12px;border-bottom:1px solid var(--slate-100)")}>
            <div style={sx("font:var(--text-h4);font-size:16px;margin-bottom:8px")}>Knowledge for: {v.selectedTitle}</div>
            <div style={sx("display:flex;align-items:center;gap:8px;flex-wrap:wrap")}>
              <span style={sx("font:var(--text-body-sm);color:var(--slate);margin-right:auto;white-space:nowrap")}>{v.knowledgeCount} relevant sources</span>
              <div style={sx("position:relative")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={sx("position:absolute;left:10px;top:9px;color:var(--slate)")}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                <input value={v.knowledgeQuery} onChange={v.setKnowledgeQuery} placeholder="Search in this section" style={sx("height:32px;width:180px;padding:0 10px 0 30px;border:1px solid var(--slate-200);border-radius:var(--radius-sm);font:var(--text-body-sm)")} />
              </div>
              <button onClick={v.toggleFilter} style={sxm("display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 12px;border:1px solid var(--slate-200);border-radius:var(--radius-sm);font:var(--text-body-sm);cursor:pointer", { background: v.filterBg })}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5h18M6 12h12M10 19h4" /></svg>{v.filterLabel}</button>
            </div>
          </div>
          <div style={sx("flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px")}>
            {v.knowledge.map((k, i) => (
              <div key={k.id ?? i} onClick={k.preview} style={sxm("display:flex;gap:12px;padding:14px;border-radius:var(--radius-md);cursor:pointer", { border: `1px solid ${k.border}`, background: k.bg })} className="hv-border300">
                <Checkbox checked={k.checked} onChange={k.toggle} />
                <span style={sxm("width:32px;height:32px;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;font:var(--text-label);flex-shrink:0", { background: k.typeBg, color: k.typeColor })}>{k.typeLabel}</span>
                <div style={sx("flex:1;min-width:0;display:flex;flex-direction:column;gap:2px")}>
                  <span style={sx("font:var(--text-body-sm);font-weight:700")}>{k.title}</span>
                  <span style={sx("font:var(--text-body-sm);color:var(--slate)")}>{k.org}</span>
                  <span style={sx("font:var(--text-body-sm);color:var(--slate)")}>{k.year}</span>
                  <div style={sx("display:flex;flex-wrap:wrap;gap:6px;margin-top:8px")}>
                    {k.tags.map((t, ti) => (
                      <Badge key={t.label ?? ti} tone={t.tone}>{t.label}</Badge>
                    ))}
                  </div>
                </div>
                <span style={sx("color:var(--slate);font-weight:700;letter-spacing:.1em")}>···</span>
              </div>
            ))}
            {v.knowledgeEmpty ? <div style={sx("padding:32px;text-align:center;font:var(--text-body-sm);color:var(--slate)")}>No sources match your search.</div> : null}
          </div>
        </div>

        {/* Preview */}
        {v.hasPreview ? (
          <div style={sx("border:1px solid var(--slate-200);border-radius:var(--radius-md);display:flex;flex-direction:column;min-height:0;overflow:hidden;padding:16px")}>
            <div style={sx("display:flex;align-items:flex-start;justify-content:space-between;gap:12px")}>
              <h3 style={sx("font:var(--text-h4);font-size:20px;line-height:24px;font-family:var(--font-legend);margin:0")}>{v.preview.title}</h3>
              <button onClick={v.closePreview} aria-label="Close" style={sx("border:none;background:none;cursor:pointer;width:28px;height:28px;display:flex;align-items:center;justify-content:center;flex-shrink:0")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg></button>
            </div>
            <div style={sx("display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:10px 0 12px")}>
              {v.preview.tags.map((t: any, ti: number) => (
                <Badge key={t.label ?? ti} tone={t.tone}>{t.label}</Badge>
              ))}
              <span style={sx("font:var(--text-body-sm);color:var(--slate)")}>{v.preview.year} · {v.preview.org}</span>
            </div>
            <Tabs items={v.previewTabs} active={v.previewTab} onChange={v.setPreviewTab} />
            {v.previewIsPreview ? (
              <div style={sx("flex:1;min-height:0;display:flex;flex-direction:column;background:var(--warm-slate-100);border-radius:var(--radius-md);margin-top:12px;padding:10px;gap:10px")}>
                <div style={sx("display:flex;align-items:center;justify-content:space-between;gap:8px;font:var(--text-body-sm)")}>
                  <span style={sx("color:var(--slate)")}>
                    {v.previewExcerptsBusy ? "Finding the relevant passages…" : `${v.previewExcerptCount} passage${v.previewExcerptCount === 1 ? "" : "s"} matched “${v.previewMatchedFor}”`}
                  </span>
                  <div style={sx("display:flex;align-items:center;gap:4px;border:1px solid var(--slate-200);border-radius:var(--radius-sm);background:var(--adsk-white);padding:0 4px;height:28px;flex-shrink:0")}>
                    <button onClick={v.zoomOut} aria-label="Smaller text" style={sx("width:24px;height:24px;border:none;background:none;cursor:pointer")}>−</button><span style={sx("min-width:44px;text-align:center")}>{v.zoom}%</span><button onClick={v.zoomIn} aria-label="Larger text" style={sx("width:24px;height:24px;border:none;background:none;cursor:pointer")}>+</button>
                  </div>
                </div>
                <div style={sx("flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:10px")}>
                  {v.previewExcerpts.map((e: any) => (
                    <div key={e.n} style={sx("background:var(--adsk-white);border-radius:var(--radius-sm);box-shadow:var(--shadow-card);padding:12px")}>
                      <div style={sx("display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;font:var(--text-caption);color:var(--slate)")}>
                        <span>{e.pageLabel}</span>
                        <span>{e.scoreLabel}</span>
                      </div>
                      <p style={sxm("margin:0;font-family:var(--font-element);line-height:1.6", { fontSize: v.excerptFont })}>
                        {e.runs.map((r: any) => (
                          <span key={r.key} style={{ background: r.bg }}>{r.text}</span>
                        ))}
                      </p>
                    </div>
                  ))}
                  {v.previewExcerptsEmpty ? (
                    <div style={sx("padding:32px;text-align:center;font:var(--text-body-sm);color:var(--slate)")}>
                      This source has no indexed passages yet, so it cannot be quoted in the draft.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {v.previewIsMeta ? (
              <div style={sx("flex:1;margin-top:12px;display:grid;grid-template-columns:auto 1fr;gap:8px 16px;font:var(--text-body-sm);align-content:start")}>
                {v.previewMeta.map((m: any, mi: number) => (
                  <Fragment key={m.k ?? mi}>
                    <span style={sx("color:var(--slate)")}>{m.k}</span><span>{m.v}</span>
                  </Fragment>
                ))}
              </div>
            ) : null}
            <div style={sx("display:flex;gap:10px;margin-top:12px")}>
              <Button variant="secondary" onClick={v.openOriginal}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></svg>Open original</Button>
              <Button variant={v.useVariant} onClick={v.toggleUsePreview} style={v.growStyle}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 13l4 4L19 7" /></svg>{v.useLabel}</Button>
            </div>
          </div>
        ) : null}
      </div>
      <div style={sx("display:flex;justify-content:space-between;align-items:center;gap:24px;padding:16px 0 24px;border-top:1px solid var(--slate-100);margin-top:16px")}>
        <Button variant="ghost" onClick={v.goStep1}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>Back</Button>
        {v.showProgress ? <div style={sx("flex:1;max-width:360px")}><ProgressBar percent={v.jobProgressPercent} label={v.progressLabel} /></div> : null}
        <div style={sx("display:flex;align-items:center;gap:16px")}>
          <span style={sx("font:var(--text-body-sm);color:var(--slate)")}>{v.totalSelected} sources selected across {v.sectionsWithSources} sections</span>
          <Button variant="primary" size="lg" disabled={v.drafting} onClick={v.createDraft}>{v.draftLabel} <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg></Button>
        </div>
      </div>
    </div>
  );
}
