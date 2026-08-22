import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { composite, contrastRatio, parseColor } from "../../scripts/lib/contrast.mjs";
import { stripComments } from "../../scripts/lib/static-surface-census.mjs";

/**
 * **Ink licence on alpha tint surfaces — including hover** (2026-08-15).
 *
 * ## Where the hole was — three contracts stepped past it side by side
 *
 * This repository already has three ink licences, and none of them looks here:
 *
 * | Contract | Jurisdiction | Why it cannot see this place |
 * |---|---|---|
 * | `accent-ink-contrast` | **indigo** ink on tint | out of jurisdiction when the ink is danger/success/amber |
 * | `brand-fill-ink-license` | **opaque** brand surfaces | out of jurisdiction when the surface is an alpha tint |
 * | `quaternary-ink-surface` | overlay steps on achromatic backgrounds | a colour-mixed surface is not on that ladder |
 *
 * **Alpha tint surface × non-indigo ink** fell through the gap entirely, and one
 * defect really leaked: the studio's delete-confirmation chip turns on a
 * `--color-danger-a32` surface on hover, and `--color-danger-text` on top of it was
 * below AA **on every host surface** (canvas 4.30 · panel 4.05 · elevated 3.72).
 * At rest it was 5.32, so **hover was making it harder to read.**
 *
 * No value was wrong — both `danger-a32` and `danger-text` are legitimate ramp
 * tokens. What was wrong is the **place** (`design-gates.md`, 「값이 아니라 «자리»
 * 가 토큰을 정한다」 — the place, not the value, decides the token), and on top of
 * that `a32` was a token used **14 times as a border and once as a surface** (that
 * defect).
 *
 * ## Why hover is especially dangerous
 *
 * Inventory of hover surfaces (2026-08-15): **222 improve contrast, 73 worsen it.**
 * 71 of the 73 are places where only the surface changes — the ink stays and the
 * surface brightens, which is this app's hover default. Most do not break today
 * because of the **starting point**, not a rule: most of those 71 start at 16–18:1
 * and stay above 14 after losing 1–2. **Only places starting from a low-contrast
 * ink (danger · accent · tertiary) broke, and all three that broke were exactly
 * those.**
 *
 * ## The verdict is a calculation, not an allowlist
 *
 * Same construction as `brand-fill-ink-license` — token values are read from
 * `app/globals.css` and the composited contrast is computed. A hand-written list
 * goes silently wrong the day the ramp moves.
 *
 * The host surface cannot be known from source alone, so it is measured **on all
 * four opaque surfaces**. Passing on any one leaves it as "depends on the place"
 * (the borderline list); **failing on all of them is a host-independent defect** and
 * turns red. That threshold is what keeps this contract from catching innocents by
 * guesswork.
 */

const ROOT = process.cwd();
const css = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");

type Rgba = readonly number[];

function cssToken(name: string): Rgba | null {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  if (!m) return null;
  const v = m[1].trim();
  if (v.startsWith("var(")) return cssToken(v.slice(4, -1).trim());
  return (parseColor(v) as Rgba) ?? null;
}

/** The app's four opaque host surfaces — an alpha surface sits on one of them. */
const HOSTS = ["--color-canvas", "--color-panel", "--color-elevated", "--topology-v2-panel-surface"]
  .map((n) => [n, cssToken(n)] as const)
  .filter((e): e is readonly [string, Rgba] => e[1] !== null);

/** The body-text threshold. This app's control type is 9.5–14px, so the large-text relaxation never applies. */
const AA = 4.5;

const ratio = (ink: Rgba, bg: Rgba) => contrastRatio(composite(ink, bg), bg);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
      continue;
    }
    if (/\.tsx$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p);
  }
  return out;
}

/**
 * Scans by className literal — an opening-tag parser has already swallowed dozens
 * of elements as one "tag" in this repository (see `brand-fill-ink-license`'s
 * preamble). Artefacts are discarded using the property that a className literal
 * cannot contain JSX.
 */
const JSX_INSIDE = /<[A-Za-z/]/;
const literals = (src: string): string[] =>
  [...src.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)]
    .map((m) => m[1] ?? m[2] ?? m[3] ?? "")
    .filter((s) => !JSX_INSIDE.test(s));

