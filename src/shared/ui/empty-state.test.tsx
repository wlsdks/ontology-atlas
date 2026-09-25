import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './empty-state';

describe('EmptyState — base', () => {
  it('renders title and description', () => {
    render(<EmptyState title="아직 비어 있어요" description="첫 항목을 추가해 보세요." />);
    expect(screen.getByText('아직 비어 있어요')).toBeInTheDocument();
    expect(screen.getByText('첫 항목을 추가해 보세요.')).toBeInTheDocument();
  });

  it('renders ReactNode description (e.g., Link inside)', () => {
    render(
      <EmptyState
        title="비어 있어요"
        // eslint-disable-next-line @next/next/no-html-link-for-pages -- test fixture, no real navigation
        description={<>첫 <a href="/start">항목</a> 을 추가해 보세요.</>}
      />,
    );
    expect(screen.getByRole('link', { name: '항목' })).toHaveAttribute('href', '/start');
  });

  it('renders action area when provided', () => {
    render(
      <EmptyState title="비어 있어요" action={<button type="button">시작</button>} />,
    );
    expect(screen.getByRole('button', { name: '시작' })).toBeInTheDocument();
  });

  it('omits description and action divs when not provided', () => {
    render(<EmptyState title="제목만" />);
    expect(screen.getByText('제목만')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('EmptyState — tone variant', () => {
  it('default tone is dashed', () => {
    const { container } = render(<EmptyState title="t" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('data-empty-tone')).toBe('dashed');
    expect(root.className).toContain('border-dashed');
  });

  it('tone=solid uses non-dashed border + 0.02 bg', () => {
    const { container } = render(<EmptyState title="t" tone="solid" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('data-empty-tone')).toBe('solid');
    expect(root.className).not.toContain('border-dashed');
    expect(root.className).toContain('bg-[color:var(--color-overlay-1)]');
  });
});

describe('EmptyState — align variant', () => {
  it('default align is left', () => {
    const { container } = render(<EmptyState title="t" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('data-empty-align')).toBe('left');
    expect(root.className).not.toContain('text-center');
  });

  it('align=center adds text-center and bigger padding', () => {
    const { container } = render(<EmptyState title="t" align="center" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('data-empty-align')).toBe('center');
    expect(root.className).toContain('text-center');
    expect(root.className).toContain('px-6');
    expect(root.className).toContain('py-10');
  });

  it('align=center centers action area too', () => {
    const { container } = render(
      <EmptyState
        title="비어 있어요"
        align="center"
        action={<button type="button">시작</button>}
      />,
    );
    const actionRow = container.querySelector('.mt-4');
    expect(actionRow).not.toBeNull();
    expect(actionRow?.className).toContain('justify-center');
  });

  it('align=center renders title in body tone (not signature weight)', () => {
    render(<EmptyState title="페이지가 비어 있어요" align="center" />);
    const titleEl = screen.getByText('페이지가 비어 있어요');
    expect(titleEl.className).toContain('font-normal');
    expect(titleEl.className).toContain('text-[color:var(--color-text-tertiary)]');
  });
});

describe('EmptyState — heading and action lines', () => {
  it('align=center with a description keeps the title at the heading step', () => {
    render(<EmptyState title="이 프로젝트가 없어요" description="다른 프로젝트를 고르세요." align="center" />);
    const titleEl = screen.getByText('이 프로젝트가 없어요');
    expect(titleEl.className).toContain('text-title');
    expect(titleEl.className).toContain('text-[color:var(--color-text-primary)]');
    expect(titleEl.className).not.toContain('font-normal');
  });

  it('with a left icon, the action row sits in the text column, not under the icon', () => {
    const { container } = render(
      <EmptyState title="t" description="d" icon={<svg />} action={<button type="button">go</button>} />,
    );
    const actionRow = container.querySelector('[data-empty-action]');
    const icon = container.querySelector('[data-empty-icon]');
    expect(actionRow).not.toBeNull();
    // The icon's sibling column holds the title, the description and the action.
    expect(icon?.nextElementSibling?.contains(actionRow)).toBe(true);
    expect(icon?.nextElementSibling?.contains(screen.getByText('t'))).toBe(true);
  });
});

describe('EmptyState — size variant', () => {
  it('size=compact uses smaller padding (left align)', () => {
    const { container } = render(<EmptyState title="t" size="compact" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('px-4');
    expect(root.className).toContain('py-4');
  });

  it('size=regular uses default padding', () => {
    const { container } = render(<EmptyState title="t" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('px-5');
    expect(root.className).toContain('py-6');
  });

  it('align=center overrides size padding (uses px-6 py-10 regardless)', () => {
    const { container } = render(
      <EmptyState title="t" size="compact" align="center" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('px-6');
    expect(root.className).toContain('py-10');
  });
});

/**
 * **A page whose entire content is this one card still needs a heading.**
 *
 * **Why this check exists** (measured at narrow widths, 2026-07-29). Below
 * 1024px the studio turns into an honest degradation card, and that route then
 * had **zero** heading elements. The screen showed 「The studio opens on a wider screen」 in large type, but the document
 * had no heading at all, so a screen-reader user could learn from the headings
 * neither what the page was nor why the studio had not opened.
 *
 * A degradation card's contract is "why, and where to instead"
 * (`.claude/rules/surfaces.md`). **If the "why" cannot be read, the contract is
 * not met.**
 *
 * The cause was not this one card but the shared primitive: `EmptyState` always
 * emitted its title as a `<p>`. The fix went into the primitive, and this check
 * pins both of its branches — **`p` by default** (an empty state inside a list
 * is not a document section) and **`h1` chosen by the caller when the card is
 * the page's content**.
 */
describe("EmptyState — 제목 태그", () => {
  it("기본은 p 다 — 목록/섹션 안의 빈 상태는 문서 구획이 아니다", () => {
    render(<EmptyState title="아직 없어요" />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("아직 없어요").tagName).toBe("P");
  });

  it("titleAs 로 heading 을 낼 수 있다", () => {
    render(<EmptyState titleAs="h1" title="공방은 넓은 화면에서 열려요" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "공방은 넓은 화면에서 열려요" }),
    ).toBeInTheDocument();
  });

  /**
   * Zero visual change is the premise of the swap: Tailwind preflight resets a
   * heading's size and weight to `inherit`, so the classes keep deciding. Lose
   * the classes and the title jumps to the browser's default h1 size.
   */
  it("태그가 바뀌어도 같은 클래스를 싣는다", () => {
    const { unmount } = render(<EmptyState title="X" />);
    const asP = screen.getByText("X").className;
    unmount();
    render(<EmptyState titleAs="h1" title="X" />);
    expect(screen.getByText("X").className).toBe(asP);
  });

  it('a shape stands in the skeleton\'s place and carries no loading marker', () => {
    const { container } = render(<EmptyState title="Empty" shape={<div data-testid="ghost">name · cadence</div>} skeleton />);
    expect(container.querySelector('[data-empty-shape]')).not.toBeNull();
    expect(container.querySelector('[data-empty-skeleton]')).toBeNull();
    expect(container.querySelector('[data-empty-shape]')?.getAttribute('aria-hidden')).toBe('true');
  });
});
