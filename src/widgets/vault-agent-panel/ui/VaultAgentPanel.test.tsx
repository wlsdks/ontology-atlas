// 패널이 지키는 것: 웹 정직 강등 · 닫힘=중단 · 범위 시트 선행 · 리플로우 계약.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  LOCAL_PROVIDER: 'local',
  LOCAL_DEFAULT_BASE_URL: 'http://localhost:11434',
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

/**
 * 첫 마디의 재료 — 「할 일」 큐가 읽는 것과 같은 사실 map. 테스트가 폴더
 * 상태를 직접 정해야 세 경우(빈 폴더·큐 있는 폴더·노드 선택)를 잴 수 있다.
 */
const conceptFacts = vi.hoisted(() => ({
  map: new Map<string, { hasDefinition: boolean; domainRef: string | null; mtime: number | null }>(),
}));

vi.mock('@/features/vault-ontology', () => ({
  useVaultConceptFacts: () => conceptFacts.map,
}));

/** git 이력 — 세션 사이 이어짐의 근거. 기본은 "git 이 아닌 폴더". */
const gitBridge = vi.hoisted(() => ({ available: false, commits: [] as unknown[] }));
vi.mock('@/shared/lib/tauri-git', () => ({
  isGitBridgeAvailable: () => gitBridge.available,
  gitHistory: vi.fn(async () => gitBridge.commits),
}));

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
        manifest={{ docs: [] } as never}
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

const payNode = {
  id: 'capability:payment',
  kind: 'capability',
  title: '결제 처리',
  evidenceIds: ['capabilities/payment'],
  hasOwnDocument: true,
  agentSlug: 'capabilities/payment',
  ref: null,
} as never;

const refundNode = {
  id: 'capability:refund',
  kind: 'capability',
  title: '환불',
  evidenceIds: ['capabilities/refund'],
  hasOwnDocument: true,
  agentSlug: 'capabilities/refund',
  ref: null,
} as never;

/** 뜻이 빈 「결제 처리」 + 소속이 빈 「환불」 — 큐가 지목할 두 개념. */
function loadQueueFolder() {
  conceptFacts.map = new Map([
    ['capabilities/payment', { hasDefinition: false, domainRef: 'billing', mtime: null }],
    ['capabilities/refund', { hasDefinition: true, domainRef: null, mtime: null }],
  ]);
}

