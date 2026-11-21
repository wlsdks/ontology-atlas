/**
 * Browser copy of `mcp/src/meaning/meaning-findings.mjs`; kept in step by
 * `tests/contract/analysis/meaning-findings-parity.contract.test.ts`. `folder-only-evidence` is absent: no
 * filesystem.
 */

/** Roughly the shortest English sentence carrying both halves of a definition. */
const DEFINITION_MIN_WORDS = 8;

/** Length alone cannot tell circular from terse; six new words is where a paraphrase stops. */
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

export const BODY_DEFINITION_SECTIONS: readonly string[] = [
  "definition",
  "summary",
  "what it is",
  "what this is",
  "overview",
];

/** Test the negative side first: "out of scope" contains "scope". */
export const BODY_BOUNDARY_SECTIONS: Readonly<{
  includes: readonly string[];
  excludes: readonly string[];
}> = {
  includes: ["includes", "inclusions", "in scope", "scope", "boundary", "constraints"],
  excludes: ["excludes", "exclusions", "out of scope", "not this"],
};

export const BODY_UNCERTAINTY_SECTIONS: readonly string[] = [
  "uncertainty",
  "open questions",
  "unknowns",
  "not checked",
  "confidence",
];

/** Every clause stays tied to a reading verb so an ordinary product boundary does not match. */
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
 * An evidence limit says what the writer did not see; a product boundary says what the product
 * does not do. A reader without the source cannot tell them apart.
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
 * Mirrored from `VAULT_KIND_SCHEMA` (`mcp/src/schema.mjs`) because the placeholder check must know
 * what the template wrote; the parity contract asserts each equals `defaultBody(kind, title)`.
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
 * `folderForKind` in the canonical schema. `project` and `document` stay at the vault root, so
 * their empty prefix keeps `slug-outside-kind-folder` quiet about them.
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
 * The `#` title repeats the frontmatter `title`, so it is not a definition. Fenced code is skipped
 * so a `##` inside a snippet invents no section.
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

/** Negative side first: otherwise every `## Out of scope` reads as an `Includes`. */
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

function starterShape(kind: string, title: string): ParsedBody | null {
  const template = KIND_BODY_TEMPLATES[kind];
  if (!template) return null;
  return parseBodySections(template(title ?? ""));
}

/** Derived from the template so the scaffold and the check cannot drift. */
function starterPlaceholders(starter: ParsedBody | null): Set<string> {
  const placeholders = new Set<string>();
  if (!starter) return placeholders;
  for (const section of starter.sections) {
    for (const line of section.lines) placeholders.add(fold(stripMarker(line)));
  }
  placeholders.delete("");
  return placeholders;
}

/** A slot is either untouched or reworded around a surviving `<…>`. */
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
 * Two failures, one code: the template's definition line is still there, or the body was written
 * as headings (too little prose before its first `##` and none under `## Definition`).
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

/** One finding per missing side, named in `key`: the two sides are different work. */
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
 * A node recording no unknown claims a completeness that is always false. A placeholder bullet
 * does not count, or the default write would silence the question it cannot have answered.
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
 * Silent when the slug is unknown: a caller holding only bytes cannot say where the file sits.
 * Valid, never blocked.
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

/** In the canonical module's order. */
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
