"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { sx } from "@/lib/ui/sx";

type ToastApi = { show: (message: string) => void };
const ToastContext = createContext<ToastApi>({ show: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

/** Toast exactly as in the design (lines 697–701): black pill, bottom-centre, fades in, auto-hides after 2.6 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((message: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <div
          role="status"
          style={sx(
            "position:absolute;left:50%;bottom:24px;transform:translateX(-50%);background:var(--adsk-black);color:var(--adsk-white);padding:12px 20px;border-radius:var(--radius-md);font:var(--text-body-sm);box-shadow:var(--shadow-card);animation:pm-fade .2s ease;display:flex;align-items:center;gap:12px;z-index:10",
          )}
        >
          {toast}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
