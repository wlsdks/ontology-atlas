import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiConnectionPanel } from './AiConnectionPanel';
import type { AiConnectionState } from '../model/use-ai-connection';
import type { LlmAuditEntry } from '@/shared/lib/llm-audit-log';

const mocks = vi.hoisted(() => ({
  secretSet: vi.fn(),
  secretClear: vi.fn(),
  secretVerify: vi.fn(),
  reveal: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/shared/lib/tauri-secrets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/tauri-secrets')>();
  return {
    ...actual,
    secretSet: mocks.secretSet,
    secretClear: mocks.secretClear,
    secretVerify: mocks.secretVerify,
  };
});

vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  openTauriVaultInFinder: (...args: unknown[]) => mocks.reveal(...args),
}));

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ show: mocks.toast }),
}));

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) => (key: string, values?: Record<string, unknown>) =>
      values
        ? `${namespace}.${key}:${Object.values(values).join(',')}`
        : `${namespace}.${key}`,
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function makeConnection(overrides: Partial<AiConnectionState> = {}): AiConnectionState {
  return {
    bridgeAvailable: true,
    statuses: { anthropic: null, openai: null, gemini: null },
    applyStatus: vi.fn(),
    auditEntries: [],
    refreshAudit: vi.fn(),
    ...overrides,
  };
}

function renderPanel(connection: AiConnectionState, vaultRootPath: string | null = '/vault') {
  return render(
    <AiConnectionPanel
      connection={connection}
      vaultRootPath={vaultRootPath}
      downloadHref="/download/"
      onDownloadNavigate={() => {}}
    />,
  );
}

beforeEach(() => {
  mocks.secretSet.mockReset();
  mocks.secretClear.mockReset();
  mocks.secretVerify.mockReset();
  mocks.toast.mockReset();
  mocks.reveal.mockReset();
});

/**
 * 웹 강등 — 브라우저에는 키를 안전하게 둘 곳이 없다. 조용히 실패하거나 숨기지
 * 않고, 입력 필드를 아예 만들지 않은 채 이유를 설명한다.
 */
