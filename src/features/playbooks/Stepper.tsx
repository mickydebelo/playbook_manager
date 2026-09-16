"use client";
import { Fragment } from "react";
import { sx, sxm } from "@/lib/ui/sx";
import type { WorkspaceVals } from "@/features/workspace/types";

/** Four-step progress header (design lines 64–79). */
export function Stepper({ v }: { v: WorkspaceVals }) {
  return (
    <div style={sx("display:flex;justify-content:center;padding:20px 48px 0;flex-shrink:0")}>
      <div style={sx("display:flex;width:100%;max-width:820px")}>
        {v.steps.map((s) => (
          <button key={s.n} type="button" onClick={s.go} aria-current={s.done ? undefined : s.n === Number(v.steps.find((x) => !x.done && x.weight === 700)?.n) ? "step" : undefined} style={sx("flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;background:none;border:none;cursor:pointer;padding:0;position:relative")}>
            {s.notFirst ? <span style={sxm("position:absolute;left:0;right:50%;top:13px;height:1px;margin-right:14px", { background: s.lineBg })} /> : null}
            {s.notLast ? <span style={sxm("position:absolute;left:50%;right:0;top:13px;height:1px;margin-left:14px", { background: s.lineBgNext })} /> : null}
            <span style={sxm("width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:var(--text-label);position:relative;z-index:1", { background: s.bg, color: s.color, border: `1px solid ${s.border}` })}>
              {s.done ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>
              ) : null}
              {s.notDone ? <Fragment>{s.n}</Fragment> : null}
            </span>
            <span style={sxm("font:var(--text-body-sm)", { fontWeight: s.weight, color: s.labelColor })}>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
