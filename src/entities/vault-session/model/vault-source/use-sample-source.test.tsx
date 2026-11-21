import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useSampleSource } from './use-sample-source';
import { writeSampleSourcePreference } from '@/shared/lib/vault-folder/sample-source';

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

describe('useSampleSource: shared reactive store', () => {
  afterEach(() => {
    // Isolate the next test — reset the store and localStorage to the default (storefront).
    writeSampleSourcePreference('storefront');
  });

  it('propagates setSource from one consumer to other independent consumers at once', () => {
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

  it('reflects a direct store write to mounted consumers too', () => {
    render(<Reader />);
    expect(screen.getByTestId('reader')).toHaveTextContent('storefront');
    act(() => {
      writeSampleSourcePreference('dogfood');
    });
    expect(screen.getByTestId('reader')).toHaveTextContent('dogfood');
  });
});
