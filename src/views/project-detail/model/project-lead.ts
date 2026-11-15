import { splitProjectBrief } from "./project-brief";

const NON_PROSE_BLOCK = /^(#{1,6}\s|[-*+]\s|\d+\.\s|>|```|~~~|\|)/;
const HEADING_BLOCK = /^#{1,6}\s/;

/** The first prose paragraph, else the first non-heading block, so a body that opens with a list still leads. */
function firstParagraph(markdown: string): string {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  return blocks.find((block) => !NON_PROSE_BLOCK.test(block)) ?? blocks.find((block) => !HEADING_BLOCK.test(block)) ?? "";
}

/** The description above it already says the first sentence, so the paragraph starts after it. */
function withoutLeadSentence(paragraph: string, leadSentence: string | null | undefined): string {
  if (!leadSentence) return paragraph;
  const normalized = paragraph.replace(/\s+/g, " ").trim();
  const lead = leadSentence.replace(/\s+/g, " ").trim();
  if (!lead || !normalized.startsWith(lead)) return paragraph;
  return normalized.slice(lead.length).trim();
}

/** `[[a/b|Label]]` reads as Label and `[[a/b]]` as a/b, since Markdown would print the brackets. */
function readWikilinks(markdown: string): string {
  return markdown.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, target: string, label?: string) =>
    (label ?? target.split("#")[0]).trim(),
  );
}

/**
 * The project document's lead paragraph: above the first `##`, else the first section's, without
 * the sentence the description already said. Empty when the document adds nothing to it.
 */
export function resolveProjectLead(body: string | null | undefined, leadSentence?: string | null): string {
  const brief = splitProjectBrief(body);
  const paragraph = firstParagraph(brief.lead) || firstParagraph(brief.sections[0]?.markdown ?? "");
  return readWikilinks(withoutLeadSentence(paragraph, leadSentence));
}
