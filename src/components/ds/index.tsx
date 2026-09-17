"use client";
/**
 * Autodesk design-system primitives, ported 1:1 from
 * design/_ds/.../_ds_bundle.js (namespace AutodeskDesignSystem_c63964).
 * Props, variants, sizes and every style value are unchanged; only TypeScript types were added.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// ---- Button ---------------------------------------------------------------
const BUTTON_SIZES = {
  sm: { pad: "8px 16px", font: "var(--text-body-sm)" },
  md: { pad: "11px 20px", font: "var(--text-button)" },
  lg: { pad: "15px 28px", font: "700 16px/20px var(--font-element)" },
} as const;
const BUTTON_VARIANTS = {
  primary: { background: "var(--adsk-black)", color: "var(--adsk-white)", border: "1px solid var(--adsk-black)" },
  inverse: { background: "var(--adsk-white)", color: "var(--adsk-black)", border: "1px solid var(--adsk-white)" },
  secondary: { background: "transparent", color: "var(--adsk-black)", border: "1px solid var(--adsk-black)" },
  "secondary-inverse": { background: "transparent", color: "var(--adsk-white)", border: "1px solid var(--adsk-white)" },
  accent: { background: "var(--hello-yellow)", color: "var(--adsk-black)", border: "1px solid var(--hello-yellow)" },
  ghost: { background: "transparent", color: "var(--adsk-black)", border: "1px solid transparent" },
} as const;
export type ButtonVariant = keyof typeof BUTTON_VARIANTS;
export type ButtonSize = keyof typeof BUTTON_SIZES;

export function Button({
  variant = "primary",
  size = "md",
  disabled = false,
  icon,
  children,
  onClick,
  style,
  type = "button",
  ariaLabel,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
  type?: "button" | "submit";
  ariaLabel?: string;
}) {
  const v = BUTTON_VARIANTS[variant] ?? BUTTON_VARIANTS.primary;
  const s = BUTTON_SIZES[size] ?? BUTTON_SIZES.md;
  const [hover, setHover] = useState(false);
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: "var(--font-element)",
        font: s.font,
        padding: s.pad,
        borderRadius: "var(--radius-sm)",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        opacity: disabled ? 0.4 : hover ? 0.8 : 1,
        transition: "opacity .15s ease",
        ...v,
        ...style,
      }}
    >
      {icon ? <span style={{ display: "inline-flex", width: 16, height: 16 }}>{icon}</span> : null}
      {children}
    </button>
  );
}

// ---- IconButton -----------------------------------------------------------
export function IconButton({
  icon,
  variant = "secondary",
  size = 32,
  onClick,
  label,
}: {
  icon: ReactNode;
  variant?: "primary" | "secondary";
  size?: number;
  onClick?: () => void;
  label?: string;
}) {
  const [hover, setHover] = useState(false);
  const isDark = variant === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size,
        height: size,
        borderRadius: "var(--radius-sm)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: isDark ? "var(--adsk-black)" : "transparent",
        color: isDark ? "var(--adsk-white)" : "var(--adsk-black)",
        border: isDark ? "none" : "1px solid var(--slate-200)",
        cursor: "pointer",
        opacity: hover ? 0.75 : 1,
      }}
    >
      {icon}
    </button>
  );
}

// ---- Badge ----------------------------------------------------------------
const BADGE_TONES = {
  neutral: { background: "var(--slate-100)", color: "var(--adsk-black)" },
  info: { background: "var(--twilight-100)", color: "var(--twilight-700)" },
  positive: { background: "var(--morning-100)", color: "var(--morning-700)" },
  warning: { background: "var(--dawn-100)", color: "var(--dawn-700)" },
  critical: { background: "var(--dusk-100)", color: "var(--dusk-700)" },
  highlight: { background: "var(--hello-yellow)", color: "var(--adsk-black)" },
} as const;
export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children?: ReactNode }) {
  const t = BADGE_TONES[tone] ?? BADGE_TONES.neutral;
  return (
    <span
      style={{
        ...t,
        font: "var(--text-label)",
        fontFamily: "var(--font-element)",
        padding: "3px 10px",
        borderRadius: "var(--radius-sm)",
        display: "inline-block",
        letterSpacing: ".02em",
      }}
    >
      {children}
    </span>
  );
}

// ---- ProgressBar ----------------------------------------------------------
/** Determinate progress for a background job. `percent` is clamped, so a bad total cannot overflow. */
export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontFamily: "var(--font-element)" }}>
      {label ? (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, font: "var(--text-body-sm)", color: "var(--slate)" }}>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          <span style={{ flexShrink: 0 }}>{value}%</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
        style={{ height: 6, borderRadius: 999, background: "var(--slate-100)", overflow: "hidden" }}
      >
        <div style={{ width: `${value}%`, height: "100%", background: "var(--adsk-black)", transition: "width .4s ease" }} />
      </div>
    </div>
  );
}

