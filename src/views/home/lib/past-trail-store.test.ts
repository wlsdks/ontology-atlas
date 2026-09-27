import { describe, expect, it } from "vitest";

import { serializePastTrails, type PastWalkEntry } from "./past-trail-record";
import {
  createMemoryPastTrailStore,
  createPastTrailStore,
  createVaultFilePastTrailStore,
  PAST_TRAILS_RELATIVE_PATH,
  PAST_TRAILS_VAULT_DIR,
  PAST_TRAILS_VAULT_FILE,
  SIDECAR_IGNORE_CONTENT,
  SIDECAR_IGNORE_FILE,
  type PastTrailMedium,
  type PastTrailStore,
} from "./past-trail-store";

function entries(...ids: string[]): PastWalkEntry[] {
  return ids.map((id) => ({ id, title: id.toUpperCase(), kind: id.split(":")[0] ?? "element" }));
}

/** Only the File System Access surface this store uses. */
function createFakeVaultHandle(options: { readOnly?: boolean } = {}) {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const guardWrite = () => {
    if (options.readOnly) throw new DOMException("not allowed", "NotAllowedError");
  };
  const makeFileHandle = (path: string) => ({
    getFile: async () => {
      if (!files.has(path)) throw new DOMException("not found", "NotFoundError");
      return { text: async () => files.get(path)! };
    },
    createWritable: async () => {
      guardWrite();
      let buffer = "";
      return {
        write: async (text: string) => {
          buffer += text;
        },
        close: async () => {
          files.set(path, buffer);
        },
      };
    },
  });
  const makeDirHandle = (name: string) => ({
    getFileHandle: async (fileName: string, opts?: { create?: boolean }) => {
      const path = `${name}/${fileName}`;
      if (!files.has(path) && !opts?.create) {
        throw new DOMException("not found", "NotFoundError");
      }
      if (opts?.create) guardWrite();
      return makeFileHandle(path);
    },
    removeEntry: async (fileName: string) => {
      guardWrite();
      if (!files.delete(`${name}/${fileName}`)) {
        throw new DOMException("not found", "NotFoundError");
      }
    },
  });
  const handle = {
    getDirectoryHandle: async (name: string, opts?: { create?: boolean }) => {
      if (!dirs.has(name)) {
        if (!opts?.create) throw new DOMException("not found", "NotFoundError");
        guardWrite();
        dirs.add(name);
      }
      return makeDirHandle(name);
    },
  };
  return {
    handle: handle as unknown as FileSystemDirectoryHandle,
    files,
    dirs,
    read: () => files.get(PAST_TRAILS_RELATIVE_PATH) ?? null,
  };
}

/** Every medium runs the same contract; adding one is one line. */
const IMPLEMENTATIONS: Array<{ name: string; create: () => PastTrailStore }> = [
  { name: "vault file", create: () => createVaultFilePastTrailStore(createFakeVaultHandle().handle) },
  { name: "memory", create: () => createMemoryPastTrailStore() },
];

describe.each(IMPLEMENTATIONS)("PastTrailStore contract: $name", ({ create }) => {
  it("lists nothing when empty", async () => {
    await expect(create().list()).resolves.toEqual([]);
  });

  it("does not keep a walk under the threshold", async () => {
    const store = create();
    await expect(store.save("w1", entries("domain:a"))).resolves.toEqual([]);
    await expect(store.list()).resolves.toEqual([]);
  });

  it("reads back a kept trail", async () => {
    const store = create();
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const walks = await store.list();
    expect(walks).toHaveLength(1);
    expect(walks[0].entries.map((e) => e.id)).toEqual(["domain:a", "capability:b"]);
  });

  it("saving again with the same id grows the row in place", async () => {
    const store = create();
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const after = await store.save("w1", entries("domain:a", "capability:b", "element:c"), {
      now: 2_000,
    });
    expect(after).toHaveLength(1);
    expect(after[0].entries).toHaveLength(3);
    expect(after[0].endedAt).toBe(2_000);
  });

  it("a different id is a new row, newest first", async () => {
    const store = create();
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const after = await store.save("w2", entries("element:c", "element:d"), { now: 2_000 });
    expect(after.map((w) => w.id)).toEqual(["w2", "w1"]);
  });

  it("a different id with the same path as the newest trail adds no row", async () => {
    const store = create();
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const after = await store.save("w2", entries("domain:a", "capability:b"), { now: 9_000 });
    expect(after).toHaveLength(1);
    expect(after[0].endedAt).toBe(1_000);
  });

  it("removing one entry deletes it", async () => {
    const store = create();
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    await store.save("w2", entries("element:c", "element:d"), { now: 2_000 });
    const after = await store.remove("w2");
    expect(after.map((w) => w.id)).toEqual(["w1"]);
    await expect(store.list()).resolves.toHaveLength(1);
  });

  it("clear all deletes everything", async () => {
    const store = create();
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    await expect(store.clear()).resolves.toEqual([]);
    await expect(store.list()).resolves.toEqual([]);
  });

  it("overlapping saves keep the last step because writes are serialized", async () => {
    const store = create();
    await Promise.all([
      store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 }),
      store.save("w1", entries("domain:a", "capability:b", "element:c"), { now: 2_000 }),
      store.save("w1", entries("domain:a", "capability:b", "element:c", "element:d"), {
        now: 3_000,
      }),
    ]);
    const walks = await store.list();
    expect(walks).toHaveLength(1);
    expect(walks[0].entries).toHaveLength(4);
  });
});

