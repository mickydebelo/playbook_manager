import { ingestFileType } from "./file-types";
import { parseDocx } from "./parse-docx";
import { parsePdf } from "./parse-pdf";
import { parsePptx } from "./parse-pptx";
import type { IngestFileType, ParsedDocument } from "./types";

/**
 * The parser dispatcher, lifted out of the prototype's `analyze.ts`.
 *
 * A parse failure is reported as an empty document rather than thrown: a source that cannot be
 * read should land in the library as an un-indexed draft the curator can see and deal with, not
 * disappear with a stack trace in a worker log.
 */
export type ParseOutcome = ParsedDocument & { fileType: IngestFileType; error: string | null };

export function parseImportBuffer(buffer: Buffer, fileName: string, declaredType?: IngestFileType): ParseOutcome {
  const fileType = declaredType ?? ingestFileType(fileName);
  if (!fileType) {
    return { fileType: "pdf", title: null, pages: [], pageCount: null, error: `${fileName} is not a PDF, Word or PowerPoint file` };
  }

  try {
    const parsed = fileType === "pdf" ? parsePdf(buffer) : fileType === "docx" ? parseDocx(buffer) : parsePptx(buffer);
    if (!parsed.pages.length) {
      // Seen in practice with scans and with "print to PDF" output that draws every glyph as a
      // vector outline: there is no text in the file to find, so say that rather than blaming the
      // parser. Recovering it would need OCR, which is out of scope.
      const why =
        fileType === "pdf"
          ? "No readable text was found. The pages are images or outlines rather than text, so it would need OCR."
          : "No readable text was found. The file may be empty or protected.";
      return { ...parsed, fileType, error: why };
    }
    return { ...parsed, fileType, error: null };
  } catch (err) {
    return {
      fileType,
      title: null,
      pages: [],
      pageCount: null,
      error: err instanceof Error ? err.message : "The file could not be parsed",
    };
  }
}
