import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../..');
const sharedProbe = readFileSync(
  resolve(repoRoot, 'src-tauri/crates/project-source/src/source_inventory_limits.rs'),
  'utf8',
);
const appProbe = readFileSync(resolve(repoRoot, 'src-tauri/src/project_source/mod.rs'), 'utf8');
const mcpSource = readFileSync(
  resolve(repoRoot, 'mcp/src/project-source/project-source-inventory-limits.mjs'),
  'utf8',
);

function mcpConstant(name: string): string {
  const match = new RegExp(`^export const ${name} = (.+);$`, 'm').exec(mcpSource);
  expect(match, `${name} is not exported by mcp/src/project-source/project-source-inventory-limits.mjs`).toBeTruthy();
  return match![1]!.trim();
}

function sharedConstant(name: string): string {
  const match = new RegExp(`^pub const ${name}: [^=]+= (.+);$`, 'm').exec(sharedProbe);
  expect(match, `${name} is not declared in src-tauri/crates/project-source/src/source_inventory_limits.rs`).toBeTruthy();
  return match![1]!.trim();
}

/**
 * The app and the Rust MCP server measure a source folder with one crate
 * (`src-tauri/crates/project-source`), so one folder has one `inventory-v3` fingerprint whoever
 * asks. The JavaScript probe is the second implementation until it is removed, and what it
 * hashes must be the same: a receipt one side minted reads as changed on the other when any of
 * this differs.
 */
describe('source inventory rule: the app, the Rust MCP server and the JavaScript probe agree on one', () => {
  it('the fingerprint version is one word on both sides', () => {
    expect(mcpConstant('SOURCE_INVENTORY_VERSION')).toBe("'inventory-v3'");
    expect(sharedConstant('SOURCE_INVENTORY_VERSION')).toBe('"inventory-v3"');
  });

  it('the depth cap is one number on both sides', () => {
    expect(mcpConstant('SOURCE_INVENTORY_MAX_DEPTH')).toBe('20');
    expect(sharedConstant('SOURCE_INVENTORY_MAX_DEPTH')).toBe('20');
  });

  it('the hashed-bytes cap is one number on both sides', () => {
    expect(mcpConstant('SOURCE_INVENTORY_MAX_HASH_BYTES')).toBe('32 * 1024 * 1024');
    expect(sharedConstant('SOURCE_INVENTORY_MAX_HASH_BYTES')).toBe('32 * 1024 * 1024');
  });

  it('the pruned directory names are the same set on both sides', () => {
    const mcpMatch = /export const SOURCE_PRUNE_DIR_NAMES = new Set\(\[([\s\S]*?)\]\)/.exec(mcpSource);
    expect(mcpMatch, 'SOURCE_PRUNE_DIR_NAMES is not a Set literal any more').toBeTruthy();
    const sharedMatch = /pub const SOURCE_PRUNE_DIR_NAMES: \[&str; \d+\] = \[([\s\S]*?)\];/.exec(sharedProbe);
    expect(sharedMatch, 'SOURCE_PRUNE_DIR_NAMES is not an array literal any more').toBeTruthy();

    const names = (block: string) =>
      block
        .split(',')
        .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
        .sort();

    expect(names(mcpMatch![1]!)).toEqual(names(sharedMatch![1]!));
    expect(names(mcpMatch![1]!)).toContain('node_modules');
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
