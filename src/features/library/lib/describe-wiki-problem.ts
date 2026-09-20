import type { useTranslations } from "next-intl";

/**
 * **One finding, retold as something a person can act on — in one place.**
 *
 * ⚠️ **This function existed twice and the copy it produced was unreadable.** A
 * `describeWikiProblem` sat in `WikiTemplateProblems.tsx` and a `describe` with the same
 * body sat in `AnswerRevisionComparison.tsx` (carry-forward, 2026-09-11), while
 * `LibraryCheckReport.tsx` carried a third as `describeStructuralRow`. Three copies of one
 * decision is three places to fix a sentence and two places to forget.
 *
 * What the owner read on 2026-09-12, on a page their agent had just written:
 *
 * > *"I cannot tell what this is saying from a person's side — it just looks like
 * > alien script. This needs fixing right now."*
 *
 * The card above the page said `uncited-fact:31` followed by backticks, a citation
 * grammar, and the names of a CLI command and an MCP tool. Every one of those is true and
 * none of them is addressed to the person reading. So the retelling is split into pieces a
 * surface can place:
 *
 * | Piece | What it answers |
 * |---|---|
 * | `sentence` | what is wrong, in their language, with every name already a title |
 * | `action` | what to do about it, as its own sentence |
 * | `where` | the place in the page, in words — never a code glued to a number |
 * | `targets` | the pages and originals the sentence names, each openable |
 * | `segments` | the sentence in order, so a surface makes each name pressable in place |
 * | `code` | the machine word, for the disclosure that holds it |
 *
 * `segments` is the sixth piece rather than five because of the rule it serves: a name in
 * the sentence is a **link to the thing**, which a surface cannot build from a finished
 * string without parsing its own prose back out. `sentence` stays beside it because two
 * consumers need a plain string and neither can press anything: the row-collapsing key in
 * `LibraryCheckReport` and the blocking reason beside a disabled Save button.
 *
 * ## The English message is still the machine's copy
 *
 * `problem.message` is written once, in English, for the things that read it —
 * `ontology-atlas wiki-validate`, `validate_wiki`, an agent's retry. A person gets
 * `problem.detail`, the sentence's pieces, reassembled in their own language. `t.has`
 * rather than a table of known keys: the validator owns which sentence it just found, and
 * a key it grows before this catalogue does degrades to that English message rather than
 * rendering a raw `library.wiki.problem.…` path.
 */

/** One finding as the validator hands it over. */
export interface WikiTemplateProblem {
  code: string;
  message: string;
  /** 1-based line in the file, when the finding is bound to one. */
  line?: number;
  /** `{ key, values }` for a localised retelling; absent falls back to `message`. */
  detail?: { key: string; values?: Record<string, string> };
}

/**
 * A thing the sentence names that a person can open.
 *
 * `name` is what they read — a page's own title, a file's name with no folder in front of
 * it — because a path is an address and a title is a thing. `id` is what the surface
 * opens with: a wiki slug for a page, a folder-relative path for an original.
 */
export interface WikiProblemTarget {
  kind: "page" | "source";
  name: string;
  id: string;
}

/** The place in the page, said the way a person would say it. */
export interface WikiProblemWhere {
  /** "line 31 under Facts" — already localised, never `uncited-fact:31`. */
  label: string;
  /**
   * The same place with the section left off ("line 31"), for the second and later place
   * in one row: *"line 19 under Facts, line 20 under Facts"* says the section twice about
   * one section. Absent where the label carries no section to leave off.
   */
  lineLabel?: string;
  /** The section the line sits under, when the finding's code fixes one. */
  section?: string;
  line?: number;
}

/**
 * A sentence in order: text, a name to press, or the place to press.
 *
 * Not exported: every consumer reaches it through `WikiProblemWords.segments`, and an
 * exported name with no importer is the kind of misinformation the dead-code ratchet
 * exists to refuse.
 */
type WikiProblemSegment =
  | { kind: "text"; text: string }
  | { kind: "target"; target: WikiProblemTarget }
  | { kind: "where"; where: WikiProblemWhere };

export interface WikiProblemWords {
  code: string;
  /** The finding as one plain sentence, every name already its title. */
  sentence: string;
  /** What to do about it. Null when the finding has no localised retelling. */
  action: string | null;
  where: WikiProblemWhere | null;
  targets: readonly WikiProblemTarget[];
  /** `sentence` in order, so a name can be a press rather than a word about a press. */
  segments: readonly WikiProblemSegment[];
}

type Translate = ReturnType<typeof useTranslations<"library">>;
/** `t` is typed against the catalogue, and these paths are data the validator chooses. */
type ProblemPath = "wiki.problem.orphan-page.what";

export interface WikiProblemContext {
  /** A wiki page's own title, by slug (`wiki/payments-01`). Absent falls back to the name. */
  pageTitle?: (slug: string) => string | undefined;
  /**
   * **How precisely the place is named in the sentence.** `full` is the default and the
   * page's own card: a person standing on the page wants the line.
   *
   * `section` is the computed check report, and it is not a downgrade for its own sake.
   * That page collapses findings that name one page and retell one sentence into a single
   * row whose door carries every line (`merchant-onboarding · :19 · :20`, council
   * 2026-09-12). A line inside the sentence would make two identical findings two
   * different sentences and undo it, while printing the same number twice in one row.
   * Where a code has no section to name, the line comes back — two mistyped citations on
   * two lines *are* two rows.
   */
  place?: "full" | "section";
}

