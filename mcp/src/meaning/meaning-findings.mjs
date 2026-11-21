/**
 * Meaning gaps a write can see in the body, the half of a node the eligibility
 * gate does not open. Every real build lands through add_concept and
 * patch_concept, so this door must say when a vault is shallow yet validates
 * clean (`docs/DECISIONS.md`, the dissent on "A refusal names the path that
 * stays open"). Pure over `{ kind, slug, frontmatter, body, repoRoot }`: no
 * writes or vault scan, and the only disk question is whether a cited path is a
 * directory. Advisory (construction rule 5). `src/shared/lib/vault-document/meaning-findings.ts`
 * is the app twin, compared by `tests/contract/analysis/meaning-findings-parity.contract.test.ts`.
 */

export { dependencyWitnessFinding, folderOnlyEvidenceFinding } from './source-evidence-findings.mjs';
export { isStarterExampleNode, starterExampleFinding, starterExampleFindings } from './starter-example-finding.mjs';

import {
  BODY_BOUNDARY_SECTIONS,
  BODY_DEFINITION_SECTIONS,
  BODY_UNCERTAINTY_SECTIONS,
  boundaryMissingMessage,
  definitionMissingMessage,
  epistemicExclusionMessage,
  isEpistemicExclusionBoundary,
  uncertaintyMissingMessage,
} from '../construction/construction-rules.mjs';
import {
  NODE_ELIGIBILITY_GATE,
  ONTOLOGY_META_MODEL_REFERENCE,
  defaultBody,
} from '../schema.mjs';
import { folderOnlyEvidenceFinding } from './source-evidence-findings.mjs';

/**
 * Words of prose a definition needs: about the shortest English sentence that
 * carries both halves of a definition. Lower passes a restated title; higher
 * accuses a terse real one.
 */
const DEFINITION_MIN_WORDS = 8;

/**
 * Words a definition must add beyond the title, since construction rule 3a asks
 * for a non-circular sentence and length alone cannot tell circular from terse.
 * Five new words read as a paraphrase in the trial vaults; six begin to say something.
 */
const DEFINITION_MIN_NOVEL_WORDS = 6;

/** Grammar words, so restating the title around them still counts as restating. Kept tiny on purpose. */
const DEFINITION_STOP_WORDS = Object.freeze(
  new Set(['a', 'an', 'the', 'of', 'and', 'or', 'for', 'to', 'in', 'on', 'is', 'are']),
);

const DEFINITION_KINDS = new Set(['domain', 'capability', 'element']);
const BOUNDARY_KINDS = new Set(['domain', 'capability']);
const UNCERTAINTY_KINDS = new Set(['domain', 'capability', 'element']);
const EPISTEMIC_KINDS = new Set(['domain', 'capability', 'element', 'project']);
const BODY_CHECK_KINDS = new Set([...DEFINITION_KINDS, ...BOUNDARY_KINDS, ...UNCERTAINTY_KINDS, ...EPISTEMIC_KINDS]);
const BODY_CHECKS = [definitionFinding, boundaryFindings, uncertaintyFinding, epistemicExclusionFinding];

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

/** Distinct tokens not in the title, so one new word repeated does not pass. */
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

/** The starter line every template ends with; counting it would let an empty node pass on boilerplate. */
function isSchemaFurniture(line) {
  return String(line ?? '').includes(ONTOLOGY_META_MODEL_REFERENCE);
}

/**
 * Splits a body into the prose before the first `##` and the sections after.
 * The `#` title is neither (it repeats `title`), and fenced code is skipped so
 * a `##` inside a snippet invents no section.
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
 * The section stating this side of the boundary. The negative side is tested
 * first: "out of scope" contains "scope", or `## Out of scope` reads as Includes.
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
 * The section carrying the definition. The qualification lane writes it
 * under `## Definition` with nothing above, so the heading is a second place to look,
 * judged by the same word counts.
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

/** Placeholder lines, derived from the template so the scaffold and this check cannot drift. */
function starterPlaceholders(starter) {
  const placeholders = new Set();
  if (!starter) return placeholders;
  for (const section of starter.sections) {
    for (const line of section.lines) placeholders.add(fold(stripMarker(line)));
  }
  placeholders.delete('');
  return placeholders;
}

function bodyView(kind, title, body) {
  const starter = starterShape(kind, title);
  return { ...parseBodySections(body), starter, placeholders: starterPlaceholders(starter) };
}

export function bodyMeaningFindings(input) {
  if (!BODY_CHECK_KINDS.has(input.kind)) return [];
  const view = bodyView(input.kind, input.title, input.body);
  return BODY_CHECKS.flatMap((check) => check(input, view) ?? []);
}

const NO_BODY_FINDINGS = Object.freeze([]);

/**
 * What {@link bodyMeaningFindings} judged of one body, without the slug its
 * findings are addressed to: a cache keeps this per document instead of the body.
 * `refs` are copied out of the body, so the verdict keeps no slice of it alive.
 */
export function bodyMeaningVerdict({ kind, title, body }) {
  const findings = bodyMeaningFindings({ kind, slug: '', title, body });
  if (findings.length === 0) return NO_BODY_FINDINGS;
  return Object.freeze(findings.map(({ code, key, refs }) =>
    Object.freeze({ code, key, refs: Object.freeze(refs.map((ref) => JSON.parse(JSON.stringify(ref)))) })));
}

