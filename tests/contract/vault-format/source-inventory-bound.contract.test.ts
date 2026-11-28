import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../..');
const rustSource = readFileSync(resolve(repoRoot, 'src-tauri/src/project_source/mod.rs'), 'utf8');
const mcpSource = readFileSync(
  resolve(repoRoot, 'mcp/src/project-source/project-source-inventory-limits.mjs'),
  'utf8',
);

function mcpConstant(name: string): string {
  const match = new RegExp(`^export const ${name} = (.+);$`, 'm').exec(mcpSource);
  expect(match, `${name} is not exported by mcp/src/project-source/project-source-inventory-limits.mjs`).toBeTruthy();
  return match![1]!.trim();
}

function rustConstant(name: string): string {
  const match = new RegExp(`^const ${name}: [^=]+= (.+);$`, 'm').exec(rustSource);
  expect(match, `${name} is not declared in src-tauri/src/project_source/mod.rs`).toBeTruthy();
  return match![1]!.trim();
}

/**
 * The Rust and JavaScript source inventory probes are separate implementations. The MCP
 * probe left the file cap and the `inventory-v2` fingerprint behind (no file count bounds it,
 * a repository is read from its index): until the one port of the probe moves the app to the
 * same fingerprint, a receipt one side minted reads as changed on the other. What both still
 * walk with must be the same number.
 */
describe('source inventory bounds — the app and the MCP probe must agree where they still share one', () => {
  it('the depth cap is one number on both sides', () => {
    expect(mcpConstant('SOURCE_INVENTORY_MAX_DEPTH')).toBe('20');
    expect(rustConstant('SOURCE_INVENTORY_MAX_DEPTH')).toBe('20');
  });

  it('the hashed-bytes cap is one number on both sides', () => {
    expect(mcpConstant('SOURCE_INVENTORY_MAX_HASH_BYTES')).toBe('32 * 1024 * 1024');
    expect(rustConstant('SOURCE_INVENTORY_MAX_HASH_BYTES')).toBe('32 * 1024 * 1024');
  });

  it('the pruned directory names are the same set on both sides', () => {
    const mcpMatch = /export const SOURCE_PRUNE_DIR_NAMES = new Set\(\[([\s\S]*?)\]\)/.exec(mcpSource);
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
   * The app's own probe still truncates past its file cap, and this repository is its own
   * dogfood source root, so the repository outgrowing that cap is a real defect in the app
   * until the port removes it.
   */
  it('the dogfood repository still fits inside the app probe cap', () => {
    const cap = Number(rustConstant('SOURCE_INVENTORY_MAX_FILES'));
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
      `this repository has ${visible.size} visible files against the app probe's cap of ${cap}; ` +
        'the bounded probe truncates past it — raise the cap in src-tauri/src/project_source/mod.rs ' +
        'with a docs/DECISIONS.md record',
    ).toBeLessThanOrEqual(cap);
  });
});
