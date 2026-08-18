import { describe, expect, it } from "vitest";

import {
  computeDomainWatermarkAlpha,
  computeLabelAlpha,
  DOMAIN_LABEL_HANDOFF,
  measureLabelVerticalMetrics,
  resolveLabelBaselineY,
  resolveFlippedLabelBaselineY,
  scaledLabelFontSize,
  LABEL_NODE_CLEARANCE,
  LABEL_NODE_OUTLINE_ALLOWANCE,
} from "./labels";

/**
 * `render/labels.ts#draw`'s canvas text painting has no extractable
 * geometric invariant beyond the alpha formula below — its visual contrast/
 * legibility (light mode in particular) is a Design Guardian screenshot-review
 * question the design doc explicitly defers (§2.2: "라이트 대비는 P3 게이트에서
 * 스크린샷 필수"), left as `test.todo`.
 *
 * (label-clarity, 2026-07) — REDESIGN. Persona eval: domain names only
 * existed as an ultra-low-contrast far-field watermark; ego-revealed
 * children (capability/element) drew as unlabeled dark circles; the
 * selected/hovered node's own name never got a contrast floor. New contract:
 * - `project`/`domain`: readable at EVERY zoom band (not gated by farT at
 *   all here — the domain far-field spaced-caps watermark is a SEPARATE
 *   decorative effect drawn in `draw()`, not part of this alpha function).
 * - `capability`/`element`: eligibility ramps with the node's own
 *   `revealAlpha` (tier alpha, or the ego-reveal ramp when exempted) — "잡을
 *   수 있으면 읽을 수 있다" (if you can click it, you can read it).
 * - `egoState === "center"` (selected) or `isHovered`: ALWAYS 1, any kind,
 *   any zoom band — overrides everything except `dim`.
 * - `egoState === "dim"`: always 0, regardless of anything else.
 */
describe("computeLabelAlpha", () => {
  const base = { farT: 0, egoState: "normal" as const, isHovered: false, revealAlpha: 1 };

  it("project is always fully visible, at any farT/revealAlpha", () => {
    expect(computeLabelAlpha({ ...base, kind: "project", farT: 0 })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "project", farT: 1 })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "project", revealAlpha: 0 })).toBe(1);
  });

  it("domain reads at circuit (farT=0) and hands the anchor over at DOMAIN_LABEL_HANDOFF", () => {
    expect(computeLabelAlpha({ ...base, kind: "domain", farT: 0 })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "domain", farT: DOMAIN_LABEL_HANDOFF / 2 })).toBeCloseTo(0.5, 6);
    expect(computeLabelAlpha({ ...base, kind: "domain", farT: DOMAIN_LABEL_HANDOFF })).toBe(0);
    expect(computeLabelAlpha({ ...base, kind: "domain", farT: 1 })).toBe(0);
  });

  it("capability/element are ineligible below the hittable reveal threshold (0.5) — matches HITTABLE_MIN_TIER_ALPHA", () => {
    expect(computeLabelAlpha({ ...base, kind: "capability", revealAlpha: 0 })).toBe(0);
    expect(computeLabelAlpha({ ...base, kind: "capability", revealAlpha: 0.3 })).toBe(0);
    expect(computeLabelAlpha({ ...base, kind: "element", revealAlpha: 0.4 })).toBe(0);
  });

  it("capability/element ramp in once revealAlpha crosses 0.5, reaching full by ~0.85 — the 'ego-revealed child gets a label' fix", () => {
    expect(computeLabelAlpha({ ...base, kind: "capability", revealAlpha: 0.5 })).toBe(0);
    expect(computeLabelAlpha({ ...base, kind: "capability", revealAlpha: 0.7 })).toBeGreaterThan(0);
    expect(computeLabelAlpha({ ...base, kind: "capability", revealAlpha: 0.7 })).toBeLessThan(1);
    expect(computeLabelAlpha({ ...base, kind: "element", revealAlpha: 0.85 })).toBeCloseTo(1, 6);
    expect(computeLabelAlpha({ ...base, kind: "element", revealAlpha: 1 })).toBe(1);
  });

  it("is 0 whenever the node is dim, regardless of kind/farT/revealAlpha/hover", () => {
    expect(computeLabelAlpha({ ...base, kind: "project", egoState: "dim" })).toBe(0);
    expect(computeLabelAlpha({ ...base, kind: "domain", egoState: "dim", farT: 0 })).toBe(0);
    expect(computeLabelAlpha({ ...base, kind: "capability", egoState: "dim", revealAlpha: 1 })).toBe(0);
    expect(computeLabelAlpha({ ...base, kind: "capability", egoState: "dim", isHovered: true })).toBe(0);
  });

  it("the SELECTED (center) node is always fully readable, any kind/farT/revealAlpha (never just an unlabeled circle)", () => {
    expect(computeLabelAlpha({ ...base, kind: "capability", egoState: "center", revealAlpha: 0 })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "element", egoState: "center", revealAlpha: 0 })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "domain", egoState: "center", farT: 1 })).toBe(1);
  });

  it("the HOVERED node is always fully readable while hovered, same as selected", () => {
    expect(computeLabelAlpha({ ...base, kind: "capability", isHovered: true, revealAlpha: 0 })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "element", isHovered: true, revealAlpha: 0 })).toBe(1);
  });

  it("neighbor (ego-revealed, non-hovered, non-center) capability/element still follows the ramp — only its OWN revealAlpha decides eligibility", () => {
    expect(computeLabelAlpha({ ...base, kind: "capability", egoState: "neighbor", revealAlpha: 0 })).toBe(0);
    expect(computeLabelAlpha({ ...base, kind: "capability", egoState: "neighbor", revealAlpha: 1 })).toBe(1);
  });

  it.todo(
    "light-mode label color contrast (labelDomain/labelCapability/labelElement tokens) — design doc §2.2 explicitly defers exact light values to a P3 Design Guardian pass",
  );
});

