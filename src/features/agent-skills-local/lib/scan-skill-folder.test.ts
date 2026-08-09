import { describe, expect, it } from "vitest";

import { installedPluginPrefixes, scanSkillFolder } from "./scan-skill-folder";

/**
 * **로드되지 않는 사본을 세지 않는다.**
 *
 * ## 무엇이 났나 (2026-08-09, 설치된 앱 실측)
 *
 * 설치된 앱에서 진짜 `~/.claude` 를 열었더니 화면이 **스킬 195개**라고 했다.
 * 실제로 로드되는 것은 **60개**다. 나머지 135개는 버전 캐시
 * (`plugins/cache/<플러그인>/<옛 버전>/`)와 설치도 안 한 카탈로그의 git 체크아웃
 * (`plugins/marketplaces/<카탈로그>/`)이었다.
 *
 * **이 저장소는 같은 실수를 이미 한 번 했다** — 개발용 감사 명령이 같은 이유로
 * 207개를 보고했고(실제 60개), 그 부풀린 분모로 쓴 브리핑이 카운슬 판정 셋을
 * 움직였다. 명령 쪽은 고쳤는데 화면 쪽에 그 교훈을 안 옮긴 것이다.
 *
 * 화면에서 이 결함은 더 나쁘다: 사용자가 **로드되지도 않는 스킬을 지우려 든다.**
 */

interface Tree {
  [name: string]: Tree | string;
}

/** 가짜 `FileSystemDirectoryHandle` — 표준 `entries()` 만 흉내 낸다. */
function makeDir(name: string, tree: Tree): FileSystemDirectoryHandle {
  return {
    kind: "directory",
    name,
    async *entries() {
      for (const [key, value] of Object.entries(tree)) {
        yield [
          key,
          typeof value === "string"
            ? ({
                kind: "file",
                name: key,
                getFile: async () => ({ text: async () => value }),
              } as unknown as FileSystemFileHandle)
            : makeDir(key, value),
        ];
      }
    },
    async getDirectoryHandle(child: string) {
      const value = tree[child];
      if (!value || typeof value === "string") throw new Error("not a directory");
      return makeDir(child, value);
    },
    async getFileHandle(child: string) {
      const value = tree[child];
      if (typeof value !== "string") throw new Error("not a file");
      return {
        kind: "file",
        name: child,
        getFile: async () => ({ text: async () => value }),
      } as unknown as FileSystemFileHandle;
    },
  } as unknown as FileSystemDirectoryHandle;
}

const SKILL = (name: string) => `---\nname: ${name}\ndescription: does ${name}\n---\n\nbody`;

const MANIFEST = JSON.stringify({
  version: 2,
  plugins: {
    "pdf-tools@market": [{ installPath: "/Users/x/.claude/plugins/cache/pdf-tools/2.0.0" }],
  },
});

/** 실제 모양 그대로: 설치본 1 · 옛 버전 1 · 설치 안 한 카탈로그 1 · 내 스킬 1. */
const REAL_SHAPE: Tree = {
  "plugins": {
    "installed_plugins.json": MANIFEST,
    "cache": {
      "pdf-tools": {
        "2.0.0": { skills: { pdf: { "SKILL.md": SKILL("pdf") } } },
        "1.0.0": { skills: { pdf: { "SKILL.md": SKILL("pdf-old") } } },
      },
    },
    "marketplaces": {
      "big-catalog": {
        skills: {
          a: { "SKILL.md": SKILL("catalog-a") },
          b: { "SKILL.md": SKILL("catalog-b") },
        },
      },
    },
  },
  "skills": { mine: { "SKILL.md": SKILL("mine") } },
};

