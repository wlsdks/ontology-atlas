/**
 * The concept panel's description is the body's first paragraph after the title heading (and an
 * optional `## Definition`), the same paragraph `buildDefinitionPreview` reads back. These edit
 * that paragraph and that heading in the raw file, leaving every other byte alone.
 */

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
const TITLE_HEADING = /^ {0,3}#\s+(.+?)(?:\s+#+)?\s*$/;
const DEFINITION_HEADING = /^ {0,3}##[ \t]+Definition(?:[ \t]+#+)?[ \t]*$/;
const BLOCK_START = /^\s*(?:#{1,6}(?:\s|$)|>|`{3,}|~{3,}|[-+*]\s|\d+[.)]\s|\||<)/;

function splitBody(raw: string): { head: string; lines: string[] } {
  const match = raw.match(FRONTMATTER);
  const head = match ? match[0] : "";
  return { head, lines: raw.slice(head.length).split("\n") };
}

function skipBlank(lines: readonly string[], from: number): number {
  let i = from;
  while (i < lines.length && !lines[i].trim()) i += 1;
  return i;
}

export function replaceLeadParagraph(raw: string, next: string, titles: readonly string[]): string {
  const { head, lines } = splitBody(raw);
  let i = skipBlank(lines, 0);
  const heading = lines[i]?.match(TITLE_HEADING);
  if (heading && titles.includes(heading[1].trim())) i = skipBlank(lines, i + 1);
  if (lines[i] !== undefined && DEFINITION_HEADING.test(lines[i])) i = skipBlank(lines, i + 1);
  const text = next.trim().replace(/\s*\n\s*/g, " ");

  let end = i;
  if (i < lines.length && !BLOCK_START.test(lines[i])) {
    while (end < lines.length && lines[end].trim() && (end === i || !BLOCK_START.test(lines[end]))) end += 1;
  }
  if (end > i) {
    if (text) lines.splice(i, end - i, text);
    else lines.splice(i, skipBlank(lines, end) - i);
  } else if (text) {
    const insert = i < lines.length && lines[i] !== "" ? [text, ""] : [text];
    if (i > 0 && lines[i - 1].trim()) insert.unshift("");
    lines.splice(i, 0, ...insert);
    if (i + insert.length >= lines.length) lines.push("");
  }
  return head + lines.join("\n");
}

export function renameTitleHeading(raw: string, previous: string, next: string): string {
  const { head, lines } = splitBody(raw);
  const i = skipBlank(lines, 0);
  const heading = lines[i]?.match(TITLE_HEADING);
  if (!heading || heading[1].trim() !== previous.trim()) return raw;
  lines[i] = `# ${next.trim()}`;
  return head + lines.join("\n");
}
