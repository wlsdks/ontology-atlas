import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryVault } from '../../../../../tests/helpers/memory-vault';
import { encodeVaultTextFrames } from '../../../../../tests/helpers/vault-text-frames';

const tauri = vi.hoisted(() => ({
  rows: (_command: string, _body: string): unknown => {
    throw new Error('no rows');
  },
  reads: [] as string[],
  puts: [] as string[],
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: async (command: string, args: unknown) => {
    if (command === 'read_vault_text_files') {
      const { relativePaths } = args as { relativePaths: string[] };
      return encodeVaultTextFrames(
        relativePaths.map((relativePath) => {
          tauri.reads.push(relativePath);
          const file = vault.read(relativePath);
          return { relativePath, text: file?.text ?? null, lastModified: file?.lastModified ?? null, error: file ? null : 'gone' };
        }),
      );
    }
    const body = new TextDecoder().decode(args as Uint8Array);
    if (command === 'vault_index_rows_put') tauri.puts.push(body);
    return tauri.rows(command, body);
  },
}));

import { buildLocalManifestWithEntries, vaultRowWritesSettled } from './build-local-manifest';
import { vaultIndexPreference } from '@/shared/lib/vault-folder/vault-index/tauri-vault-index';

let vault = new MemoryVault();

function root() {
  return Object.assign(vault.root('vault'), { rootPath: '/vault' });
}

async function manifestJson(): Promise<string> {
  const { build } = await buildLocalManifestWithEntries(root());
  await vaultRowWritesSettled();
  return JSON.stringify({ ...build.manifest, generatedAt: '' });
}

/** The paths a lookup asked for, in its order. */
function asked(body: string): string[] {
  return body.split('\n').slice(2);
}

/** The rows a put carried, by path. */
function putRows(body: string): Map<string, { token: string; value: string }> {
  const lines = body.split('\n');
  const retained = lines[2] === '-' ? 0 : Number(lines[2]);
  const rows = new Map<string, { token: string; value: string }>();
  for (let at = 3 + retained; at < lines.length; at += 4) rows.set(lines[at], { token: lines[at + 1], value: lines[at + 3] });
  return rows;
}

function answer(hits: Array<[number, unknown]>, misses: Array<[number, string]>, stored = 0, found = 0) {
  return new TextEncoder().encode(JSON.stringify({ hits, misses, stored, found, otherVersions: 0 })).buffer;
}

afterEach(() => {
  tauri.reads = [];
  tauri.puts = [];
  window.localStorage.clear();
});

describe('a full build with the derived index rows', () => {
  vault = new MemoryVault({
    'a.md': '---\ntitle: A\n---\nSee [[c]] first.\n\nMuch later, [[c]] again and [[b]].\n',
    'b.md': '---\ntitle: B\nweight: Infinity\n---\nbody\n',
    'c.md': '---\ntitle: C\ndomains: [a]\n---\n# Heading\n',
  });

  it('reads every file when the lookup fails, and keeps nothing', async () => {
    vaultIndexPreference.write('off');
    const fromFiles = await manifestJson();
    vaultIndexPreference.write('on');
    tauri.rows = (command) => {
      if (command === 'vault_index_rows_get') throw new Error('index unavailable');
      return { written: 0, skipped: 0, removed: 0 };
    };
    expect(await manifestJson()).toBe(fromFiles);
    expect(tauri.puts).toEqual([]);
  });

  it('keeps only what a JSON round trip preserves and uses a stored value only for its own file', async () => {
    vaultIndexPreference.write('off');
    const fromFiles = await manifestJson();
    vaultIndexPreference.write('on');

    tauri.rows = (command, body) =>
      command === 'vault_index_rows_get'
        ? answer([], asked(body).map((path, at) => [at, `token-${path}`]))
        : { written: 2, skipped: 0, removed: 0 };
    expect(await manifestJson()).toBe(fromFiles);
    const kept = putRows(tauri.puts.join('\n'));
    expect([...kept.keys()].sort()).toEqual(['a.md', 'c.md']);
    expect(kept.get('a.md')?.token).toBe('token-a.md');

    const stored = JSON.parse(kept.get('a.md')!.value);
    expect(Object.keys(stored)).toEqual(['doc']);
    const misfiled = JSON.parse(kept.get('c.md')!.value);
    misfiled.doc.path = 'elsewhere.md';
    tauri.reads = [];
    tauri.rows = (command, body) => {
      if (command !== 'vault_index_rows_get') return { written: 0, skipped: 0, removed: 0 };
      const paths = asked(body);
      return answer(
        [
          [paths.indexOf('a.md'), stored],
          [paths.indexOf('c.md'), misfiled],
        ],
        [[paths.indexOf('b.md'), 'token-b.md']],
        2,
        2,
      );
    };
    expect(await manifestJson()).toBe(fromFiles);
    expect(tauri.reads.sort()).toEqual(['b.md', 'c.md']);
  });

  it('reads the file again for a row an older producer wrote with detail and link passages', async () => {
    vaultIndexPreference.write('off');
    const fromFiles = await manifestJson();
    vaultIndexPreference.write('on');
    tauri.rows = (command, body) =>
      command === 'vault_index_rows_get'
        ? answer([], asked(body).map((path, at) => [at, `token-${path}`]))
        : { written: 2, skipped: 0, removed: 0 };
    await manifestJson();
    const spine = JSON.parse(putRows(tauri.puts.join('\n')).get('a.md')!.value);
    const older = {
      doc: { ...spine.doc, headings: [], excerpt: 'See c first.', wordCount: 9 },
      linkContexts: [{ target: 'c', context: 'See **[c]** first.', linkText: 'c' }],
    };
    tauri.reads = [];
    tauri.rows = (command, body) => {
      if (command !== 'vault_index_rows_get') return { written: 0, skipped: 0, removed: 0 };
      const paths = asked(body);
      return answer([[paths.indexOf('a.md'), older]], [], 1, 1);
    };
    expect(await manifestJson()).toBe(fromFiles);
    expect(tauri.reads).toContain('a.md');
  });

  it('drops rows of files no longer listed once the walk is complete', async () => {
    tauri.rows = (command, body) =>
      command === 'vault_index_rows_get'
        ? answer([], asked(body).map((path, at) => [at, `token-${path}`]), 5, 3)
        : { written: 2, skipped: 0, removed: 2 };
    await manifestJson();
    const last = tauri.puts.at(-1)!.split('\n');
    expect(last.slice(2, 6)).toEqual(['3', 'a.md', 'b.md', 'c.md']);
    // Rows are kept under the name of the code that made them, which the build derives itself.
    expect(process.env.NEXT_PUBLIC_ROW_PRODUCER).toMatch(/^[0-9a-f]{16}$/);
    expect(last[1]).toBe(`app-entry/${process.env.NEXT_PUBLIC_ROW_PRODUCER}`);
  });
});
