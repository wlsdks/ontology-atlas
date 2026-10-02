import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");

const readCode = (rel: string): string =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const LICENSED = {
  "src/views/download/ui/GatewayFx.tsx": "the gateway hero — the field is light itself",
  "src/shared/lib/star-emission.ts":
    "the walked-path star, inside a lens the person opened",
  "src/widgets/ontology-map/render/node-shapes.ts":
    "the owner-selected Galaxy node is a borderless light source",
  "src/widgets/ontology-map/galaxy/draw/cosmos-frame.ts": "the cosmos draws galaxies and stars as light",
  "src/widgets/ontology-map/galaxy/draw/cosmos-paint.ts": "galaxy glows and impostors are baked light",
} as const;

const GALAXY_ATMOSPHERE_FUNCTIONS = ["drawGalaxyNebula", "drawGalaxyMeteor"] as const;

const PLUS_LIGHTER_HOME = "src/widgets/ontology-map/light/";

function plusLighterUsers(): string[] {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "src", "app"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter((file) => /\.(ts|tsx|css)$/.test(file) && existsSync(join(repoRoot, file)))
    .filter((file) => /plus-lighter/.test(readCode(file)));
}

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}`);
  expect(start, `${name} is missing`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf("{", start);
  expect(open, `${name} has no body`).toBeGreaterThan(start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(open, index + 1);
  }
  throw new Error(`${name} has no closing brace`);
}

const BLOCK_KEYWORDS = /\b(for|if|while|switch|catch|else|try|do|finally)\s*$/;

function opensFunction(source: string, open: number): boolean {
  const before = source.slice(0, open).trimEnd();
  if (before.endsWith("=>")) return true;
  if (/\b(else|try|do|finally)$/.test(before)) return false;
  let end = before.replace(/:\s*[\w<>[\],.|\s]+$/, "").trimEnd();
  if (!end.endsWith(")")) return false;
  let depth = 0;
  for (let index = end.length - 1; index >= 0; index -= 1) {
    if (end[index] === ")") depth += 1;
    if (end[index] === "(") depth -= 1;
    if (depth === 0) {
      end = end.slice(0, index);
      break;
    }
  }
  return !BLOCK_KEYWORDS.test(end);
}

function unboundedLighter(source: string): number[] {
  const lines: number[] = [];
  for (const match of source.matchAll(/globalCompositeOperation\s*=\s*["']lighter["']/g)) {
    const opens: number[] = [];
    let bounded = false;
    for (let index = match.index! + match[0].length; index < source.length; index += 1) {
      const char = source[index];
      if (char === "{") opens.push(index);
      if (char === "}") {
        if (opens.length > 0) {
          opens.pop();
          continue;
        }
        let depth = 0;
        let open = index;
        for (; open >= 0; open -= 1) {
          if (source[open] === "}") depth += 1;
          if (source[open] === "{") depth -= 1;
          if (depth === 0) break;
        }
        if (opensFunction(source, open)) break;
        continue;
      }
      const rest = source.slice(index, index + 64);
      if (/^\.restore\(\)/.test(rest) || /^globalCompositeOperation\s*=\s*(?!["']lighter)/.test(rest)) {
        bounded = true;
        break;
      }
    }
    if (!bounded) lines.push(source.slice(0, match.index).split("\n").length);
  }
  return lines;
}

describe("캔버스 합성 — 발광은 허가된 곳에서만", () => {
  it.each(Object.entries(LICENSED))("%s bounds every lighter inside the function that sets it", (rel) => {
    const source = readCode(rel);
    expect((source.match(/globalCompositeOperation\s*=\s*["']lighter["']/g) ?? []).length, `${rel} sets no lighter`).toBeGreaterThan(0);
    expect(unboundedLighter(source), `${rel}: lighter set on these stripped lines is never restored in its function`).toEqual([]);
  });

  it.each(GALAXY_ATMOSPHERE_FUNCTIONS)(
    "galaxy-atmosphere.ts#%s 는 자기 함수 안에서 합성 모드를 되돌린다",
    (name) => {
      const body = functionBody(
        readCode("src/widgets/ontology-map/render/galaxy-atmosphere.ts"),
        name,
      );
      expect(body).toMatch(
        /ctx\.save\(\)[\s\S]*globalCompositeOperation\s*=\s*["']lighter["'][\s\S]*ctx\.restore\(\)/,
      );
    },
  );

  it("licenses plus-lighter only in the map's light layer, and the layer uses it", () => {
    const users = plusLighterUsers();
    expect(users.filter((file) => !file.startsWith(PLUS_LIGHTER_HOME))).toEqual([]);
    expect(users.some((file) => file.startsWith(PLUS_LIGHTER_HOME))).toBe(true);
  });

  it("걸어온 별은 십자를 달지 않는다 — 물러날 것이 없다", () => {
    const star = readCode("src/shared/lib/star-emission.ts");
    expect(
      /drawDiffractionSpike/.test(star),
      "걸어온 별이 다시 십자를 그린다 — 크기 스파이크와 한 점에서 겹친다",
    ).toBe(false);
  });
});
