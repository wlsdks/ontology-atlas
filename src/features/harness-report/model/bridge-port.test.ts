import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
  tauri: true,
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: native.invoke,
  isTauri: () => native.tauri,
}));

vi.mock('@/shared/lib/vault-folder/tauri-vault-fs', () => ({
  listTauriVaultEntries: native.list,
  readTauriVaultTextFile: native.read,
}));

import { scanHarness } from '@/entities/agent-files';

import { bridgePort } from './bridge-port';

const SOURCE = { vaultRoot: '/repo/docs/ontology', projectSlug: 'projects/storefront' };
const TREE: Record<string, Array<{ name: string; kind: 'file' | 'directory' }>> = {
  '': [
    { name: 'AGENTS.md', kind: 'file' },
    { name: '.claude', kind: 'directory' },
  ],
  '.claude/skills': [{ name: 'review', kind: 'directory' }],
  '.claude/skills/review': [
    { name: 'SKILL.md', kind: 'file' },
    { name: 'logo.png', kind: 'file' },
  ],
};
const FILES: Record<string, string> = {
  'AGENTS.md': '# Guide\n',
  '.claude/settings.json': '{}',
  '.claude/skills/review/SKILL.md': '# Review\n',
};

function serveTree(refusals: Record<string, string> = {}) {
  native.invoke.mockImplementation(
    async (command: string, args: { relativePath: string }) => {
      const path = args.relativePath;
      if (refusals[path]) throw refusals[path];
      if (command === 'list_harness_source_directory') {
        if (TREE[path]) return TREE[path];
        throw 'harness-path-missing';
      }
      if (command === 'read_harness_source_text') {
        if (path in FILES) return { text: FILES[path], lastModified: 1, bytes: FILES[path]!.length };
        throw 'harness-path-missing';
      }
      if (command === 'harness_source_path_exists') return path in FILES || path in TREE;
      throw new Error(`unexpected command ${command}`);
    },
  );
}

describe('the harness bridge port', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.tauri = true;
  });

  it('never sends a source path, only the vault and the project', async () => {
    native.list.mockRejectedValue(new Error('the content commands must not be used'));
    native.read.mockRejectedValue(new Error('the content commands must not be used'));
    serveTree();

    await scanHarness(bridgePort(SOURCE));

    expect(native.list).not.toHaveBeenCalled();
    expect(native.read).not.toHaveBeenCalled();
    expect(native.invoke.mock.calls.length).toBeGreaterThan(0);
    for (const [command, args] of native.invoke.mock.calls) {
      expect(command).toMatch(/^(list_harness_source_directory|read_harness_source_text|harness_source_path_exists)$/);
      expect(Object.keys(args as object).sort()).toEqual(['projectSlug', 'relativePath', 'vaultPath']);
      expect(args).toMatchObject({ vaultPath: SOURCE.vaultRoot, projectSlug: SOURCE.projectSlug });
    }
  });

  it('fails the reading when the app refuses the connected root', async () => {
    native.invoke.mockRejectedValue('source-root-not-granted');

    await expect(scanHarness(bridgePort(SOURCE))).rejects.toMatchObject({
      code: 'source-root-not-granted',
    });
  });

  it('fails the reading when the source root is gone', async () => {
    native.invoke.mockRejectedValue('harness-path-missing');

    await expect(scanHarness(bridgePort(SOURCE))).rejects.toMatchObject({
      code: 'harness-source-missing',
    });
  });

  it('fails the reading, with the path, when one file inside a readable root is refused', async () => {
    serveTree({ '.claude/settings.json': 'harness-binding-changed' });

    await expect(scanHarness(bridgePort(SOURCE))).rejects.toMatchObject({
      code: 'harness-binding-changed',
      detail: '.claude/settings.json: harness-binding-changed',
    });
  });

  it('keeps a code the app minted with a detail', async () => {
    native.invoke.mockRejectedValue('source-root-rejected: filesystem-root');

    await expect(scanHarness(bridgePort(SOURCE))).rejects.toMatchObject({
      code: 'source-root-rejected',
    });
  });

  it('reads a missing path as absence and a binary file as no text', async () => {
    serveTree({ '.claude/skills/review/logo.png': 'harness-not-text' });

    const report = await scanHarness(bridgePort(SOURCE));

    expect(report.analysis.records.map((record) => record.path)).toEqual(
      expect.arrayContaining(['AGENTS.md', '.claude/settings.json', '.claude/skills/review/SKILL.md']),
    );
    expect(report.contents.has('.claude/skills/review/logo.png')).toBe(false);
  });

  it('passes the on-disk size through', async () => {
    serveTree();

    const file = await bridgePort(SOURCE).readText('AGENTS.md');

    expect(file).toEqual({ text: '# Guide\n', lastModified: 1, bytes: 8 });
  });

  it('answers existence through its own command, passing the boolean through', async () => {
    serveTree();

    await expect(bridgePort(SOURCE).pathExists?.('AGENTS.md')).resolves.toBe(true);
    await expect(bridgePort(SOURCE).pathExists?.('scripts/gone.sh')).resolves.toBe(false);
  });

  it('refuses outside the app instead of returning an empty harness', async () => {
    native.tauri = false;

    await expect(scanHarness(bridgePort(SOURCE))).rejects.toMatchObject({
      code: 'harness-bridge-unavailable',
    });
  });
});
