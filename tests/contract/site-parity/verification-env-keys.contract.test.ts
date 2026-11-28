import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The site reads its verification codes from `process.env` at call time, but the Vite build replaces
 * only the keys `vite.config.ts` lists under `define`: a key the deploy workflow sets and the config
 * omits reaches the build and is silently dropped, and the live site loses its verification tag.
 */
const ROOT = path.resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

const workflowKeys = [...read(".github/workflows/deploy-pages.yml").matchAll(/^\s+(ATLAS_PUBLIC_[A-Z_]+):/gmu)].map(
  (match) => match[1]!,
);
const definedKeys = new Set(
  [...read("vite.config.ts").matchAll(/'process\.env\.(ATLAS_PUBLIC_[A-Z_]+)'/gu)].map((match) => match[1]!),
);

describe("the deploy workflow's build keys reach the Vite build", () => {
  it("finds the keys the workflow sets, so the check does not idle", () => {
    expect(workflowKeys).toContain("ATLAS_PUBLIC_GOOGLE_SITE_VERIFICATION");
  });

  it("lists every one of them under `define` in vite.config.ts", () => {
    expect(workflowKeys.filter((key) => !definedKeys.has(key))).toEqual([]);
  });
});
