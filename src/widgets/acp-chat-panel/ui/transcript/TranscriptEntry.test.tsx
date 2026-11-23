import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import en from '../../../../../messages/en.json';
import ko from '../../../../../messages/ko.json';

import { TranscriptEntry } from './TranscriptEntry';

const CATALOGUES = { en, ko } as const;

function renderRequest(text: string, locale: keyof typeof CATALOGUES = 'en', shown?: string) {
  render(
    <NextIntlClientProvider locale={locale} messages={CATALOGUES[locale]}>
      <TranscriptEntry event={{ kind: 'user', id: 'u-1', text, ...(shown ? { shown } : {}) }} markdownComponents={{}} live={false} awaiting={false} declined={false} />
    </NextIntlClientProvider>,
  );
}

const userLine = () => screen.getByText((_content, element) => element?.getAttribute('data-acp-entry') === 'user');

describe('a request of a run in the conversation', () => {
  it('reads as its one line, the instruction it sent there on demand', () => {
    renderRequest('the whole instruction', 'en', 'Map the rest of the code · request 2');
    expect(userLine()).toHaveTextContent('Map the rest of the code · request 2');
    expect(screen.queryByText('the whole instruction')).toBeNull();
    fireEvent.click(screen.getByTestId('acp-chat-request-full'));
    expect(screen.getByText('the whole instruction')).toBeInTheDocument();
  });

  it.each([
    ['en', '48 of the 120 abilities found in this code are on the map (40%). Map the next part now. Run validate_vault.'],
    ['ko', '이 코드에서 찾은 기능 120개 중 48개(40%)가 지도에 있어. 다음 부분을 지금 지도에 올려 줘.'],
  ] as const)('reopened from History without its line, is known by how it opens, in %s', async (locale, text) => {
    renderRequest(text, locale);
    const title = CATALOGUES[locale].workCard.mapping.startTitle;
    expect(await screen.findByText(title)).toHaveAttribute('data-user-request', 'app-written');
    expect(screen.getByTestId('acp-chat-request-full')).toHaveAttribute('aria-expanded', 'false');
  });

  it('leaves a message the person typed as they wrote it', async () => {
    renderRequest('What does billing do?');
    expect(userLine()).toHaveAttribute('data-user-request', 'typed');
    expect(screen.queryByTestId('acp-chat-request-full')).toBeNull();
  });
});
