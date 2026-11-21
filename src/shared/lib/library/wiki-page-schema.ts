import { parseFrontmatter, WIKI_DIR } from '../vault-document/parse-frontmatter';

/**
 * The Wiki page contract, for the surfaces that render it.
 *
 * The public statement is `docs/ONTOLOGY-ATLAS-SPEC.md` §11, and the canonical machine
 * copy is `mcp/src/library/wiki-schema.mjs`, which the MCP server and the CLI both execute. This
 * is its TypeScript twin: the MCP package ships separately from the web bundle, so one
 * physical module cannot serve both, and
 * `tests/contract/library/wiki-page-schema.contract.test.ts` runs one fixture table through the
 * two of them. Message wording may differ. **Problem codes may not** — the Docs sidebar,
 * the CLI's exit code, and an agent's retry all branch on the code.
 *
 * Nothing here reads the filesystem. Validation is one frontmatter parse plus a small
 * number of linear passes, which is what lets a list validate a page as its row is drawn
 * rather than validating a whole folder up front.
 */

/**
 * Vault folder holding wiki pages. Defined beside the link resolver in `parse-frontmatter.ts` and
 * re-exported so the folder contract and the renderer fold a bare `[[slug]]` into the same name.
 */
export { WIKI_DIR };

/**
 * Whether a vault-relative slug names the wiki's own furniture rather than a page.
 *
 * One rule: a file under `wiki/` whose name starts with `_` is not a page. `_template.md`
 * is the shape `init` writes; `_log.md` is the append-only record the app keeps of what
 * happened to the wiki. Neither is judged, listed, compiled, or linked, and a person who
 * renames one loses the underscore and the file starts being a page, which is the moment
 * it should.
 */
export function isWikiFurnitureSlug(slug: string): boolean {
  if (typeof slug !== 'string') return false;
  const name = slug.slice(slug.lastIndexOf('/') + 1);
  return name.startsWith('_');
}
/** Vault folder holding the raw sources a page cites. */
export const WIKI_SOURCES_DIR = 'sources';

export interface WikiField {
  key: string;
  required: boolean;
  description: string;
}

/** Frontmatter, in the order the template writes it. Mirrors `WIKI_FIELDS`. */
export const WIKI_FIELDS: readonly WikiField[] = [
  {
    key: 'title',
    required: true,
    description: 'The page name a person reads. One line, no trailing punctuation.',
  },
  {
    key: 'created_by',
    required: true,
    description:
      'Who wrote it: `agent:<runtime>` (an ACP agent, e.g. `agent:claude`), `model:<name>` ' +
      '(a local or connected model, e.g. `model:llama3.1`), or `human`.',
  },
  {
    key: 'compiled_at',
    required: true,
    description: 'ISO-8601 timestamp of the run that produced this text.',
  },
  {
    key: 'sources',
    required: true,
    description: `List of vault-relative paths under \`${WIKI_SOURCES_DIR}/\`. May be empty.`,
  },
  {
    key: 'source_hash',
    required: true,
    description:
      'Map of the same paths to the sha256 of the bytes that were read. This is what lets ' +
      'a page report itself stale when the file changes. May be empty.',
  },
  {
    key: 'status',
    required: true,
    description: '`draft` until a person has read it; `reviewed` after.',
  },
  {
    key: 'summary',
    required: true,
    description: 'One sentence. What this page is about, not how it was made.',
  },
  {
    key: 'sources_truncated',
    required: false,
    description:
      'The subset of `sources` this run read only part of, because the file was longer than ' +
      'the per-read cap. Every path here must also be in `sources`. Absent means the page ' +
      'was written from whole files.',
  },
  {
    key: 'describes',
    required: false,
    description:
      'Slugs of the `kind:` nodes this page is about: the concepts without which its Summary ' +
      'would be wrong. Allowed at any `status`. An empty list records that a writer checked ' +
      'and found none. Each entry must name a concept in this folder.',
  },
  {
    key: 'relation_notes',
    required: false,
    description: 'One sentence per slug in `describes:`, saying why this page is about it.',
  },
];

