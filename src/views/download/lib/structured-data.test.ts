import { describe, expect, it } from 'vitest';

import { SITE_URL } from '@/shared/config';
import { GITHUB_REPO_URL } from '@/shared/config/social-links';
import { SITE_ORGANIZATION_ID } from '@/shared/config/site-entity';

import { MACOS_RELEASE, windowsAsset } from './release-state';
import { RELEASE_MIN_MACOS, RELEASE_MIN_WINDOWS } from './release-facts';
import { downloadStructuredData } from './structured-data';

const NAMING_KO = { reading: '온톨로지 아틀라스', keywords: '온톨로지, 지식 그래프' };
const NAMING_EN = { reading: 'Ontology Atlas', keywords: 'ontology, knowledge graph' };

describe('downloadStructuredData', () => {
  it('uses the same trailing-slash URL as the page canonical', () => {
    const data = downloadStructuredData('ko', '설명', NAMING_KO);
    expect(data.url).toBe(`${SITE_URL}/ko/download/`);
  });

  it('describes every published installer instead of only Apple Silicon', () => {
    const data = downloadStructuredData('en', 'Description', NAMING_EN);
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

  it('ties the app to the repository and to the one site Organization by id', () => {
    const data = downloadStructuredData('en', 'Description', NAMING_EN);
    expect(data.sameAs).toContain(GITHUB_REPO_URL);
    expect(data.publisher).toEqual({ '@id': SITE_ORGANIZATION_ID });
    expect(data.author).toEqual({ '@id': SITE_ORGANIZATION_ID });
  });
});

describe('the brand as each language reads it', () => {
  it('names the local reading beside the canonical name, never repeating it', () => {
    expect(downloadStructuredData('ko', '설명', NAMING_KO).alternateName).toEqual(['ontology-atlas', '온톨로지 아틀라스']);
    expect(downloadStructuredData('en', 'Description', NAMING_EN).alternateName).toEqual(['ontology-atlas']);
  });
});
