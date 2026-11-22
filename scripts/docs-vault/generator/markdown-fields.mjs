// Reads one Markdown document's text into the fields a manifest entry carries:
// title and headings, a preview, and the links it sends to other documents.
import path from 'node:path';
import { DOCS_DIR } from './output-paths.mjs';

export function slugFromPath(full, baseDir = DOCS_DIR) {
  const rel = path.relative(baseDir, full).replace(/\\/g, '/');
  return rel.replace(/\.md$/, '');
}

export function firstHeading(body) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

export function extractHeadings(body) {
  const lines = body.split('\n');
  const out = [];
  const seen = new Map();
  let inCode = false;
  for (const line of lines) {
    if (line.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!m) continue;
    const depth = m[1].length;
    const text = m[2].trim();
    const slug = text
      .toLowerCase()
      .replace(/[^\w가-힣\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    const occurrence = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, occurrence);
    out.push({
      depth,
      text,
      slug: occurrence === 1 ? slug : `${slug}-${occurrence}`,
    });
  }
  return out;
}

export function buildDefinitionPreview(
  body,
  frontmatter,
  max = 320,
) {
  const titles = Object.entries(frontmatter)
    .filter(([key, value]) => (key === 'title' || key.startsWith('display_')) && typeof value === 'string')
    .map(([, value]) => value.trim());
  const lines = body.split(/\r?\n/);
  let index = 0;
  while (index < lines.length && !lines[index].trim()) index += 1;
  const heading = lines[index]?.match(/^ {0,3}#\s+(.+?)(?:\s+#+)?\s*$/);
  if (heading && titles.includes(heading[1].trim())) {
    index += 1;
    while (index < lines.length && !lines[index].trim()) index += 1;
  }
  if (/^ {0,3}##[ \t]+Definition(?:[ \t]+#+)?[ \t]*$/.test(lines[index] ?? '')) {
    index += 1;
    while (index < lines.length && !lines[index].trim()) index += 1;
  }
  const paragraph = [];
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) break;
    if (/^(?:=+|-+)\s*$/.test(trimmed) || /^\|?\s*:?-{3,}/.test(trimmed)) return undefined;
    if (/^(?: {4}|\t)/.test(line)) {
      if (!paragraph.length) return undefined;
      paragraph.push(trimmed);
      continue;
    }
    if (/^(?:\||<|!\[|\[[^\]]+\]:)/.test(trimmed)) return undefined;
    if (/^(?:#{1,6}(?:\s|$)|>|`{3,}|~{3,}|[-+*]\s|\d+[.)]\s|(?:\*\s*){3,}$|(?:_\s*){3,}$)/.test(trimmed)) break;
    paragraph.push(trimmed);
  }
  const preview = paragraph.join(' ').replace(/\s+/g, ' ').trim();
  return preview && preview.length <= max ? preview : undefined;
}

export function buildExcerpt(body) {
  // Kept in sync with src/shared/lib/vault-document/parse-frontmatter.ts buildExcerpt. Strip
  // markdown table separator/hr rows and turn cell pipes into middot separators
  // so a table body reads as prose instead of a wall of `|` pipes.
  const stripped = body
    .replace(/```[\s\S]*?```/g, '') // fenced code blocks
    .replace(/^#+\s.*$/gm, '') // headings
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → link text
    .replace(/^[\s|:-]*-{2,}[\s|:-]*$/gm, '') // table separator / hr rows
    .replace(/\s*\|\s*/g, ' · ') // table cell pipes → middot separators
    .replace(/^\s*[-•]\s+/gm, '') // list bullets
    // `#` stays: heading marks are already gone, and `path.tsx#Symbol` needs its separator.
    .replace(/[*_`>]/g, '') // residual emphasis / quote marks
    .replace(/\s+/g, ' ') // collapse whitespace
    .replace(/(?:·\s*){2,}/g, '· ') // collapse middot runs from empty cells
    .replace(/^[\s·]+|[\s·]+$/g, '') // trim leading/trailing middots
    .trim();
  return stripped.slice(0, 320);
}

// Normalises a wikilink target against the vault the document belongs to. Mirrors
// `resolveWikilinkTargetSlug` in src/shared/lib/vault-document/parse-frontmatter.ts, physically
// duplicated with no contract test: apply a fix in both.
// Wikilinks inside the nested docs/ontology/ vault are relative to its root (`capabilities/x`), but
// the merged `/docs` slug carries an `ontology/` prefix; without the correction backlinksDetail keys
// diverge and backlinks go missing.
export function resolveWikilinkTargetSlug(targetSlug, fromSlug) {
  if (fromSlug.startsWith('ontology/') && !targetSlug.startsWith('ontology/')) {
    return `ontology/${targetSlug}`;
  }
  return targetSlug;
}

export function extractOutLinksWithContext(body, fromSlug) {
  const slugs = new Set();
  const contexts = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(body))) {
    const target = m[2];
    const linkText = m[1];
    if (!target || target.startsWith('#')) continue;
    if (/^https?:\/\//i.test(target)) continue;
    if (!target.endsWith('.md') && !target.includes('.md#')) continue;
    const [mdPart] = target.split('#');
    const rel = mdPart.replace(/^\.\//, '');
    const fromDir = path.posix.dirname(fromSlug);
    const resolved = path.posix.normalize(
      fromDir === '.' ? rel : `${fromDir}/${rel}`,
    );
    const targetSlug = resolved.replace(/\.md$/, '');
    if (!targetSlug || targetSlug === fromSlug) continue;
    slugs.add(targetSlug);
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    const before = body.slice(Math.max(0, matchStart - 120), matchStart);
    const after = body.slice(matchEnd, matchEnd + 120);
    const raw = `${before}**[${linkText}]**${after}`;
    const context = raw.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    contexts.push({ target: targetSlug, context, linkText });
  }
  // Wikilinks [[slug]] / [[slug|text]] / [[slug#anchor]] — vault root slug
  // (inside the nested ontology/ vault these are relative to that vault's root —
  // see resolveWikilinkTargetSlug above).
  const wre = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
  while ((m = wre.exec(body))) {
    const targetSpec = m[1].trim();
    const [rawTargetSlug] = targetSpec.split('#');
    if (!rawTargetSlug) continue;
    const targetSlug = resolveWikilinkTargetSlug(rawTargetSlug, fromSlug);
    if (!targetSlug || targetSlug === fromSlug) continue;
    slugs.add(targetSlug);
    const linkText = (m[2] ?? rawTargetSlug).trim();
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    const before = body.slice(Math.max(0, matchStart - 120), matchStart);
    const after = body.slice(matchEnd, matchEnd + 120);
    const raw = `${before}**[${linkText}]**${after}`;
    const context = raw.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    contexts.push({ target: targetSlug, context, linkText });
  }
  return { slugs: [...slugs], contexts };
}
