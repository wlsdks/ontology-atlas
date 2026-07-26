import { render, screen, waitFor } from '@testing-library/react';
import { useLayoutEffect, useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  buildRouteFocusHref,
  rememberRouteFocusIntent,
  RouteFocusManager,
} from './route-focus-manager';

const route = vi.hoisted(() => ({ pathname: '/ko/topology/' }));

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => route.pathname,
}));

function Surface({ title, withHeading = true }: { title: string; withHeading?: boolean }) {
  return (
    <main id="main" data-testid="main">
      {withHeading ? <h1>{title}</h1> : <p>{title}</p>}
    </main>
  );
}

function FocusOwnedSurface() {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => {
    buttonRef.current?.focus();
  }, []);

  return (
    <main id="main">
      <h1>공방</h1>
      <button ref={buttonRef} type="button">
        선택 노드
      </button>
    </main>
  );
}

describe('RouteFocusManager', () => {
  it('does not move focus on the initial surface mount', () => {
    route.pathname = '/ko/topology/';
    render(
      <>
        <RouteFocusManager />
        <Surface title="지도" />
      </>,
    );

    expect(screen.getByRole('heading', { name: '지도' })).not.toHaveFocus();
  });

  it('restores an explicit route intent after the persistent shell remounts', async () => {
    route.pathname = '/ko/topology/';
    rememberRouteFocusIntent('/docs/');
    route.pathname = '/ko/docs/';

    render(
      <>
        <RouteFocusManager />
        <Surface title="문서함" />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '문서함' })).toHaveFocus();
    });
  });

  it('waits for a suspended destination surface before consuming its reading start', async () => {
    route.pathname = '/ko/topology/';
    rememberRouteFocusIntent('/docs/');
    route.pathname = '/ko/docs/';

    const view = render(<RouteFocusManager />);
    expect(document.activeElement).toBe(document.body);

    view.rerender(
      <>
        <RouteFocusManager />
        <Surface title="문서함" />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '문서함' })).toHaveFocus();
    });
  });

  it('survives a native navigation through a temporary URL focus marker', async () => {
    expect(buildRouteFocusHref('/docs/?intent=local')).toBe(
      '/docs/?intent=local&focus=main',
    );

    route.pathname = '/ko/docs/';
    window.history.replaceState({}, '', '/ko/docs/?focus=main');
    const view = render(<RouteFocusManager />);

    view.rerender(
      <>
        <RouteFocusManager />
        <Surface title="문서함" />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '문서함' })).toHaveFocus();
    });
    expect(window.location.search).not.toContain('focus=main');
  });

  it('waits for the destination surface to settle before consuming the URL marker', async () => {
    route.pathname = '/ko/docs/';
    window.history.replaceState({}, '', '/ko/docs/?focus=main');
    const view = render(
      <>
        <RouteFocusManager />
        <Surface key="loading" title="문서함 준비 중" />
      </>,
    );

    view.rerender(
      <>
        <RouteFocusManager />
        <Surface key="ready" title="문서함" />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '문서함' })).toHaveFocus();
    });
    expect(screen.queryByRole('heading', { name: '문서함 준비 중' })).not.toBeInTheDocument();
  });

  it('moves an orphaned client route transition to the new surface heading', async () => {
    route.pathname = '/ko/topology/';
    const view = render(
      <>
        <RouteFocusManager />
        <Surface title="지도" />
      </>,
    );

    route.pathname = '/ko/docs/';
    view.rerender(
      <>
        <RouteFocusManager />
        <Surface title="문서함" />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '문서함' })).toHaveFocus();
    });
    expect(screen.getByRole('heading', { name: '문서함' })).toHaveAttribute('tabindex', '-1');
  });

  it('falls back to the main landmark when a surface has no h1', async () => {
    route.pathname = '/ko/topology/';
    const view = render(
      <>
        <RouteFocusManager />
        <Surface title="지도" />
      </>,
    );

    route.pathname = '/ko/custom/';
    view.rerender(
      <>
        <RouteFocusManager />
        <Surface title="제목 없는 화면" withHeading={false} />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('main')).toHaveFocus();
    });
  });

  it('uses the page h1 when a workbench header sits outside the main landmark', async () => {
    route.pathname = '/ko/topology/';
    const view = render(
      <>
        <RouteFocusManager />
        <Surface title="지도" />
      </>,
    );

    route.pathname = '/ko/docs/';
    view.rerender(
      <>
        <RouteFocusManager />
        <header>
          <h1>문서함</h1>
        </header>
        <main id="main">문서 내용</main>
      </>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '문서함' })).toHaveFocus();
    });
    expect(screen.getByRole('main')).not.toHaveFocus();
  });

  it('does not move focus for the same pathname or a locale-only change', () => {
    route.pathname = '/ko/docs/';
    const view = render(
      <>
        <RouteFocusManager />
        <Surface title="문서함" />
      </>,
    );

    view.rerender(
      <>
        <RouteFocusManager />
        <Surface title="문서함 query 변경" />
      </>,
    );
    expect(screen.getByRole('heading', { name: '문서함 query 변경' })).not.toHaveFocus();

    route.pathname = '/en/docs/';
    view.rerender(
      <>
        <RouteFocusManager />
        <Surface title="Documents" />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Documents' })).not.toHaveFocus();
  });

  it('does not override focus already owned by the destination task', () => {
    route.pathname = '/ko/topology/';
    const view = render(
      <>
        <RouteFocusManager />
        <Surface title="지도" />
      </>,
    );

    route.pathname = '/ko/ontology/studio/';
    view.rerender(
      <>
        <RouteFocusManager />
        <FocusOwnedSurface />
      </>,
    );

    expect(screen.getByRole('button', { name: '선택 노드' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: '공방' })).not.toHaveFocus();
  });

  // 로딩 자리표시자는 목적지가 아니다 — 여기에 포커스를 두면 진짜 화면이
  // 그 노드를 교체하는 순간 포커스가 body 로 떨어진다.
  it('waits past the loading placeholder and lands on the real destination', async () => {
    route.pathname = '/ko/topology/';
    const view = render(
      <>
        <RouteFocusManager />
        <Surface title="지도" />
      </>,
    );

    route.pathname = '/ko/ontology/studio/';
    view.rerender(
      <>
        <RouteFocusManager />
        <main id="main" data-route-loading="true" data-testid="loading-main">
          <p>화면을 불러오는 중이에요.</p>
        </main>
      </>,
    );

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(screen.getByTestId('loading-main')).not.toHaveFocus();

    view.rerender(
      <>
        <RouteFocusManager />
        <Surface title="공방" />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '공방' })).toHaveFocus();
    });
  });
});
