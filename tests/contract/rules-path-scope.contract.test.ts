import { readdirSync, readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **조건부 규칙이 실제로 실린다**는 계약.
 *
 * 배경: `.claude/rules/*.md` 8개가 전부 매 턴 상주해 73KB 를 먹고 있었다.
 * Claude Code 공식 문서의 `paths:` frontmatter 로 다섯을 조건부로 내려
 * 상주분을 13.6KB 로 줄였다 — 규칙을 지운 게 아니라 **필요할 때만 싣는다.**
 *
 * 그런데 이 방식에는 새로운 침묵 실패가 딸려 온다: **어느 파일도 안 맞는
 * 글롭을 쓰면 그 규칙은 영원히 안 실린다.** 파일은 그대로 있고, YAML 도
 * 유효하고, 아무 에러도 안 난다 — 규칙만 존재하지 않게 된다. 실제로 첫
 * 시도에서 `i18n/**` 이 0개였다(실 위치는 `src/i18n`). `src/**` 가 그걸
 * 덮고 있어서 아무 증상도 안 났고, 덮지 않았다면 아키텍처 규칙 전체가
 * 조용히 빠졌을 것이다.
 *
 * 그래서 재는 것은 "YAML 이 유효한가"가 아니라 **"이 글롭이 오늘 이
 * 저장소에서 무언가를 맞추는가"** 다. 리팩터로 디렉터리가 옮겨가면 여기서
 * 먼저 터진다.
 *
 * ⚠️ 상주 규칙(`paths:` 없는 것)은 이 검사의 대상이 아니다 — 조건이
 * 없으므로 침묵할 수가 없다. 무엇을 상주로 둘지는 설계 판단이고,
 * 아래 `ALWAYS_LOADED` 가 그 판단을 명시한다.
 */

const RULES_DIR = join(process.cwd(), ".claude/rules");

/**
 * 조건 없이 매 턴 실려야 하는 규칙.
 *
 * 판별 기준은 **"파일을 읽기 전에 필요한가"** 다. 조건부 규칙은 Claude 가
 * 매칭 파일을 *읽을 때* 실리므로, 파일을 열기도 전에 내려야 하는 판단은
 * 조건부로 두면 늦는다.
 *
 * - `forbidden.md` — 금지 목록. `npm publish` 를 실행할지 같은 판단은 어떤
 *   파일도 안 읽고 내려진다.
 * - `git.md` — 커밋·브랜치 규율. 무엇을 읽었는지와 무관하다.
 * - `local-first.md` — 백엔드를 도입할지 같은 설계 판단. 코드를 열기 전에
 *   결론이 나야 한다.
 */
const ALWAYS_LOADED = ["forbidden.md", "git.md", "local-first.md"];

type Rule = { file: string; paths: string[] | null };

function readRules(): Rule[] {
  return readdirSync(RULES_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => {
      const text = readFileSync(join(RULES_DIR, file), "utf8");
      const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
      if (match === null) return { file, paths: null };
      const body = match[1];
      const paths = body
        .split("\n")
        .filter((line) => /^\s*- /.test(line))
        .map((line) => line.trim().slice(2).replace(/^["']|["']$/g, ""));
      return { file, paths };
    });
}

describe("`.claude/rules` path scoping contract", () => {
  const rules = readRules();

  it("규칙 파일이 실제로 있다 — 빈 디렉터리를 통과시키지 않는다", () => {
    expect(rules.length).toBeGreaterThanOrEqual(8);
  });

  it("상주로 정한 셋은 `paths:` 를 갖지 않는다", () => {
    for (const name of ALWAYS_LOADED) {
      const rule = rules.find((r) => r.file === name);
      expect(rule, `${name} 이 없다`).toBeDefined();
      expect(rule?.paths, `${name} 은 조건 없이 실려야 한다`).toBeNull();
    }
  });

  it("나머지는 전부 조건부다 — 상주 목록은 명시적으로만 늘어난다", () => {
    // 새 규칙을 상주로 올리려면 위 ALWAYS_LOADED 에 이유와 함께 적어야 한다.
    // 그렇게 안 하면 73KB 로 되돌아가는 길이 무료가 된다.
    const unconditional = rules.filter((r) => r.paths === null).map((r) => r.file);
    expect(unconditional.sort()).toEqual([...ALWAYS_LOADED].sort());
  });

  it("frontmatter 를 연 규칙은 비지 않은 `paths` 목록을 갖는다", () => {
    for (const rule of rules) {
      if (rule.paths === null) continue;
      expect(rule.paths.length, `${rule.file} 의 paths 가 비었다`).toBeGreaterThan(0);
    }
  });

  it("**모든 글롭이 오늘 무언가를 맞춘다** — 0개짜리는 조용히 사라진 규칙이다", () => {
    const dead: string[] = [];
    for (const rule of rules) {
      if (rule.paths === null) continue;
      for (const pattern of rule.paths) {
        let hits = 0;
        try {
          hits = globSync(pattern).length;
        } catch {
          dead.push(`${rule.file}: ${pattern} (글롭 오류)`);
          continue;
        }
        if (hits === 0) dead.push(`${rule.file}: ${pattern}`);
      }
    }
    expect(dead, `아무 파일도 안 맞는 글롭 — 이 규칙은 실리지 않는다:\n${dead.join("\n")}`).toEqual(
      [],
    );
  }, 15_000);

  it("상주 총량이 20KB 를 넘지 않는다 — 되돌아가는 길에 저항을 둔다", () => {
    // 정확한 상한이 중요한 게 아니라, 상주분이 다시 부풀 때 **누가 알아채는
    // 지점**이 있다는 게 중요하다. 이 수치를 올리려면 올리는 커밋이 왜인지
    // 말해야 한다.
    const bytes = rules
      .filter((r) => r.paths === null)
      .reduce((sum, r) => sum + readFileSync(join(RULES_DIR, r.file)).byteLength, 0);
    expect(bytes).toBeLessThan(20_000);
  });
});
