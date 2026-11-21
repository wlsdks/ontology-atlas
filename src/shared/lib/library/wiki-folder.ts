import { parseFrontmatter } from '../vault-document/parse-frontmatter';
import {
  WIKI_DIR,
  citationTargetProblems,
  describesProblems,
  distinctCitedPaths,
  frontmatterLineCount,
  knownSourceSet,
  pageOwnProblems,
  problem,
  readDeclaredSources,
  readDescribes,
  wikiNodeIndexOf,
  type WikiNodeEntry,
  type WikiNodeIndex,
  type WikiProblem,
} from './wiki-page-schema';

/**
 * The wiki folder half (`dangling-wikilink`, `orphan-page`, `shared-source-unlinked`) and the page
 * facts it and the page half judge from: the TypeScript twin of `mcp/src/library/wiki-folder.mjs`,
 * held to it by `tests/contract/library/wiki-page-schema.contract.test.ts`.
 */

/** `[[target]]`, `[[target|text]]`, `[[target#anchor]]` — a citation (`src:`) is not a link. */
function wikiPageLinkRegex(): RegExp {
  return /\[\[([^\][|#]+)(?:#[^\][|]*)?(?:\|[^\][]*)?\]\]/g;
}

/**
 * A link target as the folder names a page: `wiki/<slug>` without `.md`. A bare `[[slug]]` folds
 * into `wiki/` (spec §11.4); a target with a `/` addresses the vault root and is left alone.
 */
function normalizeWikiLinkTarget(target: string | undefined): string | null {
  let slug = String(target ?? '').trim().replace(/\.md$/, '');
  if (!slug || slug.startsWith('src:')) return null;
  if (!slug.includes('/')) slug = `${WIKI_DIR}/${slug}`;
  return slug;
}

/**
 * Whether a normalised target is a link into this folder, the only kind this module may call
 * broken: the folder half never receives the rest of the vault, so it stays silent on those.
 */
function namesWikiFolder(target: string): boolean {
  return target.startsWith(`${WIKI_DIR}/`);
}

/** Every page link in `body`, with the line it sits on, fenced code skipped. */
function extractWikiPageLinks(body: string, offset: number): Array<{ target: string; line: number }> {
  const out: Array<{ target: string; line: number }> = [];
  const lines = String(body ?? '').split('\n');
  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !line.includes('[[')) continue;
    const regex = wikiPageLinkRegex();
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      const target = normalizeWikiLinkTarget(match[1]);
      if (target) out.push({ target, line: offset + index + 1 });
    }
  }
  return out;
}

/** Unlinked shared-source partners a page names before it counts the rest (twin of the MCP limit). */
const WIKI_SHARED_PARTNER_LIMIT = 10;

/** What the folder half reads of one page. */
export interface WikiFolderFacts {
  /** Distinct declared sources, the first being the primary. */
  readonly sources: readonly string[];
  /** Distinct link targets in order of first appearance. */
  readonly links: readonly string[];
  /** The file line each target first appears on. */
  readonly linkLines: readonly number[];
}

/**
 * What one version of a page gives every later judgement. The MCP fields: `codes` are the distinct
 * codes `validateWikiPage` reports with neither `knownSources` nor `nodes`, and `describes` and the
 * distinct cited paths are checked per call. `head` and `tail` are this twin's own: the problems no
 * folder input changes, so a page's problem list is rebuilt without its text.
 */
export interface WikiPageFacts extends WikiFolderFacts {
  readonly codes: readonly string[];
  readonly describes: readonly string[];
  readonly citations: readonly string[];
  readonly head: readonly WikiProblem[];
  readonly tail: readonly WikiProblem[];
}

const NONE: readonly never[] = Object.freeze([]);
const NO_SOURCES: ReadonlySet<string> = new Set();

function wikiFolderFacts(text: string, body: string, frontmatter: Record<string, unknown>): WikiFolderFacts {
  const links: string[] = [];
  const linkLines: number[] = [];
  // A dangling link is named by its first line, and a link to a page counts once.
  const seen = new Set<string>();
  for (const link of extractWikiPageLinks(body, frontmatterLineCount(text, body))) {
    if (seen.has(link.target)) continue;
    seen.add(link.target);
    links.push(link.target);
    linkLines.push(link.line);
  }
  return { sources: [...new Set(readDeclaredSources(frontmatter))], links, linkLines };
}

/** One frozen list per distinct code sequence: tens of thousands of pages share a handful. */
const sharedCodeLists = new Map<string, readonly string[]>();

function sharedCodeList(codes: string[]): readonly string[] {
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
function detachedList<T>(values: readonly T[]): readonly T[] {
  return values.length === 0 ? NONE : (JSON.parse(JSON.stringify(values)) as T[]);
}

/**
 * A page's facts from one read of its text. Kept per file version, they let the page and the folder
 * be judged again without reading any page. O(page bytes).
 */
export function wikiPageFacts(raw: string): WikiPageFacts {
  const text = String(raw ?? '');
  const { frontmatter, body } = parseFrontmatter(text);
  const { head, tail } = pageOwnProblems(text, frontmatter, body);
  const citations = distinctCitedPaths(body);
  const { sources, links, linkLines } = wikiFolderFacts(text, body, frontmatter);
  const codes: string[] = [];
  for (const { code } of [...head, ...tail, ...citationTargetProblems(citations, sources, null)]) {
    if (!codes.includes(code)) codes.push(code);
  }
  return {
    codes: sharedCodeList(codes),
    describes: detachedList(readDescribes(frontmatter.describes)),
    citations: detachedList(citations),
    sources: detachedList(sources),
    links: detachedList(links),
    linkLines: linkLines.length === 0 ? NONE : linkLines,
    head: detachedList(head),
    tail: detachedList(tail),
  };
}

interface WikiJudgeOptions {
  knownSources?: Iterable<string>;
  nodes?: WikiNodeIndex | Iterable<WikiNodeEntry> | null;
}

/**
 * What `validateWikiPage(raw, options).problems` returns, from the page's facts. O(problems +
 * `describes:` entries + cited paths); pass `knownSources` as a Set when judging many pages.
 */
export function wikiPageProblems(facts: WikiPageFacts, options: WikiJudgeOptions = {}): WikiProblem[] {
  const describes = options.nodes !== undefined && options.nodes !== null && facts.describes.length > 0
    ? describesProblems(facts.describes, wikiNodeIndexOf(options.nodes))
    : NONE;
  const cited = facts.citations.length > 0
    ? citationTargetProblems(facts.citations, facts.sources, knownSourceSet(options.knownSources))
    : NONE;
  return [...facts.head, ...describes, ...facts.tail, ...cited];
}

/** The distinct codes `validateWikiPage(raw, options)` reports, in no promised order. The list may be shared: never edit it. */
export function wikiPageCodes(facts: WikiPageFacts, options: WikiJudgeOptions = {}): readonly string[] {
  let codes = facts.codes;
  const add = (code: string) => {
    if (!codes.includes(code)) codes = [...codes, code];
  };
  if (options.nodes !== undefined && options.nodes !== null && facts.describes.length > 0) {
    const index = wikiNodeIndexOf(options.nodes);
    const namesNoConcept = (entry: string) => {
      const resolved = index.resolve(entry);
      return !(typeof resolved === 'object' && resolved.node);
    };
    if (facts.describes.some(namesNoConcept)) add('describes-target-missing');
  }
  if (options.knownSources && facts.citations.length > 0) {
    const known = knownSourceSet(options.knownSources)!;
    if (facts.citations.some((path) => !known.has(path))) add('citation-target-missing');
  }
  return codes;
}

export interface WikiFolderJudgement {
  codesOf(index: number): string[];
  problemsOf(index: number): WikiProblem[];
}

/**
 * The folder half asked one page at a time. O(P + Σ links + Σ sources) to index; per page O(its
 * links) plus O((ten partners + linked partners) · its sources), merging ascending index lists.
 */
export function wikiFolderJudgement(pages: ReadonlyArray<{ path: string; facts: WikiFolderFacts }>): WikiFolderJudgement {
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
  type Entry = (typeof entries)[number];
  // The last page of a slug wins and inbound links are keyed by slug.
  const bySlug = new Map(entries.map((entry, index) => [entry.slug, index]));
  const inbound = new Map<string, string[]>();
  for (const entry of entries) {
    for (const target of entry.links) {
      if (target === entry.slug || !bySlug.has(target)) continue;
      const from = inbound.get(target);
      if (from) from.push(entry.slug);
      else inbound.set(target, [entry.slug]);
    }
  }

  const listedBy = new Map<string, number[]>();
  const primaryOf = new Map<string, number[]>();
  const primaryListing = new Map<string, number>();
  const pushTo = (map: Map<string, number[]>, key: string, index: number) => {
    const list = map.get(key);
    if (list) list.push(index);
    else map.set(key, [index]);
  };
  const pairKey = (primary: string, listed: string) => `${primary}\u0000${listed}`;
  entries.forEach((entry, index) => {
    for (const source of entry.sources) pushTo(listedBy, source, index);
    if (entry.primary === null) return;
    pushTo(primaryOf, entry.primary, index);
    for (const source of entry.sources) {
      const key = pairKey(entry.primary, source);
      primaryListing.set(key, (primaryListing.get(key) ?? 0) + 1);
    }
  });
  const isPartner = (page: Entry, other: Entry) =>
    page !== other &&
    ((page.primary !== null && other.sources.has(page.primary)) ||
      (other.primary !== null && page.sources.has(other.primary)));

  const dangles = (entry: Entry, target: string) => target !== entry.slug && !bySlug.has(target) && namesWikiFolder(target);
  const isOrphan = (entry: Entry) => entries.length >= 2 && !inbound.has(entry.slug);

  /** The unlinked partners a page names, in input order, and how many more it counts; null for none. */
  const unlinkedPartners = (index: number): { named: number[]; more: number } | null => {
    const entry = entries[index]!;
    if (entry.primary === null) return null;
    const linked = new Set(inbound.get(entry.slug));
    for (const target of entry.links) if (bySlug.has(target)) linked.add(target);
    let linkedPartners = 0;
    for (const slug of linked) if (isPartner(entry, entries[bySlug.get(slug)!]!)) linkedPartners += 1;
    let partners = listedBy.get(entry.primary)!.length - 1;
    const lists = [listedBy.get(entry.primary)!];
    for (const source of entry.sources) {
      if (source === entry.primary) continue;
      const written = primaryOf.get(source) ?? [];
      partners += written.length - (primaryListing.get(pairKey(source, entry.primary)) ?? 0);
      if (written.length > 0) lists.push(written);
    }
    const unlinked = partners - linkedPartners;
    if (unlinked === 0) return null;
    const heads = lists.map(() => 0);
    const named: number[] = [];
    let previous = -1;
    while (named.length < WIKI_SHARED_PARTNER_LIMIT) {
      let pick = -1;
      for (let list = 0; list < lists.length; list += 1) {
        const at = lists[list]![heads[list]!];
        if (at !== undefined && (pick < 0 || at < lists[pick]![heads[pick]!]!)) pick = list;
      }
      if (pick < 0) break;
      const other = lists[pick]![heads[pick]!]!;
      heads[pick]! += 1;
      if (other === previous || other === index) continue;
      previous = other;
      if (!linked.has(entries[other]!.slug)) named.push(other);
    }
    return { named, more: unlinked > named.length ? unlinked - named.length : 0 };
  };

  return {
    codesOf(index) {
      const entry = entries[index]!;
      const codes: string[] = [];
      if (entry.links.some((target) => dangles(entry, target))) codes.push('dangling-wikilink');
      if (isOrphan(entry)) codes.push('orphan-page');
      const shared = unlinkedPartners(index);
      if (shared && (shared.named.length > 0 || shared.more > 0)) codes.push('shared-source-unlinked');
      return codes;
    },
    problemsOf(index) {
      const entry = entries[index]!;
      const out: WikiProblem[] = [];
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
        const partner = entries[other]!;
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
      if (shared && shared.more > 0) {
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

export interface WikiFolderPageInput {
  path: string;
  raw: string;
}

export interface WikiFolderVerdict {
  path: string;
  problems: WikiProblem[];
}

/**
 * The folder half judged from every page's text: `pages` is every wiki page, the template
 * excluded, `path` vault-relative (`wiki/<slug>.md`); one entry per page, in input order.
 */
export function validateWikiFolder(pages: readonly WikiFolderPageInput[]): WikiFolderVerdict[] {
  const facts = (pages ?? []).map((page) => {
    const text = String(page.raw ?? '');
    const { frontmatter, body } = parseFrontmatter(text);
    return { path: String(page.path ?? ''), facts: wikiFolderFacts(text, body, frontmatter) };
  });
  const judgement = wikiFolderJudgement(facts);
  return facts.map((page, index) => ({ path: page.path, problems: judgement.problemsOf(index) }));
}
