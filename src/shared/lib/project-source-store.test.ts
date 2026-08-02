import { describe, expect, it } from "vitest";

import {
  buildProjectSourceReceipt,
  type ProjectSourceBinding,
  type ProjectSourceReceipt,
} from "./project-source-receipt";
import { createMemoryProjectSourceStore } from "./project-source-store";

const pendingBinding = (
  overrides: Partial<Omit<ProjectSourceBinding, "receipt">> = {},
): Omit<ProjectSourceBinding, "receipt"> => ({
  projectSlug: "music-streaming",
  sourceId: "source-next",
  rootPath: "/private/work/music-next",
  kind: "git",
  boundAt: "2026-08-02T12:00:00.000Z",
  ...overrides,
});

const receiptFor = (
  binding: Omit<ProjectSourceBinding, "receipt">,
): ProjectSourceReceipt =>
  buildProjectSourceReceipt({
    projectSlug: binding.projectSlug,
    graphHash: "graph-a",
    probe: {
      sourceId: binding.sourceId,
      kind: binding.kind,
      revision: "abc123",
      fingerprint: "git:abc123:clean",
      dirty: false,
      truncated: false,
      files: ["src/index.ts"],
    },
    witnesses: [
      { id: "entrypoint", nodeSlug: "player", role: "entrypoint", path: "src/index.ts" },
    ],
    measuredAt: "2026-08-02T12:01:00.000Z",
  });

describe("ProjectSourceStore", () => {
  it("reports an untouched memory store as missing instead of inventing bindings", async () => {
    const store = createMemoryProjectSourceStore();

    await expect(store.read()).resolves.toEqual({ status: "missing", bindings: [] });
    await expect(store.list("music-streaming")).resolves.toEqual({
      status: "missing",
      bindings: [],
    });
  });

  it("replaces the project's one existing binding only after measurement succeeds", async () => {
    const original = pendingBinding({ sourceId: "source-old", rootPath: "/private/work/music-old" });
    const firstReceipt = receiptFor(original);
    const store = createMemoryProjectSourceStore();
    await store.replaceAfterMeasurement(original.projectSlug, original, async () => firstReceipt);

    let measured = false;
    const next = pendingBinding();
    const replacement = await store.replaceAfterMeasurement(next.projectSlug, next, async () => {
      measured = true;
      return receiptFor(next);
    });

    expect(measured).toBe(true);
    expect(replacement).toMatchObject({ status: "replaced" });
    await expect(store.list("music-streaming")).resolves.toMatchObject({
      status: "ok",
      bindings: [
        {
          projectSlug: "music-streaming",
          sourceId: "source-next",
          rootPath: "/private/work/music-next",
          receipt: { sourceId: "source-next", status: "verified_current" },
        },
      ],
    });
  });

  it("preserves the existing binding when measurement fails", async () => {
    const original = pendingBinding({ sourceId: "source-old", rootPath: "/private/work/music-old" });
    const store = createMemoryProjectSourceStore();
    await store.replaceAfterMeasurement(original.projectSlug, original, async () => receiptFor(original));

    const next = pendingBinding();
    await expect(
      store.replaceAfterMeasurement(next.projectSlug, next, async () => {
        throw new Error("scan failed");
      }),
    ).resolves.toMatchObject({ status: "measurement_failed" });

    await expect(store.list("music-streaming")).resolves.toMatchObject({
      status: "ok",
      bindings: [{ sourceId: "source-old", rootPath: "/private/work/music-old" }],
    });
  });

  it("reports picker cancellation separately and preserves the existing binding", async () => {
    const original = pendingBinding({ sourceId: "source-old", rootPath: "/private/work/music-old" });
    const store = createMemoryProjectSourceStore();
    await store.replaceAfterMeasurement(original.projectSlug, original, async () => receiptFor(original));

    const result = await store.replaceAfterMeasurement(
      "music-streaming",
      pendingBinding(),
      async () => {
        throw new DOMException("cancelled", "AbortError");
      },
    );

    expect(result).toMatchObject({ status: "cancelled" });
    await expect(store.list("music-streaming")).resolves.toMatchObject({
      bindings: [{ sourceId: "source-old" }],
    });
  });

  it("exposes a malformed sidecar and blocks replacement instead of overwriting it clean", async () => {
    const store = createMemoryProjectSourceStore('{"contractVersion":1,"bindings":"oops"}');
    let measured = false;

    await expect(store.read()).resolves.toEqual({ status: "malformed", bindings: [] });
    await expect(
      store.replaceAfterMeasurement("music-streaming", pendingBinding(), async () => {
        measured = true;
        return receiptFor(pendingBinding());
      }),
    ).resolves.toEqual({ status: "blocked_malformed", bindings: [] });
    expect(measured).toBe(false);
    await expect(store.read()).resolves.toEqual({ status: "malformed", bindings: [] });
  });
});