describe('VaultAgentPanel', () => {
  beforeEach(() => {
    conceptFacts.map = new Map();
    gitBridge.available = false;
    gitBridge.commits = [];
  });

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

  it('경로만 복원되고 manifest가 없으면 샘플 지도에 숨은 폴더 에이전트를 열지 않는다', async () => {
    bridge.available = true;
    renderPanel({
      vaultPath: '/restored-but-unreadable-vault',
      manifest: null,
      insight: { nodes: [payNode], edges: [] } as never,
    });
    await waitFor(() =>
      expect(
        screen.getByTestId('vault-agent-panel').querySelector('[data-agent-panel-stage]'),
      ).toHaveAttribute('data-agent-panel-stage', 'no-folder'),
    );
    expect(screen.getByTestId('vault-agent-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-scope-sheet')).not.toBeInTheDocument();
    expect(screen.queryByTestId('vault-agent-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-meta-handoff')).not.toBeInTheDocument();
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

  it('빈 대화에 첫 마디 칩이 먼저 앉는다 — 백지를 내밀지 않는다', async () => {
    bridge.available = true;
    loadQueueFolder();
    renderPanel({ insight: { nodes: [payNode, refundNode], edges: [] } as never });
    fireEvent.click(await screen.findByTestId('agent-scope-accept'));

    const chips = await screen.findAllByTestId('agent-first-words-chip');
    // 화면 → 큐 → 상비. 슬롯 우선순위는 고정이다.
    expect(chips.map((chip) => chip.dataset.firstWordsSlot)).toEqual([
      'screen',
      'queue',
      'standing',
    ]);
    expect(chips[0]).toHaveTextContent('결제 처리');
  });

  it('칩을 눌러도 아무것도 나가지 않는다 — 프리필이지 전송이 아니다', async () => {
    // 이 슬라이스의 핵심 계약. 칩이 모델을 부르면 그것은 동의 없는 전송이고
    // 남의 돈(BYOK 요금)을 쓰는 일이다.
    bridge.available = true;
    loadQueueFolder();
    const { llmChat } = await import('@/shared/lib/tauri-llm');
    vi.mocked(llmChat).mockClear();

    renderPanel({ insight: { nodes: [payNode], edges: [] } as never });
    fireEvent.click(await screen.findByTestId('agent-scope-accept'));
    const chip = (await screen.findAllByTestId('agent-first-words-chip'))[0];
    const chipText = chip.textContent ?? '';
    fireEvent.click(chip);

    const input = screen.getByTestId('vault-agent-input') as HTMLTextAreaElement;
    expect(input.value).toBe(chipText);
    expect(llmChat).not.toHaveBeenCalled();
    // 칩은 눌린 뒤에도 남는다 — 상태 없는 컨트롤이라 다시 누르면 다시 앉는다.
    expect(screen.getAllByTestId('agent-first-words-chip').length).toBeGreaterThan(0);
  });

  it('빈 폴더에서는 칩을 셋으로 억지로 채우지 않는다', async () => {
    bridge.available = true;
    renderPanel({ insight: { nodes: [], edges: [] } as never });
    fireEvent.click(await screen.findByTestId('agent-scope-accept'));
    const chips = await screen.findAllByTestId('agent-first-words-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0].dataset.firstWordsIntent).toBe('empty-vault');
  });

  it('키가 없는 상태의 목록도 같은 생성기에서 나온다 — 다만 평문이다', async () => {
    // 완결할 수 없는 순간에 버튼을 그리면 함정이 된다. 문장은 같고 옷만 다르다.
    bridge.available = true;
    secrets.stored = false;
    loadQueueFolder();
    renderPanel({ insight: { nodes: [payNode, refundNode], edges: [] } as never });
    await screen.findByTestId('vault-agent-open-settings');
    expect(screen.queryAllByTestId('agent-first-words-chip')).toHaveLength(0);
    const lines = screen.getAllByTestId('agent-first-words-line');
    expect(lines[0]).toHaveTextContent('결제 처리');
    secrets.stored = true;
  });

  it('키를 맡길지 정하는 자리에서 쓰기 동의 약속이 읽힌다', async () => {
    // 안전장치는 코드에 있는 것으로 부족하다 — 사람이 자기 키와 문서 폴더를
    // 맡길지 정하는 **그 순간**에 "파일은 내가 확인해야 바뀐다" 가 화면에
    // 없으면, 그 안전장치는 결정에 아무 도움이 안 된다.
    bridge.available = true;
    secrets.stored = false;
    renderPanel();
    expect(await screen.findByTestId('vault-agent-consent-promise')).toHaveTextContent(
      messages.vaultAgentPanel.locked.consentPromise,
    );
    secrets.stored = true;
  });

  it('범위 시트가 승낙 범위에 쓰기가 있다는 것을 말한다', async () => {
    // 읽기·전송·기록만 말하고 쓰기를 빼면 그 승낙은 범위를 모르는 승낙이다.
    bridge.available = true;
    renderPanel();
    expect(await screen.findByTestId('agent-scope-consent')).toHaveTextContent(
      messages.vaultAgentPanel.scope.consent,
    );
  });

  it('S7 — 바깥에서 건너온 첫 마디가 입력칸에 앉는다(전송 없이)', async () => {
    bridge.available = true;
    const { llmChat } = await import('@/shared/lib/tauri-llm');
    vi.mocked(llmChat).mockClear();
    renderPanel({ prefillRequest: { text: '「환불」의 소속을 찾아 줘', nonce: 1 } });
    fireEvent.click(await screen.findByTestId('agent-scope-accept'));
    const input = screen.getByTestId('vault-agent-input') as HTMLTextAreaElement;
    expect(input.value).toBe('「환불」의 소속을 찾아 줘');
    expect(llmChat).not.toHaveBeenCalled();
  });

  it('진전이 없으면 헤더 부제는 그대로다 — 자리는 하나뿐이다', async () => {
    bridge.available = true;
    renderPanel();
    expect(screen.getByTestId('vault-agent-panel-subtitle')).toHaveTextContent(
      messages.vaultAgentPanel.subtitle,
    );
  });

  it('이어가기를 펼치면 경계와 함께 폴더 절대경로·부탁 문장이 온다', async () => {
    // 앱 내장 터미널을 걷어낸 뒤 떠나는 순간을 잇는 유일한 표면이다. 문구만
    // 있으면 사용자가 폴더 절대경로를 손으로 찾아야 하고, 거기서 흐름이 끊긴다.
    // 상주하지 않는 이유(2026-07-27): 이 카드는 **떠날 때만** 필요한데 입력칸
    // 아래에 늘 서 있으면서 경계 문장까지 두 줄을 상시로 먹고 있었다. 계약은
    // 그대로다 — 한 번 눌러 펼치면 같은 세 가지(왜 · 어디로 · 무엇을)가 온다.
    bridge.available = true;
    renderPanel();
    fireEvent.click(await screen.findByTestId('agent-scope-accept'));

    fireEvent.click(screen.getByTestId('agent-meta-handoff'));
    const packet = await screen.findByTestId('agent-handoff-packet');
    expect(packet).toHaveTextContent('cd /vault');
    // 보고 있던 개념이 부탁 문장에 실린다 — 붙여넣는 즉시 볼트에서 풀려야 한다.
    expect(packet).toHaveTextContent('capabilities/payment');
    expect(screen.getByTestId('agent-handoff-copy')).toBeInTheDocument();
    // 왜 넘기는지가 넘기는 자리에 함께 있다.
    expect(screen.getByTestId('agent-handoff-card')).toHaveTextContent(
      messages.vaultAgentPanel.boundary,
    );
  });

  it('곁가지는 한 번에 하나만 열린다 — 임시 표면을 겹쳐 쌓지 않는다', async () => {
    bridge.available = true;
    renderPanel();
    fireEvent.click(await screen.findByTestId('agent-scope-accept'));

    fireEvent.click(screen.getByTestId('agent-meta-prompt'));
    expect(screen.getByTestId('agent-prompt-disclosure')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-handoff-card')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('agent-meta-handoff'));
    expect(screen.getByTestId('agent-handoff-card')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-prompt-disclosure')).not.toBeInTheDocument();

    // 같은 버튼을 다시 누르면 닫힌다 — 열어 둔 것을 닫을 길이 항상 있다.
    fireEvent.click(screen.getByTestId('agent-meta-handoff'));
    expect(screen.queryByTestId('agent-handoff-card')).not.toBeInTheDocument();
  });

  it('아직 아무 말도 안 한 사람에게는 이어갈 것이 없다 — 자리표시가 다르다', async () => {
    // 잠긴 띠와 실제 입력칸이 **같은 문구**를 쓴다: 키가 들어와도 같은 자리에
    // 같은 글자가 남으므로 "여기가 열렸다" 로 읽힌다.
    bridge.available = true;
    secrets.stored = false;
    renderPanel();
    expect(await screen.findByTestId('vault-agent-open-settings')).toHaveTextContent(
      messages.vaultAgentPanel.placeholderFirst,
    );

    secrets.stored = true;
    emitSecretChange();
    fireEvent.click(await screen.findByTestId('agent-scope-accept'));
    expect(screen.getByTestId('vault-agent-input')).toHaveAttribute(
      'placeholder',
      messages.vaultAgentPanel.placeholderFirst,
    );
  });
});
