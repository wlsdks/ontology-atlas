import { describe, expect, it } from "vitest";

import { deriveSkillProcess } from "./process-ir";
import { serializeProcessPacket, verifyProcessPacket } from "./process-packet";
import type { SkillProcessDerivation } from "../model/types";

const raw = `---
name: handoff
description: Hand off an exact process
---

1. Read references/guide.md.
2. Report the source line.
`;

describe("skill process packet", () => {
  it("roundtrips canonical UTF-8 bytes with source and packet digests", () => {
    const process = deriveSkillProcess({
      relativePath: "skills/handoff/SKILL.md",
      text: raw,
      existingPaths: new Set(["skills/handoff/references/guide.md"]),
    });
    const serialized = serializeProcessPacket(process);

    expect(serialized.state).toBe("ready");
    if (serialized.state !== "ready") return;
    expect([...serialized.bytes]).toEqual([...new TextEncoder().encode(serialized.text)]);
    expect(serialized.sourceDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(serialized.packetDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(serializeProcessPacket(process)).toEqual(serialized);

    const verified = verifyProcessPacket(serialized.bytes);
    expect(verified).toMatchObject({
      state: "ready",
      sourceDigest: serialized.sourceDigest,
      packetDigest: serialized.packetDigest,
      process: {
        source: { path: "skills/handoff/SKILL.md" },
        steps: [
          { ordinal: 1, exactText: "Read references/guide.md." },
          { ordinal: 2, exactText: "Report the source line." },
        ],
        resources: [
          {
            path: "skills/handoff/references/guide.md",
            exists: true,
          },
        ],
        edges: [],
      },
    });
  });

  it("distinguishes unavailable input from malformed and digest-tampered packets", () => {
    const process = deriveSkillProcess({
      relativePath: "skills/handoff/SKILL.md",
      text: raw,
      scanTruncated: true,
    });
    expect(serializeProcessPacket(process)).toMatchObject({
      state: "unavailable",
      source: {
        path: "skills/handoff/SKILL.md",
        digest: expect.stringMatching(/^sha256:/),
      },
      diagnostics: [{ code: "process_unavailable" }, { code: "scan_truncated" }],
    });
    expect(verifyProcessPacket(null)).toMatchObject({
      state: "unavailable",
      diagnostics: [{ code: "packet_unavailable" }],
    });
    expect(verifyProcessPacket("not JSON")).toMatchObject({
      state: "tampered",
      diagnostics: [{ code: "packet_malformed" }],
    });

    const ready = serializeProcessPacket(
      deriveSkillProcess({ relativePath: "skills/handoff/SKILL.md", text: raw }),
    );
    expect(ready.state).toBe("ready");
    if (ready.state !== "ready") return;
    expect(verifyProcessPacket(ready.text.replace("Report the source line.", "Skip verification."))).toMatchObject({
      state: "tampered",
      diagnostics: [{ code: "packet_digest_mismatch" }],
    });
    expect(verifyProcessPacket(` ${ready.text}`)).toMatchObject({
      state: "tampered",
      diagnostics: [{ code: "packet_noncanonical" }],
    });

    const sourceMismatch = JSON.parse(ready.text) as Record<string, unknown>;
    sourceMismatch.sourceDigest = `sha256:${"0".repeat(64)}`;
    expect(verifyProcessPacket(JSON.stringify(sourceMismatch))).toMatchObject({
      state: "tampered",
      diagnostics: [{ code: "source_digest_mismatch" }],
    });
  });

  it("refuses inferred transition edges even when a caller forges the TypeScript shape", () => {
    const derived = deriveSkillProcess({
      relativePath: "skills/handoff/SKILL.md",
      text: raw,
    });
    expect(derived.state).toBe("ready");
    if (derived.state !== "ready") return;
    const forged = {
      state: "ready",
      process: {
        ...derived.process,
        edges: [{ from: derived.process.steps[0].stepId, to: derived.process.steps[1].stepId }],
      },
    } as unknown as SkillProcessDerivation;

    expect(serializeProcessPacket(forged)).toMatchObject({
      state: "unavailable",
      diagnostics: [{ code: "process_invalid" }],
    });
  });

  it("preserves exact semantic labels in the canonical source-hidden packet", () => {
    const derived = deriveSkillProcess({
      relativePath: "skills/handoff/SKILL.md",
      text: raw.replace(
        "1. Read references/guide.md.",
        "1. If the guide changed, go to step 2.",
      ),
    });
    const packet = serializeProcessPacket(derived);
    expect(packet.state).toBe("ready");
    if (packet.state !== "ready") return;
    const verified = verifyProcessPacket(packet.bytes);
    expect(verified.state).toBe("ready");
    if (verified.state !== "ready") return;
    expect(verified.process.steps[0].semanticLabels).toEqual([
      {
        kind: "branch",
        guard: "the guide changed",
        targetOrdinal: 2,
        sourceSpan: verified.process.steps[0].sourceSpan,
        sourceDigest: verified.sourceDigest,
      },
    ]);
    expect(verified.process.edges).toEqual([]);
  });

  it("keeps source-hidden packets portable without leaking unneeded source text", () => {
    const source = `---
name: handoff
description: INTERNAL_TRIGGER_DESCRIPTION_MUST_NOT_BE_HANDOFF_DATA
---

Private implementation notes must stay in the source folder.

1. Read the current source.
2. Report the source line.

Do not include this trailing source-only note.
`;
    const derived = deriveSkillProcess({
      relativePath: "skills/handoff/SKILL.md",
      text: source,
    });
    const packet = serializeProcessPacket(derived);

    expect(packet.state).toBe("ready");
    if (packet.state !== "ready") return;
    // K1.3 carries the exact process projection, not SKILL.md/frontmatter or
    // bundled-file contents. The source is recoverable only through its digest.
    expect(packet.text).not.toContain("INTERNAL_TRIGGER_DESCRIPTION_MUST_NOT_BE_HANDOFF_DATA");
    expect(packet.text).not.toContain("Private implementation notes must stay in the source folder.");
    expect(packet.text).not.toContain("Do not include this trailing source-only note.");
    expect(packet.text).toContain('"path":"skills/handoff/SKILL.md"');
    expect(packet.text).toContain('"exactText":"Read the current source."');
    expect(packet.text).toContain('"exactText":"Report the source line."');

    const verified = verifyProcessPacket(packet.bytes);
    expect(verified).toMatchObject({
      state: "ready",
      process: {
        steps: [
          { exactText: "Read the current source." },
          { exactText: "Report the source line." },
        ],
      },
    });
  });

  it("refuses a shape-valid semantic label that the exact source grammar did not derive", () => {
    const derived = deriveSkillProcess({
      relativePath: "skills/handoff/SKILL.md",
      text: raw,
    });
    expect(derived.state).toBe("ready");
    if (derived.state !== "ready") return;
    const first = derived.process.steps[0];
    const forged = {
      state: "ready",
      process: {
        ...derived.process,
        steps: [
          {
            ...first,
            semanticLabels: [
              {
                kind: "branch",
                guard: "the guide changed",
                targetOrdinal: 2,
                sourceSpan: first.sourceSpan,
                sourceDigest: derived.process.source.digest,
              },
            ],
          },
          derived.process.steps[1],
        ],
      },
    } as unknown as SkillProcessDerivation;

    expect(serializeProcessPacket(forged)).toMatchObject({
      state: "unavailable",
      diagnostics: [{ code: "process_invalid" }],
    });
  });
});