/**
 * **Reads the tone → ink table from the value layer.**
 *
 * When this contract was first switched on, a probe found a hole: reverting the
 * very defect it had fixed (the `StudioLaneOverlays` delete-confirmation chip) left
 * it **green**. The className literal carried no ink — that place's ink comes from
 * `tone: "danger"`, and tone is not a string but **another property of the
 * `controlClass` call**.
 *
 * The scanner's unit (the literal) was smaller than the defect's unit (the call).
 * That is the opposite direction of the lesson learned on 2026-08-15 (9) — **a unit
 * too coarse or too fine misses exactly that much.** So the call block is scanned
 * alongside the literals.
 *
 * The table is **read** from `control-class.ts` rather than copied — a value
 * written in two places starts drifting from then on (Carbon).
 */
function toneInkMap(): Map<string, string> {
  const src = readFileSync(path.join(ROOT, "src/shared/ui/control-class.ts"), "utf8");
  const out = new Map<string, string>();
  for (const m of src.matchAll(/^\s{6}([a-zA-Z]+): 'text-\[color:var\((--[a-z0-9-]+)\)\]'/gm)) {
    out.set(m[1], m[2]);
  }
  return out;
}

/** Terminates `controlClass({ … })` by brace depth, so it is not cut at a `=>`. */
function callBlocks(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/controlClass\(\{/g)) {
    let depth = 0;
    let quote: string | null = null;
    let i = m.index! + "controlClass(".length;
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== "\\") quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (!depth) {
          i += 1;
          break;
        }
      }
    }
    out.push(src.slice(m.index!, i));
  }
  return out;
}

