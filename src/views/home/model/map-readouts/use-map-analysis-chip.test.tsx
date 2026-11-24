import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mapAnalysisRecordFromText } from "@/shared/lib/vault-document/map-analysis-record";
import { useMapAnalysisChip } from "./use-map-analysis-chip";

const START_MS = Date.parse("2026-11-24T09:00:00.000Z");

const line = (atMs: number, added: number) =>
  JSON.stringify({
    v: 1,
    analysis: "terminal-session",
    number: 2,
    session: "s1",
    origin: "session",
    startedAt: new Date(atMs - 60_000).toISOString(),
    at: new Date(atMs).toISOString(),
    agent: "claude-code",
    sourceCommit: null,
    sourceDirty: null,
    abilities: { total: 100, offMap: 38 },
    areas: { total: 9, notMapped: 3 },
    concepts: { added, changed: 0, removed: 0 },
  });

/** The folder as the vault hook hands it over after a reread: the record read at the clock of that moment. */
const vaultWith = (text: string) => ({
  status: "loaded" as const,
  manifest: { docs: [{ slug: "storefront", frontmatter: { kind: "project" }, notMappedAreas: null }] },
  mapAnalysisRecord: mapAnalysisRecordFromText(text),
});
type Vault = Parameters<typeof useMapAnalysisChip>[0];

describe("the map analysis chip as an agent's lines arrive", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START_MS);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders each arriving line against the time it was read, never a frame as settled", () => {
    const painted: string[] = [];
    let text = `${line(START_MS - 1_000, 1)}\n`;
    const { rerender } = renderHook(
      ({ vault }) => {
        const model = useMapAnalysisChip(vault as unknown as Vault, null);
        painted.push(model?.pill.kind ?? "none");
        return model;
      },
      { initialProps: { vault: vaultWith(text) } },
    );
    for (let write = 2; write <= 4; write += 1) {
      vi.setSystemTime(Date.now() + 120);
      text += `${line(Date.now(), write)}\n`;
      rerender({ vault: vaultWith(text) });
    }
    expect(painted.every((kind) => kind === "running"), `painted ${painted.join(", ")}`).toBe(true);
  });
});
