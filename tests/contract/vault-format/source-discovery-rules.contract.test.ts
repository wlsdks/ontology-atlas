import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DISCOVERY_BUILD_FILE_NAMES,
  DISCOVERY_DENIED_NAME_FRAGMENTS,
  DISCOVERY_DOCUMENT_EXTENSIONS,
  DISCOVERY_GUIDE_STEMS,
  DISCOVERY_MARKDOWN_EXTENSIONS,
  DISCOVERY_VAULT_OWNED_DIRS,
  DROP_MAX_FILES,
  DROP_MAX_VISITED,
  DROP_SKIPPED_NAMES,
  DISCOVERY_MAX_CANDIDATES,
  DISCOVERY_MAX_DEPTH,
  DISCOVERY_MIN_FILE_BYTES,
  DISCOVERY_NOTICE_STEMS,
  DISCOVERY_NOTICE_SUFFIXES,
  DISCOVERY_PRUNE_DIR_NAMES,
  DISCOVERY_PRUNE_DIR_PATHS,
  discoveryAcceptsFile,
} from '@/entities/docs-vault/lib/library/source-discovery';

/**
 * **Two walks, one rule.**
 *
 * "Find documents" proposes candidates from roots the person granted. The browser walks
 * the open folder's File System Access handle; Rust walks that folder *and* the project
 * roots only an absolute path can reach. Neither can call the other, so the judgement
 * about a file name lives twice — and if the two copies drift, a person is offered a
 * file on one surface that the other refuses, with nothing on screen to explain it.
 *
 * What is actually at stake is narrower than "consistency". The allow-list is the lock
 * that keeps `.env`, `id_rsa` and `server.pem` out of a proposal
 * (`.claude/rules/local-first.md`: *never scan password, credential, or key files*), and
 * the deny-list is the second lock for `credentials.csv`, which the first cannot see. A
 * silent widening on either side is the failure this gate exists to catch, so the
 * constants are compared as sets rather than as prose.
 *
 * The gate compares the **rules**, not the walks. Both walks run one table,
 * `tests/fixtures/source-discovery-cases.json`, through `source-discovery.test.ts`
 * (TypeScript) and the `tests.rs` files under `src-tauri/src/library/` (Rust), planting each row as
 * a file.
 */
const repoRoot = resolve(__dirname, '../../..');
const rustSource = readFileSync(
  resolve(repoRoot, 'src-tauri/src/library/discovery_rules.rs'),
  'utf8',
);
const walkSource = readFileSync(
  resolve(repoRoot, 'src-tauri/src/library/source_discovery.rs'),
  'utf8',
);

