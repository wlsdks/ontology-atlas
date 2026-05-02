import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    // CSS class 기반 reveal — group-hover/group-focus-within 으로만 노출.
    // 헌장 §11 — glow / scale 없이 opacity transition 만.
    expect(tooltip.className).toContain('opacity-0');
    expect(tooltip.className).toContain('pointer-events-none');
    expect(tooltip.className).toContain('group-hover:opacity-100');
    expect(tooltip.className).toContain('group-focus-within:opacity-100');
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
    // 기본 panel 클래스도 유지
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
