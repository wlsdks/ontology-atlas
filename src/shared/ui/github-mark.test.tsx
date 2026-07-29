import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GithubMark } from './github-mark';

/**
 * 이 테스트가 지키는 것은 「예쁘게 그려졌나」가 아니라 **헌장 판정의 전제**다.
 *
 * 마크를 써도 되는 근거는 "GitHub 자신의 마크를 변형 없이 써서 GitHub 을
 * 가리킨다" 였다. 그래서 ① 좌표가 원본 그대로인지 ② 자기 색을 들고 오지
 * 않는지(무채색+단일 인디고 헌장) 두 가지가 회귀하면 근거가 무너진다.
 */
describe('GithubMark', () => {
  it('renders the unmodified Octicons mark-github-16 geometry', () => {
    const { container } = render(<GithubMark />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 16 16');

    const path = container.querySelector('path[data-mark-part="octicon"]');
    // 원본 path 의 시작/끝 — 좌표를 손대면(스케일·단순화·리터치) 여기서 걸린다.
    expect(path?.getAttribute('d')).toMatch(/^M8 0c4\.42 0 8 3\.58 8 8/);
    expect(path?.getAttribute('d')).toMatch(/0-4\.42 3\.58-8 8-8Z$/);
  });

  it('inherits the caller colour instead of shipping a brand colour', () => {
    const { container } = render(<GithubMark />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it('is decorative by default and sizes to the optical default', () => {
    const { container } = render(<GithubMark />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '14');
    expect(svg).toHaveAttribute('height', '14');
  });

  it('forwards size and extra svg props', () => {
    const { container } = render(<GithubMark size={20} className="my-mark" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '20');
    expect(svg).toHaveClass('my-mark');
  });
});
