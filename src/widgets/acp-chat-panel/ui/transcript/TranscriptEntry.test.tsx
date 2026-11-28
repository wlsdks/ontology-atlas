import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'use-intl';
import { describe, expect, it } from 'vitest';

import en from '../../../../../messages/en.json';
import ko from '../../../../../messages/ko.json';

import { useRequestOpenings } from '../../model/mapping-run-history';
import { TranscriptEntry } from './TranscriptEntry';

const CATALOGUES = { en, ko } as const;

function renderRequest(text: string, locale: keyof typeof CATALOGUES = 'en', shown?: string) {
  render(
    <IntlProvider locale={locale} messages={CATALOGUES[locale]}>
      <TranscriptEntry event={{ kind: 'user', id: 'u-1', text, ...(shown ? { shown } : {}) }} markdownComponents={{}} live={false} awaiting={false} declined={false} />
    </IntlProvider>,
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
    ['a question', 'What does billing do?'],
    ['text that opens as a run request does', '48 of the 120 abilities found in this code are on the map (40%). Map the next part now.'],
  ])('leaves %s the person typed as they wrote it', async (_kind, text) => {
    // With the run request's openings read, as History reads them, it still is not relabelled.
    const openings = renderHook(() => useRequestOpenings(true));
    await waitFor(() => expect(openings.result.current).toHaveLength(4));
    renderRequest(text);
    expect(userLine()).toHaveAttribute('data-user-request', 'typed');
    expect(userLine()).toHaveTextContent(text);
    expect(screen.queryByTestId('acp-chat-request-full')).toBeNull();
  });
});
