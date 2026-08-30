import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useSampleSource } from './use-sample-source';
import { writeSampleSourcePreference } from '@/shared/lib/sample-source';

// Two independent components each call `useSampleSource` — when one (the card) changes the
// value, the other (insight) must re-render immediately without a reload. Not doing so was
// the defect measured in 2026-07 (independent `useState`, so the map never changed).
function Writer() {
  const [, setSource] = useSampleSource();
  return (
    <button type="button" onClick={() => setSource('dogfood')}>
      switch
    </button>
  );
}

function Reader() {
  const [source] = useSampleSource();
  return <span data-testid="reader">{source}</span>;
}

describe('useSampleSource — 공유 반응 스토어', () => {
  afterEach(() => {
    // Isolate the next test — reset the store and localStorage to the default (storefront).
    writeSampleSourcePreference('storefront');
  });

  it('한 소비자의 setSource 가 독립된 다른 소비자에게 즉시 전파된다', () => {
    render(
      <>
        <Writer />
        <Reader />
      </>,
    );
    expect(screen.getByTestId('reader')).toHaveTextContent('storefront');

    act(() => {
      screen.getByRole('button', { name: 'switch' }).click();
    });

    // Reader updates to dogfood without a reload, thanks to the store subscription.
    expect(screen.getByTestId('reader')).toHaveTextContent('dogfood');
  });

  it('스토어 직접 write 도 마운트된 소비자에게 반영된다', () => {
    render(<Reader />);
    expect(screen.getByTestId('reader')).toHaveTextContent('storefront');
    act(() => {
      writeSampleSourcePreference('dogfood');
    });
    expect(screen.getByTestId('reader')).toHaveTextContent('dogfood');
  });
});