export const WIKI_REQUIRED_FIELDS: readonly string[] = WIKI_FIELDS.filter(
  (field) => field.required,
).map((field) => field.key);

/** The five level-2 sections, in this order, always all five. */
export const WIKI_SECTION_ORDER = [
  'Summary',
  'Facts',
  'Decisions',
  'Open questions',
  'Not in sources',
] as const;

/**
 * `[[src:sources/<path>#<anchor>]]`, where the anchor is `p<n>`, `s<n>`, `s<n>r<n>`,
 * `r<n>`, `l<n>`, or `h:<heading-slug>`. An anchor is required: "this document says so
 * somewhere" is not something a reader can check.
 */
export const WIKI_CITATION_ANCHOR_PATTERN =
  'p\\d+|s\\d+(?:r\\d+)?|r\\d+|l\\d+|h:[a-z0-9][a-z0-9-]*';
// The path stops at `[`, `]`, `#` and a line break, so the scan stays linear (twin of the MCP pattern).
export const WIKI_CITATION_PATTERN = `\\[\\[src:(${WIKI_SOURCES_DIR}\\/[^\\][#\\n]+)#(${WIKI_CITATION_ANCHOR_PATTERN})\\]\\]`;

/** A fresh global regex. Global regexes carry `lastIndex`, so never share one. */
function wikiCitationRegex(): RegExp {
  return new RegExp(WIKI_CITATION_PATTERN, 'g');
}

interface WikiCitationRef {
  path: string;
  anchor: string;
}

/** Every well-formed citation in `text`, in order. */
export function extractWikiCitations(text: string): WikiCitationRef[] {
  const out: WikiCitationRef[] = [];
  const regex = wikiCitationRegex();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text ?? '')) !== null) {
    out.push({ path: match[1]!, anchor: match[2]! });
  }
  return out;
}

/**
 * The copy-ready page — the same string the CLI writes into a new vault and the Compile
 * brief embeds verbatim. A writer must never be shown a different shape than the
 * validator enforces, so there is exactly one of these per implementation and
 * the contract test compares them character for character.
 */
export const WIKI_PAGE_TEMPLATE = `---
title: <the page name>
created_by: agent:claude
compiled_at: 2026-01-01T00:00:00Z
sources:
  - sources/<file>
source_hash:
  sources/<file>: <sha256 of the bytes that were read>
status: draft
summary: <one sentence about what this page is about>
---

## Summary

<Two or three sentences. What a reader needs before the facts.>

## Facts

- <One claim, ending in its citation.> [[src:sources/<file>#p1]]
- <Another claim; several citations are fine.> [[src:sources/<file>#p2]] [[src:sources/<file>#p7]]

## Decisions

- <A decision the sources record, with its citation.> [[src:sources/<file>#p4]]

## Open questions

- <Something the sources raise but do not settle.>

## Not in sources

- <Anything you could not ground in a source. It goes here and nowhere else.>
`;

type WikiProblemCode =
  | 'kind-present'
  | `missing-field:${string}`
  | 'section-order'
  | 'uncited-fact'
  | 'bad-citation'
  | 'bad-truncation-record'
  | 'citation-target-missing'
  | 'describes-target-missing'
  | 'bad-describes'
  | 'dangling-wikilink'
  | 'orphan-page'
  | 'shared-source-unlinked';

/**
 * The parts of a finding's sentence, kept apart from it: `message` is English for machines, and a
 * localized sentence is rebuilt from `key` and `values`. `key` names the sentence, not the code:
 * `section-order` is a different sentence for missing than for out-of-order sections.
 */
interface WikiProblemDetail {
  key: string;
  /** Values the sentence interpolates. Already human-readable; never a raw object. */
  values?: Record<string, string>;
}

export interface WikiProblem {
  code: WikiProblemCode;
  message: string;
  /** 1-based line in the file, when the problem is bound to one. */
  line?: number;
  /** Pieces for a localised retelling. Absent means the English `message` is all there is. */
  detail?: WikiProblemDetail;
}

