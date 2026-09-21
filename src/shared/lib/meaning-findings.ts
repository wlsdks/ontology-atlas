/**
 * The meaning a body either states or does not — the browser's copy of
 * `mcp/src/meaning-findings.mjs`.
 *
 * ## Why a copy exists at all
 *
 * `src/`, `mcp/`, and `cli/` are three packages with no cross-imports, and the
 * canonical module reaches for `node:fs` to answer its sixth question. So the
 * five body-and-slug judgements are ported here and
 * `tests/contract/meaning-findings-parity.contract.test.ts` runs both
 * implementations over one fixture table, asserting identical code sets. That is
 * the repository's standing answer to an unavoidable duplicate — the same one
 * that keeps `mcp/src/schema.mjs` and the app's `KIND_EXPECTED_EXTRAS` in step.
 *
 * The sixth, `folder-only-evidence`, is deliberately absent: it asks the
 * filesystem whether a cited path is a directory. A browser has no filesystem
 * and no repository root, and a guess would accuse a node of something nobody
 * measured. `validate_vault` and the CLI answer it where a root is known.
 *
 * ## What it is for
 *
 * A node can be perfectly valid frontmatter and still say nothing. Until
 * 2026-09-22 only the write door noticed, so an agent could read six findings,
 * tell the person the vault validated clean, and every surface the person could
 * check for themselves agreed with the agent. These functions are how the
 * person's own validator asks the same question.
 *
 * Advisory, always — construction rule 5. Nothing here refuses a body; refusing
 * one would make the honest sequence (name it, then say what it is) an error.
 */

/**
 * Words of real prose before the first `##` below which a body is a label.
 *
 * Eight, because that is roughly the shortest English sentence that can carry
 * both halves of a definition ("X turns a vault folder into a graph").
 */
const DEFINITION_MIN_WORDS = 8;

/**
 * Words a definition must carry that the title does not already say.
 *
 * "Mobile/web bottom tab navigation widget for the app" is eight words and
 * clears the length bar while telling a reader nothing the title `Bottom Tab
 * Bar` did not. Length alone cannot tell circular from terse; six is where a
 * paraphrase stops and a sentence begins.
 */
const DEFINITION_MIN_NOVEL_WORDS = 6;

/**
 * Words that carry no meaning of their own, so restating the title around them
 * is still restating the title. Deliberately tiny: a long stop list starts
 * deciding which real words count.
 */
const DEFINITION_STOP_WORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "or",
  "for",
  "to",
  "in",
  "on",
  "is",
  "are",
]);

/** Heading names a body section may use to carry the node's definition. */
export const BODY_DEFINITION_SECTIONS: readonly string[] = [
  "definition",
  "summary",
  "what it is",
  "what this is",
  "overview",
];

/**
 * Heading names for each side of a concept's boundary.
 *
 * ⚠️ Order matters to the reader of this list: "out of scope" contains "scope",
 * so a caller tests the negative side first and only then the positive one.
 */
export const BODY_BOUNDARY_SECTIONS: Readonly<{
  includes: readonly string[];
  excludes: readonly string[];
}> = {
  includes: ["includes", "inclusions", "in scope", "scope", "boundary", "constraints"],
  excludes: ["excludes", "exclusions", "out of scope", "not this"],
};

/** Heading names a body section may use to record what the writer did not check. */
export const BODY_UNCERTAINTY_SECTIONS: readonly string[] = [
  "uncertainty",
  "open questions",
  "unknowns",
  "not checked",
  "confidence",
];

/**
 * What an evidence limit actually sounds like, measured rather than guessed.
 *
 * Every clause stays tied to a reading verb ("inspect", "read", "trace",
 * "carried as a node") so an ordinary product boundary — "flags, which are
 * options rather than positional arguments" — does not match.
 */
