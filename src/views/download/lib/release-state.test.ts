import { describe, expect, it } from 'vitest';
import { MACOS_RELEASE } from '../model/macos-release.generated';
import { RELEASE_VERSION } from './release-facts';
import { ARCH_ORDER, formatAssetSize, macosAssetFor } from './release-state';

describe('release-state', () => {
  it('formats byte sizes as decimal MB with one decimal', () => {
    expect(formatAssetSize(12_000_000)).toBe('12.0 MB');
    expect(formatAssetSize(13_002_342)).toBe('13.0 MB');
    // The Finder size of a real shipped asset.
    expect(formatAssetSize(41_435_263)).toBe('41.4 MB');
  });

  it('renders no size at all rather than a misleading zero', () => {
    expect(formatAssetSize(0)).toBe('');
    expect(formatAssetSize(Number.NaN)).toBe('');
  });

  it('never claims a published release without downloadable assets', () => {
    if (!MACOS_RELEASE.published) {
      expect(MACOS_RELEASE.assets).toHaveLength(0);
      expect(MACOS_RELEASE.publishedAt).toBeNull();
      return;
    }

    expect(MACOS_RELEASE.assets.length).toBeGreaterThan(0);

    /*
     * Asset names follow the tag, not `package.json`, which moves ahead between releases: name,
     * URL and tag agree, size and checksum exist, and the tag is never ahead of the version.
     */
    const tagVersion = MACOS_RELEASE.tag.replace(/^v/, '');
    for (const arch of ARCH_ORDER) {
      const asset = macosAssetFor(arch);
      expect(asset).not.toBeNull();
      expect(asset!.fileName).toBe(`ontology-atlas_${tagVersion}_${arch}.dmg`);
      expect(asset!.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(asset!.sizeBytes).toBeGreaterThan(0);
      expect(asset!.downloadUrl).toContain(asset!.fileName);
      expect(asset!.downloadUrl).toContain(MACOS_RELEASE.tag);
    }
    expect(MACOS_RELEASE.publishedAt).not.toBeNull();

    expect(compareVersions(tagVersion, RELEASE_VERSION)).toBeLessThanOrEqual(0);
  });
});

/** Enough for this repository's `major.minor.patch[-rc.N]` tags. */
function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.split('-');
    const nums = core.split('.').map((n) => Number.parseInt(n, 10));
    const preRank = pre ? Number.parseInt(pre.replace(/\D/g, ''), 10) || 0 : Number.MAX_SAFE_INTEGER;
    return [...nums, preRank];
  };
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}
