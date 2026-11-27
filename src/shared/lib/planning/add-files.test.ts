import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({ pick: vi.fn(), import: vi.fn() }));
vi.mock('@/shared/lib/vault-folder/native-vault/tauri-library-sources', () => ({ pickTauriSourceFiles: bridge.pick, importTauriSourceFiles: bridge.import }));

import { pickPlanningFiles } from './add-files';

describe('adding files to the home planning folder', () => {
  beforeEach(() => { bridge.pick.mockReset(); bridge.import.mockReset(); });

  it('sends every picked path unchanged to the planning destination and counts what the app refused by type', async () => {
    const paths = ['C:\\Users\\me\\Downloads\\brief.md', '/Users/me/Downloads/deck.pdf', '/Users/me/Desktop/wire.png', '/Users/me/Desktop/notes.md'];
    bridge.pick.mockResolvedValue(paths);
    bridge.import.mockResolvedValue([
      { pickedName: 'brief.md', status: 'renamed', relativePath: 'planning/brief (2).md', sha256: null, size: null, reason: null },
      { pickedName: 'deck.pdf', status: 'failed', relativePath: null, sha256: null, size: null, reason: 'unsupported-type' },
      { pickedName: 'wire.png', status: 'duplicate', relativePath: 'planning/wire.png', sha256: null, size: null, reason: null },
      { pickedName: 'notes.md', status: 'failed', relativePath: null, sha256: null, size: null, reason: 'source-missing' },
    ]);
    const outcome = await pickPlanningFiles({ rootPath: '/Users/me/vault' });
    expect(bridge.import).toHaveBeenCalledWith('/Users/me/vault', paths, 'planning');
    expect(outcome).toEqual({ added: ['brief (2).md'], duplicates: 1, unsupported: 1, failed: 1 });
  });

  it('reads a dismissed native picker as no choice at all', async () => {
    bridge.pick.mockResolvedValue([]);
    expect(await pickPlanningFiles({ rootPath: '/Users/me/vault' })).toBeNull();
    expect(bridge.import).not.toHaveBeenCalled();
  });
});
