import { resolveStaticVaultSource } from '@/entities/docs-vault';

/**
 * The gateway's two reading pages **render markdown from inside the vault, verbatim**.
 *
 * Two reasons there is no hand-written marketing page instead.
 *
 * 1. **No second source of truth.** `docs/GUIDE.md` and `docs/CHANGELOG.md` are already in the
 *    repository and get reviewed. A screen-only copy guarantees that one side alone gets fixed, and
 *    the side a visitor sees is the stale one.
 * 2. **The product explains itself in its own format.** This site's reading material *is* an Atlas
 *    vault document, and the same file can be opened in the app or read by an agent over MCP.
 *    Dogfooding becomes an observable fact rather than a claim.
 */

/**
 * Vault slug → the raw markdown, or `null`.
 *
 * **Why `'dogfood'` is pinned here.** `resolveStaticVaultSource` normally has to respect the sample
 * the user chose (dogfood / storefront) — that is the rule preventing the 2026-07-26 defect of two
 * vaults mixed on one screen. **This is the one exception.** The gateway's guide and changelog are
 * *this product's documents*, not part of the example vault a visitor is browsing. A visitor who
 * picked the example storefront and opened `/guide` must get Atlas's guide, and the storefront vault
 * has no such document at all.
 *
 * So the resolver is **not bypassed** (importing the raw JSON directly would break the contract) —
 * the argument is fixed instead. The rule is "go through the resolver", not "follow the choice", and
 * following the choice here would be wrong.
 */
export function readVaultDoc(slug: string): string | null {
  const { content, contentPreviews } = resolveStaticVaultSource('dogfood');
  const doc = content[slug];
  if (typeof doc === 'string') return doc;
  // A document whose full text is not in the bundle (CHANGELOG) is drawn from the truncated synchronous
  // preview — how many sections were folded comes from the same source via `readVaultDocOmittedSections`.
  const preview = contentPreviews?.[slug];
  return typeof preview?.body === 'string' ? preview.body : null;
}

/**
 * How many `## ` sections were **already folded at bundle time** in the body `readVaultDoc(slug)`
 * returned.
 *
 * The screen (`GatewayDocPage`) truncates once more against its own display limit and **adds** the two
 * numbers to say "N folded" — counting only one side makes it a silent truncation (the screen adds
 * zero, unaware that the full text was left out of the bundle).
 */
export function readVaultDocOmittedSections(slug: string): number {
  const { contentPreviews } = resolveStaticVaultSource('dogfood');
  return contentPreviews?.[slug]?.omittedSections ?? 0;
}

export interface TrimmedDoc {
  /** The markdown to render. */
  body: string;
  /** How many sections were cut. Zero means the full text. */
  omittedSections: number;
}

/**
 * Keeps only the first `limit` `## ` sections.
 *
 * **Why truncate**: CHANGELOG is **318 KB** today. Unrolling that on one page through react-markdown
 * produces tens of thousands of DOM nodes and makes the gateway's reading material the heaviest screen
 * in the product. What someone opening the changelog actually wants is **what changed recently**, not
 * two years of full text.
 *
 * **When it truncates, it says so.** The number of hidden sections is counted and returned, and the
 * screen shows where to read the rest — the same face as this repository's rule that `"coming soon" is
 * a lie, not a degradation`. Silent truncation is the same as saying "this is all of it".
 *
 * The title (the first `# `) and the preamble under it are not sections and always survive.
 */
export function trimToRecentSections(markdown: string, limit: number): TrimmedDoc {
  // Only a line-leading `## ` is a section boundary — the inside of a fence is skipped so a `#` in a
  // code block is not counted as a section.
  const lines = markdown.split('\n');
  const boundaries: number[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    else if (!inFence && /^## (?!#)/.test(line)) boundaries.push(i);
  }

  if (boundaries.length <= limit) return { body: markdown, omittedSections: 0 };

  const cutAt = boundaries[limit]!;
  return {
    body: lines.slice(0, cutAt).join('\n').trimEnd(),
    omittedSections: boundaries.length - limit,
  };
}


export interface DocEntry {
  /** Anchor id — shared by the sidebar link and the body heading. */
  id: string;
  /** The full original text after `## `. Used to match the sidebar label. */
  heading: string;
  /** A leading `YYYY-MM-DD`, or `null`. */
  date: string | null;
  /** The remainder with the date and separator stripped; the heading verbatim when absent. */
  title: string;
}

/**
 * Extracts `## ` sections as **table-of-contents entries** (for the changelog sidebar).
 *
 * **Why the id is minted here.** The sidebar link and the body heading must use **the same string**
 * for the anchor to catch. Two places generating it means a slightly different rule (whitespace, case)
 * silently sends the link nowhere — a failure invisible until someone clicks. So one function emits
 * both the list and the ids.
 *
 * **Duplicate titles.** Several entries on one day can share a title. `-2`, `-3` are appended to keep
 * ids **always unique** — on a collision the browser only ever goes to the first, which makes the list
 * lie.
 */
export function extractEntries(markdown: string): DocEntry[] {
  const lines = markdown.split('\n');
  const out: DocEntry[] = [];
  const used = new Map<string, number>();
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(\`\`\`|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^## (?!#)(.+)$/.exec(line);
    if (!match) continue;

    const heading = match[1]!.trim();
    const dateMatch = /^(\d{4}-\d{2}-\d{2})\s*[—–-]?\s*(.*)$/.exec(heading);
    const date = dateMatch ? dateMatch[1]! : null;
    const title = dateMatch && dateMatch[2] ? dateMatch[2]! : heading;

    const base = slugifyHeading(heading);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    out.push({ id: seen === 0 ? base : `${base}-${seen + 1}`, heading, date, title });
  }
  return out;
}

/**
 * A heading's **matching key** — makes the source markdown and the rendered text the same string.
 *
 * ⚠️ Measured defect (2026-07-31): the list keyed on the raw
 * `` ## Two things to read at the gateway: `/guide` `` while the body `h2` was looked up as the **rendered**
 * `Two things to read at the gateway: /guide`. **Three headings containing inline markdown** (backticks, bold) had
 * their anchors silently broken — a failure invisible until someone clicks.
 *
 * So both sides pass through this function: inline markers are stripped and whitespace collapsed.
 */
export function normalizeHeadingKey(heading: string): string {
  return heading
    .replace(/[`*_~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Markdown heading → anchor id. Korean is not stripped — stripping it makes most headings an empty string. */
export function slugifyHeading(heading: string): string {
  return (
    heading
      .toLowerCase()
      .replace(/[`*_~\[\]()]/g, '')
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'entry'
  );
}