/** `wiki/payments-01.md` → `wiki/payments-01`, which is how every surface addresses a page. */
function pageSlugOf(path: string): string {
  return path.replace(/\.md$/, "");
}

/** The last segment of a path, which is the name a person gave the file. */
function fileName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

/** `wiki/payments-01` → `payments-01`, for a page with no title to read. */
function pageName(slug: string): string {
  return fileName(pageSlugOf(slug));
}

/**
 * The validator joins a list of paths already wrapped in backticks, because its own
 * consumer prints Markdown. A person is not reading Markdown, so the wrapper comes off
 * here rather than being left on screen as punctuation nobody typed.
 */
function pathList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.replace(/`/g, "").trim())
    .filter(Boolean);
}

/** The section a code is bound to by construction, when it is bound to one. */
function sectionOf(key: string): string | undefined {
  return key === "uncited-fact" ? "Facts" : undefined;
}

function whereOf(
  problem: WikiTemplateProblem,
  key: string,
  t: Translate,
  place: "full" | "section",
): WikiProblemWhere | null {
  const section = sectionOf(key);
  if (problem.line === undefined) return null;
  const lineLabel = t("wiki.problem.where.line", { line: problem.line });
  const label =
    section && place === "section"
      ? t("wiki.problem.where.section", { section })
      : section
        ? t("wiki.problem.where.sectionLine", { section, line: problem.line })
        : lineLabel;
  return {
    label,
    ...(label === lineLabel ? {} : { lineLabel }),
    ...(section ? { section } : {}),
    line: problem.line,
  };
}

/**
 * **Which names in the catalogue are absent files, measured rather than assumed.** A door
 * may be built only for a thing that is there; everything else is a name in words.
 */
const MISSING_PATH_KEYS = new Set([
  // The citation names a file the folder walk did not find — that is the finding.
  "citation-target-missing-folder",
  // Recorded as partly read but not among the page's originals, so nothing here says the
  // folder holds it either.
  "bad-truncation-record-path",
]);

/**
 * What each placeholder in a retelling stands for.
 *
 * The validator's `values` are addresses; the screen wants things. `other` is another
 * page, `sources` is a list of originals, `path` is one original, and `target` is a page
 * that does **not** exist — which is why it is a name and never a door: a link to a page
 * nobody wrote is a link to nothing. ⚠️ `path` follows the same rule, and it took a
 * capture to see it (2026-09-12): `citation-target-missing-folder` *means* the file is not
 * in the folder, and the report drew its name as a live indigo press to a file nothing
 * could open. Everything else is text the sentence interpolates and nobody can press: a
 * field name, a section list, a citation somebody mistyped.
 */
function slotsFor(
  name: string,
  raw: string,
  key: string,
  context: WikiProblemContext | undefined,
): WikiProblemSegment[] {
  if (name === "other") {
    const slug = pageSlugOf(raw);
    return [
      {
        kind: "target",
        target: { kind: "page", name: context?.pageTitle?.(slug) ?? pageName(slug), id: slug },
      },
    ];
  }
  if (name === "sources") {
    const paths = pathList(raw);
    const out: WikiProblemSegment[] = [];
    paths.forEach((path, index) => {
      if (index > 0) out.push({ kind: "text", text: ", " });
      out.push({ kind: "target", target: { kind: "source", name: fileName(path), id: path } });
    });
    return out;
  }
  if (name === "path") {
    return MISSING_PATH_KEYS.has(key)
      ? [{ kind: "text", text: fileName(raw) }]
      : [{ kind: "target", target: { kind: "source", name: fileName(raw), id: raw } }];
  }
  if (name === "target") {
    return [{ kind: "text", text: pageName(raw) }];
  }
  return [{ kind: "text", text: raw.replace(/`/g, "") }];
}

/**
 * Split a raw retelling on its placeholders and fill each one with a thing.
 *
 * `t.raw` rather than `t`: a finished string cannot say which of its words is a page and
 * which is punctuation, and re-finding a title inside prose by substring is how a page
 * called `Facts` would turn a section heading into a link. The messages here carry only
 * simple `{name}` placeholders — `icu-message-tags.contract.test.ts` owns the rule that
 * keeps richer ICU out of them — so the split is exact.
 */
function segmentsOf(
  template: string,
  values: Record<string, string>,
  key: string,
  where: WikiProblemWhere | null,
  context: WikiProblemContext | undefined,
  t: Translate,
): WikiProblemSegment[] {
  const out: WikiProblemSegment[] = [];
  const pattern = /\{(\w+)\}/g;
  let at = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(template)) !== null) {
    if (match.index > at) out.push({ kind: "text", text: template.slice(at, match.index) });
    at = match.index + match[0].length;
    const name = match[1]!;
    if (name === "where") {
      out.push(
        where
          ? { kind: "where", where }
          : { kind: "text", text: t("wiki.problem.where.unknown") },
      );
      continue;
    }
    const raw = values[name];
    if (raw === undefined) {
      // A placeholder the validator did not fill. Printing `{other}` on a screen is worse
      // than a shorter sentence, so the hole closes rather than showing its own name.
      continue;
    }
    out.push(...slotsFor(name, raw, key, context));
  }
  if (at < template.length) out.push({ kind: "text", text: template.slice(at) });
  return out;
}

