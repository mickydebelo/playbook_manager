import type { SourceType } from "@/shared/enums";

/**
 * A parsed document, flattened to the shape ingest actually needs.
 *
 * The prototype's parsers produced a chapters/sections/steps tree because it imported documents
 * *as* playbook content. Here a document becomes retrievable knowledge, so what matters is the
 * text and which page or slide it came from — that is what makes a real citation possible.
 */
export type ParsedPage = {
  /** 1-based page (PDF) or slide (PPTX) number; null when the format has no pagination. */
  pageNo: number | null;
  /** The heading this passage sits under, when the format carries one. */
  heading: string | null;
  text: string;
};

export type ParsedDocument = {
  /** Document title from its own metadata or first heading, for when the uploader gives none. */
  title: string | null;
  pages: ParsedPage[];
  /** How many pages or slides the original has, for the library's metadata. */
  pageCount: number | null;
};

export type IngestFileType = Extract<SourceType, "pdf" | "docx" | "pptx">;
