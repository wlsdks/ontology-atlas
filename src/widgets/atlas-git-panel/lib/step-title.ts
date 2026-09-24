/**
 * How a step names itself to a person.
 *
 * A commit subject written for `git log` opens with a conventional-commit type
 * (`feat:`, `docs(api):`). That prefix is a filing code for tooling; read as the
 * headline of a step it put `feat: record the settlement boundary` where a person
 * looks for what changed (review 2026-09-25). The screen drops the code and keeps
 * the sentence. Only the known types are stripped, so a subject that merely starts
 * with a word and a colon ("Note: …") stays as its author wrote it.
 */
const CONVENTIONAL_PREFIX =
  /^(?:feat|fix|docs|refactor|chore|test|style|perf|design|build|ci|revert)(?:\([^)]*\))?!?:\s+(\S.*)$/i;

export function stripConventionalPrefix(subject: string): string {
  const match = CONVENTIONAL_PREFIX.exec(subject.trim());
  return match ? match[1] : subject;
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
