import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("desktop readiness check proves Tauri macOS shell prerequisites", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-desktop-readiness.mjs"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /macOS desktop Tauri-shell readiness/);
  assert.match(result.stdout, /✓ Next\.js uses static export output/);
  assert.match(result.stdout, /✓ Next\.js image optimization is disabled/);
  assert.match(result.stdout, /✓ Next\.js emits trailing-slash routes/);
  assert.match(result.stdout, /✓ build script refreshes docs-vault before next build/);
  assert.match(result.stdout, /✓ CLI\/MCP setup gate is available/);
  assert.match(result.stdout, /✓ desktop runtime doctor is available/);
  assert.match(result.stdout, /✓ Tauri CLI alias is available through pnpm tauri/);
  assert.match(result.stdout, /✓ desktop dev script launches the Tauri shell/);
  assert.match(result.stdout, /✓ desktop build script targets a macOS \.app bundle/);
  assert.match(result.stdout, /✓ Tauri CLI dependency is installed/);
  assert.match(
    result.stdout,
    /✓ desktop quality bar names native launch, vault permissions, recent vaults, local data, agent setup, and offline routes/,
  );
  assert.match(
    result.stdout,
    /✓ desktop prototype smoke names docs, ontology, topology, and builder routes/,
  );
  assert.match(result.stdout, /✓ Tauri scaffold exists/);
  assert.match(result.stdout, /✓ Tauri loads the Next\.js static export from out\//);
  assert.match(result.stdout, /✓ Tauri bundle target includes macOS \.app/);
  assert.match(
    result.stdout,
    /ready: Tauri scaffold can wrap the static frontend for a macOS prototype/,
  );
});
