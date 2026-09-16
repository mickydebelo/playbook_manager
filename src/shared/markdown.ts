/**
 * The markdown vocabulary the playbook editor supports: '# ' titles, '## ' subheadings, plain
 * paragraphs and '- ' bullets. Shared by the editor, the document renderer and the Word export so
 * all three agree on what a section contains.
 */
export type Block =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

export function parseMarkdown(text: string): Block[] {
  const out: Block[] = [];
  let list: { type: "ul"; items: string[] } | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      list = null;
      continue;
    }
    if (line.startsWith("- ")) {
      if (!list) {
        list = { type: "ul", items: [] };
        out.push(list);
      }
      list.items.push(line.slice(2));
      continue;
    }
    list = null;
    if (line.startsWith("## ")) out.push({ type: "h2", text: line.slice(3) });
    else if (line.startsWith("# ")) out.push({ type: "h1", text: line.slice(2) });
    else out.push({ type: "p", text: line });
  }
  return out;
}

export function countWords(markdown: string): number {
  return markdown
    .replace(/[#>*_`-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
