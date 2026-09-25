import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InfoHint } from './info-hint';

describe('InfoHint', () => {
  it('renders trigger button with aria-label', () => {
    render(
      <InfoHint label="검수 큐 설명">
        <p>검수 큐는 추출 후보를 검토하는 곳입니다.</p>
      </InfoHint>,
    );
    const btn = screen.getByRole('button', { name: '검수 큐 설명' });
    expect(btn).toBeInTheDocument();
  });

  it('renders panel with role=tooltip and children', () => {
    render(
      <InfoHint label="x">
        <p>도움말 본문</p>
      </InfoHint>,
    );
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip.textContent).toBe('도움말 본문');
  });

  it('panel is initially hidden (pointer-events-none + opacity-0)', () => {
    render(
      <InfoHint label="x">
        <p>본문</p>
      </InfoHint>,
    );
    const tooltip = screen.getByRole('tooltip');
    // Revealed purely by CSS class, through group-hover/group-focus-within.
    // Charter rule: opacity transition only, no glow and no scale.
    expect(tooltip.className).toContain('opacity-0');
    expect(tooltip.className).toContain('pointer-events-none');
    expect(tooltip.className).toContain('group-hover:opacity-100');
    expect(tooltip.className).toContain('group-focus-within:opacity-100');
  });

  it('Escape puts the panel away until focus leaves, without closing what holds it', () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={(event) => outer(event.key)}>
        <InfoHint label="x">
          <p>본문</p>
        </InfoHint>
      </div>,
    );
    const button = screen.getByRole('button', { name: 'x' });
    const tooltip = screen.getByRole('tooltip');
    button.focus();
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(outer).not.toHaveBeenCalled();
    expect(tooltip.className).not.toContain('group-focus-within:opacity-100');
    expect(tooltip.className).not.toContain('group-hover:opacity-100');
    // A second Escape belongs to whatever holds the hint (a dialog closes).
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(outer).toHaveBeenCalledWith('Escape');
    fireEvent.blur(button);
    expect(tooltip.className).toContain('group-focus-within:opacity-100');
    // Focus alone never makes the panel catch the pointer.
    expect(tooltip.className).not.toContain('group-focus-within:pointer-events-auto');
  });

  it('merges custom className on root', () => {
    const { container } = render(
      <InfoHint label="x" className="data-custom-root">
        <p>본문</p>
      </InfoHint>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('data-custom-root');
    expect(root.className).toContain('group');
    expect(root.className).toContain('relative');
  });

  it('merges custom panelClassName on panel', () => {
    render(
      <InfoHint label="x" panelClassName="data-custom-panel">
        <p>본문</p>
      </InfoHint>,
    );
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.className).toContain('data-custom-panel');
    // The base panel classes are kept too.
    expect(tooltip.className).toContain('absolute');
  });

  it('renders ReactNode children (e.g., <a> link)', () => {
    render(
      <InfoHint label="x">
        <>
          <p>설명</p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- test fixture */}
          <a href="/docs">자세히 →</a>
        </>
      </InfoHint>,
    );
    expect(screen.getByRole('link', { name: '자세히 →' })).toHaveAttribute(
      'href',
      '/docs',
    );
  });
});
