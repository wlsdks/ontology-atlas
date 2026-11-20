/**
 * The folder's wiki pages judged for `validate_wiki`. A page's facts are computed from one
 * read of its text and kept with its file version, so a later call reads only pages whose
 * file changed; the folder half runs over facts; a page's problem objects are built only
 * when a reply shows that page, from its text read again.
 */

import { cachedDocVersionKey, readVaultDocText, vaultDocsVersion } from '../vault/documents.mjs';
import {
  WIKI_ADVISORY_CODES,
  WIKI_DIR,
  buildWikiNodeIndex,
  isWikiFurnitureSlug,
  validateWikiPage,
  wikiFolderJudgement,
  wikiPageCodes,
  wikiPageFacts,
} from './wiki-schema.mjs';

/** Keyed by a file version (`cachedDocVersionKey`): a changed file is a new key, and the old one is collected with its entry. */
const factsByVersion = new WeakMap();

function loadedPageFacts(doc) {
  const version = cachedDocVersionKey(doc);
  const kept = version ? factsByVersion.get(version) : undefined;
  if (kept) return kept;
  // Not remembered: a folder of pages read once each would evict every other body the cache holds.
  const { raw, body } = readVaultDocText(doc, { remember: false });
  const facts = wikiPageFacts(raw, { frontmatter: doc.frontmatter, body });
  if (version) factsByVersion.set(version, facts);
  return facts;
}

const isAdvisoryCode = (code) => WIKI_ADVISORY_CODES.includes(code);

/**
 * One judged page: its distinct codes decide `ok`, `blocking` and the reply's summary; its
 * `problems`, in `validateWikiPage` order then the folder's, are built the first time asked.
 */
class WikiPageVerdict {
  #doc;
  #folderIndex;
  #context;
  #problems;

  constructor(path, codes, { doc = null, folderIndex, context = null, problems = null } = {}) {
    this.path = path;
    this.codes = codes;
    this.ok = codes.length === 0;
    this.blocking = codes.some((code) => !isAdvisoryCode(code));
    this.#doc = doc;
    this.#folderIndex = folderIndex;
    this.#context = context;
    this.#problems = problems;
  }

