import { describe, expect, it } from 'vitest';
import { MACOS_RELEASE } from '../model/macos-release.generated';
import { RELEASE_VERSION } from './release-facts';
import { ARCH_ORDER, formatAssetSize, macosAssetFor } from './release-state';

describe('release-state', () => {
  it('offers Apple Silicon before Intel', () => {
    expect(ARCH_ORDER).toEqual(['aarch64', 'x64']);
  });

  /**
   * **Decimal MB — what the reader's own machine says.**
   *
   * This used to divide by 1024² and still label it "MB", so the page
   * promised 39.5 MB for a file macOS Finder reports as 41.4 MB. The unit and
   * the divisor disagreed; the divisor moved, because the label is what the
   * reader compares against their Finder window.
   */
  it('formats byte sizes as decimal MB with one decimal', () => {
    expect(formatAssetSize(12_000_000)).toBe('12.0 MB');
    expect(formatAssetSize(13_002_342)).toBe('13.0 MB');
    // The real shipped asset — the number a visitor checks against Finder.
    expect(formatAssetSize(41_435_263)).toBe('41.4 MB');
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

    /**
     * An asset's filename must match **the tag**, not `package.json`.
     *
     * This assertion originally required equality with `buildDmgName(arch)` (i.e. `package.json`'s
     * development version). The intent was right — stopping a stale generation module from serving
     * the wrong file. But that shape **forbade the ordinary state between releases**: the moment
     * `package.json` moved to rc.3 after shipping v1.0.0-rc.2, the contract blocked the page from
     * offering a signed DMG that really was downloadable (measured 2026-07-28: with two rc.2 assets
     * already downloaded six times, the page displayed "not published yet").
     *
     * The real invariants are three:
     * ① the filename, URL, and tag are consistent **with each other**
     * ② the size and checksum exist
     * ③ what is published is **not ahead of** the development version — being ahead would mean
     *    advertising a build that does not exist yet, which is still a defect.
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

    // ③ The published tag must not be ahead of the development version. It is equal (release day)
    //    or behind (working on the next version).
    expect(compareVersions(tagVersion, RELEASE_VERSION)).toBeLessThanOrEqual(0);
  });
});

/** A semver-ish comparison — this repository's tags are only `major.minor.patch[-rc.N]`. */
function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.split('-');
    const nums = core.split('.').map((n) => Number.parseInt(n, 10));
    // A prerelease comes **before** the final of the same core (rc.2 < 1.0.0).
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
