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
    // 키가 필요 없는 갈래(주소로 연결)도 마찬가지다 — 그리고 **왜 그것도
    // 안 되는지**를 따로 적는다. 안 적으면 강등이 절반만 정직해진다:
    // "키가 문제라면 키가 필요 없는 Ollama 는 되겠지" 로 읽히기 때문이다.
    expect(screen.queryByTestId('ai-register-local')).toBeNull();
    expect(screen.queryByTestId('ai-local-url')).toBeNull();
    expect(screen.getByTestId('ai-connection-web-degraded-local')).toBeInTheDocument();
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

  it('opens exactly one key field at a time', async () => {
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-anthropic'));
    expect(screen.getByTestId('ai-key-input-anthropic')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-key-input-gemini')).toBeNull();

    // 다른 행을 열면 앞 행은 접힌다 — 붙여넣기 직전의 안전 문구가 어느 키에
    // 대한 말인지 화면에 하나뿐이어야 한다. 접힘은 **같은 프레임에 시작**하고
    // (data-state) 전이가 끝나면 DOM 에서 사라진다.
    fireEvent.click(screen.getByTestId('ai-register-gemini'));
    expect(screen.getByTestId('ai-key-input-gemini')).toBeInTheDocument();
    expect(screen.getByTestId('ai-detail-anthropic')).toHaveAttribute(
      'data-state',
      'closed',
    );
    await waitFor(() =>
      expect(screen.queryByTestId('ai-key-input-anthropic')).toBeNull(),
    );
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
      expect(screen.getByTestId('ai-detail-gemini')).toHaveAttribute(
        'data-state',
        'closed',
      ),
    );
    await waitFor(() => expect(screen.queryByTestId('ai-key-input-gemini')).toBeNull());
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

  it('confirms a save in words as well as in the row itself', async () => {
    // 행이 스스로 바뀌는 것이 1차 증거지만, 그 변화는 스크롤 밖일 수도 있고
    // 눈이 다른 데 가 있을 수도 있다. 삭제(`cleared`)와 같은 대칭으로 말로도
    // 확인해 준다 — 둘 중 하나만 있으면 "눌렀는데 뭐가 됐지" 가 남는다.
    mocks.secretSet.mockResolvedValue({
      provider: 'openai',
      stored: true,
      last4: 'wxyz',
    });
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-openai'));
    fireEvent.change(screen.getByTestId('ai-key-input-openai'), {
      target: { value: 'sk-openai-real' },
    });
    fireEvent.click(screen.getByTestId('ai-save-openai'));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('settings.ai.saved'));
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
    expect(screen.getByText('settings.ai.storedLabel')).toBeInTheDocument();
    expect(screen.getByText('···· abcd')).toBeInTheDocument();
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
    // 연결 확인 줄에는 `tools` 필드가 없다 — 리더가 null 로 읽는 자리.
    tools: null,
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
    expect(screen.getByText('.ontology-atlas/llm-audit.jsonl')).toBeInTheDocument();
    expect(screen.getByText(/settings\.ai\.auditPathNote/)).toBeInTheDocument();
  });

  it('keeps the mono face on the path only — the sentence beside it is prose', () => {
    // 한 줄을 통째로 mono 로 두면 한글 낱말 사이가 벌어져 소유자가 이중 공백으로
    // 읽었다. 경로는 기계 문자열이라 mono 가 정보지만, 그 옆 문장은 아니다.
    renderPanel(makeConnection({ auditEntries: [entry] }));
    const path = screen.getByText('.ontology-atlas/llm-audit.jsonl');
    expect(path.className).toContain('font-mono');
    expect(path.parentElement?.className ?? '').not.toContain('font-mono');
  });
});

/**
 * 되돌릴 수 있는 펼침 — [키 등록]을 눌러 본 사람이 아무것도 넣지 않고 나갈 길.
 * 소유자 실측 지적(2026-07-26): "입력 안하고 닫고싶을수도 있잖아?" 당시 펼친
 * 카드에는 [저장] 하나뿐이었고, 접는 방법이 화면에 없었다.
 */
