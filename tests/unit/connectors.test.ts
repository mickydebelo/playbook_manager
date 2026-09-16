import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localFolderConnector } from "@/server/modules/ingest/connectors";

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pm-ingest-"));
  fs.writeFileSync(path.join(root, "handbook.docx"), "not really a docx, but it is a file");
  fs.writeFileSync(path.join(root, "guide.pdf"), "%PDF-1.4");
  fs.writeFileSync(path.join(root, "notes.txt"), "an unsupported format");
  fs.mkdirSync(path.join(root, "subfolder"));
  // A file the connector must never reach, one level above the watched folder.
  fs.writeFileSync(path.join(root, "..", "pm-outside-secret.txt"), "secret");
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(path.join(root, "..", "pm-outside-secret.txt"), { force: true });
});

describe("localFolderConnector", () => {
  it("lists only the formats ingest can parse, and no directories", async () => {
    const files = await localFolderConnector(root).list();
    expect(files.map((f) => f.fileName)).toEqual(["guide.pdf", "handbook.docx"]);
    expect(files.every((f) => f.sizeBytes > 0)).toBe(true);
  });

  it("reads a listed file", async () => {
    const connector = localFolderConnector(root);
    expect((await connector.fetch("guide.pdf")).toString("latin1")).toBe("%PDF-1.4");
  });

  it("refuses to walk out of the watched folder", async () => {
    const connector = localFolderConnector(root);
    // The id is sanitised to a bare filename, so traversal cannot resolve outside the root and the
    // read simply fails rather than returning a file from elsewhere on the host.
    await expect(connector.fetch("../pm-outside-secret.txt")).rejects.toThrow();
    await expect(connector.fetch("/etc/passwd")).rejects.toThrow();
  });

  it("says plainly when the folder cannot be read", async () => {
    await expect(localFolderConnector(path.join(root, "does-not-exist")).list()).rejects.toThrow(/INGEST_LOCAL_DIR/);
  });
});
