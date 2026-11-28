/**
 * The wiki folder half (`dangling-wikilink`, `orphan-page`, `shared-source-unlinked`) and the
 * page facts it and `validate_wiki` judge from, so a kept page need not be read again.
 */

import { parseFrontmatter } from '../parser.mjs';
import {
  WIKI_DIR,
  extractWikiCitations,
  frontmatterLineCount,
  problem,
  readDescribes,
  validateWikiPage,
  wikiNodeIndexOf,
} from './wiki-schema.mjs';

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

/** Unlinked shared-source partners a page names before it counts the rest. */
const WIKI_SHARED_PARTNER_LIMIT = 10;

/**
 * @typedef {object} WikiFolderFacts What the folder half reads of one page.
 * @property {readonly string[]} sources distinct declared sources, the first being the primary
 * @property {readonly string[]} links distinct link targets in order of first appearance
 * @property {readonly number[]} linkLines the file line each target first appears on
 */

/**
 * @typedef {WikiFolderFacts & {
 *   codes: readonly string[],
 *   describes: readonly string[],
 *   citations: readonly string[],
 * }} WikiPageFacts What one version of a page gives every later judgement: `codes` are the
 *   distinct codes `validateWikiPage` reports with neither `knownSources` nor `nodes`;
 *   `describes` and distinct cited paths are checked per call against `nodes` and `knownSources`.
 */

const NONE = Object.freeze([]);
const NO_SOURCES = new Set();

/**
 * @param {string} text the file's whole text
 * @param {{ frontmatter: object, body: string }} page `parseFrontmatter(text)`
 * @returns {WikiFolderFacts}
 */
function wikiFolderFacts(text, { frontmatter, body }) {
  const links = [];
  const linkLines = [];
  // The folder half reads only a target's first appearance: a dangling link is named by its
  // first line, and a link to a page counts once.
  const seen = new Set();
  for (const link of extractWikiPageLinks(body, frontmatterLineCount(text, body))) {
    if (seen.has(link.target)) continue;
    seen.add(link.target);
    links.push(link.target);
    linkLines.push(link.line);
  }
  return { sources: [...new Set(readDeclaredSources(frontmatter))], links, linkLines };
}

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
  const codes = [];
  for (const { code } of validateWikiPage(text, { parsed: page }).problems) {
    if (!codes.includes(code)) codes.push(code);
  }
  const { sources, links, linkLines } = wikiFolderFacts(text, page);
  return {
    codes: sharedCodeList(codes),
    describes: detachedList(readDescribes(page.frontmatter.describes)),
    citations: detachedList([...new Set(extractWikiCitations(page.body).map((citation) => citation.path))]),
    sources: detachedList(sources),
    links: detachedList(links),
    linkLines: linkLines.length === 0 ? NONE : linkLines,
  };
}

/**
 * The distinct codes `validateWikiPage(raw, options)` reports, in no promised order, from
 * the page's facts. O(`describes:` entries + citations). The list may be shared: never edit it.
 *
 * @param {WikiPageFacts} facts
 * @param {{ knownSources?: Iterable<string>, nodes?: object }} [options] as `validateWikiPage` takes them
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
 * The folder half asked one page at a time, so a caller builds problem objects only for
 * pages it shows. O(P + Σ links + Σ sources) to index; per page O(its links) plus
 * O((ten partners + linked partners) · its sources), merging ascending index lists.
 *
 * @param {Array<{ path: string, facts: WikiFolderFacts }>} pages in the order `validateWikiFolder` takes them
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
  // The last page of a slug wins and inbound links are keyed by slug.
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

