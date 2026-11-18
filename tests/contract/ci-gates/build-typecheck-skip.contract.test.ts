import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { FULL_LANE_COMMANDS } from "../../../scripts/ci/classify-change.mjs";

/**
 * `next build` may skip its type check only where the required Checks gate already ran
 * `pnpm typecheck` on the same program: the pull-request browser build, and a release, which
 * `admit-release` accepts only at the head of main (`workflow-security.contract.test.ts`).
 */

const WORKFLOWS = path.join(process.cwd(), ".github/workflows");
const SKIP = "ATLAS_BUILD_SKIP_TYPECHECK";

const executable = (source: string) => source.replace(/^\s*#.*$/gm, "");

describe("build type-check skip", () => {
  const files = readdirSync(WORKFLOWS).filter((name) => name.endsWith(".yml"));
  const skipping = files.filter((file) => executable(readFileSync(path.join(WORKFLOWS, file), "utf8")).includes(SKIP));

  it("is set only by the workflows whose commit the Checks gate type-checks", () => {
    expect(files.length, "no workflow was read").toBeGreaterThan(5);
    expect(skipping.sort()).toEqual(["e2e.yml", "release-macos.yml"]);
  });

  it("is honoured by the Next config and backed by a typecheck in the gates lane", () => {
    const nextConfig = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    expect(nextConfig).toContain(`ignoreBuildErrors: process.env.${SKIP} === '1'`);
    expect(FULL_LANE_COMMANDS.gates).toContain("pnpm typecheck");
  });

  it("covers every static build of a release and nothing after it", () => {
    const release = executable(readFileSync(path.join(WORKFLOWS, "release-macos.yml"), "utf8"));
    const steps = release.split(/(?=^ {6}- name: )/m).filter((step) => step.includes(SKIP));
    expect(steps.map((step) => /- name: (.+)/.exec(step)![1])).toEqual([
      "Build release app bundle",
      "Build Windows NSIS installer",
    ]);
    for (const step of steps) expect(step).toMatch(new RegExp(`^ {10}${SKIP}: "1"$`, "m"));
  });
});
