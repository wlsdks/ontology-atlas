import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveAnnouncer } from './live-announcer';

describe('LiveAnnouncer', () => {
  it('renders role=status with sr-only className', () => {
    const { container } = render(<LiveAnnouncer message="저장 완료" />);
    const el = screen.getByRole('status');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('sr-only');
    expect(container.firstElementChild).toBe(el);
  });

  it('default politeness is polite', () => {
    render(<LiveAnnouncer message="x" />);
    const el = screen.getByRole('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.getAttribute('aria-atomic')).toBe('true');
  });

  it('politeness=assertive overrides', () => {
    render(<LiveAnnouncer message="긴급" politeness="assertive" />);
    const el = screen.getByRole('status');
    expect(el.getAttribute('aria-live')).toBe('assertive');
  });

  it('message has trailing zero-width space (iOS VoiceOver dedup workaround)', () => {
    const { container } = render(<LiveAnnouncer message="알림" />);
    const el = container.firstElementChild as HTMLElement;
    // iOS VoiceOver 가 같은 message 의 반복 update 를 무시 — 매번 보이지 않는
    // ​ 를 끝에 붙여 dedup 회피.
    expect(el.textContent).toBe('알림​');
  });

  it('empty message renders empty text (no zero-width space artifact)', () => {
    const { container } = render(<LiveAnnouncer message="" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.textContent).toBe('');
  });
});
