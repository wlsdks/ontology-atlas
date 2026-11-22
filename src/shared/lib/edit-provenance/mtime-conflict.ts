/**
 * The single decision behind the expected_mtime conflict badge, asked quietly before a save: does the
 * baseline from when this document was opened differ from what is known now, and is the difference
 * explained by my own recent write (`assertExpectedMtime` asks the same of `patch_concept`,
 * `updateFrontmatter` and `saveDoc`)? True only when they differ and a self write does not explain it,
 * so time merely passing never turns it on. Callers that snapshot the self-write record at open time
 * pass `baselineSelfEditAtMs`.
 * `baseline`/`current` accept a `doc.mtime` number or a vault-doc freshness ISO string
 * (`docFreshnessIndex`): docs and the topology panel use different representations of one fact.
 */
export function hasUnaccountedMtimeChange(params: {
  baseline: number | string | null | undefined;
  current: number | string | null | undefined;
  /** This session's own recorded write to the document/node (`markSelfWrite`);
   *  undefined/null when there is no such evidence. */
  selfEditAtMs: number | null | undefined;
  /** The self-write record present when the baseline was captured. A different
   *  current record proves that this session wrote after open. */
  baselineSelfEditAtMs?: number | null;
  baselineCapturedAtMs?: number;
}): boolean {
  const {
    baseline,
    current,
    selfEditAtMs,
    baselineSelfEditAtMs,
    baselineCapturedAtMs,
  } = params;
  if (baseline == null || current == null) return false;
  if (baseline === current) return false;
  if (baselineSelfEditAtMs !== undefined) {
    if (typeof selfEditAtMs === "number" && selfEditAtMs !== baselineSelfEditAtMs) return false;
  } else if (
    typeof selfEditAtMs === "number" &&
    typeof baselineCapturedAtMs === "number" &&
    selfEditAtMs >= baselineCapturedAtMs
  ) {
    return false;
  }
  return true;
}
