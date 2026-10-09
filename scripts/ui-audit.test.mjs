import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatSummary,
  offRampFindings,
  parseRampNames,
  regularityFindings,
  resolveContrast,
  selectorPath,
  shouldFail,
  visibleShadow,
} from "./lib/ui-audit-checks.mjs";

test("parseRampNames groups ramp properties and ignores comments and pair suffixes", () => {
  const css = `:root { --text-body: 1rem; /* --text-ghost: 2px; */ --text-body--line-height: var(--leading-body);
    --text-body--letter-spacing: 0; --leading-body: 1.25rem; --radius-chip: 6px; --shadow-a: 0 1px 2px red;
    --elevation-1: 0 2px 4px blue; --color-x: red; }`;
  assert.deepEqual(parseRampNames(css), {
    text: ["--text-body"],
    leading: ["--leading-body", "--text-body--line-height"],
    radius: ["--radius-chip"],
    shadow: ["--elevation-1", "--shadow-a"],
  });
});

test("resolveContrast composites alpha layers over the canvas before judging", () => {
  const solid = resolveContrast({ fg: "rgb(0, 0, 0)", bgStack: [], canvas: "#ffffff", fontSizePx: 14, fontWeight: "400" });
  assert.equal(solid.ratio, 21);
  const faded = resolveContrast({ fg: "rgba(0, 0, 0, 0.2)", bgStack: ["rgba(255, 255, 255, 0.5)"], canvas: "#ffffff", fontSizePx: 14, fontWeight: "400" });
  assert.equal(faded.passes, false);
  const large = resolveContrast({ fg: "rgb(118, 118, 118)", bgStack: [], canvas: "#ffffff", fontSizePx: 24, fontWeight: "400" });
  assert.equal(large.required, 3);
  assert.deepEqual(resolveContrast({ fg: "oklch(0.5 0 0)", bgStack: [], canvas: "#fff", fontSizePx: 14, fontWeight: "400" }), { unmeasured: true });
});

test("offRampFindings accepts ramp, ratio leading, zero, pill and transparent shadows", () => {
  const ramps = { text: ["14px"], leading: ["20px", "1.5"], radius: ["6px"], shadow: ["rgba(0, 0, 0, 0.3) 0px 1px 2px 0px"] };
  const samples = [
    { selector: "a", fontSize: "14px", lineHeight: "21px", radii: ["0px", "6px", "6px", "3.35544e+07px"], boxShadow: "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.3) 0px 1px 2px 0px" },
    { selector: "b", fontSize: "13px", lineHeight: "normal", radii: ["7px"], boxShadow: "rgba(0, 0, 0, 0.5) 0px 9px 9px 0px" },
    { selector: "b", fontSize: "13px", lineHeight: "normal", radii: [], boxShadow: "none" },
  ];
  assert.deepEqual(
    offRampFindings(samples, ramps).map((f) => `${f.selector} ${f.property}`),
    ["b font-size", "b border-radius", "b box-shadow"],
  );
  assert.equal(visibleShadow("rgba(0, 0, 0, 0) 0px 0px 0px 0px"), "none");
});

test("regularityFindings flags same-class same-row siblings whose heights differ", () => {
  const item = (top, height, classes = "DIV:card") => ({ selector: "div.card", classes, top, height });
  const found = regularityFindings([
    [item(0, 30), item(0, 50), item(0, 30)],
    [item(0, 30), item(0, 30.5), item(0, 30)],
    [item(0, 30), item(40, 50), item(80, 30)],
    [item(0, 30, ""), item(0, 50, ""), item(0, 30, "")],
  ]);
  assert.equal(found.length, 1);
  assert.deepEqual(found[0].heights, [30, 50, 30]);
});

test("selectorPath keeps the element and at most three ancestors", () => {
  const chain = [
    { tag: "button", id: "go", classes: ["a", "b", "c"] },
    { tag: "div", id: "", classes: ["row"] },
    { tag: "section", id: "", classes: [] },
    { tag: "main", id: "m", classes: [] },
    { tag: "body", id: "", classes: [] },
  ];
  assert.equal(selectorPath(chain), "main#m > section > div.row > button#go.a.b");
});

test("formatSummary and shouldFail follow the check order and failing set", () => {
  const empty = { overflow: [], occluded: [], overlap: [], target: [], "off-ramp": [], contrast: [], regularity: [], "scroll-end": [] };
  assert.equal(
    formatSummary("/ko/topology", 1024, { ...empty, occluded: [{}, {}] }),
    "/ko/topology @1024: overflow 0 · occluded 2 · overlap 0 · target 0 · off-ramp 0 · contrast 0 · regularity 0 · scroll-end 0",
  );
  assert.equal(shouldFail([{ findings: { ...empty, overlap: [{}], target: [{}], "off-ramp": [{}], regularity: [{}] } }]), false);
  assert.equal(shouldFail([{ findings: { ...empty, "scroll-end": [{}] } }]), true);
});
