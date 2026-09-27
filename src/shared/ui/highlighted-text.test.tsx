import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HighlightedText } from './highlighted-text';

describe('HighlightedText', () => {
  it('renders plain text without a mark when there is no query', () => {
    render(<HighlightedText text="Auth Service" />);
    expect(screen.getByText('Auth Service').tagName).not.toBe('MARK');
  });

  it('wraps the matched part in a mark and leaves the rest plain', () => {
    const { container } = render(
      <HighlightedText text="Authentication" query="auth" />,
    );
    const mark = container.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('Auth');
    expect(container.textContent).toBe('Authentication');
  });

  it('renders the whole text without a mark when nothing matches', () => {
    const { container } = render(
      <HighlightedText text="Auth Service" query="zzz" />,
    );
    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toBe('Auth Service');
  });
});
