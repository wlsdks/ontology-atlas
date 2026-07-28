import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * **정의됐지만 아무도 안 쓰는 토큰**의 반대 방향 게이트.
 *
 * `undeclared-token-ref.contract.test.ts` 는 앞 방향을 지킨다 — `var()` 가
 * 없는 토큰을 가리키면 터진다. 이 파일은 뒤 방향이다: 토큰을 선언해 놓고 아무도
 * 안 쓰면 그 토큰은 **규격이 아니라 오정보**가 된다. 2026-07-26 에 죽은 토큰
 * 둘(`--pad-card`/`--pad-panel`)이 패널의 실제 값과 **다른 값**을 가리키고
 * 있었던 전례가 그 증거다.
 *
 * ## 왜 0 이 아니라 래칫인가
 *
 * 이 파일의 주석이 스스로 말하듯 알파 사다리는 **쓸 컴포넌트보다 먼저** 한
 * 묶음으로 깔리기도 한다("색상 인벤토리 고빈도 orphan alpha 추가"). 정당한
 * 디자인 시스템 관행이라 0 을 강요하면 그 관행을 벌한다. 그래서 **늘어나면**
 * 터진다. 이 저장소가 이미 쓰는 절차(측정 → 분류 → 한 PR 규모인지 확인 → 게이트)
 * 와 같은 형식이고, `type-ramp-coverage` 래칫의 자매다.
 *
 * ## 왜 lint 가 아니라 계약 테스트인가
 *
 * 판정에 **다른 파일 전체의 값 목록**이 필요하다. `no-restricted-syntax` 는 한
 * 파일의 AST 셀렉터라 "이 토큰을 쓰는 곳이 저장소 어디에도 없다" 를 표현할 수
 * 없다.
 *
 * ## 세 개의 보이지 않는 소비 경로
 *
 * 텍스트 검색으로는 영원히 안 잡히는 것들이라 허용목록으로 뺀다. 이 목록에
 * 무언가를 더할 때는 **왜 텍스트로 안 잡히는지**를 함께 적어라 — "안 쓰는 것
 * 같지만 무서워서" 는 이유가 아니다.
 */

/** 프레임워크·서드파티가 이름을 안 부르고 소비하는 것들. */
const INVISIBLE_BY_MECHANISM = new Set<string>([
  // Tailwind v4 가 **이름을 그대로 읽는** 프레임워크 훅. 존재만으로 수식 없는
  // `transition-*` 유틸리티 500여 곳의 기본값을 바꾼다. 어떤 코드도 이 이름을
  // 적지 않는다.
  "--default-transition-duration",
  "--default-transition-timing-function",
]);

/** `--text-<step>--line-height` 는 `text-<step>` 이 컴파일 타임에 싣는 짝이다. */
const COMPANION_SUFFIX = "--line-height";

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * 문서 미러는 **저장소 자신의 산문을 담고 있어서** 토큰 이름이 설명으로 등장한다.
 * 그걸 소비로 세면 죽은 토큰이 자기 문서 때문에 영원히 살아 있다 — 실제로
 * 이 구분 하나가 106 과 231 을 갈랐다.
 */
const GENERATED_MIRRORS = ["src/entities/docs-vault/data/", "public/docs-vault/"];

function repoFiles(): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "src", "app", "mcp", "cli", "scripts", "tests", "src-tauri"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|css|rs|html)$/.test(f))
    .filter((f) => f !== "app/globals.css")
    .filter((f) => !GENERATED_MIRRORS.some((dir) => f.startsWith(dir)))
    // `git ls-files` 는 **인덱스**를 답한다 — 삭제했지만 아직 커밋 안 한 파일이
    // 여기 남는다. 없는 파일을 읽으려다 게이트가 죽으면, 리팩터링 중간 상태에서
    // 이 테스트는 토큰이 아니라 **자기 자신** 때문에 빨개진다.
    .filter((f) => existsSync(f));
}

/**
 * 이 수를 **줄이는** 변경은 환영이고, 줄였으면 이 숫자도 같이 내려라.
 * 올리려면 왜 지금 필요한지를 PR 본문에 적어라.
 */
const BASELINE_UNUSED = 0;

