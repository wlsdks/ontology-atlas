import { describe, expect, it } from "vitest";

import {
  buildProjectSourceReceipt,
  type ProjectSourceBinding,
  type ProjectSourceReceipt,
} from "./project-source-receipt";
import {
  PROJECT_SOURCES_RELATIVE_PATH,
  PROJECT_SOURCES_VAULT_DIR,
  PROJECT_SOURCES_VAULT_FILE,
  createMemoryProjectSourceStore,
  createProjectSourceStore,
  createVaultFileProjectSourceStore,
} from "./project-source-store";

function createFakeVaultHandle(options: { readOnly?: boolean } = {}) {
  const files = new Map<string, string>();
  const directories = new Set<string>();
  const assertWritable = () => {
    if (options.readOnly) throw new DOMException("not allowed", "NotAllowedError");
  };
  const fileHandle = (path: string) => ({
    getFile: async () => {
      if (!files.has(path)) throw new DOMException("not found", "NotFoundError");
      return { text: async () => files.get(path)! };
    },
    createWritable: async () => {
      assertWritable();
      let text = "";
      return {
        write: async (chunk: string) => { text += chunk; },
        close: async () => { files.set(path, text); },
      };
    },
  });
  const handle = {
    getDirectoryHandle: async (name: string, options?: { create?: boolean }) => {
      if (!directories.has(name)) {
        if (!options?.create) throw new DOMException("not found", "NotFoundError");
        assertWritable();
        directories.add(name);
      }
      return {
        getFileHandle: async (name: string, fileOptions?: { create?: boolean }) => {
          const path = `${PROJECT_SOURCES_VAULT_DIR}/${name}`;
          if (!files.has(path) && !fileOptions?.create) {
            throw new DOMException("not found", "NotFoundError");
          }
          if (fileOptions?.create) assertWritable();
          return fileHandle(path);
        },
      };
    },
  };
  return {
    handle: handle as unknown as FileSystemDirectoryHandle,
    files,
    directories,
  };
}

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

  it("blocks replacement when the existing sidecar cannot be read", async () => {
    let measured = false;
    let wrote = false;
    const store = createProjectSourceStore({
      read: async () => { throw new DOMException("denied", "NotAllowedError"); },
      write: async () => { wrote = true; },
    });

    await expect(
      store.replaceAfterMeasurement("music-streaming", pendingBinding(), async () => {
        measured = true;
        return receiptFor(pendingBinding());
      }),
    ).resolves.toEqual({ status: "blocked_unavailable", bindings: [] });
    expect(measured).toBe(false);
    expect(wrote).toBe(false);
  });

  it("preserves the current binding when persisting the measured replacement fails", async () => {
    const original = pendingBinding({ sourceId: "source-old", rootPath: "/private/work/music-old" });
    const seed = JSON.stringify({ contractVersion: 1, bindings: [{ ...original, receipt: receiptFor(original) }] });
    const store = createProjectSourceStore({
      read: async () => seed,
      write: async () => { throw new Error("disk full"); },
    });

    const result = await store.replaceAfterMeasurement(
      "music-streaming",
      pendingBinding(),
      async () => receiptFor(pendingBinding()),
    );

    expect(result).toMatchObject({
      status: "persistence_failed",
      bindings: [{ sourceId: "source-old", rootPath: "/private/work/music-old" }],
    });
  });

  it("serializes concurrent read-modify-write replacements so projects are not lost", async () => {
    const store = createMemoryProjectSourceStore();
    const music = pendingBinding();
    const shop = pendingBinding({
      projectSlug: "storefront",
      sourceId: "source-shop",
      rootPath: "/private/work/shop",
    });

    await Promise.all([
      store.replaceAfterMeasurement(music.projectSlug, music, async () => receiptFor(music)),
      store.replaceAfterMeasurement(shop.projectSlug, shop, async () => receiptFor(shop)),
    ]);

    await expect(store.read()).resolves.toMatchObject({
      status: "ok",
      bindings: expect.arrayContaining([
        expect.objectContaining({ projectSlug: "music-streaming" }),
        expect.objectContaining({ projectSlug: "storefront" }),
      ]),
    });
  });

  it("repairs duplicate project bindings only after an explicit measured replacement", async () => {
    const first = pendingBinding({ sourceId: "source-a", rootPath: "/private/work/a" });
    const second = pendingBinding({ sourceId: "source-b", rootPath: "/private/work/b" });
    const store = createMemoryProjectSourceStore(JSON.stringify({
      contractVersion: 1,
      bindings: [
        { ...first, receipt: receiptFor(first) },
        { ...second, receipt: receiptFor(second) },
      ],
    }));
    const replacement = pendingBinding();

    await expect(store.replaceAfterMeasurement(
      replacement.projectSlug,
      replacement,
      async () => receiptFor(replacement),
    )).resolves.toMatchObject({ status: "replaced" });
    await expect(store.list("music-streaming")).resolves.toMatchObject({
      status: "ok",
      bindings: [{ sourceId: "source-next" }],
    });
  });

  it("rejects a receipt whose identity does not match the pending binding", async () => {
    let writes = 0;
    let text: string | null = null;
    const store = createProjectSourceStore({
      read: async () => text,
      write: async (next) => { writes += 1; text = next; },
    });
    const pending = pendingBinding();

    await expect(store.replaceAfterMeasurement(
      pending.projectSlug,
      pending,
      async () => receiptFor({ ...pending, sourceId: "different-source" }),
    )).resolves.toEqual({ status: "invalid_measurement", bindings: [] });
    expect(writes).toBe(0);
  });
});

