import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../../messages/en.json';
import { StoredHereSettings } from './StoredHereSettings';

const bridge = vi.hoisted(() => ({
  rootPath: '/vaults/atlas' as string | null,
  indexSwitch: 'on' as 'on' | 'off',
  clear: vi.fn(),
  status: vi.fn(),
  sync: vi.fn(async () => null),
}));

const vectors = vi.hoisted(() => ({
  vectorsBytes: 0,
  modelOnDisk: false,
  modelBytes: 0,
  probe: vi.fn(),
  remove: vi.fn(async () => true),
  removeModel: vi.fn(async () => true),
  forget: vi.fn(async () => undefined),
}));

vi.mock('@/entities/vault-session', () => ({
  useLocalVault: () => ({ handle: bridge.rootPath === null ? null : { rootPath: bridge.rootPath } }),
}));
vi.mock('@/shared/lib/vault-folder/tauri-vault-fs', () => ({
  getTauriVaultRootPath: (handle: { rootPath: string }) => handle.rootPath,
}));
vi.mock('@/shared/lib/vault-folder/tauri-vault-index', () => ({
  clearVaultIndex: bridge.clear,
  syncVaultIndex: bridge.sync,
  vaultIndexStatus: bridge.status,
  vaultIndexPreference: { use: () => bridge.indexSwitch, write: vi.fn() },
}));
vi.mock('@/shared/lib/vault-folder/tauri-vault-vectors', () => ({ probeVectors: vectors.probe }));
vi.mock('@/features/vault-vectors', () => ({
  useVectorStatus: () => ({ vectorsBytes: vectors.vectorsBytes }),
  remove: vectors.remove,
  removeModel: vectors.removeModel,
  forgetChoices: vectors.forget,
}));

const status = (sizeBytes: number, allBytes: number, vaults: number) => ({
  state: 'ready',
  indexed: 1,
  total: 1,
  sizeBytes,
  allBytes,
  vaults,
});

function renderSettings() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <StoredHereSettings />
    </NextIntlClientProvider>,
  );
}

/** The chip ignores a second press that lands inside its double-click guard. */
function confirm(testId: string) {
  fireEvent.click(screen.getByTestId(testId));
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000);
  fireEvent.click(screen.getByTestId(testId));
  clock.mockRestore();
}

beforeEach(() => {
  bridge.rootPath = '/vaults/atlas';
  bridge.indexSwitch = 'on';
  bridge.clear.mockReset();
  bridge.status.mockReset();
  bridge.sync.mockReset();
  vectors.vectorsBytes = 0;
  vectors.modelOnDisk = false;
  vectors.modelBytes = 0;
  vectors.probe.mockReset();
  vectors.probe.mockImplementation(async () => ({ builtin: { onDisk: vectors.modelOnDisk, modelBytes: vectors.modelBytes, keptBytes: 1_210_000_000 } }));
  vectors.remove.mockClear();
  vectors.removeModel.mockClear();
  vectors.forget.mockClear();
});

