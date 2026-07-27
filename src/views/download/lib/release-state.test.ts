import { describe, expect, it } from 'vitest';
import { MACOS_RELEASE } from '../model/macos-release.generated';
import { RELEASE_VERSION, buildDmgName } from './release-facts';
import { ARCH_ORDER, formatAssetSize, macosAssetFor } from './release-state';

describe('release-state', () => {
  it('offers Apple Silicon before Intel', () => {
    expect(ARCH_ORDER).toEqual(['aarch64', 'x64']);
  });

  it('formats byte sizes as mebibytes with one decimal', () => {
    expect(formatAssetSize(12 * 1024 * 1024)).toBe('12.0 MB');
    expect(formatAssetSize(13_002_342)).toBe('12.4 MB');
  });

  it('renders no size at all rather than a misleading zero', () => {
    expect(formatAssetSize(0)).toBe('');
    expect(formatAssetSize(Number.NaN)).toBe('');
  });

  // The generated module is the only thing allowed to claim a release
  // exists. If it says published, it must carry facts the page can show —
  // a published flag with no assets would render download buttons that lead
  // nowhere, which is the exact defect this state machine removes.
  it('never claims a published release without downloadable assets', () => {
    if (!MACOS_RELEASE.published) {
      expect(MACOS_RELEASE.assets).toHaveLength(0);
      expect(MACOS_RELEASE.publishedAt).toBeNull();
      return;
    }

    expect(MACOS_RELEASE.assets.length).toBeGreaterThan(0);
    for (const arch of ARCH_ORDER) {
      const asset = macosAssetFor(arch);
      expect(asset).not.toBeNull();
      // The published asset must be the DMG this repo's version produces —
      // a stale generated module pointing at an older build would hand users
      // the wrong download.
      expect(asset!.fileName).toBe(buildDmgName(arch));
      expect(asset!.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(asset!.sizeBytes).toBeGreaterThan(0);
      expect(asset!.downloadUrl).toContain(asset!.fileName);
    }
    expect(MACOS_RELEASE.tag).toBe(`v${RELEASE_VERSION}`);
  });
});
