import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn() }));

vi.mock('@/shared/lib/vault-folder/tauri-vault-fs', () => ({
  listTauriVaultEntries: bridge.list,
  readTauriVaultTextFile: bridge.read,
}));

import { scanHarness } from '@/entities/agent-files';

import { bridgePort } from './bridge-port';

const MISSING = 'No such file or directory (os error 2)';
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
  bridge.list.mockImplementation(async (_root: string, path: string) => {
    if (refusals[path]) throw refusals[path];
    if (TREE[path]) return TREE[path];
    throw MISSING;
  });
  bridge.read.mockImplementation(async (_root: string, path: string) => {
    if (refusals[path]) throw refusals[path];
    if (path in FILES) return { text: FILES[path], lastModified: 1 };
    throw MISSING;
  });
}

describe('the harness bridge port', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails the reading when the app refuses the source root, instead of reporting an empty harness', async () => {
    bridge.list.mockRejectedValue('vault-root-not-granted');
    bridge.read.mockRejectedValue('vault-root-not-granted');

    await expect(scanHarness(bridgePort('/repo'))).rejects.toMatchObject({
      code: 'vault-root-not-granted',
    });
  });

  it('fails the reading when the source root is gone', async () => {
    bridge.list.mockRejectedValue(MISSING);
    bridge.read.mockRejectedValue(MISSING);

    await expect(scanHarness(bridgePort('/repo'))).rejects.toMatchObject({
      code: 'harness-source-missing',
    });
  });

  it('fails the reading when one file inside a readable root is refused', async () => {
    serveTree({ '.claude/settings.json': 'Permission denied (os error 13)' });

    await expect(scanHarness(bridgePort('/repo'))).rejects.toMatchObject({
      code: 'permission-denied',
      detail: '.claude/settings.json: Permission denied (os error 13)',
    });
  });

  it('reads a missing path as absence and a binary file as no text', async () => {
    serveTree({ '.claude/skills/review/logo.png': 'stream did not contain valid UTF-8' });

    const report = await scanHarness(bridgePort('/repo'));

    expect(report.analysis.records.map((record) => record.path)).toEqual(
      expect.arrayContaining(['AGENTS.md', '.claude/settings.json', '.claude/skills/review/SKILL.md']),
    );
    expect(report.contents.has('.claude/skills/review/logo.png')).toBe(false);
  });
});
