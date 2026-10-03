import { describe, expect, it } from 'vitest';

import { SITE_URL } from '@/shared/config';
import { GITHUB_REPO_URL } from '@/shared/config/social-links';

import { MACOS_RELEASE, windowsAsset } from './release-state';
import { RELEASE_MIN_MACOS, RELEASE_MIN_WINDOWS } from './release-facts';
import { downloadStructuredData } from './structured-data';

describe('downloadStructuredData', () => {
  it('uses the same trailing-slash URL as the page canonical', () => {
    const data = downloadStructuredData('ko', '설명');
    expect(data.url).toBe(`${SITE_URL}/ko/download/`);
  });

  it('describes every published installer instead of only Apple Silicon', () => {
    const data = downloadStructuredData('en', 'Description');
    const windows = windowsAsset();
    const expectedUrls = [
      ...(MACOS_RELEASE.published ? MACOS_RELEASE.assets.map((asset) => asset.downloadUrl) : []),
      ...(windows ? [windows.downloadUrl] : []),
    ];

    expect(data.downloadUrl).toEqual(expectedUrls);
    expect(data.operatingSystem).toEqual(
      windows ? [RELEASE_MIN_MACOS, RELEASE_MIN_WINDOWS] : RELEASE_MIN_MACOS,
    );
  });

  it('ties the app and its publisher to the repository the page links to', () => {
    const data = downloadStructuredData('en', 'Description');
    expect(data.sameAs).toContain(GITHUB_REPO_URL);
    expect(data.publisher.sameAs).toContain(GITHUB_REPO_URL);
  });
});
