import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HighlightedText } from './highlighted-text';

describe('HighlightedText', () => {
  it('query 없으면 plain 텍스트 (mark 없음)', () => {
    render(<HighlightedText text="Auth Service" />);
    expect(screen.getByText('Auth Service').tagName).not.toBe('MARK');
  });

  it('매치 부분을 <mark> 로 강조하고 나머지는 plain', () => {
    const { container } = render(
      <HighlightedText text="Authentication" query="auth" />,
    );
    const mark = container.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('Auth');
    // 전체 텍스트는 손실 없이 보존.
    expect(container.textContent).toBe('Authentication');
  });

  it('매치 없으면 mark 없이 전체 텍스트', () => {
    const { container } = render(
      <HighlightedText text="Auth Service" query="zzz" />,
    );
    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toBe('Auth Service');
  });
});
