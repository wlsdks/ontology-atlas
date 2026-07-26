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

/**
 * 볼트 폴더의 최소 가짜 — File System Access API 중 이 저장층이 실제로 쓰는
 * 표면만 흉내낸다(디렉터리 생성 · 파일 쓰기 · 삭제).
 */
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

/**
 * 저장 매체가 바뀌어도 화면이 보는 계약은 같아야 한다 — 그래서 같은 매트릭스를
 * 구현마다 돌린다. 새 매체를 붙일 때 여기 한 줄만 더하면 계약 검증이 끝난다.
 */
const IMPLEMENTATIONS: Array<{ name: string; create: () => PastTrailStore }> = [
  { name: "vault file", create: () => createVaultFilePastTrailStore(createFakeVaultHandle().handle) },
  { name: "memory", create: () => createMemoryPastTrailStore() },
];

describe.each(IMPLEMENTATIONS)("PastTrailStore 계약 — $name", ({ create }) => {
  it("빈 상태에서 목록은 비어 있다", async () => {
    await expect(create().list()).resolves.toEqual([]);
  });

  it("문턱 미만은 보관하지 않는다", async () => {
    const store = create();
    await expect(store.save("w1", entries("domain:a"))).resolves.toEqual([]);
    await expect(store.list()).resolves.toEqual([]);
  });

  it("보관한 길이 다시 읽힌다", async () => {
    const store = create();
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const walks = await store.list();
    expect(walks).toHaveLength(1);
    expect(walks[0].entries.map((e) => e.id)).toEqual(["domain:a", "capability:b"]);
  });

  it("같은 id 로 다시 저장하면 줄이 늘지 않고 제자리에서 자란다", async () => {
    const store = create();
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const after = await store.save("w1", entries("domain:a", "capability:b", "element:c"), {
      now: 2_000,
    });
    expect(after).toHaveLength(1);
    expect(after[0].entries).toHaveLength(3);
    expect(after[0].endedAt).toBe(2_000);
  });

  it("다른 id 는 새 줄이고 최근이 앞", async () => {
    const store = create();
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const after = await store.save("w2", entries("element:c", "element:d"), { now: 2_000 });
    expect(after.map((w) => w.id)).toEqual(["w2", "w1"]);
  });

  it("다른 id 라도 최신 길과 경로가 같으면 줄을 늘리지 않는다", async () => {
    const store = create();
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const after = await store.save("w2", entries("domain:a", "capability:b"), { now: 9_000 });
    expect(after).toHaveLength(1);
    expect(after[0].endedAt).toBe(1_000);
  });

  it("개별 삭제가 실제로 지운다", async () => {
    const store = create();
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    await store.save("w2", entries("element:c", "element:d"), { now: 2_000 });
    const after = await store.remove("w2");
    expect(after.map((w) => w.id)).toEqual(["w1"]);
    await expect(store.list()).resolves.toHaveLength(1);
  });

  it("모두 지우기가 실제로 지운다", async () => {
    const store = create();
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    await expect(store.clear()).resolves.toEqual([]);
    await expect(store.list()).resolves.toEqual([]);
  });

  it("연속 저장이 겹쳐도 마지막 걸음이 유실되지 않는다 (쓰기 직렬화)", async () => {
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

describe("볼트 파일 구현 — 매체 고유 계약", () => {
  it("`.ontology-atlas/past-trails.json` 에 쓴다 (agent-activity.json 과 같은 자리)", async () => {
    const vault = createFakeVaultHandle();
    const store = createVaultFilePastTrailStore(vault.handle);
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    expect(PAST_TRAILS_RELATIVE_PATH).toBe(`${PAST_TRAILS_VAULT_DIR}/${PAST_TRAILS_VAULT_FILE}`);
    expect(vault.files.has(PAST_TRAILS_RELATIVE_PATH)).toBe(true);
    expect(vault.dirs.has(PAST_TRAILS_VAULT_DIR)).toBe(true);
  });

  it("사이드카 폴더가 스스로를 git 에서 감춘다 — 사용자 볼트에서 실수로 커밋되지 않게", async () => {
    const vault = createFakeVaultHandle();
    const store = createVaultFilePastTrailStore(vault.handle);
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    expect(vault.files.get(`${PAST_TRAILS_VAULT_DIR}/${SIDECAR_IGNORE_FILE}`)).toBe(
      SIDECAR_IGNORE_CONTENT,
    );
  });

  it("이미 있는 .gitignore 는 덮어쓰지 않는다 — 사용자 의도가 우선", async () => {
    const vault = createFakeVaultHandle();
    vault.dirs.add(PAST_TRAILS_VAULT_DIR);
    vault.files.set(`${PAST_TRAILS_VAULT_DIR}/${SIDECAR_IGNORE_FILE}`, "keep-me\n");
    const store = createVaultFilePastTrailStore(vault.handle);
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    expect(vault.files.get(`${PAST_TRAILS_VAULT_DIR}/${SIDECAR_IGNORE_FILE}`)).toBe("keep-me\n");
  });

  it("저장된 파일 내용에 걸음당 시각이 하나도 없다 — 시각은 길당 endedAt 1개뿐", async () => {
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
    // 전수 감사 — 파일 안 숫자값은 `v: 1` 과 `endedAt` 둘뿐.
    const numbers: number[] = [];
    const walkTree = (node: unknown): void => {
      if (typeof node === "number") numbers.push(node);
      else if (Array.isArray(node)) node.forEach(walkTree);
      else if (node && typeof node === "object") Object.values(node).forEach(walkTree);
    };
    walkTree(JSON.parse(raw));
    expect(numbers.sort((a, b) => a - b)).toEqual([1, 1_700_000]);
  });

  it("읽기 전용 볼트에서 조용히 지나간다 — 던지지 않고, 파일도 만들지 않는다", async () => {
    const vault = createFakeVaultHandle({ readOnly: true });
    const store = createVaultFilePastTrailStore(vault.handle);
    // 쓰기가 막히면 목록도 늘어난 척하지 않는다 — 화면과 디스크가 어긋나지 않게.
    await expect(
      store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 }),
    ).resolves.toEqual([]);
    expect(vault.files.size).toBe(0);
    await expect(store.list()).resolves.toEqual([]);
    await expect(store.clear()).resolves.toEqual([]);
    await expect(store.remove("w1")).resolves.toEqual([]);
  });

  it("모두 지우기는 파일을 삭제한다 — 빈 껍데기를 남기지 않는다", async () => {
    const vault = createFakeVaultHandle();
    const store = createVaultFilePastTrailStore(vault.handle);
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    await store.clear();
    expect(vault.files.has(PAST_TRAILS_RELATIVE_PATH)).toBe(false);
    // 사이드카 폴더의 .gitignore 는 남는다 — agent-activity.json 등과 공용이라
    // 지난 길을 지웠다고 폴더 전체의 커밋 가드를 걷어낼 이유가 없다.
    expect([...vault.files.keys()]).toEqual([`${PAST_TRAILS_VAULT_DIR}/${SIDECAR_IGNORE_FILE}`]);
  });

  it("문턱 미달 저장은 폴더를 만들지도 않는다", async () => {
    const vault = createFakeVaultHandle();
    await createVaultFilePastTrailStore(vault.handle).save("w1", entries("domain:a"));
    expect(vault.dirs.size).toBe(0);
    expect(vault.files.size).toBe(0);
  });

  it("파손된 파일이 있어도 빈 목록으로 읽고 다음 저장이 복구한다", async () => {
    const vault = createFakeVaultHandle();
    // 먼저 정상 저장으로 폴더를 만든 뒤 내용만 망가뜨린다.
    const store = createVaultFilePastTrailStore(vault.handle);
    await store.save("w1", entries("domain:a", "capability:b"), { now: 1_000 });
    vault.files.set(PAST_TRAILS_RELATIVE_PATH, "{not json");
    await expect(store.list()).resolves.toEqual([]);
    await expect(store.save("w2", entries("element:c", "element:d"), { now: 2 })).resolves.toHaveLength(1);
  });
});

describe("createPastTrailStore — 매체 계약", () => {
  it("매체는 텍스트만 안다 — 스키마·상한을 알 필요가 없다", async () => {
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