/** Hover surfaces — alpha (non-opaque) only. Opaque surfaces belong to the brand-fill contract. */
const HOVER_FACE = /hover:bg-\[color:var\((--[a-z0-9-]+)\)\]/g;
/** The ink the same literal carries — a hover ink wins when present. */
const HOVER_INK = /hover:text-\[color:var\((--[a-z0-9-]+)\)\]/;
const REST_INK = /(?:^|[\s"'`])text-\[color:var\((--[a-z0-9-]+)\)\]/;

interface Offender {
  where: string;
  face: string;
  ink: string;
  worst: number;
  best: number;
}

function scan() {
  const offenders: Offender[] = [];
  const boundary: Offender[] = [];
  const seen = new Set<string>();
  const tones = toneInkMap();
  let facesSeen = 0;
  let judged = 0;

  const consider = (rel: string, unit: string, inkFallback?: string) => {
    HOVER_FACE.lastIndex = 0;
    for (const fm of unit.matchAll(HOVER_FACE)) {
      facesSeen += 1;
      const face = cssToken(fm[1]);
      if (!face || face[3] >= 1) continue;
      const inkName =
        (HOVER_INK.exec(unit) ?? REST_INK.exec(unit))?.[1] ?? inkFallback;
      if (!inkName) continue;
      const ink = cssToken(inkName);
      if (!ink) continue;
      const key = `${rel}|${fm[1]}|${inkName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      judged += 1;
      const ratios = HOSTS.map(([, host]) => ratio(ink, composite(face, host)));
      const worst = Math.min(...ratios);
      const best = Math.max(...ratios);
      const row = { where: rel, face: fm[1], ink: inkName, worst, best };
      if (best < AA) offenders.push(row);
      else if (worst < AA) boundary.push(row);
    }
  };

  for (const dir of ["src", "app"]) {
    for (const file of walk(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      const src = stripComments(readFileSync(file, "utf8"));
      // ① Call blocks — covers places whose ink arrives through `tone:`.
      for (const block of callBlocks(src)) {
        const tone = /tone:\s*["']([a-zA-Z]+)["']/.exec(block)?.[1];
        consider(rel, block, tone ? tones.get(tone) : undefined);
      }
      // ② Literals — covers what is outside a call (hoisted constants, native elements).
      for (const literal of literals(src)) {
        consider(rel, literal);
      }
    }
  }
  return { offenders, boundary, facesSeen, judged };
}

describe("호버 틴트 면 위의 잉크 — 계산이 판정한다", () => {
  const census = scan();

  it("탐지기가 공회전하지 않는다 — 호스트가 실재하고 호버 면을 실제로 찾는다", () => {
    expect(HOSTS.length, "호스트 표면 토큰을 못 읽었다").toBeGreaterThanOrEqual(3);
    for (const [name, host] of HOSTS) {
      expect(host[3], `${name} 이 불투명하지 않다 — 호스트의 전제가 깨진다`).toBe(1);
    }
    expect(census.facesSeen, "호버 면을 하나도 못 찾았다 — 정규식이 램프와 어긋났다").toBeGreaterThan(20);
    expect(census.judged, "잉크까지 짝지어 판정한 자리가 없다").toBeGreaterThan(5);
  });

  it("분리의 근거가 아직 실재한다 — 실제로 AA 를 깨는 짝이 계산 가능하다", () => {
    /*
     * `/gate-probe`: a detector idling on an empty set is forbidden. The day this
     * assertion turns red is the day the danger ramp has converged enough to pass on
     * any tint, and that is when this contract's threshold is re-evaluated.
     */
    const ink = cssToken("--color-danger-text")!;
    const face = cssToken("--color-danger-a32")!;
    const worst = Math.min(...HOSTS.map(([, h]) => ratio(ink, composite(face, h))));
    expect(
      worst,
      "danger-a32 면 위 danger-text 가 이제 AA 를 넘는다 — 이 계약의 존재 이유를 재평가하라",
    ).toBeLessThan(AA);
  });

  it("위반 0 — 어느 호스트에서도 못 넘는 호버 짝은 없다", () => {
    const lines = census.offenders.map(
      (o) => `${o.where}: hover ${o.face} × ${o.ink} — 최선 ${o.best.toFixed(2)} (필요 ${AA})`,
    );
    expect(
      lines,
      "호버 틴트 면 위 잉크가 **어느 호스트 표면에서도** AA 에 못 미친다.\n" +
        "값이 아니라 짝이 틀린 것이다 — 면을 한 단 내리거나(같은 색 가족의 낮은 알파)\n" +
        "잉크를 올려라. 알파 토큰의 역할(보더용/면용)을 실사용으로 확인할 것.\n" +
        lines.join("\n"),
    ).toEqual([]);
  });

  it("경계 자리는 세어만 둔다 — 표면을 옮기면 조용히 깨지는 자리들", () => {
    /*
     * Pairs that pass only on the surface they currently sit on. Not defects, but they
     * break if moved, so a growing count means those places need opening. Today's
     * measurement is pinned as the cap; lowering it is free.
     */
    const lines = census.boundary.map(
      (o) => `${o.where}: ${o.face} × ${o.ink} — ${o.worst.toFixed(2)}~${o.best.toFixed(2)}`,
    );
    expect(lines.length, `경계 자리가 늘었다:\n${lines.join("\n")}`).toBeLessThanOrEqual(12);
  });

  it("탐지기가 심은 위반을 잡고 정상 짝은 놓아준다", () => {
    const judge = (literal: string) => {
      const out: string[] = [];
      HOVER_FACE.lastIndex = 0;
      for (const fm of literal.matchAll(HOVER_FACE)) {
        const face = cssToken(fm[1]);
        if (!face || face[3] >= 1) continue;
        const inkName = (HOVER_INK.exec(literal) ?? REST_INK.exec(literal))?.[1];
        if (!inkName) continue;
        const ink = cssToken(inkName)!;
        const best = Math.max(...HOSTS.map(([, h]) => ratio(ink, composite(face, h))));
        if (best < AA) out.push(fm[1]);
      }
      return out;
    };

    expect(
      judge("text-[color:var(--color-danger-text)] hover:bg-[color:var(--color-danger-a32)]"),
      "심은 위반(고친 그 짝)을 못 잡는다",
    ).toHaveLength(1);
    expect(
      judge("text-[color:var(--color-danger-text)] hover:bg-[color:var(--color-danger-a12)]"),
      "고친 짝을 위반으로 센다 — 그러면 고칠 이유가 사라진다",
    ).toEqual([]);
    expect(
      judge("hover:bg-[color:var(--color-overlay-1)]"),
      "잉크를 모르는 자리는 판정하지 않는다",
    ).toEqual([]);
    expect(
      judge("text-[color:var(--color-text-on-accent)] hover:bg-[color:var(--color-indigo-brand-hover)]"),
      "불투명 면은 brand-fill-ink-license 의 관할이다",
    ).toEqual([]);
    expect(
      judge(
        "text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-danger-a32)] hover:text-[color:var(--color-text-primary)]",
      ),
      "호버 잉크가 있으면 그것이 쉬는 잉크를 이겨야 한다",
    ).toEqual([]);
  });
});
