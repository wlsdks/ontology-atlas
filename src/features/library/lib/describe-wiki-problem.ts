import type { useTranslations } from "next-intl";

/**
 * One finding retold for a person, in pieces a surface can place: its `sentence`,
 * its `action`, `where`, `targets`, `segments` (names pressable in place) and `code`.
 * The English message in `problem.message` stays the machine copy the CLI and MCP print.
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

/** A named thing a person can open: `name` is what they read, `id` is what the surface opens. */
export interface WikiProblemTarget {
  kind: "page" | "source";
  name: string;
  id: string;
}

/** The place in the page, said the way a person would say it. */
export interface WikiProblemWhere {
  /** "line 31 under Facts" — already localised, never `uncited-fact:31`. */
  label: string;
  /** The place without its section, for the second and later place in one row. */
  lineLabel?: string;
  /** The section the line sits under, when the finding's code fixes one. */
  section?: string;
  line?: number;
}

/** A sentence in order: text, a name to press, or the place to press. */
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
   * The `full` place names the line; `section` serves the check report, which collapses identical
   * findings into one row whose door carries every line.
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

/** The validator wraps paths in Markdown backticks; a person is not reading Markdown. */
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

/** Catalogue names that are absent files; a door is built only for a thing that is there. */
const MISSING_PATH_KEYS = new Set([
  // The citation names a file the folder walk did not find — that is the finding.
  "citation-target-missing-folder",
  // Recorded as partly read but not among the page's originals, so nothing here says the
  // folder holds it either.
  "bad-truncation-record-path",
]);

/**
 * What each placeholder stands for. `target` and a missing-file `path` name things that do
 * not exist, so they are names, never doors; the rest is text nobody can press.
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
 * Split a raw retelling on its placeholders. `t.raw`, not `t`, so a title is never re-found in
 * prose by substring; `icu-message-tags.contract.test.ts` keeps the placeholders simple.
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

/** The finding in the reader's language; every surface calls this so all read one sentence. */
export function describeWikiProblem(
  problem: WikiTemplateProblem,
  t: Translate,
  context?: WikiProblemContext,
): WikiProblemWords {
  const place = context?.place ?? "full";
  const key = problem.detail?.key;
  const what = key ? (`wiki.problem.${key}.what` as ProblemPath) : null;
  // `t.has`, not a key table: a key the validator adds first shows its English message, not a raw path.
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

/** Code, anchor and English message, deliberately not localised so it matches the CLI and MCP. */
export function wikiProblemMachineLine(problem: WikiTemplateProblem): string {
  return `${problem.code}${problem.line ? `:${problem.line}` : ""} — ${problem.message}`;
}

/**
 * One row per thing a person fixes: identical findings merge and keep each place in the
 * sentence. The technical disclosure still lists every finding separately, as `wiki-validate`
 * reports them.
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
    // Findings that differ only in place are one fix. Unit-separated fields, because a title
    // or file name can hold any character a folder allows.
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
