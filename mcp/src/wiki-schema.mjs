import { parseFrontmatter } from './parser.mjs';

/**
 * The wiki page contract, the machine half of `docs/ONTOLOGY-ATLAS-SPEC.md` §11.
 * An ACP agent, a local model and a person all write pages, so the template (the
 * prompt) and the validator (the acceptance test) both come from here. Trust
 * rests on `sources` (which files), `source_hash` (which version, so staleness
 * is loud), `sources_truncated` (which were only partly read) and a citation on
 * every `## Facts` bullet; ungrounded text goes under `## Not in sources`. A
 * page never has `kind:` (`deriveDocNode` requires it), checked first.
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
      'Ontology slugs this page describes. Allowed only on a page a person has reviewed; ' +
      'on a draft it is flagged, because a draft naming graph nodes is an unapproved claim ' +
      'about the graph.',
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
 */
const WIKI_CITATION_ANCHOR_PATTERN = 'p\\d+|s\\d+(?:r\\d+)?|r\\d+|l\\d+|h:[a-z0-9][a-z0-9-]*';
export const WIKI_CITATION_PATTERN =
  `\\[\\[src:(${WIKI_SOURCES_DIR}\\/[^\\]#]+)#(${WIKI_CITATION_ANCHOR_PATTERN})\\]\\]`;

/** A fresh global regex. Global regexes carry `lastIndex`, so never share one. */
function wikiCitationRegex() {
  return new RegExp(WIKI_CITATION_PATTERN, 'g');
}

/** Anything shaped like a citation, so a malformed one is reported instead of ignored. */
function citationCandidateRegex() {
  return /\[\[src:([^\]]*)\]\]/g;
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

/** Level-2 headings in document order, with their line numbers. */
function readSections(body, offset) {
  const out = [];
  const lines = body.split('\n');
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
function sectionBullets(body, offset, sections, title) {
  const at = sections.findIndex((section) => section.title === title);
  if (at < 0) return [];
  const startLine = sections[at].line - offset;
  const endLine = at + 1 < sections.length ? sections[at + 1].line - offset - 1 : Infinity;
  const lines = body.split('\n');
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
 * section), with no filesystem reads.
 *
 * @param {string} raw the file's whole text
 * @param {{ knownSources?: Iterable<string> }} [options] vault-relative paths on
 *   disk. Given, a citation of a missing path is reported; omitted, citations are
 *   checked only against the page's `sources:`, never guessed.
 * @returns {{ ok: boolean, problems: Array<{ code: string, message: string, line?: number }> }}
 */
export function validateWikiPage(raw, options = {}) {
  const text = String(raw ?? '');
  const problems = [];
  const { frontmatter, body } = parseFrontmatter(text);
  // Body start line, so reported lines are lines in the real file.
  const frontmatterLines = text.startsWith('---')
    ? text.slice(0, text.length - body.length).split('\n').length - 1
    : 0;

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

  // `describes` on a draft: a claim about the graph nobody has approved.
  const status = typeof frontmatter.status === 'string' ? frontmatter.status.trim() : '';
  if (Object.prototype.hasOwnProperty.call(frontmatter, 'describes') && status !== 'reviewed') {
    problems.push(
      problem(
        'describes-needs-approval',
        '`describes:` names ontology slugs, so it says this page speaks for those concepts. ' +
          'That is a claim about the graph and it needs a person: set `status: reviewed` after ' +
          'reading the page, or remove `describes:`.',
        undefined,
        { key: 'describes-needs-approval' },
      ),
    );
  }

  const sections = readSections(body, frontmatterLines);
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
  const known = options.knownSources ? new Set(options.knownSources) : null;

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
        if (declaredSources.includes(path)) continue;
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

  // A malformed citation is reported, or `[[src:plan.pdf]]` reads as prose and an
  // ungrounded claim passes the fact check.
  const bodyLines = body.split('\n');
  let inFence = false;
  for (let index = 0; index < bodyLines.length; index += 1) {
    // Fenced text is quoted: a page may show a wrong citation to explain the syntax.
    if (/^\s*(```|~~~)/.test(bodyLines[index])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const candidates = citationCandidateRegex();
    let candidate;
    while ((candidate = candidates.exec(bodyLines[index])) !== null) {
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

  const seenMissing = new Set();
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


/** `[[target]]`, `[[target|text]]`, `[[target#anchor]]` — a citation (`src:`) is not a link. */
function wikiPageLinkRegex() {
  return /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
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
    if (inFence) continue;
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
 *
 * @param {Array<{ path: string, raw: string }>} pages every page, template excluded,
 *   `path` vault-relative (`wiki/<slug>.md`)
 * @returns {Array<{ path: string, problems: Array<{ code: string, message: string, line?: number }> }>}
 *   one entry per input page, in input order, `problems` possibly empty
 */
export function validateWikiFolder(pages) {
  const entries = (pages ?? []).map((page) => {
    const path = String(page.path ?? '');
    const slug = path.replace(/\.md$/, '');
    const text = String(page.raw ?? '');
    const { frontmatter, body } = parseFrontmatter(text);
    const frontmatterLines = text.startsWith('---')
      ? text.slice(0, text.length - body.length).split('\n').length - 1
      : 0;
    return {
      path,
      slug,
      links: extractWikiPageLinks(body, frontmatterLines),
      sources: new Set(readDeclaredSources(frontmatter)),
      primary: readDeclaredSources(frontmatter)[0] ?? null,
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

  for (let a = 0; a < entries.length; a += 1) {
    for (let b = a + 1; b < entries.length; b += 1) {
      const first = entries[a];
      const second = entries[b];
      // Only a page's primary source (its first) counts: a source cited for a
      // disagreement fans out across every page carrying the dispute. Sorted, so the
      // sentence names paths in one order whatever the caller's walk order.
      const shared = [...first.sources]
        .filter(
          (source) =>
            second.sources.has(source) && (first.primary === source || second.primary === source),
        )
        .sort();
      if (shared.length === 0) continue;
      const linked =
        inbound.get(first.slug).has(second.slug) || inbound.get(second.slug).has(first.slug);
      if (linked) continue;
      const sourceList = shared.map((source) => `\`${source}\``).join(', ');
      first.problems.push(
        problem(
          'shared-source-unlinked',
          `\`${second.path}\` also lists ${sourceList} and neither page links the other. Two write-ups of one document that do not know about each other cannot carry a disagreement between them.`,
          undefined,
          { key: 'shared-source-unlinked', values: { other: second.path, sources: sourceList } },
        ),
      );
      second.problems.push(
        problem(
          'shared-source-unlinked',
          `\`${first.path}\` also lists ${sourceList} and neither page links the other. Two write-ups of one document that do not know about each other cannot carry a disagreement between them.`,
          undefined,
          { key: 'shared-source-unlinked', values: { other: first.path, sources: sourceList } },
        ),
      );
    }
  }

  return entries.map((entry) => ({ path: entry.path, problems: entry.problems }));
}
