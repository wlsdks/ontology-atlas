/**
 * Only the row just written gets the settle motion, showing where the commit landed;
 * settling every row would re-animate existing history and hide what just happened.
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

export function stepRowUsesStagger(
  commitHash: string,
  settledHash: string | null | undefined,
): boolean {
  return stepRowMotionClass(commitHash, settledHash) === "git-fade-in";
}
