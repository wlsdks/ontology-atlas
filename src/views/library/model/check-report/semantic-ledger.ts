import { isMapKind, type LintFinding, type LintNodeCandidate } from "@/features/library";

import { FINDING_ORDER } from "./check-report-outline";

/** Names past this many fold behind a count; the map kinds come first. */
export const CANDIDATE_FOLD = 5;

/** The agent's findings grouped by kind in the report's order, leaving out kinds with no finding. */
export function groupFindings(findings: readonly LintFinding[]): Array<{ code: LintFinding["code"]; rows: LintFinding[] }> {
  return FINDING_ORDER.map((code) => ({
    code,
    rows: findings.filter((finding) => finding.code === code),
  })).filter((group) => group.rows.length > 0);
}

/** Candidate names with the map kinds first, each side keeping the agent's order. */
export function orderCandidates(candidates: readonly LintNodeCandidate[]): LintNodeCandidate[] {
  return [...candidates].sort((a, b) => Number(isMapKind(b.kind)) - Number(isMapKind(a.kind)));
}

/** The names drawn, and how many hide behind the fold count. */
export function foldCandidates(
  ordered: readonly LintNodeCandidate[],
  open: boolean,
): { shown: readonly LintNodeCandidate[]; folded: number } {
  const shown = open ? ordered : ordered.slice(0, CANDIDATE_FOLD);
  return { shown, folded: ordered.length - shown.length };
}

/**
 * Whether the last recorded check reported anything: findings do not survive a reopened app but
 * the counts in the wiki log do, so a non-zero digit in the log line means findings existed.
 */
export function lastCheckFoundSomething(lastLint: { summary: string } | null): boolean {
  return !!lastLint && /(?:^|\D)[1-9]\d*/.test(lastLint.summary);
}

/** The log's ISO stamp as a person reads it; the raw stamp when it does not parse. */
export function logWhen(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
