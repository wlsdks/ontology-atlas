import {
  WIKI_CITATION_PATTERN,
  WIKI_DIR,
  WIKI_SECTION_ORDER,
  validateWikiPage,
} from '@/shared/lib/wiki-page-schema';

import { anchorResolves, type SourceMeasurement } from './source-text';

/**
 * A `propose_wiki_page` call becomes a page Atlas will show, or what is wrong with it; nothing
 * here writes. Atlas mints `sources:`, `source_hash:` (an invented hash breaks freshness) and a
 * draft `status:`; Decisions must cite, and anchors must resolve in the bytes read this turn.
 */

/** One source this turn tried to open. */
export interface CompileSourceRead {
  path: string;
  format: string;
  /** True only when text really came back. */
  readable: boolean;
  /** Why the text did not come back, or null when it did. */
  refusal: CompileSourceRefusal | null;
  /** True when the file is longer than the per-read cap. */
  truncated: boolean;
  /** sha256 of the bytes, lowercase hex. Null when this runtime could not measure it. */
  sha256: string | null;
  /** What the text holds, for anchor checking. Null when nothing was read. */
  measure: SourceMeasurement | null;
}

export type CompileSourceRefusal =
  | 'needs-a-parser'
  | 'unknown-format'
  | 'not-in-this-folder'
  | 'path-refused'
  | 'unreadable'
  | 'hash-unavailable';

/** What the writer said. Everything else on the page is Atlas's. */
export interface WikiPageFields {
  slug: string;
  title: string;
  summary: string;
  overview?: readonly string[];
  facts: readonly string[];
  decisions?: readonly string[];
  openQuestions?: readonly string[];
  notInSources?: readonly string[];
}

type WikiProposalProblem =
  | { code: 'no-source-read'; message: string }
  | { code: 'uncited-fact'; message: string }
  | { code: 'uncited-decision'; message: string }
  | { code: 'citation-source-not-read'; message: string }
  | { code: 'citation-anchor-unresolvable'; message: string }
  | { code: 'missing-field'; message: string }
  | { code: 'page-not-namable'; message: string }
  | { code: string; message: string };

export interface WikiPageProposal {
  /** Vault-relative path the page would take, e.g. `wiki/quarter-plan.md`. */
  path: string;
  /** The slug `createDoc` / `saveDoc` take — the path without `.md`. */
  slug: string;
  title: string;
  /** The exact bytes that would be written. Empty when the proposal failed. */
  page: string;
  /** The file this replaces, when a page of that name is already there. */
  existing: { text: string; mtime: number } | null;
  ok: boolean;
  problems: WikiProposalProblem[];
  /** Section name → how many bullets (or sentences) it carries. Card material. */
  sections: Array<{ name: string; entries: number }>;
  citationCount: number;
  /** Sources whose text this page was written from, in citation order. */
  sourcesRead: string[];
  /** Sources this turn could not open, with the reason a person reads. */
  sourcesUnreadable: Array<{ path: string; refusal: CompileSourceRefusal; truncated: boolean }>;
  /** Sources that were read but stop short of the whole file. */
  sourcesTruncated: string[];
}

export interface WikiProposalContext {
  /** Everything `read_source_text` touched this turn, successful or not. */
  reads: readonly CompileSourceRead[];
  /** The runner's model name — becomes `created_by: model:<name>`. */
  model: string;
  /** `compiled_at`. Injected so a test is not at the mercy of the clock. */
  now: Date;
  /** The page already at this path, when there is one. */
  existing?: { text: string; mtime: number } | null;
}

function citationRegex(): RegExp {
  return new RegExp(WIKI_CITATION_PATTERN, 'g');
}

function citationsIn(text: string): Array<{ path: string; anchor: string }> {
  const out: Array<{ path: string; anchor: string }> = [];
  const regex = citationRegex();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) out.push({ path: match[1]!, anchor: match[2]! });
  return out;
}

function bullets(values: readonly string[] | undefined): string[] {
  return (values ?? [])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter((value) => value !== '')
    .map((value) => value.replace(/^[-*]\s+/, ''));
}