export interface WikiValidation {
  ok: boolean;
  problems: WikiProblem[];
}

export function problem(
  code: WikiProblemCode,
  message: string,
  line?: number,
  detail?: WikiProblemDetail,
): WikiProblem {
  const out: WikiProblem = { code, message };
  if (line !== undefined) out.line = line;
  if (detail !== undefined) out.detail = detail;
  return out;
}

/** One document in the folder, as `buildWikiNodeIndex` reads it. */
export interface WikiNodeEntry {
  /** Vault-relative, without `.md`. */
  slug: string;
  kind?: unknown;
  /** The document's frontmatter `slug:`. */
  alias?: unknown;
}

const WIKI_NODE_INDEX: unique symbol = Symbol('wikiNodeIndex');
const AMBIGUOUS: unique symbol = Symbol('ambiguous');

type WikiNodeResolution = { slug: string; node: boolean } | 'missing' | 'ambiguous';

/** Built once per folder; see `buildWikiNodeIndex`. */
export interface WikiNodeIndex {
  readonly [WIKI_NODE_INDEX]: true;
  resolve(ref: string): WikiNodeResolution;
}

function nfc(value: unknown): string {
  return typeof value === 'string' ? value.trim().normalize('NFC') : '';
}

function isConceptTarget(slug: string, kind: unknown): boolean {
  const name = typeof kind === 'string' ? kind.trim() : '';
  if (!name || name === 'vault-readme') return false;
  return !slug.startsWith(`${WIKI_DIR}/`) && !slug.startsWith(`${WIKI_SOURCES_DIR}/`);
}

/**
 * The concept index `describes:` entries resolve against, built once per folder so each entry is
 * O(1). Mirrors `buildWikiNodeIndex` in the MCP module: full slug, then a frontmatter `slug:`
 * alias, then a unique tail or path suffix, as `find_backlinks` resolves, over every document,
 * and only a `kind:` node outside `wiki/` that is not the vault README is a target. Compared
 * after NFC, because macOS hands Hangul file names over as NFD.
 */
export function buildWikiNodeIndex(entries: Iterable<WikiNodeEntry> | null | undefined): WikiNodeIndex {
  const slugs = new Map<string, boolean>();
  const aliases = new Map<string, string>();
  const suffixes = new Map<string, string | typeof AMBIGUOUS>();
  for (const entry of entries ?? []) {
    const slug = nfc(entry?.slug);
    if (!slug || slugs.has(slug)) continue;
    slugs.set(slug, isConceptTarget(slug, entry.kind));
    const alias = nfc(entry.alias);
    if (alias && !aliases.has(alias)) aliases.set(alias, slug);
    for (let at = slug.indexOf('/'); at >= 0; at = slug.indexOf('/', at + 1)) {
      const suffix = slug.slice(at + 1);
      if (suffix) suffixes.set(suffix, suffixes.has(suffix) ? AMBIGUOUS : slug);
    }
  }
  const found = (slug: string) => ({ slug, node: slugs.get(slug) === true });
  return Object.freeze({
    [WIKI_NODE_INDEX]: true as const,
    resolve(ref: string): WikiNodeResolution {
      // Most entries are already NFC full slugs; only a miss pays for normalising.
      const typed = typeof ref === 'string' ? ref.trim() : '';
      if (slugs.has(typed)) return found(typed);
      const name = typed.normalize('NFC');
      if (!name) return 'missing';
      if (slugs.has(name)) return found(name);
      const alias = aliases.get(name);
      if (alias !== undefined) return found(alias);
      const tail = suffixes.get(name);
      if (tail === undefined) return 'missing';
      return tail === AMBIGUOUS ? 'ambiguous' : found(tail);
    },
  });
}

export function wikiNodeIndexOf(nodes: WikiNodeIndex | Iterable<WikiNodeEntry>): WikiNodeIndex {
  return (nodes as Partial<WikiNodeIndex>)[WIKI_NODE_INDEX] === true
    ? (nodes as WikiNodeIndex)
    : buildWikiNodeIndex(nodes as Iterable<WikiNodeEntry>);
}

