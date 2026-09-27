import type { AnswerGrounding, CitedParagraph } from './types';

/**
 * Citation enforcement before rendering: only slugs read this turn count, and model markdown
 * never shows literally. `unread` (nothing read) is demoted; `uncited` (read, no marker) gets
 * the read list as source chips instead.
 */

const CITATION_PATTERN = /\[\[([^[\]]+)\]\]/g;

export interface CitationResult {
  paragraphs: CitedParagraph[];
  grounding: AnswerGrounding;
  /** Names invalidated because they were never read. The screen says so rather than deleting them quietly. */
  droppedCitations: string[];
}

export function extractCitations(text: string, readSlugs: readonly string[]): CitationResult {
  const allowed = new Set(readSlugs.map((slug) => slug.trim()).filter(Boolean));
  const allowedTails = new Map<string, string>();
  for (const slug of allowed) {
    const index = slug.lastIndexOf('/');
    if (index >= 0) allowedTails.set(slug.slice(index + 1), slug);
  }

  const dropped = new Set<string>();
  const paragraphs: CitedParagraph[] = [];

  for (const block of stripInlineMarkup(text).split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const citations: string[] = [];
    for (const match of trimmed.matchAll(CITATION_PATTERN)) {
      const raw = match[1].trim();
      const resolved = allowed.has(raw) ? raw : allowedTails.get(raw);
      if (resolved) {
        if (!citations.includes(resolved)) citations.push(resolved);
      } else {
        dropped.add(raw);
      }
    }
    paragraphs.push({ text: trimmed, citations });
  }

  const total = paragraphs.reduce((sum, paragraph) => sum + paragraph.citations.length, 0);
  return {
    paragraphs,
    grounding: total > 0 ? 'grounded' : allowed.size > 0 ? 'uncited' : 'unread',
    droppedCitations: [...dropped],
  };
}

const BOLD_PATTERN = /\*\*([^*\n]+)\*\*/g;
const INLINE_CODE_PATTERN = /`([^`\n]+)`/g;

/** Strips inline markdown the model wrote, outside code fences, since this surface does not render it. */
function stripInlineMarkup(text: string): string {
  let inFence = false;
  return text
    .split('\n')
    .map((line) => {
      if (line.trimStart().startsWith('```')) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line.replace(BOLD_PATTERN, '$1').replace(INLINE_CODE_PATTERN, '$1');
    })
    .join('\n');
}
