import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");
const readCode = (rel: string): string =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

function exportedFunction(source: string, name: string, nextExport: string): string {
  const start = source.indexOf(`export function ${name}`);
  const end = source.indexOf(nextExport, start + 1);
  expect(start, `${name} is missing`).toBeGreaterThanOrEqual(0);
  expect(end, `${name} has no bounded inventory end`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Galaxy living-sky paint contract", () => {
  it("inventories a dedicated borderless Galaxy node painter", () => {
    const source = readCode("src/widgets/ontology-map/render/node-shapes.ts");
    const galaxy = exportedFunction(source, "drawGalaxyNodeStar", "function strokeKindOutline");

    expect(galaxy).toContain("drawImage(sprite.corona");
    expect(galaxy).toContain("drawImage(sprite.heart");
    expect(galaxy).toContain('globalCompositeOperation = "lighter"');
    expect(galaxy).not.toContain("drawStarEmission");
    expect(galaxy).not.toContain("bodyPointsScratch");
    expect(galaxy).not.toContain("strokeKindOutline");
    expect(galaxy).not.toMatch(/ctx\.(?:stroke|strokeRect)\s*\(/);
  });

  it("keeps ordinary and walked Galaxy nodes on the same painter", () => {
    const frame = readCode("src/widgets/ontology-map/ui/topology-frame-draw.ts");
    const calls = frame.match(/drawGalaxyNodeStar\s*\(/g) ?? [];

    expect(calls.length, "ordinary + walked Galaxy star call sites").toBe(2);
    expect(frame).toMatch(/if\s*\(!domeOn\s*&&\s*!galaxyOn\)/);
  });

  it("keeps atmosphere out of reduced motion and out of non-Galaxy idle work", () => {
    const frame = readCode("src/widgets/ontology-map/ui/topology-frame-draw.ts");
    const loop = readCode("src/widgets/ontology-map/ui/use-topology-loop.ts");

    expect(frame).toMatch(/galaxyAtmosphereOn\s*&&\s*!reducedMotion[\s\S]*drawGalaxyMeteor/);
    expect(loop).toContain("galaxyAtmosphereActive: galaxyRef.current && !reducedMotionRef.current");
  });

  it("wires the stable Galaxy layout and the same attention rule into paint and hit testing", () => {
    const layout = readCode("src/widgets/ontology-map/model/galaxy-layout.ts");
    const frame = readCode("src/widgets/ontology-map/ui/topology-frame-draw.ts");
    const pointer = readCode("src/widgets/ontology-map/ui/topology-pointer-handlers.ts");

    expect(layout).toContain("export const GALAXY_ARM_COUNT = 3");
    expect(layout).toContain("export function computeGalaxyLayout");
    expect(layout).toContain("export function isGalaxyEdgeVisible");
    expect(frame).toMatch(
      /if\s*\(\s*galaxyOn\s*&&\s*!isGalaxyEdgeVisible\(edge,[\s\S]*?\)\s*\)\s*\{\s*continue;/,
    );
    expect(pointer).toMatch(
      /if\s*\(galaxyRef\?\.current\)\s*\{[\s\S]*?if\s*\(\s*!isGalaxyEdgeVisible\(edge,[\s\S]*?\)\s*\)\s*\{\s*continue;/,
    );
    expect(
      [frame, pointer].filter((source) => source.includes("isGalaxyEdgeVisible(edge")),
      "paint and picking must both consume the shared visibility rule",
    ).toHaveLength(2);
  });
});
