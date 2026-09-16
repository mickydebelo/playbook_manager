import type { IngestFileType } from "./types";

/** Ported from the prototype's `file-types.ts`, trimmed to the formats this ingest supports. */
export {
  INGEST_ACCEPT_ATTR,
  INGEST_EXTENSIONS,
  INGEST_FORMATS_LABEL,
  MAX_INGEST_FILE_SIZE,
  MAX_INGEST_FILE_SIZE_LABEL,
  MAX_INGEST_FILE_SIZE_MB,
} from "@/shared/ingest-formats";
import { MAX_INGEST_FILE_SIZE } from "@/shared/ingest-formats";

export const MIME_FOR_TYPE: Record<IngestFileType, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function extensionOf(fileName: string): string {
  const at = fileName.lastIndexOf(".");
  return at < 0 ? "" : fileName.slice(at).toLowerCase();
}

export function ingestFileType(fileName: string): IngestFileType | null {
  switch (extensionOf(fileName)) {
    case ".pdf":
      return "pdf";
    case ".docx":
      return "docx";
    case ".pptx":
      return "pptx";
    default:
      return null;
  }
}

export function fileExceedsSizeLimit(sizeBytes: number): boolean {
  return sizeBytes > MAX_INGEST_FILE_SIZE;
}

/**
 * Strips any directory component and anything that is not a safe filename character.
 *
 * Ingest filenames arrive from uploads and watched folders, and are used to build storage keys, so
 * they are treated as untrusted input: a name like `../../etc/passwd` must not survive this.
 */
export function safeFileName(fileName: string): string {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .replace(/^[._]+/, "")
    .slice(0, 180)
    .trim();
  return cleaned || "upload";
}

/** A human title from a filename, used when no better metadata exists. */
export function titleFromFileName(fileName: string): string {
  const base = safeFileName(fileName).replace(/\.[^.]+$/, "");
  const spaced = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "Untitled source";
}
