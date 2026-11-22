import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveAnnouncer } from './live-announcer';

describe('LiveAnnouncer', () => {
  it('renders role=status with sr-only className', () => {
    const { container } = render(<LiveAnnouncer message="저장 완료" />);
    const element = screen.getByRole('status');
    expect(element).toBeInTheDocument();
    expect(element.className).toContain('sr-only');
    expect(container.firstElementChild).toBe(element);
  });

  it('default politeness is polite', () => {
    render(<LiveAnnouncer message="x" />);
    const element = screen.getByRole('status');
    expect(element.getAttribute('aria-live')).toBe('polite');
    expect(element.getAttribute('aria-atomic')).toBe('true');
  });

  it('politeness=assertive overrides', () => {
    render(<LiveAnnouncer message="긴급" politeness="assertive" />);
    const element = screen.getByRole('status');
    expect(element.getAttribute('aria-live')).toBe('assertive');
  });

  it('renders message verbatim into aria-live region', () => {
    const { container } = render(<LiveAnnouncer message="알림" />);
    const element = container.firstElementChild as HTMLElement;
    expect(element.textContent).toBe('알림');
  });

  it('empty message renders empty text', () => {
    const { container } = render(<LiveAnnouncer message="" />);
    const element = container.firstElementChild as HTMLElement;
    expect(element.textContent).toBe('');
  });
});
