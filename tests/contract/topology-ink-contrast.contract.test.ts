import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { realmDepthClarityAlpha } from "@/widgets/topology-map-v2/model/realm-transition";

/**
 * The contract that map ink sits above **WCAG 1.4.11 (non-text contrast 3:1)**.
 *
 * Background (measured 2026-07-31): **all eight** of the map's edge and node strokes
 * were below it — the brightest, the project stroke, at 2.78:1 and the darkest,
 * contains-l2, at 1.59:1. The 위계 (hierarchy) seat's on-screen measurement caught
 * the same thing from another angle: the contains line's peak luminance was 14.4
 * against a background of 13.3 — **the line was effectively absent** — and the
 * brightest thing on screen was the summary chip (102.5), not a connection. The
 * map's job is to show connections, and connections were the faintest thing on it.
 *
 * Why lint cannot do this: the verdict needs **another token's value** (the
 * background colour) plus the contrast formula. `no-restricted-syntax` is an AST
 * selector over one file and cannot compute values. See `design.md`, "layers lint
 * cannot see are handled by contract tests".
 */

const CSS = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

/** WCAG 1.4.11 — the contrast floor for non-text UI elements. */
const MIN_CONTRAST = 3;

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
    // 위계 seat's on-screen measurement (2026-07-31): chip peak luminance 102.5 against
    // child node 28.4 = **a 3.6× inversion**. The map's job is to show connections and
    // concepts, yet the summary button was the brightest thing. At rest the chip must
    // sit on the ramp's bottom step.
    const chip = ["topology-v2-cluster-chip-border-rest", "topology-v2-cluster-chip-ink-rest"].map(
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
    // 체계 seat's verdict (2026-07-31): these two draw the same tree depth twice.
    // Written separately, three pairs converged to within 0.02 contrast **by
    // coincidence** — luck, not a contract, and editing one side would split them with
    // no warning. So the **alias relationship** is pinned rather than the values. If the
    // value does not exist in two places, no rule to catch the drift is needed
    // (Carbon).
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
    // This is a relation **category**, not a hierarchy, so it is not a step on the
    // ladder (it is distinguished by a dashed stroke plus an indigo tint). No
    // cross-ladder ceiling such as "edge ≤ node × 0.8" is applied, because the premise
    // that the two ladders compete is wrong. Two constraints only: the WCAG floor, and
    // never speaking louder than any entity.
    const depends = contrast(readToken("topology-v2-edge-depends"), CANVAS);
    const loudestMark = contrast(readToken("topology-v2-node-stroke-project"), CANVAS);
    expect(depends).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(depends).toBeLessThan(loudestMark);
  });

  it("관문 스테이지가 엣지 잉크를 **강등**하지 않는다", () => {
    // The old `html[data-gateway-stage]` block was an override that raised edges back
    // when the workbench was darker. Once the defaults rose above 3:1, those values
    // were lower and demoted the gateway alone — so it was removed. Reviving it is
    // caught here.
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
    // 도해 (infoviz) seat's measurement (2026-08-18): multiplying
    // `--topology-v2-ink-depth-leaf` (#60606d, 3.19:1 on its own) by the S5 clarity
    // alpha of 0.84 gives a composited contrast of **2.58:1** on the map surface — a
    // shortfall the standalone check (the first test above) cannot catch. Measuring the
    // screen means compositing with the alpha the renderer actually multiplies by
    // (`realmDepthClarityAlpha`). (The 3D dome's depth fog is outside this floor by
    // owner deferral — `docs/DECISIONS.md` «3D 유예 목록», the 3D deferral list. This
    // contract is the 2D map's.)
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
