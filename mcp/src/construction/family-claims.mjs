/**
 * A sentence that speaks for every member of a family while citing one. When a
 * cited line sits in a function or method whose name other declarations under
 * the same family root also carry (each plugin's `apply`, each transform's
 * `__call__`, each broker's `Presence`), the server lists those declarations as
 * the family. A sentence that cites them and speaks for all of them (the
 * family's plural such as "plugins", "every", "each", "all" or "both" before its
 * noun, or "they", "these" or "those" as its subject) holds only when its cites
 * cover every member, when it is
 * narrowed to the member it cites, or when it says how many it checked as
 * "k of N", with k the members its cites cover and N the members listed. The
 * words only trigger the check; what decides it is cite coverage against the
 * server's member list, so a reworded sentence passes only by being true to
 * what was cited.
 *
 * The family root is the folder that holds the cited file's workspace package
 * (`plugins/` for `plugins/slack/src/index.ts`), else the cited file's folder;
 * a cite at the repository root names no family. The cost is one pass over each
 * body line, one declaration lookup for the cited files and one for the names.
 */

import { posix } from 'node:path';

import { repoText } from '../analyze/repo-text.mjs';
import { declarationsIn, declarationsNamed, productFiles } from '../evidence-search/declaration-index.mjs';

const LINE_CHARS = 2000;
// Cited files and names looked up in one measure; members shown per sentence; sentences listed.
const CITED_FILES = 256;
const NAMES = 128;
const SHOWN = 6;
const LISTED = 16;

