/**
 * Throwaway end-to-end driver: walks the whole wizard against a running dev server the way the
 * browser does, so every stage can be judged on real output rather than on unit tests.
 *
 * Usage: BASE=http://localhost:3100 npx tsx scripts/e2e-run.ts
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = path.join(process.cwd(), ".data/e2e");
let cookie = "";

async function call<T>(method: string, route: string, body?: unknown, raw = false): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      "x-requested-with": "playbook-manager",
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined && !isForm ? { "content-type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0]!;
  if (raw) {
    if (!res.ok) throw new Error(`${method} ${route} → ${res.status}`);
    return Buffer.from(await res.arrayBuffer()) as T;
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

type Job = { id: string; status: string; progress: { done: number; total: number; label: string } | null; error: string | null; result: unknown };

async function wait(jobId: string, label: string): Promise<Job> {
  const started = Date.now();
  let last = "";
  for (;;) {
    const job = await call<Job>("GET", `/api/jobs/${jobId}`);
    const line = job.progress ? `${job.progress.done}/${job.progress.total} ${job.progress.label}` : job.status;
    if (line !== last) {
      console.log(`   ${label}: ${line} (${Math.round((Date.now() - started) / 1000)}s)`);
      last = line;
    }
    if (job.status === "succeeded" || job.status === "failed") return job;
    if (Date.now() - started > 10 * 60_000) throw new Error(`${label} did not finish`);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/** A real PDF, built here so the ingest test does not depend on any file on this machine. */