describe('StoredHereSettings', () => {
  it("shows the open folder's size and deletes only that folder's index and its search by meaning", async () => {
    bridge.status.mockResolvedValue(status(76 * 1024 * 1024, 200 * 1024 * 1024, 3));
    bridge.clear.mockResolvedValue(status(0, 124 * 1024 * 1024, 2));
    renderSettings();

    const row = screen.getByTestId('app-settings-vault-index-size');
    await waitFor(() => expect(row).toHaveTextContent("76 MB for this folder. Delete removes this folder's index and its search by meaning"));
    confirm('app-settings-vault-index-delete');

    await waitFor(() => expect(bridge.clear).toHaveBeenCalledWith('/vaults/atlas'));
    expect(row).toHaveTextContent("Deleted this folder's index and its search by meaning.");
    await waitFor(() => expect(vectors.forget).toHaveBeenCalledWith('/vaults/atlas'));
  });

  it("says so when turning search off leaves an index in place", async () => {
    bridge.status.mockResolvedValue(status(76 * 1024 * 1024, 76 * 1024 * 1024, 1));
    bridge.sync.mockRejectedValue(new Error('left in place'));
    renderSettings();

    const row = screen.getByTestId('app-settings-vault-index-size');
    await waitFor(() => expect(row).toHaveTextContent('76 MB'));
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    await waitFor(() => expect(row).toHaveTextContent('Could not delete the search index. Try again.'));
    expect(vectors.forget).not.toHaveBeenCalled();
  });

  it("names every folder when none is open, because Delete then removes them all", async () => {
    bridge.rootPath = null;
    bridge.status.mockResolvedValue(status(0, 200 * 1024 * 1024, 3));
    renderSettings();

    await waitFor(() =>
      expect(screen.getByTestId('app-settings-vault-index-size')).toHaveTextContent(
        "200 MB for 3 folders. Delete removes every folder's index and search by meaning",
      ),
    );
    expect(screen.queryByTestId('app-settings-vector-size')).toBeNull();
  });

  it("deletes this folder's search by meaning and the model, each from its own row", async () => {
    bridge.status.mockResolvedValue(status(76 * 1024 * 1024, 76 * 1024 * 1024, 1));
    vectors.vectorsBytes = 13_700_000;
    vectors.modelOnDisk = true;
    vectors.modelBytes = 1_210_000_000;
    renderSettings();

    const meaning = screen.getByTestId('app-settings-vector-size');
    expect(meaning).toHaveTextContent('14 MB for this folder. Delete removes it; preparing again reads every file.');
    const model = await screen.findByTestId('app-settings-vector-model');
    expect(model).toHaveTextContent('1.2 GB, bge-m3 by BAAI (MIT).');

    confirm('app-settings-vector-delete');
    await waitFor(() => expect(meaning).toHaveTextContent("Deleted this folder's search by meaning."));
    expect(vectors.remove).toHaveBeenCalledWith('/vaults/atlas');

    vectors.modelOnDisk = false;
    vectors.modelBytes = 0;
    confirm('app-settings-vector-model-delete');
    await waitFor(() => expect(model).toHaveTextContent('Deleted the model.'));
    expect(vectors.removeModel).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('app-settings-vector-model-delete')).toBeNull();
  });

  it('says so when the app refuses to delete search by meaning', async () => {
    bridge.status.mockResolvedValue(status(76 * 1024 * 1024, 76 * 1024 * 1024, 1));
    vectors.vectorsBytes = 13_700_000;
    vectors.remove.mockResolvedValueOnce(false);
    renderSettings();

    confirm('app-settings-vector-delete');
    await waitFor(() =>
      expect(screen.getByTestId('app-settings-vector-size')).toHaveTextContent('Could not delete search by meaning. Try again.'),
    );
  });

  it('leaves the model row out while the model holds nothing, and the folder row out with the index off', async () => {
    bridge.status.mockResolvedValue(status(76 * 1024 * 1024, 76 * 1024 * 1024, 1));
    const { unmount } = renderSettings();
    expect(screen.getByTestId('app-settings-vector-size')).toHaveTextContent('Nothing stored');
    await waitFor(() => expect(vectors.probe).toHaveBeenCalledWith('/vaults/atlas', null));
    expect(screen.queryByTestId('app-settings-vector-model')).toBeNull();
    unmount();

    bridge.indexSwitch = 'off';
    renderSettings();
    await waitFor(() => expect(vectors.probe).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('app-settings-vector-size')).toBeNull();
    expect(screen.queryByTestId('app-settings-vector-model')).toBeNull();
  });

  it.each([
    ['with the index off', () => { bridge.indexSwitch = 'off'; }],
    ['with no folder open', () => { bridge.rootPath = null; }],
    ['with a folder open', () => undefined],
  ])('shows a download that did not finish, with its size and Delete, %s', async (_when, arrange) => {
    arrange();
    bridge.status.mockResolvedValue(status(0, 0, 0));
    vectors.modelBytes = 915_000_000;
    renderSettings();
    const model = await screen.findByTestId('app-settings-vector-model');
    expect(model).toHaveTextContent('Download not finished · 915 MB');
    expect(vectors.probe).toHaveBeenCalledWith(bridge.rootPath, null);

    vectors.modelBytes = 0;
    confirm('app-settings-vector-model-delete');
    await waitFor(() => expect(model).toHaveTextContent('Deleted the model.'));
    expect(vectors.removeModel).toHaveBeenCalledTimes(1);
  });
});
