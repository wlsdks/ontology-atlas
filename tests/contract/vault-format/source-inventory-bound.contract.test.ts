import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../..');
const sharedProbe = readFileSync(
  resolve(repoRoot, 'src-tauri/crates/project-source/src/source_inventory_limits.rs'),
  'utf8',
);
const appProbe = readFileSync(resolve(repoRoot, 'src-tauri/src/project_source/mod.rs'), 'utf8');

/**
 * What the script server's probe hashes, recorded 2026-11-28 from its inventory-limits module. A
 * receipt minted under one rule reads as changed under another, so the Rust crate must keep these
 * values for as long as receipts minted by either side are read.
 */
const RECORDED_PROBE = {
  version: 'inventory-v3',
  maxDepth: '20',
  maxHashBytes: '32 * 1024 * 1024',
  pruneDirNames: ['.cache', '.git', '.next', '.turbo', 'build', 'coverage', 'dist', 'node_modules', 'target'],
};

function sharedConstant(name: string): string {
  const match = new RegExp(`^pub const ${name}: [^=]+= (.+);$`, 'm').exec(sharedProbe);
  expect(match, `${name} is not declared in src-tauri/crates/project-source/src/source_inventory_limits.rs`).toBeTruthy();
  return match![1]!.trim();
}

/**
 * The app and the Rust MCP server measure a source folder with one crate
 * (`src-tauri/crates/project-source`), so one folder has one `inventory-v3` fingerprint whoever
 * asks, and what it hashes must stay what the JavaScript probe hashed: a receipt minted by the
 * older side reads as changed on the newer when any of this differs.
 */
describe('source inventory rule: the shared crate keeps the rule the JavaScript probe recorded', () => {
  it('the fingerprint version is the recorded word', () => {
    expect(sharedConstant('SOURCE_INVENTORY_VERSION')).toBe(`"${RECORDED_PROBE.version}"`);
  });

  it('the depth cap is the recorded number', () => {
    expect(sharedConstant('SOURCE_INVENTORY_MAX_DEPTH')).toBe(RECORDED_PROBE.maxDepth);
  });

  it('the hashed-bytes cap is the recorded number', () => {
    expect(sharedConstant('SOURCE_INVENTORY_MAX_HASH_BYTES')).toBe(RECORDED_PROBE.maxHashBytes);
  });

  it('the pruned directory names are the recorded set', () => {
    const sharedMatch = /pub const SOURCE_PRUNE_DIR_NAMES: \[&str; \d+\] = \[([\s\S]*?)\];/.exec(sharedProbe);
    expect(sharedMatch, 'SOURCE_PRUNE_DIR_NAMES is not an array literal any more').toBeTruthy();

    const names = (block: string) =>
      block
        .split(',')
        .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
        .sort();

    expect(names(sharedMatch![1]!)).toEqual(RECORDED_PROBE.pruneDirNames);
    expect(names(sharedMatch![1]!)).toContain('node_modules');
  });

  /**
   * The app used to walk with its own file cap and `inventory-v2`, so a repository past 16,000
   * files read as truncated in the app and whole in the MCP server. The app now calls the shared
   * probe and declares no bound of its own.
   */
  it('the app probe calls the shared crate and keeps no file cap or version of its own', () => {
    expect(appProbe).toMatch(/project_source::inspect_project_source/);
    expect(appProbe).not.toMatch(/SOURCE_INVENTORY_MAX_FILES/);
    expect(appProbe).not.toMatch(/inventory-v2/);
    expect(appProbe).not.toMatch(/const SOURCE_INVENTORY_/);
  });
});
