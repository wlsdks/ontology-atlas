import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import gold from "../../../../tests/fixtures/agent-skill-process/gold-v1.json";
import { deriveSkillProcess } from "./process-ir";
import { serializeProcessPacket } from "./process-packet";

type GoldStep = {
  ordinal: number;
  text: string;
  label: null | Record<string, string | number>;
  diagnostic?: string;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value)), "utf8").digest("hex")}`;
}

function textDigest(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

const source = `---
name: gold
description: A source-bound process corpus
---

1. Read references/guide.md.
2. If the guide changed, go to step 4.
3. Retry step 1 until the source is current.
4. Stop the process if the source is missing.
5. Verify the packet by checking its digest; accept when it matches.
6. If needed, continue with review.
7. Check the checksum before handoff.
8. Use the guide and report the result.
`;

describe("skill process gold corpus", () => {
  it("keeps the independently reviewed admitted grammar at precision 100%", () => {
    const derivation = deriveSkillProcess({
      relativePath: gold.sourcePath,
      text: source,
      existingPaths: new Set(["skills/gold/references/guide.md"]),
    });
    expect(derivation.state).toBe("ready");
    if (derivation.state !== "ready") return;

    const steps = derivation.process.steps;
    let admitted = 0;
    let falsePositive = 0;
    let ambiguous = 0;
    for (const expected of gold.steps as GoldStep[]) {
      const actual = steps.find((step) => step.ordinal === expected.ordinal);
      expect(actual?.exactText).toBe(expected.text);
      const label = actual?.semanticLabels[0] as unknown as Record<string, unknown> | undefined;
      if (expected.label) {
        admitted += 1;
        expect(label).toMatchObject(expected.label);
      } else {
        if (label) falsePositive += 1;
        expect(label).toBeUndefined();
      }
      if (expected.diagnostic) {
        ambiguous += 1;
        expect(derivation.process.diagnostics.filter((item) => item.code === expected.diagnostic)).not.toHaveLength(0);
      }
    }
    expect(admitted).toBe(gold.expected.admitted);
    expect(ambiguous).toBe(gold.expected.ambiguous);
    expect(falsePositive).toBe(gold.expected.falsePositive);
    expect(derivation.process.edges).toHaveLength(gold.expected.edges);
    expect(falsePositive / Math.max(admitted, 1)).toBe(0);
  });

  it("lets a source-hidden consumer verify canonical bytes without source text", () => {
    const derivation = deriveSkillProcess({ relativePath: gold.sourcePath, text: source });
    const packet = serializeProcessPacket(derivation);
    expect(packet.state).toBe("ready");
    if (packet.state !== "ready") return;

    const parsed = JSON.parse(new TextDecoder().decode(packet.bytes)) as Record<string, unknown>;
    const packetDigest = parsed.packetDigest;
    delete parsed.packetDigest;
    expect(packetDigest).toBe(digest(parsed));
    expect(parsed.sourceDigest).toBe(textDigest(source));
    expect(parsed).not.toHaveProperty("text");
    expect(JSON.stringify(parsed)).not.toContain("A source-bound process corpus");
    expect(JSON.stringify(parsed)).toContain("Read references/guide.md.");
    expect((parsed.process as Record<string, unknown>).edges).toEqual([]);
  });

  it("keeps the corpus itself source-addressable", () => {
    const fixturePath = resolve(process.cwd(), "tests/fixtures/agent-skill-process/gold-v1.json");
    expect(readFileSync(fixturePath, "utf8")).toContain('"fixture": "agentSkillProcessGold:v1"');
  });
});
