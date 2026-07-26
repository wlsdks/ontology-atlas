// 패널이 지키는 것: 웹 정직 강등 · 닫힘=중단 · 범위 시트 선행 · 리플로우 계약.
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../../messages/ko.json';

const bridge = vi.hoisted(() => ({ available: false }));
const secrets = vi.hoisted(() => ({ stored: true, listeners: new Set<() => void>() }));

vi.mock('@/shared/lib/tauri-llm', () => ({
  isLlmChatBridgeAvailable: () => bridge.available,
  llmChat: vi.fn(async () => null),
  llmChatErrorMessage: (err: unknown) => String(err),
}));

vi.mock('@/shared/lib/tauri-secrets', () => ({
  SECRET_PROVIDERS: ['anthropic', 'openai', 'gemini'],
  SECRET_PROVIDER_HOSTS: {
    anthropic: 'api.anthropic.com',
    openai: 'api.openai.com',
    gemini: 'generativelanguage.googleapis.com',
  },
  secretStatus: vi.fn(async (provider: string) => ({
    provider,
    stored: secrets.stored && provider === 'anthropic',
    last4: 'abcd',
  })),
  // 실제 브로드캐스트와 같은 계약 — 등록/삭제가 성공하면 듣는 쪽이 다시 조회한다.
  subscribeSecretChange: (handler: () => void) => {
    secrets.listeners.add(handler);
    return () => secrets.listeners.delete(handler);
  },
}));

/** 설정 시트에서 키가 저장된 순간을 흉내낸다. */
function emitSecretChange() {
  for (const listener of secrets.listeners) listener();
}