describe("installedPluginPrefixes", () => {
  it("정본이 지목한 설치 경로만, 고른 폴더 기준 상대 경로로 돌려준다", () => {
    expect(installedPluginPrefixes(MANIFEST, ".claude")).toEqual([
      "plugins/cache/pdf-tools/2.0.0",
    ]);
  });

  it("같은 경로가 두 번 적혀 있어도 한 번만 센다", () => {
    const dup = JSON.stringify({
      plugins: { "a@m": [{ installPath: "/h/.claude/plugins/cache/a/1" }, { installPath: "/h/.claude/plugins/cache/a/1" }] },
    });
    expect(installedPluginPrefixes(dup, ".claude")).toEqual(["plugins/cache/a/1"]);
  });

  it("망가진 정본은 빈 목록 — 부풀린 숫자보다 「정본 못 읽음」이 낫다", () => {
    expect(installedPluginPrefixes("{ not json", ".claude")).toEqual([]);
    expect(installedPluginPrefixes("{}", ".claude")).toEqual([]);
  });
});

describe("스킬 폴더 훑기", () => {
  it("설치 정본이 있으면 **로드되는 것만** 읽고, 뺀 수를 센다", async () => {
    const scan = await scanSkillFolder(makeDir(".claude", REAL_SHAPE));
    expect(
      scan.files.map((f) => f.relativePath).sort(),
      "옛 버전과 카탈로그 사본이 섞이면 사용자가 안 도는 스킬을 지우려 든다",
    ).toEqual(["plugins/cache/pdf-tools/2.0.0/skills/pdf/SKILL.md", "skills/mine/SKILL.md"]);
    expect(scan.skippedNotInstalled, "몇 개를 뺐는지 화면이 말할 수 있어야 한다").toBe(2);
  });

  it("정본이 없으면 전부 훑고, 뺐다고 말하지 않는다", async () => {
    const scan = await scanSkillFolder(
      makeDir(".claude", { skills: { a: { "SKILL.md": SKILL("a") }, b: { "SKILL.md": SKILL("b") } } }),
    );
    expect(scan.files).toHaveLength(2);
    expect(scan.skippedNotInstalled, "null 과 0 은 다르다 — 안 봤나 vs 뺄 게 없었나").toBeNull();
  });

  it("설치 경로의 조상 폴더는 내려간다 — 안 그러면 설치본까지 못 본다", async () => {
    const scan = await scanSkillFolder(makeDir(".claude", REAL_SHAPE));
    expect(
      scan.files.some((f) => f.relativePath.includes("pdf-tools/2.0.0")),
      "plugins · plugins/cache · plugins/cache/pdf-tools 를 못 지나면 설치본이 사라진다",
    ).toBe(true);
  });

  it("실재 경로 목록에는 훑은 파일이 담긴다 — 깨진 참조 판정의 재료", async () => {
    const scan = await scanSkillFolder(
      makeDir(".claude", {
        skills: { a: { "SKILL.md": SKILL("a"), references: { "spec.md": "x" } } },
      }),
    );
    expect(scan.existingPaths.has("skills/a/references/spec.md")).toBe(true);
    expect(scan.scannedFiles).toBe(2);
  });

  it("깊이 상한에 걸리면 조용히 자르지 않고 말한다", async () => {
    const deep: Tree = { a: { b: { c: { d: { "SKILL.md": SKILL("deep") } } } } };
    const scan = await scanSkillFolder(makeDir(".claude", deep), {
      maxDepth: 2,
      maxFiles: 100,
      maxSkills: 100,
    });
    expect(scan.truncated, "「깨진 참조 0건」이 「다 괜찮다」로 읽히면 안 된다").toBe(true);
  });

  it("node_modules 같은 폴더는 애초에 안 들어간다", async () => {
    const scan = await scanSkillFolder(
      makeDir(".claude", {
        node_modules: { pkg: { "SKILL.md": SKILL("noise") } },
        skills: { a: { "SKILL.md": SKILL("a") } },
      }),
    );
    expect(scan.files.map((f) => f.relativePath)).toEqual(["skills/a/SKILL.md"]);
  });
});