const EPISTEMIC_EXCLUSION_PATTERNS: readonly RegExp[] = [
  /\bnot\s+(?:established|asserted|proven|verified|measured|observed|known|confirmed)\b/,
  /\bremain(?:s|ed)?\s+outside\s+(?:this|the)\s+(?:bounded\s+)?(?:scan|evidence)\b/,
  /\bnot\s+(?:named|listed|mentioned|included|covered|present)\s+in\s+(?:this|the)\s+(?:bounded\s+)?(?:semantic\s+)?(?:excerpt|evidence|scan|packet)\b/,
  /\b(?:this|the|our)\s+(?:survey|scan|pass|packet|excerpt|read|analysis|review|session)\s+did\s+not\s+(?:inspect|read|trace|scan|cover|open|look\s+at|examine|visit)\b/,
  /\b(?:was|were)\s+not\s+(?:read|inspected|traced|scanned|covered|opened|examined|visited|analysed|analyzed|reviewed)\b/,
  /\bnot\s+(?:yet\s+)?(?:carried|represented|modelled|modeled|captured)\s+(?:as|in)\b/,
  /\b(?:unread|uninspected|untraced|unscanned)\b/,
  /\bnot\s+(?:yet\s+)?(?:inspected|read|traced)\s+in\s+this\s+(?:first\s+)?(?:pass|survey|scan|round)\b/,
  /\b(?:did\s+not|didn't|could\s+not|couldn't)\s+(?:get\s+to|reach|cover|read)\b/,
  /\boutside\s+(?:what|the\s+files)\s+(?:this|the)\s+(?:survey|scan|pass)\s+(?:read|covered|inspected)\b/,
];

/**
 * Does this exclusion state an **evidence limit** rather than a product
 * boundary?
 *
 * "Remote vaults are not mentioned in this scan" says what the writer did not
 * see. "Atlas does not sync folders between machines" says what the product does
 * not do. A reader handed the vault without the source cannot tell those apart
 * and repeats the first as the second.
 */
