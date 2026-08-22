/**
 * The single decision behind the expected_mtime conflict badge. It asks, quietly and
 * *before* a save, the same question as the expected_mtime contract already used by
 * `patch_concept` / `updateFrontmatter` / `saveDoc` (`assertExpectedMtime`,
 * `use-local-vault.ts`): does the baseline from when I opened this document differ
 * from what is known now, and is that difference explained by my own recent write?
 * True only when the two differ *and* the difference is not explained by a self
 * write. With no real mismatch — time merely passing, say — it never turns on. No
 * signal inflation.
 *
 * `baseline`/`current` accept either a `doc.mtime` number or a vault-doc freshness
 * ISO string (`docFreshnessIndex`): the two surfaces (docs vs the topology panel) use
 * different representations, but "was the same / has changed" means the same thing in
 * both, so they share one decision function.
 */
export function hasUnaccountedMtimeChange(params: {
  baseline: number | string | null | undefined;
  current: number | string | null | undefined;
  /** This session's own recorded write to the document/node (`markSelfWrite`);
   *  undefined/null when there is no such evidence. */
  selfEditAtMs: number | null | undefined;
  /** When the baseline was captured (ms). Only self writes after that count as explaining the difference. */
  baselineCapturedAtMs: number;
}): boolean {
  const { baseline, current, selfEditAtMs, baselineCapturedAtMs } = params;
  if (baseline == null || current == null) return false;
  if (baseline === current) return false;
  if (typeof selfEditAtMs === "number" && selfEditAtMs >= baselineCapturedAtMs) return false;
  return true;
}