describe("vault file store contract specific to the medium", () => {
  it("writes to `.ontology-atlas/past-trails.json` beside agent-activity.json", async () => {
    const vault = createFakeVaultHandle();
    const store = createVaultFilePastTrailStore(vault.handle);
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    expect(PAST_TRAILS_RELATIVE_PATH).toBe(`${PAST_TRAILS_VAULT_DIR}/${PAST_TRAILS_VAULT_FILE}`);
    expect(vault.files.has(PAST_TRAILS_RELATIVE_PATH)).toBe(true);
    expect(vault.dirs.has(PAST_TRAILS_VAULT_DIR)).toBe(true);
  });

  it("the sidecar folder hides itself from git so a user vault does not commit it by accident", async () => {
    const vault = createFakeVaultHandle();
    const store = createVaultFilePastTrailStore(vault.handle);
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    expect(vault.files.get(`${PAST_TRAILS_VAULT_DIR}/${SIDECAR_IGNORE_FILE}`)).toBe(
      SIDECAR_IGNORE_CONTENT,
    );
  });

  it("does not overwrite an existing .gitignore because user intent wins", async () => {
    const vault = createFakeVaultHandle();
    vault.dirs.add(PAST_TRAILS_VAULT_DIR);
    vault.files.set(`${PAST_TRAILS_VAULT_DIR}/${SIDECAR_IGNORE_FILE}`, "keep-me\n");
    const store = createVaultFilePastTrailStore(vault.handle);
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    expect(vault.files.get(`${PAST_TRAILS_VAULT_DIR}/${SIDECAR_IGNORE_FILE}`)).toBe("keep-me\n");
  });

  it("the saved file has no per-step time, only one endedAt per trail", async () => {
    const vault = createFakeVaultHandle();
    const store = createVaultFilePastTrailStore(vault.handle);
    await store.save("w1", entries("domain:a", "capability:b", "element:c"), { now: 1_700_000 });

    const raw = vault.read() ?? "";
    const parsed = JSON.parse(raw) as { walks: Array<Record<string, unknown>> };
    expect(parsed.walks).toHaveLength(1);
    expect(parsed.walks[0].endedAt).toBe(1_700_000);
    for (const entry of parsed.walks[0].entries as Array<Record<string, unknown>>) {
      expect(Object.keys(entry).sort()).toEqual(["id", "kind", "title"]);
    }
    // Exhaustive audit: the only numbers in the file are `v: 1` and `endedAt`.
    const numbers: number[] = [];
    const walkTree = (node: unknown): void => {
      if (typeof node === "number") numbers.push(node);
      else if (Array.isArray(node)) node.forEach(walkTree);
      else if (node && typeof node === "object") Object.values(node).forEach(walkTree);
    };
    walkTree(JSON.parse(raw));
    expect(numbers.sort((a, b) => a - b)).toEqual([1, 1_700_000]);
  });

  it("passes silently on a read-only vault without throwing or creating a file", async () => {
    const vault = createFakeVaultHandle({ readOnly: true });
    const store = createVaultFilePastTrailStore(vault.handle);
    // A blocked write must not pretend the list grew, so screen and disk agree.
    await expect(
      store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 }),
    ).resolves.toEqual([]);
    expect(vault.files.size).toBe(0);
    await expect(store.list()).resolves.toEqual([]);
    await expect(store.clear()).resolves.toEqual([]);
    await expect(store.remove("w1")).resolves.toEqual([]);
  });

  it("clear all deletes the file instead of leaving an empty shell", async () => {
    const vault = createFakeVaultHandle();
    const store = createVaultFilePastTrailStore(vault.handle);
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    await store.clear();
    expect(vault.files.has(PAST_TRAILS_RELATIVE_PATH)).toBe(false);
    // The .gitignore is shared with `agent-activity.json`, so clearing trails keeps the folder's
    // commit guard.
    expect([...vault.files.keys()]).toEqual([`${PAST_TRAILS_VAULT_DIR}/${SIDECAR_IGNORE_FILE}`]);
  });

  it("a save under the threshold does not even create the folder", async () => {
    const vault = createFakeVaultHandle();
    await createVaultFilePastTrailStore(vault.handle).save("w1", entries("domain:a"));
    expect(vault.dirs.size).toBe(0);
    expect(vault.files.size).toBe(0);
  });

  it("reads a broken file as an empty list and the next save repairs it", async () => {
    const vault = createFakeVaultHandle();
    // Create the folder with a normal save first, then corrupt only the content.
    const store = createVaultFilePastTrailStore(vault.handle);
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    vault.files.set(PAST_TRAILS_RELATIVE_PATH, "{not json");
    await expect(store.list()).resolves.toEqual([]);
    await expect(store.save("w2", entries("element:c", "element:d"), { now: 2 })).resolves.toHaveLength(1);
  });
});

describe("createPastTrailStore medium contract", () => {
  it("the medium knows only text, not the schema or caps", async () => {
    const seen: string[] = [];
    const medium: PastTrailMedium = {
      read: async () => seen.at(-1) ?? null,
      write: async (text) => {
        seen.push(text);
      },
      erase: async () => {
        seen.push("");
      },
    };
    const store = createPastTrailStore(medium);
    const walks = await store.save("w1", entries("domain:a", "capability:b"), { now: 7 });
    expect(seen.at(-1)).toBe(serializePastTrails(walks));
  });
});
