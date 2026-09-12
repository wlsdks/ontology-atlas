/**
 * **One wiki body, sliced at the contract's five headings.**
 *
 * It was a private function inside `AnswerRevisionComparison.tsx` until 2026-09-12, when a
 * second reader appeared: the card a press on a Library mark opens says what a page is
 * about, and *what a page is about* is the first sentence of its own `## Summary` — not a
 * whole-body excerpt, which `buildExcerpt` strips headings out of and therefore cannot
 * locate. Two copies of a parser over one file format is how two screens come to read the
 * same page differently, so the function moved rather than being written again.
 */
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import { WIKI_SECTION_ORDER } from '@/shared/lib/wiki-page-schema';

export interface SectionSlices {
  /** Body text before the first contract heading, verbatim. */
  lead: string;
  /** Section name → that section's text, verbatim, heading line excluded. */
  sections: ReadonlyMap<string, string>;
  /** Whether this body uses the contract's headings at all. */
  structured: boolean;
}

/**
 * **Slice one body at the five contract headings — bytes untouched.**
 *
 * The wiki contract fixes the sections and their order (`wiki/_template.md`,
 * `WIKI_SECTION_ORDER`, enforced by `validateWikiPage`), so the *structure* is shared
 * between any two revisions of one answer even when no line of text is. That is the only
 * thing this function uses to line the two versions up: it cuts at the headings and hands
 * the text through unchanged. It computes no diff and rewrites no sentence — the 2026-09-11
 * record "Local Compile approval exposes the exact previous and proposed text" refuses
 * "semantic summaries or selective diffs", and a comparison that reworded either side would
 * be exactly that.
 *
 * It is deliberately *not* `buildAnswerPage`'s parser: that one normalises citations and
 * prefixes bullets while filing a page, which is right for writing a file and wrong for
 * showing a person what the file says. Only `## <exact section name>` outside a fence
 * switches sections; any other heading stays part of the text it sits in, and a repeated
 * section appends rather than replacing, so no line is ever dropped on the floor.
 */
export function sectionSlices(text: string): SectionSlices {
  const buffers = new Map<string, string[]>();
  const lead: string[] = [];
  let current: string[] | null = null;
  let inFence = false;
  let structured = false;
  for (const raw of parseFrontmatter(text).body.split('\n')) {
    const line = raw.trim();
    const fence = /^(```|~~~)/.test(line);
    if (!inFence && !fence) {
      const heading = /^##\s+(.+?)\s*$/.exec(line);
      const name = heading
        ? (WIKI_SECTION_ORDER as readonly string[]).find((section) => section === heading[1])
        : undefined;
      if (name) {
        structured = true;
        current = buffers.get(name) ?? [];
        buffers.set(name, current);
        continue;
      }
    }
    if (fence) inFence = !inFence;
    (current ?? lead).push(raw);
  }
  const sections = new Map<string, string>();
  for (const [name, lines] of buffers) {
    const body = lines.join('\n').replace(/^\s*\n+/, '').replace(/\n+\s*$/, '');
    if (body) sections.set(name, body);
  }
  return { lead: lead.join('\n').trim(), sections, structured };
}
