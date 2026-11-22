import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { composite, contrastRatio, parseColor } from "../../../scripts/lib/design/contrast.mjs";
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';
import { classNameOf, readClassSource, stringsOf } from "../lib/jsx-class-source";

/**
 * Quaternary ink is licensed only up to static neutral backgrounds (the three base steps plus a single
 * overlay-1 on canvas or panel); text on anything above starts at tertiary. A static scan cannot know
 * the background, so this recomputes the boundary from globals.css and a site assertion backs it.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

type JsxFact = { tag: string; start: number; end: number; classText: string; literalText: string; childText: string };

function readJsx(rel: string, text = read(rel)): JsxFact[] {
  const resolved = readClassSource(rel, text);
  const { source } = resolved;
  const facts: JsxFact[] = [];
  const collect = (node: ts.Node): void => {
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : undefined;
    if (opening) {
      const className = classNameOf(opening);
      facts.push({
        tag: opening.tagName.getText(source),
        start: node.getStart(source),
        end: node.end,
        classText: className?.initializer ? stringsOf(resolved, className.initializer).join(" ") : "",
        literalText: stringsOf(resolved, node, false).join(" "),
        childText: ts.isJsxElement(node) ? node.children.map((child) => child.getText(source)).join("") : "",
      });
    }
    ts.forEachChild(node, collect);
  };
  collect(source);
  return facts;
}

type Rgba = readonly number[];

function cssToken(css: string, name: string): Rgba {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`${name} is missing from globals.css`);
  const v = m[1].trim();
  if (v.startsWith("var(")) return cssToken(css, v.slice(4, -1).trim());
  const parsed = parseColor(v);
  if (!parsed) throw new Error(`cannot read the value of ${name} (${v}) as a colour`);
  return parsed as Rgba;
}

const css = readGlobalCss();
const stack = (...layers: Rgba[]) =>
  layers.reduce((bg, fg) => composite(fg as never, bg as never) as unknown as Rgba);
const ratioOn = (ink: Rgba, bg: Rgba) =>
  contrastRatio(composite(ink as never, bg as never), bg as never);

const canvas = cssToken(css, "--color-canvas");
const panel = cssToken(css, "--color-panel");
const elevated = cssToken(css, "--color-elevated");
const o1 = cssToken(css, "--color-overlay-1");
const o2 = cssToken(css, "--color-overlay-2");
const a14 = cssToken(css, "--color-indigo-a14");

const quaternary = cssToken(css, "--color-text-quaternary");
const tertiary = cssToken(css, "--color-text-tertiary");

describe("quaternary ink licence — down to the resting neutral backgrounds", () => {
  it("inside the licence: AA (4.5:1) on the bare three steps + overlay-1 over canvas/panel", () => {
    const licensed: Record<string, Rgba> = {
      canvas,
      panel,
      elevated,
      "canvas+overlay-1": stack(canvas, o1),
      "panel+overlay-1": stack(panel, o1),
    };
    for (const [name, bg] of Object.entries(licensed)) {
      const r = ratioOn(quaternary, bg);
      expect(r, `quaternary on ${name} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the basis of the boundary still exists — on raised backgrounds it really breaks AA", () => {
    expect(ratioOn(quaternary, stack(panel, o2))).toBeLessThan(4.5);
    expect(ratioOn(quaternary, stack(elevated, o1))).toBeLessThan(4.5);
    expect(ratioOn(quaternary, stack(panel, a14))).toBeLessThan(4.5);
  });

  it("the prescription holds — tertiary is AA on every raised background measured this time", () => {
    const raised: Record<string, Rgba> = {
      "panel+overlay-2": stack(panel, o2),
      "indigo-a14∘panel": stack(panel, a14),
      "overlay-1∘indigo-a14∘panel": stack(panel, a14, o1),
      "elevated+overlay-1": stack(elevated, o1),
    };
    for (const [name, bg] of Object.entries(raised)) {
      const r = ratioOn(tertiary, bg);
      expect(r, `tertiary on ${name} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the hierarchy gap remains — secondary/tertiary step ratio on canvas and panel ≥ 1.6", () => {
    const secondary = cssToken(css, "--color-text-secondary");
    for (const [name, bg] of Object.entries({ canvas, panel })) {
      const step = ratioOn(secondary, bg) / ratioOn(tertiary, bg);
      expect(step, `secondary/tertiary on ${name} is ${step.toFixed(2)}`).toBeGreaterThanOrEqual(1.6);
    }
  });

  it("the hierarchy gap remains — tertiary/quaternary step ratio on panel ≥ 1.06", () => {
    /*
     * The lowest tertiary/quaternary step ratio accepted on this ramp is 1.06 (the map panel ramp); below
     * it the hierarchy is dug into.
     */
    const step = ratioOn(tertiary, panel) / ratioOn(quaternary, panel);
    expect(step).toBeGreaterThanOrEqual(1.06);
  });
});

