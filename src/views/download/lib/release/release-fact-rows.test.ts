import { describe, expect, it } from 'vitest';

import { releaseFactRows, type FactRowsCopy, type FactRowsInput } from './release-fact-rows';
import { RELEASE_MIN_MACOS, RELEASE_MIN_WINDOWS } from './release-facts';
import type { MacosReleaseAsset, WindowsReleaseAsset } from './release-state';

const copy: FactRowsCopy = {
  versionLabel: 'Version',
  requiresLabel: 'Requires',
  minOsSuffix: ' or later',
  unpublished: 'not published yet',
  shaLinkName: (file) => `checksum of ${file}`,
};

const mac = {
  arch: 'aarch64',
  fileName: 'a.dmg',
  sizeBytes: 13_002_342,
  sha256: `${'1'.repeat(8)}${'0'.repeat(48)}${'f'.repeat(8)}`,
} as MacosReleaseAsset;
const windows = { arch: 'x64', fileName: 'a.exe', sizeBytes: 21_500_000, sha256: 'c'.repeat(64) } as WindowsReleaseAsset;

const base: FactRowsInput = {
  published: true,
  primaryAsset: mac,
  windowsAsset: windows,
  windowsPrimary: false,
  handheld: false,
  sizeOnCta: false,
  tag: 'v2.4.0',
  publishedOn: 'Jul 27, 2026',
};

describe('releaseFactRows', () => {
  it('names the tag and date of a published release, then the macOS floor, size and a shortened checksum', () => {
    const rows = releaseFactRows(base, copy);
    expect(rows.map((row) => row.label)).toEqual(['Version', 'Requires', 'DMG', 'SHA-256']);
    expect(rows[0]!.value).toBe('v2.4.0 · Jul 27, 2026');
    expect(rows[1]!.value).toBe(`${RELEASE_MIN_MACOS} or later · Apple Silicon`);
    expect(rows[2]!.value).toBe('13.0 MB');
    expect(rows[3]).toMatchObject({ value: '11111111…ffffffff', code: true, name: 'checksum of a.dmg' });
  });

  it('says "not published yet" instead of inventing a size or checksum', () => {
    const rows = releaseFactRows({ ...base, published: false, primaryAsset: null }, copy);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.value).toBe('v2.4.0 · not published yet');
  });

  it('drops the size and checksum on a handheld', () => {
    expect(releaseFactRows({ ...base, handheld: true }, copy)).toHaveLength(2);
  });

  it('describes the Windows installer when it leads', () => {
    const rows = releaseFactRows({ ...base, windowsPrimary: true }, copy);
    expect(rows[1]!.value).toBe(`${RELEASE_MIN_WINDOWS} or later`);
    expect(rows[2]).toMatchObject({ label: 'EXE', value: '21.5 MB' });
    expect(rows[3]!.name).toBe('checksum of a.exe');
  });

  it('shows the size only on narrow screens when the button already carries it', () => {
    expect(releaseFactRows({ ...base, sizeOnCta: true }, copy)[2]!.narrowOnly).toBe(true);
    expect(releaseFactRows(base, copy)[2]!.narrowOnly).toBe(false);
  });
});
