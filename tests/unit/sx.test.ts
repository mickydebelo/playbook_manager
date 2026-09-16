import { describe, expect, it } from "vitest";
import { sx, sxm } from "@/lib/ui/sx";

describe("sx", () => {
  it("converts design declaration strings to React style objects", () => {
    expect(sx("display:flex;gap:8px;border-radius:var(--radius-md)")).toEqual({ display: "flex", gap: "8px", borderRadius: "var(--radius-md)" });
  });
  it("keeps values containing colons or commas intact and ignores empty declarations", () => {
    expect(sx("background:url(a:b);clip-path:polygon(30% 0,100% 0,100% 100%,0 100%);;")).toEqual({
      background: "url(a:b)",
      clipPath: "polygon(30% 0,100% 0,100% 100%,0 100%)",
    });
  });
  it("caches and merges overrides", () => {
    expect(sx("color:red")).toBe(sx("color:red"));
    expect(sxm("color:red;padding:4px", { color: "blue" })).toEqual({ color: "blue", padding: "4px" });
  });
});