/**
 * Live regression caught during label-clarity verification: at farT=1 (pure
 * constellation), `computeLabelAlpha`'s compact-domain-label formula is 0 —
 * correct on its own, but `ui/topology-frame-draw.ts`'s label-candidate
 * ELIGIBILITY gate used to check ONLY that value, so it skipped building a
 * candidate at all once it hit 0 — silently deleting the watermark
 * (`computeDomainWatermarkAlpha`) along with it. The far-field constellation
 * went completely nameless instead of keeping its atmosphere layer. The gate
 * now takes `Math.max(compactAlpha, watermarkAlpha)`; this locks down that
 * `computeDomainWatermarkAlpha` stays independently meaningful right where
 * the compact label goes to 0.
 */
describe("computeDomainWatermarkAlpha", () => {
  it("stays silent until the handoff, then ramps to full at the far-field constellation", () => {
    expect(computeDomainWatermarkAlpha(0, "normal")).toBe(0);
    expect(computeDomainWatermarkAlpha(DOMAIN_LABEL_HANDOFF, "normal")).toBe(0);
    expect(computeDomainWatermarkAlpha(1, "normal")).toBe(1);
  });

  /**
   * **한 앵커에 두 효과가 같이 있으면 안 된다** (2026-08-19, 돔 실측
   * `AΛI에이전트 연동동`). 종전 공식은 합이 1 인 크로스페이드라 중간 대역에서
   * 둘 다 살아 있었고, 3D 돔이 카메라를 그 대역에 세워 두면서 이름이 뭉개진
   * 채로 화면에 남았다. 이 시험이 그 겹침을 막는다 — farT 전 구간에서 두 알파
   * 중 **하나는 반드시 0** 이다.
   */
  it("never shares a frame with the compact label — one of the two is always 0", () => {
    for (let farT = 0; farT <= 1.0001; farT += 0.05) {
      const compact = computeLabelAlpha({ kind: "domain", farT, egoState: "normal", isHovered: false, revealAlpha: 1 });
      const watermark = computeDomainWatermarkAlpha(farT, "normal");
      expect(Math.min(compact, watermark), `farT=${farT.toFixed(2)} 에서 둘 다 보인다`).toBe(0);
    }
  });

  it("is 0 while dim, regardless of farT", () => {
    expect(computeDomainWatermarkAlpha(1, "dim")).toBe(0);
  });

  /**
   * Dive-zoom fix (owner symptom: the tracked-caps far-field watermark
   * overlapping the now-visible compact label — "V I E Views (Topo…" — during
   * a focus dive). `egoState` is `"normal"` ONLY when no focus is active at
   * all (`model/focus-state.ts#resolveNodeEgoState`); once ANY node is
   * focused, every domain's egoState resolves to `"center"`, `"neighbor"`, or
   * `"dim"` — never `"normal"` again. So gating the watermark to `egoState ===
   * "normal"` is exactly "alpha 0 whenever focusedNodeId != null", restoring
   * the instant focus clears (back to `"normal"`) — no separate focus param
   * needed.
   */
  it("is 0 while centered (focused) or neighbor — any focus active — regardless of farT", () => {
    expect(computeDomainWatermarkAlpha(1, "center")).toBe(0);
    expect(computeDomainWatermarkAlpha(1, "neighbor")).toBe(0);
    expect(computeDomainWatermarkAlpha(0.5, "center")).toBe(0);
    expect(computeDomainWatermarkAlpha(0.5, "neighbor")).toBe(0);
  });

  it("stays meaningful at farT=1 even though computeLabelAlpha's compact-label alpha is 0 there (the eligibility-gate regression)", () => {
    const compactAlpha = computeLabelAlpha({ kind: "domain", farT: 1, egoState: "normal", isHovered: false, revealAlpha: 1 });
    const watermarkAlpha = computeDomainWatermarkAlpha(1, "normal");
    expect(compactAlpha).toBe(0);
    expect(watermarkAlpha).toBe(1);
    expect(Math.max(compactAlpha, watermarkAlpha)).toBeGreaterThan(0.02);
  });
});