function rustList(name: string): string[] {
  const match = new RegExp(`const ${name}: &\\[&str\\] = &\\[([\\s\\S]*?)\\];`).exec(rustSource);
  expect(match, `could not read Rust ${name} — has its shape changed?`).toBeTruthy();
  return match![1]!
    .split(',')
    .map((token) => token.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

describe('the discovery rule is the same in both walks', () => {
  it('offers the same document formats', () => {
    expect(rustList('DISCOVERY_DOCUMENT_EXTENSIONS').sort()).toEqual(
      [...DISCOVERY_DOCUMENT_EXTENSIONS].sort(),
    );
  });

  it('refuses the same name fragments', () => {
    expect(rustList('DISCOVERY_DENIED_NAME_FRAGMENTS').sort()).toEqual(
      [...DISCOVERY_DENIED_NAME_FRAGMENTS].sort(),
    );
  });

  it('prunes the same directories', () => {
    expect(rustList('DISCOVERY_PRUNE_DIR_NAMES').sort()).toEqual(
      [...DISCOVERY_PRUNE_DIR_NAMES].sort(),
    );
  });

  it('prunes the same folder paths', () => {
    expect(rustList('DISCOVERY_PRUNE_DIR_PATHS').sort()).toEqual(
      [...DISCOVERY_PRUNE_DIR_PATHS].sort(),
    );
  });

  it('refuses the same notice names and build files', () => {
    expect(rustList('DISCOVERY_NOTICE_STEMS').sort()).toEqual([...DISCOVERY_NOTICE_STEMS].sort());
    expect(rustList('DISCOVERY_NOTICE_SUFFIXES').sort()).toEqual(
      [...DISCOVERY_NOTICE_SUFFIXES].sort(),
    );
    expect(rustList('DISCOVERY_BUILD_FILE_NAMES').sort()).toEqual(
      [...DISCOVERY_BUILD_FILE_NAMES].sort(),
    );
  });

  it('stops at the same depth, candidate count and size floor', () => {
    expect(rustSource).toMatch(
      new RegExp(`const DISCOVERY_MIN_FILE_BYTES: u64 = ${DISCOVERY_MIN_FILE_BYTES};`),
    );
    expect(rustSource).toMatch(
      new RegExp(`const DISCOVERY_MAX_DEPTH: usize = ${DISCOVERY_MAX_DEPTH};`),
    );
    expect(rustSource).toMatch(
      new RegExp(`const DISCOVERY_MAX_CANDIDATES: usize = ${DISCOVERY_MAX_CANDIDATES};`),
    );
  });

  it('refuses dotfiles on both sides', () => {
    expect(discoveryAcceptsFile('.env.local')).toBe(false);
    expect(rustSource).toMatch(/if name\.starts_with\('\.'\) \{\s*return false;/);
  });

  /**
   * Markdown is offered only when the vault does not own it: from the open folder, outside
   * Atlas's own folders, never a repository guide, and never a node (the page's filter reads
   * `kind:` from the index it already holds). Both walks must hold the same lists.
   */
  it('offers Markdown under the same limits', () => {
    expect(rustList('DISCOVERY_MARKDOWN_EXTENSIONS').sort()).toEqual(
      [...DISCOVERY_MARKDOWN_EXTENSIONS].sort(),
    );
    expect(rustList('DISCOVERY_GUIDE_STEMS').sort()).toEqual([...DISCOVERY_GUIDE_STEMS].sort());
    expect(rustList('DISCOVERY_VAULT_OWNED_DIRS').sort()).toEqual(
      [...DISCOVERY_VAULT_OWNED_DIRS].sort(),
    );
    expect(walkSource).toMatch(/root\.open_folder \|\| !offered_only_from_open_folder\(&name\)/);
  });

  it('caps a dropped folder at the same file, visit and skipped-name counts', () => {
    const dropSource = readFileSync(resolve(repoRoot, 'src-tauri/src/library/dropped.rs'), 'utf8');
    for (const [name, value] of [
      ['DROP_MAX_FILES', DROP_MAX_FILES],
      ['DROP_MAX_VISITED', DROP_MAX_VISITED],
      ['DROP_SKIPPED_NAMES', DROP_SKIPPED_NAMES],
    ] as const) {
      expect(dropSource).toMatch(new RegExp(`const ${name}: usize = ${value.toLocaleString('en').replaceAll(',', '_')};`));
    }
  });

  /**
   * `key` reads as Keynote and as a private key, and the second meaning is the one that
   * matters. Neither side may add it back without a decision record.
   */
  it('never offers an extension that also names a private key', () => {
    for (const extension of ['key', 'pem', 'p12', 'pfx', 'env']) {
      expect([...DISCOVERY_DOCUMENT_EXTENSIONS]).not.toContain(extension);
      expect(rustList('DISCOVERY_DOCUMENT_EXTENSIONS')).not.toContain(extension);
    }
  });

  /** Discovery proposes; only an approved copy writes. Rust must hold no writer. */
  it('the discovery walk writes nothing', () => {
    const walk = /fn walk_candidates\([\s\S]*?\n\}/.exec(walkSource)?.[0] ?? '';
    expect(walk).toBeTruthy();
    expect(walk).not.toMatch(/fs::(write|copy|remove_file|create_dir|rename)/);
    // It also opens nothing: `read_dir` and `metadata` are listings, `fs::read` is a read.
    expect(walk).not.toMatch(/fs::read\b|fs::read_to_string/);
  });
});
