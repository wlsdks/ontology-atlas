
/**
 * The gateway's reading pages render vault markdown verbatim: `docs/guide/` and
 * `docs/CHANGELOG.md` are reviewed in the repository, and a screen-only copy would drift.
 */

export interface TrimmedDoc {
  body: string;
  omittedSections: number;
}

/**
 * Keeps only the first `limit` `## ` sections and counts the rest, so the screen can say where to
 * read them: the full CHANGELOG would be the heaviest screen in the product, and silent truncation
 * would claim completeness. The title and preamble always survive.
 */
export function trimToRecentSections(markdown: string, limit: number): TrimmedDoc {
  // Only a line-leading `## ` outside a code fence is a section boundary.
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

const CATEGORY_LINE = /^\*\*(?:Added|Changed|Fixed|Removed)\*\*/;

/**
 * Gives every changelog category line its own paragraph: frozen entries put `**Added**:` and
 * `**Fixed**:` on consecutive lines, which Markdown folds into one. Fenced blocks are left alone.
 */
export function separateCategoryLines(markdown: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const previous = out.at(-1);
    if (!inFence && CATEGORY_LINE.test(line) && previous !== undefined && previous.trim() !== '') {
      out.push('');
    }
    out.push(line);
  }
  return out.join('\n');
}

export interface DocEntry {
  id: string;
  heading: string;
  date: string | null;
  title: string;
  version: string | null;
  subject: string;
}

/**
 * Extracts `## ` sections as table-of-contents entries and mints their ids in one place, so the
 * sidebar link and body heading always share the anchor. Repeated titles get `-2`, `-3`, or every
 * link would go to the first.
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
    // The ledger writes `## YYYY-MM-DD · vX.Y.Z: …`, so the middle dot is a separator too.
    const dateMatch = /^(\d{4}-\d{2}-\d{2})\s*[—–·-]?\s*(.*)$/.exec(heading);
    const date = dateMatch ? dateMatch[1]! : null;
    const title = dateMatch && dateMatch[2] ? dateMatch[2]! : heading;
    const version = /^(v\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?|Unreleased)(?=:|\s|$)/.exec(title)?.[1] ?? null;
    const subject = (version ? title.slice(version.length).replace(/^[\s:·—–-]+/u, '') : title) || title;

    const base = slugifyHeading(heading);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    out.push({ id: seen === 0 ? base : `${base}-${seen + 1}`, heading, date, title, version, subject });
  }
  return out;
}

/**
 * A heading's matching key: inline markers stripped and whitespace collapsed, so the raw source
 * heading and the rendered `h2` text key the same anchor.
 */
export function normalizeHeadingKey(heading: string): string {
  return heading
    .replace(/[`*_~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Markdown heading to anchor id. Korean is kept, or most headings would slug to an empty string. */
function slugifyHeading(heading: string): string {
  return (
    heading
      .toLowerCase()
      .replace(/[`*_~\[\]()]/g, '')
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'entry'
  );
}