vi.mock('@/features/docs-vault-local', () => ({
  useLocalVault: () => ({
    fileHandles: new Map(),
    createDoc: vi.fn(),
    saveDoc: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { subscribeSettingsViewIntent } from '@/shared/lib/settings-view-intent';

import { VaultAgentPanel } from './VaultAgentPanel';

/** 패널이 보낸 "설정의 그 자리를 열어라" 요청 기록. */
const settingsIntents: string[] = [];
beforeEach(() => {
  settingsIntents.length = 0;
  const unsubscribe = subscribeSettingsViewIntent((view) => settingsIntents.push(view));
  return unsubscribe;
});

function renderPanel(overrides: Partial<Parameters<typeof VaultAgentPanel>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="ko" messages={messages}>
      <VaultAgentPanel
        open
        onClose={vi.fn()}
        vaultPath="/vault"
        insight={null}
        manifest={null}
        screenContext={{
          focusedSlug: 'capabilities/payment',
          focusedTitle: '결제 처리',
          focusedKind: 'capability',
          lenses: [],
          projectTitle: null,
          visibleNodeCount: 12,
        }}
        vaultIsGit={false}
        canWrite
        onFocusNode={vi.fn()}
        downloadHref="/ko/download/"
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
}

describe('VaultAgentPanel', () => {
  it('웹에서는 입력칸 대신 정직 강등을 그린다', () => {
    // 키를 안전하게 둘 곳도 보낼 경로도 없는데 입력칸을 그리면 거짓말이다.
    bridge.available = false;
    renderPanel();
    expect(screen.getByTestId('vault-agent-download-link')).toBeInTheDocument();
    expect(screen.queryByTestId('vault-agent-input')).not.toBeInTheDocument();
  });

  it('폴더가 없으면 먼저 폴더를 열라고 말한다', () => {
    bridge.available = true;
    renderPanel({ vaultPath: null });
    expect(screen.getByTestId('vault-agent-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('vault-agent-input')).not.toBeInTheDocument();
  });

  it('첫 턴 전에는 범위 시트가 먼저 서고 입력칸이 없다', async () => {
    // 보내기 전에 무엇이 어디로 가는지 한 번 말한다.
    bridge.available = true;
    renderPanel();
    expect(await screen.findByTestId('agent-scope-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('agent-scope-audit-path')).toHaveTextContent(
      '.ontology-atlas/llm-audit.jsonl',
    );
    expect(screen.queryByTestId('vault-agent-input')).not.toBeInTheDocument();
  });

  it('리플로우는 폭 하나로 두 컬럼을 함께 움직인다', () => {
    bridge.available = true;
    const { rerender } = renderPanel();
    const panel = screen.getByTestId('vault-agent-panel');
    expect(panel).toHaveAttribute('data-agent-panel-state', 'open');
    expect(panel.style.width).toBe('var(--agent-panel-width)');
    // 애니메이션되는 속성은 폭 하나뿐 — 지도 축소가 같은 프레임에 따라온다.
    expect(panel.style.transitionProperty).toBe('width');
    expect(panel.style.transitionDuration).toBe('var(--agent-panel-reflow-duration)');

    rerender(
      <NextIntlClientProvider locale="ko" messages={messages}>
        <VaultAgentPanel
          open={false}
          onClose={vi.fn()}
          vaultPath="/vault"
          insight={null}
          manifest={null}
          screenContext={{
            focusedSlug: null,
            focusedTitle: null,
            focusedKind: null,
            lenses: [],
            projectTitle: null,
            visibleNodeCount: 0,
          }}
          vaultIsGit={false}
          canWrite
          onFocusNode={vi.fn()}
          downloadHref="/ko/download/"
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('vault-agent-panel').style.width).toBe('0px');
  });

  it('키가 없으면 말로 길을 알려주는 대신 그 자리로 가는 문을 준다', async () => {
    // 소유자 판정 반전(2026-07-26). 구 계약은 "설정을 여는 두 번째 입구를 만들지
    // 않고 자리를 말한다" 였다 — 「왼쪽 아래 설정(톱니)의 「AI 연결」에서…」.
    // 화면이 데려다 줄 수 있는 곳을 사람이 찾게 만드는 것은 안내가 아니다.
    bridge.available = true;
    secrets.stored = false;
    renderPanel();
    const door = await screen.findByTestId('vault-agent-open-settings');
    // 입력칸의 **자리**에 서 있고, 그 자리는 실제로 동작하는 컨트롤 하나다
    // (비활성 버튼도, 눌러도 아무 일 없는 흉내 입력칸도 만들지 않는다).
    expect(door).toHaveAccessibleName(messages.vaultAgentPanel.degraded.noKeyAction);
    expect(screen.queryByTestId('vault-agent-input')).not.toBeInTheDocument();

    fireEvent.click(door);
    // 설정 시트는 앱 셸이 소유한다 — 패널은 "저 자리를 열어라" 만 보낸다.
    expect(settingsIntents).toEqual(['ai']);
    secrets.stored = true;
  });

  it('키를 넣고 돌아오면 새로고침 없이 살아난다', async () => {
    // 키를 등록한 사용자에게 F5 를 요구하면 그건 결함이다.
    bridge.available = true;
    secrets.stored = false;
    renderPanel();
    expect(await screen.findByTestId('vault-agent-open-settings')).toBeInTheDocument();

    secrets.stored = true;
    emitSecretChange();
    expect(await screen.findByTestId('agent-scope-sheet')).toBeInTheDocument();
    expect(screen.queryByTestId('vault-agent-open-settings')).not.toBeInTheDocument();
  });

  it('브라우저 강등은 설정이 아니라 앱으로 보낸다', () => {
    // 웹에는 키를 둘 곳 자체가 없다 — 여기서 설정으로 보내면 열리지 않는 문이다.
    bridge.available = false;
    renderPanel();
    expect(screen.getByTestId('vault-agent-download-link')).toHaveAttribute(
      'href',
      '/ko/download/',
    );
    expect(screen.queryByTestId('vault-agent-open-settings')).not.toBeInTheDocument();
  });

  it('경계 다음 줄에 이어가기 카드가 선다 — 폴더 절대경로와 부탁 문장을 함께', async () => {
    // 앱 내장 터미널을 걷어낸 뒤 떠나는 순간을 잇는 유일한 표면이다. 문구만
    // 있으면 사용자가 폴더 절대경로를 손으로 찾아야 하고, 거기서 흐름이 끊긴다.
    bridge.available = true;
    renderPanel();
    fireEvent.click(await screen.findByTestId('agent-scope-accept'));

    const packet = await screen.findByTestId('agent-handoff-packet');
    expect(packet).toHaveTextContent('cd /vault');
    // 보고 있던 개념이 부탁 문장에 실린다 — 붙여넣는 즉시 볼트에서 풀려야 한다.
    expect(packet).toHaveTextContent('capabilities/payment');
    expect(screen.getByTestId('agent-handoff-copy')).toBeInTheDocument();
  });
});
