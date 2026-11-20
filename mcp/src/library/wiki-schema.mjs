import { parseFrontmatter } from '../parser.mjs';

/**
 * The wiki page contract, the machine half of `docs/ONTOLOGY-ATLAS-SPEC.md` §11.
 * An ACP agent, a local model and a person all write pages, so the template (the
 * prompt) and the validator (the acceptance test) both come from here. Trust
 * rests on `sources` (which files), `source_hash` (which version, so staleness
 * is loud), `sources_truncated` (which were only partly read) and a citation on
 * every `## Facts` bullet; ungrounded text goes under `## Not in sources`. A
 * page never has `kind:` (`deriveDocNode` requires it), checked first.
 * The app twin src/shared/lib/library/wiki-page-schema.ts must return the same problem
 * codes; tests/contract/library/wiki-page-schema.contract.test.ts runs both on one table.
 */

/** Vault folder holding wiki pages. */
export const WIKI_DIR = 'wiki';

/**
 * A file under `wiki/` whose name starts with `_` (`_template.md`, `_log.md`) is
 * furniture, not a page: never judged, listed, compiled or linked.
 */
export function isWikiFurnitureSlug(slug) {
  if (typeof slug !== 'string') return false;
  const name = slug.slice(slug.lastIndexOf('/') + 1);
  return name.startsWith('_');
}
/**
 * Folder findings true of a young, uncross-linked wiki rather than of a page: reported
 * and counted, but they never decide whether a page fits the template. Here because the
 * server and the Library both load this module; `wiki-report.mjs` re-exports it.
 */
export const WIKI_ADVISORY_CODES = Object.freeze(['orphan-page', 'shared-source-unlinked']);

/** Vault folder holding the raw sources a page cites. */
const WIKI_SOURCES_DIR = 'sources';

/**
 * Frontmatter in template order. `required` means the key must exist; `sources`
 * and `source_hash` may be empty, but "no sources" must be distinguishable from a
 * forgotten field.
 */
export const WIKI_FIELDS = Object.freeze([
  Object.freeze({
    key: 'title',
    required: true,
    description: 'The page name a person reads. One line, no trailing punctuation.',
  }),
  Object.freeze({
    key: 'created_by',
    required: true,
    description:
      'Who wrote it: `agent:<runtime>` (an ACP agent, e.g. `agent:claude`), `model:<name>` ' +
      '(a local or connected model, e.g. `model:llama3.1`), or `human`.',
  }),
  Object.freeze({
    key: 'compiled_at',
    required: true,
    description: 'ISO-8601 timestamp of the run that produced this text.',
  }),
  Object.freeze({
    key: 'sources',
    required: true,
    description: `List of vault-relative paths under \`${WIKI_SOURCES_DIR}/\`. May be empty.`,
  }),
  Object.freeze({
    key: 'source_hash',
    required: true,
    description:
      'Map of the same paths to the sha256 of the bytes that were read. This is what lets ' +
      'a page report itself stale when the file changes. May be empty.',
  }),
  Object.freeze({
    key: 'status',
    required: true,
    description: '`draft` until a person has read it; `reviewed` after.',
  }),
  Object.freeze({
    key: 'summary',
    required: true,
    description: 'One sentence. What this page is about, not how it was made.',
  }),
  Object.freeze({
    key: 'sources_truncated',
    required: false,
    description:
      'The subset of `sources` this run read only part of, because the file was longer than ' +
      'the per-read cap. Every path here must also be in `sources`. Absent means the page ' +
      'was written from whole files.',
  }),
  Object.freeze({
    key: 'describes',
    required: false,
    description:
      'Slugs of the `kind:` nodes this page is about: the concepts without which its Summary ' +
      'would be wrong. Allowed at any `status`. An empty list records that a writer checked ' +
      'and found none. Each entry must name a concept in this folder.',
  }),
  Object.freeze({
    key: 'relation_notes',
    required: false,
    description: 'One sentence per slug in `describes:`, saying why this page is about it.',
  }),
]);

export const WIKI_REQUIRED_FIELDS = Object.freeze(
  WIKI_FIELDS.filter((field) => field.required).map((field) => field.key),
);

/**
 * The five level-2 sections, always all five in this order: a reader finds each
 * in the same place, and an empty one says "nothing here", which a missing one
 * does not.
 */
export const WIKI_SECTION_ORDER = Object.freeze([
  'Summary',
  'Facts',
  'Decisions',
  'Open questions',
  'Not in sources',
]);