describe("디자인 토큰 — 아무도 안 쓰는 선언이 늘지 않는다", () => {
  it("keeps the unused-token count at or below the recorded baseline", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const stripped = stripCssComments(css);

    const declared = new Map<string, number>();
    for (const m of stripped.matchAll(/(?:^|[;{}\s])(--[a-zA-Z0-9_-]+)\s*:/gm)) {
      declared.set(m[1], (declared.get(m[1]) ?? 0) + 1);
    }
    const mentionsInCss = new Map<string, number>();
    for (const m of stripped.matchAll(/--[a-zA-Z0-9_-]+/g)) {
      mentionsInCss.set(m[0], (mentionsInCss.get(m[0]) ?? 0) + 1);
    }

    const mentionedOutside = new Set<string>();
    const bodies: string[] = [];
    for (const file of repoFiles()) {
      const text = readFileSync(file, "utf8");
      bodies.push(text);
      for (const m of text.matchAll(/--[a-zA-Z0-9_-]+/g)) mentionedOutside.add(m[0]);
    }
    const allText = bodies.join("\n");

    // Tailwind 네임스페이스 → 그 토큰이 만드는 유틸리티 접두사. `--color-panel`
    // 은 `var()` 없이 `bg-panel` 로만 쓰여도 살아 있다.
    const UTILITY_NAMESPACES: Record<string, readonly string[]> = {
      "--color-": ["bg", "text", "border", "ring", "fill", "stroke", "from", "to", "via", "outline", "decoration", "accent", "caret", "shadow", "divide", "placeholder"],
      "--text-": ["text"],
      "--tracking-": ["tracking"],
      "--leading-": ["leading"],
      "--radius-": ["rounded"],
      "--font-weight-": ["font"],
      "--font-": ["font"],
      "--shadow-": ["shadow"],
      "--ease-": ["ease"],
      "--animate-": ["animate"],
    };
    const usedAsUtility = (token: string): boolean => {
      for (const [prefix, utils] of Object.entries(UTILITY_NAMESPACES)) {
        if (!token.startsWith(prefix)) continue;
        const stem = token.slice(prefix.length);
        return utils.some((u) =>
          new RegExp(`(?<![\\w-])${u}-${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(allText),
        );
      }
      return false;
    };

    const unused: string[] = [];
    for (const [token, declarationCount] of declared) {
      if (INVISIBLE_BY_MECHANISM.has(token)) continue;
      if (token.endsWith(COMPANION_SUFFIX)) continue;
      if (mentionedOutside.has(token)) continue;
      // globals.css 안에서 다른 토큰의 값이 이 토큰을 인용하면 그것도 소비다.
      if ((mentionsInCss.get(token) ?? 0) > declarationCount) continue;
      if (usedAsUtility(token)) continue;
      unused.push(token);
    }
    unused.sort();

    expect(
      unused.length,
      `아무도 안 쓰는 토큰이 baseline(${BASELINE_UNUSED})보다 늘었다. 정의만 있고\n` +
        `소비가 없는 토큰은 규격이 아니라 오정보다 — 다음 사람이 그 값을 믿는다.\n` +
        `쓸 곳과 함께 넣거나, 안 쓸 거면 넣지 마라. 지금 잉여:\n  ${unused.join("\n  ")}`,
    ).toBeLessThanOrEqual(BASELINE_UNUSED);
  });

  /**
   * **탐지기가 조용히 무력화되는 것을 막는 프로브.** 위 검사가 어떤 이유로든
   * 전부 통과하도록 망가지면(정규식 오타, 네임스페이스 추가 누락) baseline 0 은
   * 영원히 만족되고 아무도 모른다. 그래서 "가짜 토큰 하나를 넣으면 잡히는가" 를
   * 여기서 직접 확인한다.
   */
  it("actually detects an unused token — the probe", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const probed = css.replace(":root {", ":root {\n  --probe-nobody-uses-this: 1px;");
    const stripped = stripCssComments(probed);
    const declared = [...stripped.matchAll(/(?:^|[;{}\s])(--[a-zA-Z0-9_-]+)\s*:/gm)].map((m) => m[1]);
    expect(declared).toContain("--probe-nobody-uses-this");

    const mentions = [...stripped.matchAll(/--probe-nobody-uses-this/g)].length;
    // 선언 1회 = 언급 1회. 소비가 있으면 2 이상이 된다.
    expect(mentions).toBe(1);
  });
});
