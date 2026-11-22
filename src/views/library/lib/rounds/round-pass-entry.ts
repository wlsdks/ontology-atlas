import type { RoundPassEntry, RoundRecord, RoundUndone } from "@/entities/library-round";
import { pageIdentity, passLedgerFacts } from "@/features/library-rounds";

export type PassEntryStart = Pick<
  RoundPassEntry,
  "v" | "id" | "roundId" | "roundName" | "kind" | "startedAt" | "places" | "trigger"
>;

interface FinishedPassFacts {
  round: RoundRecord;
  start: PassEntryStart;
  endedAt: Date;
  check: Parameters<typeof passLedgerFacts>[0]["check"];
  refreshed: number;
  failed: boolean;
  written: readonly string[];
  refused: string[];
  called: string[];
  agentTurns: 0 | 1;
  answer: string | null;
  undone: RoundUndone[];
  leftAsIs: string[];
  stoppedByPerson: boolean;
  note: RoundPassEntry["note"];
}

/** A page the pass restored or removed is not one it wrote, so it is left out of `written`. */
export function buildFinishedPassEntry(facts: FinishedPassFacts): RoundPassEntry {
  const putBack = new Set(
    facts.undone.filter((item) => item.action === "restored" || item.action === "removed").map((item) => pageIdentity(item.path)),
  );
  const kept = facts.written.filter((path) => !putBack.has(pageIdentity(path)));
  const { outcome, checked, stale } = passLedgerFacts({
    kind: facts.round.kind,
    check: facts.check,
    refreshed: facts.refreshed,
    failed: facts.failed || facts.undone.length > 0,
    written: kept,
    refused: facts.refused,
  });
  const entry: RoundPassEntry = {
    ...facts.start,
    endedAt: facts.endedAt.toISOString(),
    outcome,
    checked,
    stale,
    written: kept,
    refused: facts.refused,
    called: facts.called,
    agentTurns: facts.agentTurns,
    summary: facts.round.kind === "ontology" && !facts.failed ? facts.answer ?? "" : "",
  };
  if (facts.undone.length > 0) entry.undone = facts.undone;
  if (facts.leftAsIs.length > 0) entry.leftAsIs = facts.leftAsIs;
  if (facts.stoppedByPerson) entry.note = "stopped";
  else if (facts.note) entry.note = facts.note;
  return entry;
}

export function buildFailedPassEntry(input: {
  start: PassEntryStart;
  endedAt: Date;
  error: unknown;
  stoppedByPerson: boolean;
}): RoundPassEntry {
  const entry: RoundPassEntry = {
    ...input.start,
    endedAt: input.endedAt.toISOString(),
    outcome: "failed",
    checked: 0,
    stale: [],
    written: [],
    refused: [],
    called: [],
    agentTurns: 0,
    summary: input.error instanceof Error ? input.error.message : String(input.error),
  };
  if (input.stoppedByPerson) entry.note = "stopped";
  return entry;
}

/** The wiki log line for a pass that revised pages, or null when it wrote none. */
export function buildRevisedPagesLogLine(
  round: RoundRecord,
  entry: RoundPassEntry,
): { at: string; kind: "compile"; summary: string; writer: string } | null {
  const pages = entry.written.filter((path) => path.startsWith("wiki/")).map((path) => path.replace(/^wiki\//, "").replace(/\.md$/, ""));
  if (pages.length === 0) return null;
  const sources = round.kind === "consistency" ? entry.stale.map((slug) => slug.replace(/^wiki\//, "")).join(", ") : (round.connectorName ?? round.name);
  return {
    at: entry.endedAt,
    kind: "compile",
    summary: `${sources} → ${pages.map((page) => `${page} (revised)`).join(", ")}`,
    writer: `round:${round.name}`,
  };
}
