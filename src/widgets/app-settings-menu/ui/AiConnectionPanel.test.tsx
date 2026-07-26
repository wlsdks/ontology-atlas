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
    statuses: { anthropic: null, openai: null },
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

describe('AiConnectionPanel key lifecycle', () => {
  it('drops the pasted key from component state the moment it is saved', async () => {
    const applyStatus = vi.fn();
    mocks.secretSet.mockResolvedValue({
      provider: 'anthropic',
      stored: true,
      last4: 'abcd',
    });
    renderPanel(makeConnection({ applyStatus }));

    const input = screen.getByTestId('ai-key-input-anthropic') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-ant-secret-value' } });
    fireEvent.click(screen.getByTestId('ai-save-anthropic'));

    await waitFor(() => expect(applyStatus).toHaveBeenCalled());
    // 전체 키가 화면 상태에 남아 있는 유일한 순간이 저장으로 끝난다.
    expect(input.value).toBe('');
    expect(document.body.innerHTML).not.toContain('sk-ant-secret-value');
  });

  it('shows only the last 4 characters once a key is stored', () => {
    renderPanel(
      makeConnection({
        statuses: {
          anthropic: { provider: 'anthropic', stored: true, last4: 'abcd' },
          openai: null,
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
        },
      }),
      null,
    );
    expect(screen.getByTestId('ai-verify-anthropic')).toBeDisabled();
    expect(screen.getByText('settings.ai.verifyNeedsVault')).toBeInTheDocument();
  });

  it('states the sending scope before the user ever presses check', () => {
    renderPanel(
      makeConnection({
        statuses: {
          anthropic: { provider: 'anthropic', stored: true, last4: 'abcd' },
          openai: null,
        },
      }),
    );
    expect(screen.getAllByText('settings.ai.verifyScope').length).toBeGreaterThan(0);
  });

  it('reports a rejected key as a rejection, not as a generic failure', async () => {
    const refreshAudit = vi.fn();
    mocks.secretVerify.mockResolvedValue({
      provider: 'anthropic',
      ok: false,
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
        },
      }),
    );
    fireEvent.click(screen.getByTestId('ai-verify-openai'));
    await waitFor(() =>
      expect(screen.getByText('settings.ai.verified')).toBeInTheDocument(),
    );
  });
});

describe('AiConnectionPanel audit tail', () => {
  const entry: LlmAuditEntry = {
    v: 1,
    at: '2026-07-26T09:12:33.120Z',
    provider: 'anthropic',
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
