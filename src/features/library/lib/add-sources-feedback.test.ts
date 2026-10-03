import { describe, expect, it, vi } from 'vitest';
import { addSources } from './add-sources';

const bridge = vi.hoisted(() => ({ pick: vi.fn(), import: vi.fn() }));
vi.mock('@/entities/docs-vault', () => ({ VAULT_SOURCES_DIR: 'sources' }));
vi.mock('@/shared/lib/tauri-vault-fs', () => ({ pickTauriSourceFiles: bridge.pick, importTauriSourceFiles: bridge.import }));
const options = { root: {} as FileSystemDirectoryHandle, vaultRootPath: '/fixture', dialogTitle: 'Pick source' };

describe('source import start observation', () => {
  it('announces only after a real pick and before importing its selected files', async () => {
    const events: string[] = [];
    bridge.pick.mockResolvedValueOnce(['/fixture/input.txt']);
    bridge.import.mockImplementationOnce(async () => { events.push('import'); return []; });
    await addSources({ ...options, onImportStart: () => events.push('start') });
    expect(events).toEqual(['start', 'import']);
  });
  it('keeps cancellation neutral without claiming work started', async () => {
    bridge.pick.mockResolvedValueOnce(null);
    const start = vi.fn();
    const result = await addSources({ ...options, onImportStart: start });
    expect(start).not.toHaveBeenCalled();
    expect(result.cancelled).toBe(true);
  });
  it('does not let a failed visual observer interrupt or alter the file operation', async () => {
    const results = [{ pickedName: 'input.txt', status: 'added', relativePath: 'sources/input.txt', sha256: 'hash', size: 3, reason: null }];
    bridge.pick.mockResolvedValueOnce(['/fixture/input.txt']);
    bridge.import.mockResolvedValueOnce(results);
    expect(await addSources({ ...options, onImportStart: () => { throw new Error('Observer unavailable'); } })).toEqual({ cancelled: false, results });
  });
});