  get problems() {
    if (this.#problems) return this.#problems;
    const context = this.#context;
    const doc = this.#doc;
    const { raw, body } = readVaultDocText(doc);
    const nodes = loadedPageFacts(doc).describes.length > 0 ? context.nodes : undefined;
    const own = validateWikiPage(raw, { knownSources: context.knownSources, nodes, parsed: { frontmatter: doc.frontmatter, body } }).problems;
    this.#problems = this.#folderIndex === undefined ? own : [...own, ...context.folder.problemsOf(this.#folderIndex)];
    return this.#problems;
  }
}

function verdictOf(path, problem) {
  return new WikiPageVerdict(path, [problem.code], { problems: [problem] });
}

/** Every list `wikiFolderJudgement`'s `codesOf` returns, by bit: a page's folder codes are one byte. */
const FOLDER_CODES = ['dangling-wikilink', 'orphan-page', 'shared-source-unlinked'];
const FOLDER_CODE_LISTS = Array.from({ length: 1 << FOLDER_CODES.length }, (_, mask) =>
  Object.freeze(FOLDER_CODES.filter((_, bit) => mask & (1 << bit))));
const FOLDER_CODES_UNKNOWN = 0xff;

/**
 * The folder half of the last call, kept while the loaded documents' version holds:
 * equal versions mean every file's stamp is equal (`vaultDocsVersion`), so every page's
 * facts, the judgement over them and the pages' path order are equal too. One folder is
 * kept; a call on another version replaces it. Memory: the facts it shares with the
 * per-version cache, the judgement's index and one byte per page.
 */
let lastFolder = null;

function folderJudgementOf(docs, folderDocs) {
  const version = vaultDocsVersion(docs);
  if (version !== undefined && lastFolder?.version === version) return lastFolder;
  const pages = folderDocs.map((doc) => ({ path: `${doc.slug}.md`, facts: loadedPageFacts(doc) }));
  const judgement = wikiFolderJudgement(pages);
  const masks = new Uint8Array(pages.length).fill(FOLDER_CODES_UNKNOWN);
  // Slugs are unique, so ordering indices by path orders the paths. The walk's order
  // usually is path order already, which one O(P) look confirms.
  const pathOrder = Uint32Array.from(pages, (_, index) => index);
  if (!pages.every((page, index) => index === 0 || pages[index - 1].path < page.path)) {
    pathOrder.sort((left, right) => (pages[left].path < pages[right].path ? -1 : 1));
  }
  const folder = {
    version,
    pages,
    pathOrder,
    codesOf(index) {
      if (masks[index] === FOLDER_CODES_UNKNOWN) {
        masks[index] = judgement.codesOf(index).reduce((mask, code) => mask | (1 << FOLDER_CODES.indexOf(code)), 0);
      }
      return FOLDER_CODE_LISTS[masks[index]];
    },
    problemsOf: (index) => judgement.problemsOf(index),
  };
  if (version !== undefined) lastFolder = folder;
  return folder;
}

/**
 * Judges the folder's pages, or only the named `paths`, in path order for the folder.
 * The folder half is judged over every page in the folder, whatever `paths` narrowed the
 * report to: whether somebody links to a page is a fact about the other pages, and a page
 * asked about alone would otherwise always read as an orphan.
 * Cost: O(bytes of pages whose file changed since they were last judged) to read, then
 * O(D) for the node index over D documents, O(P log P) to order P pages, and per page
 * O(its facts) plus `wikiFolderJudgement`'s per-page cost; problems for shown pages only.
 *
 * @param {Array<object>} docs every loaded document, as `loadVaultDocs` returns them
 * @param {Set<string>} knownSources every raw source path in the folder
 * @param {string[]} [paths] the pages asked about; omitted, every page
 * @returns {WikiPageVerdict[]}
 */
export function judgeLoadedWikiPages(docs, knownSources, paths) {
  const wikiPrefix = `${WIKI_DIR}/`;
  const folderDocs = docs.filter((doc) => doc.slug.startsWith(wikiPrefix) && !isWikiFurnitureSlug(doc.slug));
  const folder = folderJudgementOf(docs, folderDocs);
  const folderPages = folder.pages;
  // Every document once, so each `describes:` entry resolves in O(1) as find_backlinks
  // resolves it; built only once a page has such an entry or is shown.
  let nodeIndex = null;
  const context = {
    knownSources,
    folder,
    get nodes() {
      nodeIndex ??= buildWikiNodeIndex(docs.map((doc) => ({
        slug: doc.slug,
        kind: doc.frontmatter?.kind,
        alias: doc.frontmatter?.slug,
      })));
      return nodeIndex;
    },
  };
  const judge = (path, doc, folderIndex) => {
    const facts = folderIndex === undefined ? loadedPageFacts(doc) : folderPages[folderIndex].facts;
    const own = wikiPageCodes(facts, { knownSources, nodes: facts.describes.length > 0 ? context.nodes : undefined });
    // The folder's codes are never a page's own, so the two lists never share a code.
    const folderCodes = folderIndex === undefined ? [] : folder.codesOf(folderIndex);
    const codes = folderCodes.length === 0 ? own : [...own, ...folderCodes];
    return new WikiPageVerdict(path, codes, { doc, folderIndex, context });
  };

  if (paths === undefined) {
    return Array.from(folder.pathOrder, (index) => judge(folderPages[index].path, folderDocs[index], index));
  }
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  const folderIndexByPath = new Map(folderPages.map((page, index) => [page.path, index]));
  return paths.map((value) => {
    const path = String(value);
    if (!path.startsWith(wikiPrefix)) {
      // Named, not skipped: an agent that asked about the wrong file must learn that,
      // rather than reading an empty problem list as a pass.
      return verdictOf(path, {
        code: 'not-a-wiki-page',
        message: `\`${path}\` is not under \`${wikiPrefix}\`, so the wiki page contract does not apply to it.`,
      });
    }
    const doc = bySlug.get(path.replace(/\.md$/, ''));
    if (!doc) return verdictOf(path, { code: 'page-missing', message: `\`${path}\` is not in this folder.` });
    return judge(path, doc, folderIndexByPath.get(path));
  });
}
