import { roundFingerprint, type RoundRecord } from "@/entities/library-round";
import type { MachineApprovals } from "@/shared/lib/connectors/machine-approvals";

const NO_IDS: ReadonlySet<string> = new Set();

/**
 * Rounds this Mac has not allowed as they stand now, and the subset that was allowed before
 * their definition changed. An empty result is the shared `NO_IDS` set, so it keeps its identity.
 */
export function unallowedRoundIds(
  rounds: readonly RoundRecord[],
  approvals: Pick<MachineApprovals, "approves" | "allowed">,
  rootPath: string | null,
): { notAllowedHere: ReadonlySet<string>; changedSinceAllowed: ReadonlySet<string> } {
  const notAllowed = rounds
    .filter((round) => !approvals.approves("round", rootPath, round.id, roundFingerprint(round)))
    .map((round) => round.id);
  const changed = notAllowed.filter((id) => approvals.allowed("round", rootPath, id) !== null);
  return {
    notAllowedHere: notAllowed.length > 0 ? new Set(notAllowed) : NO_IDS,
    changedSinceAllowed: changed.length > 0 ? new Set(changed) : NO_IDS,
  };
}
