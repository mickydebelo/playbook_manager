import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getEnv } from "../../env";
import { AppError } from "../../http/errors";

/**
 * Prints the rendered document to PDF with headless Chrome.
 *
 * The same HTML backs the in-app preview, so what the consultant sees is what they export. Chrome
 * is invoked as a binary rather than through a driver library: no package to install, and no
 * browser download on a network where the package mirror is often unreachable.
 */
const CANDIDATE_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
];

export async function findBrowser(): Promise<string | null> {
  const configured = getEnv().CHROME_PATH;
  if (configured) {
    try {
      await fs.access(configured);
      return configured;
    } catch {
      return null;
    }
  }
  for (const candidate of CANDIDATE_PATHS) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

const PRINT_TIMEOUT_MS = 90_000;

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await findBrowser();
  if (!browser) {
    throw new AppError(
      "internal",
      "No Chrome or Chromium was found for PDF export. Install one, or set CHROME_PATH to its binary. Word export does not need it.",
    );
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pm-pdf-"));
  const htmlPath = path.join(dir, "document.html");
  const pdfPath = path.join(dir, `${randomUUID()}.pdf`);
  try {
    await fs.writeFile(htmlPath, html, "utf8");
    // No --user-data-dir on purpose. Pointing Chrome at a fresh profile directory hangs
    // indefinitely on a managed macOS install; with the default profile it prints in ~2 seconds.
    // Jobs are drained one at a time, so concurrent prints are not a concern.
    await run(browser, [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      "--no-pdf-header-footer",
      `--print-to-pdf=${pdfPath}`,
      `file://${htmlPath}`,
    ]);
    const pdf = await fs.readFile(pdfPath);
    if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new AppError("internal", "The browser did not produce a PDF");
    return pdf;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new AppError("internal", "PDF rendering timed out"));
    }, PRINT_TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new AppError("internal", `Could not start the browser for PDF export: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      // Chrome prints diagnostics to stderr even on success, so only the exit code decides.
      if (code === 0) resolve();
      else reject(new AppError("internal", `PDF rendering failed (exit ${code}). ${stderr.slice(0, 300)}`));
    });
  });
}
