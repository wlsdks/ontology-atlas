// What the panel holds: honest web degradation · closing = stopping · the scope sheet comes first · the reflow contract.
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
  // The same contract as the real broadcast — a successful register or delete makes listeners re-query.
  subscribeSecretChange: (handler: () => void) => {
    secrets.listeners.add(handler);
    return () => secrets.listeners.delete(handler);
  },
}));

/** Imitate the moment a key is saved in the settings sheet. */
function emitSecretChange() {
  for (const listener of secrets.listeners) listener();
}

/**
 * The first words' raw material — the same fact map the "To-do" queue reads.
 * The test has to set the folder state directly to measure the three cases (empty
 * folder, folder with a queue, node selected).
 */
const conceptFacts = vi.hoisted(() => ({
  map: new Map<string, { hasDefinition: boolean; domainRef: string | null; mtime: number | null }>(),
}));

vi.mock('@/features/vault-ontology', () => ({
  useVaultConceptFacts: () => conceptFacts.map,
}));

/** git history — the basis for continuity across sessions. The default is "not a git folder". */
const gitBridge = vi.hoisted(() => ({ available: false, commits: [] as unknown[] }));
vi.mock('@/shared/lib/tauri-git', () => ({
  isGitBridgeAvailable: () => gitBridge.available,
  gitHistory: vi.fn(async () => gitBridge.commits),
}));

vi.mock('@/entities/vault-session/model/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/LocalVaultProvider')>()),
  useLocalVault: () => ({
    fileHandles: new Map(),
    createDoc: vi.fn(),
    saveDoc: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { subscribeSettingsViewIntent } from '@/shared/lib/settings-view-intent';

import { VaultAgentPanel } from './VaultAgentPanel';

/** A record of the "open that place in settings" requests the panel sent. */
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

/** "Payment Processing" with an empty meaning plus "Refund" with an empty owner — the two concepts the queue points at. */
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
    // Drawing a composer with nowhere safe to keep a key and no route to send is a lie.
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
    // Before sending, it states once what goes where.
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
    // Width is the only animated property — the map's shrink follows in the same frame.
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
    // Owner reversal (2026-07-26). The old contract was "do not create a second
    // entrance into settings; name the location instead" — "From 'AI Connection' in
    // the bottom-left settings (gear icon)...". Making a person hunt for somewhere the screen could take them
    // is not guidance.
    bridge.available = true;
    secrets.stored = false;
    renderPanel();
    const door = await screen.findByTestId('vault-agent-open-settings');
    // It stands in the composer's **position**, and that position is a single control
    // that really works (no disabled button, no imitation input that does nothing).
    expect(door).toHaveAccessibleName(messages.vaultAgentPanel.degraded.noKeyAction);
    expect(screen.queryByTestId('vault-agent-input')).not.toBeInTheDocument();

    fireEvent.click(door);
    // The settings sheet is owned by the app shell — the panel only sends "open that place".
    expect(settingsIntents).toEqual(['ai']);
    secrets.stored = true;
  });

  it('키를 넣고 돌아오면 새로고침 없이 살아난다', async () => {
    // Demanding F5 from a user who just registered a key is a defect.
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
    // The web has nowhere to keep a key at all — sending them to settings here is a door that does not open.
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
    // Screen → queue → standing. The slot priority is fixed.
    expect(chips.map((chip) => chip.dataset.firstWordsSlot)).toEqual([
      'screen',
      'queue',
      'standing',
    ]);
    expect(chips[0]).toHaveTextContent('결제 처리');
  });

  it('칩을 눌러도 아무것도 나가지 않는다 — 프리필이지 전송이 아니다', async () => {
    // This slice's core contract. A chip calling the model would be a transmission
    // without consent, and it spends someone else's money (BYOK charges).
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
    // A chip survives being pressed — it is a stateless control, so pressing again seats it again.
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
    // Drawing a button in a moment that cannot be completed is a trap. Same sentence, different clothes.
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
    // A safeguard in the code is not enough — if "files change only after I confirm"
    // is not on screen at **the moment** a person decides whether to entrust their key
    // and docs folder, that safeguard does nothing for the decision.
    bridge.available = true;
    secrets.stored = false;
    renderPanel();
    expect(await screen.findByTestId('vault-agent-consent-promise')).toHaveTextContent(
      messages.vaultAgentPanel.locked.consentPromise,
    );
    secrets.stored = true;
  });

  it('범위 시트가 승낙 범위에 쓰기가 있다는 것을 말한다', async () => {
    // Speaking only of reading, sending and logging while omitting writing makes it consent with an unknown scope.
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
    // After the in-app terminal was removed, this is the only surface bridging the
    // moment of leaving. With copy alone the user has to find the folder's absolute
    // path by hand, and the flow breaks there. Why it does not sit permanently
    // (2026-07-27): this card is needed **only when leaving**, yet it stood below the
    // composer at all times, eating two lines along with the boundary sentence. The
    // contract is unchanged — one press expands it and the same three things arrive
    // (why · where to · what).
    bridge.available = true;
    renderPanel();
    fireEvent.click(await screen.findByTestId('agent-scope-accept'));

    fireEvent.click(screen.getByTestId('agent-meta-handoff'));
    const packet = await screen.findByTestId('agent-handoff-packet');
    expect(packet).toHaveTextContent('cd /vault');
    // The concept being viewed rides in the request sentence — it has to resolve in the vault the moment it is pasted.
    expect(packet).toHaveTextContent('capabilities/payment');
    expect(screen.getByTestId('agent-handoff-copy')).toBeInTheDocument();
    // Why it is being handed over sits with the handing over.
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

    // Pressing the same button again closes it — there is always a way to close what
    // was opened.
    //
    // Closing is **not one frame** (2026-08-03): the box stays through the exit window
    // and collapses, and during that it is `inert` plus `pointer-events-none` so a
    // disappearing surface does not eat a click. Opening grows through reflow, so a
    // hard-cut close would make the two directions of the same input different grammars.
    fireEvent.click(screen.getByTestId('agent-meta-handoff'));
    const exiting = screen.getByTestId('agent-meta-disclosure');
    expect(exiting).toHaveAttribute('data-surface-state', 'exiting');
    expect(exiting).toHaveAttribute('inert');
    expect(exiting, '나가는 프레임은 못 눌린다').toHaveClass('pointer-events-none');
    await waitFor(() =>
      expect(screen.queryByTestId('agent-handoff-card')).not.toBeInTheDocument(),
    );
  });

  it('아직 아무 말도 안 한 사람에게는 이어갈 것이 없다 — 자리표시가 다르다', async () => {
    // The locked strip and the real composer use **the same copy**: even after a key
    // arrives, the same text stays in the same place, so it reads as "this opened".
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
