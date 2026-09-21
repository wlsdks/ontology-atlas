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

import { existsSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';

import {
  BODY_BOUNDARY_SECTIONS,
  BODY_DEFINITION_SECTIONS,
  BODY_UNCERTAINTY_SECTIONS,
  boundaryMissingMessage,
  definitionMissingMessage,
  epistemicExclusionMessage,
  folderOnlyEvidenceMessage,
  isEpistemicExclusionBoundary,
  uncertaintyMissingMessage,
} from './construction-rules.mjs';
import { NODE_ELIGIBILITY_GATE, ONTOLOGY_META_MODEL_REFERENCE, defaultBody } from './schema.mjs';

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
