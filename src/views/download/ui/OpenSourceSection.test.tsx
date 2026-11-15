import { existsSync } from 'node:fs';
import path from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import enMessages from '../../../../messages/en.json';
import { GITHUB_REPO_URL } from '@/shared/config/social-links';
import { REPO_FACTS } from '../model/repo-facts.generated';
import { OpenSourceSection } from './OpenSourceSection';

const ROOT = path.resolve(__dirname, '../../../..');

function renderSection() {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
      <OpenSourceSection />
    </NextIntlClientProvider>,
  );
  return screen.getByTestId('gateway-source-section');
}

describe('the open-source section points at this repository as it is', () => {
  it('links only folders and files that exist here, each opened without a referrer', () => {
    const links = within(renderSection()).getAllByRole('link');
    const inTree = links
      .map((link) => /\/(?:tree|blob)\/main\/(.+)$/.exec(link.getAttribute('href') ?? '')?.[1])
      .filter((target): target is string => Boolean(target));

    expect(inTree.length).toBeGreaterThan(0);
    for (const target of inTree) expect(existsSync(path.join(ROOT, target)), target).toBe(true);
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(new RegExp(`^${GITHUB_REPO_URL}(?:/|$)`));
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noreferrer');
    }
  });

  it('prints the committed counts beside the day they were read', () => {
    const section = renderSection();
    const [year, , day] = REPO_FACTS.readOn.split('-').map(Number);
    const count = new Intl.NumberFormat('en');

    expect(within(section).getByTestId('gateway-source-stars')).toHaveTextContent(count.format(REPO_FACTS.stars));
    expect(within(section).getByTestId('gateway-source-forks')).toHaveTextContent(count.format(REPO_FACTS.forks));
    expect(section).toHaveTextContent(new RegExp(`\\b${day}, ${year}`));
  });
});
