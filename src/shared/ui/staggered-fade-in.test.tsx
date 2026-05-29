import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StaggeredFadeIn } from './staggered-fade-in';

describe('StaggeredFadeIn', () => {
  it('모든 자식을 그대로 렌더한다 (애니메이션이 콘텐츠를 가리지 않음)', () => {
    render(
      <StaggeredFadeIn as="ul">
        <li>alpha</li>
        <li>beta</li>
        <li>gamma</li>
      </StaggeredFadeIn>,
    );
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(screen.getByText('gamma')).toBeInTheDocument();
  });

  it('ariaLabel 을 컨테이너에 전달한다 (의미 있는 region 보존)', () => {
    render(
      <StaggeredFadeIn as="section" ariaLabel="통계 strip">
        <div>x</div>
      </StaggeredFadeIn>,
    );
    expect(
      screen.getByRole('region', { name: '통계 strip' }),
    ).toBeInTheDocument();
  });

  it('각 자식에 motion-reduce 안전 클래스를 주입한다 (prefers-reduced-motion 존중)', () => {
    render(
      <StaggeredFadeIn>
        <div data-testid="child">y</div>
      </StaggeredFadeIn>,
    );
    expect(screen.getByTestId('child').className).toContain(
      'motion-reduce:!transition-none',
    );
  });

  it('자식에 inline transform/opacity transition style 을 주입한다', () => {
    render(
      <StaggeredFadeIn>
        <div data-testid="child">z</div>
      </StaggeredFadeIn>,
    );
    const style = screen.getByTestId('child').getAttribute('style') ?? '';
    expect(style).toContain('opacity');
    expect(style).toContain('transition');
  });

  it('큰 리스트에서 stagger delay 를 maxStaggerSteps 로 상한 (절름발이 cascade 방지)', () => {
    render(
      <StaggeredFadeIn stagger={60} maxStaggerSteps={8}>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} data-testid={`c${i}`}>
            {i}
          </div>
        ))}
      </StaggeredFadeIn>,
    );
    // 상한 이내(index 2) → 2*60 = 120ms
    expect(screen.getByTestId('c2').getAttribute('style')).toContain('120ms');
    // 상한 초과(index 11) → 12초가 아니라 8*60 = 480ms 로 cap (660ms 아님)
    const capped = screen.getByTestId('c11').getAttribute('style') ?? '';
    expect(capped).toContain('480ms');
    expect(capped).not.toContain('660ms');
  });
});