/**
 * Citation syntax `[[src:sources/<path>#<anchor>]]`: wiki brackets for any
 * editor, `src:` so it is not mistaken for a node link. Anchors: `p<n>`
 * page, `s<n>` sheet, `s<n>r<n>` sheet row, `r<n>` row, `h:<heading-slug>`
 * heading, `l<n>` line. An anchor is required: "somewhere in this document" is uncheckable.
 * The path stops at `[`, `]`, `#` and a line break, so a match attempt from one `[[src:`
 * never scans past the next `[`: the whole-body scan stays linear in the page's length.
 */
const WIKI_CITATION_ANCHOR_PATTERN = 'p\\d+|s\\d+(?:r\\d+)?|r\\d+|l\\d+|h:[a-z0-9][a-z0-9-]*';
export const WIKI_CITATION_PATTERN =
  `\\[\\[src:(${WIKI_SOURCES_DIR}\\/[^\\][#\\n]+)#(${WIKI_CITATION_ANCHOR_PATTERN})\\]\\]`;

/** A fresh global regex. Global regexes carry `lastIndex`, so never share one. */
function wikiCitationRegex() {
  return new RegExp(WIKI_CITATION_PATTERN, 'g');
}

/** A whole candidate that is a well-formed citation. Anchored, so no `lastIndex` to share. */
const WHOLE_CITATION = new RegExp(`^${WIKI_CITATION_PATTERN}$`);

/**
 * Anything shaped like a citation, so a malformed one is reported instead of ignored.
 * Its text stops at the next `[`, so a line of repeated `[[src:` is one scan, not one per opening.
 */
function citationCandidateRegex() {
  return /\[\[src:([^\][]*)\]\]/g;
}

/** Every well-formed citation in `text`, in order. */
function extractWikiCitations(text) {
  const out = [];
  const regex = wikiCitationRegex();
  let match;
  while ((match = regex.exec(String(text ?? ''))) !== null) {
    out.push({ path: match[1], anchor: match[2] });
  }
  return out;
}

/**
 * The copy-ready page: what `init` writes, the Compile brief embeds and a local
 * model receives, so no writer is told a different shape than the validator enforces.
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

/**
 * The `message` is the English sentence machines consume; `detail` carries its
 * pieces so a UI can retell it in the reader's language. `key` names the
 * sentence, not the code, since some codes have two shapes.
 *
 * @param {string} code
 * @param {string} message
 * @param {number} [line]
 * @param {{ key: string, values?: Record<string, string> }} [detail]
 */
function problem(code, message, line, detail) {
  const out = { code, message };
  if (line !== undefined) out.line = line;
  if (detail !== undefined) out.detail = detail;
  return out;
}

/**
 * The concept index `describes:` entries resolve against, built once per folder so each
 * entry is O(1). It resolves as `find_backlinks` does (full slug, then a frontmatter
 * `slug:` alias, then a unique tail or path suffix), over every document so a tail shared
 * with a wiki page is ambiguous there too, and only a `kind:` node outside `wiki/` that is
 * not the vault README is a target. Slugs, aliases and entries are compared after NFC:
 * macOS hands Hangul file names over as NFD while frontmatter is typed as NFC.
 *
 * @typedef {{ slug: string, kind?: unknown, alias?: unknown }} WikiNodeEntry
 *   `slug` is vault-relative without `.md`; `alias` is the document's frontmatter `slug:`.
 * @typedef {{ resolve(ref: string): { slug: string, node: boolean } | 'missing' | 'ambiguous' }} WikiNodeIndex
 */
const WIKI_NODE_INDEX = Symbol('wikiNodeIndex');
const AMBIGUOUS = Symbol('ambiguous');

function nfc(value) {
  return typeof value === 'string' ? value.trim().normalize('NFC') : '';
}

function isConceptTarget(slug, kind) {
  const name = typeof kind === 'string' ? kind.trim() : '';
  if (!name || name === 'vault-readme') return false;
  return !slug.startsWith(`${WIKI_DIR}/`) && !slug.startsWith(`${WIKI_SOURCES_DIR}/`);
}

/**
 * @param {Iterable<WikiNodeEntry>} entries every document in the folder, wiki pages included
 * @returns {WikiNodeIndex}
 */
