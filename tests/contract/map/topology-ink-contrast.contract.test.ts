
import { describe, expect, it } from "vitest";

import { realmDepthClarityAlpha } from "@/widgets/ontology-map/model/realm/realm-transition";
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * Map ink must clear WCAG 1.4.11 (3:1 non-text contrast) against the background. The check needs
 * another token value plus the contrast formula, which a lint selector cannot compute.
 */

const CSS = readGlobalCss();

/** WCAG 1.4.11 — the contrast floor for non-text UI elements. */
const MIN_CONTRAST = 3;

/**
 * WCAG 1.4.3 text floor for the map labels. The large-text exemption does not reach them: sizes are
 * 15 / 10.5 / 10 / 9.5px in `LABEL_FONT_SIZE`, so the resting sizes must pass.
 */
const MIN_TEXT_CONTRAST = 4.5;

/** Reads the raw declaration (a hex or a `var(...)`) as written. */
function readRaw(name: string): string {
  // Reads definitions from the `:root` block only — later scoped overrides
  // (`html[...]`) are judged separately, and mixing them here blurs which value was
  // measured.
  const match = CSS.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`토큰을 못 찾음: --${name}`);
  return match[1].trim();
}

/** Follows aliases (`var(--other)`) one step at a time to the final hex. */
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

/** The ink ladder — its order is the hierarchy. The **order** is pinned, not the values. */
const EDGE_LADDER = ["map-edge-contains-l2", "map-edge-contains", "map-edge-contains-l0"];
/** The canvas **label** ladder — the same hierarchy, read as words rather than marks.
 *  `project` is deliberately outside the order: it is Layer-0 amber, a different family. */
const LABEL_LADDER = [
  "map-label-element",
  "map-label-capability",
  "map-label-domain",
];
const NODE_LADDER = [
  "map-node-stroke-element",
  "map-node-stroke-capability",
  "map-node-stroke-domain",
  "map-node-stroke-project",
];

describe("topology ink contrast contract", () => {
  it("모든 엣지·노드 stroke 가 3:1 이상이다", () => {
    const tokens = [...EDGE_LADDER, ...NODE_LADDER, "map-edge-depends"];
    const failures = tokens
      .map((name) => ({ name, value: readToken(name), ratio: contrast(readToken(name), CANVAS) }))
      .filter((row) => row.ratio < MIN_CONTRAST);
    expect(failures.map((f) => `${f.name}=${f.value} (${f.ratio.toFixed(2)}:1)`)).toEqual([]);
  });

  it("캔버스 라벨이 모두 본문 대비 4.5:1 이상이다", () => {
    // Measured against `--map-canvas-bg-near`, not the page canvas: that is
    // the surface the labels are actually painted over, and it is the lighter of the
    // two, so it is the conservative denominator.
    const surface = readToken("map-canvas-bg-near");
    const failures = LABEL_LADDER.concat("map-label-project")
      .map((name) => ({ name, value: readToken(name), ratio: contrast(readToken(name), surface) }))
      .filter((row) => row.ratio < MIN_TEXT_CONTRAST);
    expect(failures.map((f) => `${f.name}=${f.value} (${f.ratio.toFixed(2)}:1)`)).toEqual([]);
  });

  it("라벨 잉크 사다리의 순서가 유지된다 (element < capability < domain)", () => {
    // Raising a floor must not invert the hierarchy it sits in. The gateway's brighter
    // element ink (7.09:1) would have done exactly that here — above capability's
    // 5.33:1 — so the workbench takes the dimmest value that clears the text floor
    // instead of the gateway's value.
    const surface = readToken("map-canvas-bg-near");
    const ratios = LABEL_LADDER.map((name) => contrast(readToken(name), surface));
    for (let i = 1; i < ratios.length; i += 1) {
      expect(ratios[i], LABEL_LADDER[i]).toBeGreaterThan(ratios[i - 1]);
    }
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
    // At rest the cluster chip must sit on the ramp bottom step, below every node ink.
    const chip = ["map-cluster-chip-border-rest", "map-cluster-chip-ink-rest"].map(
      (name) => contrast(readToken(name), CANVAS),
    );
    const dimmestNode = contrast(readToken(NODE_LADDER[0]), CANVAS);
    for (const ratio of chip) {
      expect(ratio).toBeLessThan(dimmestNode);
      // It is still a control, so it keeps the WCAG 1.4.11 floor — darkened, but not made
      // impossible to find.
      expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it("노드 stroke 와 containment 엣지가 **같은 깊이 축**을 참조한다", () => {
    // Node stroke and containment edge draw the same tree depth, so the alias relationship is pinned
    // rather than the values.
    const AXIS_PAIRS = [
      ["map-node-stroke-element", "map-edge-contains-l2", "leaf"],
      ["map-node-stroke-capability", "map-edge-contains", "mid"],
      ["map-node-stroke-domain", "map-edge-contains-l0", "top"],
    ] as const;
    for (const [nodeToken, edgeToken, step] of AXIS_PAIRS) {
      const expected = `var(--map-ink-depth-${step})`;
      expect(readRaw(nodeToken), nodeToken).toBe(expected);
      expect(readRaw(edgeToken), edgeToken).toBe(expected);
    }
  });

  it("`depends` 는 축 밖이되 가장 밝은 마크를 넘지 않는다", () => {
    // This is a relation **category**, not a hierarchy, so it is not a step on the
    // ladder (it is distinguished by a dashed stroke plus an indigo tint). No
    // cross-ladder ceiling such as "edge ≤ node × 0.8" is applied, because the premise
    // that the two ladders compete is wrong. Two constraints only: the WCAG floor, and
    // never speaking louder than any entity.
    const depends = contrast(readToken("map-edge-depends"), CANVAS);
    const loudestMark = contrast(readToken("map-node-stroke-project"), CANVAS);
    expect(depends).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(depends).toBeLessThan(loudestMark);
  });

  it("관문 스테이지가 엣지 잉크를 **강등**하지 않는다", () => {
    // The gateway no longer mounts a map, so reviving the `html[data-gateway-stage]` scope fails here.
    expect(CSS).not.toMatch(/html\[data-gateway-stage\]\s*\{/);
  });

  it("깊이 선명도 알파와 **합성해도** 잉크 사다리가 3:1 바닥 위다", () => {
    // Composited with the alpha the renderer multiplies by (`realmDepthClarityAlpha`), since the
    // standalone check cannot see the loss. The 3D dome depth fog is outside this floor.
    const surface = readToken("map-canvas-bg-near");
    const compositeHex = (ink: string, alpha: number, bg: string): string => {
      const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
      const mix = (i: number) => Math.round(ch(ink, i) * alpha + ch(bg, i) * (1 - alpha));
      return `#${[1, 3, 5].map((i) => mix(i).toString(16).padStart(2, "0")).join("")}`;
    };
    const CASES: ReadonlyArray<readonly [token: string, depth: number]> = [
      ["map-ink-depth-top", 1],
      ["map-ink-depth-mid", 2],
      ["map-ink-depth-leaf", 3],
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