describe('AiConnectionPanel draft cancel', () => {
  it('offers a visible way out of an expanded row, not just Save', () => {
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-openai'));
    expect(screen.getByTestId('ai-cancel-openai')).toBeInTheDocument();
  });

  it('collapses the row and drops the pasted draft when cancel is pressed', async () => {
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-openai'));
    fireEvent.change(screen.getByTestId('ai-key-input-openai'), {
      target: { value: 'sk-openai-abandoned' },
    });

    fireEvent.click(screen.getByTestId('ai-cancel-openai'));

    // 되돌리기는 **그 프레임에** 시작한다 — 확인창도, 지연도 없다.
    expect(screen.getByTestId('ai-detail-openai')).toHaveAttribute(
      'data-state',
      'closed',
    );
    // 초안은 전이가 끝나기를 기다리지 않는다. 접힘이 눈에 보이게 하려고 컴포넌트를
    // 180ms 더 살려 뒀지만, "붙여넣은 키는 저장 전까지만 화면에 있다" 는 계약이
    // 그만큼 늘어나면 모션을 얻자고 약속을 깎은 것이다.
    expect(document.body.innerHTML).not.toContain('sk-openai-abandoned');
    expect(screen.getByTestId('ai-register-openai')).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByTestId('ai-key-input-openai')).toBeNull());
  });

  it('keeps the collapsing region out of tab order the moment it starts closing', () => {
    // 퇴장 모션의 대가를 접근성으로 치르지 않는다 — 보이지 않는 입력칸이
    // 180ms 동안 탭 순서와 스크린 리더에 남아 있으면 안 된다.
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-openai'));
    expect(screen.getByTestId('ai-detail-openai')).not.toHaveAttribute('inert');

    fireEvent.click(screen.getByTestId('ai-cancel-openai'));
    expect(screen.getByTestId('ai-detail-openai')).toHaveAttribute('inert');
  });

  it('sends the row out the same way it came in — one surface, two states', () => {
    // 나가는 길이 들어온 길과 달라지려면 표면이 둘이어야 한다. 하나뿐이면
    // 방향별로 다른 커브가 생길 자리가 없다.
    renderPanel(makeConnection());
    const region = screen.getByTestId('ai-detail-openai');
    expect(region).toHaveAttribute('data-state', 'closed');

    fireEvent.click(screen.getByTestId('ai-register-openai'));
    expect(screen.getByTestId('ai-detail-openai')).toBe(region);
    expect(region).toHaveAttribute('data-state', 'open');

    fireEvent.click(screen.getByTestId('ai-cancel-openai'));
    expect(screen.getByTestId('ai-detail-openai')).toBe(region);
    expect(region).toHaveAttribute('data-state', 'closed');
  });

  it('keeps the row header fixed while the detail region grows', () => {
    // 형제 셋이 한 목록이라는 사실은 "펼친 행만 아래로 자란다" 로 읽힌다.
    // 헤더가 교체되면 그건 자란 게 아니라 다른 것으로 바뀐 것이다.
    renderPanel(makeConnection());
    const trigger = screen.getByTestId('ai-register-openai');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(screen.getByTestId('ai-register-openai')).toBe(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('honours the aria-expanded promise — the trigger closes what it opened', () => {
    // `aria-expanded` 를 달아 놓고 두 번째 클릭이 아무것도 안 하면 스크린 리더
    // 사용자에게 한 약속이 거짓말이 된다.
    renderPanel(makeConnection());
    const trigger = screen.getByTestId('ai-register-openai');
    fireEvent.click(trigger);
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('ai-detail-openai')).toHaveAttribute(
      'data-state',
      'closed',
    );
  });

  it('never writes anything on cancel — the vendor keeps its unregistered state', () => {
    const applyStatus = vi.fn();
    renderPanel(makeConnection({ applyStatus }));
    fireEvent.click(screen.getByTestId('ai-register-openai'));
    fireEvent.change(screen.getByTestId('ai-key-input-openai'), {
      target: { value: 'sk-openai-abandoned' },
    });
    fireEvent.click(screen.getByTestId('ai-cancel-openai'));

    expect(mocks.secretSet).not.toHaveBeenCalled();
    expect(applyStatus).not.toHaveBeenCalled();
  });

  it('returns focus to the register button it came from', async () => {
    // 포커스가 body 로 떨어지면 사용자는 있던 자리를 잃고, 바깥 다이얼로그의
    // Esc 사다리(서브뷰 → 루트 → 닫기)도 함께 죽는다.
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-openai'));
    fireEvent.click(screen.getByTestId('ai-cancel-openai'));

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId('ai-register-openai')),
    );
  });

  it('lets Escape collapse the row without letting the settings sheet see it', () => {
    // Esc 사다리의 가장 안쪽 칸. 가로채지 않으면 같은 keypress 로 설정 시트가
    // 루트 뷰까지 물러나, 키 하나 취소하려던 사람이 서브뷰까지 잃는다.
    const outerEscape = vi.fn();
    render(
      <div onKeyDown={(event) => event.key === 'Escape' && outerEscape()}>
        <AiConnectionPanel
          connection={makeConnection()}
          vaultRootPath="/vault"
          downloadHref="/download/"
          onDownloadNavigate={() => {}}
        />
      </div>,
    );

    fireEvent.click(screen.getByTestId('ai-register-openai'));
    fireEvent.keyDown(screen.getByTestId('ai-key-input-openai'), { key: 'Escape' });

    // 버튼과 완전히 같은 경로 — Esc 도 그 프레임에 접기 시작한다.
    expect(screen.getByTestId('ai-detail-openai')).toHaveAttribute(
      'data-state',
      'closed',
    );
    expect(outerEscape).not.toHaveBeenCalled();
  });

  it('passes Escape up to the sheet when no row is expanded', () => {
    // 사다리의 다음 칸은 살아 있어야 한다 — 안쪽 칸이 비었을 때까지 삼키면
    // 설정 서브뷰에서 Esc 가 먹통이 된다.
    const outerEscape = vi.fn();
    render(
      <div onKeyDown={(event) => event.key === 'Escape' && outerEscape()}>
        <AiConnectionPanel
          connection={makeConnection()}
          vaultRootPath="/vault"
          downloadHref="/download/"
          onDownloadNavigate={() => {}}
        />
      </div>,
    );

    fireEvent.keyDown(screen.getByTestId('ai-connection-view'), { key: 'Escape' });
    expect(outerEscape).toHaveBeenCalledTimes(1);
  });
});