function samplePdf(pages: string[]): Buffer {
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  const first = 3 + pages.length;
  parts.push(Buffer.from(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`, "latin1"));
  parts.push(Buffer.from(`2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i} 0 R`).join(" ")}] >>\nendobj\n`, "latin1"));
  pages.forEach((_, i) => parts.push(Buffer.from(`${3 + i} 0 obj\n<< /Type /Page /Parent 2 0 R /Contents ${first + i} 0 R >>\nendobj\n`, "latin1")));
  pages.forEach((text, i) => {
    const stream = `BT /F1 12 Tf 72 720 Td (${text.replace(/([()\\])/g, "\\$1")}) Tj ET\n`;
    parts.push(Buffer.from(`${first + i} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`, "latin1"));
  });
  parts.push(Buffer.from(`trailer\n<< /Root 1 0 R >>\n%%EOF\n`, "latin1"));
  return Buffer.concat(parts);
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  // Drafting costs four minutes of model time, so an existing playbook can be reused when only
  // the later stages are being re-checked.
  const reuse = process.env.PLAYBOOK ?? "";

  console.log("1. sign in");
  const me = await call<{ name: string; role: string }>("POST", "/api/auth/dev-login", { email: "micky.debelo@autodesk.com" });
  console.log(`   ${me.name} (${me.role})`);

  console.log(reuse ? `2. reusing playbook ${reuse}` : "2. create the playbook and save a distinctive brief");
  const brief = {
    customerName: "Northwind Machinery",
    industry: "dm",
    sizeBand: "enterprise",
    objective: "Cut engineering change lead time by automating repetitive design work across three product lines.",
    focusAreas: ["Design automation", "Change management"],
    additionalContext: "They run Inventor and Vault today, with a small internal automation team.",
    sources: [{ kind: "link", title: "Northwind automation charter", url: "https://intranet.example.com/charter" }],
    brandColor: null,
    logoAssetId: null,
  };
  let playbookId = reuse;
  if (!reuse) {
    const created = await call<{ id: string }>("POST", "/api/playbooks", { ...brief, title: "Design automation playbook" });
    playbookId = created.id;
    await call("PUT", `/api/playbooks/${playbookId}/brief`, brief);
  }

  console.log("3. find knowledge (outline + candidate sources)");
  if (!reuse) {
  const fk = await call<{ jobId: string }>("POST", `/api/playbooks/${playbookId}/find-knowledge`);
  const fkJob = await wait(fk.jobId, "find_knowledge");
  if (fkJob.status === "failed") throw new Error(`find_knowledge failed: ${fkJob.error}`);
  console.log(`   result: ${JSON.stringify(fkJob.result)}`);
  }

  const detail = await call<{ outline: { title: string; sections: { id: string; title: string }[] }[] }>("GET", `/api/playbooks/${playbookId}`);
  console.log("   outline:");
  for (const c of detail.outline) console.log(`     ${c.title}${c.sections.length ? ` — ${c.sections.map((s) => s.title).join("; ")}` : ""}`);

  console.log("4. step 2: candidates, excerpts, selection");
  const sections = detail.outline.flatMap((c) => c.sections);
  let selected = 0;
  for (const section of reuse ? sections.slice(0, 1) : sections) {
    const candidates = await call<{ id: string; title: string; relevance: string; score: number | null }[]>(
      "GET",
      `/api/sections/${section.id}/knowledge`,
    );
    const pick = candidates.slice(0, 2);
    for (const c of pick) {
      await call("PUT", `/api/sections/${section.id}/sources/${c.id}`, { selected: true });
      selected++;
    }
    if (section === sections[0] && pick[0]) {
      const ex = await call<{ topic: string; excerpts: { n: number; text: string; pageNo: number | null; score: number }[] }>(
        "GET",
        `/api/sections/${section.id}/knowledge/${pick[0].id}/excerpts`,
      );
      console.log(`   excerpts for "${section.title}" ← ${pick[0].title}: ${ex.excerpts.length}`);
      for (const e of ex.excerpts.slice(0, 2)) console.log(`     [${e.n}] p.${e.pageNo ?? "-"} ${(e.score * 100).toFixed(0)}% ${e.text.slice(0, 120)}…`);
    }
  }
  console.log(`   selected ${selected} source links across ${sections.length} sections`);

  console.log("5. create the draft, watching progress");
  if (!reuse) {
  const cd = await call<{ jobId: string }>("POST", `/api/playbooks/${playbookId}/create-draft`, { overwrite: false });
  // Poll the content endpoint alongside the job, which is what step 3 does.
  const contentTicks: number[] = [];
  const poller = setInterval(() => {
    void call<{ contentMd: string }[]>("GET", `/api/playbooks/${playbookId}/content`)
      .then((rows) => contentTicks.push(rows.filter((r) => r.contentMd.trim()).length))
      .catch((err) => console.log(`   content poll failed: ${err instanceof Error ? err.message : err}`));
  }, 2000);
  const cdJob = await wait(cd.jobId, "create_draft");
  clearInterval(poller);
  if (cdJob.status === "failed") throw new Error(`create_draft failed: ${cdJob.error}`);
  console.log(`   result: ${JSON.stringify(cdJob.result)}`);
  console.log(`   sections with content over time: ${contentTicks.join(" → ")}`);
  }

  const content = await call<{ id: string; contentMd: string; wordCount: number }[]>("GET", `/api/playbooks/${playbookId}/content`);
  const total = content.reduce((n, r) => n + r.wordCount, 0);
  console.log(`   ${content.length} sections, ${total} words`);
  const titleOf = new Map(sections.map((sec) => [sec.id, sec.title]));
  const sample = content.find((r) => r.contentMd.trim());
  if (sample) {
    fs.writeFileSync(path.join(OUT, "sample-section.md"), sample.contentMd);
    console.log(`   sample "${titleOf.get(sample.id) ?? sample.id}" (${words(sample.contentMd)} words):\n${sample.contentMd.slice(0, 700)}\n`);
  }

  console.log("6. preview HTML");
  const preview = await call<Buffer>("GET", `/api/playbooks/${playbookId}/preview`, undefined, true);
  fs.writeFileSync(path.join(OUT, "preview.html"), preview);
  const html = preview.toString("utf8");
  console.log(`   ${preview.length} bytes, pages=${(html.match(/class="page"/g) ?? []).length}, fonts=${(html.match(/@font-face/g) ?? []).length}, data-uri assets=${(html.match(/url\(data:/g) ?? []).length}, root-relative refs=${(html.match(/"\/brand\//g) ?? []).length}`);

  console.log("7. export DOCX and PDF");
  for (const format of ["docx", "pdf"] as const) {
    const started = await call<{ exportId: string; jobId: string }>("POST", `/api/playbooks/${playbookId}/exports`, {
      format,
      includeSources: true,
      includeComments: false,
    });
    const job = await wait(started.jobId, `export_${format}`);
    if (job.status === "failed") {
      console.log(`   ${format} FAILED: ${job.error}`);
      continue;
    }
    const file = await call<Buffer>("GET", `/api/exports/${started.exportId}/download`, undefined, true);
    const target = path.join(OUT, `playbook.${format}`);
    fs.writeFileSync(target, file);
    console.log(`   ${format}: ${file.length} bytes → ${target} (magic ${file.subarray(0, 4).toString("latin1").replace(/[^\x20-\x7e]/g, ".")})`);
  }

  console.log("8. ingest a customer document, tagged to this customer");
  const pb = await call<{ customer: { id: string; name: string } }>("GET", `/api/playbooks/${playbookId}`);
  const form = new FormData();
  const pdfBytes = samplePdf([
        "Northwind change management: every engineering change request is reviewed by the automation council before release.",
    "Design automation at Northwind: iLogic rules generate the standard bracket family, cutting drawing time from hours to minutes.",
  ]);
  form.append("file", new Blob([new Uint8Array(pdfBytes)]), "northwind-automation-standard.pdf");
  form.append("customerId", pb.customer.id);
  const ingest = await call<{ sourceId: string; jobId: string; title: string }>("POST", "/api/knowledge/ingest", form);
  const ingestJob = await wait(ingest.jobId, "ingest_source");
  console.log(`   ${ingest.title}: ${ingestJob.status} ${JSON.stringify(ingestJob.result)}`);

  const library = await call<{ id: string; title: string; tags: string[]; customerId: string | null; indexedAt: string | null }[]>(
    "GET",
    "/api/knowledge?filter=all",
  );
  const row = library.find((l) => l.id === ingest.sourceId);
  console.log(`   library row: customerId=${row?.customerId ? "set" : "null"} indexedAt=${row?.indexedAt ? "set" : "null"}`);

  console.log("\nArtifacts in .data/e2e");
}

main().catch((err) => {
  console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
