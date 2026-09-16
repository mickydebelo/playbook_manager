"use client";
import { Fragment } from "react";
import { sx, sxm } from "@/lib/ui/sx";
import { Button, Badge, ProgressBar, Skeleton, Tabs } from "@/components/ds";
import type { WorkspaceVals } from "@/features/workspace/types";

export function Step3EditCreate({ v }: { v: WorkspaceVals }) {
  return (
    <div data-screen-label="3 Edit and create" style={sx("flex:1;min-height:0;display:flex;flex-direction:column;padding:24px 24px 0;animation:pm-fade .2s ease")}>
      {v.narrow ? (
        <div style={sx("display:flex;align-items:center;gap:12px;margin-bottom:12px")}>
          <span style={sx("font:var(--text-label);letter-spacing:.06em;text-transform:uppercase;white-space:nowrap")}>Section</span>
          <select value={v.selectedId} onChange={v.selectById} style={sx("flex:1;height:40px;padding:0 12px;border:1px solid var(--slate-200);border-radius:var(--radius-md);font:var(--text-body-sm);background:var(--adsk-white)")}>
            {v.outlineFlat.map((o) => (
              <option key={o.key} value={o.key}>{o.indent}{o.n} {o.title}</option>
            ))}
          </select>
          <button onClick={v.addSection} title="Add section" aria-label="Add section" style={sx("display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border:1px solid var(--slate-200);border-radius:var(--radius-sm);background:var(--adsk-white);cursor:pointer;flex-shrink:0")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg></button>
        </div>
      ) : null}
      <div style={sxm("flex:1;min-height:0;display:grid;gap:12px", { gridTemplateColumns: v.step3Cols })}>
        {/* Outline */}
        {v.wide ? (
          <div style={sx("border:1px solid var(--slate-200);border-radius:var(--radius-md);display:flex;flex-direction:column;min-height:0;overflow:hidden")}>
            <div style={sx("display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 8px 12px 16px")}>
              <span style={sx("font:var(--text-label);letter-spacing:.06em;text-transform:uppercase")}>Outline</span>
              <button onClick={v.addSection} title="Add section" aria-label="Add section" style={sx("display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid var(--slate-200);border-radius:var(--radius-sm);background:var(--adsk-white);cursor:pointer;flex-shrink:0")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg></button>
            </div>
            <div style={sx("flex:1;overflow:auto;padding:0 8px 8px;display:flex;flex-direction:column;gap:2px")}>
              {v.outlineFlat.map((o) => (
                <div key={o.key} onClick={o.select} style={sxm("display:flex;align-items:center;gap:10px;height:40px;border-radius:var(--radius-sm);cursor:pointer", { padding: `0 8px 0 ${o.pad}`, background: o.bg, marginTop: o.mt })} className="hv-slate100">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={sxm("flex-shrink:0", { color: o.iconColor })}><path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8z" /><path d="M14 3v5h5" /></svg>
                  <span style={sxm("flex:1;font:var(--text-body-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis", { fontWeight: o.weight })}>{o.n} {o.title}</span>
                  {o.draftStatus !== "idle" ? (
                    <span
                      title={o.draftStatus === "ready" ? "Drafted" : o.draftStatus === "drafting" ? "Writing now" : "Waiting"}
                      style={sxm("width:8px;height:8px;border-radius:50%;flex-shrink:0", {
                        background: o.draftDot,
                        animation: o.draftStatus === "drafting" ? "pm-pulse 1.2s ease-in-out infinite" : "none",
                      })}
                    />
                  ) : null}
                  <span style={sx("color:var(--slate);font-weight:700;letter-spacing:.1em;font-size:12px")}>···</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Editor */}
        <div style={sx("display:flex;flex-direction:column;min-height:0;min-width:0")}>
          <div style={sx("display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px 16px;margin-bottom:12px")}>
            <div style={sx("min-width:0")}>
              <div style={sx("font:var(--text-label);letter-spacing:.06em;color:var(--slate);text-transform:uppercase;margin-bottom:8px")}>Edit playbook</div>
              <h2 style={sx("font:var(--text-h3);font-family:var(--font-legend);margin:0")}><span style={sx("background:var(--hello-yellow);padding:0 6px")}>{v.selectedN}</span> {v.selectedTitle}</h2>
              <div style={sx("font:var(--text-body-sm);color:var(--slate);margin-top:6px")}>{v.savedLabel} · {v.wordCount} words · <button onClick={v.toast_changes} style={sx("border:none;background:none;text-decoration:underline;color:var(--slate);cursor:pointer;font:var(--text-body-sm);padding:0")}>View changes</button></div>
              {v.showProgress ? (
                <div style={sx("margin-top:10px;max-width:420px")}>
                  <ProgressBar percent={v.jobProgressPercent} label={v.progressLabel} />
                </div>
              ) : null}
              {v.hasDraftFailures ? (
                <div role="alert" style={sx("margin-top:8px;display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;padding:8px 12px;border-radius:var(--radius-sm);background:var(--dawn-100);font:var(--text-body-sm)")}>
                  <div style={sx("min-width:0")}>
                    <div>{v.draftFailureSummary} Open one and use “Regenerate section” to try again.</div>
                    <ul style={sx("margin:6px 0 0;padding-left:20px;color:var(--slate)")}>
                      {v.draftFailures.map((f: string) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                  <button onClick={v.dismissDraftFailures} style={sx("border:none;background:none;text-decoration:underline;cursor:pointer;font:var(--text-body-sm);padding:0;color:var(--adsk-black)")}>Dismiss</button>
                </div>
              ) : null}
              {v.hasConflict ? (
                <div role="alert" style={sx("margin-top:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 12px;border-radius:var(--radius-sm);background:var(--dawn-100);font:var(--text-body-sm);color:var(--adsk-black)")}>
                  <span>{v.conflictMessage}</span>
                  <button onClick={v.keepMine} style={sx("border:none;background:none;text-decoration:underline;cursor:pointer;font:var(--text-body-sm);padding:0;color:var(--adsk-black)")}>Keep mine</button>
                  <button onClick={v.useTheirs} style={sx("border:none;background:none;text-decoration:underline;cursor:pointer;font:var(--text-body-sm);padding:0;color:var(--adsk-black)")}>Use theirs</button>
                </div>
              ) : null}
            </div>
            <div style={sx("display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end")}>
              <Button variant="ghost" onClick={v.toggleEditMode}>{v.editToggleLabel}</Button>
              <Button variant="secondary" disabled={v.regenerating} onClick={v.regenerate}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 12a8 8 0 01-14 5.3M4 12a8 8 0 0114-5.3" /><path d="M20 4v4h-4M4 20v-4h4" /></svg>{v.regenLabel}</Button>
            </div>
          </div>
          <div style={sx("display:flex;align-items:center;gap:4px;padding:6px 8px;border:1px solid var(--slate-200);border-radius:var(--radius-md);margin-bottom:12px;flex-wrap:wrap")}>
            <select defaultValue="Paragraph" style={sx("height:30px;border:none;background:transparent;font:var(--text-body-sm);padding:0 6px")}><option>Paragraph</option><option>Heading 2</option><option>Heading 3</option></select>
            <span style={sx("width:1px;height:20px;background:var(--slate-200);margin:0 4px")}></span>
            {v.toolbar.map((t: any, i: number) => (
              <button key={i} title={t.title} onClick={t.click} style={sxm("width:30px;height:30px;border:none;border-radius:var(--radius-sm);cursor:pointer;display:flex;align-items:center;justify-content:center;font:var(--text-body-sm);font-weight:700", { background: t.bg })} className="hv-slate100"><span style={sx("display:inline-flex;width:16px;height:16px")} dangerouslySetInnerHTML={t.icon}></span></button>
            ))}
          </div>
          <div style={sx("flex:1;min-height:0;overflow:auto;border:1px solid var(--slate-200);border-radius:var(--radius-md);background:var(--adsk-white);padding:32px 40px")}>
            {v.sectionPending ? (
              <div style={sx("max-width:680px;display:flex;flex-direction:column;gap:20px")}>
                <div style={sx("font:var(--text-body-sm);color:var(--slate)")}>Writing this section…</div>
                <Skeleton lines={4} />
                <Skeleton lines={5} />
              </div>
            ) : null}
            {v.editRaw && !v.sectionPending ? (
              <textarea value={v.draftText} onChange={v.setDraftText} style={sx("width:100%;min-height:480px;border:none;padding:0;font:var(--text-body);resize:none;color:var(--adsk-black)")} />
            ) : null}
            {v.editRich && !v.sectionPending ? (
              <div style={sxm("display:flex;flex-direction:column;gap:12px;max-width:680px;transition:opacity .2s", { opacity: v.draftOpacity })}>
                {v.blocks.map((b, i) => (
                  <div key={i}>
                    {b.isH1 ? <h2 style={sx("font:var(--text-h3);font-family:var(--font-legend);margin:0 0 8px")}>{b.text}</h2> : null}
                    {b.isH2 ? <h3 style={sx("font:var(--text-h4);margin:12px 0 4px")}>{b.text}</h3> : null}
                    {b.isP ? <p style={sx("font:var(--text-body);margin:0;text-wrap:pretty")}>{b.text}</p> : null}
                    {b.isUl ? <ul style={sx("margin:0;padding-left:22px;font:var(--text-body);display:flex;flex-direction:column;gap:4px")}>{(b.items ?? []).map((li, j) => <li key={j}>{li}</li>)}</ul> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right panel */}
        <div style={sx("border:1px solid var(--slate-200);border-radius:var(--radius-md);display:flex;flex-direction:column;min-height:0;overflow:hidden")}>
          <div style={sx("padding:0 8px;overflow-x:auto")}>
            <Tabs items={v.rightTabs} active={v.rightTab} onChange={v.setRightTab} />
          </div>
          <div style={sx("flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px")}>
            {v.rightIsSources ? (
              <Fragment>
                <div style={sx("font:var(--text-body);font-weight:700")}>Sources for this section ({v.sectionSourceCount})</div>
                {v.sectionSources.map((s) => (
                  <div key={s.id} onClick={s.openPreview} style={sx("display:flex;gap:12px;padding:14px;border:1px solid var(--slate-200);border-radius:var(--radius-md);cursor:pointer")} className="hv-border300">
                    <span style={sxm("width:32px;height:32px;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;font:var(--text-label);flex-shrink:0", { background: s.typeBg, color: s.typeColor })}>{s.typeLabel}</span>
                    <div style={sx("flex:1;min-width:0;display:flex;flex-direction:column;gap:4px")}>
                      <span style={sx("font:var(--text-body-sm);font-weight:700")}>{s.title}</span>
                      <span style={sx("font:var(--text-body-sm);color:var(--slate)")}>{s.org} · {s.year}</span>
                      <div style={sx("display:flex;gap:6px;flex-wrap:wrap")}>{s.tags.map((t, i) => <Badge key={i} tone={t.tone}>{t.label}</Badge>)}</div>
                      <span style={sx("font:var(--text-caption);color:var(--slate);margin-top:4px")}>Relevant for</span>
                      <span style={sx("font:var(--text-caption);color:var(--slate)")}>{s.relevantFor}</span>
                    </div>
                    <button onClick={s.removeFromSection} aria-label="Remove" style={sx("border:none;background:none;cursor:pointer;color:var(--slate);height:24px")}>···</button>
                  </div>
                ))}
                {v.noSectionSources ? <div style={sx("padding:16px;border:1px dashed var(--slate-200);border-radius:var(--radius-md);font:var(--text-body-sm);color:var(--slate);text-align:center")}>No sources selected for this section yet.</div> : null}
                <button onClick={v.goStep2} style={sx("display:inline-flex;align-items:center;gap:10px;height:40px;padding:0 14px;border:1px solid var(--slate-200);border-radius:var(--radius-sm);background:var(--adsk-white);font:var(--text-body-sm);cursor:pointer;align-self:flex-start")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>Add or find more sources</button>
                {v.showSuggestion ? (
                  <div style={sx("border-top:1px solid var(--slate-100);padding-top:12px;display:flex;flex-direction:column;gap:12px")}>
                    <div style={sx("font:var(--text-body);font-weight:700")}>Suggested content (1)</div>
                    <div style={sx("display:flex;gap:12px;align-items:center;padding:14px;border-radius:var(--radius-md);background:var(--warm-slate-100)")}>
                      <span style={sx("width:20px;height:20px;border-radius:50%;background:var(--adsk-black);flex-shrink:0;display:flex;align-items:center;justify-content:center")}><svg width="12" height="12" viewBox="0 0 24 24" fill="var(--adsk-white)"><path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" /></svg></span>
                      <span style={sx("flex:1;font:var(--text-body-sm)")}>Add a short customer-specific introduction for {v.customerName}?</span>
                      <Button variant="secondary" size="sm" onClick={v.insertSuggestion}>Insert</Button>
                    </div>
                  </div>
                ) : null}
                <div style={sx("display:flex;gap:12px;padding:14px;border-radius:var(--radius-md);background:var(--warm-slate-100);margin-top:auto")}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={sx("flex-shrink:0")}><path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.5.4.8 1 .8 1.6V16h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0012 3z" /></svg>
                  <div><div style={sx("font:var(--text-body-sm);font-weight:700")}>Tip</div><div style={sx("font:var(--text-body-sm);color:var(--slate)")}>You can ask the AI Assistant to rewrite, shorten, or tailor this section.</div></div>
                </div>
              </Fragment>
            ) : null}
            {v.rightIsAI ? (
              <div style={sx("flex:1;display:flex;flex-direction:column;gap:12px;min-height:0")}>
                <div style={sx("flex:1;overflow:auto;display:flex;flex-direction:column;gap:10px")}>
                  {v.chat.map((m: any, i: number) => (
                    <Fragment key={i}>
                      <div style={sxm("max-width:90%;padding:10px 14px;border-radius:var(--radius-md);font:var(--text-body-sm);white-space:pre-line", { alignSelf: m.align, background: m.bg, color: m.color })}>{m.text}</div>
                      {m.appliedLabel ? (
                        <div style={sx("align-self:flex-start;max-width:90%;font:var(--text-caption);color:var(--slate);display:flex;gap:8px;align-items:baseline;flex-wrap:wrap")}>
                          <span>{m.appliedLabel}</span>
                          {m.canUndo ? (
                            <button onClick={m.undo} style={sx("border:none;background:none;text-decoration:underline;cursor:pointer;font:var(--text-caption);color:var(--slate);padding:0")}>Undo</button>
                          ) : null}
                        </div>
                      ) : null}
                    </Fragment>
                  ))}
                  {v.chatBusy ? (
                    <div style={sx("align-self:flex-start;max-width:90%;padding:10px 14px;border-radius:var(--radius-md);background:var(--warm-slate-100);color:var(--slate);font:var(--text-body-sm);display:flex;align-items:center;gap:8px")}>
                      <span style={sx("width:14px;height:14px;border-radius:50%;border:2px solid var(--slate-200);border-top-color:var(--slate);animation:pm-spin .8s linear infinite;flex-shrink:0")} />
                      AI Assistant is thinking…
                    </div>
                  ) : null}
                </div>
                <div style={sx("display:flex;flex-wrap:wrap;gap:6px")}>
                  {v.aiPrompts.map((p: any) => (
                    <button key={p.label} onClick={p.send} disabled={v.chatSendDisabled} style={sx("height:30px;padding:0 12px;border:1px solid var(--slate-200);border-radius:var(--radius-sm);background:var(--adsk-white);font:var(--text-caption);cursor:pointer")} className="hv-slate100">{p.label}</button>
                  ))}
                </div>
                <div style={sx("display:flex;gap:8px")}>
                  <input value={v.chatDraft} onChange={v.setChatDraft} onKeyDown={v.chatKey} placeholder="Ask the assistant" style={sx("flex:1;height:40px;padding:0 12px;border:1px solid var(--slate-200);border-radius:var(--radius-sm);font:var(--text-body-sm)")} />
                  <Button variant="primary" disabled={v.chatSendDisabled} onClick={v.sendChat}>Send</Button>
                </div>
              </div>
            ) : null}
            {v.rightIsComments ? (
              <Fragment>
                {v.comments.map((c: any, i: number) => (
                  <div key={i} style={sx("display:flex;gap:10px;padding:12px;border:1px solid var(--slate-200);border-radius:var(--radius-md)")}>
                    <span style={sx("width:28px;height:28px;border-radius:50%;background:var(--warm-slate-100);border:1px solid var(--slate-200);display:flex;align-items:center;justify-content:center;font:var(--text-label);flex-shrink:0")}>{c.initials}</span>
                    <div style={sx("display:flex;flex-direction:column;gap:4px;min-width:0")}><span style={sx("font:var(--text-body-sm)")}><b>{c.author}</b> <span style={sx("color:var(--slate)")}>· {c.when}</span></span><span style={sx("font:var(--text-body-sm)")}>{c.text}</span></div>
                  </div>
                ))}
                <div style={sx("display:flex;gap:8px;margin-top:auto")}>
                  <input value={v.commentDraft} onChange={v.setCommentDraft} onKeyDown={v.commentKey} placeholder="Add a comment" style={sx("flex:1;height:40px;padding:0 12px;border:1px solid var(--slate-200);border-radius:var(--radius-sm);font:var(--text-body-sm)")} />
                  <Button variant="secondary" onClick={v.addComment}>Post</Button>
                </div>
              </Fragment>
            ) : null}
          </div>
        </div>
      </div>
      <div style={sx("display:flex;justify-content:space-between;align-items:center;padding:16px 0 24px;border-top:1px solid var(--slate-100);margin-top:16px")}>
        <Button variant="ghost" onClick={v.goStep2}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>Back</Button>
        <div style={sx("display:flex;gap:12px")}>
          <Button variant="secondary" size="lg" onClick={v.saveDraft}>Save draft</Button>
          <Button variant="primary" size="lg" onClick={v.goStep4}>Continue to review <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg></Button>
        </div>
      </div>
    </div>
  );
}
