import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { blankComments } from "../../scripts/quality/source-language/inventory.mjs";

const LICENSED = {
  "src/shared/lib/webgl-probe.ts": "the renderer probe that decides whether WebGL is hardware",
  "src/widgets/ontology-map/light/light-layer.ts": "the map's light layer, which draws light only",
  "src/views/download/lib/hero-atlas-scene.ts": "the gateway hero's three.js scene",
  "src/views/library/expressive/constellation-scene.ts": "the Library constellation's three.js scene",
} as const;

const WEBGL = /getContext\(\s*["'`](?:webgl2?|experimental-webgl)["'`]|\bWebGLRenderer\b/;

function productSources(): string[] {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "src", "app"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.(test|spec)\.tsx?$/.test(file) && existsSync(file));
}

function opensWebgl(file: string, source: string): boolean {
  return WEBGL.test(blankComments(file, source));
}

describe("WebGL context census", () => {
  const openers = productSources().filter((file) => opensWebgl(file, readFileSync(file, "utf8")));

  it("opens a WebGL context only in the probe, the light layer and the two three.js scenes", () => {
    expect(openers.filter((file) => !(file in LICENSED))).toEqual([]);
  });

  it("finds every licensed opener, so the census is not reading an empty tree", () => {
    expect([...openers].sort()).toEqual(Object.keys(LICENSED).sort());
  });

  it("counts a context opened in code and ignores one named in a comment", () => {
    expect(opensWebgl("probe.ts", 'const gl = canvas.getContext("webgl2");')).toBe(true);
    expect(opensWebgl("probe.ts", "const renderer = new THREE.WebGLRenderer();")).toBe(true);
    expect(opensWebgl("probe.ts", '// canvas.getContext("webgl2") is not opened here\nexport const x = 1;')).toBe(false);
  });
});
