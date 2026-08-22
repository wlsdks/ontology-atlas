/**
 * Which motion a past-step row gets — **only the row just written receives the
 * settle signature**.
 *
 * Motion audit, 2026-07-28: a commit is the largest confirmation on this
 * surface, and `--motion-settle` was used 0 times. Pressing commit hard-swapped
 * five surfaces at once and brought the single result row in on a 120ms fade —
 * you could tell something was written, but nothing showed **where it landed**.
 *
 * The rule is a named function because it is one ternary that **fails in a known
 * direction**: giving every row the settle re-births history that was already
 * there, which blurs the very fact of what just happened.
 */
export type StepRowMotionClass = "git-commit-settle" | "git-fade-in";

export function stepRowMotionClass(
  commitHash: string,
  settledHash: string | null | undefined,
): StepRowMotionClass {
  return settledHash != null && commitHash === settledHash
    ? "git-commit-settle"
    : "git-fade-in";
}

/** A settled row does not stagger — a one-row event has no order. */
export function stepRowUsesStagger(
  commitHash: string,
  settledHash: string | null | undefined,
): boolean {
  return stepRowMotionClass(commitHash, settledHash) === "git-fade-in";
}