export function buildWikiNodeIndex(entries) {
  const slugs = new Map();
  const aliases = new Map();
  const suffixes = new Map();
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
  const found = (slug) => ({ slug, node: slugs.get(slug) });
  return Object.freeze({
    [WIKI_NODE_INDEX]: true,
    resolve(ref) {
      // Most entries are already NFC full slugs; only a miss pays for normalising.
      const typed = typeof ref === 'string' ? ref.trim() : '';
      if (slugs.has(typed)) return found(typed);
      const name = typed.normalize('NFC');
      if (!name) return 'missing';
      if (slugs.has(name)) return found(name);
      if (aliases.has(name)) return found(aliases.get(name));
      const tail = suffixes.get(name);
      if (tail === undefined) return 'missing';
      return tail === AMBIGUOUS ? 'ambiguous' : found(tail);
    },
  });
}

function wikiNodeIndexOf(nodes) {
  return nodes && nodes[WIKI_NODE_INDEX] === true ? nodes : buildWikiNodeIndex(nodes);
}

/** `describes:` entries. Only a list counts: no graph reader takes a lone value as a link. */
function readDescribes(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}

/** One `describes-target-missing` per distinct entry that names no concept. */
function describesProblems(value, index) {
  const out = [];
  let seen = null;
  for (const entry of readDescribes(value)) {
    const resolved = index.resolve(entry);
    if (typeof resolved === 'object' && resolved.node) continue;
    const target = nfc(entry);
    seen ??= new Set();
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

/** Lines before the body, so a reported line is a line in the real file. */
function frontmatterLineCount(text, body) {
  return text.startsWith('---') ? text.slice(0, text.length - body.length).split('\n').length - 1 : 0;
}

/** Level-2 headings in document order, with their line numbers. */
function readSections(lines, offset) {
  const out = [];
  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) out.push({ title: match[1], line: offset + index + 1 });
  }
  return out;
}

/** Bullet lines belonging to one section. */
function sectionBullets(lines, offset, sections, title) {
  const at = sections.findIndex((section) => section.title === title);
  if (at < 0) return [];
  const startLine = sections[at].line - offset;
  const endLine = at + 1 < sections.length ? sections[at + 1].line - offset - 1 : Infinity;
  const out = [];
  let inFence = false;
  for (let index = startLine; index < lines.length && index <= endLine; index += 1) {
    const line = lines[index];
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    if (/^\s*[-*]\s+\S/.test(line)) {
      out.push({ text: line, line: offset + index + 1 });
    } else if (out.length > 0 && /^\s+\S/.test(line)) {
      // A wrapped bullet continues on indented lines, and the citation sits on the
      // last of them, so the whole item is judged.
      out[out.length - 1].text += `\n${line}`;
    }
  }
  return out;
}

/**
 * Judges one wiki page. Pure and linear (one frontmatter parse, one pass per
 * section, Set lookups per citation), with no filesystem reads.
 *
 * @param {string} raw the file's whole text
 * @param {{ knownSources?: Iterable<string>, nodes?: WikiNodeIndex | Iterable<WikiNodeEntry>, parsed?: { frontmatter: object, body: string } }} [options]
 *   `parsed` is `parseFrontmatter(raw)` when the caller already holds it (the server's
 *   document cache does); `knownSources` are vault-relative paths on
 *   disk. Given, a citation of a missing path is reported; omitted, citations are
 *   checked only against the page's `sources:`, never guessed. Pass a Set when
 *   judging many pages: any other iterable is copied into one per page. `nodes` is
 *   every document in the folder (`buildWikiNodeIndex`); given, each `describes:`
 *   entry must name a `kind:` node, and omitted, `describes:` is not checked. Pass
 *   the built index when judging many pages, for the same reason.
 * @returns {{ ok: boolean, problems: Array<{ code: string, message: string, line?: number }> }}
 */