/** Words that speak for every member when the family's noun follows them: "every transform", "all the brokers". */
const QUANTIFIERS = new Set(['every', 'each', 'all', 'both']);
/** A sentence whose subject is one of these speaks for what came before it: "These plugins act ...", "They skip ...". */
const PRONOUNS = new Set(['they', 'these', 'those']);
// Words after a quantifier that may stand before the noun: "all of the plugins".
const NOUN_REACH = 3;
const CALLABLE = new Set(['function', 'method']);
// A token that is a cite of lines: `path.ts:L12`, `path.py#L3`; its folder names are not the sentence's words.
const CITE_TOKEN = /\.[A-Za-z]{1,5}[:#]L?\d/;
// Folders that hold code, not a family: their name in a sentence is no plural subject.
const CODE_FOLDERS = new Set(['src', 'lib', 'source', 'pkg', 'internal', 'app', 'core', 'cmd', 'main', 'common', 'shared', 'utils']);
const COUNT = /\b(\d{1,5})\s+of\s+(?:the\s+|its\s+)?(\d{1,5})\b/g;

const kindOf = (doc) => (typeof doc?.frontmatter?.kind === 'string' ? doc.frontmatter.kind.trim() : '');
const lastSegment = (name) => String(name).split('.').pop();

/** Each sentence that cites lines, outside fences and outside `## Uncertainty`, which states no claim. */
function citingSentences(doc, citesOf) {
  const found = [];
  let fenced = false;
  let uncertainty = false;
  for (const line of String(doc.body ?? '').split('\n')) {
    if (line.length > LINE_CHARS) continue;
    if (/^\s*(?:```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    if (line.startsWith('#')) {
      uncertainty = /^#+\s*uncertainty\s*$/i.test(line);
      continue;
    }
    if (uncertainty) continue;
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      const cites = citesOf(sentence);
      if (cites.length > 0) found.push({ slug: doc.slug, text: sentence.trim(), cites });
    }
  }
  return found;
}

/** The sentence's own words: cites of lines and names in code form are left out. */
const ownWords = (text) => text.replace(/`[^`\n]*`/g, ' ').split(/\s+/).filter((token) => !CITE_TOKEN.test(token)).join(' ');

/** The folder whose members a cite's family spans, or null at the repository root. */
function familyRoot(path, packages) {
  let holder = null;
  for (const folder of packages) {
    if (folder !== '.' && path.startsWith(`${folder}/`) && (!holder || folder.length > holder.length)) holder = folder;
  }
  const root = posix.dirname(holder ?? path);
  return root === '.' || root === '' ? null : root;
}

/**
 * The family's nouns as a sentence would write them: its folder's plural and
 * singular (`plugins`, `plugin`; none for a code folder such as `src`), and the
 * member name itself after a quantifier ("every charge").
 */
function nounsOf(root, name) {
  const base = posix.basename(root).toLowerCase();
  const member = name.toLowerCase();
  if (CODE_FOLDERS.has(base)) return { plural: [], all: [member] };
  const plural = base.endsWith('s') ? [base] : [`${base}s`, `${base}es`];
  const singular = base.endsWith('s') ? base.slice(0, -1) : base;
  return { plural, all: [...plural, singular, member] };
}

/**
 * Whether the sentence speaks for the whole family: its plural as a word
 * ("Follow-up plugins act"), a quantifier the family's noun follows ("every
 * transform", "all of the brokers"), or a subject pronoun ("They", "These").
 */
function speaksForAll(tokens, nouns) {
  if (PRONOUNS.has(tokens[0])) return true;
  for (let at = 0; at < tokens.length; at += 1) {
    if (nouns.plural.includes(tokens[at])) return true;
    if (!QUANTIFIERS.has(tokens[at])) continue;
    for (let next = at + 1; next <= at + NOUN_REACH && next < tokens.length; next += 1) {
      if (nouns.all.includes(tokens[next])) return true;
    }
  }
  return false;
}

/** The declaration a cited line sits in: the last one at or before it, when it is a function or method. */
function citedDeclaration(declarations, line) {
  let found = null;
  for (const declaration of declarations) {
    if (declaration.line > line) break;
    found = declaration;
  }
  return found && CALLABLE.has(found.kind) ? found : null;
}

const memberKey = (member) => `${member.path}\0${member.line}`;

/** The members a sentence's cites cover: the member a cited line sits in, and any member inside a cited range. */
function coveredBy(cites, family) {
  const covered = new Set();
  for (const cite of cites) {
    let holder = null;
    for (const member of family.byPath.get(cite.path) ?? []) {
      if (member.line <= cite.startLine && (!holder || member.line > holder.line)) holder = member;
      if (cite.startLine <= member.line && member.line <= cite.endLine) covered.add(memberKey(member));
    }
    if (holder) covered.add(memberKey(holder));
  }
  return covered;
}

/** Whether the sentence says how many it checked: "k of N" with k covered and N listed. */
function countsChecked(words, covered, listed) {
  for (const match of words.matchAll(COUNT)) {
    if (Number(match[1]) === covered && Number(match[2]) === listed) return true;
  }
  return false;
}

/**
 * Sentences that speak for a family the server lists but cite fewer members
 * than they speak for.
 *
 * @param {object[]} docs vault documents
 * @param {{ repoRoot: string, collection: object } | null} repo the repository survey
 * @param {(text: string) => { path: string, startLine: number, endLine: number }[]} citesOf the line cites in a text
 * @returns {{ sentences: object[] } | null} null without a repository
 */
export function measureFamilyClaims(docs, repo, citesOf) {
  if (!repo?.repoRoot || !repo.collection) return null;
  const sentences = docs.filter((doc) => kindOf(doc) && kindOf(doc) !== 'vault-readme').flatMap((doc) => citingSentences(doc, citesOf));
  if (sentences.length === 0) return { sentences: [] };
  const files = repo.collection.files?.filter((file) => file.class === 'product') ?? productFiles(repo.repoRoot);
  const paths = new Set();
  for (const sentence of sentences) for (const cite of sentence.cites) if (paths.size < CITED_FILES) paths.add(cite.path);
  const declared = declarationsIn(repo.repoRoot, paths, { files });
  const packages = (repo.collection.members ?? []).map((member) => member.path).filter((path) => typeof path === 'string');

  // Each cite's family: the cited callable's name, under its family root.
  const names = new Set();
  for (const sentence of sentences) {
    sentence.families = [];
    for (const cite of sentence.cites) {
      const declaration = citedDeclaration(declared.get(cite.path) ?? [], cite.startLine);
      const root = declaration ? familyRoot(cite.path, packages) : null;
      if (!root) continue;
      const name = lastSegment(declaration.name);
      if (!names.has(name) && names.size >= NAMES) continue;
      names.add(name);
      if (!sentence.families.some((family) => family.name === name && family.root === root)) sentence.families.push({ name, root });
    }
  }
  const named = declarationsNamed(repo.repoRoot, names, { files });

  // Each family's members once, indexed by file, so a sentence costs its cites, not the family's size.
  const familyOf = new Map();
  const membersOf = (name, root) => {
    const key = `${name}\0${root}`;
    if (familyOf.has(key)) return familyOf.get(key);
    const seen = new Set();
    const members = (named.get(name) ?? []).filter((row) => CALLABLE.has(row.kind) && row.path.startsWith(`${root}/`)
      && !seen.has(memberKey(row)) && seen.add(memberKey(row)));
    const byPath = new Map();
    for (const member of members) {
      if (byPath.has(member.path)) byPath.get(member.path).push(member);
      else byPath.set(member.path, [member]);
    }
    const family = { members, byPath, nouns: nounsOf(root, name) };
    familyOf.set(key, family);
    return family;
  };

  const found = [];
  for (const sentence of sentences) {
    const words = ownWords(sentence.text);
    let tokens = null;
    for (const { name, root } of sentence.families) {
      const family = membersOf(name, root);
      if (family.members.length < 2) continue;
      tokens ??= words.toLowerCase().split(/[^a-z0-9_-]+/).filter(Boolean);
      if (!speaksForAll(tokens, family.nouns)) continue;
      const covered = coveredBy(sentence.cites, family);
      if (covered.size >= family.members.length || countsChecked(words, covered.size, family.members.length)) continue;
      found.push({ slug: sentence.slug, text: sentence.text, name, root, members: family.members, covered: covered.size });
    }
  }
  return { sentences: found };
}

const memberLabel = (member) => `${repoText(member.owner ? `${member.owner}.${lastSegment(member.name)}` : member.name, 120)} (${repoText(`${member.path}:L${member.line}`)})`;

function describe(row) {
  const shown = row.members.slice(0, SHOWN).map(memberLabel).join(', ');
  const more = row.members.length > SHOWN ? ` and ${row.members.length - SHOWN} more` : '';
  return `${repoText(row.slug, 120)}: "${repoText(row.text, 200)}" cites ${row.covered} of the ${row.members.length} \`${repoText(row.name, 80)}\` the server lists under ${repoText(row.root)}/ (${shown}${more}); accepted: cite read lines of every one, or narrow it to the member it cites (name that member; no every, each, all or both before ${[...new Set(nounsOf(row.root, row.name).all)].map((noun) => `"${repoText(noun, 80)}"`).join(' or ')}${nounsOf(row.root, row.name).plural.length > 0 ? `, no "${repoText(nounsOf(row.root, row.name).plural[0], 80)}" as a word` : ''}, and no they, these or those as its subject), or write "${row.covered} of ${row.members.length}" checked`;
}

/** The coverage-line part for family sentences; none when every sentence holds for what it cites. */
export function familyClaimLines(families) {
  if (!families || families.sentences.length === 0) return [];
  const rows = families.sentences;
  const shown = rows.slice(0, LISTED).map(describe).join('; ');
  const more = rows.length > LISTED ? `; and ${rows.length - LISTED} more` : '';
  return [`Family sentences: ${rows.length} ${rows.length === 1 ? 'sentence speaks' : 'sentences speak'} for every member of a family while citing fewer: ${shown}${more}. Next: patch_concept each node so the sentence says only what its cites show.`];
}

/** The finalize refusal for family sentences, or null when there are none. */
export function familyClaimRefusal(families) {
  const parts = familyClaimLines(families);
  if (parts.length === 0) return null;
  return [
    `finalize_project_meaning blocked: ${families.sentences.length} cited ${families.sentences.length === 1 ? 'sentence generalises' : 'sentences generalise'} over members the cites do not cover. A reader takes "every" at its word.`,
    ...parts.map((part) => `- ${part}`),
    'Make those patches, then call finalize_project_meaning again.',
  ].join('\n');
}
