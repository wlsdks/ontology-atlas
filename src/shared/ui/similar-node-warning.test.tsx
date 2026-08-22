import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SimilarNodeWarning } from './similar-node-warning';

describe('SimilarNodeWarning', () => {
  it('renders the message and both action links', () => {
    render(
      <SimilarNodeWarning
        message="비슷한 노드가 이미 있어요 — 사용자 인증 흐름"
        openLabel="그 노드 열기"
        createAnywayLabel="그래도 새로 만들기"
        onOpen={() => {}}
        onCreateAnyway={() => {}}
      />,
    );
    expect(screen.getByText('비슷한 노드가 이미 있어요 — 사용자 인증 흐름')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '그 노드 열기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '그래도 새로 만들기' })).toBeInTheDocument();
  });

  it('calls onOpen when "그 노드 열기" is clicked', () => {
    const onOpen = vi.fn();
    render(
      <SimilarNodeWarning
        message="msg"
        openLabel="그 노드 열기"
        createAnywayLabel="그래도 새로 만들기"
        onOpen={onOpen}
        onCreateAnyway={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '그 노드 열기' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('calls onCreateAnyway when "그래도 새로 만들기" is clicked — creation stays non-blocking', () => {
    const onCreateAnyway = vi.fn();
    render(
      <SimilarNodeWarning
        message="msg"
        openLabel="그 노드 열기"
        createAnywayLabel="그래도 새로 만들기"
        onOpen={() => {}}
        onCreateAnyway={onCreateAnyway}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '그래도 새로 만들기' }));
    expect(onCreateAnyway).toHaveBeenCalledTimes(1);
  });

  it('does not steal focus on render (no autoFocus, activeElement untouched)', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    render(
      <SimilarNodeWarning
        message="msg"
        openLabel="열기"
        createAnywayLabel="새로 만들기"
        onOpen={() => {}}
        onCreateAnyway={() => {}}
      />,
    );

    expect(document.activeElement).toBe(input);
    document.body.removeChild(input);
  });

  it('uses the amber-signal token ladder, not the quarantine amber-source tokens', () => {
    const { container } = render(
      <SimilarNodeWarning
        message="msg"
        openLabel="열기"
        createAnywayLabel="새로 만들기"
        onOpen={() => {}}
        onCreateAnyway={() => {}}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('--color-amber-signal');
    expect(root.className).not.toContain('--color-amber-source');
    expect(root.className).not.toContain('--color-amber-docs');
  });

  it('renders as a status role without a solid dot marker', () => {
    const { container } = render(
      <SimilarNodeWarning
        message="msg"
        openLabel="열기"
        createAnywayLabel="새로 만들기"
        onOpen={() => {}}
        onCreateAnyway={() => {}}
      />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    // Inline text plus links only, no solid dot (council decision) — there must be no
    // rounded-full dot marker.
    expect(container.querySelector('[aria-hidden] + .rounded-full')).toBeNull();
    expect(container.querySelector('span.rounded-full')).toBeNull();
  });
});