export function validateWikiPage(raw, options = {}) {
  const text = String(raw ?? '');
  const problems = [];
  const { frontmatter, body } = options.parsed ?? parseFrontmatter(text);
  const bodyLines = body.split('\n');
  const frontmatterLines = frontmatterLineCount(text, body);

  // `kind:` first: a wiki page with a kind is an ontology node the graph draws.
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
      const field = WIKI_FIELDS.find((candidate) => candidate.key === key);
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
  if (options.nodes !== undefined && options.nodes !== null) {
    problems.push(...describesProblems(frontmatter.describes, wikiNodeIndexOf(options.nodes)));
  }

  const sections = readSections(bodyLines, frontmatterLines);
  const found = sections.map((section) => section.title);
  const expected = [...WIKI_SECTION_ORDER];
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

  const declaredSources = Array.isArray(frontmatter.sources)
    ? frontmatter.sources.filter((value) => typeof value === 'string').map((value) => value.trim())
    : typeof frontmatter.sources === 'string' && frontmatter.sources.trim()
      ? [frontmatter.sources.trim()]
      : [];
  const declared = new Set(declaredSources);
  const known = options.knownSources
    ? options.knownSources instanceof Set
      ? options.knownSources
      : new Set(options.knownSources)
    : null;

  // The Library reads `sources_truncated` only for cited paths, so a path
  // outside `sources:` would reach no screen; it is reported here instead.
  if (Object.prototype.hasOwnProperty.call(frontmatter, 'sources_truncated')) {
    const raw = frontmatter.sources_truncated;
    const listed = Array.isArray(raw)
      ? raw.filter((value) => typeof value === 'string').map((value) => value.trim())
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
        if (declared.has(path)) continue;
        problems.push(
          problem(
            'bad-truncation-record',
            `\`${path}\` is under \`sources_truncated:\` but not under \`sources:\`. The key says ` +
              'which of this page\'s own sources stop short, so a path the page does not cite ' +
              'names a boundary no reader can place.',
            undefined,
            { key: 'bad-truncation-record-path', values: { path } },
          ),
        );
      }
    }
  }

  for (const bullet of sectionBullets(bodyLines, frontmatterLines, sections, 'Facts')) {
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

  // A malformed citation is reported, or `[[src:plan.pdf]]` reads as prose and an
  // ungrounded claim passes the fact check.
  let inFence = false;
  for (let index = 0; index < bodyLines.length; index += 1) {
    // Fenced text is quoted: a page may show a wrong citation to explain the syntax.
    if (/^\s*(```|~~~)/.test(bodyLines[index])) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !bodyLines[index].includes('[[src:')) continue;
    const candidates = citationCandidateRegex();
    let candidate;
    while ((candidate = candidates.exec(bodyLines[index])) !== null) {
      const whole = candidate[0];
      if (WHOLE_CITATION.test(whole)) continue;
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

  const seenMissing = new Set();
  for (const citation of extractWikiCitations(body)) {
    if (seenMissing.has(citation.path)) continue;
    const undeclared = !declared.has(citation.path);
    const absent = known !== null && !known.has(citation.path);
    if (!undeclared && !absent) continue;
    seenMissing.add(citation.path);
    problems.push(
      problem(
        'citation-target-missing',
        absent
          ? `\`${citation.path}\` is cited but is not in this folder. A citation a reader cannot open is not a citation.`
          : `\`${citation.path}\` is cited but is not listed in this page's \`sources:\`. Add it there with its sha256, or fix the citation.`,
        undefined,
        {
          key: absent ? 'citation-target-missing-folder' : 'citation-target-missing-sources',
          values: { path: citation.path },
        },
      ),
    );
  }

  return { ok: problems.length === 0, problems };
}


/**
 * `[[target]]`, `[[target|text]]`, `[[target#anchor]]` — a citation (`src:`) is not a link.
 * No part crosses a `[`, so each attempt ends at the next opening and a line scans once.
 */
