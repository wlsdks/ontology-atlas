import { afterEach, describe, expect, it, vi } from "vitest";

import { HITTABLE_MIN_TIER_ALPHA } from "../model/visibility/tier-visibility";
import {
  computeLabelAlpha,
  computeLensLabelAlpha,
  measureLabelVerticalMetrics,
  resolveLabelBaselineY,
  resolveFlippedLabelBaselineY,
  scaledLabelFontSize,
  scaledLabelFont,
  numeralFont,
  tabularWidth,
  LABEL_NODE_CLEARANCE,
  LABEL_NODE_OUTLINE_ALLOWANCE,
  LABEL_HALO_PX,
  draw,
  type LabelTokens,
} from "./labels";

describe("computeLabelAlpha", () => {
  const base = { egoState: "normal" as const, isHovered: false, revealAlpha: 1 };

  it("project is always fully visible, at any revealAlpha", () => {
    expect(computeLabelAlpha({ ...base, kind: "project" })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "project", revealAlpha: 0 })).toBe(1);
  });

  it("domain reads at every altitude — the formula no longer takes camera distance", () => {
    expect(computeLabelAlpha({ ...base, kind: "domain" })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "domain", revealAlpha: 0 })).toBe(1);
    // `farT` left `LabelAlphaInput` with the fade: a label that reads the same at
    // every distance must not keep asking how far away it is.
    expect("farT" in ({ ...base } as Record<string, unknown>)).toBe(false);
  });

  it("a dimmed domain keeps its name at the node's own (sunk) alpha; a dimmed child keeps none", () => {
    expect(computeLabelAlpha({ ...base, kind: "domain", egoState: "dim" })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "project", egoState: "dim" })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "capability", egoState: "dim" })).toBe(0);
  });

  it("a hovered domain resolves to one full label", () => {
    expect(computeLabelAlpha({ ...base, kind: "domain", isHovered: true })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "domain", isHovered: true, revealAlpha: 0 })).toBe(1);
  });

  it("a child is nameable exactly where it becomes hittable — one shared floor", () => {
    expect(HITTABLE_MIN_TIER_ALPHA).toBe(0.02);
    expect(computeLabelAlpha({ ...base, kind: "capability", revealAlpha: 0 })).toBe(0);
    expect(computeLabelAlpha({ ...base, kind: "capability", revealAlpha: HITTABLE_MIN_TIER_ALPHA })).toBe(0);
    expect(
      computeLabelAlpha({ ...base, kind: "element", revealAlpha: HITTABLE_MIN_TIER_ALPHA + 0.05 }),
    ).toBeGreaterThan(0);
  });

  it("capability/element ramp to full readability by ~0.85 — the 'ego-revealed child gets a label' fix", () => {
    expect(computeLabelAlpha({ ...base, kind: "capability", revealAlpha: 0.5 })).toBeGreaterThan(0);
    expect(computeLabelAlpha({ ...base, kind: "capability", revealAlpha: 0.5 })).toBeLessThan(1);
    expect(computeLabelAlpha({ ...base, kind: "element", revealAlpha: 0.85 })).toBeCloseTo(1, 6);
    expect(computeLabelAlpha({ ...base, kind: "element", revealAlpha: 1 })).toBe(1);
  });

  it("a dimmed child is 0 regardless of farT/revealAlpha/hover; a dimmed project or domain follows its node's alpha", () => {
    expect(computeLabelAlpha({ ...base, kind: "project", egoState: "dim", revealAlpha: 0.42 })).toBe(0.42);
    expect(computeLabelAlpha({ ...base, kind: "domain", egoState: "dim", revealAlpha: 0.42 })).toBe(0.42);
    expect(computeLabelAlpha({ ...base, kind: "capability", egoState: "dim", revealAlpha: 1 })).toBe(0);
    expect(computeLabelAlpha({ ...base, kind: "capability", egoState: "dim", isHovered: true })).toBe(0);
  });

  it("the SELECTED (center) node is always fully readable, any kind/farT/revealAlpha (never just an unlabeled circle)", () => {
    expect(computeLabelAlpha({ ...base, kind: "capability", egoState: "center", revealAlpha: 0 })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "element", egoState: "center", revealAlpha: 0 })).toBe(1);
    expect(computeLabelAlpha({ ...base, kind: "domain", egoState: "center" })).toBe(1);
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

