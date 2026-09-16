import { inflateRawSync } from "node:zlib";

/**
 * A minimal ZIP reader, enough for the Office Open XML containers a .docx and .pptx are.
 *
 * The counterpart to `export/zip.ts`, and hand-written for the same reason: the Artifactory mirror
 * is not reliably reachable from the Autodesk network, so `jszip` cannot be depended on. Only what
 * Office files use is implemented — stored and deflated entries, no encryption, no zip64.
 */
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const MAX_COMMENT = 0xffff;

/** A malformed or hostile archive must not be able to exhaust memory. */
const MAX_ENTRY_BYTES = 80 * 1024 * 1024;

export type ZipArchive = {
  /** Entry paths in central-directory order. */
  names: string[];
  /** Reads one entry, or null when it is absent. Decompression is lazy. */
  read(path: string): Buffer | null;
  text(path: string): string | null;
};

function findEndOfCentralDirectory(buf: Buffer): number {
  const floor = Math.max(0, buf.length - MAX_COMMENT - 22);
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

export function openZip(buf: Buffer): ZipArchive {
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0) throw new Error("Not a ZIP file, or the archive is truncated");

  const entryCount = buf.readUInt16LE(eocd + 10);
  let cursor = buf.readUInt32LE(eocd + 16);

  type Entry = { method: number; compressedSize: number; uncompressedSize: number; localOffset: number };
  const entries = new Map<string, Entry>();
  const names: string[] = [];

  for (let i = 0; i < entryCount && cursor + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) break;
    const nameLength = buf.readUInt16LE(cursor + 28);
    const extraLength = buf.readUInt16LE(cursor + 30);
    const commentLength = buf.readUInt16LE(cursor + 32);
    const name = buf.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    entries.set(name, {
      method: buf.readUInt16LE(cursor + 10),
      compressedSize: buf.readUInt32LE(cursor + 20),
      uncompressedSize: buf.readUInt32LE(cursor + 24),
      localOffset: buf.readUInt32LE(cursor + 42),
    });
    names.push(name);
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  const read = (path: string): Buffer | null => {
    const entry = entries.get(path);
    if (!entry) return null;
    if (entry.uncompressedSize > MAX_ENTRY_BYTES) throw new Error(`Archive entry ${path} is too large to parse`);

    // The local header repeats the name and extra fields; the data starts after them.
    const local = entry.localOffset;
    if (local + 30 > buf.length) throw new Error(`Archive entry ${path} points outside the file`);
    const nameLength = buf.readUInt16LE(local + 26);
    const extraLength = buf.readUInt16LE(local + 28);
    const start = local + 30 + nameLength + extraLength;
    const body = buf.subarray(start, start + entry.compressedSize);

    if (entry.method === 0) return Buffer.from(body);
    if (entry.method === 8) return inflateRawSync(body, { maxOutputLength: MAX_ENTRY_BYTES });
    throw new Error(`Archive entry ${path} uses unsupported compression method ${entry.method}`);
  };

  return {
    names,
    read,
    text: (path: string) => read(path)?.toString("utf8") ?? null,
  };
}
