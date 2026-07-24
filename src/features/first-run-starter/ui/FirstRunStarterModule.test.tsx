import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIRST_RUN_STARTER_DISMISSED_KEY } from '../model/first-run-starter-dismiss';
import { FirstRunStarterModule } from './FirstRunStarterModule';

interface MockVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  errorMessage: string | null;
  restoreAttempted: boolean;
  open: ReturnType<typeof vi.fn>;
  scaffoldOntology: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  vault: null as unknown as MockVault,
  mode: 'static' as 'static' | 'local',
}));

vi.mock('@/features/docs-vault-local', async () => {
  const actual = await vi.importActual<typeof import('@/features/docs-vault-local')>(
    '@/features/docs-vault-local',
  );
  return { ...actual, useLocalVault: () => mocks.vault };
});

vi.mock('@/features/data-source-mode', () => ({
  useDataSourceMode: () => mocks.mode,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function makeVault(): MockVault {
  return {
    status: 'idle',
    manifest: null,
    errorMessage: null,
    restoreAttempted: true,
    open: vi.fn(async () => undefined),
    scaffoldOntology: vi.fn(async () => ({ created: 8, skipped: 0 })),
  };
}

describe('FirstRunStarterModule', () => {
  beforeEach(() => {
    mocks.vault = makeVault();
    mocks.mode = 'static';
    window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
    window.localStorage.removeItem('demo:sample-source:v1');
    window.localStorage.setItem('vault-open-guide:auto:v1', '1');
  });

  it('renders the real census numbers passed in (concepts/relations/domains)', () => {
    render(<FirstRunStarterModule concepts={102} relations={478} domains={6} />);

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(screen.getByText('102')).toBeInTheDocument();
    expect(screen.getByText('478')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  // 2026-07-24 온보딩 라운드 — 투어 진입점이 우측 레일 아이콘뿐이라
  // 발견되지 않았다. onStartTour 가 주어지면 2차 CTA 로 렌더되고 클릭이
  // 콜백을 부르는지, 생략 시 렌더되지 않는지 고정한다.
  it('renders the tour CTA when onStartTour is provided and routes the click', () => {
    const onStartTour = vi.fn();
    render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1} onStartTour={onStartTour} />,
    );
    const cta = screen.getByTestId('first-run-tour-cta');
    fireEvent.click(cta);
    expect(onStartTour).toHaveBeenCalledTimes(1);
  });

  it('renders no tour CTA when onStartTour is omitted', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);
    expect(screen.queryByTestId('first-run-tour-cta')).not.toBeInTheDocument();
  });

  // 2026-07-24 온보딩 라운드 — 톱니 속 '일반' 토글의 원거리 힌트를 1클릭
  // 토글로 승격. 콜백이 있으면 버튼, 이미 켜져 있으면 비노출, 콜백이 없으면
  // 종전 힌트 문장 유지(P2 결함③ 하위호환).
  it('promotes the plain-mode hint to a one-click toggle when the callback is provided', () => {
    const onEnablePlainMode = vi.fn();
    render(
      <FirstRunStarterModule
        concepts={1}
        relations={1}
        domains={1}
        onEnablePlainMode={onEnablePlainMode}
      />,
    );
    expect(screen.queryByTestId('first-run-starter-plain-mode-hint')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('first-run-plain-toggle'));
    expect(onEnablePlainMode).toHaveBeenCalledTimes(1);
  });

  it('hides the plain-mode toggle entirely once plain mode is already on', () => {
    render(
      <FirstRunStarterModule
        concepts={1}
        relations={1}
        domains={1}
        onEnablePlainMode={vi.fn()}
        audiencePlain
      />,
    );
    expect(screen.queryByTestId('first-run-plain-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-run-starter-plain-mode-hint')).not.toBeInTheDocument();
  });

  // 페르소나 재조사 개선 후보 2 (2026-07-23) — 완전 초심자는 카드에서
  // 화면 설명은 읽지만 제품 이름을 알 방법이 없었다. 브랜드 워드마크
  // 한 줄이 캡션 위에 항상 렌더되는지 고정한다.
  it('renders a brand wordmark line above the first-run caption', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    expect(screen.getByTestId('first-run-starter-brand')).toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-brand')).toHaveTextContent('brand');
  });

  it('does not render once a vault is active (local mode)', () => {
    mocks.mode = 'local';
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  it('does not render before the vault restore attempt has settled', () => {
    mocks.vault.restoreAttempted = false;
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  // 2026-07-24 온보딩 라운드 — 폴더 CTA 는 OS 선택창 직행 대신 사전 안내
  // 시트를 먼저 연다. "기존 폴더 선택" 확정 후에만 vault.open() 이 불린다.
  it('opens the guide sheet first, then wires "choose existing" to vault.open()', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    fireEvent.click(screen.getByTestId('first-run-starter-open'));
    expect(mocks.vault.open).not.toHaveBeenCalled();
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('vault-guide-pick-existing'));
    expect(mocks.vault.open).toHaveBeenCalledTimes(1);
  });

  it('scaffolds a starter structure after the sheet\'s "start fresh" opens an empty folder', async () => {
    mocks.vault.open = vi.fn(async () => {
      mocks.vault.status = 'loaded';
      mocks.vault.manifest = { docs: [] };
    });
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    fireEvent.click(screen.getByTestId('first-run-starter-create'));
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('vault-guide-create-new'));

    await waitFor(() => {
      expect(mocks.vault.scaffoldOntology).toHaveBeenCalledTimes(1);
    });
  });

  it('dismissing hides the module and persists for the session', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    fireEvent.click(screen.getByTestId('first-run-starter-dismiss'));

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(FIRST_RUN_STARTER_DISMISSED_KEY)).toBe('1');
  });

  it('does not render at all on a later mount within the same session', () => {
    window.sessionStorage.setItem(FIRST_RUN_STARTER_DISMISSED_KEY, '1');

    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  // 폴더-우선 첫 방문 (소유자 지시 2026-07-24) — 첫 화면을 열자마자 폴더
  // 지정 유도 시트가 1회 자동으로 열리고, 플래그가 있으면 다시 안 뜬다.
  it('auto-opens the folder guide sheet once on the very first visit', () => {
    vi.useFakeTimers();
    window.localStorage.removeItem('vault-open-guide:auto:v1');
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);
    expect(screen.queryByTestId('vault-guide-sheet')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();
    expect(window.localStorage.getItem('vault-open-guide:auto:v1')).toBe('1');
    vi.useRealTimers();
  });

  it('does not auto-open the folder guide sheet on later visits', () => {
    vi.useFakeTimers();
    window.localStorage.setItem('vault-open-guide:auto:v1', '1');
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByTestId('vault-guide-sheet')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  // 2026-07-24 QA 실측 회귀 — 사전 안내 시트가 열린 동안 Esc 는 시트만
  // 닫아야 한다. 캡처 단계 dismiss 핸들러가 모달에 양보하는지 고정한다.
  it('Escape while the guide sheet is open closes the sheet, not the card', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);
    fireEvent.click(screen.getByTestId('first-run-starter-open'));
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(FIRST_RUN_STARTER_DISMISSED_KEY)).toBeNull();
  });

  it('Escape dismisses the module', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  // P1-① (2026-07-21 리텐션 라운드) — 웹 첫 화면에서 코드베이스 자동
  // 부트스트랩(CLI/에이전트 전용)으로 가는 다리가 전혀 없어 "내 리포를
  // 5분 만에 지도로" 여정이 완결되지 않았다. 카드 안 명령 복사 한 줄로
  // 그 다리를 놓는다.
  //
  // 온보딩 디자이너 지적(H4) — 그 npx 블록이 비개발자 첫 시선을 뺏어
  // 기본 접힘 disclosure 뒤로 옮겼다. 기본 상태에선 명령이 보이지 않고,
  // "개발자라면 —" 토글을 펼쳐야 나온다.
  it('keeps the CLI bootstrap command collapsed behind a developer disclosure by default', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    expect(screen.getByTestId('first-run-starter-cli-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run-starter-cli-bridge')).not.toBeInTheDocument();
    expect(
      screen.queryByText('npx ontology-atlas init && npx ontology-atlas bootstrap'),
    ).not.toBeInTheDocument();
  });

  it('reveals the exact init+bootstrap command when the developer disclosure is expanded', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);
    fireEvent.click(screen.getByTestId('first-run-starter-cli-toggle'));

    expect(screen.getByTestId('first-run-starter-cli-bridge')).toBeInTheDocument();
    expect(screen.getByText('npx ontology-atlas init && npx ontology-atlas bootstrap')).toBeInTheDocument();
  });

  // 소유자 실보고 2026-07-23 — 라벨·명령·복사가 한 행을 3분할해 명령이
  // "npx ontology-atlas i…" 로 잘렸다. 코드 라인은 말줄임 대신 전폭 +
  // 단어 경계 줄바꿈이어야 명령 전문이 복사 전에 눈으로 검증된다.
  it('renders the command as a full-width wrapping code line — never mid-word ellipsis', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);
    fireEvent.click(screen.getByTestId('first-run-starter-cli-toggle'));

    const code = screen.getByText('npx ontology-atlas init && npx ontology-atlas bootstrap');
    expect(code.tagName).toBe('CODE');
    expect(code.className).not.toContain('truncate');
    expect(code.className).toContain('whitespace-pre-wrap');
    expect(code.className).toContain('break-words');
  });

  // ease-of-use G1 (2026-07-23) — Safari/Firefox 는 FSA 가 없어 가장 눈에
  // 띄는 인디고 CTA 가 "눌러야 실패"였다. 미지원 상태에선 사전에 정직하게
  // 강등: 폴더 열기·새 vault 만들기 대신 고지 한 줄 + /download 링크.
  it('demotes both FSA CTAs to an honest notice + download link when the browser is unsupported', () => {
    mocks.vault.status = 'unsupported';
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    expect(screen.queryByTestId('first-run-starter-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-run-starter-create')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-unsupported')).toHaveTextContent('unsupportedNotice');
    expect(screen.getByTestId('first-run-starter-unsupported-cta')).toHaveAttribute(
      'href',
      '/download/',
    );
    // "여기서 둘러볼게요"(dismiss) 는 미지원과 무관하게 유지.
    expect(screen.getByTestId('first-run-starter-dismiss')).toBeInTheDocument();
  });

  // P2 결함③ (사용성 전수 검수 2026-07-23) — 비개발자가 "일반" 보기 모드
  // 토글의 존재를 알 방법이 없었다. dismiss 행 근처에 조용한 유도 한 줄.
  it('P2 결함③ — renders a quiet nudge toward the plain-mode gear toggle near the dismiss row', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    const hint = screen.getByTestId('first-run-starter-plain-mode-hint');
    expect(hint).toHaveTextContent('plainModeHint');
  });

  // P0 공감형 샘플 vault (2026-07) — dogfood(이 도구 자기 설명)가 비개발자에게
  // 와닿지 않는다는 문제의 완화책. "이 도구 살펴보기"/"예시 비즈니스 보기"
  // 세그먼트가 렌더되고, 클릭이 localStorage 선호도(`useSampleSource` 의
  // 진실원)를 갱신하는지 고정한다.
  it('renders the sample-source segment defaulting to "dogfood" and persists a switch to "storefront"', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    const dogfoodTab = screen.getByTestId('first-run-starter-sample-source-dogfood');
    const storefrontTab = screen.getByTestId('first-run-starter-sample-source-storefront');
    expect(dogfoodTab).toHaveAttribute('aria-selected', 'true');
    expect(storefrontTab).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(storefrontTab);

    expect(storefrontTab).toHaveAttribute('aria-selected', 'true');
    expect(dogfoodTab).toHaveAttribute('aria-selected', 'false');
    expect(window.localStorage.getItem('demo:sample-source:v1')).toBe('storefront');
  });

  it('restores a previously persisted "storefront" sample-source choice on mount', () => {
    window.localStorage.setItem('demo:sample-source:v1', 'storefront');

    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    expect(screen.getByTestId('first-run-starter-sample-source-storefront')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('copies the CLI bootstrap command to the clipboard once the disclosure is open', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);
    fireEvent.click(screen.getByTestId('first-run-starter-cli-toggle'));
    fireEvent.click(screen.getByTestId('first-run-starter-cli-bridge-copy'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        'npx ontology-atlas init && npx ontology-atlas bootstrap',
      );
    });
  });
});
