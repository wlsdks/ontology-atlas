import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  });

  it('renders the real census numbers passed in (concepts/relations/domains)', () => {
    render(<FirstRunStarterModule concepts={102} relations={478} domains={6} />);

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(screen.getByText('102')).toBeInTheDocument();
    expect(screen.getByText('478')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
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

  it('wires "open my folder" to vault.open() directly', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    fireEvent.click(screen.getByTestId('first-run-starter-open'));

    expect(mocks.vault.open).toHaveBeenCalledTimes(1);
  });

  it('scaffolds a starter structure after "create a new vault" opens an empty folder', async () => {
    mocks.vault.open = vi.fn(async () => {
      mocks.vault.status = 'loaded';
      mocks.vault.manifest = { docs: [] };
    });
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);

    fireEvent.click(screen.getByTestId('first-run-starter-create'));

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