describe("vault-file project source medium", () => {
  it("stores the private binding in the vault sidecar and self-ignores the directory", async () => {
    const vault = createFakeVaultHandle();
    const store = createVaultFileProjectSourceStore(vault.handle);
    const pending = pendingBinding();

    await expect(
      store.replaceAfterMeasurement(pending.projectSlug, pending, async () => receiptFor(pending)),
    ).resolves.toMatchObject({ status: "replaced" });

    expect(PROJECT_SOURCES_RELATIVE_PATH).toBe(
      `${PROJECT_SOURCES_VAULT_DIR}/${PROJECT_SOURCES_VAULT_FILE}`,
    );
    expect(vault.files.get(`${PROJECT_SOURCES_VAULT_DIR}/.gitignore`)).toBe(
      "# Ontology Atlas local runtime state — not for commit.\n*\n",
    );
    expect(vault.files.get(PROJECT_SOURCES_RELATIVE_PATH)).toContain(
      "/private/work/music-next",
    );
  });

  it("does not overwrite an existing sidecar ignore policy", async () => {
    const vault = createFakeVaultHandle();
    vault.directories.add(PROJECT_SOURCES_VAULT_DIR);
    vault.files.set(`${PROJECT_SOURCES_VAULT_DIR}/.gitignore`, "keep-me\n");
    const pending = pendingBinding();

    await createVaultFileProjectSourceStore(vault.handle).replaceAfterMeasurement(
      pending.projectSlug,
      pending,
      async () => receiptFor(pending),
    );

    expect(vault.files.get(`${PROJECT_SOURCES_VAULT_DIR}/.gitignore`)).toBe("keep-me\n");
  });

  it("fails closed in a read-only vault without fabricating a replacement", async () => {
    const vault = createFakeVaultHandle({ readOnly: true });
    const pending = pendingBinding();

    await expect(
      createVaultFileProjectSourceStore(vault.handle).replaceAfterMeasurement(
        pending.projectSlug,
        pending,
        async () => receiptFor(pending),
      ),
    ).resolves.toMatchObject({ status: "persistence_failed", bindings: [] });
    expect(vault.files.size).toBe(0);
  });
});
