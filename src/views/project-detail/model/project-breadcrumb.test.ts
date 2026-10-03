import { describe, expect, it } from 'vitest';

import en from '../../../../messages/en.json';
import { SITE_URL } from '@/shared/config';

import { projectBreadcrumb } from './project-breadcrumb';

describe('projectBreadcrumb', () => {
  it('names the crumbs in the page locale and points home at the canonical home', () => {
    const data = projectBreadcrumb(
      'en',
      { home: en.metadata.siteName, projects: en.metadata.pages.projects },
      'Storefront',
    );

    expect(data.itemListElement.map((item) => item.name)).toEqual([
      en.metadata.siteName,
      en.metadata.pages.projects,
      'Storefront',
    ]);
    expect(data.itemListElement[0]!.item).toBe(`${SITE_URL}/en/download/`);
  });
});
