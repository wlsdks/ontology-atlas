import { readWikilinks } from "@/shared/lib/concept-display/ontology-description";

import { splitProjectBrief } from "./project-brief";

const NON_PROSE_BLOCK = /^(#{1,6}\s|[-*+]\s|\d+\.\s|>|```|~~~|\|)/;
const HEADING_BLOCK = /^#{1,6}\s/;

function firstParagraph(markdown: string): string {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  return blocks.find((block) => !NON_PROSE_BLOCK.test(block)) ?? blocks.find((block) => !HEADING_BLOCK.test(block)) ?? "";
}

function withoutLeadSentence(paragraph: string, leadSentence: string | null | undefined): string {
  if (!leadSentence) return paragraph;
  const normalized = paragraph.replace(/\s+/g, " ").trim();
  const lead = leadSentence.replace(/\s+/g, " ").trim();
  if (!lead || !normalized.startsWith(lead)) return paragraph;
  return normalized.slice(lead.length).trim();
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
