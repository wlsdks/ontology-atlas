// What the panel holds: honest web degradation · closing = stopping · the scope sheet comes first · the reflow contract.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../../messages/ko.json';

const bridge = vi.hoisted(() => ({ available: false }));
const constructionBridge = vi.hoisted(() => ({ pick: vi.fn(), preview: vi.fn(), read: vi.fn() }));
vi.mock('@/shared/lib/llm-connection/tauri-local-construction', () => ({ previewConstructionSource: constructionBridge.preview, readConstructionSource: constructionBridge.read }));
vi.mock('@/shared/lib/vault-folder/tauri-vault-fs', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), pickTauriSourceDirectory: constructionBridge.pick }));
const secrets = vi.hoisted(() => ({ stored: true, listeners: new Set<() => void>() }));

vi.mock('@/shared/lib/llm-connection/tauri-llm', () => ({
  isLlmChatBridgeAvailable: () => bridge.available,
  llmChat: vi.fn(async () => null),
  llmChatErrorMessage: (error: unknown) => String(error),
}));

vi.mock('@/shared/lib/llm-connection/tauri-secrets', () => ({
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
  map: new Map<string, { findings: readonly string[]; domainRef: string | null; mtime: number | null }>(),
}));

vi.mock('@/features/vault-ontology', () => ({
  useVaultConceptFacts: () => conceptFacts.map,
}));

/** git history — the basis for continuity across sessions. The default is "not a git folder". */
const gitBridge = vi.hoisted(() => ({ available: false, commits: [] as unknown[] }));
vi.mock('@/shared/lib/git/tauri-git', () => ({
  isGitBridgeAvailable: () => gitBridge.available,
  gitHistory: vi.fn(async () => gitBridge.commits),
}));

vi.mock('@/entities/vault-session/model/vault-provider/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/vault-provider/LocalVaultProvider')>()),
  useLocalVault: () => ({
    fileHandles: new Map(),
    createDoc: vi.fn(),
    saveDoc: vi.fn(),
    refresh: vi.fn(),
  }),
}));

/** Where the panel's doors navigated — the no-key door goes to the Agents models tab. */
const navigation = vi.hoisted(() => ({ pushed: [] as string[] }));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: (href: string) => navigation.pushed.push(href) }),
}));

import { llmChat } from '@/shared/lib/llm-connection/tauri-llm';
import { writeLocalEndpoint } from '@/shared/lib/llm-connection/local-endpoint';
import { VaultAgentPanel } from './VaultAgentPanel';

