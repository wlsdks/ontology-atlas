import { describe, expect, it } from "vitest";

import { roundFingerprint, type RoundRecord } from "@/entities/library-round";

import { unallowedRoundIds } from "./round-allowance";

const round = (id: string, query: string): RoundRecord =>
  ({ id, name: id, kind: "ontology", cadence: { every: "hour" }, enabled: true, createdAt: "2026-11-01T00:00:00.000Z", nextDueAt: "2026-11-22T00:00:00.000Z", query }) as RoundRecord;

function approvalsFor(allowedFingerprints: Record<string, string>) {
  return {
    allowed: (_subject: string, _folder: string | null, id: string) => allowedFingerprints[id] ?? null,
    approves: (_subject: string, _folder: string | null, id: string, fingerprint: string) => allowedFingerprints[id] === fingerprint,
  } as never;
}

describe("unallowedRoundIds", () => {
  it("separates a round never allowed from one allowed before its definition changed", () => {
    const fresh = round("fresh", "a");
    const edited = round("edited", "new query");
    const allowedAsIs = round("ok", "a");
    const approvals = approvalsFor({
      edited: roundFingerprint(round("edited", "old query")),
      ok: roundFingerprint(allowedAsIs),
    });
    const { notAllowedHere, changedSinceAllowed } = unallowedRoundIds([fresh, edited, allowedAsIs], approvals, "/vault");
    expect([...notAllowedHere]).toEqual(["fresh", "edited"]);
    expect([...changedSinceAllowed]).toEqual(["edited"]);
  });

  it("returns one shared empty set while every round is allowed", () => {
    const only = round("ok", "a");
    const approvals = approvalsFor({ ok: roundFingerprint(only) });
    const first = unallowedRoundIds([only], approvals, "/vault");
    const second = unallowedRoundIds([], approvals, "/vault");
    expect(first.notAllowedHere.size).toBe(0);
    expect(first.notAllowedHere).toBe(second.notAllowedHere);
    expect(first.changedSinceAllowed).toBe(second.changedSinceAllowed);
  });
});
