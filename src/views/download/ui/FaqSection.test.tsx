import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import enMessages from '../../../../messages/en.json';
import { FAQ_KEYS } from '../model/faq';
import { FaqSection } from './FaqSection';

const FAQ = enMessages.download.faq;

function renderFaq() {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <FaqSection />
    </NextIntlClientProvider>,
  );
  return screen.getByTestId('gateway-faq-section');
}

describe('the FAQ', () => {
  it('stands each question over its whole answer, one row each', () => {
    const rows = within(renderFaq()).getAllByTestId('gateway-faq-row');
    expect(rows).toHaveLength(FAQ_KEYS.length);
    rows.forEach((row, index) => {
      const item = FAQ.items[FAQ_KEYS[index]];
      expect(within(row).getByRole('heading', { level: 3 })).toHaveTextContent(item.q);
      expect([...row.querySelectorAll('p')].map((p) => p.textContent)).toEqual([item.a]);
    });
  });

  it('draws the privacy answer with every label as page text', () => {
    const drawing = within(renderFaq()).getByTestId('gateway-faq-drawing');
    expect(drawing.closest('[data-faq-key]')).toHaveAttribute('data-faq-key', 'privacy');
    expect([...drawing.querySelectorAll('[data-faq-label]')].map((label) => label.textContent).sort()).toEqual(
      Object.values(FAQ.diagram).sort(),
    );
  });
});
