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
 * **본문이 이 카드 하나뿐인 페이지는 제목을 갖는다.**
 *
 * ## 왜 이 검사가 생겼나 (2026-07-29 좁은 폭 실측)
 *
 * 1024px 미만에서 공방이 정직 강등 카드로 바뀌면 그 라우트의 heading 요소가
 * **0개**가 됐다. 화면에는 「공방은 넓은 화면에서 열려요」가 큼직하게 보이지만
 * 문서에는 제목이 하나도 없어서, 스크린리더 사용자는 이 페이지가 무엇인지도
 * 왜 공방이 안 열렸는지도 제목으로는 알 수 없었다.
 *
 * 강등 카드의 계약은 「왜 + 어디로」다(`surfaces.md`). **그 「왜」를 못 읽으면
 * 계약이 지켜진 것이 아니다.**
 *
 * 원인은 이 카드 하나가 아니라 공용 프리미티브였다 — `EmptyState` 가 제목을
 * 언제나 `<p>` 로 냈다. 그래서 고침도 프리미티브에서 했고, 이 검사가 그
 * 프리미티브의 두 갈래를 함께 고정한다: **기본은 `p`**(목록 안 빈 상태는
 * 문서 구획이 아니다), **페이지 본문이면 호출부가 `h1` 을 고른다.**
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
   * 시각 변화 0 이 이 교체의 전제다 — Tailwind preflight 가 heading 의
   * 크기·굵기를 `inherit` 로 되돌리므로, 클래스가 계속 결정한다. 클래스가
   * 유실되면 제목이 브라우저 기본 h1 크기로 튄다.
   */
  it("태그가 바뀌어도 같은 클래스를 싣는다", () => {
    const { unmount } = render(<EmptyState title="X" />);
    const asP = screen.getByText("X").className;
    unmount();
    render(<EmptyState titleAs="h1" title="X" />);
    expect(screen.getByText("X").className).toBe(asP);
  });
});
