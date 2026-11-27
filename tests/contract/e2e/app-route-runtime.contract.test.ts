import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pendingSpecs } from "./app-route-runtime-classifier";

/**
 * Every end-to-end spec that reaches an app screen runs on the faked app runtime
 * (`tests/e2e/desktop-rail-arrival-harness.ts`), because the installed app is the product and the
 * browser has no workbench. A spec that visits an app route without installing it, or that names a
 * browser-only door (`?shell=desktop`, `stubDirectoryPicker`, `useDogfoodSample`,
 * `demo:sample-source`), is still to move.
 *
 * `app-route-runtime-pending.json` names those specs. It only shrinks: a spec that is not on it
 * fails here, and so does an entry that is already clean or no longer exists. The list is empty
 * once every spec has moved. `node tests/contract/e2e/app-route-runtime-classifier.ts` prints it.
 */

const ROOT = process.cwd();
const pending: string[] = JSON.parse(
  readFileSync(join(ROOT, "tests/contract/e2e/app-route-runtime-pending.json"), "utf8"),
).specs;

describe("every app-route spec runs on the faked app runtime", () => {
  const found = pendingSpecs();

  it("lists no spec that is not already on the pending list", () => {
    expect(found.filter((spec) => !pending.includes(spec))).toEqual([]);
  });

  it("lists no entry that is already clean", () => {
    expect(pending.filter((spec) => !found.includes(spec))).toEqual([]);
  });

  it("names only specs that exist, sorted, once each", () => {
    expect(pending.filter((spec) => !existsSync(join(ROOT, spec)))).toEqual([]);
    expect(pending).toEqual([...new Set(pending)].sort());
  });
});
