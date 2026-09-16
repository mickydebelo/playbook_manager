import { useCallback, useState } from "react";

/** Class-component style `setState(patch | prev => patch)` so the prototype's logic ports line-for-line. */
export function useSetState<S extends object>(initial: S | (() => S)) {
  const [state, set] = useState<S>(initial);
  const setState = useCallback((patch: Partial<S> | ((prev: S) => Partial<S>)) => {
    set((prev) => {
      const next = typeof patch === "function" ? patch(prev) : patch;
      return next && Object.keys(next).length ? { ...prev, ...next } : prev;
    });
  }, []);
  return [state, setState] as const;
}
