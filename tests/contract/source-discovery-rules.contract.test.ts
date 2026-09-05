import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DISCOVERY_DENIED_NAME_FRAGMENTS,
  DISCOVERY_DOCUMENT_EXTENSIONS,
  DISCOVERY_MAX_CANDIDATES,
  DISCOVERY_MAX_DEPTH,
  DISCOVERY_PRUNE_DIR_NAMES,
  discoveryAcceptsFile,
} from '@/entities/docs-vault/lib/source-discovery';

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
 * The gate compares the **rules**, not the walks. Whether each walk applies them
 * correctly is measured by `source-discovery.test.ts` (TypeScript) and the
 * `discovery_refuses_the_files_local_first_forbids_reading` test in
 * `src-tauri/src/library.rs` (Rust), each planting a secret and asserting it never
 * appears.
 */
const repoRoot = resolve(__dirname, '../..');
const rustSource = readFileSync(resolve(repoRoot, 'src-tauri/src/library.rs'), 'utf8');

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

  it('stops at the same depth and the same candidate count', () => {
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
   * Markdown is already a vault file kind. Copying a project's Markdown into `sources/`
   * would put the same text in two places with no way to say which one is the source, so
   * neither list may grow it.
   */
  it('never offers Markdown as a raw source', () => {
    expect(rustList('DISCOVERY_DOCUMENT_EXTENSIONS')).not.toContain('md');
    expect([...DISCOVERY_DOCUMENT_EXTENSIONS]).not.toContain('md');
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
    const walk = /fn walk_candidates\([\s\S]*?\n\}/.exec(rustSource)?.[0] ?? '';
    expect(walk).toBeTruthy();
    expect(walk).not.toMatch(/fs::(write|copy|remove_file|create_dir|rename)/);
    // It also opens nothing: `read_dir` and `metadata` are listings, `fs::read` is a read.
    expect(walk).not.toMatch(/fs::read\b|fs::read_to_string/);
  });
});
