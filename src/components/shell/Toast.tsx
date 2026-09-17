"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { sx } from "@/lib/ui/sx";

export type ToastTone = "info" | "success" | "error";
type ToastApi = { show: (message: string, tone?: ToastTone) => void };
const ToastContext = createContext<ToastApi>({ show: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

/** Background per tone. Info keeps the design's black pill; success and error recolour for a glance. */
const TONE_BG: Record<ToastTone, string> = {
  info: "var(--adsk-black)",
  success: "var(--morning-600)",
  error: "var(--dusk-600)",
};

/** A small glyph so the tone reads without relying on colour alone. */
const TONE_ICON: Record<ToastTone, string> = {
  info: '<circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" />',
  success: '<path d="M20 6L9 17l-5-5" />',
  error: '<circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />',
};

/** Toast from the design (black pill, bottom-centre, fades in, auto-hides), now tone-aware. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((message: string, tone: ToastTone = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, tone });
    // Errors linger a little longer than confirmations, since they usually need reading.
    timer.current = setTimeout(() => setToast(null), tone === "error" ? 4200 : 2600);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <div
          role={toast.tone === "error" ? "alert" : "status"}
          aria-live={toast.tone === "error" ? "assertive" : "polite"}
          style={{
            ...(sx(
              "position:absolute;left:50%;bottom:24px;transform:translateX(-50%);color:var(--adsk-white);padding:12px 20px;border-radius:var(--radius-md);font:var(--text-body-sm);box-shadow:var(--shadow-card);animation:pm-fade .2s ease;display:flex;align-items:center;gap:12px;z-index:10;max-width:min(560px,calc(100vw - 48px))",
            ) as React.CSSProperties),
            background: TONE_BG[toast.tone],
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
            aria-hidden
            dangerouslySetInnerHTML={{ __html: TONE_ICON[toast.tone] }}
          />
          <span>{toast.message}</span>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