export function isEpistemicExclusionBoundary(value: string): boolean {
  const normalized = String(value).replace(/\s+/g, " ").trim().toLowerCase();
  return EPISTEMIC_EXCLUSION_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * The canonical reference every kind template's last line carries. It is schema
 * furniture, not the author's prose, so counting it would let an empty node
 * clear the definition bar on boilerplate alone.
 */
const ONTOLOGY_META_MODEL_REFERENCE =
  "https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind";

function metaModelStarterLine(): string {
  return `Kind and relation contract: ${ONTOLOGY_META_MODEL_REFERENCE}\n`;
}

/**
 * The starter body each kind ships, mirrored from `VAULT_KIND_SCHEMA` in
 * `mcp/src/schema.mjs`.
 *
 * It is here, rather than being derived, for one reason: the placeholder check
 * asks "is this line still the slot the template wrote?", so it has to know what
 * the template wrote. The parity contract asserts each of these equals
 * `defaultBody(kind, title)` from the canonical schema, so changing a
 * placeholder's wording in one place and not the other fails in that commit.
 */
export const KIND_BODY_TEMPLATES: Readonly<Record<string, (title: string) => string>> = {
  project: (title) =>
    `# ${title}\n\n` +
    `One- or two-line summary of this project: *what / for whom / why*.\n\n` +
    `## How it grows\n\n` +
    `- Fill \`domains: [...]\` in the frontmatter and the domain nodes hang\n` +
    `  off the project tree automatically.\n` +
    `- Each domain's capabilities and elements follow the same pattern.\n\n` +
    metaModelStarterLine(),
  domain: (title) =>
    `# ${title}\n\n` +
    `Describe the stable responsibility or problem boundary, what it includes, ` +
    `what it excludes, and the evidence that makes it more than a folder or team.\n\n` +
    `## Includes\n\n` +
    `- <one responsibility this domain owns>\n\n` +
    `## Excludes\n\n` +
    `- <one neighbouring responsibility this domain does not own>\n\n` +
    `## Evidence\n\n` +
    `- <what makes this more than a folder or a team name>\n\n` +
    `## Uncertainty\n\n` +
    `- <what you did not read or could not check>\n\n` +
    metaModelStarterLine(),
  capability: (title) =>
    `# ${title}\n\n` +
    `Describe the observable, implementation-independent ability, its boundary, ` +
    `and the evidence or scenario that proves the product or system can perform it.\n\n` +
    `## Includes\n\n` +
    `- <one thing this capability can do>\n\n` +
    `## Excludes\n\n` +
    `- <one nearby ability this capability does not provide>\n\n` +
    `## Evidence\n\n` +
    `- path: <file> — what it proves\n\n` +
    `## Uncertainty\n\n` +
    `- <what you did not read or could not check>\n\n` +
    metaModelStarterLine(),
  element: (title) =>
    `# ${title}\n\n` +
    `Describe the distinct implementation role, what it realizes or proves, and ` +
    `the source path or interface that supports the claim. A path alone is evidence, not a node.\n\n` +
    `## Includes\n\n` +
    `- <one part of the role this element plays>\n\n` +
    `## Excludes\n\n` +
    `- <one nearby role this element does not play>\n\n` +
    `## Evidence\n\n` +
    `- path: <file> — what it proves\n\n` +
    `## Uncertainty\n\n` +
    `- <what you did not read or could not check>\n\n` +
    metaModelStarterLine(),
  document: (title) =>
    `# ${title}\n\n` +
    `State what this narrative or reference artifact explains and which graph concept it describes.\n\n` +
    metaModelStarterLine(),
};

/**
 * The folder each kind's slug lives under — `folderForKind` in the canonical
 * schema. `project` and `document` stay at the vault root by design, so their
 * empty prefix is what keeps `slug-outside-kind-folder` quiet about them.
 */
const KIND_SLUG_FOLDERS: Readonly<Record<string, string>> = {
  project: "",
  domain: "domains/",
  capability: "capabilities/",
  element: "elements/",
  document: "",
};

export function folderForKind(kind: string): string {
  return KIND_SLUG_FOLDERS[kind] ?? "";
}

const DEFINITION_KINDS: ReadonlySet<string> = new Set(["domain", "capability", "element"]);
const BOUNDARY_KINDS: ReadonlySet<string> = new Set(["domain", "capability"]);
const UNCERTAINTY_KINDS: ReadonlySet<string> = new Set(["domain", "capability", "element"]);
const EPISTEMIC_KINDS: ReadonlySet<string> = new Set([
  "domain",
  "capability",
  "element",
  "project",
]);

type MeaningFindingCode =
  | "definition-missing"
  | "boundary-missing"
  | "uncertainty-missing"
  | "epistemic-exclusion"
  | "slug-outside-kind-folder";

export interface MeaningFinding {
  code: MeaningFindingCode;
  /** Which part of the document the finding is about — `body`, a boundary side, `slug`. */
  key: string;
  /** The offending lines, when there are any to quote. */
  refs: string[];
}

interface BodySection {
  heading: string;
  lines: string[];
}

export interface ParsedBody {
  /** Prose before the first `##`. */
  lead: string[];
  sections: BodySection[];
}

function fold(text: unknown): string {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Strips a list marker (`-`, `*`, `1.`) or a blockquote caret from one line. */
function stripMarker(line: unknown): string {
  return String(line ?? "")
    .replace(/^\s*(?:[-*+]|\d+[.)]|>)\s*/, "")
    .trim();
}

/** Lowercased word tokens, punctuation and markup dropped. */
function wordTokens(text: unknown): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * How much of this sentence is not already in the title? Distinct tokens only,
 * so repeating one new word six times does not pass.
 */
function novelWordCount(text: string, titleWords: ReadonlySet<string>): number {
  const novel = new Set<string>();
  for (const token of wordTokens(text)) {
    if (DEFINITION_STOP_WORDS.has(token) || titleWords.has(token)) continue;
    novel.add(token);
  }
  return novel.size;
}

function wordCount(text: unknown): number {
  return String(text ?? "")
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

function isSchemaFurniture(line: unknown): boolean {
  return String(line ?? "").includes(ONTOLOGY_META_MODEL_REFERENCE);
}

/**
 * Split a body into the prose before the first `##` and the sections after it.
 *
 * The `#` title is neither: it repeats the frontmatter `title`, so treating it
 * as a definition would mean every node defines itself by its own name. Fenced
 * code is skipped so a `##` comment inside a snippet cannot invent a section
 * that is not there.
 */
export function parseBodySections(body: string | null | undefined): ParsedBody {
  const lead: string[] = [];
  const sections: BodySection[] = [];
  let current: BodySection | null = null;
  let fenced = false;
  for (const raw of String(body ?? "").split("\n")) {
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

function normalizeHeading(heading: string): string {
  return fold(String(heading).replace(/[`*_#]/g, "").replace(/[:：.,]+\s*$/, ""));
}

function headingNames(heading: string, synonyms: readonly string[]): boolean {
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
 * The negative side is tested first on purpose: "out of scope" contains "scope",
 * so testing the positive list first would read every `## Out of scope` as an
 * `Includes` and then report the exclusions as missing.
 */
function findBoundarySection(
  sections: readonly BodySection[],
  side: "includes" | "excludes",
): BodySection | null {
  for (const section of sections) {
    if (headingNames(section.heading, BODY_BOUNDARY_SECTIONS.excludes)) {
      if (side === "excludes") return section;
      continue;
    }
    if (side === "includes" && headingNames(section.heading, BODY_BOUNDARY_SECTIONS.includes)) {
      return section;
    }
  }
  return null;
}

function findDefinitionSection(sections: readonly BodySection[]): BodySection | null {
  return sections.find((section) => headingNames(section.heading, BODY_DEFINITION_SECTIONS)) ?? null;
}

/** The starter scaffold for this kind, parsed once per call site. */
function starterShape(kind: string, title: string): ParsedBody | null {
  const template = KIND_BODY_TEMPLATES[kind];
  if (!template) return null;
  return parseBodySections(template(title ?? ""));
}

/**
 * Every placeholder line the starter template ships, folded for comparison.
 *
 * Derived from the template rather than listed here, so the scaffold and the
 * check cannot drift.
 */
function starterPlaceholders(starter: ParsedBody | null): Set<string> {
  const placeholders = new Set<string>();
  if (!starter) return placeholders;
  for (const section of starter.sections) {
    for (const line of section.lines) placeholders.add(fold(stripMarker(line)));
  }
  placeholders.delete("");
  return placeholders;
}

/**
 * Is this line still a slot rather than a statement?
 *
 * Two tests, because an author edits a scaffold in two ways. Either the line is
 * untouched, or the wording moved while the `<…>` slot stayed — the shape that
 * reads as filled to a counter and says nothing to a reader.
 */
function isPlaceholderLine(line: string, placeholders: ReadonlySet<string>): boolean {
  const text = stripMarker(line);
  const folded = fold(text);
  if (!folded) return true;
  if (placeholders.has(folded)) return true;
  if (!/<[^>]*>/.test(text)) return false;
  return wordCount(text.replace(/<[^>]*>/g, " ")) < 3;
}

function contentLines(
  section: BodySection | null,
  placeholders: ReadonlySet<string>,
): string[] {
  if (!section) return [];
  return section.lines.filter((line) => line && !isPlaceholderLine(line, placeholders));
}

export interface MeaningFindingInput {
  kind: string;
  /** The document's vault-relative slug, when the caller knows where the file sits. */
  slug?: string;
  title?: string;
  body?: string;
}

/**
 * Does the body say what this node is?
 *
 * Two failures, one code. A body that still carries the template's definition
 * line has not been written; a body with fewer than eight words of prose before
 * its first `##` (and none under `## Definition`) was written as headings.
 */
export function definitionFinding({ kind, title, body }: MeaningFindingInput): MeaningFinding | null {
  if (!DEFINITION_KINDS.has(kind)) return null;
  const { lead, sections } = parseBodySections(body);
  const starter = starterShape(kind, title ?? "");
  const placeholders = starterPlaceholders(starter);
  const leadText = lead.join(" ");
  const starterLead = starter ? starter.lead.join(" ") : "";
  const leadIsStarter = Boolean(starterLead) && fold(leadText).includes(fold(starterLead));
  const stated = contentLines(findDefinitionSection(sections), placeholders)
    .map((line) => stripMarker(line))
    .join(" ");
  // Either place may hold the definition, and one of them holding it is enough.
  // Each candidate has to clear both bars: long enough to be a sentence, and new
  // enough not to be the title with grammar around it.
  const titleWords = new Set(wordTokens(title));
  for (const candidate of [leadIsStarter ? "" : leadText, stated]) {
    if (wordCount(candidate) < DEFINITION_MIN_WORDS) continue;
    if (novelWordCount(candidate, titleWords) < DEFINITION_MIN_NOVEL_WORDS) continue;
    return null;
  }
  return { code: "definition-missing", key: "body", refs: [] };
}

/**
 * Does the body draw both sides of the boundary?
 *
 * One finding per missing side, named in `key`, because the two are different
 * work: an author who listed what a capability covers has not yet answered what
 * it is confused with.
 */
export function boundaryFindings({ kind, title, body }: MeaningFindingInput): MeaningFinding[] {
  if (!BOUNDARY_KINDS.has(kind)) return [];
  const { sections } = parseBodySections(body);
  const placeholders = starterPlaceholders(starterShape(kind, title ?? ""));
  const findings: MeaningFinding[] = [];
  for (const side of ["includes", "excludes"] as const) {
    const section = findBoundarySection(sections, side);
    if (contentLines(section, placeholders).length > 0) continue;
    findings.push({ code: "boundary-missing", key: side, refs: [] });
  }
  return findings;
}

/**
 * Does the body say what the writer did not check?
 *
 * A node that records no unknown claims completeness, and the claim is always
 * false — the builder read some files and not others. A placeholder bullet does
 * not count: letting the scaffold satisfy the check would mean the default write
 * silences the one question the default write cannot have answered.
 */
export function uncertaintyFinding({
  kind,
  title,
  body,
}: MeaningFindingInput): MeaningFinding | null {
  if (!UNCERTAINTY_KINDS.has(kind)) return null;
  const { sections } = parseBodySections(body);
  const placeholders = starterPlaceholders(starterShape(kind, title ?? ""));
  const section =
    sections.find((row) => headingNames(row.heading, BODY_UNCERTAINTY_SECTIONS)) ?? null;
  if (contentLines(section, placeholders).length > 0) return null;
  return { code: "uncertainty-missing", key: "uncertainty", refs: [] };
}

/**
 * Exclusions that state what the writer did not see rather than what the product
 * does not do.
 */
export function epistemicExclusionFinding({
  kind,
  title,
  body,
}: MeaningFindingInput): MeaningFinding | null {
  if (!EPISTEMIC_KINDS.has(kind)) return null;
  const { sections } = parseBodySections(body);
  const section = findBoundarySection(sections, "excludes");
  if (!section) return null;
  const placeholders = starterPlaceholders(starterShape(kind, title ?? ""));
  const offending = contentLines(section, placeholders)
    .map((line) => stripMarker(line))
    .filter((text) => text && isEpistemicExclusionBoundary(text));
  if (offending.length === 0) return null;
  return { code: "epistemic-exclusion", key: "excludes", refs: offending };
}

/**
 * A node written at the vault root instead of inside its kind folder.
 *
 * Silent when the slug is unknown, because the question is literally "where does
 * this file sit", and a caller holding only bytes cannot be told. Valid, never
 * blocked: a flat slug simply groups with nothing in any reader that shows a
 * vault by kind.
 */
export function slugOutsideKindFolderFinding({
  kind,
  slug,
}: MeaningFindingInput): MeaningFinding | null {
  const trimmed = typeof slug === "string" ? slug.trim() : "";
  if (!trimmed) return null;
  const folder = folderForKind(kind);
  if (!folder || trimmed.startsWith(folder)) return null;
  return {
    code: "slug-outside-kind-folder",
    key: "slug",
    refs: [`${folder}${trimmed}`],
  };
}

/**
 * Every meaning finding for one document, in the order the canonical module
 * pushes them: definition, both boundary sides, uncertainty, epistemic
 * exclusions, then position.
 */
export function meaningFindings(input: MeaningFindingInput): MeaningFinding[] {
  const findings: MeaningFinding[] = [];
  if (typeof input.kind !== "string" || !input.kind.trim()) return findings;
  const definition = definitionFinding(input);
  if (definition) findings.push(definition);
  findings.push(...boundaryFindings(input));
  const uncertainty = uncertaintyFinding(input);
  if (uncertainty) findings.push(uncertainty);
  const epistemic = epistemicExclusionFinding(input);
  if (epistemic) findings.push(epistemic);
  const position = slugOutsideKindFolderFinding(input);
  if (position) findings.push(position);
  return findings;
}
