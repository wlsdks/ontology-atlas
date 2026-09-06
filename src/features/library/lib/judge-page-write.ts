import { WIKI_DIR, validateWikiPage } from "@/shared/lib/wiki-page-schema";

/**
 * Judge a wiki page **before** the person allows the write.
 *
 * The Compile brief used to say a page that fails `wiki-validate` "will be rejected", and
 * nothing rejected it: the page landed, and the Wiki list showed its first problem code
 * afterwards (accumulation probe, 2026-09-06). The permission card is the one moment the
 * person decides, and it is where the verdict belongs: Allow with the codes in view, or
 * Don't. Two of the six implementations surveyed the same day put the rule as "committed
 * pages are always clean"; this is that rule at the gate this product already has, with
 * the person still deciding.
 *
 * What is judged is what the tool actually asked to write. A whole-file write carries the
 * text; an edit carries `old_string` and `new_string`, which are applied to the page as it
 * is on disk. When the request is not a wiki page, or the edit cannot be applied to the
 * text we hold, the answer is `null` — no verdict rather than a guess, because a verdict
 * on the wrong text would be worse than none.
 */

export interface PageWriteVerdict {
  /** Vault-relative `wiki/<slug>.md`. */
  path: string;
  ok: boolean;
  problems: ReadonlyArray<{ code: string; message: string; line?: number }>;
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
  return { path, ok, problems };
}