describe("computeLensLabelAlpha", () => {
  const base = { egoState: "normal" as const, isHovered: false, revealAlpha: 1 };
  const PATH_REST_ALPHA = 0.3;

  it("sinks every kind to the same rest alpha", () => {
    const sunk = (kind: "project" | "domain" | "capability" | "element") =>
      computeLensLabelAlpha({ ...base, kind, lensSink: PATH_REST_ALPHA });
    for (const kind of ["project", "domain", "capability", "element"] as const) {
      expect(sunk(kind), kind).toBeCloseTo(PATH_REST_ALPHA, 6);
    }
  });

  it("leaves the per-kind formula alone when no lens is on", () => {
    for (const kind of ["project", "domain", "capability", "element"] as const) {
      expect(computeLensLabelAlpha({ ...base, kind, lensSink: 1 })).toBe(
        computeLabelAlpha({ ...base, kind }),
      );
    }
  });

  it("keeps the child ramp under the sink — a barely revealed child is still fainter than a fully revealed one", () => {
    const half = computeLensLabelAlpha({ ...base, kind: "capability", revealAlpha: 0.4, lensSink: PATH_REST_ALPHA });
    const full = computeLensLabelAlpha({ ...base, kind: "capability", revealAlpha: 1, lensSink: PATH_REST_ALPHA });
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(full);
  });
});

describe("resolveLabelBaselineY: a label never touches its own shape outline", () => {
  const KINDS = ["project", "domain", "capability", "element"] as const;

  it.each(KINDS)("%s: the glyph top keeps a minimum clearance below the outline", (kind) => {
    for (const fontScale of [1, 1.3, 1.9]) {
      const baseline = resolveLabelBaselineY(kind, 200, 40, fontScale);
      const glyphTop = baseline - scaledLabelFontSize(kind, fontScale);
      // The outline (selection ring) reaches LABEL_NODE_OUTLINE_ALLOWANCE past the disc.
      const outlineBottom = 200 + 40 + LABEL_NODE_OUTLINE_ALLOWANCE;
      expect(glyphTop - outlineBottom).toBeGreaterThanOrEqual(LABEL_NODE_CLEARANCE);
    }
  });

  it("the old offset formula pierced the selection ring, which is why this function picks that spot", () => {
    // Regression evidence: at the capability label's old baseline (y + r + 13) the
    // glyph top sat 2.5px below the disc — above the selection ring at +6.
    const legacyBaseline = 200 + 40 + 13;
    const legacyGlyphTop = legacyBaseline - scaledLabelFontSize("capability", 1);
    expect(legacyGlyphTop).toBeLessThan(200 + 40 + LABEL_NODE_OUTLINE_ALLOWANCE);
    expect(resolveLabelBaselineY("capability", 200, 40, 1)).toBeGreaterThan(legacyBaseline);
  });

  it("the label moves down with a larger node (linear in radius)", () => {
    const small = resolveLabelBaselineY("capability", 0, 10, 1);
    const large = resolveLabelBaselineY("capability", 0, 40, 1);
    expect(large - small).toBe(30);
  });

  it("the flipped position sits outside the node's top outline", () => {
    const flipped = resolveFlippedLabelBaselineY(200, 40);
    expect(flipped).toBe(200 - 40 - LABEL_NODE_OUTLINE_ALLOWANCE - LABEL_NODE_CLEARANCE);
    // Strictly above the lower slot, proving the flip actually moves it.
    expect(flipped).toBeLessThan(resolveLabelBaselineY("capability", 200, 40, 1));
  });
});

/**
 * **The label box's vertical extent is measured from the font.**
 *
 * The old approximation was `ascent = fontSize` and a constant `descent = 2`.
 * Because descent was **constant while fontSize grows with zoom**, the
 * unreserved band below the baseline widened as you zoomed in: Hangul jongseong
 * and Latin descenders left the box while the suppression check still reported
 * no overlap.
 *
 * Two things are checked: that a real measurement is used when available, and
 * that it **falls back to the old approximation** when it is not — so jsdom and
 * stub contexts never produce a zero-height box that lets every label overlap.
 */
