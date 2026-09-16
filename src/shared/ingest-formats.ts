/**
 * What the knowledge library accepts. Shared because the browser needs the accept attribute and
 * the limit to state up front, and the server needs the same list to enforce them.
 */
export const INGEST_EXTENSIONS = [".pdf", ".docx", ".pptx"] as const;

export const MAX_INGEST_FILE_SIZE_MB = 100;
export const MAX_INGEST_FILE_SIZE = MAX_INGEST_FILE_SIZE_MB * 1024 * 1024;
export const MAX_INGEST_FILE_SIZE_LABEL = `${MAX_INGEST_FILE_SIZE_MB} MB`;

export const INGEST_ACCEPT_ATTR =
  ".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation";

export const INGEST_FORMATS_LABEL = "PDF (.pdf), Word (.docx) or PowerPoint (.pptx)";
