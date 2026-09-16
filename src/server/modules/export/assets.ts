import fs from "node:fs/promises";
import path from "node:path";

/**
 * Brand assets for the document renderer.
 *
 * The preview runs in an iframe on our own origin, so it can reference `/brand` and `/fonts`
 * directly. The PDF is printed by Chrome from a temporary `file://` page, where those absolute
 * paths resolve to `file:///brand/...` and silently render as a broken image in a Word-grade
 * deliverable. The PDF therefore gets the same assets inlined as data URIs, which also means the
 * export needs neither the web server nor the network and works from the out-of-process worker.
 */
export type DocumentAssets = {
  logo: string;
  art: string;
  /** Emitted as @font-face rules. The print stylesheet names Artifakt but cannot assume it is installed. */
  fonts: { family: string; weight: number; url: string }[];
};

/** Fixed, repository-owned files. No part of these paths comes from a request. */
const LOGO_FILE = "brand/autodesk-logo.png";
const ART_FILE = "brand/cover.jpg";
const FONT_FILES = [
  { family: "Artifakt Element", weight: 400, file: "fonts/ArtifaktElement-Regular.otf" },
  { family: "Artifakt Element", weight: 700, file: "fonts/ArtifaktElement-Bold.otf" },
  { family: "Artifakt Legend", weight: 400, file: "fonts/ArtifaktLegend-Regular.otf" },
  { family: "Artifakt Legend", weight: 700, file: "fonts/ArtifaktLegend-Bold.otf" },
] as const;

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".otf": "font/otf",
};

/** URLs for the in-app preview: same origin, so the browser caches them across polls. */
export function webAssets(baseUrl = ""): DocumentAssets {
  return {
    logo: `${baseUrl}/${LOGO_FILE}`,
    art: `${baseUrl}/${ART_FILE}`,
    fonts: FONT_FILES.map((f) => ({ family: f.family, weight: f.weight, url: `${baseUrl}/${f.file}` })),
  };
}

async function dataUri(relPath: string): Promise<string> {
  const abs = path.join(process.cwd(), "public", relPath);
  const bytes = await fs.readFile(abs);
  return `data:${MIME[path.extname(abs).toLowerCase()] ?? "application/octet-stream"};base64,${bytes.toString("base64")}`;
}

let cached: DocumentAssets | null = null;

/** Assets inlined for printing. Read once per process — they are a megabyte and never change. */
export async function inlineAssets(): Promise<DocumentAssets> {
  if (cached) return cached;
  const [logo, art, ...fonts] = await Promise.all([
    dataUri(LOGO_FILE),
    dataUri(ART_FILE),
    ...FONT_FILES.map((f) => dataUri(f.file)),
  ]);
  cached = {
    logo: logo!,
    art: art!,
    fonts: FONT_FILES.map((f, i) => ({ family: f.family, weight: f.weight, url: fonts[i]! })),
  };
  return cached;
}