describe('AiConnectionPanel web degradation', () => {
  it('renders no key input at all when the desktop bridge is absent', () => {
    renderPanel(makeConnection({ bridgeAvailable: false }));
    expect(screen.getByTestId('ai-connection-web-degraded')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-key-input-anthropic')).toBeNull();
    expect(screen.queryByTestId('ai-key-input-openai')).toBeNull();
    expect(screen.queryByTestId('ai-key-input-gemini')).toBeNull();
    // 접힌 행조차 없다 — 브라우저에는 키를 받을 자리 자체가 없다.
    expect(screen.queryByTestId('ai-register-anthropic')).toBeNull();
    expect(screen.queryByTestId('ai-verify-anthropic')).toBeNull();
  });

  it('points the web user at the installed app instead of a dead end', () => {
    renderPanel(makeConnection({ bridgeAvailable: false }));
    expect(screen.getByTestId('ai-connection-download-link')).toHaveAttribute(
      'href',
      '/download/',
    );
  });
});

/**
 * 미등록 행 접기 — 벤더가 셋이 되면 상시 노출된 password 입력 셋이 설정 시트를
 * 폼 관문처럼 만든다. 접힌 행은 "미등록" 이라는 상태를 그대로 말하면서 시각
 * 무게만 줄인다.
 */
describe('AiConnectionPanel unregistered rows', () => {
  it('lists every named vendor without opening three key fields at once', () => {
    renderPanel(makeConnection());
    for (const provider of ['anthropic', 'openai', 'gemini']) {
      expect(screen.getByTestId(`ai-register-${provider}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`ai-key-input-${provider}`)).toBeNull();
    }
  });

  it('opens exactly one key field at a time', () => {
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-anthropic'));
    expect(screen.getByTestId('ai-key-input-anthropic')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-key-input-gemini')).toBeNull();

    // 다른 행을 열면 앞 행은 접힌다 — 붙여넣기 직전의 안전 문구가 어느 키에
    // 대한 말인지 화면에 하나뿐이어야 한다.
    fireEvent.click(screen.getByTestId('ai-register-gemini'));
    expect(screen.getByTestId('ai-key-input-gemini')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-key-input-anthropic')).toBeNull();
  });

  it('drops an unsaved draft when another row takes the open slot', () => {
    // 접기가 만든 새 노출 창 — 행은 접혀도 컴포넌트는 살아 있으므로, 붙여넣었다가
    // 그만둔 키가 화면에서만 사라진 채 상태에 남을 수 있다. 사용자는 포기했다고
    // 믿는데 남아 있으면 "저장 전까지만 화면에 있다" 는 계약이 깨진다.
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-anthropic'));
    fireEvent.change(screen.getByTestId('ai-key-input-anthropic'), {
      target: { value: 'sk-ant-abandoned' },
    });

    fireEvent.click(screen.getByTestId('ai-register-gemini'));
    expect(document.body.innerHTML).not.toContain('sk-ant-abandoned');

    fireEvent.click(screen.getByTestId('ai-register-anthropic'));
    expect(
      (screen.getByTestId('ai-key-input-anthropic') as HTMLInputElement).value,
    ).toBe('');
  });

  it('collapses the row again once the key lands — no lingering open field', async () => {
    // 저장·삭제 직후에도 입력칸이 열려 있으면 화면이 "하나 더 넣으라" 고
    // 재촉하는 것처럼 읽힌다.
    mocks.secretSet.mockResolvedValue({
      provider: 'gemini',
      stored: true,
      last4: '9f2k',
    });
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-gemini'));
    fireEvent.change(screen.getByTestId('ai-key-input-gemini'), {
      target: { value: 'AIza-test' },
    });
    fireEvent.click(screen.getByTestId('ai-save-gemini'));

    // 부모가 statuses 를 들고 있으므로 이 렌더에서는 다시 접힌 행으로 돌아온다.
    await waitFor(() =>
      expect(screen.getByTestId('ai-register-gemini')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('ai-key-input-gemini')).toBeNull();
  });

  it('names the vendor the pasted key would go to', () => {
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-gemini'));
    expect(
      screen.getByText('settings.ai.pasteSafety:settings.ai.providerGemini'),
    ).toBeInTheDocument();
  });
});

describe('AiConnectionPanel key lifecycle', () => {
  it('drops the pasted key from component state the moment it is saved', async () => {
    const applyStatus = vi.fn();
    mocks.secretSet.mockResolvedValue({
      provider: 'anthropic',
      stored: true,
      last4: 'abcd',
    });
    renderPanel(makeConnection({ applyStatus }));

    fireEvent.click(screen.getByTestId('ai-register-anthropic'));
    fireEvent.change(screen.getByTestId('ai-key-input-anthropic'), {
      target: { value: 'sk-ant-secret-value' },
    });
    fireEvent.click(screen.getByTestId('ai-save-anthropic'));

    await waitFor(() => expect(applyStatus).toHaveBeenCalled());
    // 전체 키가 화면 상태에 남아 있는 유일한 순간이 저장으로 끝난다.
    expect(document.body.innerHTML).not.toContain('sk-ant-secret-value');

    // 행을 다시 펼쳐도 비어 있다 — 입력칸이 접혀 사라진 것과 상태가 비워진
    // 것은 다른 사실이고, 여기서 확인해야 하는 것은 뒤쪽이다.
    fireEvent.click(screen.getByTestId('ai-register-anthropic'));
    expect(
      (screen.getByTestId('ai-key-input-anthropic') as HTMLInputElement).value,
    ).toBe('');
  });

  it('shows only the last 4 characters once a key is stored', () => {
    renderPanel(
      makeConnection({
        statuses: {
          anthropic: { provider: 'anthropic', stored: true, last4: 'abcd' },
          openai: null,
          gemini: null,
        },
      }),
    );
    expect(screen.getByText('settings.ai.stored:abcd')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-key-input-anthropic')).toBeNull();
  });

  it('needs a second click to remove a key — armed inline, not in a modal', async () => {
    mocks.secretClear.mockResolvedValue({
      provider: 'anthropic',
      stored: false,
      last4: null,
    });
    renderPanel(
      makeConnection({
        statuses: {
          anthropic: { provider: 'anthropic', stored: true, last4: 'abcd' },
          openai: null,
          gemini: null,
        },
      }),
    );

    const clearButton = screen.getByTestId('ai-clear-anthropic');
    fireEvent.click(clearButton);
    expect(clearButton).toHaveTextContent('settings.ai.clearConfirm');
    expect(mocks.secretClear).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(clearButton);
    await waitFor(() => expect(mocks.secretClear).toHaveBeenCalledWith('anthropic'));
    expect(mocks.toast).toHaveBeenCalledWith('settings.ai.cleared');
  });
});

describe('AiConnectionPanel connection check', () => {
  it('cannot send without a vault to record the call in', () => {
    // log-before-send 의 화면 쪽 얼굴: 기록할 곳이 없으면 보낼 수도 없다.
    renderPanel(
      makeConnection({
        statuses: {
          anthropic: { provider: 'anthropic', stored: true, last4: 'abcd' },
          openai: null,
          gemini: null,
        },
      }),
      null,
    );
    expect(screen.getByTestId('ai-verify-anthropic')).toBeDisabled();
    expect(screen.getByText('settings.ai.verifyNeedsVault')).toBeInTheDocument();
  });

  it('names the destination host before the user ever presses check', () => {
    // 헌장 ⑥ — 명명 벤더에서 우리가 증명할 수 있는 주장은 "코드에 박힌 공식
    // 주소로만 간다" 까지다. 그 주소를 이름으로 말하는 것이 그 주장의 전부다.
    renderPanel(
      makeConnection({
        statuses: {
          anthropic: { provider: 'anthropic', stored: true, last4: 'abcd' },
          openai: null,
          gemini: null,
        },
      }),
    );
    expect(
      screen.getByText('settings.ai.verifyScope:api.anthropic.com'),
    ).toBeInTheDocument();
  });

  it('reports a rejected key as a rejection, not as a generic failure', async () => {
    const refreshAudit = vi.fn();
    mocks.secretVerify.mockResolvedValue({
      provider: 'anthropic',
      ok: false,
      denied: true,
      httpStatus: 401,
      message: null,
      durationMs: 210,
      loggedAt: '2026-07-26T09:12:33.120Z',
    });
    renderPanel(
      makeConnection({
        refreshAudit,
        statuses: {
          anthropic: { provider: 'anthropic', stored: true, last4: 'abcd' },
          openai: null,
          gemini: null,
        },
      }),
    );

    fireEvent.click(screen.getByTestId('ai-verify-anthropic'));
    await waitFor(() =>
      expect(screen.getByText('settings.ai.verifyDenied:401')).toBeInTheDocument(),
    );
    // 거부된 호출도 기록됐다 — 기록 표면을 즉시 다시 읽는다.
    expect(refreshAudit).toHaveBeenCalled();
    expect(mocks.secretVerify).toHaveBeenCalledWith('anthropic', '/vault');
  });

  it('confirms a working key with the success signal tone', async () => {
    mocks.secretVerify.mockResolvedValue({
      provider: 'openai',
      ok: true,
      denied: false,
      httpStatus: 200,
      message: null,
      durationMs: 640,
      loggedAt: '2026-07-26T09:12:33.120Z',
    });
    renderPanel(
      makeConnection({
        statuses: {
          anthropic: null,
          openai: { provider: 'openai', stored: true, last4: 'wxyz' },
          gemini: null,
        },
      }),
    );
    fireEvent.click(screen.getByTestId('ai-verify-openai'));
    await waitFor(() =>
      expect(screen.getByText('settings.ai.verified')).toBeInTheDocument(),
    );
  });

  it('trusts the rust verdict over the status code — gemini rejects with 400', async () => {
    // 화면이 401/403 만 거부로 읽으면 Gemini 사용자는 틀린 키를 넣고도
    // "확인하지 못했어요" 를 보고 앱이 고장난 줄 안다(2026-07-26 실측: Gemini
    // 는 틀린 키에 400 `API_KEY_INVALID` 를 준다).
    mocks.secretVerify.mockResolvedValue({
      provider: 'gemini',
      ok: false,
      denied: true,
      httpStatus: 400,
      message: null,
      durationMs: 331,
      loggedAt: '2026-07-26T10:31:02.880Z',
    });
    renderPanel(
      makeConnection({
        statuses: {
          anthropic: null,
          openai: null,
          gemini: { provider: 'gemini', stored: true, last4: '9f2k' },
        },
      }),
    );
    fireEvent.click(screen.getByTestId('ai-verify-gemini'));
    await waitFor(() =>
      expect(screen.getByText('settings.ai.verifyDenied:400')).toBeInTheDocument(),
    );
  });
});

describe('AiConnectionPanel audit tail', () => {
  const entry: LlmAuditEntry = {
    v: 1,
    at: '2026-07-26T09:12:33.120Z',
    provider: 'anthropic',
    host: 'api.anthropic.com',
    model: null,
    purpose: 'verify',
    question: null,
    scope: { nodes: [], promptChars: 0, vaultChars: 0 },
    payloadSha256: 'e3b0',
    outcome: 'ok',
    httpStatus: 200,
    responseChars: 42,
    durationMs: 640,
  };

  it('is not ashamed of an empty log — nothing sent is the promise kept', () => {
    renderPanel(makeConnection());
    expect(screen.getByText('settings.ai.auditEmpty')).toBeInTheDocument();
    expect(screen.queryAllByTestId('ai-audit-row')).toHaveLength(0);
  });

  it('renders one row per recorded call with its sent scope', () => {
    renderPanel(makeConnection({ auditEntries: [entry] }));
    const rows = screen.getAllByTestId('ai-audit-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('settings.ai.auditScope:0');
    expect(rows[0]).toHaveTextContent('settings.ai.auditOutcomeOk');
  });

  it('always names the file the record lives in', () => {
    renderPanel(makeConnection({ auditEntries: [entry] }));
    expect(screen.getByText('settings.ai.auditPath')).toBeInTheDocument();
  });
});