// ---- Skeleton -------------------------------------------------------------
/** Placeholder for content that is on its way. Honest about being a placeholder: no fake text. */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  const widths = ["100%", "92%", "78%", "96%", "84%", "68%"];
  return (
    <div aria-hidden style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: Math.max(1, lines) }, (_, i) => (
        <div
          key={i}
          style={{
            height: 12,
            width: widths[i % widths.length],
            borderRadius: 4,
            background: "var(--slate-100)",
            animation: "pm-pulse 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

// ---- Card -----------------------------------------------------------------
export function Card({
  title,
  body,
  tag,
  image,
  dark = false,
  children,
}: {
  title?: string;
  body?: string;
  tag?: string;
  image?: string;
  dark?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        background: dark ? "var(--adsk-black)" : "var(--adsk-white)",
        color: dark ? "var(--adsk-white)" : "var(--adsk-black)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        border: dark ? "none" : "1px solid var(--slate-100)",
        overflow: "hidden",
        fontFamily: "var(--font-element)",
        width: 280,
      }}
    >
      {image ? <div style={{ height: 140, background: `center/cover url(${image})` }} /> : null}
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        {tag ? <span style={{ font: "var(--text-label)", color: "var(--slate)" }}>{tag}</span> : null}
        {title ? <h3 style={{ font: "var(--text-h4)", margin: 0 }}>{title}</h3> : null}
        {body ? <p style={{ font: "var(--text-body-sm)", margin: 0, color: dark ? "var(--warm-slate)" : "var(--slate)" }}>{body}</p> : null}
        {children}
      </div>
    </div>
  );
}

// ---- Checkbox -------------------------------------------------------------
export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label?: ReactNode;
  checked: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontFamily: "var(--font-element)",
        font: "var(--text-body-sm)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span
        role="checkbox"
        aria-checked={checked}
        tabIndex={disabled ? -1 : 0}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onChange?.(!checked);
        }}
        onKeyDown={(e) => {
          if (!disabled && (e.key === " " || e.key === "Enter")) {
            e.preventDefault();
            onChange?.(!checked);
          }
        }}
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          border: `1px solid ${checked ? "var(--adsk-black)" : "var(--slate-300)"}`,
          background: checked ? "var(--adsk-black)" : "var(--adsk-white)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {checked ? (
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--adsk-white)" strokeWidth={3}>
            <path d="M5 13l4 4L19 7" />
          </svg>
        ) : null}
      </span>
      {label}
    </label>
  );
}

// ---- Radio / Switch -------------------------------------------------------
export function Radio({ label, checked, onChange, disabled }: { label?: ReactNode; checked: boolean; onChange?: (v: true) => void; disabled?: boolean }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-element)", font: "var(--text-body-sm)", opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>
      <span
        onClick={() => !disabled && onChange?.(true)}
        style={{ width: 18, height: 18, borderRadius: "50%", border: `1px solid ${checked ? "var(--adsk-black)" : "var(--slate-300)"}`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      >
        {checked ? <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--adsk-black)" }} /> : null}
      </span>
      {label}
    </label>
  );
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; label?: ReactNode }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-element)", font: "var(--text-body-sm)", opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>
      <span onClick={() => !disabled && onChange?.(!checked)} style={{ width: 36, height: 20, borderRadius: 999, background: checked ? "var(--adsk-black)" : "var(--slate-200)", position: "relative", transition: "background .15s" }}>
        <span style={{ position: "absolute", top: 2, left: checked ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "var(--adsk-white)", transition: "left .15s" }} />
      </span>
      {label}
    </label>
  );
}

// ---- Tabs -----------------------------------------------------------------
export function Tabs<T extends string>({ items, active, onChange }: { items: readonly T[]; active: T; onChange?: (item: T) => void }) {
  return (
    <div style={{ display: "flex", gap: 24, borderBottom: "1px solid var(--slate-200)", fontFamily: "var(--font-element)" }}>
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange?.(item)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "10px 0",
            font: "var(--text-body-sm)",
            color: item === active ? "var(--adsk-black)" : "var(--slate)",
            fontWeight: item === active ? 700 : 400,
            borderBottom: item === active ? "2px solid var(--adsk-black)" : "2px solid transparent",
            marginBottom: -1,
          }}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

// ---- Dialog ---------------------------------------------------------------
export function Dialog({
  open,
  title,
  body,
  onClose,
  primaryLabel = "Continue",
  onPrimary,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  onClose?: () => void;
  primaryLabel?: string;
  onPrimary?: () => void;
}) {
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    // Move focus into the dialog on open, so keyboard users are not left behind the overlay.
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose?.();
        return;
      }
      // Simple focus trap: keep Tab within the dialog's focusable controls.
      if (e.key === "Tab" && cardRef.current) {
        const nodes = cardRef.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
        if (!nodes.length) return;
        const first = nodes[0]!;
        const last = nodes[nodes.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-element)", zIndex: 20 }}>
      <div ref={cardRef} onClick={(e) => e.stopPropagation()} style={{ background: "var(--adsk-white)", borderRadius: "var(--radius-xl)", padding: 32, width: 360, boxShadow: "var(--shadow-card)" }}>
        <h3 style={{ font: "var(--text-h3)", fontFamily: "var(--font-legend)", margin: "0 0 12px" }}>{title}</h3>
        <p style={{ font: "var(--text-body)", color: "var(--slate)", margin: "0 0 24px" }}>{body}</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", font: "var(--text-button)", fontFamily: "var(--font-element)", cursor: "pointer", padding: "11px 16px" }}>
            Cancel
          </button>
          <button ref={primaryRef} type="button" onClick={onPrimary} style={{ background: "var(--adsk-black)", color: "var(--adsk-white)", border: "none", borderRadius: "var(--radius-sm)", font: "var(--text-button)", fontFamily: "var(--font-element)", cursor: "pointer", padding: "11px 20px" }}>
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Tooltip --------------------------------------------------------------
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block" }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show ? (
        <span style={{ position: "absolute", bottom: "125%", left: "50%", transform: "translateX(-50%)", background: "var(--adsk-black)", color: "var(--adsk-white)", font: "var(--text-caption)", fontFamily: "var(--font-element)", padding: "6px 10px", borderRadius: "var(--radius-sm)", whiteSpace: "nowrap", zIndex: 10 }}>
          {label}
        </span>
      ) : null}
    </span>
  );
}
