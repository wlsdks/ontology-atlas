import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import enMessages from '../../../../messages/en.json';
import { ScreensStage } from './ScreensStage';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('ScreensStage', () => {
  it('opens the live map in this browser from the Map row, with no arrow', () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ScreensStage intro={null} />
      </NextIntlClientProvider>,
    );

    const map = screen.getByTestId('gateway-screens-map');
    expect(map).toHaveAttribute('href', '/topology');
    expect(map).toHaveAccessibleName(enMessages.download.screens.mapLink);
    expect(map).toHaveTextContent(enMessages.download.screens.mapHint);
    expect(map.textContent).not.toMatch(/[↑↗→]/);
  });
});
