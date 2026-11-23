import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../../../../messages/en.json';
import ko from '../../../../../../messages/ko.json';
import type { MappingFinishedRequest } from '@/features/work-run';

import { MAPPING_REQUESTS_SHOWN, MappingRunRequests } from './MappingRunRequests';

const CATALOGUES = { en, ko } as const;

const requests = (count: number): MappingFinishedRequest[] =>
  Array.from({ length: count }, (_, index) => ({ gained: index === 1 ? 0 : 24, durationMs: 2 * 60_000, sessionId: `s-${index + 1}` }));

function renderLines(finished: MappingFinishedRequest[], options: { shownSession?: string | null; canOpen?: boolean; locale?: keyof typeof CATALOGUES } = {}) {
  const on = { onOpen: vi.fn(), onOpenAll: vi.fn() };
  render(
    <NextIntlClientProvider locale={options.locale ?? 'en'} messages={CATALOGUES[options.locale ?? 'en']}>
      <MappingRunRequests finished={finished} shownSession={options.shownSession ?? null} canOpen={options.canOpen ?? true} {...on} />
    </NextIntlClientProvider>,
  );
  return on;
}

const lines = () => screen.queryAllByTestId('mapping-run-request').map((line) => line.textContent);

describe('a run\'s finished requests above the conversation', () => {
  it('reads each as one line, says plainly when one put nothing new on the map, and opens its conversation', () => {
    const on = renderLines(requests(3), { shownSession: 's-3' });
    expect(lines()).toEqual([
      'Request 1 · 24 abilities put on the map · 2 minutes',
      'Request 2 · nothing new put on the map · 2 minutes',
    ]);
    fireEvent.click(screen.getAllByTestId('mapping-run-request')[0]!);
    expect(on.onOpen).toHaveBeenCalledWith('s-1');
  });

  it('keeps the live request in view: the last five, and one line for the earlier ones that opens them all', () => {
    const on = renderLines(requests(30), { shownSession: 's-31' });
    expect(lines()).toHaveLength(MAPPING_REQUESTS_SHOWN);
    expect(lines()[0]).toMatch(/^Request 26 ·/);
    expect(screen.getByTestId('mapping-run-requests-earlier')).toHaveTextContent('Earlier requests · 25');
    fireEvent.click(screen.getByTestId('mapping-run-requests-earlier'));
    expect(on.onOpenAll).toHaveBeenCalledTimes(1);
  });

  it('opens nothing while a request of the run is running', () => {
    const on = renderLines(requests(2), { canOpen: false });
    for (const line of screen.getAllByTestId('mapping-run-request')) expect(line).toBeDisabled();
    fireEvent.click(screen.getAllByTestId('mapping-run-request')[0]!);
    expect(on.onOpen).not.toHaveBeenCalled();
  });

  it('speaks Korean', () => {
    renderLines(requests(2), { locale: 'ko', shownSession: 's-9' });
    expect(lines()).toEqual(['요청 1번째 · 기능 24개를 지도에 올림 · 2분', '요청 2번째 · 지도에 새로 올린 기능 없음 · 2분']);
  });
});
