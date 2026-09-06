import { parseFrontmatter } from './parser.mjs';

/**
 * The Wiki page contract — **our format, written down once.**
 *
 * `docs/ONTOLOGY-ATLAS-SPEC.md` §11 is the public statement of this shape; this file is
 * its machine half, exactly as `schema.mjs` is the machine half of §3. Nothing here
 * invents meaning the spec does not carry, and nothing there describes a field this file
 * does not enforce.
 *
 * **Why the shape has to exist before anything writes one.** A wiki page can be produced
 * by an ACP agent, by a local model through the app's own LLM path, or by a person
 * typing. Three writers producing three shapes is three formats, and a reader then has
 * to guess which one it is holding — which is the same failure as having no format. So
 * the template is the prompt, the validator is the acceptance test, and both come from
 * this module rather than from whatever each writer remembered.
 *
 * **What the shape is protecting.** A compiled page is a claim about a document nobody
 * is re-reading. Three fields carry the whole trust story:
 *
 *   - `sources` says which files it came from;
 *   - `source_hash` says which *version* of those files, so the claim can go stale
 *     out loud instead of silently;
 *   - every bullet under `## Facts` ends in a citation, so a reader can check one
 *     sentence without re-reading the document.
 *
 * And `## Not in sources` is where anything ungrounded goes. Without a named place for
 * it, an ungrounded sentence has only two homes: deleted, or mixed in with the cited
 * ones. The first loses information and the second is worse than losing it.
 *
 * **There is never a `kind:`.** That single absence is what keeps every page in this
 * folder out of the graph — `deriveDocNode` requires `kind:` — so it is checked first
 * and reported as its own problem code.
 */

/** Vault folder holding wiki pages. */
export const WIKI_DIR = 'wiki';

/**
 * Whether a vault-relative slug names the wiki's own furniture rather than a page.
 *
 * One rule: a file under `wiki/` whose name starts with `_` is not a page. `_template.md`
 * is the shape `init` writes; `_log.md` is the append-only record the app keeps of what
 * happened to the wiki. Neither is judged, listed, compiled, or linked, and a person who
 * renames one loses the underscore and the file starts being a page, which is the moment
 * it should.
 */
export function isWikiFurnitureSlug(slug) {
  if (typeof slug !== 'string') return false;
  const name = slug.slice(slug.lastIndexOf('/') + 1);
  return name.startsWith('_');
}
/** Vault folder holding the raw sources a page cites. */
const WIKI_SOURCES_DIR = 'sources';

/**
 * Frontmatter, in the order the template writes it.
 *
 * `required: true` means the key must be present. `sources` and `source_hash` may be
 * empty — an empty list is a page that grounds nothing, which is a legible state — but
 * the key itself must exist, because a reader who has to distinguish "no sources" from
 * "the writer forgot the field" is back to guessing.
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
 * The five level-2 sections, in this order, always all five.
 *
 * Fixed rather than free, and empty sections are kept rather than dropped: a reader
 * scanning ten pages should find "Open questions" in the same place on all ten, and an
 * empty one says "nothing open" — which a missing one does not.
 */
export const WIKI_SECTION_ORDER = Object.freeze([
  'Summary',
  'Facts',
  'Decisions',
  'Open questions',
  'Not in sources',
]);

/**
 * The citation syntax: `[[src:sources/<path>#<anchor>]]`.
 *
 * Wiki-link brackets because a vault is Markdown a person reads in any editor, and
 * `src:` because a vault also holds ordinary `[[wikilinks]]` between documents — the
 * prefix is what keeps a citation from being mistaken for a link to a node.
 *
 * The anchor names the place inside the document, and the five forms cover what the
 * common formats can actually point at:
 *
 * | Form | Means | Example |
 * |---|---|---|
 * | `p<n>` | page | `[[src:sources/plan.pdf#p12]]` |
 * | `s<n>` | sheet | `[[src:sources/budget.xlsx#s2]]` |
 * | `s<n>r<n>` | sheet and row | `[[src:sources/budget.xlsx#s2r14]]` |
 * | `r<n>` | row | `[[src:sources/orders.csv#r89]]` |
 * | `h:<heading-slug>` | heading | `[[src:sources/spec.docx#h:error-handling]]` |
 * | `l<n>` | line | `[[src:sources/log.txt#l204]]` |
 *
 * An anchor is required. "This document says so somewhere" is not a citation a reader
 * can check, and an uncheckable citation is the failure this whole shape exists to
 * prevent.
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
 * The copy-ready page. This exact text is what `init` writes into a new vault, what the
 * Compile brief embeds, and what a local model receives as its shape instruction —
 * **one string, three consumers**, so a writer cannot be told a different shape than the
 * validator enforces.
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

function problem(code, message, line) {
  return line === undefined ? { code, message } : { code, message, line };
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
      // A wrapped bullet: Markdown continues a list item on the indented lines that
      // follow it, and a writer who wraps at 80 columns puts the citation on the last of
      // them. Judging only the first line reported every wrapped fact as uncited
      // (accumulation probe, 2026-09-06: seven false `uncited-fact` on one page).
      out[out.length - 1].text += `\n${line}`;
    }
  }
  return out;
}

/**
 * Judge one wiki page.
 *
 * Pure and linear: one frontmatter parse, one pass for headings, one pass per checked
 * section. Nothing here reads the filesystem, which is what lets a caller validate a
 * thousand pages without a thousand stats — see `wiki-schema.test.mjs`, which measures
 * exactly that.
 *
 * @param {string} raw the file's whole text
 * @param {{ knownSources?: Iterable<string> }} [options] vault-relative paths that exist
 *   on disk. Given, a citation naming a path that is not there is reported; omitted,
 *   citations are only checked against the page's own `sources:` list, because a
 *   validator that guesses about files it cannot see would report a problem a person
 *   cannot act on.
 * @returns {{ ok: boolean, problems: Array<{ code: string, message: string, line?: number }> }}
 */
