import type { CSSProperties } from "react";

/**
 * Converts a CSS declaration string (as written in the design export) into a React style object.
 * Keeping the design's inline declarations verbatim makes the port reviewable line-by-line against
 * design/Playbook Manager.dc.html. Parsed results are cached per string.
 */
const cache = new Map<string, CSSProperties>();

function camel(prop: string): string {
  if (prop.startsWith("--")) return prop;
  return prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function sx(css: string): CSSProperties {
  const hit = cache.get(css);
  if (hit) return hit;
  const out: Record<string, string | number> = {};
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i === -1) continue;
    const prop = decl.slice(0, i).trim();
    const value = decl.slice(i + 1).trim();
    if (!prop || !value) continue;
    out[camel(prop)] = value;
  }
  const frozen = Object.freeze(out) as CSSProperties;
  cache.set(css, frozen);
  return frozen;
}

/** Merge a base declaration string with dynamic overrides. */
export function sxm(css: string, overrides: CSSProperties): CSSProperties {
  return { ...sx(css), ...overrides };
}
