import { WIKI_DIR } from "@/shared/lib/wiki-page-schema";
import { parseLintCounts } from "./lint-brief";

/**
 * The file `wiki/_log.md` records events the app itself witnessed (Compile, Lint), one parseable line each,
 * append-only. Provenance of the process, never content. The leading underscore keeps it out
 * of the wiki's pages.
 */

const WIKI_LOG_FILENAME = "_log.md";

type WikiLogKind = "compile" | "lint" | "fix";

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

const ENTRY = /^## \[([^\]]+)\] (compile|lint|fix) \| (.*) \| ([^|]+)$/;

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

/** The compile line, judged from the folder before and after, never from what the agent said. */
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

/** The lint line with the report's counts when present; the writer is named because they are the agent's. */
export function describeLintTurn(finalText: string | null): string {
  const text = finalText ?? "";
  // The JSON block is language-neutral; the prose count line is the fallback.
  const fromBlock = parseLintCounts(text);
  if (fromBlock) {
    return [
      `disagreement ${fromBlock.disagreement}`,
      `superseded ${fromBlock.superseded}`,
      `missing-link ${fromBlock.missingLink}`,
      `name-without-page ${fromBlock.nameWithoutPage}`,
    ].join(" · ");
  }
  const pick = (label: RegExp) => {
    const match = label.exec(text);
    return match ? Number(match[1]) : null;
  };
  // Each count is read under its English or Korean label; the summary keeps the English keys.
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

/** Appends one entry, rewriting the small file whole, since a partial stream append tears a line. */
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