describe("resolveLabelBaselineY — 라벨이 자기 도형선에 닿지 않는다 (진입 검수 E-4)", () => {
  const KINDS = ["project", "domain", "capability", "element"] as const;

  it.each(KINDS)("%s — 글리프 top 이 외곽선 아래로 최소 여유를 지킨다", (kind) => {
    for (const fontScale of [1, 1.3, 1.9]) {
      const baseline = resolveLabelBaselineY(kind, 200, 40, fontScale);
      const glyphTop = baseline - scaledLabelFontSize(kind, fontScale);
      // 외곽선(선택 링)은 원판 밖 LABEL_NODE_OUTLINE_ALLOWANCE 까지 나간다.
      const outlineBottom = 200 + 40 + LABEL_NODE_OUTLINE_ALLOWANCE;
      expect(glyphTop - outlineBottom).toBeGreaterThanOrEqual(LABEL_NODE_CLEARANCE);
    }
  });

  it("종전 오프셋 식은 선택 링을 관통했다 — 이 함수가 그 자리를 고른 이유", () => {
    // 회귀 증거: 역량 라벨의 옛 베이스라인(y + r + 13)에서 글리프 top 은
    // 원판에서 2.5px 아래 — 선택 링(+6)보다 위다.
    const legacyBaseline = 200 + 40 + 13;
    const legacyGlyphTop = legacyBaseline - scaledLabelFontSize("capability", 1);
    expect(legacyGlyphTop).toBeLessThan(200 + 40 + LABEL_NODE_OUTLINE_ALLOWANCE);
    expect(resolveLabelBaselineY("capability", 200, 40, 1)).toBeGreaterThan(legacyBaseline);
  });

  it("큰 노드일수록 라벨도 함께 내려간다 (반지름 선형)", () => {
    const small = resolveLabelBaselineY("capability", 0, 10, 1);
    const large = resolveLabelBaselineY("capability", 0, 40, 1);
    expect(large - small).toBe(30);
  });

  it("뒤집힌 자리는 노드 위쪽 외곽선 밖에 앉는다", () => {
    const flipped = resolveFlippedLabelBaselineY(200, 40);
    expect(flipped).toBe(200 - 40 - LABEL_NODE_OUTLINE_ALLOWANCE - LABEL_NODE_CLEARANCE);
    // 아래쪽 자리보다 반드시 위다(뒤집기가 실제로 자리를 바꾼다).
    expect(flipped).toBeLessThan(resolveLabelBaselineY("capability", 200, 40, 1));
  });
});