/**
 * 시각 위계 — 채워진 테두리 상자는 조작하는 블록(벤더 목록) 하나뿐이다.
 * 셋이 같은 무게로 쌓이면 사람이 여기 온 이유(키 등록)가 첫 번째로 안 읽힌다.
 */
describe('AiConnectionPanel hierarchy', () => {
  it('gives the filled container to the vendor list and to nothing else', () => {
    const { container } = renderPanel(makeConnection());
    const filled = container.querySelectorAll('.bg-\\[color\\:var\\(--color-overlay-1\\)\\]');
    expect(filled).toHaveLength(1);
    expect(filled[0]).toContainElement(screen.getByTestId('ai-register-anthropic'));
  });

  it('keeps every trust fact on screen while demoting its weight', () => {
    // 위계 조정이 정보 삭제로 새지 않았는지 — 헌장 한 줄과 "무엇이 나가는가"
    // 세 행, 기록 파일 이름이 모두 남아 있어야 한다.
    renderPanel(makeConnection());
    for (const key of [
      'settings.ai.principle',
      'settings.ai.scopeTitle',
      'settings.ai.scopeWhatValue',
      'settings.ai.scopeWhenValue',
      'settings.ai.scopeLogValue',
      'settings.ai.auditTitle',
    ]) {
      expect(screen.getAllByText(key).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('.ontology-atlas/llm-audit.jsonl')).toBeInTheDocument();
  });

  /**
   * 「연결하면 뭐가 되나」 는 「어떻게 연결하나」 보다 먼저다 — 그 문장이
   * 목록 아래 각주로 있던 동안, 그 각주는 **이미 출시된 에이전트**를
   * "준비 중" 이라고 부정하고 있었고 자기를 여기로 보낸 CTA
   * (`vaultAgentPanel.degraded.noKeyAction`)를 무효화했다.
   */
  it('연결이 무엇을 여는지를 벤더 목록보다 먼저 말한다', () => {
    const { container } = renderPanel(makeConnection());
    const unlocks = screen.getByTestId('ai-what-it-unlocks');
    const list = container.querySelector('.bg-\\[color\\:var\\(--color-overlay-1\\)\\]');
    expect(unlocks).toBeInTheDocument();
    expect(list).not.toBeNull();
    // DOM 순서가 읽는 순서다.
    expect(
      unlocks.compareDocumentPosition(list as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('출시된 기능을 부정하던 각주는 사라졌다', () => {
    renderPanel(makeConnection());
    expect(screen.queryByText('settings.ai.emptyConsumer')).toBeNull();
  });
});

/**
 * 네 번째 행 — 키가 아니라 **주소**를 적는 갈래.
 *
 * 여기서 지키려는 것은 셋이다: ① 실패가 이유별로 다른 문장을 받는다(꺼져
 * 있음 · 포트 다름 · 모델 없음), ② 모델은 손으로 타이핑하지 않고 목록에서
 * 고른다, ③ 전송 범위 문구가 루프백일 때만 "이 컴퓨터 밖으로 안 나간다" 고
 * 말한다.
 */
describe('AiConnectionPanel — 주소로 연결', () => {
  function verifyResult(overrides: Record<string, unknown>) {
    return {
      provider: 'local',
      ok: false,
      denied: false,
      httpStatus: null,
      message: null,
      durationMs: 8,
      loggedAt: '2026-08-01T00:00:00.000Z',
      body: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('명명 벤더 셋과 같은 상자 안에 네 번째 행으로 산다', () => {
    // 상자를 하나 더 세우면 이 패널의 시선 승자가 둘이 되어 위계가 무너진다.
    const { container } = renderPanel(makeConnection());
    const filled = container.querySelectorAll('.bg-\\[color\\:var\\(--color-overlay-1\\)\\]');
    expect(filled).toHaveLength(1);
    expect(filled[0]).toContainElement(screen.getByTestId('ai-register-local'));
  });

  it('주소를 넣고 확인하면 설치된 모델을 목록으로 고르게 된다', async () => {
    mocks.secretVerify.mockResolvedValue(
      verifyResult({
        ok: true,
        httpStatus: 200,
        body: '{"data":[{"id":"qwen3:8b"},{"id":"gemma4:12b"}]}',
      }),
    );
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-local'));
    fireEvent.click(screen.getByTestId('ai-verify-local'));

    await waitFor(() => expect(screen.getByTestId('ai-local-verified')).toBeInTheDocument());
    // 주소는 **주소 갈래로만** 넘어간다 — 키체인 벤더에 주소가 실리면 Rust 가
    // 거절하는 것과 같은 계약이 화면 쪽에서도 지켜져야 한다.
    expect(mocks.secretVerify).toHaveBeenCalledWith('local', '/vault', 'http://localhost:11434');
    // 모델 칸은 고를 것이 생겼을 때만 나타난다.
    expect(screen.getByTestId('ai-local-model-row')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ai-local-model'));
    fireEvent.click(screen.getByText('qwen3:8b'));
    await waitFor(() => expect(screen.getByTestId('ai-local-connected')).toBeInTheDocument());
    // 고른 결과가 이 브라우저에 남아, 지도 오른쪽 도크가 새로고침 없이 살아난다.
    expect(window.localStorage.getItem('ontology-atlas:local-endpoint')).toContain('qwen3:8b');
  });

  it('러너가 꺼져 있는 것과 포트가 다른 것과 모델이 없는 것을 다르게 말한다', async () => {
    const seen = new Set<string>();
    for (const [result, marker] of [
      [verifyResult({ httpStatus: null, message: 'x' }), 'localFailUnreachable'],
      [verifyResult({ httpStatus: 404 }), 'localFailNotCompatible'],
      [verifyResult({ ok: true, httpStatus: 200, body: '{"data":[]}' }), 'localFailNoModels'],
    ] as const) {
      mocks.secretVerify.mockResolvedValue(result);
      const view = renderPanel(makeConnection());
      fireEvent.click(screen.getByTestId('ai-register-local'));
      fireEvent.click(screen.getByTestId('ai-verify-local'));
      const line = await screen.findByTestId('ai-local-failure');
      expect(line.textContent).toContain(marker);
      seen.add(marker);
      view.unmount();
    }
    // 셋이 서로 다른 문장이어야 사용자가 다음에 무엇을 할지 안다.
    expect(seen.size).toBe(3);
  });

  it('"이 컴퓨터 밖으로 안 나간다" 는 루프백일 때만 말한다', async () => {
    // 사용자가 https 로 다른 기계를 가리킬 수도 있다(허용한다). 참이 아닌
    // 자리에 그 문장을 쓰면 이 제품의 신뢰 서사 자체가 거짓말이 된다.
    window.localStorage.setItem(
      'ontology-atlas:local-endpoint',
      JSON.stringify({ baseUrl: 'https://box.example.com:8080', model: 'qwen3:8b' }),
    );
    renderPanel(makeConnection());
    expect(screen.getByText(/settings\.ai\.localScopeRemote/)).toBeInTheDocument();
    expect(screen.queryByText(/settings\.ai\.localScopeLoopback/)).toBeNull();
  });

  /**
   * 알파벳 정렬이 `embeddinggemma:latest` 를 1번에 올렸고, 소유자가 실제로
   * 그것을 골라 「연결됨」으로 저장됐다 — **첫 질문에서 실패할 상태가 성공
   * 이라고 표시된다.** 지우지 않고(라벨링은 은닉이 아니다) 순서와 설명으로
   * 고친다.
   */
  it('대화 못 하는 모델을 1번에 올리지 않고, 그 사실을 행에 적는다', async () => {
    mocks.secretVerify.mockResolvedValue(
      verifyResult({
        ok: true,
        httpStatus: 200,
        body: '{"data":[{"id":"embeddinggemma:latest"},{"id":"qwen3:8b"},{"id":"nomic-embed-text:latest"}]}',
      }),
    );
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-local'));
    fireEvent.click(screen.getByTestId('ai-verify-local'));
    await waitFor(() => expect(screen.getByTestId('ai-local-verified')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('ai-local-model'));
    const options = screen.getAllByRole('option').map((node) => node.textContent ?? '');
    // 1번은 대화가 되는 것이다.
    expect(options[0]).toContain('qwen3:8b');
    // 임베딩 둘은 사라지지 않는다 — 없다고 말하는 것이 더 큰 거짓말이다.
    expect(options).toHaveLength(3);
    // 못 쓰는 행만 두 번째 줄로 그 사실을 적는다.
    expect(options[1]).toContain('settings.ai.localModelEmbeddingOnly');
    expect(options[0]).not.toContain('settings.ai.localModelEmbeddingOnly');
  });

  it('성공 캡션이 「설치된 개수」와 「대화 가능한 개수」를 함께 말한다', async () => {
    mocks.secretVerify.mockResolvedValue(
      verifyResult({
        ok: true,
        httpStatus: 200,
        body: '{"data":[{"id":"embeddinggemma:latest"},{"id":"qwen3:8b"},{"id":"nomic-embed-text:latest"}]}',
      }),
    );
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-local'));
    fireEvent.click(screen.getByTestId('ai-verify-local'));
    const caption = await screen.findByTestId('ai-local-verified');
    expect(caption.textContent).toContain('settings.ai.localVerifiedWithEmbedding:3,1');
  });

  it('임베딩이 하나도 없으면 없는 구분을 만들지 않는다', async () => {
    mocks.secretVerify.mockResolvedValue(
      verifyResult({
        ok: true,
        httpStatus: 200,
        body: '{"data":[{"id":"qwen3:8b"},{"id":"gemma4:12b"}]}',
      }),
    );
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-local'));
    fireEvent.click(screen.getByTestId('ai-verify-local'));
    const caption = await screen.findByTestId('ai-local-verified');
    expect(caption.textContent).toContain('settings.ai.localVerified:2');
    expect(caption.textContent).not.toContain('WithEmbedding');
  });

  it('로컬 주소면 나가지 않았다는 사실을 기록으로 말한다', () => {
    window.localStorage.setItem(
      'ontology-atlas:local-endpoint',
      JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'qwen3:8b' }),
    );
    renderPanel(makeConnection());
    expect(screen.getByText(/settings\.ai\.localScopeLoopback:localhost:11434/)).toBeInTheDocument();
  });
});