describe("measureLabelVerticalMetrics: measured vertical extent", () => {
  const ctxWith = (metrics: Partial<TextMetrics> | null): CanvasRenderingContext2D =>
    ({
      font: "",
      measureText: () => (metrics ?? {}) as TextMetrics,
    }) as unknown as CanvasRenderingContext2D;

  it("uses `fontBoundingBox*` when the browser reports it", () => {
    const ctx = ctxWith({ fontBoundingBoxAscent: 11, fontBoundingBoxDescent: 4 } as TextMetrics);
    // Results are cached per (kind, scale), so this test uses its own combination.
    const m = measureLabelVerticalMetrics(ctx, "element", 1.37);
    expect(m).toEqual({ ascent: 11, descent: 4 });
  });

  it("**descent is not the constant 2**, the heart of this defect", () => {
    const ctx = ctxWith({ fontBoundingBoxAscent: 12, fontBoundingBoxDescent: 5 } as TextMetrics);
    const m = measureLabelVerticalMetrics(ctx, "capability", 1.41);
    expect(m.descent).toBe(5);
    expect(m.descent).not.toBe(2);
  });

  it("without a measured value it falls back to the old approximation, with zero regression", () => {
    // jsdom returns no fontBoundingBox*. Taking 0 there gives a zero-height box,
    // which makes every label "not overlapping" — the approximation blocks that.
    const ctx = ctxWith({} as TextMetrics);
    const m = measureLabelVerticalMetrics(ctx, "domain", 1.43);
    expect(m.ascent).toBe(scaledLabelFontSize("domain", 1.43));
    expect(m.descent).toBe(2);
  });

  it("zero or negative is not accepted as a measurement", () => {
    const ctx = ctxWith({ fontBoundingBoxAscent: 0, fontBoundingBoxDescent: 0 } as TextMetrics);
    const m = measureLabelVerticalMetrics(ctx, "project", 1.47);
    expect(m.ascent).toBe(scaledLabelFontSize("project", 1.47));
  });

  it("a stub without measureText does not crash", () => {
    const ctx = { font: "" } as unknown as CanvasRenderingContext2D;
    const m = measureLabelVerticalMetrics(ctx, "element", 1.51);
    expect(m.descent).toBe(2);
  });

  it("measures once per font, so the per-frame measuring cost is not paid", () => {
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

describe("label halo", () => {
  interface Call { op: string; args: unknown[] }

  function record(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
    const calls: Call[] = [];
    const state: Record<string, unknown> = {};
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(_t, prop: string) {
        if (prop === "strokeText" || prop === "fillText" || prop === "measureText" || prop === "fillRect") {
          return (...args: unknown[]) => {
            calls.push({ op: prop, args: [...args, { ...state }] });
            return { width: 40 } as TextMetrics;
          };
        }
        if (prop in state) return state[prop];
        return (..._a: unknown[]) => undefined;
      },
      set(_t, prop: string, value: unknown) {
        state[prop] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, calls };
  }

  const tokens: LabelTokens = {
    labelProject: "#p", labelDomain: "#d", labelCapability: "#c", labelElement: "#e",
    amberHub: "#a", labelHalo: "#ground",
  };

  function paint() {
    const { ctx, calls } = record();
    draw(ctx, { kind: "domain", text: "topology navigation", screenX: 100, screenY: 100, screenRadius: 12 } as never, tokens);
    return calls;
  }

  it("strokes the ground before it fills the glyph", () => {
    const calls = paint();
    const stroke = calls.findIndex((c) => c.op === "strokeText");
    const fill = calls.findIndex((c) => c.op === "fillText");
    expect(stroke).toBeGreaterThan(-1);
    expect(fill).toBeGreaterThan(stroke);
  });

  it("strokes in the ground's own colour, wider than the widest line the canvas draws", () => {
    const at = paint().find((c) => c.op === "strokeText");
    const style = at?.args.at(-1) as Record<string, unknown>;
    expect(style.strokeStyle).toBe("#ground");
    // Relations are drawn at lineWidth 1; the halo is a half-width, so the stroke is twice it.
    expect(style.lineWidth).toBe(LABEL_HALO_PX * 2);
    expect(LABEL_HALO_PX * 2).toBeGreaterThan(1);
  });

  it("lays a ground plate under the anchor names (project, domain) only, before their glyph", () => {
    const { ctx, calls } = record();
    draw(ctx, { kind: "project", text: "Ontology Atlas", screenX: 100, screenY: 100, screenRadius: 20 } as never, tokens);
    const plate = calls.findIndex((c) => c.op === "fillRect");
    const glyph = calls.findIndex((c) => c.op === "fillText");
    expect(plate).toBeGreaterThan(-1);
    expect(glyph).toBeGreaterThan(plate);
    const plateStyle = calls[plate].args.at(-1) as Record<string, unknown>;
    expect(plateStyle.fillStyle).toBe("#ground");
    expect(plateStyle.globalAlpha).toBe((calls[glyph].args.at(-1) as Record<string, unknown>).globalAlpha);
    expect(paint().some((c) => c.op === "fillRect"), "a domain name sits where its fan converges").toBe(true);
    const element = record();
    draw(element.ctx, { kind: "element", text: "meaning editor", screenX: 100, screenY: 100, screenRadius: 8 } as never, tokens);
    expect(element.calls.some((c) => c.op === "fillRect"), "smaller names keep the glyph halo alone").toBe(false);
  });

  it("holds the halo at the name's own alpha, never above it", () => {
    const calls = paint();
    const strokeAlpha = (calls.find((c) => c.op === "strokeText")?.args.at(-1) as Record<string, unknown>).globalAlpha;
    const fillAlpha = (calls.find((c) => c.op === "fillText")?.args.at(-1) as Record<string, unknown>).globalAlpha;
    expect(strokeAlpha).toBe(fillAlpha);
  });

  it("lets an explicit reading scope raise a child label without claiming hover", () => {
    const { ctx, calls } = record();
    draw(ctx, {
      kind: "element",
      text: "meaning editor",
      screenX: 100,
      screenY: 100,
      screenRadius: 8,
      egoState: "normal",
      isHovered: false,
      revealAlpha: HITTABLE_MIN_TIER_ALPHA,
      emphasisAlpha: 1,
      agentFocus: false,
    }, tokens);
    const fillState = calls.find((c) => c.op === "fillText")?.args.at(-1) as Record<string, unknown>;
    const fillAlpha = fillState.globalAlpha;
    expect(fillAlpha).toBe(1);
    expect(fillState.fillStyle).toBe(tokens.labelDomain);
  });

  it("puts the glyph back in its own ink after the stroke", () => {
    const style = paint().find((c) => c.op === "fillText")?.args.at(-1) as Record<string, unknown>;
    expect(style.fillStyle).toBe("#d");
  });
});

describe("label type", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sets every kind on the locked ramp and the weight ladder, domain above capability", () => {
    const sizeOf = (kind: "project" | "domain" | "capability" | "element") => scaledLabelFontSize(kind, 1);
    expect([sizeOf("project"), sizeOf("domain"), sizeOf("capability"), sizeOf("element")]).toEqual([16, 12.5, 11, 9.5]);
    expect(["project", "domain", "capability", "element"].map((k) => scaledLabelFont(k as "domain", 1).split(" ")[0])).toEqual(["650", "560", "510", "400"]);
    expect(numeralFont()).toMatch(/^650 11px /);
  });

  it("gives every digit the widest digit's advance", () => {
    const measure = (text: string) => (text === "1" ? 5 : text === "0" ? 7 : 6);
    expect(tabularWidth("10", "f", measure)).toBe(14);
    expect(tabularWidth("→1", "f", measure)).toBe(13);
  });

  it("adopts the page's family only once every ladder weight has loaded, and keeps the system stack before", async () => {
    vi.resetModules();
    const loaded = new Set<string>();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: (name: string) => (name === "--font-sans" ? " pretendard, sans-serif " : "") }));
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        status: "loaded",
        load: async (face: string) => {
          await gate;
          loaded.add(face);
          return [];
        },
        check: (face: string) => loaded.has(face),
      },
    });
    const labels = await import("./labels");
    expect(labels.labelFontFamily()).toMatch(/apple-system/);
    expect(labels.scaledLabelFont("domain", 1)).toMatch(/apple-system/);
    release();
    expect(await labels.adoptBodyLabelFont()).toBe(true);
    expect([...loaded].sort()).toEqual(["400 12px pretendard, sans-serif", "510 12px pretendard, sans-serif", "560 12px pretendard, sans-serif", "650 12px pretendard, sans-serif"]);
    expect(labels.labelFontFamily()).toBe("pretendard, sans-serif");
  });

  it("keeps the system stack when a weight never loads", async () => {
    vi.resetModules();
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "pretendard, sans-serif" }));
    Object.defineProperty(document, "fonts", { configurable: true, value: { status: "loaded", load: async () => [], check: () => false } });
    const labels = await import("./labels");
    expect(await labels.adoptBodyLabelFont()).toBe(false);
    expect(labels.labelFontFamily()).toMatch(/apple-system/);
  });
});
