import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useSampleSource } from './use-sample-source';
import { writeSampleSourcePreference } from '@/shared/lib/sample-source';

// 두 독립 컴포넌트가 각자 useSampleSource 를 호출한다 — 하나(카드)가 값을
// 바꾸면 다른 하나(insight)도 리로드 없이 즉시 재렌더되어야 한다. 이게
// 안 되던 게 2026-07 실측 결함(독립 useState → 지도 안 바뀜)이었다.
function Writer() {
  const [, setSource] = useSampleSource();
  return (
    <button type="button" onClick={() => setSource('storefront')}>
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
    // 다음 테스트 격리 — 스토어 + localStorage 를 dogfood 로 되돌린다.
    writeSampleSourcePreference('dogfood');
  });

  it('한 소비자의 setSource 가 독립된 다른 소비자에게 즉시 전파된다', () => {
    render(
      <>
        <Writer />
        <Reader />
      </>,
    );
    expect(screen.getByTestId('reader')).toHaveTextContent('dogfood');

    act(() => {
      screen.getByRole('button', { name: 'switch' }).click();
    });

    // 리로드 없이 Reader 가 storefront 로 갱신 — 스토어 구독 덕분.
    expect(screen.getByTestId('reader')).toHaveTextContent('storefront');
  });

  it('스토어 직접 write 도 마운트된 소비자에게 반영된다', () => {
    render(<Reader />);
    expect(screen.getByTestId('reader')).toHaveTextContent('dogfood');
    act(() => {
      writeSampleSourcePreference('storefront');
    });
    expect(screen.getByTestId('reader')).toHaveTextContent('storefront');
  });
});