/** The findings {@link bodyMeaningFindings} returns for `slug`, rebuilt from a {@link bodyMeaningVerdict}. */
export function bodyMeaningFindingsFromVerdict(verdict, { kind, slug }) {
  return verdict.map(({ code, key, refs }) => {
    if (code === 'definition-missing') return definitionMissingFinding(slug, kind);
    if (code === 'boundary-missing') return boundaryMissingFinding(slug, kind, key);
    if (code === 'uncertainty-missing') return uncertaintyMissingFinding(slug, kind);
    if (code === 'epistemic-exclusion') return epistemicExclusionFindingFor(slug, [...refs]);
    throw new Error(`unknown body meaning finding ${code}`);
  });
}

/**
 * Is this line still a slot? Either untouched (matches the template) or reworded
 * around a surviving `<…>` slot, which a counter reads as filled.
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
 * Does the body say what this node is? A template definition line kept (by
 * containment, so appending one line does not pass) or too little new prose
 * before the first `##` share one code.
 */
export function definitionFinding({ kind, slug, title, body }, view = null) {
  if (!DEFINITION_KINDS.has(kind)) return null;
  const { lead, sections, starter, placeholders } = view ?? bodyView(kind, title, body);
  const leadText = lead.join(' ');
  const starterLead = starter ? starter.lead.join(' ') : '';
  const leadIsStarter = Boolean(starterLead) && fold(leadText).includes(fold(starterLead));
  const stated = contentLines(findDefinitionSection(sections), placeholders)
    .map((line) => stripMarker(line))
    .join(' ');
  // Either place may hold the definition; the candidate must be long enough and
  // add enough beyond the title.
  const titleWords = new Set(wordTokens(title));
  for (const candidate of [leadIsStarter ? '' : leadText, stated]) {
    if (wordCount(candidate) < DEFINITION_MIN_WORDS) continue;
    if (novelWordCount(candidate, titleWords) < DEFINITION_MIN_NOVEL_WORDS) continue;
    return null;
  }
  return definitionMissingFinding(slug, kind);
}

function definitionMissingFinding(slug, kind) {
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
 * One finding per missing boundary side, named in `key`: the two are different
 * work, and reporting them together lets half an answer read as whole.
 */
export function boundaryFindings({ kind, slug, title, body }, view = null) {
  if (!BOUNDARY_KINDS.has(kind)) return [];
  const { sections, placeholders } = view ?? bodyView(kind, title, body);
  const findings = [];
  for (const side of ['includes', 'excludes']) {
    const section = findBoundarySection(sections, side);
    if (contentLines(section, placeholders).length > 0) continue;
    findings.push(boundaryMissingFinding(slug, kind, side));
  }
  return findings;
}

function boundaryMissingFinding(slug, kind, side) {
  return {
    code: 'boundary-missing',
    slug,
    key: side,
    refs: [],
    count: 1,
    message: boundaryMissingMessage({ slug, kind, side }),
  };
}

/**
 * Does the body say what the writer did not check? No stated unknown claims
 * completeness. A placeholder bullet does not count, or the default write would
 * silence the question it cannot have answered.
 */
export function uncertaintyFinding({ kind, slug, title, body }, view = null) {
  if (!UNCERTAINTY_KINDS.has(kind)) return null;
  const { sections, placeholders } = view ?? bodyView(kind, title, body);
  const section = sections.find((row) => headingNames(row.heading, BODY_UNCERTAINTY_SECTIONS)) ?? null;
  if (contentLines(section, placeholders).length > 0) return null;
  return uncertaintyMissingFinding(slug, kind);
}

function uncertaintyMissingFinding(slug, kind) {
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
 * The author's uncertainty lines, placeholders removed, chosen by the same
 * synonyms and scaffold as {@link uncertaintyFinding}. `uncertainty-reads.mjs`
 * imports it so the write-time question and the read-time queue agree.
 */
export function uncertaintySectionLines({ kind, title, body }) {
  const { sections, placeholders } = bodyView(kind, title, body);
  const section =
    sections.find((row) => headingNames(row.heading, BODY_UNCERTAINTY_SECTIONS)) ?? null;
  return contentLines(section, placeholders);
}

/**
 * Exclusions stating what the writer did not see rather than what the product
 * does not do. The rule is imported from `construction-rules.mjs`, never
 * re-derived, so the qualification lane and this door agree on each bullet.
 */
export function epistemicExclusionFinding({ kind, slug, title, body }, view = null) {
  if (!EPISTEMIC_KINDS.has(kind)) return null;
  const { sections, placeholders } = view ?? bodyView(kind, title, body);
  const section = findBoundarySection(sections, 'excludes');
  if (!section) return null;
  const offending = contentLines(section, placeholders)
    .map((line) => stripMarker(line))
    .filter((text) => text && isEpistemicExclusionBoundary(text));
  if (offending.length === 0) return null;
  return epistemicExclusionFindingFor(slug, offending);
}

function epistemicExclusionFindingFor(slug, offending) {
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

/**
 * Every meaning finding for one written node. `bodyWritten` and `pathWritten`
 * say what this write touched, so a rename patch is not answered about a body it
 * never opened.
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
