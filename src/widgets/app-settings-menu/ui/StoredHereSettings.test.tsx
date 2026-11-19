import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../messages/en.json';
import { StoredHereSettings } from './StoredHereSettings';

const bridge = vi.hoisted(() => ({
  rootPath: '/vaults/atlas' as string | null,
  clear: vi.fn(),
  status: vi.fn(),
  sync: vi.fn(async () => null),
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
  vaultIndexPreference: { use: () => 'on', write: vi.fn() },
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

beforeEach(() => {
  bridge.rootPath = '/vaults/atlas';
  bridge.clear.mockReset();
  bridge.status.mockReset();
  bridge.sync.mockReset();
});

describe('StoredHereSettings', () => {
  it("shows the open folder's size and deletes only that folder's index", async () => {
    bridge.status.mockResolvedValue(status(76 * 1024 * 1024, 200 * 1024 * 1024, 3));
    bridge.clear.mockResolvedValue(status(0, 124 * 1024 * 1024, 2));
    renderSettings();

    const row = screen.getByTestId('app-settings-vault-index-size');
    await waitFor(() => expect(row).toHaveTextContent("76 MB for this folder. Delete removes this folder's index"));
    fireEvent.click(screen.getByTestId('app-settings-vault-index-delete'));
    // The chip ignores a second press that lands inside its double-click guard.
    const later = Date.now() + 2000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(later);
    fireEvent.click(screen.getByTestId('app-settings-vault-index-delete'));
    clock.mockRestore();

    await waitFor(() => expect(bridge.clear).toHaveBeenCalledWith('/vaults/atlas'));
    expect(row).toHaveTextContent("Deleted this folder's index.");
  });

  it("says so when turning search off leaves an index in place", async () => {
    bridge.status.mockResolvedValue(status(76 * 1024 * 1024, 76 * 1024 * 1024, 1));
    bridge.sync.mockRejectedValue(new Error('left in place'));
    renderSettings();

    const row = screen.getByTestId('app-settings-vault-index-size');
    await waitFor(() => expect(row).toHaveTextContent('76 MB'));
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    await waitFor(() => expect(row).toHaveTextContent('Could not delete the search index. Try again.'));
  });

  it("names every folder when none is open, because Delete then removes them all", async () => {
    bridge.rootPath = null;
    bridge.status.mockResolvedValue(status(0, 200 * 1024 * 1024, 3));
    renderSettings();

    await waitFor(() =>
      expect(screen.getByTestId('app-settings-vault-index-size')).toHaveTextContent(
        "200 MB for 3 folders. Delete removes every folder's index",
      ),
    );
  });
});
