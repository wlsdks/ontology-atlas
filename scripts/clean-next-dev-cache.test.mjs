import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cleanNextDevCache } from "./clean-next-dev-cache.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

test("cleanNextDevCache removes only the generated .next/dev cache", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omo-next-dev-cache-"));
  const devFile = path.join(root, ".next", "dev", "server", "app-paths-manifest.json");
  const buildFile = path.join(root, ".next", "server", "app-paths-manifest.json");
  fs.mkdirSync(path.dirname(devFile), { recursive: true });
  fs.mkdirSync(path.dirname(buildFile), { recursive: true });
  fs.writeFileSync(devFile, "stale", "utf8");
  fs.writeFileSync(buildFile, "build", "utf8");

  const removed = cleanNextDevCache(root);

  assert.equal(removed, path.join(root, ".next", "dev"));
  assert.equal(fs.existsSync(path.join(root, ".next", "dev")), false);
  assert.equal(fs.readFileSync(buildFile, "utf8"), "build");
});

test("cleanNextDevCache is safe when .next/dev does not exist", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omo-next-dev-cache-empty-"));

  assert.doesNotThrow(() => cleanNextDevCache(root));
});

test("pre-push clears generated .next/dev types before typechecking", () => {
  const hook = fs.readFileSync(path.join(REPO_ROOT, ".githooks", "pre-push"), "utf8");
  const cleanIndex = hook.indexOf("scripts/clean-next-dev-cache.mjs");
  const typecheckIndex = hook.indexOf("exec tsc --noEmit");

  assert.ok(cleanIndex > -1, "pre-push should clear .next/dev before typecheck");
  assert.ok(typecheckIndex > -1, "pre-push should run typecheck");
  assert.ok(cleanIndex < typecheckIndex, "cache cleanup must happen before typecheck");
});
