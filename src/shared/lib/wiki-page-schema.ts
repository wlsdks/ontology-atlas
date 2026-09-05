import { parseFrontmatter } from './parse-frontmatter';

/**
 * The Wiki page contract, for the surfaces that render it.
 *
 * The public statement is `docs/ONTOLOGY-ATLAS-SPEC.md` §11, and the canonical machine
 * copy is `mcp/src/wiki-schema.mjs`, which the MCP server and the CLI both execute. This
 * is its TypeScript twin: the MCP package ships separately from the web bundle, so one
 * physical module cannot serve both, and
 * `tests/contract/wiki-page-schema.contract.test.ts` runs one fixture table through the
 * two of them. Message wording may differ. **Problem codes may not** — the Docs sidebar,
 * the CLI's exit code, and an agent's retry all branch on the code.
 *
 * Nothing here reads the filesystem. Validation is one frontmatter parse plus a small
 * number of linear passes, which is what lets a list validate a page as its row is drawn
 * rather than validating a whole folder up front.
 */

/** Vault folder holding wiki pages. */
export const WIKI_DIR = 'wiki';
/**
 * The copy-ready page `init` leaves in a new vault, at `wiki/_template.md`.
 *
 * Skipped by every validator and by the Wiki list. The leading underscore is the whole
 * rule: the file's own citations point at `sources/<file>`, a placeholder rather than a
 * document, so judging it would report a problem on the one file that is supposed to
 * *be* the answer. Renaming it to a real page name loses the underscore, and the page
 * starts being judged at exactly the moment it should.
 */
const WIKI_TEMPLATE_FILENAME = '_template.md';

/** Whether a vault-relative slug names the shipped template rather than a real page. */
export function isWikiTemplateSlug(slug: string): boolean {
  if (typeof slug !== 'string') return false;
  const name = slug.slice(slug.lastIndexOf('/') + 1);
  return name === WIKI_TEMPLATE_FILENAME || name === WIKI_TEMPLATE_FILENAME.replace(/\.md$/, '');
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
    key: 'describes',
    required: false,
    description:
      'Ontology slugs this page describes. Allowed only on a page a person has reviewed; ' +
      'on a draft it is flagged, because a draft naming graph nodes is an unapproved claim ' +
      'about the graph.',
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
const WIKI_CITATION_ANCHOR_PATTERN =
  'p\\d+|s\\d+(?:r\\d+)?|r\\d+|l\\d+|h:[a-z0-9][a-z0-9-]*';
export const WIKI_CITATION_PATTERN = `\\[\\[src:(${WIKI_SOURCES_DIR}\\/[^\\]#]+)#(${WIKI_CITATION_ANCHOR_PATTERN})\\]\\]`;

/** A fresh global regex. Global regexes carry `lastIndex`, so never share one. */
function wikiCitationRegex(): RegExp {
  return new RegExp(WIKI_CITATION_PATTERN, 'g');
}

interface WikiCitationRef {
  path: string;
  anchor: string;
}

/** Every well-formed citation in `text`, in order. */
function extractWikiCitations(text: string): WikiCitationRef[] {
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
  | 'citation-target-missing'
  | 'describes-needs-approval';

interface WikiProblem {
  code: WikiProblemCode;
  message: string;
  /** 1-based line in the file, when the problem is bound to one. */
  line?: number;
}

export interface WikiValidation {
  ok: boolean;
  problems: WikiProblem[];
}

function problem(code: WikiProblemCode, message: string, line?: number): WikiProblem {
  return line === undefined ? { code, message } : { code, message, line };
}

function citationCandidateRegex(): RegExp {
  return /\[\[src:([^\]]*)\]\]/g;
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
    if (/^\s*[-*]\s+\S/.test(line)) out.push({ text: line, line: offset + index + 1 });
  }
  return out;
}

/**
 * Judge one wiki page. Pure; nothing here touches the filesystem.
 *
 * `knownSources` are the vault-relative paths that exist on disk. Given, a citation
 * naming a path that is not there is reported; omitted, citations are checked only
 * against the page's own `sources:` list, because a validator guessing about files it
 * cannot see would report a problem a person cannot act on.
 */
export function validateWikiPage(
  raw: string,
  options: { knownSources?: Iterable<string> } = {},
): WikiValidation {
  const text = raw ?? '';
  const problems: WikiProblem[] = [];
  const { frontmatter, body } = parseFrontmatter(text);
  const frontmatterLines = text.startsWith('---')
    ? text.slice(0, text.length - body.length).split('\n').length - 1
    : 0;

  if (Object.prototype.hasOwnProperty.call(frontmatter, 'kind')) {
    problems.push(
      problem(
        'kind-present',
        'A wiki page must not carry `kind:`. That key is what puts a document in the graph, ' +
          'and a wiki page is a write-up about sources, not a reviewed concept. Remove it, or ' +
          'move the file out of `wiki/` if it really is a node.',
      ),
    );
  }

  for (const key of WIKI_REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(frontmatter, key)) {
      const field = WIKI_FIELDS.find((candidate) => candidate.key === key)!;
      problems.push(
        problem(`missing-field:${key}`, `\`${key}:\` is missing. ${field.description}`),
      );
    }
  }

  const status = typeof frontmatter.status === 'string' ? frontmatter.status.trim() : '';
  if (Object.prototype.hasOwnProperty.call(frontmatter, 'describes') && status !== 'reviewed') {
    problems.push(
      problem(
        'describes-needs-approval',
        '`describes:` names ontology slugs, so it says this page speaks for those concepts. ' +
          'That is a claim about the graph and it needs a person: set `status: reviewed` after ' +
          'reading the page, or remove `describes:`.',
      ),
    );
  }

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
      ),
    );
  }

  const declaredSources = Array.isArray(frontmatter.sources)
    ? (frontmatter.sources as unknown[])
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
    : typeof frontmatter.sources === 'string' && frontmatter.sources.trim()
      ? [frontmatter.sources.trim()]
      : [];
  const known = options.knownSources ? new Set(options.knownSources) : null;

  for (const bullet of sectionBullets(body, frontmatterLines, sections, 'Facts')) {
    if (extractWikiCitations(bullet.text).length === 0) {
      problems.push(
        problem(
          'uncited-fact',
          'Every bullet under `## Facts` ends in at least one citation ' +
            '(`[[src:sources/<file>#p12]]`). A claim a reader cannot check against one place in ' +
            'one document belongs under `## Not in sources`.',
          bullet.line,
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
        ),
      );
    }
  }

  const seenMissing = new Set<string>();
  for (const citation of extractWikiCitations(body)) {
    if (seenMissing.has(citation.path)) continue;
    const undeclared = !declaredSources.includes(citation.path);
    const absent = known !== null && !known.has(citation.path);
    if (!undeclared && !absent) continue;
    seenMissing.add(citation.path);
    problems.push(
      problem(
        'citation-target-missing',
        absent
          ? `\`${citation.path}\` is cited but is not in this folder. A citation a reader cannot open is not a citation.`
          : `\`${citation.path}\` is cited but is not listed in this page's \`sources:\`. Add it there with its sha256, or fix the citation.`,
      ),
    );
  }

  return { ok: problems.length === 0, problems };
}