/**
 * **라벨 상자의 세로 범위는 폰트에서 실측한다.**
 *
 * 종전 근사는 `ascent = fontSize` · `descent = 2`(상수)였다. descent 가
 * **상수인데 fontSize 는 줌에 따라 커져서**, 확대할수록 베이스라인 아래
 * 미예약분이 벌어졌다 — 한글 받침과 라틴 디센더가 상자 밖으로 나가는데
 * 억제 판정은 "안 겹친다"고 말한다.
 *
 * 재는 것은 두 가지다: ① 실측값이 있으면 그걸 쓴다 ② 없으면 **종전 근사로
 * 떨어진다**(jsdom·스텁 컨텍스트에서 0 높이 상자를 만들어 라벨이 전부 겹치게
 * 두지 않는다).
 */
describe("measureLabelVerticalMetrics — 세로 범위 실측", () => {
  const ctxWith = (metrics: Partial<TextMetrics> | null): CanvasRenderingContext2D =>
    ({
      font: "",
      measureText: () => (metrics ?? {}) as TextMetrics,
    }) as unknown as CanvasRenderingContext2D;

  it("`fontBoundingBox*` 가 있으면 그 값을 쓴다", () => {
    const ctx = ctxWith({ fontBoundingBoxAscent: 11, fontBoundingBoxDescent: 4 } as TextMetrics);
    // kind/scale 조합마다 캐시되므로 이 테스트만의 조합을 쓴다.
    const m = measureLabelVerticalMetrics(ctx, "element", 1.37);
    expect(m).toEqual({ ascent: 11, descent: 4 });
  });

  it("**descent 가 상수 2 가 아니다** — 이 결함의 핵심", () => {
    const ctx = ctxWith({ fontBoundingBoxAscent: 12, fontBoundingBoxDescent: 5 } as TextMetrics);
    const m = measureLabelVerticalMetrics(ctx, "capability", 1.41);
    expect(m.descent).toBe(5);
    expect(m.descent).not.toBe(2);
  });

  it("실측값이 없으면 종전 근사로 떨어진다 — 회귀 0", () => {
    // jsdom 은 fontBoundingBox* 를 안 준다. 그때 0 을 쓰면 상자 높이가 0 이 되어
    // 모든 라벨이 "안 겹친다"가 된다 — 근사가 그 함정을 막는다.
    const ctx = ctxWith({} as TextMetrics);
    const m = measureLabelVerticalMetrics(ctx, "domain", 1.43);
    expect(m.ascent).toBe(scaledLabelFontSize("domain", 1.43));
    expect(m.descent).toBe(2);
  });

  it("0 이나 음수는 실측으로 인정하지 않는다", () => {
    const ctx = ctxWith({ fontBoundingBoxAscent: 0, fontBoundingBoxDescent: 0 } as TextMetrics);
    const m = measureLabelVerticalMetrics(ctx, "project", 1.47);
    expect(m.ascent).toBe(scaledLabelFontSize("project", 1.47));
  });

  it("measureText 가 없는 스텁도 죽지 않는다", () => {
    const ctx = { font: "" } as unknown as CanvasRenderingContext2D;
    const m = measureLabelVerticalMetrics(ctx, "element", 1.51);
    expect(m.descent).toBe(2);
  });

  it("폰트당 1회만 측정한다 — 프레임마다 재는 비용을 지지 않는다", () => {
    let calls = 0;
    const ctx = {
      font: "",
      measureText: () => {
        calls += 1;
        return { fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 3 } as TextMetrics;
      },
    } as unknown as CanvasRenderingContext2D;
    measureLabelVerticalMetrics(ctx, "element", 1.59);
    measureLabelVerticalMetrics(ctx, "element", 1.59);
    measureLabelVerticalMetrics(ctx, "element", 1.59);
    expect(calls).toBe(1);
  });
});
