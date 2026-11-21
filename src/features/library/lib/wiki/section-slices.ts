/**
 * One wiki body sliced at the contract's five headings; shared so two screens read the same page the
 * same way.
 */
import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';
import { WIKI_SECTION_ORDER } from '@/shared/lib/library/wiki-page-schema';

export interface SectionSlices {
  /** Body text before the first contract heading, verbatim. */
  lead: string;
  /** Section name → that section's text, verbatim, heading line excluded. */
  sections: ReadonlyMap<string, string>;
  /** Whether this body uses the contract's headings at all. */
  structured: boolean;
}

/**
 * Slices a body at the five contract headings (`WIKI_SECTION_ORDER`), bytes untouched: no diff, no
 * rewording. Unlike `buildAnswerPage`'s parser it does not normalise citations. Only `## <exact
 * section name>` outside a fence switches sections; repeated sections append.
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
