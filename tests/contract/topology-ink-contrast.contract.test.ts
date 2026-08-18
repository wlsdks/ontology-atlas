import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { realmDepthClarityAlpha } from "@/widgets/topology-map-v2/model/realm-transition";

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

/** 원시 선언(hex 또는 `var(...)`)을 그대로 읽는다. */
function readRaw(name: string): string {
  // `:root` 블록의 정의만 읽는다 — 뒤따르는 스코프 오버라이드(`html[...]`)는
  // 별도 판정 대상이라 여기서 섞으면 어느 값을 잰 건지 흐려진다.
  const match = CSS.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`토큰을 못 찾음: --${name}`);
  return match[1].trim();
}

/** 별칭(`var(--other)`)을 한 단계씩 따라가 최종 hex 를 얻는다. */
function readToken(name: string, depth = 0): string {
  if (depth > 4) throw new Error(`별칭이 너무 깊음: --${name}`);
  const raw = readRaw(name);
  const alias = raw.match(/^var\(\s*--([\w-]+)\s*\)$/);
  if (alias) return readToken(alias[1], depth + 1);
  const hex = raw.match(/^(#[0-9a-fA-F]{6})$/);
  if (!hex) throw new Error(`hex 도 별칭도 아님: --${name} = ${raw}`);
  return hex[1];
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

  it("크롬(클러스터 칩)은 rest 에서 어떤 노드보다 어둡다", () => {
    // 위계석 실물 실측(2026-07-31): 칩 피크 휘도 102.5 대 자식 노드 28.4 =
    // **3.6배 역전**. 지도의 일은 연결과 개념을 보여주는 것인데 요약 버튼이
    // 가장 밝았다. rest 에서 칩은 램프 맨 아래 단이어야 한다.
    const chip = ["topology-v2-cluster-chip-border-rest", "topology-v2-cluster-chip-ink-rest"].map(
      (name) => contrast(readToken(name), CANVAS),
    );
    const dimmestNode = contrast(readToken(NODE_LADDER[0]), CANVAS);
    for (const ratio of chip) {
      expect(ratio).toBeLessThan(dimmestNode);
      // 그래도 컨트롤이라 WCAG 1.4.11 하한은 지킨다 — 어둡게 하되 못 찾게
      // 만들지는 않는다.
      expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it("노드 stroke 와 containment 엣지가 **같은 깊이 축**을 참조한다", () => {
    // 체계석 판정(2026-07-31): 둘은 같은 트리 깊이를 두 번 그리는 것이다.
    // 따로 적었더니 세 짝이 대비 0.02 이내로 **우연히** 수렴했는데, 그건
    // 운이지 계약이 아니다 — 한쪽만 고치면 아무 경고 없이 갈라진다.
    // 그래서 값이 아니라 **별칭 관계**를 고정한다. 두 곳에 값이 존재하지
    // 않으면 드리프트를 잡을 룰 자체가 필요 없다(Carbon).
    const AXIS_PAIRS = [
      ["topology-v2-node-stroke-element", "topology-v2-edge-contains-l2", "leaf"],
      ["topology-v2-node-stroke-capability", "topology-v2-edge-contains", "mid"],
      ["topology-v2-node-stroke-domain", "topology-v2-edge-contains-l0", "top"],
    ] as const;
    for (const [nodeToken, edgeToken, step] of AXIS_PAIRS) {
      const expected = `var(--topology-v2-ink-depth-${step})`;
      expect(readRaw(nodeToken), nodeToken).toBe(expected);
      expect(readRaw(edgeToken), edgeToken).toBe(expected);
    }
  });

  it("`depends` 는 축 밖이되 가장 밝은 마크를 넘지 않는다", () => {
    // 위계가 아니라 관계 **범주**라 사다리의 한 단이 아니다(파선 + 인디고
    // 틴트로 구분). 그래서 "엣지 ≤ 노드 × 0.8" 같은 사다리 간 상한은 걸지
    // 않는다 — 두 사다리가 경쟁한다는 전제가 틀렸기 때문이다. 구속은 둘:
    // WCAG 하한, 그리고 어떤 개체보다 큰 소리를 내지 않는다.
    const depends = contrast(readToken("topology-v2-edge-depends"), CANVAS);
    const loudestMark = contrast(readToken("topology-v2-node-stroke-project"), CANVAS);
    expect(depends).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(depends).toBeLessThan(loudestMark);
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

  it("깊이 선명도 알파와 **합성해도** 잉크 사다리가 3:1 바닥 위다", () => {
    // 도해석 실측 (2026-08-18): `--topology-v2-ink-depth-leaf`(#60606d, 단독
    // 3.19:1)에 S5 선명도 알파 0.84 를 곱하면 지도 표면 위 합성 대비가
    // **2.58:1** — 단독 검사(위 첫 테스트)만으로는 안 잡히는 종류의 미달이다.
    // 렌더가 실제로 곱하는 알파(`realmDepthClarityAlpha`)로 합성한 값을 재야
    // 화면을 잰다. (3D 돔의 깊이 안개는 소유자 유예로 이 바닥 밖에 있다 —
    // `docs/DECISIONS.md` «3D 유예 목록». 이 계약은 2D 지도의 것이다.)
    const surface = readToken("topology-v2-canvas-bg-near");
    const compositeHex = (ink: string, alpha: number, bg: string): string => {
      const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
      const mix = (i: number) => Math.round(ch(ink, i) * alpha + ch(bg, i) * (1 - alpha));
      return `#${[1, 3, 5].map((i) => mix(i).toString(16).padStart(2, "0")).join("")}`;
    };
    const CASES: ReadonlyArray<readonly [token: string, depth: number]> = [
      ["topology-v2-ink-depth-top", 1],
      ["topology-v2-ink-depth-mid", 2],
      ["topology-v2-ink-depth-leaf", 3],
    ];
    for (const [token, depth] of CASES) {
      const alpha = realmDepthClarityAlpha(depth);
      const composed = compositeHex(readToken(token), alpha, surface);
      expect(
        contrast(composed, surface),
        `${token} × 알파 ${alpha} 합성`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});
