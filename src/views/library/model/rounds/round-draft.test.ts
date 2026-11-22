import { describe, expect, it } from "vitest";

import type { RoundRecord } from "@/entities/library-round";

import { initialRoundDraft, placesOfDraft, roundRecordOf, type ServiceDraft } from "./round-draft";

const draft = (over: Partial<ServiceDraft> = {}): ServiceDraft => ({ key: "k", connectorId: "c1", connectorName: "slack", location: "", query: "", ...over });

describe("initialRoundDraft", () => {
  it("opens a new round on every hour over the whole folder", () => {
    const start = initialRoundDraft(null);
    expect(start).toMatchObject({ unit: "hours", minutes: 60, daily: null, services: [] });
  });
});

describe("placesOfDraft", () => {
  it("puts the folder first and keeps only the service fields that are filled in", () => {
    const places = placesOfDraft(["wiki"], true, [draft({ location: " #launch ", query: "  " })]);
    expect(places).toEqual([
      { kind: "vault", paths: ["wiki"], ownDocumentsOnly: true },
      { kind: "service", connectorId: "c1", connectorName: "slack", location: "#launch" },
    ]);
  });

  it("leaves ownDocumentsOnly off the folder when it is not asked for", () => {
    expect(placesOfDraft([], false, [])).toEqual([{ kind: "vault", paths: [] }]);
  });
});

describe("roundRecordOf", () => {
  const now = new Date("2026-11-22T10:00:00Z");
  const base = { name: " Weekly ", kind: "service" as const, cadence: { daily: "09:00", weekdaysOnly: false }, onStale: "mark" as const, now };

  it("takes the first service as the round's connector and trims the name", () => {
    const record = roundRecordOf({ ...base, round: null, places: [], services: [draft({ query: " q " })], limit: 20 });
    expect(record).toMatchObject({ name: "Weekly", connectorId: "c1", connectorName: "slack", query: "q", limit: 20, enabled: true, onStale: "mark" });
    expect(record.createdAt).toBe(now.toISOString());
  });

  it("keeps an edited round's identity, creation time, enabled state and last pass", () => {
    const round = { id: "r1", enabled: false, createdAt: "2026-01-01T00:00:00.000Z", lastPassAt: "2026-02-02T00:00:00.000Z" } as unknown as RoundRecord;
    const record = roundRecordOf({ ...base, round, kind: "consistency", places: [], services: [], limit: undefined });
    expect(record).toMatchObject({ id: "r1", enabled: false, createdAt: round.createdAt, lastPassAt: round.lastPassAt });
    expect(record.connectorId).toBeUndefined();
  });
});