describe("spots caught by measurement do not go back — global search", () => {
  it("kbd and selected-row children are tertiary", () => {
    /*
     * cmdk's selection travels every row, so the slug and status spans fall under the same rule as the
     * kbd and the selected row's kind chip.
     */
    const search = readJsx("src/widgets/global-search/ui/GlobalSearch.tsx");
    const kbds = search.filter((element) => element.tag === "kbd");
    expect(kbds.length, "the search kbd is gone; find this assertion's subject again").toBeGreaterThan(0);
    for (const kbd of kbds) {
      expect(kbd.classText).toContain("--color-text-tertiary");
      expect(kbd.classText).not.toContain("--color-text-quaternary");
    }
    const rows = search.filter((element) => element.classText.includes("aria-selected:bg-[color:var(--color-indigo-a14)]"));
    expect(rows.length, "the selected-row grammar disappeared — find the target of this assertion again").toBeGreaterThan(0);
    for (const row of rows) {
      const inside = search.filter((element) => element.start >= row.start && element.end <= row.end);
      expect(
        [row.literalText, ...inside.map((element) => element.classText)].join(" ").includes("--color-text-quaternary"),
        "quaternary ink came back inside a selected row (indigo-a14 composite) — 4.39:1 falls short of AA. Start with tertiary.",
      ).toBe(false);
    }
  });

  it("probe: a class hoisted into a constant or a helper resolves to its value", () => {
    const facts = readJsx(
      "probe.tsx",
      [
        'const ROW = "aria-selected:bg-[color:var(--color-indigo-a14)]";',
        'const meta = () => cn("text-[color:var(--color-text-quaternary)]");',
        "// <span className=\"text-[color:var(--color-text-tertiary)]\" />",
        "export const Row = () => <div className={ROW}><span className={meta()} /></div>;",
      ].join("\n"),
    );
    expect(facts.map((fact) => [fact.tag, fact.classText])).toEqual([
      ["div", "aria-selected:bg-[color:var(--color-indigo-a14)]"],
      ["span", "text-[color:var(--color-text-quaternary)]"],
    ]);

    const shadowed = readJsx(
      "shadow.tsx",
      [
        "function A() { const meta = 'text-[color:var(--color-text-quaternary)]'; return <span className={meta} />; }",
        "function B() { const meta = 'text-[color:var(--color-text-tertiary)]'; return <span className={meta} />; }",
      ].join("\n"),
    );
    const both = "text-[color:var(--color-text-quaternary)] text-[color:var(--color-text-tertiary)]";
    expect(shadowed.map((fact) => fact.classText)).toEqual([both, both]);
  });
});

describe("spots caught by measurement do not go back — architecture profile row", () => {
  it("the scope description of a pressable profile row starts at tertiary", () => {
    const scopeLine = readJsx("src/views/architecture/ui/ArchitectureWorkbench.tsx").find(
      (element) => element.tag === "span" && /^\s*\{profile\.scopePaths\.join/.test(element.childText),
    );
    expect(scopeLine, "could not find the profile scope row — find the assertion target again").toBeDefined();
    expect(scopeLine?.classText).toContain("--color-text-tertiary");
    expect(scopeLine?.classText).not.toContain("--color-text-quaternary");
  });
});
