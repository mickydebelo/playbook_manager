import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { assets } from "../../db/schema";
import { getEnv } from "../../env";
import { AppError, notFound } from "../../http/errors";

/**
 * File storage behind a small adapter. The local driver writes under STORAGE_LOCAL_DIR and is what
 * development and the current deployment use; an S3 driver slots in behind the same interface.
 * Every stored file gets a row in `assets` so downloads can be authorised.
 */
export type StoredAsset = { id: string; storageKey: string; fileName: string; mimeType: string; sizeBytes: number };

export interface StorageDriver {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

class LocalStorageDriver implements StorageDriver {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    // Refuse anything that escapes the storage root.
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new AppError("validation_failed", "Invalid storage key");
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.resolve(key));
    } catch {
      throw notFound("File");
    }
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }
}

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  const env = getEnv();
  if (env.STORAGE_DRIVER === "s3") {
    // The S3 driver is not built yet; failing loudly beats writing to disk on a server that has none.
    throw new AppError("internal", "STORAGE_DRIVER=s3 is configured but the S3 driver is not implemented yet");
  }
  // The opt-out is what the build asks for: this path comes from configuration, not from a
  // request, and without it Turbopack traces the entire project into the server bundle.
  driver = new LocalStorageDriver(path.resolve(/* turbopackIgnore: true */ process.cwd(), env.STORAGE_LOCAL_DIR));
  return driver;
}

/** Test helper: swap in an in-memory driver. */
export function setStorageDriverForTests(next: StorageDriver | null): void {
  driver = next;
}

export async function storeAsset(
  db: Db,
  input: { data: Buffer; fileName: string; mimeType: string; prefix: string; uploadedBy?: string | null },
): Promise<StoredAsset> {
  const sha256 = createHash("sha256").update(input.data).digest("hex");
  const key = `${input.prefix}/${sha256.slice(0, 2)}/${sha256}-${input.fileName}`;
  await getStorage().put(key, input.data);

  // The key is the content hash, so storing the same bytes twice is the same file: reuse the row
  // rather than violating the unique key. Re-exporting an unchanged playbook, or re-uploading a
  // document someone already added, both land here.
  const [existing] = await db.select().from(assets).where(eq(assets.storageKey, key)).limit(1);
  if (existing) {
    return {
      id: existing.id,
      storageKey: existing.storageKey,
      fileName: existing.fileName,
      mimeType: existing.mimeType,
      sizeBytes: existing.sizeBytes,
    };
  }

  const [row] = await db
    .insert(assets)
    .values({
      storageKey: key,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.data.length,
      sha256,
      uploadedBy: input.uploadedBy ?? null,
    })
    .returning();
  return { id: row!.id, storageKey: row!.storageKey, fileName: row!.fileName, mimeType: row!.mimeType, sizeBytes: row!.sizeBytes };
}

export async function readAsset(db: Db, assetId: string): Promise<{ data: Buffer; fileName: string; mimeType: string }> {
  const [row] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!row) throw notFound("File");
  return { data: await getStorage().get(row.storageKey), fileName: row.fileName, mimeType: row.mimeType };
}
