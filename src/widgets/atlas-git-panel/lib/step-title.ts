import { describeSnapshotSubject } from "@/shared/lib/atlas-git-record";
import type { Translator } from "./translator";

/**
 * A step's headline drops a conventional-commit type (`feat:`, `docs(api):`), a filing code
 * for tooling. Only known types are stripped, so "Note: …" stays as its author wrote it.
 */
const CONVENTIONAL_PREFIX =
  /^(?:feat|fix|docs|refactor|chore|test|style|perf|design|build|ci|revert)(?:\([^)]*\))?!?:\s+(\S.*)$/i;

export function stripConventionalPrefix(subject: string): string {
  const match = CONVENTIONAL_PREFIX.exec(subject.trim());
  return match ? capitalizeFirst(match[1]) : subject;
}

/**
 * Only called on a stripped subject, whose lower-case start would read as a clipped string;
 * a subject written without the code keeps its casing. Caseless scripts pass through.
 */
function capitalizeFirst(sentence: string): string {
  const first = sentence.charAt(0);
  const upper = first.toLocaleUpperCase("en");
  return upper === first ? sentence : upper + sentence.slice(1);
}

/** The first few files a step touched, by name — the row's reason when no concept matched. */
export function stepFileNames(
  files: readonly { path: string }[] | undefined,
  more: (count: number) => string,
  limit = 2,
): string {
  if (!files || files.length === 0) return "";
  const names = files.slice(0, limit).map((file) => (file.path.split("/").pop() ?? file.path).replace(/\.md$/i, ""));
  const rest = files.length - names.length;
  return rest > 0 ? `${names.join(", ")} ${more(rest)}` : names.join(", ");
}

/** The first seven characters of a hash — what people read, paste and compare. */
export function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

/**
 * The human wording of a step's subject: an automatic `ontology snapshot: …` subject becomes
 * counts in the reader's language, and a subject a person wrote stays as written. `null`
 * means the subject is already human language.
 */
export function humanizeStepSubject(t: Translator, subject: string): string | null {
  const summary = describeSnapshotSubject(subject);
  if (!summary.matched) return null;
  const parts = [
    summary.added > 0 ? t("statusAdded", { count: summary.added }) : null,
    summary.updated > 0 ? t("statusModified", { count: summary.updated }) : null,
    summary.renamed > 0 ? t("statusRenamed", { count: summary.renamed }) : null,
    summary.removed > 0 ? t("statusDeleted", { count: summary.removed }) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : t("stepNoConcepts");
}
