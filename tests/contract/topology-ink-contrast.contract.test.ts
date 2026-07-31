import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 지도 잉크는 **WCAG 1.4.11(비텍스트 대비 3:1)** 위에 있어야 한다는 계약.
 *
 * 배경(2026-07-31 실측): 지도의 엣지·노드 stroke **여덟 개가 전부** 미달이었다
 * — 가장 밝은 project stroke 가 2.78:1, 가장 어두운 contains-l2 가 1.59:1.
 * 위계석 실물 실측이 같은 것을 다른 각도로 잡았다: contains 선의 피크 휘도가
 * 14.4 인데 배경이 13.3 — **선이 사실상 결석**이고, 화면에서 가장 밝은 것은
 * 연결선이 아니라 요약 칩(102.5)이었다. 지도의 일이 "연결을 보여주는 것"인데
 * 연결이 제일 흐렸다.
 *
 * 이 계약이 lint 로 안 되는 이유: 판정에 **다른 토큰의 값**(배경색)과 대비
 * 공식이 필요하다. `no-restricted-syntax` 는 한 파일의 AST 셀렉터라 값 계산을
 * 못 한다. `design.md` "lint 가 못 보는 층은 계약 테스트가 맡는다" 절 참고.
 */

const CSS = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

/** WCAG 1.4.11 — 비텍스트 UI 요소의 대비 하한. */
const MIN_CONTRAST = 3;

function readToken(name: string): string {
  // `:root` 블록의 정의만 읽는다 — 뒤따르는 스코프 오버라이드(`html[...]`)는
  // 별도 판정 대상이라 여기서 섞으면 어느 값을 잰 건지 흐려진다.
  const match = CSS.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`토큰을 못 찾음: --${name}`);
  return match[1];
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const CANVAS = "#08090a";

/** 잉크 사다리 — 순서가 곧 위계다. 값이 아니라 **순서**를 고정한다. */
const EDGE_LADDER = ["topology-v2-edge-contains-l2", "topology-v2-edge-contains", "topology-v2-edge-contains-l0"];
const NODE_LADDER = [
  "topology-v2-node-stroke-element",
  "topology-v2-node-stroke-capability",
  "topology-v2-node-stroke-domain",
  "topology-v2-node-stroke-project",
];

describe("topology ink contrast contract", () => {
  it("모든 엣지·노드 stroke 가 3:1 이상이다", () => {
    const tokens = [...EDGE_LADDER, ...NODE_LADDER, "topology-v2-edge-depends"];
    const failures = tokens
      .map((name) => ({ name, value: readToken(name), ratio: contrast(readToken(name), CANVAS) }))
      .filter((row) => row.ratio < MIN_CONTRAST);
    expect(failures.map((f) => `${f.name}=${f.value} (${f.ratio.toFixed(2)}:1)`)).toEqual([]);
  });

  it("containment 잉크 사다리의 순서가 유지된다 (l2 < 기본 < l0)", () => {
    const ratios = EDGE_LADDER.map((name) => contrast(readToken(name), CANVAS));
    for (let i = 1; i < ratios.length; i += 1) {
      expect(ratios[i], EDGE_LADDER[i]).toBeGreaterThan(ratios[i - 1]);
    }
  });

  it("노드 stroke 사다리의 순서가 유지된다 (element < capability < domain < project)", () => {
    const ratios = NODE_LADDER.map((name) => contrast(readToken(name), CANVAS));
    for (let i = 1; i < ratios.length; i += 1) {
      expect(ratios[i], NODE_LADDER[i]).toBeGreaterThan(ratios[i - 1]);
    }
  });

  it("관문 스테이지가 엣지 잉크를 **강등**하지 않는다", () => {
    // 구 `html[data-gateway-stage]` 블록은 워크벤치가 어둡던 시절 엣지를
    // 올려 주는 오버라이드였다. 기본값이 3:1 위로 올라간 뒤로는 그 값들이
    // 오히려 낮아 관문만 강등시켰다 — 그래서 제거했다. 누가 되살리면
    // 여기서 걸린다.
    const stageBlock = CSS.slice(CSS.indexOf("html[data-gateway-stage]"));
    const scoped = stageBlock.slice(0, stageBlock.indexOf("}"));
    for (const name of [...EDGE_LADDER, "topology-v2-edge-depends"]) {
      const override = scoped.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
      if (!override) continue;
      expect(contrast(override[1], CANVAS), `${name} 관문 오버라이드`).toBeGreaterThanOrEqual(
        contrast(readToken(name), CANVAS),
      );
    }
  });
});
