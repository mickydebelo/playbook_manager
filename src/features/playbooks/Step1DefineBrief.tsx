"use client";
import { sx, sxm } from "@/lib/ui/sx";
import { Button } from "@/components/ds";
import type { WorkspaceVals } from "@/features/workspace/types";

/** Step 1 "Define brief" (design lines 81–217). Data and handlers come from useWorkspace; this screen is API-backed. */
export function Step1DefineBrief({ v }: { v: WorkspaceVals }) {
  return (
    <div data-screen-label="1 Define brief" style={sx("flex:1;overflow:auto;padding:24px 48px 0;animation:pm-fade .2s ease")}>
      <div style={sx("max-width:960px;margin:0 auto;display:flex;flex-direction:column;gap:32px;padding-bottom:24px")}>
        <div>
          <div style={sx("font:var(--text-label);letter-spacing:.06em;color:var(--slate);text-transform:uppercase;margin-bottom:12px")}>Create playbook</div>
          <h1 style={sx("font:var(--text-h1);font-family:var(--font-legend);margin:0 0 12px;text-wrap:pretty")}>
            Create a <span style={sx("background:var(--hello-yellow);padding:0 8px")}>digital transformation</span> playbook
          </h1>
          <p style={sx("font:var(--text-body-lg);color:var(--slate);margin:0;max-width:760px;text-wrap:pretty")}>Tell us about the customer and what you want to achieve. We&apos;ll use this to find the most relevant knowledge and propose a starting structure.</p>
        </div>

        {/* Customer */}
        <div style={sx("display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:end")}>
          <div>
            <div style={sx("font:var(--text-h4);margin-bottom:4px")}>Customer</div>
            <div style={sx("font:var(--text-body-sm);color:var(--slate);margin-bottom:12px")}>Enter the name of the customer.</div>
            <div style={sx("position:relative")}>
              <input value={v.brief.customer} onChange={v.setCustomer} placeholder="Customer name" aria-label="Customer name" style={sx("width:100%;height:44px;padding:0 40px 0 14px;border:1px solid var(--slate-200);border-radius:var(--radius-md);font:var(--text-body);color:var(--adsk-black);background:var(--adsk-white)")} />
              <button type="button" onClick={v.clearCustomer} aria-label="Clear" style={sx("position:absolute;right:8px;top:8px;width:28px;height:28px;border:none;background:none;cursor:pointer;color:var(--slate);display:flex;align-items:center;justify-content:center")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
          <div style={sx("display:flex;flex-direction:column;align-items:flex-end;gap:6px")}>
            <div style={sx("display:flex;gap:12px")}>
              <button type="button" onClick={v.toggleLogo} className="hv-op80" style={sxm("display:flex;align-items:center;gap:10px;height:44px;padding:0 16px;border:1px solid var(--slate-200);border-radius:var(--radius-md);font:var(--text-body-sm);cursor:pointer", { background: v.logoBg })}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 16l5-5 4 4 3-3 6 6" /><circle cx="16" cy="9" r="1.5" /></svg>
                {v.logoLabel}
              </button>
              <button type="button" onClick={v.toggleColor} className="hv-op80" style={sx("display:flex;align-items:center;gap:10px;height:44px;padding:0 16px;border:1px solid var(--slate-200);border-radius:var(--radius-md);background:var(--adsk-white);font:var(--text-body-sm);cursor:pointer")}>
                <span style={sxm("width:16px;height:16px;border-radius:50%;border:1px solid var(--slate-200)", { background: v.brandColor })} />
                Add brand color
              </button>
            </div>
            <span style={sx("font:var(--text-caption);color:var(--slate)")}>Optional</span>
          </div>
        </div>

        {/* Industry */}
        <div>
          <div style={sx("font:var(--text-h4);margin-bottom:4px")}>Industry</div>
          <div style={sx("font:var(--text-body-sm);color:var(--slate);margin-bottom:12px")}>Select the customer&apos;s industry.</div>
          <select value={v.brief.industry} onChange={v.setIndustry} aria-label="Industry" style={sx("width:100%;max-width:560px;height:44px;padding:0 14px;border:1px solid var(--slate-200);border-radius:var(--radius-md);font:var(--text-body);background:var(--adsk-white);color:var(--adsk-black)")}>
            {v.industries.map((i: string) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </div>

        {/* Org size */}
        <div>
          <div style={sx("font:var(--text-h4);margin-bottom:4px")}>Organization size</div>
          <div style={sx("font:var(--text-body-sm);color:var(--slate);margin-bottom:16px")}>Select the approximate number of employees.</div>
          <div style={sx("position:relative;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));max-width:800px")}>
            <span style={sx("position:absolute;left:12.5%;right:12.5%;top:11px;height:1px;background:var(--slate-200)")} />
            {v.sizes.map((z: { label: string; range: string; border: string; dot: string; weight: number; pick: () => void }) => (
              <button key={z.label} type="button" onClick={z.pick} aria-pressed={z.weight === 700} style={sx("display:flex;flex-direction:column;align-items:center;gap:12px;background:none;border:none;cursor:pointer;padding:0;position:relative")}>
                <span style={sxm("width:22px;height:22px;border-radius:50%;background:var(--adsk-white);display:flex;align-items:center;justify-content:center", { border: `1px solid ${z.border}` })}>
                  <span style={sxm("width:10px;height:10px;border-radius:50%", { background: z.dot })} />
                </span>
                <span style={sxm("font:var(--text-body-sm)", { fontWeight: z.weight })}>{z.label}</span>
                <span style={sx("font:var(--text-body-sm);color:var(--slate);margin-top:-8px")}>{z.range}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Objective */}
        <div>
          <div style={sx("font:var(--text-h4);margin-bottom:4px")}>What do you want this playbook to achieve?</div>
          <div style={sx("font:var(--text-body-sm);color:var(--slate);margin-bottom:12px")}>Describe the business outcome, challenge or transformation you want to support.</div>
          <div style={sx("position:relative")}>
            <textarea value={v.brief.objective} onChange={v.setObjective} maxLength={500} rows={3} placeholder="Describe the objective" aria-label="Objective" style={sx("width:100%;padding:14px 14px 28px;border:1px solid var(--slate-200);border-radius:var(--radius-md);font:var(--text-body);color:var(--adsk-black);resize:vertical;background:var(--adsk-white)")} />
            <span style={sx("position:absolute;right:14px;bottom:12px;font:var(--text-caption);color:var(--slate)")}>{v.objectiveCount}/500</span>
          </div>
        </div>

        {/* Focus areas */}
        <div>
          <div style={sx("font:var(--text-h4);margin-bottom:4px")}>What should the playbook focus on?</div>
          <div style={sx("font:var(--text-body-sm);color:var(--slate);margin-bottom:12px")}>Select one or more focus areas.</div>
          <div style={sx("display:flex;flex-wrap:wrap;align-items:center;gap:12px")}>
            {v.focusSelected.map((f: { label: string; remove: () => void }) => (
              <span key={f.label} style={sx("display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 8px 0 14px;border-radius:var(--radius-sm);background:var(--adsk-black);color:var(--adsk-white);font:var(--text-body-sm)")}>
                {f.label}
                <button type="button" onClick={f.remove} aria-label="Remove" style={sx("border:none;background:none;color:var(--adsk-white);cursor:pointer;width:24px;height:24px;display:flex;align-items:center;justify-content:center")}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </span>
            ))}
            {v.focusInputOpen ? (
              <input autoFocus value={v.focusDraft} onChange={v.setFocusDraft} onKeyDown={v.focusKey} placeholder="Type a focus area, press Enter" style={sx("height:40px;padding:0 14px;border:1px solid var(--twilight);border-radius:var(--radius-sm);font:var(--text-body-sm);width:260px")} />
            ) : null}
            {v.focusInputClosed ? (
              <button type="button" onClick={v.openFocusInput} className="hv-op80" style={sx("display:inline-flex;align-items:center;gap:10px;height:40px;padding:0 16px;border:1px solid var(--slate-200);border-radius:var(--radius-sm);background:var(--adsk-white);font:var(--text-body-sm);cursor:pointer")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>Add focus areas
              </button>
            ) : null}
            <span style={sx("width:1px;height:28px;background:var(--slate-200)")} />
            <span style={sx("font:var(--text-body-sm);color:var(--slate)")}>Suggested for you based on your objective:</span>
            {v.focusSuggestions.map((f: { label: string; add: () => void }) => (
              <button key={f.label} type="button" onClick={f.add} className="hv-slate300" style={sx("height:36px;padding:0 14px;border:1px solid var(--slate-200);border-radius:var(--radius-sm);background:var(--warm-slate-100);font:var(--text-body-sm);cursor:pointer")}>{f.label}</button>
            ))}
          </div>
        </div>

        {/* Optional details */}
        <div style={sx("border:1px solid var(--slate-200);border-radius:var(--radius-lg);padding:20px 24px")}>
          <button type="button" onClick={v.toggleOptional} aria-expanded={v.optionalOpen} style={sx("display:flex;align-items:center;gap:12px;width:100%;background:none;border:none;padding:0;cursor:pointer;text-align:left;color:var(--adsk-black)")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={sxm("transition:transform .15s;flex-shrink:0", { transform: `rotate(${v.optionalRot})` })}><path d="M9 6l6 6-6 6" /></svg>
            <span style={sx("flex:1")}>
              <span style={sx("display:block;font:var(--text-h4)")}>Optional details</span>
              <span style={sx("display:block;font:var(--text-body-sm);color:var(--slate);margin-top:4px")}>Sources, frameworks and internal guidance that sharpen the search.</span>
            </span>
            <span style={sx("font:var(--text-body-sm);color:var(--slate);white-space:nowrap")}>{v.optionalSummary}</span>
          </button>
          {v.optionalOpen ? (
            <div style={sx("display:flex;flex-direction:column;gap:28px;margin-top:24px;padding-top:24px;border-top:1px solid var(--slate-100)")}>
              <div>
                <div style={sx("font:var(--text-h4);margin-bottom:4px")}>Add relevant sources</div>
                <div style={sx("font:var(--text-body-sm);color:var(--slate);margin-bottom:12px")}>Add links to existing documents, repositories or webpages we should consider.</div>
                <div style={sx("display:flex;flex-direction:column;gap:12px")}>
                  {v.briefSources.map((s: { id: string; icon: { __html: string }; title: string; url: string; setTitle: React.ChangeEventHandler<HTMLInputElement>; setUrl: React.ChangeEventHandler<HTMLInputElement>; remove: () => void }) => (
                    <div key={s.id} style={sx("display:flex;align-items:center;gap:14px;padding:12px 14px;border:1px solid var(--slate-200);border-radius:var(--radius-md);background:var(--adsk-white)")}>
                      <span style={sx("width:20px;height:20px;display:inline-flex;color:var(--adsk-black)")} dangerouslySetInnerHTML={s.icon} />
                      <div style={sx("flex:1;min-width:0;display:flex;flex-direction:column;gap:2px")}>
                        <input value={s.title} onChange={s.setTitle} aria-label="Source title" style={sx("border:none;padding:0;font:var(--text-body-sm);font-weight:700;color:var(--adsk-black);background:transparent")} />
                        <input value={s.url} onChange={s.setUrl} placeholder="https://" aria-label="Source URL" style={sx("border:none;padding:0;font:var(--text-body-sm);color:var(--slate);background:transparent")} />
                      </div>
                      <button type="button" onClick={s.remove} aria-label="Remove" style={sx("width:32px;height:32px;border:none;background:none;cursor:pointer;color:var(--slate);display:flex;align-items:center;justify-content:center")}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={v.addBriefSource} className="hv-op80" style={sx("align-self:flex-start;display:inline-flex;align-items:center;gap:10px;height:40px;padding:0 16px;border:1px solid var(--slate-200);border-radius:var(--radius-sm);background:var(--adsk-white);font:var(--text-body-sm);cursor:pointer")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>Add source link
                  </button>
                </div>
              </div>

              {/* Additional context */}
              <div>
                <div style={sx("font:var(--text-h4);margin-bottom:4px")}>Additional context</div>
                <div style={sx("font:var(--text-body-sm);color:var(--slate);margin-bottom:12px")}>Include any frameworks, standards or internal guidance.</div>
                <textarea value={v.brief.context} onChange={v.setContext} rows={3} placeholder="e.g. ISO 19650, internal delivery standards" aria-label="Additional context" style={sx("width:100%;padding:14px;border:1px solid var(--slate-200);border-radius:var(--radius-md);font:var(--text-body);resize:vertical")} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div style={sx("max-width:960px;margin:0 auto;display:flex;justify-content:flex-end;align-items:center;gap:24px;padding:20px 0 32px;border-top:1px solid var(--slate-100);position:sticky;bottom:0;background:var(--adsk-white)")}>
        {v.briefInvalid ? <span role="alert" style={sx("font:var(--text-body-sm);color:var(--dusk-700);margin-right:auto")}>Add a customer name and objective to continue.</span> : null}
        <Button variant="ghost" onClick={v.cancel}>Cancel</Button>
        <Button variant="primary" size="lg" disabled={v.finding} onClick={v.findKnowledge}>
          {v.findLabel} <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Button>
      </div>
    </div>
  );
}
