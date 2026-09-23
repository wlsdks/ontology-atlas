/**
 * Meaning gaps a write can see in the body — the half of a node the eligibility
 * gate never opened.
 *
 * ## Why here, and why now
 *
 * The app's ACP session cannot complete the bulk qualification lifecycle, so
 * every real ontology build lands through `add_concept` / `add_concepts` /
 * `patch_concept`. That door judged frontmatter only: capability evidence at
 * creation, path-shaped titles, unresolved references, dense parents, bulk
 * provenance. Nothing looked at the prose, and the prose is where a concept
 * either exists or does not. This is the 2026-08-31 decision's recorded
 * **dissent** («A refusal names the path that stays open, or it is a dead
 * end»): a person routed to incremental writing may build a shallow vault
 * while believing they completed construction. Not its falsifier — that names
 * junk vaults, validation red with wrong kinds, and the vaults measured here
 * validated clean with real paths. Shallow and clean at once is precisely what
 * nothing in the product was saying out loud.
 *
 * ## The contract
 *
 * Pure functions over `{ kind, slug, frontmatter, body, repoRoot }`. No disk
 * writes, no vault scan; the only filesystem question asked is whether one
 * cited path is a directory, and it is skipped whenever the answer would be a
 * guess. Findings come back in the shape `runNodeEligibilityGate` already
 * pushes, so the write response and the maintenance plan need no new channel.
 *
 * Advisory, always. Construction rule 5 is not negotiable here either: refusing
 * a body would make the honest sequence (name it, then say what it is) into an
 * error, and an agent that cannot write turns around and edits the file behind
 * the tool's back.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';

import {
  BODY_BOUNDARY_SECTIONS,
  BODY_DEFINITION_SECTIONS,
  BODY_UNCERTAINTY_SECTIONS,
  DEPENDENCY_FRONTMATTER_KEYS,
  STARTER_EXAMPLE_BODY_MARKERS,
  STARTER_EXAMPLE_SLUGS,
  boundaryMissingMessage,
  definitionMissingMessage,
  dependencyUnwitnessedMessage,
  epistemicExclusionMessage,
  folderOnlyEvidenceMessage,
  isEpistemicExclusionBoundary,
  starterExampleNodeMessage,
  uncertaintyMissingMessage,
} from './construction-rules.mjs';
import {
  NODE_ELIGIBILITY_GATE,
  ONTOLOGY_META_MODEL_REFERENCE,
  defaultBody,
  folderForKind,
} from './schema.mjs';

/**
 * Words of real prose before the first `##` below which a body is a label.
 *
 * Eight, because that is roughly the shortest English sentence that can carry
 * both halves of a definition ("X turns a vault folder into a graph"). Lower and
 * a title restated as a sentence passes; higher and a genuinely terse
 * definition is accused.
 */
const DEFINITION_MIN_WORDS = 8;

/**
 * Words a definition must carry that the title does not already say.
 *
 * A review falsifier, and a fair one: "Mobile/web bottom tab navigation widget
 * for the app" is eight words and clears the length bar while telling a reader
 * nothing the title `Bottom Tab Bar` did not. Construction rule 3a asks for a
 * *non-circular* sentence, and length alone cannot tell circular from terse.
 * Six, because a definition that adds five new words is a paraphrase and one
 * that adds six has begun to say something — measured against both trial vaults
 * and this repository's own.
 */
const DEFINITION_MIN_NOVEL_WORDS = 6;

/**
 * Words that carry no meaning of their own, so restating the title around them
 * is still restating the title. Deliberately tiny: a long stop list starts
 * deciding which real words count, and this only needs to stop grammar from
 * passing as content.
 */
const DEFINITION_STOP_WORDS = Object.freeze(
  new Set(['a', 'an', 'the', 'of', 'and', 'or', 'for', 'to', 'in', 'on', 'is', 'are']),
);

const DEFINITION_KINDS = new Set(['domain', 'capability', 'element']);
const BOUNDARY_KINDS = new Set(['domain', 'capability']);
const UNCERTAINTY_KINDS = new Set(['domain', 'capability', 'element']);
const EPISTEMIC_KINDS = new Set(['domain', 'capability', 'element', 'project']);
const FOLDER_EVIDENCE_KINDS = new Set(['capability', 'element']);

/**
 * Entry-point filenames a folder can offer, in the order an unfamiliar agent
 * would try them. Naming one is the difference between "this is wrong" and "do
 * this instead" — the 2026-08-31 decision's whole subject.
 */
const ENTRY_POINT_BASENAMES = [
  'index', 'main', 'mod', 'app', 'server', 'cli', 'lib', 'init', '__init__',
];

