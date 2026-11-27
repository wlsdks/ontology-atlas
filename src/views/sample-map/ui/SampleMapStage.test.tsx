import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enMessages from '../../../../messages/en.json';
import type { SampleMap } from '../model/use-sample-map';
import { SampleMapStage } from './SampleMapStage';

const mocks = vi.hoisted(() => ({ sample: { status: 'loading' } as SampleMap }));

vi.mock('../model/use-sample-map', () => ({ useSampleMap: () => mocks.sample }));

function renderStage() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <SampleMapStage />
    </NextIntlClientProvider>,
  );
}

describe('SampleMapStage', () => {
  beforeEach(() => {
    mocks.sample = { status: 'loading' };
  });

  it('says the sample did not load and asks again only when the visitor presses Try again', () => {
    const retry = vi.fn();
    mocks.sample = { status: 'failed', retry };
    renderStage();

    expect(screen.getByTestId('sample-map-failed')).toHaveTextContent(enMessages.sampleMap.loadFailed);
    expect(retry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: enMessages.sampleMap.retry }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