function flatten(segments: readonly WikiProblemSegment[]): string {
  return segments
    .map((segment) =>
      segment.kind === "text"
        ? segment.text
        : segment.kind === "where"
          ? segment.where.label
          : segment.target.name,
    )
    .join("");
}

/**
 * The finding in the reader's language, in pieces a surface can place.
 *
 * Every surface that shows a wiki finding calls this: the two cards beside a page, the
 * rows of the computed check report, and the blocking reason in the revision dialog. That
 * is the point — a person who reads the same finding on the report and then on the page
 * must read the same sentence, or the two screens are describing two folders.
 */
export function describeWikiProblem(
  problem: WikiTemplateProblem,
  t: Translate,
  context?: WikiProblemContext,
): WikiProblemWords {
  const place = context?.place ?? "full";
  const key = problem.detail?.key;
  const what = key ? (`wiki.problem.${key}.what` as ProblemPath) : null;
  if (!what || !t.has(what)) {
    return {
      code: problem.code,
      sentence: problem.message,
      action: null,
      where: whereOf(problem, key ?? "", t, place),
      targets: [],
      segments: [{ kind: "text", text: problem.message }],
    };
  }
  const values = problem.detail?.values ?? {};
  const where = whereOf(problem, key!, t, place);
  const segments = segmentsOf(t.raw(what) as string, values, key!, where, context, t);
  const doPath = `wiki.problem.${key}.do` as ProblemPath;
  return {
    code: problem.code,
    sentence: flatten(segments),
    action: t.has(doPath) ? t(doPath, values) : null,
    where,
    targets: segments.flatMap((segment) => (segment.kind === "target" ? [segment.target] : [])),
    segments,
  };
}

/**
 * The machine's own line for one finding: the code, its line anchor, and the English
 * sentence the CLI and the MCP tool print.
 *
 * It is deliberately **not** localised. A person opening the technical disclosure is
 * comparing this screen with a terminal or an agent transcript, and a translated synonym
 * there is a word they then have to map back (the same reason the check report's group
 * headings keep the code — both design seats, council 2026-09-12).
 */
export function wikiProblemMachineLine(problem: WikiTemplateProblem): string {
  return `${problem.code}${problem.line ? `:${problem.line}` : ""} — ${problem.message}`;
}

/**
 * One row per thing a person fixes, not per time the validator fired.
 *
 * Two bullets under `## Facts` with no citation are two findings with one sentence and
 * one action; printed as two rows the card said *"there is no source behind line 19"* and
 * then, verbatim, *"add one place from an original, or move it under Not in sources"*
 * twice — four lines to say one thing about two places (measured 2026-09-12 on the
 * four-page fixture). So identical findings become **one** row whose place is two
 * presses. It is the same dedup the computed report already does on its door (council
 * 2026-09-12); the difference is that here the places stay inside the sentence, because
 * on the page itself the place is what a person acts on.
 *
 * The technical disclosure still lists every finding separately: a code and its line
 * anchor are the machine's enumeration, and collapsing those would change what the screen
 * says `wiki-validate` found.
 */
export interface WikiProblemRow {
  /** The row's sentence, from the first finding it stands for. */
  words: WikiProblemWords;
  /** Every place this row stands for, in the validator's order. */
  places: readonly WikiProblemWhere[];
  /** The findings behind it — one, or several that read the same. */
  problems: readonly WikiTemplateProblem[];
}

export function groupWikiProblems(
  problems: ReadonlyArray<WikiTemplateProblem>,
  t: Translate,
  context?: WikiProblemContext,
): WikiProblemRow[] {
  const out: WikiProblemRow[] = [];
  const at = new Map<string, number>();
  for (const problem of problems) {
    const words = describeWikiProblem(problem, t, context);
    // The sentence with its place taken out: two findings that differ only in where they
    // are are one thing to fix in two places. Field by field with a unit separator — the
    // same key discipline `LibraryCheckReport` records, because a page title or a file
    // name can hold any character a folder allows.
    const shape = words.segments
      .map((segment) =>
        segment.kind === "where" ? "␟" : segment.kind === "text" ? segment.text : segment.target.id,
      )
      .join("␟");
    const key = `${problem.code}␟${shape}␟${words.action ?? ""}`;
    const seen = at.get(key);
    if (seen === undefined) {
      at.set(key, out.length);
      out.push({ words, places: words.where ? [words.where] : [], problems: [problem] });
      continue;
    }
    const row = out[seen]!;
    out[seen] = {
      words: row.words,
      places: words.where ? [...row.places, words.where] : row.places,
      problems: [...row.problems, problem],
    };
  }
  return out;
}