export function validateWikiPage(raw, options = {}) {
  const text = String(raw ?? '');
  const problems = [];
  const { frontmatter, body } = parseFrontmatter(text);
  // Line the body starts on, so every reported line number is a line in the real file.
  const frontmatterLines = text.startsWith('---')
    ? text.slice(0, text.length - body.length).split('\n').length - 1
    : 0;

  // 1. `kind:` — checked first because it is the one problem that changes what the file
  //    *is*. A wiki page with a kind is an ontology node, and the graph will draw it.
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

  // 2. Required fields.
  for (const key of WIKI_REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(frontmatter, key)) {
      const field = WIKI_FIELDS.find((candidate) => candidate.key === key);
      problems.push(problem(`missing-field:${key}`, `\`${key}:\` is missing. ${field.description}`));
    }
  }

  // 3. `describes` on a draft: a claim about the graph nobody has approved.
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

  // 4. Sections: all five, in this order.
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
      ),
    );
  }

  // 5. Every fact carries a citation, and every citation is well formed.
  const declaredSources = Array.isArray(frontmatter.sources)
    ? frontmatter.sources.filter((value) => typeof value === 'string').map((value) => value.trim())
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

  // A malformed citation is reported rather than ignored: silently skipping it would let
  // `[[src:plan.pdf]]` read as prose and take an ungrounded claim through the fact check.
  const bodyLines = body.split('\n');
  let inFence = false;
  for (let index = 0; index < bodyLines.length; index += 1) {
    // A fenced block is quoted text — a page explaining the citation syntax must be able
    // to show a wrong one without being told it is wrong.
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
      ),
    );
  }

  return { ok: problems.length === 0, problems };
}

/**
 * The folder-level half of the contract — what no single page can know about itself.
 *
 * `validateWikiPage` judges one page against its own frontmatter and body. Three things
 * are only visible with every page on the table, and the accumulation probe
 * (`docs/benchmark/FINDINGS-2026-09-06-wiki-accumulation-probe.md`) found all three at
 * zero in every condition: no page linked another, so every page was an orphan, and
 * pages that cited the same document never mentioned each other. A wiki whose pages
 * never point at each other is a folder of write-ups, not a graph a person can walk.
 *
 * Deterministic on purpose. Whether two pages *disagree* is a judgement and belongs to
 * a Lint pass an agent runs and a person reads; whether a link resolves, whether a page
 * has any inbound link, and whether two pages share a source without linking are facts
 * of the folder, and a fact of the folder is reported by a script, not a model.
 *
 * Codes:
 *
 *   - `dangling-wikilink`      a `[[wiki/…]]` link whose target is not in the folder
 *   - `orphan-page`            no other page links to this one (two or more pages only)
 *   - `shared-source-unlinked` another page was written from a source this page lists
 *                              (or the reverse), and neither links the other
 */

/** `[[target]]`, `[[target|text]]`, `[[target#anchor]]` — a citation (`src:`) is not a link. */
function wikiPageLinkRegex() {
  return /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
}

/** A link target as the folder names a page: `wiki/<slug>` without `.md`. */
function normalizeWikiLinkTarget(target) {
  let slug = String(target ?? '').trim().replace(/\.md$/, '');
  if (!slug || slug.startsWith('src:')) return null;
  if (!slug.includes('/')) slug = `${WIKI_DIR}/${slug}`;
  return slug;
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
 * Judge the folder.
 *
 * @param {Array<{ path: string, raw: string }>} pages every wiki page in the folder, the
 *   template excluded, `path` vault-relative (`wiki/<slug>.md`)
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
      if (seen.has(link.target)) continue;
      seen.add(link.target);
      entry.problems.push(
        problem(
          'dangling-wikilink',
          `\`[[${link.target}]]\` names a page that is not in this folder. Link only to a page that exists, or write the page.`,
          link.line,
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
        ),
      );
    }
  }

  for (let a = 0; a < entries.length; a += 1) {
    for (let b = a + 1; b < entries.length; b += 1) {
      const first = entries[a];
      const second = entries[b];
      // Only a page's primary source counts — the first it lists, the document it was
      // written from. A source a page merely cites for a disagreement fans out across
      // every page that carries the dispute, and asking each such pair to link (probe F,
      // 2026-09-06: six findings on seven pages) reports the wiring the disagreement
      // rule itself created. "Two write-ups of one document" means two pages that were
      // each compiled from it.
      const shared = [...first.sources].filter(
        (source) =>
          second.sources.has(source) && (first.primary === source || second.primary === source),
      );
      if (shared.length === 0) continue;
      const linked =
        inbound.get(first.slug).has(second.slug) || inbound.get(second.slug).has(first.slug);
      if (linked) continue;
      const sourceList = shared.map((source) => `\`${source}\``).join(', ');
      first.problems.push(
        problem(
          'shared-source-unlinked',
          `\`${second.path}\` also lists ${sourceList} and neither page links the other. Two write-ups of one document that do not know about each other cannot carry a disagreement between them.`,
        ),
      );
      second.problems.push(
        problem(
          'shared-source-unlinked',
          `\`${first.path}\` also lists ${sourceList} and neither page links the other. Two write-ups of one document that do not know about each other cannot carry a disagreement between them.`,
        ),
      );
    }
  }

  return entries.map((entry) => ({ path: entry.path, problems: entry.problems }));
}
