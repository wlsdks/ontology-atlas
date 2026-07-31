import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **주 캔버스는 불투명이고, 오프스크린은 아니다.**
 *
 * `getContext("2d", { alpha: false })` 는 명세상 모든 픽셀의 알파를 1.0 으로
 * 고정하고, Blink 는 그 값으로 컴포지터 레이어의 `SetContentsOpaque()` 를
 * 세운다 — 캔버스 뒤 페이지 콘텐츠와의 블렌딩을 생략할 수 있다는 힌트다.
 *
 * **이 계약이 필요한 이유는 이득이 안 보이는 자리에서 나기 때문이다.** 절약은
 * JS 프레임 시간이 아니라 컴포지트 단계에서 일어나므로 `performance.mark`
 * 프로파일에 안 잡힌다. 그래서 다음 사람이 "재 봤는데 차이 없네" 하고 옵션을
 * 지우기 쉽다 — 되돌려도 화면은 똑같이 멀쩡해 보인다.
 *
 * ⚠️ **반대 방향도 똑같이 중요하다.** 오프스크린 버퍼(`render/grid.ts` ·
 * `render/animated-background.ts`)는 주 캔버스 **위에 합성**되므로 알파가
 * 있어야 한다. 여기에 `alpha: false` 를 퍼뜨리면 배경 타일이 서로를 가린다 —
 * "좋은 옵션이니 전부 붙이자"가 정확히 이 결함을 만든다.
 *
 * 그래서 lint 전역 룰이 아니라 계약 테스트다. `no-restricted-syntax` 는 한
 * 파일의 AST 만 보고 "이 캔버스가 화면에 붙는가 버퍼인가"를 구분할 수 없다.
 */

const MAIN_CANVAS = "src/widgets/topology-map-v2/ui/use-topology-loop.ts";
const OFFSCREEN = [
  "src/widgets/topology-map-v2/render/grid.ts",
  "src/widgets/topology-map-v2/render/animated-background.ts",
];

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("canvas 2d 컨텍스트 옵션 계약", () => {
  it("소스를 실제로 읽는다 — 빈 스캔은 통과가 아니라 결함이다", () => {
    expect(read(MAIN_CANVAS).length).toBeGreaterThan(1000);
    for (const rel of OFFSCREEN) expect(read(rel).length).toBeGreaterThan(200);
  });

  it("주 캔버스는 `alpha: false` 로 만든다", () => {
    const src = read(MAIN_CANVAS);
    expect(
      /getContext\(\s*["']2d["']\s*,\s*\{[^}]*alpha:\s*false/.test(src),
      "주 캔버스가 불투명 옵션 없이 만들어진다 — 컴포지터가 매 프레임 뒤 콘텐츠와 블렌딩한다",
    ).toBe(true);
  });

  it("오프스크린 버퍼에는 `alpha: false` 를 퍼뜨리지 않는다", () => {
    for (const rel of OFFSCREEN) {
      const src = read(rel);
      expect(
        /getContext\(\s*["']2d["']\s*,\s*\{[^}]*alpha:\s*false/.test(src),
        `${rel} 이 불투명으로 만들어진다 — 이 버퍼는 주 캔버스 위에 합성되므로 알파가 필요하다`,
      ).toBe(false);
    }
  });

  it("`willReadFrequently` 를 켜지 않는다 — 우리는 readback 을 안 한다", () => {
    // 명세: 이 힌트는 CPU(소프트웨어) 래스터를 유도해 readback 을 빠르게 한다.
    // `getImageData` 를 안 쓰는 렌더러가 켜면 GPU 가속을 스스로 버리는 순손해다.
    const all = [MAIN_CANVAS, ...OFFSCREEN].map(read).join("\n");
    expect(all.includes("willReadFrequently")).toBe(false);
  });

  it("컨텍스트 로스트를 잡는다 — 안 잡으면 브라우저가 복구를 시도하지 않는다", () => {
    // `contextlost` 를 preventDefault 하지 않으면 복구도, `contextrestored` 도
    // 없다. rAF 루프는 계속 도는데 화면만 비어 있고 예외도 안 난다.
    const src = read(MAIN_CANVAS);
    expect(src.includes('addEventListener("contextlost"'), "contextlost 미처리").toBe(true);
    expect(src.includes('addEventListener("contextrestored"'), "contextrestored 미처리").toBe(true);
    expect(src.includes("removeEventListener(\"contextlost\""), "리스너 정리 누락").toBe(true);
  });
});