function wikiPageLinkRegex() {
  return /\[\[([^\][|#]+)(?:#[^\][|]*)?(?:\|[^\][]*)?\]\]/g;
}

/**
 * A link target as the folder names a page: `wiki/<slug>` without `.md`.
 *
 * A bare `[[slug]]` folds into `wiki/`, which is what spec §11.4 calls a page link. A
 * target that already carries a `/` is left alone: it addresses the vault root, and
 * `namesWikiFolder` below is what decides whether this module may judge it.
 */
function normalizeWikiLinkTarget(target) {
  let slug = String(target ?? '').trim().replace(/\.md$/, '');
  if (!slug || slug.startsWith('src:')) return null;
  if (!slug.includes('/')) slug = `${WIKI_DIR}/${slug}`;
  return slug;
}

/**
 * Whether a normalised target is a link into this folder, the only kind this
 * module may call broken. Targets into the rest of the vault (`capabilities/…`)
 * were never handed to it, so it stays silent on them.
 */
function namesWikiFolder(target) {
  return target.startsWith(`${WIKI_DIR}/`);
}

/** Every page link in `body`, with the line it sits on, fenced code skipped. */
function extractWikiPageLinks(body, offset) {
  const out = [];
  const lines = String(body ?? '').split('\n');
  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !line.includes('[[')) continue;
    const regex = wikiPageLinkRegex();
    let match;
    while ((match = regex.exec(line)) !== null) {
      const target = normalizeWikiLinkTarget(match[1]);
      if (target) out.push({ target, line: offset + index + 1 });
    }
  }
  return out;
}

function readDeclaredSources(frontmatter) {
  if (Array.isArray(frontmatter.sources)) {
    return frontmatter.sources.filter((value) => typeof value === 'string').map((value) => value.trim());
  }
  if (typeof frontmatter.sources === 'string' && frontmatter.sources.trim()) return [frontmatter.sources.trim()];
  return [];
}

/**
 * The folder half: facts only visible with every page present. Whether pages
 * disagree is an agent's lint judgement; these are deterministic
 * facts: `dangling-wikilink` (a `[[wiki/…]]` target not in the folder), `orphan-page` (no
 * inbound link, two or more pages only), `shared-source-unlinked` (pages written
 * from one primary source that do not link each other).
 * Why these three: they are the folder faults (missing cross-references, unlinked
 * pages from one source) a script can decide while every single page validates.
 *
 * @param {Array<{ path: string, raw: string, parsed?: { frontmatter: object, body: string } }>} pages
 *   every page, template excluded, each with a vault-relative `path` (`wiki/<slug>.md`);
 *   `parsed`, when given, is `parseFrontmatter(raw)`
 * @returns {Array<{ path: string, problems: Array<{ code: string, message: string, line?: number }> }>}
 *   one entry per input page, in input order, `problems` possibly empty
 */
/** Unlinked shared-source partners a page names before it counts the rest. */
const WIKI_SHARED_PARTNER_LIMIT = 10;

export function validateWikiFolder(pages) {
  const entries = (pages ?? []).map((page) => {
    const path = String(page.path ?? '');
    const slug = path.replace(/\.md$/, '');
    const text = String(page.raw ?? '');
    const { frontmatter, body } = page.parsed ?? parseFrontmatter(text);
    const declared = readDeclaredSources(frontmatter);
    return {
      path,
      slug,
      links: extractWikiPageLinks(body, frontmatterLineCount(text, body)),
      sources: new Set(declared),
      primary: declared[0] ?? null,
      problems: [],
    };
  });
  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  const inbound = new Map(entries.map((entry) => [entry.slug, new Set()]));

  for (const entry of entries) {
    const seen = new Set();
    for (const link of entry.links) {
      if (link.target === entry.slug) continue;
      const target = bySlug.get(link.target);
      if (target) {
        inbound.get(target.slug).add(entry.slug);
        continue;
      }
      if (!namesWikiFolder(link.target)) continue;
      if (seen.has(link.target)) continue;
      seen.add(link.target);
      entry.problems.push(
        problem(
          'dangling-wikilink',
          `\`[[${link.target}]]\` names a page that is not in this folder. Link only to a page that exists, or write the page.`,
          link.line,
          { key: 'dangling-wikilink', values: { target: link.target } },
        ),
      );
    }
  }

  if (entries.length >= 2) {
    for (const entry of entries) {
      if (inbound.get(entry.slug).size > 0) continue;
      entry.problems.push(
        problem(
          'orphan-page',
          'No other page links here. A page nobody points at is reached only by its file name; link it from the page that talks about its topic.',
          undefined,
          { key: 'orphan-page' },
        ),
      );
    }
  }

  // Two pages are partners when one's primary source (its first) is listed by the other.
  // Each page names at most WIKI_SHARED_PARTNER_LIMIT unlinked partners in input order and
  // counts the rest, so a folder of k pages written from one document costs O(k), not k².
  // Cost: O(P + Σ sources + links), plus per page O((limit + linked partners) · its sources).
  const listedBy = new Map();
  const primaryOf = new Map();
  const primaryListing = new Map();
  const pushTo = (map, key, index) => {
    const list = map.get(key);
    if (list) list.push(index);
    else map.set(key, [index]);
  };
  const pairKey = (primary, listed) => `${primary}\u0000${listed}`;
  entries.forEach((entry, index) => {
    for (const source of entry.sources) pushTo(listedBy, source, index);
    if (entry.primary === null) return;
    pushTo(primaryOf, entry.primary, index);
    for (const source of entry.sources) {
      const key = pairKey(entry.primary, source);
      primaryListing.set(key, (primaryListing.get(key) ?? 0) + 1);
    }
  });
  const isPartner = (page, other) =>
    page !== other &&
    ((page.primary !== null && other.sources.has(page.primary)) ||
      (other.primary !== null && page.sources.has(other.primary)));

  entries.forEach((entry, index) => {
    if (entry.primary === null) return;
    const linked = new Set(inbound.get(entry.slug));
    for (const link of entry.links) if (bySlug.has(link.target)) linked.add(link.target);
    let linkedPartners = 0;
    for (const slug of linked) if (isPartner(entry, bySlug.get(slug))) linkedPartners += 1;
    // Pages listing this one's primary, plus pages whose primary this one lists and that
    // do not also list this one's primary (those are already counted).
    let partners = listedBy.get(entry.primary).length - 1;
    const lists = [listedBy.get(entry.primary)];
    for (const source of entry.sources) {
      if (source === entry.primary) continue;
      const written = primaryOf.get(source) ?? [];
      partners += written.length - (primaryListing.get(pairKey(source, entry.primary)) ?? 0);
      if (written.length > 0) lists.push(written);
    }
    const unlinked = partners - linkedPartners;
    if (unlinked === 0) return;
    // Merge the ascending index lists to meet partners in input order.
    const heads = lists.map(() => 0);
    let previous = -1;
    let named = 0;
    while (named < WIKI_SHARED_PARTNER_LIMIT) {
      let pick = -1;
      for (let list = 0; list < lists.length; list += 1) {
        const at = lists[list][heads[list]];
        if (at !== undefined && (pick < 0 || at < lists[pick][heads[pick]])) pick = list;
      }
      if (pick < 0) break;
      const other = lists[pick][heads[pick]];
      heads[pick] += 1;
      if (other === previous || other === index) continue;
      previous = other;
      const partner = entries[other];
      if (linked.has(partner.slug)) continue;
      // Only a page's primary source counts; sorted so every caller words it alike.
      const shared = [...entry.sources]
        .filter((source) => partner.sources.has(source) && (entry.primary === source || partner.primary === source))
        .sort();
      const sourceList = shared.map((source) => `\`${source}\``).join(', ');
      entry.problems.push(
        problem(
          'shared-source-unlinked',
          `\`${partner.path}\` also lists ${sourceList} and neither page links the other. Two write-ups of one document that do not know about each other cannot carry a disagreement between them.`,
          undefined,
          { key: 'shared-source-unlinked', values: { other: partner.path, sources: sourceList } },
        ),
      );
      named += 1;
    }
    if (unlinked > named) {
      const more = unlinked - named;
      entry.problems.push(
        problem(
          'shared-source-unlinked',
          `${more} more pages share a primary source with this one and neither page links the other. Link the write-ups of one document to each other.`,
          undefined,
          { key: 'shared-source-unlinked-more', values: { count: String(more) } },
        ),
      );
    }
  });

  return entries.map((entry) => ({ path: entry.path, problems: entry.problems }));
}

/**
 * @typedef {object} WikiPageFacts What one version of a page gives every later judgement.
 * @property {readonly string[]} codes distinct codes `validateWikiPage` reports with neither
 *   `knownSources` nor `nodes`: the page's own verdict
 * @property {readonly string[]} describes `describes:` entries, resolved per call against `nodes`
 * @property {readonly string[]} citations distinct cited paths, checked per call against `knownSources`
 * @property {readonly string[]} sources distinct declared sources, the first being the primary
 * @property {readonly string[]} links distinct link targets into `wiki/`, in order of first
 *   appearance: the folder half's pages all live there, so no other target can name one
 * @property {readonly number[]} linkLines the file line each target first appears on
 */

const NONE = Object.freeze([]);
const NO_SOURCES = new Set();

/** One frozen list per distinct code sequence: tens of thousands of pages share a handful. */
const sharedCodeLists = new Map();

function sharedCodeList(codes) {
  if (codes.length === 0) return NONE;
  const key = codes.join('\n');
  let list = sharedCodeLists.get(key);
  if (!list) {
    list = Object.freeze(codes);
    sharedCodeLists.set(key, list);
  }
  return list;
}

/** `values` copied out of the page text in one pass, so kept facts keep none of it alive. */
function detachedList(values) {
  return values.length === 0 ? NONE : JSON.parse(JSON.stringify(values));
}

/**
 * A page's facts, from one read of its text: `validateWikiPage` once, links once. Kept per
 * file version, they let the folder be judged again without reading any page.
 *
 * @param {string} raw the file's whole text
 * @param {{ frontmatter: object, body: string }} [parsed] `parseFrontmatter(raw)`, when held
 * @returns {WikiPageFacts}
 */
export function wikiPageFacts(raw, parsed) {
  const text = String(raw ?? '');
  const page = parsed ?? parseFrontmatter(text);
  const { frontmatter, body } = page;
  const codes = [];
  for (const { code } of validateWikiPage(text, { parsed: page }).problems) {
    if (!codes.includes(code)) codes.push(code);
  }
  const links = [];
  const linkLines = [];
  // The folder half reads only a target's first appearance: a dangling link is named by its
  // first line, and a link to a page counts once.
  const seen = new Set();
  for (const link of extractWikiPageLinks(body, frontmatterLineCount(text, body))) {
    if (!namesWikiFolder(link.target) || seen.has(link.target)) continue;
    seen.add(link.target);
    links.push(link.target);
    linkLines.push(link.line);
  }
  return {
    codes: sharedCodeList(codes),
    describes: detachedList(readDescribes(frontmatter.describes)),
    citations: detachedList([...new Set(extractWikiCitations(body).map((citation) => citation.path))]),
    sources: detachedList([...new Set(readDeclaredSources(frontmatter))]),
    links: detachedList(links),
    linkLines: linkLines.length === 0 ? NONE : linkLines,
  };
}

/**
 * The distinct codes `validateWikiPage(raw, options)` reports, in no promised order, from
 * the page's facts. O(`describes:` entries + citations). The list may be shared: never edit it.
 *
 * @param {WikiPageFacts} facts
 * @param {{ knownSources?: Iterable<string>, nodes?: WikiNodeIndex | Iterable<WikiNodeEntry> }} [options]
 *   as `validateWikiPage` takes them
 * @returns {readonly string[]}
 */
export function wikiPageCodes(facts, options = {}) {
  let codes = facts.codes;
  const add = (code) => {
    if (!codes.includes(code)) codes = [...codes, code];
  };
  if (options.nodes !== undefined && options.nodes !== null && facts.describes.length > 0) {
    const index = wikiNodeIndexOf(options.nodes);
    const namesNoConcept = (entry) => {
      const resolved = index.resolve(entry);
      return !(typeof resolved === 'object' && resolved.node);
    };
    if (facts.describes.some(namesNoConcept)) add('describes-target-missing');
  }
  if (options.knownSources && facts.citations.length > 0) {
    const known = options.knownSources instanceof Set ? options.knownSources : new Set(options.knownSources);
    if (facts.citations.some((path) => !known.has(path))) add('citation-target-missing');
  }
  return codes;
}

/**
 * `validateWikiFolder`'s judgement over page facts, asked one page at a time, so a caller
 * that shows a few pages builds the problem objects of those pages only.
 * Cost: O(P + Σ links + Σ sources) to index the folder; then per page O(its links) for
 * dangling links, O(1) for an orphan, and O((limit + linked partners) · its sources) for
 * shared sources, which `validateWikiFolder` spends on every page.
 *
 * @param {Array<{ path: string, facts: WikiPageFacts }>} pages in the order `validateWikiFolder` takes them
 * @returns {{ codesOf(index: number): string[], problemsOf(index: number): Array<{ code: string, message: string, line?: number }> }}
 */
export function wikiFolderJudgement(pages) {
  const entries = (pages ?? []).map((page) => {
    const path = String(page.path ?? '');
    const { links, linkLines, sources } = page.facts;
    return {
      path,
      slug: path.endsWith('.md') ? path.slice(0, -3) : path,
      links,
      linkLines,
      sources: sources.length > 0 ? new Set(sources) : NO_SOURCES,
      primary: sources[0] ?? null,
    };
  });
  // The last page of a slug wins and inbound links are keyed by slug, as in `validateWikiFolder`.
  const bySlug = new Map(entries.map((entry, index) => [entry.slug, index]));
  const inbound = new Map();
  for (const entry of entries) {
    for (const target of entry.links) {
      if (target === entry.slug || !bySlug.has(target)) continue;
      const from = inbound.get(target);
      if (from) from.push(entry.slug);
      else inbound.set(target, [entry.slug]);
    }
  }

  const listedBy = new Map();
  const primaryOf = new Map();
  const primaryListing = new Map();
  const pushTo = (map, key, index) => {
    const list = map.get(key);
    if (list) list.push(index);
    else map.set(key, [index]);
  };
  const pairKey = (primary, listed) => `${primary}\u0000${listed}`;
  entries.forEach((entry, index) => {
    for (const source of entry.sources) pushTo(listedBy, source, index);
    if (entry.primary === null) return;
    pushTo(primaryOf, entry.primary, index);
    for (const source of entry.sources) {
      const key = pairKey(entry.primary, source);
      primaryListing.set(key, (primaryListing.get(key) ?? 0) + 1);
    }
  });
  const isPartner = (page, other) =>
    page !== other &&
    ((page.primary !== null && other.sources.has(page.primary)) ||
      (other.primary !== null && page.sources.has(other.primary)));

  const dangles = (entry, target) => target !== entry.slug && !bySlug.has(target) && namesWikiFolder(target);
  const isOrphan = (entry) => entries.length >= 2 && !inbound.has(entry.slug);

  /** The unlinked partners a page names, in input order, and how many more it counts; null for none. */
  const unlinkedPartners = (index) => {
    const entry = entries[index];
    if (entry.primary === null) return null;
    const linked = new Set(inbound.get(entry.slug));
    for (const target of entry.links) if (bySlug.has(target)) linked.add(target);
    let linkedPartners = 0;
    for (const slug of linked) if (isPartner(entry, entries[bySlug.get(slug)])) linkedPartners += 1;
    let partners = listedBy.get(entry.primary).length - 1;
    const lists = [listedBy.get(entry.primary)];
    for (const source of entry.sources) {
      if (source === entry.primary) continue;
      const written = primaryOf.get(source) ?? [];
      partners += written.length - (primaryListing.get(pairKey(source, entry.primary)) ?? 0);
      if (written.length > 0) lists.push(written);
    }
    const unlinked = partners - linkedPartners;
    if (unlinked === 0) return null;
    // Merge the ascending index lists to meet partners in input order.
    const heads = lists.map(() => 0);
    const named = [];
    let previous = -1;
    while (named.length < WIKI_SHARED_PARTNER_LIMIT) {
      let pick = -1;
      for (let list = 0; list < lists.length; list += 1) {
        const at = lists[list][heads[list]];
        if (at !== undefined && (pick < 0 || at < lists[pick][heads[pick]])) pick = list;
      }
      if (pick < 0) break;
      const other = lists[pick][heads[pick]];
      heads[pick] += 1;
      if (other === previous || other === index) continue;
      previous = other;
      if (!linked.has(entries[other].slug)) named.push(other);
    }
    return { named, more: unlinked > named.length ? unlinked - named.length : 0 };
  };

  return {
    codesOf(index) {
      const entry = entries[index];
      const codes = [];
      if (entry.links.some((target) => dangles(entry, target))) codes.push('dangling-wikilink');
      if (isOrphan(entry)) codes.push('orphan-page');
      const shared = unlinkedPartners(index);
      if (shared && (shared.named.length > 0 || shared.more > 0)) codes.push('shared-source-unlinked');
      return codes;
    },
    problemsOf(index) {
      const entry = entries[index];
      const out = [];
      entry.links.forEach((target, at) => {
        if (!dangles(entry, target)) return;
        out.push(
          problem(
            'dangling-wikilink',
            `\`[[${target}]]\` names a page that is not in this folder. Link only to a page that exists, or write the page.`,
            entry.linkLines[at],
            { key: 'dangling-wikilink', values: { target } },
          ),
        );
      });
      if (isOrphan(entry)) {
        out.push(
          problem(
            'orphan-page',
            'No other page links here. A page nobody points at is reached only by its file name; link it from the page that talks about its topic.',
            undefined,
            { key: 'orphan-page' },
          ),
        );
      }
      const shared = unlinkedPartners(index);
      for (const other of shared?.named ?? []) {
        const partner = entries[other];
        // Only a page's primary source counts; sorted so every caller words it alike.
        const sourceList = [...entry.sources]
          .filter((source) => partner.sources.has(source) && (entry.primary === source || partner.primary === source))
          .sort()
          .map((source) => `\`${source}\``)
          .join(', ');
        out.push(
          problem(
            'shared-source-unlinked',
            `\`${partner.path}\` also lists ${sourceList} and neither page links the other. Two write-ups of one document that do not know about each other cannot carry a disagreement between them.`,
            undefined,
            { key: 'shared-source-unlinked', values: { other: partner.path, sources: sourceList } },
          ),
        );
      }
      if (shared?.more > 0) {
        out.push(
          problem(
            'shared-source-unlinked',
            `${shared.more} more pages share a primary source with this one and neither page links the other. Link the write-ups of one document to each other.`,
            undefined,
            { key: 'shared-source-unlinked-more', values: { count: String(shared.more) } },
          ),
        );
      }
      return out;
    },
  };
}

/**
 * `validateWikiFolder(pages)` from each page's facts instead of its text, equal byte for byte
 * for pages under `wiki/`, which is what `validateWikiFolder` is handed.
 *
 * @param {Array<{ path: string, facts: WikiPageFacts }>} pages
 * @returns {Array<{ path: string, problems: Array<{ code: string, message: string, line?: number }> }>}
 */
export function validateWikiFolderFromFacts(pages) {
  const judgement = wikiFolderJudgement(pages);
  return (pages ?? []).map((page, index) => ({ path: String(page.path ?? ''), problems: judgement.problemsOf(index) }));
}
