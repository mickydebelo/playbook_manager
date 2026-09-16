import fs from "node:fs/promises";
import path from "node:path";
import { getEnv } from "../../env";
import { AppError } from "../../http/errors";
import { extensionOf, fileExceedsSizeLimit, INGEST_EXTENSIONS, safeFileName } from "./file-types";

/**
 * Where documents come from.
 *
 * One interface so the local folder used today and SharePoint later are the same thing to the
 * ingest job. `list` is metadata only; `fetch` is separate so a large library can be enumerated
 * cheaply and only the chosen files downloaded.
 */
export type ConnectorFile = {
  /** Stable within a connector, and what `fetch` is called with. */
  id: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: Date | null;
};

export type SourceConnector = {
  readonly kind: "local_folder" | "sharepoint";
  list(): Promise<ConnectorFile[]>;
  fetch(id: string): Promise<Buffer>;
};

const supported = (fileName: string) => (INGEST_EXTENSIONS as readonly string[]).includes(extensionOf(fileName));

/**
 * A watched directory on the host. Fully testable now, and the shape SharePoint has to match.
 *
 * The root comes from configuration, never from a request, and every candidate path is checked to
 * resolve inside that root — so a crafted id cannot walk out of the watched folder.
 */
export function localFolderConnector(root: string): SourceConnector {
  const resolvedRoot = path.resolve(root);

  const resolveInside = (id: string): string => {
    const target = path.resolve(resolvedRoot, safeFileName(id));
    if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
      throw new AppError("forbidden", "That file is outside the watched folder");
    }
    return target;
  };

  return {
    kind: "local_folder",
    async list() {
      let entries: string[];
      try {
        entries = await fs.readdir(resolvedRoot);
      } catch {
        throw new AppError("internal", `The watched folder ${resolvedRoot} cannot be read. Set INGEST_LOCAL_DIR to a readable directory.`);
      }
      const files: ConnectorFile[] = [];
      for (const entry of entries) {
        if (!supported(entry)) continue;
        try {
          const stat = await fs.stat(path.join(resolvedRoot, entry));
          if (!stat.isFile() || fileExceedsSizeLimit(stat.size)) continue;
          files.push({ id: entry, fileName: entry, sizeBytes: stat.size, modifiedAt: stat.mtime });
        } catch {
          // A file that vanished between readdir and stat is simply skipped.
        }
      }
      return files.sort((a, b) => a.fileName.localeCompare(b.fileName));
    },
    async fetch(id: string) {
      return fs.readFile(resolveInside(id));
    },
  };
}

/**
 * SharePoint through Microsoft Graph.
 *
 * Written against the documented Graph endpoints but **unverified**: no credentials exist in this
 * environment yet, and the prototype's SharePoint module was a stub with no Graph client, so only
 * its environment-variable shape and its permission set (`Sites.ReadWrite.All`,
 * `Files.ReadWrite.All`) carry over. It fails with a clear message rather than pretending to work.
 */
export function sharePointConnector(): SourceConnector {
  const env = getEnv();
  const { SHAREPOINT_TENANT_ID: tenant, SHAREPOINT_CLIENT_ID: clientId, SHAREPOINT_CLIENT_SECRET: secret, SHAREPOINT_DRIVE_ID: driveId } = env;

  const requireConfig = () => {
    if (!tenant || !clientId || !secret || !driveId) {
      throw new AppError(
        "internal",
        "SharePoint ingest is not configured. Set SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET and SHAREPOINT_DRIVE_ID.",
      );
    }
  };

  const token = async (): Promise<string> => {
    requireConfig();
    const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: secret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    });
    if (!res.ok) throw new AppError("internal", `SharePoint sign-in failed (${res.status})`);
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) throw new AppError("internal", "SharePoint sign-in returned no token");
    return body.access_token;
  };

  return {
    kind: "sharepoint",
    async list() {
      const auth = await token();
      const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/root/children`, {
        headers: { authorization: `Bearer ${auth}` },
      });
      if (!res.ok) throw new AppError("internal", `SharePoint listing failed (${res.status})`);
      const body = (await res.json()) as { value?: { id: string; name: string; size?: number; lastModifiedDateTime?: string; file?: unknown }[] };
      return (body.value ?? [])
        .filter((item) => item.file && supported(item.name))
        .map((item) => ({
          id: item.id,
          fileName: item.name,
          sizeBytes: item.size ?? 0,
          modifiedAt: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : null,
        }));
    },
    async fetch(id: string) {
      const auth = await token();
      const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(id)}/content`, {
        headers: { authorization: `Bearer ${auth}` },
      });
      if (!res.ok) throw new AppError("internal", `SharePoint download failed (${res.status})`);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

export function connectorFor(kind: "local_folder" | "sharepoint"): SourceConnector {
  if (kind === "sharepoint") return sharePointConnector();
  const dir = getEnv().INGEST_LOCAL_DIR;
  if (!dir) throw new AppError("internal", "Local folder ingest is not configured. Set INGEST_LOCAL_DIR.");
  return localFolderConnector(dir);
}
