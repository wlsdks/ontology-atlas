import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 관문 FX(전류장·그레인·커서 링) — 헌장 예외 1건의 사정거리를 잠근다.
 *
 * 헌장은 「움직이는 그라디언트 배경」을 금지한다(`forbidden.md` ·
 * `docs/DESIGN-SYSTEM.md` Don'ts). 관문 랜딩 리메이크(2026-08-18)는 그 금지에
 * **명문 예외 1건**을 열었다 — 발자국 번짐(shadowBlur)과 같은 형식이다:
 * 예외를 설정 뒤에 숨기지 않고 조건·상한·게이트와 함께 드러내 적는다.
 *
 * 조건 넷, 각각 여기서 검사된다:
 *  (a) **단독 소비처** — `gateway-fx` 접두는 `src/views/download/**` 와
 *      `app/globals.css`(토큰 정의) 밖에 존재하지 않는다. eslint 스코프
 *      셀렉터가 편집 시점을 막고, 이 파일시스템 스캔이 최종선이다(룰이
 *      조용히 죽어도 여기서 잡힌다).
 *  (b) **reduced-motion 에서 전부 멈춘다** — 전류장 rAF 루프는 감속에서 아예
 *      돌지 않고(정지 1프레임), 커서 지연 추종(lerp)은 즉시 붙기로 강등되고,
 *      관문 등장 안무는 base 레이어 carve-out 이 「항상 보임」으로 대체한다.
 *  (c) **효과층 알파 상한** — 광원·그레인·성진의 알파가 토큰으로 잠겨 있고
 *      상한을 넘지 않으며, 소비처는 그 토큰을 읽어서만 쓴다(리터럴 알파로
 *      상한을 우회할 수 없다).
 *  (d) **문서 등재** — 예외는 코드와 헌장 문서 양쪽에 있어야 한다. 코드에만
 *      있으면 다음 감사자가 「금지인데 왜 있지」로 읽고 지운다.
 */

const repoRoot = join(import.meta.dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");

/** `src/` + `app/` 아래 코드·스타일 파일을 전부 걷는다 (node_modules 없음). */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(?:ts|tsx|css|mjs|js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("관문 FX — 헌장 예외의 사정거리", () => {
  it("(a) gateway-fx 접두의 소비처는 관문 랜딩과 토큰 정의뿐이다", () => {
    const files = [
      ...walk(join(repoRoot, "src")),
      ...walk(join(repoRoot, "app")),
    ];
    const offenders: string[] = [];
    let consumers = 0;
    for (const file of files) {
      if (!readFileSync(file, "utf8").includes("gateway-fx")) continue;
      consumers += 1;
      const rel = relative(repoRoot, file).replace(/\\/g, "/");
      const allowed =
        rel.startsWith("src/views/download/") || rel === "app/globals.css";
      if (!allowed) offenders.push(rel);
    }
    expect(offenders, "gateway-fx 가 예외 사정거리 밖으로 샜다").toEqual([]);
    // 공회전 차단 — 소비처를 하나도 못 찾으면 이 스캔은 아무것도 안 지킨다.
    expect(consumers, "gateway-fx 소비처를 하나도 못 찾았다 — 스캐너가 헛돈다").toBeGreaterThanOrEqual(2);
  });

  it("(a′) eslint 스코프 셀렉터가 살아 있다 — 편집 시점의 1차 방어선", () => {
    const eslintConfig = read("eslint.config.mjs");
    expect(eslintConfig).toContain("gatewayFxScopeSelectors");
    expect(eslintConfig).toContain("Literal[value=/gateway-fx/]");
    // 관문 뷰 자신의 스코프 블록 — 예외의 소비처가 명시돼 있다.
    expect(eslintConfig).toContain("files: ['src/views/download/**/*.{ts,tsx}']");
  });

  it("(b) 전류장은 reduced-motion 에서 rAF 루프를 돌리지 않는다", () => {
    const fx = read("src/views/download/ui/GatewayFx.tsx");
    expect(fx).toMatch(/prefers-reduced-motion/);
    // 감속 분기: 정지 1프레임(draw(0)) — 루프 시작은 else 가지에만 있다.
    expect(fx).toMatch(/if \(reduced\) \{\s*\n\s*draw\(0\);/);
    // 커서 lerp 는 감속에서 즉시 붙는다 — 랙 있는 커서는 동등물이 아니다.
    expect(fx).toMatch(/!fxLoopLive \|\| reduced/);
  });

  it("(b′) 관문 등장 안무의 감속 동등물이 base 레이어 kill 규칙 뒤에 있다", () => {
    const css = read("app/globals.css");
    // carve-out 은 반드시 전역 kill 규칙과 같은 레이어(@layer base) 안,
    // 그 뒤에 있어야 이긴다 — 레이어 밖 !important 는 레이어 안에 진다(실측).
    const kill = css.indexOf("animation-duration: 0.01ms");
    const carve = css.indexOf(".gateway-rise,");
    expect(kill).toBeGreaterThan(-1);
    expect(carve, "관문 감속 carve-out 이 없다").toBeGreaterThan(-1);
    expect(carve, "carve-out 이 전역 kill 규칙보다 앞이라 조용히 진다").toBeGreaterThan(kill);
    const block = css.slice(carve, css.indexOf("}", carve));
    expect(block).toContain("opacity: 1 !important");
    expect(block).toContain("transform: none !important");
  });

  it("(c) 효과층 알파는 토큰으로 잠겨 있고 상한 안이다", () => {
    const css = read("app/globals.css");
    const readAlpha = (name: string): number => {
      const match = new RegExp(`${name}:\\s*([0-9.]+)`).exec(css);
      expect(match, `${name} 토큰이 없다`).toBeTruthy();
      return Number.parseFloat(match![1]);
    };
    // 상한: 배경은 분위기까지만 — 본문 잉크와 다투는 순간 배경이 아니다.
    expect(readAlpha("--gateway-fx-blob-alpha")).toBeLessThanOrEqual(0.15);
    expect(readAlpha("--gateway-fx-grain-alpha")).toBeLessThanOrEqual(0.06);
    expect(readAlpha("--gateway-fx-dust-alpha")).toBeLessThanOrEqual(0.3);

    // 소비처는 토큰을 읽어서만 알파를 만든다 — 리터럴 재기입은 상한 우회다.
    // 캔버스 광원·성진은 TSX 가 computed style 로 읽고, 그레인은 CSS 클래스가
    // `opacity: var(…)` 로 직접 소비한다.
    const fx = read("src/views/download/ui/GatewayFx.tsx");
    expect(fx).toContain("--gateway-fx-blob-alpha");
    expect(fx).toContain("--gateway-fx-dust-alpha");
    expect(css).toMatch(/\.gateway-fx-grain \{[^}]*opacity: var\(--gateway-fx-grain-alpha\)/);
    // 광원 잉크는 악센트 토큰에서 온다 — hex 재기입이면 악센트 전환을 못 따라간다.
    expect(fx).toContain("--color-indigo-brand");
  });

  it("(d) 헌장 문서에 예외가 등재돼 있다", () => {
    expect(read(".claude/rules/forbidden.md")).toMatch(/관문 전류장/);
  });
});
