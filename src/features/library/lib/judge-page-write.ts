import { parseFrontmatter } from "@/shared/lib/parse-frontmatter";
import { WIKI_DIR, validateWikiPage } from "@/shared/lib/wiki-page-schema";

import type { WikiTemplateProblem } from "./describe-wiki-problem";

/**
 * Judges a wiki page before the person allows the write, on the text the tool would leave.
 * Not a wiki page or an edit that cannot apply gives `null`: no verdict rather than a guess.
 */

export interface PageWriteVerdict {
  /** Vault-relative `wiki/<slug>.md`. */
  path: string;
  ok: boolean;
  /** Findings with `detail`, so the card can say them in the reader's language. */
  problems: ReadonlyArray<WikiTemplateProblem>;
  status: string | null;
}

/** The three facts of a permission request this judgement reads; the card owns the rest. */
export interface PageWriteRequest {
  filePath: string | null;
  rawInput: Record<string, unknown>;
  toolKind: string | null;
}

export interface JudgePageWriteInput {
  request: PageWriteRequest;
  /** The open folder, absolute. */
  vaultRoot: string;
  /** Page text as it is now, by `wiki/<slug>` slug, for edits. */
  currentText: (slug: string) => string | null;
  /** Every raw source path in the folder, so a citation naming a missing file is reported. */
  knownSources: Iterable<string>;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** `wiki/<slug>.md` when the path is a Markdown file under the vault's wiki folder. */
export function wikiPagePathOf(filePath: string | null, vaultRoot: string): string | null {
  if (!filePath || !vaultRoot) return null;
  const root = vaultRoot.replace(/\/+$/, "");
  if (!filePath.startsWith(`${root}/`)) return null;
  const relative = filePath.slice(root.length + 1);
  if (!relative.startsWith(`${WIKI_DIR}/`) || !relative.endsWith(".md")) return null;
  return relative;
}

/** The page text the tool is asking to leave on disk, or null when it cannot be known. */
export function proposedPageText(
  rawInput: Record<string, unknown>,
  current: string | null,
): string | null {
  const whole = text(rawInput.content);
  if (whole !== null) return whole;
  const oldString = text(rawInput.old_string);
  const newString = text(rawInput.new_string);
  if (oldString === null || newString === null) return null;
  if (current === null) return null;
  if (oldString === "") return current === "" ? newString : null;
  if (!current.includes(oldString)) return null;
  return rawInput.replace_all === true
    ? current.split(oldString).join(newString)
    : current.replace(oldString, newString);
}

export function judgePageWrite({
  request,
  vaultRoot,
  currentText,
  knownSources,
}: JudgePageWriteInput): PageWriteVerdict | null {
  if (request.toolKind === "read") return null;
  const path = wikiPagePathOf(request.filePath, vaultRoot);
  if (!path) return null;
  const slug = path.replace(/\.md$/, "");
  const proposed = proposedPageText(request.rawInput, currentText(slug));
  if (proposed === null) return null;
  const { ok, problems } = validateWikiPage(proposed, { knownSources });
  const status = parseFrontmatter(proposed).frontmatter.status;
  return { path, ok, problems, status: typeof status === "string" ? status.trim() : null };
}
