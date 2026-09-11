import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../..');
const rustSource = readFileSync(resolve(repoRoot, 'src-tauri/src/lib.rs'), 'utf8');
const mcpSource = readFileSync(
  resolve(repoRoot, 'mcp/src/project-source-inspection.mjs'),
  'utf8',
);

function mcpConstant(name: string): string {
  const match = new RegExp(`^const ${name} = (.+);$`, 'm').exec(mcpSource);
  expect(match, `${name} is not declared in mcp/src/project-source-inspection.mjs`).toBeTruthy();
  return match![1]!.trim();
}

function rustConstant(name: string): string {
  const match = new RegExp(`^const ${name}: [^=]+= (.+);$`, 'm').exec(rustSource);
  expect(match, `${name} is not declared in src-tauri/src/lib.rs`).toBeTruthy();
  return match![1]!.trim();
}

/**
 * **The app mints the source receipt; a fresh MCP process reproduces it.**
 *
 * The 2026-08-03 decision ("The new MCP handoff re-verifies the person's source
 * connection on its own") makes `connect_project_source` re-run the app's bounded
 * inventory probe in a separate process and compare fingerprints. The two probes are
 * separate implementations — Rust in `src-tauri/src/lib.rs`, JavaScript in
 * `mcp/src/project-source-inspection.mjs` — so every bound they walk with has to be
 * the same number on both sides.
 *
 * If one side drifts, the failure is quiet in the worst direction: the fingerprints
 * differ over an unchanged tree, the receipt turns `review_required / source_changed`,
 * and the handoff reports drift that never happened. Types and lint pass either way,
 * and only the `mcp` CI lane notices — and only when a changed path selects it.
 *
 * That lane selection is how the cap itself went unnoticed: the repository crossed
 * 4000 visible files in #1558, which changed no `mcp/` path, so the first PR to run
 * the lane afterwards inherited a red `main`. The headroom case below is the cheap
 * early warning for the next time.
 */
describe('source inventory bounds — the app and the MCP probe must agree', () => {
  it('the file cap is one number on both sides', () => {
    expect(mcpConstant('SOURCE_INVENTORY_MAX_FILES')).toBe('8000');
    expect(rustConstant('SOURCE_INVENTORY_MAX_FILES')).toBe('8000');
  });

  it('the depth cap is one number on both sides', () => {
    expect(mcpConstant('SOURCE_INVENTORY_MAX_DEPTH')).toBe('20');
    expect(rustConstant('SOURCE_INVENTORY_MAX_DEPTH')).toBe('20');
  });

  it('the hashed-bytes cap is one number on both sides', () => {
    expect(mcpConstant('SOURCE_INVENTORY_MAX_HASH_BYTES')).toBe('32 * 1024 * 1024');
    expect(rustConstant('SOURCE_INVENTORY_MAX_HASH_BYTES')).toBe('32 * 1024 * 1024');
  });

  /**
   * The version string is hashed first on both sides, so it is part of the fingerprint
   * rather than a comment. A bump on one side alone invalidates every stored receipt
   * against the other surface.
   */
  it('the inventory version string is one value on both sides', () => {
    expect(mcpConstant('SOURCE_INVENTORY_VERSION')).toBe("'inventory-v2'");
    expect(rustConstant('SOURCE_INVENTORY_VERSION')).toBe('"inventory-v2"');
  });

  it('the pruned directory names are the same set on both sides', () => {
    const mcpMatch = /const SOURCE_PRUNE_DIR_NAMES = new Set\(\[([\s\S]*?)\]\)/.exec(mcpSource);
    expect(mcpMatch, 'SOURCE_PRUNE_DIR_NAMES is not a Set literal any more').toBeTruthy();
    const rustMatch = /const SOURCE_PRUNE_DIR_NAMES: &\[&str\] = &\[([\s\S]*?)\];/.exec(rustSource);
    expect(rustMatch, 'SOURCE_PRUNE_DIR_NAMES is not a slice literal any more').toBeTruthy();

    const names = (block: string) =>
      block
        .split(',')
        .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
        .sort();

    expect(names(mcpMatch![1]!)).toEqual(names(rustMatch![1]!));
    expect(names(mcpMatch![1]!)).toContain('node_modules');
  });

  /**
   * This repository is its own dogfood source root: `mcp/src/integration.test.mjs`
   * connects the checkout it runs in and asserts the receipt is `verified_current`.
   * Past the cap the probe truncates, the receipt turns `review_required`, and that
   * assertion fails — so the dogfood repository outgrowing the product's own bound is
   * a real defect here, not a hypothetical one.
   */
  it('the dogfood repository still fits inside the cap', () => {
    const cap = Number(mcpConstant('SOURCE_INVENTORY_MAX_FILES'));
    const visible = new Set(
      execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      })
        .split('\0')
        .filter(Boolean),
    );

    expect(
      visible.size,
      `this repository has ${visible.size} visible files against a cap of ${cap}; ` +
        'the bounded probe truncates past it and the MCP handoff receipt turns ' +
        'review_required — raise the cap in both probes with a docs/DECISIONS.md record',
    ).toBeLessThanOrEqual(cap);
  });
});
