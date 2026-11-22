import { describe, expect, it } from 'vitest';

import { chooseDownload } from './download-choice';
import type { MacosReleaseAsset, WindowsReleaseAsset } from './release-state';

const mac = { arch: 'aarch64' } as MacosReleaseAsset;
const windows = { arch: 'x64' } as WindowsReleaseAsset;

describe('chooseDownload', () => {
  it('leads with the macOS file for a Mac visitor once it is published', () => {
    expect(chooseDownload({ published: true, primaryAsset: mac, windowsInstaller: windows, visitorPlatform: 'mac' })).toEqual({
      windowsPrimary: false,
      fileWins: true,
    });
  });

  it('puts the Windows installer first only for a Windows visitor who has one', () => {
    const withInstaller = chooseDownload({ published: true, primaryAsset: mac, windowsInstaller: windows, visitorPlatform: 'windows' });
    expect(withInstaller.windowsPrimary).toBe(true);
    const without = chooseDownload({ published: true, primaryAsset: mac, windowsInstaller: null, visitorPlatform: 'windows' });
    expect(without.windowsPrimary).toBe(false);
  });

  it('leads with the browser map on a handheld, which cannot install a file', () => {
    const choice = chooseDownload({ published: true, primaryAsset: mac, windowsInstaller: windows, visitorPlatform: 'handheld' });
    expect(choice.fileWins).toBe(false);
  });

  it('has no file to lead with before a release is published or without an asset', () => {
    expect(chooseDownload({ published: false, primaryAsset: mac, windowsInstaller: null, visitorPlatform: 'mac' }).fileWins).toBe(false);
    expect(chooseDownload({ published: true, primaryAsset: null, windowsInstaller: null, visitorPlatform: 'mac' }).fileWins).toBe(false);
  });
});