export function readDescribes(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

export function describesProblems(value: unknown, index: WikiNodeIndex): WikiProblem[] {
  const out: WikiProblem[] = [];
  let seen: Set<string> | null = null;
  for (const entry of readDescribes(value)) {
    const resolved = index.resolve(entry);
    if (typeof resolved === 'object' && resolved.node) continue;
    const target = nfc(entry);
    seen ??= new Set<string>();
    if (seen.has(target)) continue;
    seen.add(target);
    const message =
      resolved === 'ambiguous'
        ? `\`${target}\` under \`describes:\` matches more than one document by its last part, so it names no one concept. Write the concept's full slug.`
        : resolved === 'missing'
          ? `\`${target}\` under \`describes:\` names no concept in this folder. Remove it, or name a concept that exists by its slug.`
          : `\`${target}\` under \`describes:\` is a wiki page or the vault README, not a concept. \`describes:\` names \`kind:\` nodes only.`;
    out.push(
      problem('describes-target-missing', message, undefined, {
        key: 'describes-target-missing',
        values: { target },
      }),
    );
  }
  return out;
}

function citationCandidateRegex(): RegExp {
  return /\[\[src:([^\][]*)\]\]/g;
}

function readSections(body: string, offset: number): Array<{ title: string; line: number }> {
  const out: Array<{ title: string; line: number }> = [];
  const lines = body.split('\n');
  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) out.push({ title: match[1]!, line: offset + index + 1 });
  }
  return out;
}

function sectionBullets(
  body: string,
  offset: number,
  sections: ReadonlyArray<{ title: string; line: number }>,
  title: string,
): Array<{ text: string; line: number }> {
  const at = sections.findIndex((section) => section.title === title);
  if (at < 0) return [];
  const startLine = sections[at]!.line - offset;
  const endLine = at + 1 < sections.length ? sections[at + 1]!.line - offset - 1 : Infinity;
  const lines = body.split('\n');
  const out: Array<{ text: string; line: number }> = [];
  let inFence = false;
  for (let index = startLine; index < lines.length && index <= endLine; index += 1) {
    const line = lines[index]!;
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    if (/^\s*[-*]\s+\S/.test(line)) {
      out.push({ text: line, line: offset + index + 1 });
    } else if (out.length > 0 && /^\s+\S/.test(line)) {
      // A wrapped bullet: Markdown continues a list item on indented lines, and a writer who wraps puts
      // the citation on the last of them, so judging only the first line would report it uncited.
      out[out.length - 1]!.text += `\n${line}`;
    }
  }
  return out;
}

/**
 * Judge one wiki page. Pure; nothing here touches the filesystem.
 *
 * `knownSources` are the vault-relative paths that exist on disk. Given, a citation
 * naming a path that is not there is reported; omitted, citations are checked only
 * against the page's own `sources:` list, because a validator guessing about files it
 * cannot see would report a problem a person cannot act on. `nodes` is every document in
 * the folder (`buildWikiNodeIndex`); given, each `describes:` entry must name a `kind:`
 * node, and omitted, `describes:` is not checked. Pass the built index for many pages.
 */
export function validateWikiPage(
  raw: string,
  options: { knownSources?: Iterable<string>; nodes?: WikiNodeIndex | Iterable<WikiNodeEntry> | null } = {},
): WikiValidation {
  const text = raw ?? '';
  const { frontmatter, body } = parseFrontmatter(text);
  const { head, tail } = pageOwnProblems(text, frontmatter, body);
  const problems = [
    ...head,
    ...(options.nodes !== undefined && options.nodes !== null
      ? describesProblems(frontmatter.describes, wikiNodeIndexOf(options.nodes))
      : []),
    ...tail,
    ...citationTargetProblems(distinctCitedPaths(body), readDeclaredSources(frontmatter), knownSourceSet(options.knownSources)),
  ];
  return { ok: problems.length === 0, problems };
}

