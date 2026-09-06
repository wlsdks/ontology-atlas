import { WIKI_DIR } from "@/shared/lib/wiki-page-schema";

/**
 * `wiki/_log.md` — **what happened to the wiki, written by the app, never by the agent.**
 *
 * The LLM Wiki pattern keeps a `log.md` the model appends to. Ours is different on purpose:
 * a person who does not commit their folder has no Git history, and a person who does
 * still gets diffs rather than "Lint found three disagreements". So the app records the
 * events it witnessed itself — a Compile turn and which pages it left new or revised, a
 * Lint run and its counts — one line each, append-only, in the folder, in Markdown a
 * person reads in any editor. It is provenance of the process, not a second copy of any
 * content: nothing here says what a page claims, only that it changed and when.
 *
 * The shape is parseable on purpose (the pattern's one tip worth keeping):
 *
 *   ## [2026-09-06T18:05:12Z] compile | sources/ops-runbook.pdf → runbook (new), architecture (revised) | agent:claude
 *
 * `grep "^## \[" wiki/_log.md | tail -5` is the last five events. The leading underscore
 * is the furniture rule: not a page, not judged, not listed, not linked.
 */

const WIKI_LOG_FILENAME = "_log.md";

type WikiLogKind = "compile" | "lint";

export interface WikiLogEntry {
  /** ISO-8601, UTC. */
  at: string;
  kind: WikiLogKind;
  /** One line, no newlines; the `|` and `→` inside are prose, not fields. */
  summary: string;
  /** `agent:<runtime>`, `model:<name>`, or `human`. */
  writer: string;
}

const HEADER = [
  "# Wiki log",
  "",
  "Written by Ontology Atlas after each Compile and Check-the-wiki run. Append-only; one line",
  "per event; the app writes it and nothing else should. Not a page.",
  "",
  "",
].join("\n");

const ENTRY = /^## \[([^\]]+)\] (compile|lint) \| (.*) \| ([^|]+)$/;

export function formatWikiLogEntry(entry: WikiLogEntry): string {
  const summary = entry.summary.replace(/\s+/g, " ").trim();
  return `## [${entry.at}] ${entry.kind} | ${summary} | ${entry.writer.trim()}`;
}

/** Entries in file order; lines that are not entries are skipped, never an error. */
export function parseWikiLog(text: string): WikiLogEntry[] {
  const out: WikiLogEntry[] = [];
  for (const line of String(text ?? "").split("\n")) {
    const match = ENTRY.exec(line.trim());
    if (!match) continue;
    out.push({ at: match[1]!, kind: match[2] as WikiLogKind, summary: match[3]!, writer: match[4]!.trim() });
  }
  return out;
}

/**
 * The compile line: which sources the turn was asked to read, and what it left behind,
 * judged from the folder itself — slugs present after that were not before are new, slugs
 * whose bytes changed are revised. Nothing the agent said is trusted for this.
 */
export function describeCompileTurn(input: {
  sources: readonly string[];
  before: ReadonlyMap<string, number>;
  after: ReadonlyMap<string, number>;
}): string {
  const created: string[] = [];
  const revised: string[] = [];
  for (const [slug, mtime] of input.after) {
    const prior = input.before.get(slug);
    if (prior === undefined) created.push(slug);
    else if (prior !== mtime) revised.push(slug);
  }
  const short = (slug: string) => slug.replace(new RegExp(`^${WIKI_DIR}/`), "");
  const parts: string[] = [];
  if (created.length > 0) parts.push(`${created.map(short).sort().join(", ")} (new)`);
  if (revised.length > 0) parts.push(`${revised.map(short).sort().join(", ")} (revised)`);
  const left = parts.length > 0 ? parts.join(", ") : "no page changed";
  return `${input.sources.join(", ")} → ${left}`;
}

/**
 * The lint line: the counts the report ends with, when the agent's last message carries
 * them in the brief's own shape; otherwise just that it ran. The counts are the agent's
 * words, so the line says so by naming the writer.
 */
export function describeLintTurn(finalText: string | null): string {
  const text = finalText ?? "";
  const pick = (label: RegExp) => {
    const match = label.exec(text);
    return match ? Number(match[1]) : null;
  };
  // The report is written in the screen's language (the brief is localized), so each
  // count is read under its English or Korean label; the summary keeps the English keys,
  // which the Library translates back when it draws the line (installed app, 2026-09-07:
  // a Korean report ended with the localized count line and the log said "counts not stated").
  const counts = [
    ["disagreement", pick(/(?:Disagreement|어긋남)[^\d\n]*?(\d+)/i)],
    ["superseded", pick(/(?:Superseded|대체된 주장)[^\d\n]*?(\d+)/i)],
    ["missing-link", pick(/(?:Missing (?:cross-reference|link)|빠진 연결)[^\d\n]*?(\d+)/i)],
    ["name-without-page", pick(/(?:(?:Concept|Name) without a page|문서 없는 이름)[^\d\n]*?(\d+)/i)],
  ] as const;
  const known = counts.filter(([, n]) => n !== null);
  if (known.length === 0) return "ran; counts not stated";
  return known.map(([name, n]) => `${name} ${n}`).join(" · ");
}

/**
 * Append one entry to `wiki/_log.md`, creating the folder and the file with its header on
 * first use. Reads then writes the whole file: the file is small by construction (one line
 * per run), and a partial append through a writable stream is what leaves a torn line.
 */
export async function appendWikiLog(
  vault: FileSystemDirectoryHandle,
  entry: WikiLogEntry,
): Promise<void> {
  const dir = await vault.getDirectoryHandle(WIKI_DIR, { create: true });
  const file = await dir.getFileHandle(WIKI_LOG_FILENAME, { create: true });
  let current = "";
  try {
    current = await (await file.getFile()).text();
  } catch {
    // A just-created file has nothing yet.
  }
  const trimmed = current.replace(/\s+$/, "");
  // Entries sit on consecutive lines so `grep "^## \["` reads them; only the header keeps
  // one blank line before the first entry.
  const body = trimmed === "" ? HEADER : trimmed + (ENTRY.test(trimmed.split("\n").at(-1) ?? "") ? "\n" : "\n\n");
  const next = `${body}${formatWikiLogEntry(entry)}\n`;
  const writable = await file.createWritable();
  await writable.write(next);
  await writable.close();
}
