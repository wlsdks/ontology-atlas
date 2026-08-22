import type { AnswerGrounding, CitedParagraph } from './types';

/**
 * Citation enforcement — validates `[[slug]]` citations before the answer is rendered.
 *
 * Three rules:
 * ① **A slug not actually read this turn is not a citation.** Turning a name the
 *    model invented into a chip takes the user somewhere empty when pressed.
 * ② The evidence verdict has **two branches** — see below.
 * ③ Markdown notation the model wrote (`**bold**`, inline code) does not survive as
 *    literal characters on screen. Those characters carry no information.
 *
 * ## Why "zero citations" alone must not decide (2026-08-02)
 *
 * This file long looked only at `demoted: total === 0` — a count of citation
 * **markers**, unrelated to tool calls. In a measured turn the agent called tools
 * four times and read 1,370 characters, with "read: capabilities/checkout, 635
 * characters" printed on screen, and four lines below it said "answered with no
 * evidence read" — because the model wrote the name in backticks instead of
 * `[[…]]`. The screen contradicted its own screen.
 *
 * So the branches are split. The two have **different next actions**:
 *
 * - `unread` — nothing was read this turn. There genuinely is no evidence, so it is
 *   demoted and given a way back (read again and answer).
 * - `uncited` — it was read, only the notation is missing. That is not a problem to
 *   fix but **an accurate self-description**, so no control is attached. The screen
 *   compensates mechanically with the read list as "sources consulted" chips —
 *   never relying on the model complying.
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

/**
 * **Deletes inline markdown notation the model wrote, character by character**
 * (it is not rendered).
 *
 * `**증거가 없는 기능(\`capability\`):**` was being printed literally on screen.
 * Asterisks and backticks carry no information on this surface — the emphasis
 * grammar of the conversation body is the citation chip, and `[[…]]` already owns that.
 *
 * Inside a code fence (```) nothing is touched: there the backticks are the
 * boundary, and deleting them collapses the content.
 */
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