export function knownSourceSet(knownSources: Iterable<string> | undefined): ReadonlySet<string> | null {
  if (!knownSources) return null;
  return knownSources instanceof Set ? (knownSources as Set<string>) : new Set(knownSources);
}

export function distinctCitedPaths(body: string): string[] {
  return [...new Set(extractWikiCitations(body).map((citation) => citation.path))];
}

export function readDeclaredSources(frontmatter: Record<string, unknown>): string[] {
  if (Array.isArray(frontmatter.sources)) {
    return frontmatter.sources.filter((value): value is string => typeof value === 'string').map((value) => value.trim());
  }
  if (typeof frontmatter.sources === 'string' && frontmatter.sources.trim()) return [frontmatter.sources.trim()];
  return [];
}

/** Lines above `body` in `text`, so a body line index becomes a file line. */
export function frontmatterLineCount(text: string, body: string): number {
  return text.startsWith('---') ? text.slice(0, text.length - body.length).split('\n').length - 1 : 0;
}

/**
 * The problems no folder input changes, split where `describes:` problems go, so a caller that
 * kept them rebuilds `validateWikiPage`'s list in its order.
 */
export function pageOwnProblems(
  text: string,
  frontmatter: Record<string, unknown>,
  body: string,
): { head: WikiProblem[]; tail: WikiProblem[] } {
  const problems: WikiProblem[] = [];
  const frontmatterLines = frontmatterLineCount(text, body);

  if (Object.prototype.hasOwnProperty.call(frontmatter, 'kind')) {
    problems.push(
      problem(
        'kind-present',
        'A wiki page must not carry `kind:`. That key is what puts a document in the graph, ' +
          'and a wiki page is a write-up about sources, not a reviewed concept. Remove it, or ' +
          'move the file out of `wiki/` if it really is a node.',
        undefined,
        { key: 'kind-present' },
      ),
    );
  }

  for (const key of WIKI_REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(frontmatter, key)) {
      const field = WIKI_FIELDS.find((candidate) => candidate.key === key)!;
      problems.push(
        problem(
          `missing-field:${key}`,
          `\`${key}:\` is missing. ${field.description}`,
          undefined,
          { key: 'missing-field', values: { field: key } },
        ),
      );
    }
  }

  // Every graph reader takes `describes:` only as a list, and a rename refuses to rewrite a lone
  // value, so one would read as a link here and block every rename of the concept it names.
  if (Object.prototype.hasOwnProperty.call(frontmatter, 'describes') && !Array.isArray(frontmatter.describes)) {
    problems.push(
      problem(
        'bad-describes',
        '`describes:` is not a list. Write each concept\'s slug as a list item (`describes:` then ' +
          '`  - capabilities/<name>`), or `describes: []` when no concept fits. A single value is ' +
          'not read as a link, and a rename cannot rewrite it.',
        undefined,
        { key: 'bad-describes' },
      ),
    );
  }
  const head = problems.splice(0);

  const sections = readSections(body, frontmatterLines);
  const found = sections.map((section) => section.title);
  const expected = [...WIKI_SECTION_ORDER] as string[];
  const foundExpected = found.filter((title) => expected.includes(title));
  const inOrder =
    foundExpected.length === expected.length &&
    foundExpected.every((title, index) => title === expected[index]);
  if (!inOrder) {
    const missing = expected.filter((title) => !found.includes(title));
    problems.push(
      problem(
        'section-order',
        missing.length > 0
          ? `The page needs all five sections in order (${expected.map((title) => `## ${title}`).join(', ')}). ` +
            `Missing: ${missing.join(', ')}. An empty section is kept, not dropped — it says "nothing here", which a missing one does not.`
          : `The five sections must appear in this order: ${expected.join(' → ')}. Found: ${foundExpected.join(' → ')}.`,
        undefined,
        missing.length > 0
          ? { key: 'section-order-missing', values: { missing: missing.join(', ') } }
          : {
              key: 'section-order-sequence',
              values: { expected: expected.join(' → '), found: foundExpected.join(' → ') },
            },
      ),
    );
  }

  const declaredSources = readDeclaredSources(frontmatter);

  /**
   * `sources_truncated`: a boundary a reader can place, or no boundary at all.
   *
   * The Library reads this key to say `partial` where it would otherwise say `compiled`
   * (`vault-library.ts`), and it reads it only for paths the page cites. A path outside
   * `sources:` therefore reaches no screen, which is why it is reported here rather than
   * left to be discovered as a row that never changed.
   */
  if (Object.prototype.hasOwnProperty.call(frontmatter, 'sources_truncated')) {
    const raw: unknown = frontmatter.sources_truncated;
    const listed = Array.isArray(raw)
      ? (raw as unknown[])
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
      : typeof raw === 'string' && raw.trim()
        ? [raw.trim()]
        : null;
    if (listed === null) {
      problems.push(
        problem(
          'bad-truncation-record',
          '`sources_truncated:` is a list of the paths in `sources:` that were read only in ' +
            'part. This value is not a list of paths, so it records no boundary at all.',
          undefined,
          { key: 'bad-truncation-record-shape' },
        ),
      );
    } else {
      for (const path of listed) {
        if (declaredSources.includes(path)) continue;
        problems.push(
          problem(
            'bad-truncation-record',
            `\`${path}\` is under \`sources_truncated:\` but not under \`sources:\`. The key says ` +
              "which of this page's own sources stop short, so a path the page does not cite " +
              'names a boundary no reader can place.',
            undefined,
            { key: 'bad-truncation-record-path', values: { path } },
          ),
        );
      }
    }
  }

  for (const bullet of sectionBullets(body, frontmatterLines, sections, 'Facts')) {
    if (extractWikiCitations(bullet.text).length === 0) {
      problems.push(
        problem(
          'uncited-fact',
          'Every bullet under `## Facts` ends in at least one citation ' +
            '(`[[src:sources/<file>#p12]]`). A claim a reader cannot check against one place in ' +
            'one document belongs under `## Not in sources`.',
          bullet.line,
          { key: 'uncited-fact' },
        ),
      );
    }
  }

  const bodyLines = body.split('\n');
  let inFence = false;
  for (let index = 0; index < bodyLines.length; index += 1) {
    if (/^\s*(```|~~~)/.test(bodyLines[index]!)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const candidates = citationCandidateRegex();
    let candidate: RegExpExecArray | null;
    while ((candidate = candidates.exec(bodyLines[index]!)) !== null) {
      const whole = candidate[0];
      if (new RegExp(`^${WIKI_CITATION_PATTERN}$`).test(whole)) continue;
      problems.push(
        problem(
          'bad-citation',
          `\`${whole}\` is not a citation this format can resolve. The shape is ` +
            `\`[[src:${WIKI_SOURCES_DIR}/<path>#<anchor>]]\`, where the anchor is p<n>, s<n>, ` +
            's<n>r<n>, r<n>, l<n>, or h:<heading-slug>.',
          frontmatterLines + index + 1,
          { key: 'bad-citation', values: { text: whole } },
        ),
      );
    }
  }

  return { head, tail: problems };
}

/** One problem per distinct cited path that `sources:` omits or, given `known`, the folder lacks. */
export function citationTargetProblems(
  citedPaths: readonly string[],
  declaredSources: readonly string[],
  known: ReadonlySet<string> | null,
): WikiProblem[] {
  const problems: WikiProblem[] = [];
  for (const path of citedPaths) {
    const undeclared = !declaredSources.includes(path);
    const absent = known !== null && !known.has(path);
    if (!undeclared && !absent) continue;
    problems.push(
      problem(
        'citation-target-missing',
        absent
          ? `\`${path}\` is cited but is not in this folder. A citation a reader cannot open is not a citation.`
          : `\`${path}\` is cited but is not listed in this page's \`sources:\`. Add it there with its sha256, or fix the citation.`,
        undefined,
        {
          key: absent ? 'citation-target-missing-folder' : 'citation-target-missing-sources',
          values: { path },
        },
      ),
    );
  }
  return problems;
}