beforeEach(() => {
  navigation.pushed.length = 0;
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

/** Payment Processing has no meaning and Refund has no domain: the two concepts in the queue. */
function loadQueueFolder() {
  conceptFacts.map = new Map([
    ['capabilities/payment', { findings: ['definition-missing'], domainRef: 'billing', mtime: null }],
    ['capabilities/refund', { findings: [], domainRef: null, mtime: null }],
  ]);
}

describe('VaultAgentPanel', () => {
  beforeEach(() => {
    conceptFacts.map = new Map();
    gitBridge.available = false;
    gitBridge.commits = [];
  });

  it('on the web it draws an honest demotion instead of the input', () => {
    // Drawing a composer with nowhere safe to keep a key and no route to send is a lie.
    bridge.available = false;
    renderPanel();
    expect(screen.getByTestId('vault-agent-download-link')).toBeInTheDocument();
    expect(screen.queryByTestId('vault-agent-input')).not.toBeInTheDocument();
  });

  it('with no folder it first tells the user to open one', () => {
    bridge.available = true;
    renderPanel({ vaultPath: null });
    expect(screen.getByTestId('vault-agent-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('vault-agent-input')).not.toBeInTheDocument();
  });

  it('when only the path is restored and there is no manifest, it does not open a hidden folder agent on the sample map', async () => {
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

  it('before the first turn the scope sheet stands first and there is no input', async () => {
    // Before sending, it states once what goes where.
    bridge.available = true;
    renderPanel();
    expect(await screen.findByTestId('agent-scope-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('agent-scope-audit-path')).toHaveTextContent(
      '.ontology-atlas/llm-audit.jsonl',
    );
    expect(screen.queryByTestId('vault-agent-input')).not.toBeInTheDocument();
  });

  it('reflow moves both columns together with a single width', () => {
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

  it('with no key it offers a door to the place instead of giving directions in words', async () => {
    // With no key the panel offers a door to settings in the composer's position rather than directions.
    bridge.available = true;
    secrets.stored = false;
    renderPanel();
    const door = await screen.findByTestId('vault-agent-open-settings');
    // It stands in the composer's **position**, and that position is a single control
    // that really works (no disabled button, no imitation input that does nothing).
    expect(door).toHaveAccessibleName(messages.vaultAgentPanel.degraded.noKeyAction);
    expect(screen.queryByTestId('vault-agent-input')).not.toBeInTheDocument();

    fireEvent.click(door);
    expect(navigation.pushed).toEqual(['/agents/?tab=models']);
    secrets.stored = true;
  });

  it('after entering a key and coming back it comes alive without a refresh', async () => {
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

  it('the browser demotion sends the user to the app, not to settings', () => {
    // The web has nowhere to keep a key at all — sending them to settings here is a door that does not open.
    bridge.available = false;
    renderPanel();
    expect(screen.getByTestId('vault-agent-download-link')).toHaveAttribute(
      'href',
      '/ko/download/',
    );
    expect(screen.queryByTestId('vault-agent-open-settings')).not.toBeInTheDocument();
  });

  it('an empty conversation gets first-words chips first, rather than handing over a blank page', async () => {
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

  it('pressing a chip sends nothing, because it prefills rather than sends', async () => {
    // This slice's core contract. A chip calling the model would be a transmission
    // without consent, and it spends someone else's money (BYOK charges).
    bridge.available = true;
    loadQueueFolder();
    const { llmChat } = await import('@/shared/lib/llm-connection/tauri-llm');
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

  it('an empty folder does not force the chips up to three', async () => {
    bridge.available = true;
    renderPanel({ insight: { nodes: [], edges: [] } as never });
    fireEvent.click(await screen.findByTestId('agent-scope-accept'));
    const chips = await screen.findAllByTestId('agent-first-words-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0].dataset.firstWordsIntent).toBe('empty-vault');
  });

  it('the list without a key comes from the same generator, only as plain text', async () => {
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

  it('the write-consent promise can be read where the user decides whether to entrust a key', async () => {
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

  it('the scope sheet says that the granted scope includes writing', async () => {
    // Speaking only of reading, sending and logging while omitting writing makes it consent with an unknown scope.
    bridge.available = true;
    renderPanel();
    expect(await screen.findByTestId('agent-scope-consent')).toHaveTextContent(
      messages.vaultAgentPanel.scope.consent,
    );
  });

  it('the first words handed over from outside land in the input without sending', async () => {
    bridge.available = true;
    const { llmChat } = await import('@/shared/lib/llm-connection/tauri-llm');
    vi.mocked(llmChat).mockClear();
    renderPanel({ prefillRequest: { text: '「환불」의 소속을 찾아 줘', nonce: 1 } });
    fireEvent.click(await screen.findByTestId('agent-scope-accept'));
    const input = screen.getByTestId('vault-agent-input') as HTMLTextAreaElement;
    expect(input.value).toBe('「환불」의 소속을 찾아 줘');
    expect(llmChat).not.toHaveBeenCalled();
  });

  it('with no progress the header subtitle stays as it was, since there is only one place for it', async () => {
    bridge.available = true;
    renderPanel();
    expect(screen.getByTestId('vault-agent-panel-subtitle')).toHaveTextContent(
      messages.vaultAgentPanel.subtitle,
    );
  });

  it('expanding resume shows the boundary together with the absolute folder path and the request sentence', async () => {
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

  it('a side branch opens only one at a time, so transient surfaces do not stack', async () => {
    bridge.available = true;
    renderPanel();
    fireEvent.click(await screen.findByTestId('agent-scope-accept'));

    fireEvent.click(screen.getByTestId('agent-meta-prompt'));
    expect(screen.getByTestId('agent-prompt-disclosure')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-handoff-card')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('agent-meta-handoff'));
    expect(screen.getByTestId('agent-handoff-card')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-prompt-disclosure')).not.toBeInTheDocument();

    // Closing is not one frame: the box stays through the exit window, `inert` and
    // `pointer-events-none`.
    fireEvent.click(screen.getByTestId('agent-meta-handoff'));
    const exiting = screen.getByTestId('agent-meta-disclosure');
    expect(exiting).toHaveAttribute('data-surface-state', 'exiting');
    expect(exiting).toHaveAttribute('inert');
    expect(exiting, 'the exiting frame cannot be pressed').toHaveClass('pointer-events-none');
    await waitFor(() =>
      expect(screen.queryByTestId('agent-handoff-card')).not.toBeInTheDocument(),
    );
  });

  it('someone who has said nothing yet has nothing to resume, so the placeholder differs', async () => {
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

  it('holds every Enter that belongs to an IME composition and sends on the next plain Enter', async () => {
    bridge.available = true;
    const { llmChat } = await import('@/shared/lib/llm-connection/tauri-llm');
    vi.mocked(llmChat).mockClear();
    renderPanel();
    fireEvent.click(await screen.findByTestId('agent-scope-accept'));
    const input = screen.getByTestId('vault-agent-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '결제 처리의 정의를 채워 줘' } });

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    fireEvent.compositionEnd(input, { data: '줘' });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(input.value).toBe('결제 처리의 정의를 채워 줘');
    expect(llmChat).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(input.value).toBe('');
    await waitFor(() => expect(llmChat).toHaveBeenCalledTimes(1));
  });
});


describe('local construction preview and consent', () => {
  beforeEach(() => {
    bridge.available = true;
    writeLocalEndpoint({ baseUrl: 'http://localhost:11434', model: 'local-fixture' });
    vi.mocked(llmChat).mockClear();
    constructionBridge.pick.mockReset().mockResolvedValue('/chosen-code');
    constructionBridge.preview.mockReset().mockResolvedValue({
      sourcePath: '/chosen-code', destinationPath: '/vault', fingerprint: 'snapshot',
      files: [{ path: 'entry.py', bytes: 18 }], excluded: ['symlink:elsewhere'], limited: false,
    });
    constructionBridge.read.mockReset();
  });
  afterEach(() => { window.localStorage.clear(); });

  it('previews exact source, destination and model before any request; Cancel keeps composer input', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: '코드에서 만들기' }));
    expect(await screen.findByTestId('construction-preview')).toHaveTextContent('/chosen-code');
    expect(screen.getByTestId('construction-preview')).toHaveTextContent('/vault');
    expect(screen.getByTestId('construction-preview')).toHaveTextContent('local-fixture');
    expect(screen.getByTestId('construction-preview')).toHaveTextContent('symlink:elsewhere');
    expect(llmChat).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('construction-cancel'));
    expect(llmChat).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('알겠어요'));
    const input = await screen.findByTestId('vault-agent-input');
    fireEvent.change(input, { target: { value: 'keep this question' } });
    fireEvent.click(screen.getByRole('button', { name: '코드에서 만들기' }));
    await screen.findByTestId('construction-preview');
    fireEvent.click(screen.getByTestId('construction-cancel'));
    expect(input).toHaveValue('keep this question');
  });

  it('only explicit Run invokes the strict local source transport', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: '코드에서 만들기' }));
    await screen.findByTestId('construction-preview');
    expect(llmChat).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('construction-run'));
    await waitFor(() => expect(llmChat).toHaveBeenCalledWith(expect.objectContaining({ sourceConstruction: true, provider: 'local', vaultPath: '/vault' })));
  });

  it('disables Run for an empty source and exposes another-folder recovery', async () => {
    constructionBridge.preview.mockResolvedValue({ sourcePath: '/chosen-code', destinationPath: '/vault', fingerprint: 'snapshot', files: [], excluded: [], limited: false });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: '코드에서 만들기' }));
    expect(await screen.findByTestId('construction-run')).toBeDisabled();
    expect(screen.getByTestId('construction-choose-again')).toBeInTheDocument();
    expect(llmChat).not.toHaveBeenCalled();
  });

  it('shows an incomplete source range at EOF when earlier lines were omitted', async () => {
    constructionBridge.read.mockResolvedValue({ path: 'entry.py', startLine: 11, endLine: 11, totalLines: 11, fileComplete: false,
      text: 'last line', bytes: 9, fullFileSha256: `sha256:${'a'.repeat(64)}`, nextLine: null });
    const echo = { status: 200, host: 'localhost:11434', durationMs: 0, loggedAt: 'fixture' };
    vi.mocked(llmChat).mockResolvedValueOnce({ ...echo, body: JSON.stringify({ choices: [{ message: {
      content: null, tool_calls: [{ id: 'read', type: 'function', function: { name: 'read_source_text', arguments: JSON.stringify({ path: 'entry.py', startLine: 11 }) } }],
    }, finish_reason: 'tool_calls' }] }) }).mockResolvedValueOnce({ ...echo, body: JSON.stringify({ choices: [{ message: { content: 'No draft.' }, finish_reason: 'stop' }] }) });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: '코드에서 만들기' }));
    await screen.findByTestId('construction-preview');
    fireEvent.click(screen.getByTestId('construction-run'));
    await waitFor(() => expect(screen.getByTestId('construction-evidence')).toHaveTextContent('entry.py:11-11'));
    expect(screen.getByTestId('construction-evidence')).toHaveTextContent('…');
  });

  it('does not prepare source or expose Run on the web', () => {
    bridge.available = false;
    renderPanel();
    expect(screen.queryByRole('button', { name: '코드에서 만들기' })).not.toBeInTheDocument();
    expect(constructionBridge.pick).not.toHaveBeenCalled();
    expect(screen.queryByTestId('construction-run')).not.toBeInTheDocument();
  });
});