function fold(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Strips a list marker (`-`, `*`, `1.`) or a blockquote caret from one line. */
function stripMarker(line) {
  return String(line ?? '').replace(/^\s*(?:[-*+]|\d+[.)]|>)\s*/, '').trim();
}

/** Lowercased word tokens, punctuation and markup dropped. */
function wordTokens(text) {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * How much of this sentence is not already in the title?
 *
 * Counts distinct tokens, so repeating one new word six times does not pass.
 */
function novelWordCount(text, titleWords) {
  const novel = new Set();
  for (const token of wordTokens(text)) {
    if (DEFINITION_STOP_WORDS.has(token) || titleWords.has(token)) continue;
    novel.add(token);
  }
  return novel.size;
}

function wordCount(text) {
  return String(text ?? '')
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/**
 * The starter line every kind template ends with is schema furniture, not the
 * author's prose. Counting it would let an empty node clear the definition bar
 * on boilerplate alone.
 */
function isSchemaFurniture(line) {
  return String(line ?? '').includes(ONTOLOGY_META_MODEL_REFERENCE);
}

/**
 * Split a body into the prose before the first `##` and the sections after it.
 *
 * The `#` title is neither: it repeats the frontmatter `title`, so treating it
 * as a definition would mean every node defines itself by its own name.
 * Fenced code is skipped so a `##` comment inside a snippet cannot invent a
 * section that is not there.
 */
function parseBodySections(body) {
  const lead = [];
  const sections = [];
  let current = null;
  let fenced = false;
  for (const raw of String(body ?? '').split('\n')) {
    const line = raw.trim();
    if (/^(?:```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) {
      if (current) current.lines.push(line);
      else lead.push(line);
      continue;
    }
    const heading = /^(#{2,6})\s+(.*)$/.exec(line);
    if (heading) {
      current = { heading: heading[2].trim(), lines: [] };
      sections.push(current);
      continue;
    }
    if (/^#\s+/.test(line)) {
      current = null;
      continue;
    }
    if (!line || isSchemaFurniture(line)) continue;
    if (current) current.lines.push(line);
    else lead.push(line);
  }
  return { lead, sections };
}

function normalizeHeading(heading) {
  return fold(String(heading).replace(/[`*_#]/g, '').replace(/[:：.,]+\s*$/, ''));
}

function headingNames(heading, synonyms) {
  const normalized = normalizeHeading(heading);
  return synonyms.some(
    (name) =>
      normalized === name ||
      normalized.startsWith(`${name} `) ||
      normalized.endsWith(` ${name}`) ||
      normalized.includes(` ${name} `),
  );
}

/**
 * Which section states this side of the boundary, if any.
 *
 * The negative side is tested first on purpose: "out of scope" contains
 * "scope", so testing the positive list first would read every `## Out of scope`
 * as an `Includes` and then report the exclusions as missing.
 */
function findBoundarySection(sections, side) {
  for (const section of sections) {
    if (headingNames(section.heading, BODY_BOUNDARY_SECTIONS.excludes)) {
      if (side === 'excludes') return section;
      continue;
    }
    if (side === 'includes' && headingNames(section.heading, BODY_BOUNDARY_SECTIONS.includes)) {
      return section;
    }
  }
  return null;
}

/**
 * Which section carries this node's definition, if any.
 *
 * Measured 2026-09-21: the shape the qualification lane writes has nothing
 * above its first `##` and puts the definition under `## Definition`. Reading
 * only the lead accused 15 of 16 nodes in a fresh vault and 72 of 109 in this
 * repository's own, every one of them defined. The heading is a second place to
 * look, not a second rule — the same word count decides.
 */
function findDefinitionSection(sections) {
  return sections.find((section) => headingNames(section.heading, BODY_DEFINITION_SECTIONS)) ?? null;
}

/** The starter scaffold for this kind, parsed once per call site. */
function starterShape(kind, title) {
  try {
    return parseBodySections(defaultBody(kind, title ?? ''));
  } catch {
    return null;
  }
}

/**
 * Every placeholder line the starter template ships, folded for comparison.
 *
 * Derived from the template rather than listed here, so the scaffold and the
 * check cannot drift: changing a placeholder's wording changes what counts as
 * unfilled in the same commit.
 */
function starterPlaceholders(starter) {
  const placeholders = new Set();
  if (!starter) return placeholders;
  for (const section of starter.sections) {
    for (const line of section.lines) placeholders.add(fold(stripMarker(line)));
  }
  placeholders.delete('');
  return placeholders;
}

/**
 * Is this line still a slot rather than a statement?
 *
 * Two tests, because an author edits a scaffold in two ways. Either the line is
 * untouched — matched against the template itself — or the wording moved while
 * the `<…>` slot stayed, which is the shape that reads as filled to a counter
 * and says nothing to a reader.
 */
function isPlaceholderLine(line, placeholders) {
  const text = stripMarker(line);
  const folded = fold(text);
  if (!folded) return true;
  if (placeholders.has(folded)) return true;
  if (!/<[^>]*>/.test(text)) return false;
  return wordCount(text.replace(/<[^>]*>/g, ' ')) < 3;
}

function contentLines(section, placeholders) {
  if (!section) return [];
  return section.lines.filter((line) => line && !isPlaceholderLine(line, placeholders));
}

/**
 * Does the body say what this node is?
 *
 * Two failures, one code. A body that still carries the template's definition
 * line has not been written; a body with fewer than {@link DEFINITION_MIN_WORDS}
 * words of prose before its first `##` was written as headings. Containment
 * rather than equality on the template half, for the reason the empty-bridge
 * audit already uses it: keeping the boilerplate and appending one line still
 * says nothing.
 */
export function definitionFinding({ kind, slug, title, body }) {
  if (!DEFINITION_KINDS.has(kind)) return null;
  const { lead, sections } = parseBodySections(body);
  const starter = starterShape(kind, title);
  const placeholders = starterPlaceholders(starter);
  const leadText = lead.join(' ');
  const starterLead = starter ? starter.lead.join(' ') : '';
  const leadIsStarter = Boolean(starterLead) && fold(leadText).includes(fold(starterLead));
  const stated = contentLines(findDefinitionSection(sections), placeholders)
    .map((line) => stripMarker(line))
    .join(' ');
  // Either place may hold the definition, and one of them holding it is enough.
  // Each candidate has to clear both bars: long enough to be a sentence, and
  // new enough not to be the title with grammar around it.
  const titleWords = new Set(wordTokens(title));
  for (const candidate of [leadIsStarter ? '' : leadText, stated]) {
    if (wordCount(candidate) < DEFINITION_MIN_WORDS) continue;
    if (novelWordCount(candidate, titleWords) < DEFINITION_MIN_NOVEL_WORDS) continue;
    return null;
  }
  return {
    code: 'definition-missing',
    slug,
    key: 'body',
    refs: [],
    count: 1,
    message: definitionMissingMessage({ slug, kind }),
  };
}

/**
 * Does the body draw both sides of the boundary?
 *
 * One finding per missing side, named in `key`, because the two are different
 * work: an author who listed what a capability covers has not yet answered what
 * it is confused with. Reporting them together would let half the answer read
 * as the whole one.
 */
export function boundaryFindings({ kind, slug, title, body }) {
  if (!BOUNDARY_KINDS.has(kind)) return [];
  const { sections } = parseBodySections(body);
  const placeholders = starterPlaceholders(starterShape(kind, title));
  const findings = [];
  for (const side of ['includes', 'excludes']) {
    const section = findBoundarySection(sections, side);
    if (contentLines(section, placeholders).length > 0) continue;
    findings.push({
      code: 'boundary-missing',
      slug,
      key: side,
      refs: [],
      count: 1,
      message: boundaryMissingMessage({ slug, kind, side }),
    });
  }
  return findings;
}

/**
 * Does the body say what the writer did not check?
 *
 * A node that records no unknown claims completeness, and the claim is always
 * false — the builder read some files and not others. A placeholder bullet does
 * not count, for the same reason it does not count on either boundary side: a
 * slot is not an answer, and letting the scaffold satisfy the check would mean
 * the default write silences the one question the default write cannot have
 * answered.
 */
export function uncertaintyFinding({ kind, slug, title, body }) {
  if (!UNCERTAINTY_KINDS.has(kind)) return null;
  const { sections } = parseBodySections(body);
  const placeholders = starterPlaceholders(starterShape(kind, title));
  const section = sections.find((row) => headingNames(row.heading, BODY_UNCERTAINTY_SECTIONS)) ?? null;
  if (contentLines(section, placeholders).length > 0) return null;
  return {
    code: 'uncertainty-missing',
    slug,
    key: 'uncertainty',
    refs: [],
    count: 1,
    message: uncertaintyMissingMessage({ slug, kind }),
  };
}

/**
 * The author's own uncertainty lines for one node, placeholders removed.
 *
 * {@link uncertaintyFinding} above asks whether this section says anything;
 * a reader that wants to act on what it says needs the same lines, chosen by
 * the same section synonyms and filtered by the same starter scaffold. Exported
 * so `uncertainty-reads.mjs` can turn those lines into next reads without a
 * second copy of the heading rules — two copies would mean the write-time
 * question and the read-time queue disagreeing about which bullet is filled.
 */
export function uncertaintySectionLines({ kind, title, body }) {
  const { sections } = parseBodySections(body);
  const section =
    sections.find((row) => headingNames(row.heading, BODY_UNCERTAINTY_SECTIONS)) ?? null;
  return contentLines(section, starterPlaceholders(starterShape(kind, title ?? '')));
}

/**
 * Exclusions that state what the writer did not see rather than what the
 * product does not do.
 *
 * The judgement is imported, never re-derived: `meaning-evaluation.mjs` already
 * owns this sentence for the qualification lane, and the failure mode of two
 * copies is the two doors disagreeing about one bullet.
 */
export function epistemicExclusionFinding({ kind, slug, title, body }) {
  if (!EPISTEMIC_KINDS.has(kind)) return null;
  const { sections } = parseBodySections(body);
  const section = findBoundarySection(sections, 'excludes');
  if (!section) return null;
  const placeholders = starterPlaceholders(starterShape(kind, title));
  const offending = contentLines(section, placeholders)
    .map((line) => stripMarker(line))
    .filter((text) => text && isEpistemicExclusionBoundary(text));
  if (offending.length === 0) return null;
  return {
    code: 'epistemic-exclusion',
    slug,
    key: 'excludes',
    refs: offending,
    count: offending.length,
    message: epistemicExclusionMessage({
      slug,
      refs: offending,
      count: offending.length,
      sampleLimit: NODE_ELIGIBILITY_GATE.REFERENCE_SAMPLE_LIMIT,
    }),
  };
}

/** The file inside a folder an unfamiliar agent would open first, or null. */
function entryPointInside(directory) {
  let names;
  try {
    names = readdirSync(directory).filter((name) => !name.startsWith('.')).sort();
  } catch {
    return null;
  }
  const files = names.filter((name) => {
    try {
      return statSync(join(directory, name)).isFile();
    } catch {
      return false;
    }
  });
  if (files.length === 0) return null;
  for (const base of ENTRY_POINT_BASENAMES) {
    const match = files.find((name) => name.replace(/\.[^.]+$/, '').toLowerCase() === base);
    if (match) return match;
  }
  return files[0];
}

/**
 * Evidence that names a folder.
 *
 * Silent when `repoRoot` is unknown or the path is not on disk. A missing path
 * is `validate_vault`'s `pathDrift` answer and saying it twice trains the reader
 * to skim; an ungrounded root would compare this vault against whichever
 * directory the process happened to start in, which is the mistake
 * `REPO_ROOT_IS_GROUNDED` exists to prevent.
 */
export function folderOnlyEvidenceFinding({ kind, slug, frontmatter, repoRoot }) {
  if (!FOLDER_EVIDENCE_KINDS.has(kind)) return null;
  const path = typeof frontmatter?.path === 'string' ? frontmatter.path.trim() : '';
  if (!path || !repoRoot || isAbsolute(path)) return null;
  /*
   * **Stay inside the repository.** Rejecting an absolute path is not enough:
   * `path: ../../somewhere` resolves out of the tree just as well, and the two
   * things this function does next are read someone's directory and put one of
   * its filenames into a tool response. A vault is ordinary Markdown an agent
   * writes, so the value in that slot is untrusted input, not a promise.
   *
   * The comparison is lexical and deliberately so — no `realpath`, because the
   * caller's root is the one `assertScanRootAllowed` already settled, and
   * re-resolving it here would disagree with every other boundary in the server
   * on a machine whose temp or home directory is a symlink.
   */
  const boundary = resolve(repoRoot);
  const absolute = resolve(boundary, path);
  if (absolute !== boundary && !absolute.startsWith(boundary + sep)) return null;
  if (!existsSync(absolute)) return null;
  let isDirectory = false;
  try {
    isDirectory = statSync(absolute).isDirectory();
  } catch {
    return null;
  }
  if (!isDirectory) return null;
  const entry = entryPointInside(absolute);
  return {
    code: 'folder-only-evidence',
    slug,
    key: 'path',
    refs: [path],
    count: 1,
    message: folderOnlyEvidenceMessage({
      slug,
      path,
      suggestion: entry ? `${path.replace(/\/$/, '')}/${entry}` : null,
    }),
  };
}

/**
 * Resolve one vault-relative path against the repository and say what it is.
 *
 * The clamp is the one `folderOnlyEvidenceFinding` already uses, reused rather
 * than restated: a vault is ordinary Markdown an agent writes, so `path:` is
 * untrusted input, and `path: ../../somewhere` leaves the tree just as well as
 * an absolute one. Lexical comparison only — no `realpath`, so this agrees with
 * every other boundary in the server on a machine whose temp directory is a
 * symlink.
 *
 * Returns `null` whenever the answer would be a guess, which is what every
 * caller here treats as "do not speak".
 */
function insideRepo(repoRoot, path) {
  const value = typeof path === 'string' ? path.trim() : '';
  if (!value || !repoRoot || isAbsolute(value)) return null;
  const boundary = resolve(repoRoot);
  const absolute = resolve(boundary, value);
  if (absolute !== boundary && !absolute.startsWith(boundary + sep)) return null;
  return { path: value, absolute };
}

/** Every dependency ref a node declares, under either spelling of the key. */
function declaredDependencies(frontmatter) {
  const refs = new Set();
  for (const key of DEPENDENCY_FRONTMATTER_KEYS) {
    const value = frontmatter?.[key];
    if (!Array.isArray(value)) continue;
    for (const ref of value) {
      if (typeof ref !== 'string') continue;
      const trimmed = ref.trim();
      if (trimmed) refs.add(trimmed);
    }
  }
  return refs;
}

/**
 * `src/shared/lib/nav.ts` → `nav`, the name an import statement would carry.
 * A module root answers to its folder instead: `src/export/mod.rs` is what
 * `use crate::export::…` reaches, `src/lib/index.ts` is what `'./lib'` loads,
 * `pkg/__init__.py` is `import pkg`. Measured on a Rust trial vault
 * (2026-09-23): eight edges pointed at `mod.rs` files and the basename alone
 * witnessed none of them.
 */
const MODULE_ROOT_BASENAMES = new Set(['mod', 'index', '__init__']);
function witnessNamesFor(path) {
  const base = basename(path).replace(/\.[^.]+$/, '');
  if (!MODULE_ROOT_BASENAMES.has(base)) return [base];
  const folder = basename(dirname(path));
  return folder && folder !== '.' ? [base, folder] : [base];
}

/**
 * The module specifiers a file brings in, in every language this vault
 * describes: JavaScript/TypeScript `import … from '…'`, `import '…'`,
 * `import('…')` and `require('…')` (multi-line `import {\n…\n} from '…'` is
 * the common shape, so the whole text is read, never a line); Python
 * `import a.b` and `from a.b import c`; Rust `use a::b` and `mod b`; Go's
 * quoted paths inside `import (…)`; C-family `#include`; Ruby `require`.
 */
const SPECIFIER_PATTERNS = [
  /\bfrom\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s+['"]([^'"\n]+)['"]/g,
  /\brequire(?:_relative)?\s*\(?\s*['"]([^'"\n]+)['"]/g,
  /^\s*(?:from\s+([\w.]+)\s+import\b|import\s+([\w.]+))/gm,
  /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:use|mod)\s+([\w:{}\s,]+?)\s*;/gm,
  /^\s*#\s*include\s*[<"]([^>"\n]+)[>"]/gm,
];
const GO_IMPORT_BLOCK = /^\s*import\s*\(([\s\S]*?)\)/gm;

function moduleSpecifiers(text) {
  const specifiers = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of String(text).matchAll(pattern)) {
      specifiers.push(...match.slice(1).filter(Boolean));
    }
  }
  for (const block of String(text).matchAll(GO_IMPORT_BLOCK)) {
    for (const quoted of block[1].matchAll(/"([^"\n]+)"/g)) specifiers.push(quoted[1]);
  }
  return specifiers;
}

/**
 * Does this file bring that file in?
 *
 * Two spellings count, and only two. The target path verbatim is what a
 * relative-free reference looks like; the basename without its extension as
 * the last segment of an import specifier is what every import statement in
 * every language this vault describes actually writes. A bare name anywhere
 * else in the file is not a witness: measured on this repository's own vault
 * (2026-09-23), the words "camera" and "layout" inside unrelated hook names
 * kept two edges green with no import behind them, which is the false
 * confidence the decision's falsifier names. Case-sensitive on purpose:
 * `Vault` and `vault` are different modules.
 */
function textWitnesses(text, targetPath, witnessNames, moduleNamesByText) {
  if (String(text).includes(targetPath)) return true;
  const names = witnessNames.filter(Boolean);
  if (names.length === 0) return false;
  let moduleNames = moduleNamesByText.get(text);
  if (!moduleNames) {
    moduleNames = new Set(moduleSpecifiers(text).flatMap((specifier) =>
      specifier
        .split(/::|[/\\{},\s]+|\.(?![A-Za-z0-9]{1,10}$)/)
        .map((segment) => segment.replace(/\.[^.]+$/, '')),
    ));
    moduleNamesByText.set(text, moduleNames);
  }
  return names.some((name) => moduleNames.has(name));
}

/**
 * A repo-relative file path written inside a sentence.
 *
 * `/` **and** an extension, both required, backticked or not. The rule is the
 * conservative half of the one `uncertainty-reads.mjs` uses on prose — that
 * module also accepts a bare backticked basename, which cannot be resolved
 * against a repository root and so is useless here. It is restated rather than
 * imported because that module does not export it, and a `why` is a sentence a
 * person wrote: every token that is not plainly an address has to fall through.
 */
const NOTE_PATH_EDGES = /^[([{"'`\u201c\u2018]+|[)\]}"'`\u201d\u2019.,;:!?]+$/g;
const NOTE_PATH_EXTENSION = /\.[A-Za-z][A-Za-z0-9]{0,9}$/;

/**
 * The `:42` the message explicitly asks the writer to append, and the `:42:7`
 * an editor copies. Stripped in the same loop as the punctuation, because
 * `` `src/consumer.ts`:1, `` needs both passes twice: quote, line, backtick.
 */
const NOTE_PATH_LINE_SUFFIX = /(?::\d+(?:[-\u2013]\d+)?(?::\d+)?|#L\d+(?:-L?\d+)?)$/;

function pathTokensIn(text) {
  const tokens = new Set();
  for (const raw of String(text ?? '').split(/\s+/)) {
    let token = raw;
    let previous = null;
    while (token !== previous) {
      previous = token;
      token = token.replace(NOTE_PATH_EDGES, '').replace(NOTE_PATH_LINE_SUFFIX, '');
    }
    if (!token || token.startsWith('http://') || token.startsWith('https://')) continue;
    if (!token.includes('/') || !NOTE_PATH_EXTENSION.test(token)) continue;
    tokens.add(token);
  }
  return tokens;
}

/** The rationale stored for one edge, under the canonical key or its tail. */
function relationNoteText(frontmatter, target) {
  const notes = frontmatter?.relation_notes;
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return '';
  if (typeof notes[target] === 'string') return notes[target];
  const tail = String(target).split('/').pop();
  for (const [key, value] of Object.entries(notes)) {
    if (typeof value !== 'string') continue;
    if (key === target || key.split('/').pop() === tail) return value;
  }
  return '';
}

/**
 * A declared dependency the file it stands on never mentions.
 *
 * Measured 2026-09-22 on this repository's own vault: 70 of 85 file-to-file
 * `depends_on` edges are witnessed by the citing file naming the cited one;
 * 15 are declared with a `why` and witnessed nowhere. `impact` already answers
 * `sourceBacked: false` for every declared edge and must keep doing so — this
 * does not change that flag, it names the rows behind it, at the moment the
 * writer still holds the reason.
 *
 * **New edges only.** `previousFrontmatter` is what the door held before this
 * write, so an edge somebody landed last week is not re-accused on every
 * unrelated patch — the restraint that kept `missing-expected-field` from
 * becoming invisible. A whole-vault pass omits it and judges them all, which is
 * the same rule read at a different moment.
 *
 * **Where the witness may live.** Two places, and the second was added on
 * 2026-09-22 after the first repair turn found the message lying. It told the
 * writer to name, in the `why`, the file and line that carries the dependency —
 * and then read only the source node's own `path:`, so a `why` naming the exact
 * importing file cleared nothing and the finding stood. The candidates are now
 * the source node's file *and* every repo-relative file path written in
 * `relation_notes` for that edge, each clamped inside the repository and each
 * required to be a file that exists. Any one of them naming the target is
 * enough. This is what makes the repair the message asks for actually work, and
 * it is the honest shape besides: a browser module depending on an MCP module,
 * or TypeScript on Rust, is witnessed by a third file — the barrel, the bridge,
 * the contract test — not by either end.
 *
 * Silent whenever an input is a guess: no repository root, no `path:` on either
 * end, a source `path:` that is a directory (`folder-only-evidence` owns that
 * one and saying it twice trains the reader to skim), or either path resolving
 * out of the tree. A note path that is missing, a directory, or outside the
 * repository is dropped, never guessed at.
 *
 * @param {object} args
 * @param {string} args.slug
 * @param {Record<string, unknown>} args.frontmatter
 * @param {Record<string, unknown>} [args.previousFrontmatter] absent means every
 *   declared dependency is judged.
 * @param {string|null} args.repoRoot
 * @param {(ref: string) => string|null} args.resolveTargetPath maps a target
 *   slug to its frontmatter `path:`, or null when the caller cannot say.
 * @returns {Array<object>} one finding per unwitnessed target; `key` is the
 *   target slug so the gate's own notice key is per edge, not per node.
 */
export function dependencyWitnessFinding({
  slug,
  frontmatter,
  previousFrontmatter,
  repoRoot,
  resolveTargetPath,
}) {
  if (!repoRoot || typeof resolveTargetPath !== 'function') return [];
  const source = insideRepo(repoRoot, frontmatter?.path);
  if (!source) return [];
  let sourceText;
  try {
    if (!statSync(source.absolute).isFile()) return [];
    sourceText = readFileSync(source.absolute, 'utf-8');
  } catch {
    return [];
  }
  const previous = previousFrontmatter ? declaredDependencies(previousFrontmatter) : new Set();
  /** One read per file however many edges cite it; `null` marks unreadable. */
  const textCache = new Map([[source.path, sourceText]]);
  // Several dependencies often share the same source or rationale file. Parse
  // its imports once for this invocation; later calls still read current bytes.
  const moduleNamesByText = new Map();
  /**
   * Where a note path is looked for: as written from the repository root,
   * then from each ancestor folder of the citing file, nearest first. A
   * writer copies paths the way an editor shows them ("features/library/
   * index.ts:13" from a file under src/), and the first repair turn wrote
   * exactly that; a root-only reading dropped every one of them. Each try is
   * still clamped inside the repository and must be an existing file.
   */
  const sourceAncestors = [];
  for (let dir = dirname(source.path); dir && dir !== '.'; dir = dirname(dir)) {
    sourceAncestors.push(dir);
  }
  const readCandidate = (path) => {
    if (textCache.has(path)) return textCache.get(path);
    let text = null;
    for (const base of ['', ...sourceAncestors]) {
      const resolved = insideRepo(repoRoot, base ? `${base}/${path}` : path);
      if (!resolved) continue;
      try {
        if (!statSync(resolved.absolute).isFile()) continue;
        text = readFileSync(resolved.absolute, 'utf-8');
        break;
      } catch {
        continue;
      }
    }
    textCache.set(path, text);
    return text;
  };
  const findings = [];
  for (const target of declaredDependencies(frontmatter)) {
    if (previous.has(target)) continue;
    let targetPath;
    try {
      targetPath = resolveTargetPath(target);
    } catch {
      continue;
    }
    const resolved = insideRepo(repoRoot, targetPath);
    if (!resolved) continue;
    const witnessNames = witnessNamesFor(resolved.path);
    // The source file first, then every file the edge's own rationale names.
    const candidates = [sourceText];
    for (const token of pathTokensIn(relationNoteText(frontmatter, target))) {
      const text = readCandidate(token);
      if (typeof text === 'string') candidates.push(text);
    }
    if (candidates.some((text) => textWitnesses(text, resolved.path, witnessNames, moduleNamesByText))) continue;
    findings.push({
      code: 'dependency-unwitnessed',
      slug,
      key: target,
      refs: [target],
      count: 1,
      message: dependencyUnwitnessedMessage({
        slug,
        sourcePath: source.path,
        target,
        targetPath: resolved.path,
        witnessName: witnessNames[0],
      }),
    });
  }
  return findings;
}

/** The kinds `init` ships a starter example for. */
const STARTER_EXAMPLE_KINDS = new Set(Object.keys(STARTER_EXAMPLE_SLUGS));

/**
 * Is this node one of the examples `init` wrote for somebody to copy?
 *
 * Two shapes, and the second is why the first is not the whole rule. The three
 * addresses the templates ship are recognised outright — `vault/` and
 * `vault-ko/` use the same slugs, and the browser's starter mirrors them. Beyond
 * those, a slug whose last segment opens with `example-` **and** whose title
 * opens with "Example" is the same thing under another name: someone copied the
 * file and renamed neither half.
 *
 * ⚠️ Both halves of the second shape are required, and the pair is still not a
 * proof. A slug alone would accuse a real domain at `domains/example-rendering`;
 * a title alone would accuse one genuinely called "Example Rendering" at an
 * ordinary address. Requiring both narrows it to the shape a copied scaffold
 * actually has, and what remains — a real node that is *about* examples, named
 * "Example …", and addressed `example-…` — is a false positive this accepts on
 * purpose. It is advisory, the repair for such a node is the rename it wanted
 * anyway, and the alternative is missing every starter somebody copied rather
 * than renamed. The three template addresses above need no title at all.
 *
 * The body is deliberately **not** consulted: a starter whose prose somebody
 * rewrote while keeping the name is still a starter address on the map, and
 * letting an edited body clear the check would reward exactly the half-finished
 * state this exists to name.
 */
export function isStarterExampleNode({ slug, kind, title }) {
  const address = typeof slug === 'string' ? slug.trim() : '';
  if (!address) return false;
  if (typeof kind === 'string' && STARTER_EXAMPLE_SLUGS[kind.trim()] === address) return true;
  if (Object.values(STARTER_EXAMPLE_SLUGS).includes(address)) return true;
  const tail = address.split('/').pop() ?? '';
  if (!tail.startsWith('example-')) return false;
  // "Example", capitalised, is what every template writes and what a copy keeps.
  return String(title ?? '').trim().startsWith('Example');
}

/** Does this body still carry the sentences only the untouched starter has? */
function hasUntouchedStarterBody(body) {
  const text = String(body ?? '').toLowerCase();
  return STARTER_EXAMPLE_BODY_MARKERS.every((marker) => text.includes(marker.toLowerCase()));
}

/**
 * One starter example that is no longer alone.
 *
 * Pure: the caller states which real node of the same kind now exists, because
 * "is there a real sibling" is a whole-vault question and this module answers
 * one node at a time. `realSlug` may be null when the caller knows a sibling
 * exists but not which one.
 */
export function starterExampleFinding({ slug, kind, title, body, realSlug = null }) {
  const address = typeof slug === 'string' ? slug.trim() : '';
  const nodeKind = typeof kind === 'string' ? kind.trim() : '';
  if (!STARTER_EXAMPLE_KINDS.has(nodeKind)) return null;
  if (!isStarterExampleNode({ slug: address, kind: nodeKind, title })) return null;
  const folder = folderForKind(nodeKind) ?? '';
  return {
    code: 'starter-example-node',
    slug: address,
    key: 'slug',
    refs: realSlug ? [realSlug] : [],
    count: 1,
    message: starterExampleNodeMessage({
      starterSlug: address,
      kind: nodeKind,
      realSlug,
      renameTo: `${folder}<real-name>`,
      untouchedBody: hasUntouchedStarterBody(body),
    }),
  };
}

/**
 * Every starter example in a vault that has outgrown it.
 *
 * The whole-vault half, shared by `validate_vault`, the CLI command and the
 * maintenance plan. It needs no bodies and no repository root — a slug, a kind
 * and a title are the entire input — which matters, because the vault most in
 * need of this answer is the one nobody has compiled with bodies loaded.
 *
 * `nodes` is any iterable of `{ slug, kind, title, body? }`.
 */
export function starterExampleFindings(nodes) {
  const rows = [];
  for (const node of nodes ?? []) {
    const kind = typeof node?.kind === 'string' ? node.kind.trim() : '';
    if (!kind) continue;
    rows.push({ ...node, kind, starter: isStarterExampleNode({ slug: node.slug, kind, title: node.title }) });
  }
  const findings = [];
  for (const node of rows) {
    if (!node.starter) continue;
    // The one condition: a real node of the same kind. Until one exists the
    // starter is the instructions, and the product wrote it.
    const sibling = rows.find((other) => other.kind === node.kind && !other.starter);
    if (!sibling) continue;
    const finding = starterExampleFinding({ ...node, realSlug: sibling.slug ?? null });
    if (finding) findings.push(finding);
  }
  return findings.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
}

/**
 * Every meaning finding for one written node.
 *
 * `bodyWritten` and `pathWritten` say what this write actually touched, so a
 * patch that renames a node is not answered with an accusation about a body it
 * never opened — the same restraint `capability-without-evidence` applies by
 * firing at creation only.
 */
export function meaningFindings({
  kind,
  slug,
  frontmatter,
  body,
  repoRoot,
  bodyWritten = false,
  pathWritten = false,
}) {
  const findings = [];
  if (typeof kind !== 'string' || !kind.trim()) return findings;
  const title = typeof frontmatter?.title === 'string' ? frontmatter.title : '';
  if (bodyWritten) {
    const definition = definitionFinding({ kind, slug, title, body });
    if (definition) findings.push(definition);
    findings.push(...boundaryFindings({ kind, slug, title, body }));
    const uncertainty = uncertaintyFinding({ kind, slug, title, body });
    if (uncertainty) findings.push(uncertainty);
    const epistemic = epistemicExclusionFinding({ kind, slug, title, body });
    if (epistemic) findings.push(epistemic);
  }
  if (pathWritten) {
    const folderOnly = folderOnlyEvidenceFinding({ kind, slug, frontmatter, repoRoot });
    if (folderOnly) findings.push(folderOnly);
  }
  return findings;
}