/** `Quarter Plan 2027.md` → `quarter-plan-2027`; a folder or extension in the answer is dropped. */
export function wikiSlugFromName(name: string): string {
  const tail = String(name ?? '')
    .trim()
    .replace(/\.md$/i, '');
  const last = tail.slice(tail.lastIndexOf('/') + 1);
  return last
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** One quoted YAML scalar. Wiki frontmatter carries prose, so quoting is not optional. */
function yamlScalar(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function sectionBlock(name: string, entries: readonly string[]): string {
  const body = entries.length === 0 ? '' : `${entries.map((entry) => `- ${entry}`).join('\n')}\n`;
  return `## ${name}\n\n${body}`;
}

/** Summary is prose; every other section is a list of separately checked claims. */
function proseBlock(name: string, lines: readonly string[]): string {
  const body = lines.length === 0 ? '' : `${lines.join('\n\n')}\n`;
  return `## ${name}\n\n${body}`;
}

/** Pure. The page is returned either way, so a failure card shows the text that was judged. */
export function buildWikiPageProposal(
  fields: WikiPageFields,
  context: WikiProposalContext,
): WikiPageProposal {
  const problems: WikiProposalProblem[] = [];
  const readByPath = new Map(context.reads.map((read) => [read.path, read]));

  const slug = wikiSlugFromName(fields.slug || fields.title || '');
  const title = String(fields.title ?? '').replace(/\s+/g, ' ').trim();
  const summary = String(fields.summary ?? '').replace(/\s+/g, ' ').trim();
  const overview = bullets(fields.overview);
  const facts = bullets(fields.facts);
  const decisions = bullets(fields.decisions);
  const openQuestions = bullets(fields.openQuestions);
  const notInSources = bullets(fields.notInSources);

  if (!slug) {
    problems.push({
      code: 'page-not-namable',
      message: 'The page needs a name that can become a file name. Give `slug` a short name such as `quarter-plan`.',
    });
  }
  if (!title) {
    problems.push({ code: 'missing-field', message: '`title` is missing. Give the page name a person reads.' });
  }
  if (!summary) {
    problems.push({
      code: 'missing-field',
      message: '`summary` is missing. One sentence about what this page is about.',
    });
  }

  const cited: string[] = [];
  let citationCount = 0;
  const unresolvable: string[] = [];
  const notRead: string[] = [];

  /**
   * Every citation on the page is checked, not only Facts and Decisions, so a refusal names the
   * writer's actual mistake instead of frontmatter it does not control.
   */
  const noteCitations = (text: string) => {
    const found = citationsIn(text);
    citationCount += found.length;
    for (const citation of found) {
      const read = readByPath.get(citation.path);
      if (!read || !read.readable || !read.measure) {
        if (!notRead.includes(citation.path)) notRead.push(citation.path);
        continue;
      }
      if (!cited.includes(citation.path)) cited.push(citation.path);
      if (!anchorResolves(citation.anchor, read.measure)) {
        const label = `${citation.path}#${citation.anchor}`;
        if (!unresolvable.includes(label)) unresolvable.push(label);
      }
    }
    return found.length;
  };

  const checkBullet = (
    bullet: string,
    section: 'Facts' | 'Decisions',
    code: 'uncited-fact' | 'uncited-decision',
  ) => {
    if (noteCitations(bullet) > 0) return;
    problems.push({
      code,
      message:
        `Every bullet under \`## ${section}\` ends in at least one citation ` +
        `(\`[[src:sources/<file>#p3]]\`). This one does not: "${bullet.slice(0, 80)}". ` +
        'A claim a reader cannot check belongs under `## Not in sources`.',
    });
  };

  for (const fact of facts) checkBullet(fact, 'Facts', 'uncited-fact');
  for (const decision of decisions) checkBullet(decision, 'Decisions', 'uncited-decision');
  for (const line of [...overview, ...openQuestions, ...notInSources, summary]) noteCitations(line);

  for (const path of notRead) {
    const read = readByPath.get(path);
    problems.push({
      code: 'citation-source-not-read',
      message: read
        ? `\`${path}\` could not be opened this turn, so it cannot be cited — a citation ` +
          'points at text you were given. Name the file in plain words instead, with no ' +
          '`[[src:...]]` around it.'
        : `\`${path}\` is cited but was not read this turn. A page may cite only what it ` +
          'was given: open it with `read_source_text` first, or drop the claim.',
    });
  }
  for (const label of unresolvable) {
    const [path, anchor] = label.split('#');
    const read = readByPath.get(path!);
    problems.push({
      code: 'citation-anchor-unresolvable',
      message:
        `\`#${anchor}\` does not exist in \`${path}\`. That file gave ` +
        `${read?.measure?.paragraphs ?? 0} paragraphs and ${read?.measure?.lines ?? 0} lines this turn. ` +
        'A citation a reader cannot open is not a citation.',
    });
  }

  const sourcesRead = cited.filter((path) => readByPath.get(path)?.sha256);
  const missingHash = cited.filter((path) => !readByPath.get(path)?.sha256);
  for (const path of missingHash) {
    problems.push({
      code: 'hash-unavailable',
      message:
        `\`${path}\` was read but this runtime could not measure its sha256, so the page ` +
        'could not record what it read. Without that, every later reader would be told the ' +
        'page may not describe the file.',
    });
  }
  if (sourcesRead.length === 0 && problems.length === 0) {
    problems.push({
      code: 'no-source-read',
      message:
        'This page cites no source that was read this turn. Compile writes up documents; a ' +
        'page with nothing behind it is not one.',
    });
  }

  /* Only cited sources, or `validateWikiPage` reports `truncated-not-in-sources`. */
  const truncatedSources = sourcesRead.filter((path) => readByPath.get(path)!.truncated);

  const compiledAt = context.now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const frontmatter = [
    '---',
    `title: ${yamlScalar(title || slug)}`,
    `created_by: model:${context.model}`,
    `compiled_at: ${compiledAt}`,
    sourcesRead.length === 0 ? 'sources: []' : 'sources:',
    ...sourcesRead.map((path) => `  - ${path}`),
    sourcesRead.length === 0 ? 'source_hash: {}' : 'source_hash:',
    ...sourcesRead.map((path) => `  ${path}: ${readByPath.get(path)!.sha256}`),
    /* Absent when nothing was cut short; an always-present empty key stops being read. */
    ...(truncatedSources.length === 0
      ? []
      : ['sources_truncated:', ...truncatedSources.map((path) => `  - ${path}`)]),
    'status: draft',
    `summary: ${yamlScalar(summary || title || slug)}`,
    '---',
    '',
  ].join('\n');

  /* A cut-short source says so on the page, where the next reader has the claims. */
  const truncatedNotes = truncatedSources.map(
    (path) =>
      `Only the first part of \`${path}\` was read, so anything later in that file is not covered here.`,
  );
  // Skip Atlas's sentence when the writer already named the file.
  const alreadyNamed = (path: string) => notInSources.some((line) => line.includes(path.slice(path.lastIndexOf('/') + 1)));
  const unreadableNotes = context.reads
    .filter((read) => !read.readable && !alreadyNamed(read.path))
    .map((read) =>
      read.refusal === 'needs-a-parser'
        ? `\`${read.path}\` is a ${read.format.toUpperCase()} file, which Atlas cannot open on this route, so nothing from it is on this page.`
        : `\`${read.path}\` could not be read on this route (${read.refusal}), so nothing from it is on this page.`,
    );

  const body = [
    proseBlock(WIKI_SECTION_ORDER[0], overview.length > 0 ? overview : [summary || title]),
    sectionBlock(WIKI_SECTION_ORDER[1], facts),
    sectionBlock(WIKI_SECTION_ORDER[2], decisions),
    sectionBlock(WIKI_SECTION_ORDER[3], openQuestions),
    sectionBlock(WIKI_SECTION_ORDER[4], [...notInSources, ...truncatedNotes, ...unreadableNotes]),
  ].join('\n');

  const page = `${frontmatter}${body}`;

  // Shared contract codes are kept verbatim; other surfaces branch on them.
  const knownSources = context.reads.map((read) => read.path);
  const shape = validateWikiPage(page, { knownSources });
  for (const problem of shape.problems) {
    // `uncited-fact` is already reported above with the bullet quoted.
    if (problem.code === 'uncited-fact') continue;
    problems.push({ code: problem.code, message: problem.message });
  }

  const pagePath = `${WIKI_DIR}/${slug || 'untitled'}`;
  return {
    path: `${pagePath}.md`,
    slug: pagePath,
    title: title || slug,
    page: problems.length === 0 ? page : page,
    existing: context.existing ?? null,
    ok: problems.length === 0,
    problems,
    sections: [
      { name: WIKI_SECTION_ORDER[0], entries: overview.length > 0 ? overview.length : 1 },
      { name: WIKI_SECTION_ORDER[1], entries: facts.length },
      { name: WIKI_SECTION_ORDER[2], entries: decisions.length },
      { name: WIKI_SECTION_ORDER[3], entries: openQuestions.length },
      {
        name: WIKI_SECTION_ORDER[4],
        entries: notInSources.length + truncatedNotes.length + unreadableNotes.length,
      },
    ],
    citationCount,
    sourcesRead,
    sourcesUnreadable: context.reads
      .filter((read) => !read.readable && read.refusal !== null)
      .map((read) => ({ path: read.path, refusal: read.refusal!, truncated: read.truncated })),
    sourcesTruncated: context.reads
      .filter((read) => read.readable && read.truncated)
      .map((read) => read.path),
  };
}
