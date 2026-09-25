import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelConnectionsPanel } from './ModelConnectionsPanel';
import type { AiConnectionState } from '../model/use-ai-connection';
import type { LlmAuditEntry } from '@/shared/lib/llm-audit-log';
import { buildJevPayload } from '@/shared/lib/tauri-jev';

const mocks = vi.hoisted(() => ({
  secretSet: vi.fn(),
  secretClear: vi.fn(),
  secretVerify: vi.fn(),
  jevSecretSet: vi.fn(),
  jevSecretClear: vi.fn(),
  jevJudge: vi.fn(),
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

vi.mock('@/shared/lib/tauri-jev', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/tauri-jev')>();
  return {
    ...actual,
    jevSecretSet: mocks.jevSecretSet,
    jevSecretClear: mocks.jevSecretClear,
    jevJudge: mocks.jevJudge,
  };
});

vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  revealTauriVaultFile: (...args: unknown[]) => mocks.reveal(...args),
  getTauriVaultRootPath: () => null,
}));

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ show: mocks.toast }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
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

const NS = 'agents.models';

function makeConnection(overrides: Partial<AiConnectionState> = {}): AiConnectionState {
  return {
    bridgeAvailable: true,
    statuses: { anthropic: null, openai: null, gemini: null },
    applyStatus: vi.fn(),
    jevStatus: null,
    applyJevStatus: vi.fn(),
    keysRead: true,
    auditEntries: [],
    auditTotal: 0,
    refreshAudit: vi.fn(),
    ...overrides,
  };
}

function renderPanel(connection: AiConnectionState, vaultRootPath: string | null = '/vault') {
  return render(
    <ModelConnectionsPanel
      connection={connection}
      vaultRootPath={vaultRootPath}
      downloadHref="/download/"
      onDownloadNavigate={() => {}}
    />,
  );
}

const STORED_ANTHROPIC = {
  anthropic: { provider: 'anthropic', stored: true, last4: 'abcd' },
  openai: null,
  gemini: null,
};

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
  for (const mock of Object.values(mocks)) mock.mockReset();
  window.localStorage.clear();
});

/**
 * Web degradation — a browser has nowhere safe to keep a key. The tab exists and says why, where
 * it works, and shows no example rows: a sample key or runner would be fake data.
 */
describe('models tab on the web', () => {
  it('renders no key input, no runner row and no example data without the desktop bridge', () => {
    renderPanel(makeConnection({ bridgeAvailable: false }));
    expect(screen.getByTestId('ai-connection-web-degraded')).toBeInTheDocument();
    for (const id of ['ai-register-anthropic', 'ai-key-input-openai', 'ai-register-local-ollama', 'ai-local-url', 'ai-provider-jev', 'ai-audit-tail']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    // Why the key-less runners do not work here either is said in the same card.
    expect(screen.getByTestId('ai-connection-web-degraded-local')).toBeInTheDocument();
    expect(screen.getByTestId('ai-connection-download-link')).toHaveAttribute('href', '/download/');
  });
});

describe('models tab layout', () => {
  it('reads local models, API keys, the external check, then the sent log', () => {
    renderPanel(makeConnection());
    const view = screen.getByTestId('ai-connection-view');
    const order = [...view.children].map((node) => node.getAttribute('data-testid'));
    expect(order).toEqual(['models-local', 'models-keys', 'models-external', 'ai-audit-tail', 'models-announcer']);
    // The four runner rows and the three vendor rows, each one row.
    const local = screen.getByTestId('models-local');
    for (const id of ['ollama', 'lmstudio', 'llamacpp', 'custom']) {
      expect(within(local).getByTestId(`ai-provider-local-${id}`)).toBeInTheDocument();
    }
    for (const provider of ['anthropic', 'openai', 'gemini']) {
      expect(within(screen.getByTestId('models-keys')).getByTestId(`ai-provider-${provider}`)).toBeInTheDocument();
    }
  });

  it('names the runner defaults as addresses a person can read', () => {
    renderPanel(makeConnection());
    expect(within(screen.getByTestId('ai-provider-local-ollama')).getByText('http://localhost:11434')).toBeInTheDocument();
    expect(within(screen.getByTestId('ai-provider-local-lmstudio')).getByText('http://localhost:1234')).toBeInTheDocument();
  });

  it('marks the external check experimental', () => {
    renderPanel(makeConnection());
    expect(within(screen.getByTestId('models-external')).getByTestId('models-experimental')).toHaveTextContent(
      `${NS}.experimental`,
    );
  });

  it('gives every status a word beside its dot — colour never carries it alone', () => {
    renderPanel(makeConnection());
    for (const dot of screen.getByTestId('ai-connection-view').querySelectorAll('[data-status-dot]')) {
      expect(dot.parentElement?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
      expect(dot).toHaveAttribute('aria-hidden');
    }
  });
});

/**
 * Collapsing unregistered rows — three permanently visible password inputs would make the tab a
 * form gate. A collapsed row still states its status.
 */
describe('API key rows', () => {
  it('lists every named vendor without opening three key fields at once', () => {
    renderPanel(makeConnection());
    for (const provider of ['anthropic', 'openai', 'gemini']) {
      expect(screen.getByTestId(`ai-register-${provider}`)).toHaveTextContent(`${NS}.actionAdd`);
      expect(screen.getByTestId(`ai-status-${provider}`)).toHaveTextContent(`${NS}.statusNoKey`);
      expect(screen.queryByTestId(`ai-key-input-${provider}`)).toBeNull();
    }
  });

  it('opens exactly one row at a time', async () => {
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-anthropic'));
    expect(screen.getByTestId('ai-key-input-anthropic')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ai-register-gemini'));
    expect(screen.getByTestId('ai-key-input-gemini')).toBeInTheDocument();
    expect(screen.getByTestId('ai-detail-anthropic')).toHaveAttribute('data-state', 'closed');
    await waitFor(() => expect(screen.queryByTestId('ai-key-input-anthropic')).toBeNull());
  });

  it('drops an unsaved draft when another row takes the open slot', () => {
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-anthropic'));
    fireEvent.change(screen.getByTestId('ai-key-input-anthropic'), { target: { value: 'sk-ant-abandoned' } });
    fireEvent.click(screen.getByTestId('ai-register-gemini'));
    expect(document.body.innerHTML).not.toContain('sk-ant-abandoned');
    fireEvent.click(screen.getByTestId('ai-register-anthropic'));
    expect((screen.getByTestId('ai-key-input-anthropic') as HTMLInputElement).value).toBe('');
  });

  it('adds a key, drops it from state the moment it lands, and says so', async () => {
    const applyStatus = vi.fn();
    mocks.secretSet.mockResolvedValue({ provider: 'openai', stored: true, last4: 'wxyz' });
    renderPanel(makeConnection({ applyStatus }));
    fireEvent.click(screen.getByTestId('ai-register-openai'));
    // Where a pasted key goes is on screen at the moment of pasting.
    expect(screen.getByText(`${NS}.pasteSafety:${NS}.providerOpenai`)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('ai-key-input-openai'), { target: { value: 'sk-openai-real' } });
    fireEvent.click(screen.getByTestId('ai-save-openai'));
    await waitFor(() => expect(applyStatus).toHaveBeenCalledWith('openai', { provider: 'openai', stored: true, last4: 'wxyz' }));
    expect(mocks.secretSet).toHaveBeenCalledWith('openai', 'sk-openai-real');
    // Said by the row and read out by the announcer — not by a toast over the page
    // (2026-09-26: on this tall tab the toast stood over the sent-log caption).
    await waitFor(() =>
      expect(screen.getByTestId('models-announcer')).toHaveTextContent(`${NS}.providerOpenai · ${NS}.saved`),
    );
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(document.body.innerHTML).not.toContain('sk-openai-real');
    await waitFor(() => expect(screen.getByTestId('ai-detail-openai')).toHaveAttribute('data-state', 'closed'));
  });

  it('shows only the last 4 characters of a stored key, and offers Check and Replace', () => {
    renderPanel(makeConnection({ statuses: STORED_ANTHROPIC }));
    expect(screen.getByTestId('ai-stored-anthropic')).toHaveTextContent('····abcd');
    // Saved is a fact about this computer, not proof the key works: grey until a check.
    expect(screen.getByTestId('ai-stored-anthropic')).toHaveAttribute('data-tone', 'saved');
    expect(screen.getByTestId('ai-verify-anthropic')).toHaveTextContent(`${NS}.actionCheck`);
    expect(screen.getByTestId('ai-replace-anthropic')).toHaveTextContent(`${NS}.actionReplace`);
    expect(screen.queryByTestId('ai-key-input-anthropic')).toBeNull();
  });

  it('replaces a stored key through the same field, never showing the old one', async () => {
    mocks.secretSet.mockResolvedValue({ provider: 'anthropic', stored: true, last4: 'efgh' });
    const applyStatus = vi.fn();
    renderPanel(makeConnection({ statuses: STORED_ANTHROPIC, applyStatus }));
    fireEvent.click(screen.getByTestId('ai-replace-anthropic'));
    expect((screen.getByTestId('ai-key-input-anthropic') as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByTestId('ai-key-input-anthropic'), { target: { value: 'sk-ant-new' } });
    fireEvent.click(screen.getByTestId('ai-save-anthropic'));
    await waitFor(() => expect(applyStatus).toHaveBeenCalledWith('anthropic', { provider: 'anthropic', stored: true, last4: 'efgh' }));
  });

  it('needs a second press to remove a key — armed inline, not in a modal', async () => {
    mocks.secretClear.mockResolvedValue({ provider: 'anthropic', stored: false, last4: null });
    const applyStatus = vi.fn();
    renderPanel(makeConnection({ statuses: STORED_ANTHROPIC, applyStatus }));
    fireEvent.click(screen.getByTestId('ai-replace-anthropic'));
    const clearButton = screen.getByTestId('ai-clear-anthropic');
    fireEvent.click(clearButton);
    expect(clearButton).toHaveTextContent(`${NS}.clearConfirm`);
    expect(mocks.secretClear).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(clearButton);
    await waitFor(() => expect(mocks.secretClear).toHaveBeenCalledWith('anthropic'));
    expect(applyStatus).toHaveBeenCalledWith('anthropic', { provider: 'anthropic', stored: false, last4: null });
    await waitFor(() =>
      expect(screen.getByTestId('models-announcer')).toHaveTextContent(`${NS}.providerAnthropic · ${NS}.cleared`),
    );
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('never writes anything on cancel, and hands focus back to the opener', async () => {
    const applyStatus = vi.fn();
    renderPanel(makeConnection({ applyStatus }));
    fireEvent.click(screen.getByTestId('ai-register-openai'));
    fireEvent.change(screen.getByTestId('ai-key-input-openai'), { target: { value: 'sk-openai-abandoned' } });
    fireEvent.click(screen.getByTestId('ai-cancel-openai'));
    expect(screen.getByTestId('ai-detail-openai')).toHaveAttribute('data-state', 'closed');
    expect(screen.getByTestId('ai-detail-openai')).toHaveAttribute('inert');
    expect(document.body.innerHTML).not.toContain('sk-openai-abandoned');
    expect(mocks.secretSet).not.toHaveBeenCalled();
    expect(applyStatus).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('ai-register-openai')));
  });

  it('honours the aria-expanded promise — the opener closes what it opened', () => {
    renderPanel(makeConnection());
    const trigger = screen.getByTestId('ai-register-openai');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('API key connection check', () => {
  it('offers no check without a folder to record the call in, and says why', () => {
    renderPanel(makeConnection({ statuses: STORED_ANTHROPIC }), null);
    // Not a disabled button that says nothing: the check is absent and the caption says why.
    expect(screen.queryByTestId('ai-verify-anthropic')).toBeNull();
    expect(screen.getByText(`${NS}.verifyNeedsVault`)).toBeInTheDocument();
  });

  it('draws no key status until the Keychain has answered', () => {
    renderPanel(makeConnection({ keysRead: false, statuses: STORED_ANTHROPIC }));
    expect(screen.queryByTestId('ai-stored-anthropic')).toBeNull();
    expect(screen.queryByTestId('ai-status-openai')).toBeNull();
    expect(screen.queryByTestId('ai-register-openai')).toBeNull();
  });

  it('reads a saved key to a screen reader as a sentence, not four dots', () => {
    renderPanel(makeConnection({ statuses: STORED_ANTHROPIC }));
    const status = screen.getByTestId('ai-stored-anthropic');
    expect(status).toHaveTextContent(`${NS}.statusKeyStored:abcd`);
    const dots = status.querySelector('.font-mono');
    expect(dots).toHaveTextContent('····abcd');
    expect(dots).toHaveAttribute('aria-hidden');
  });

  it('names the destination host before the check is pressed', () => {
    renderPanel(makeConnection({ statuses: STORED_ANTHROPIC }));
    expect(within(screen.getByTestId('ai-provider-anthropic')).getByText('api.anthropic.com')).toBeInTheDocument();
    expect(screen.getByTestId('ai-verify-anthropic')).toHaveAttribute('title', `${NS}.verifyScope:api.anthropic.com`);
  });

  it('reports a rejected key as a rejection and refreshes the sent log', async () => {
    const refreshAudit = vi.fn();
    mocks.secretVerify.mockResolvedValue({ provider: 'anthropic', ok: false, denied: true, httpStatus: 401, message: null, durationMs: 210, loggedAt: 'x' });
    renderPanel(makeConnection({ refreshAudit, statuses: STORED_ANTHROPIC }));
    fireEvent.click(screen.getByTestId('ai-verify-anthropic'));
    await waitFor(() => expect(screen.getByTestId('ai-status-anthropic')).toHaveTextContent(`${NS}.verifyDenied:401`));
    expect(screen.getByTestId('ai-status-anthropic')).toHaveAttribute('data-tone', 'danger');
    expect(refreshAudit).toHaveBeenCalled();
    expect(mocks.secretVerify).toHaveBeenCalledWith('anthropic', '/vault');
  });

  it('confirms a working key in words and the success tone', async () => {
    mocks.secretVerify.mockResolvedValue({ provider: 'anthropic', ok: true, denied: false, httpStatus: 200, message: null, durationMs: 640, loggedAt: 'x' });
    renderPanel(makeConnection({ statuses: STORED_ANTHROPIC }));
    fireEvent.click(screen.getByTestId('ai-verify-anthropic'));
    await waitFor(() => expect(screen.getByTestId('ai-stored-anthropic')).toHaveTextContent(`${NS}.statusConnected`));
    expect(screen.getByTestId('ai-stored-anthropic')).toHaveAttribute('data-tone', 'success');
  });
});

/**
 * Local runners. Each row names a documented default address; exactly one saved runner answers
 * the conversation. A status is a fact the screen checked in this visit, or it says it was not.
 */
describe('local runner rows', () => {
  it('says "not connected", never "off", for a runner it did not ask', () => {
    renderPanel(makeConnection());
    for (const id of ['ollama', 'lmstudio', 'llamacpp', 'custom']) {
      expect(screen.getByTestId(`ai-local-status-${id}`)).toHaveTextContent(`${NS}.statusNotConnected`);
      expect(screen.getByTestId(`ai-register-local-${id}`)).toHaveTextContent(`${NS}.actionConnect`);
    }
    // Nothing is probed on its own: every probe is a line in the sent log.
    expect(mocks.secretVerify).not.toHaveBeenCalled();
  });

  it('connects LM Studio at its own default address and picks a model from what it answers', async () => {
    mocks.secretVerify.mockResolvedValue(verifyResult({ ok: true, httpStatus: 200, body: '{"data":[{"id":"qwen3:8b"},{"id":"gemma4:12b"}]}' }));
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-local-lmstudio'));
    expect((screen.getByTestId('ai-local-url') as HTMLInputElement).value).toBe('http://localhost:1234');
    fireEvent.click(screen.getByTestId('ai-verify-local'));
    await waitFor(() => expect(screen.getByTestId('ai-local-verified')).toBeInTheDocument());
    expect(mocks.secretVerify).toHaveBeenCalledWith('local', '/vault', 'http://localhost:1234');
    expect(screen.getByTestId('ai-local-status-lmstudio')).toHaveTextContent(`${NS}.statusModelCount:2`);
    fireEvent.click(screen.getByTestId('ai-local-model'));
    fireEvent.click(screen.getByText('qwen3:8b'));
    await waitFor(() => expect(screen.getByTestId('ai-local-connected')).toBeInTheDocument());
    expect(window.localStorage.getItem('ontology-atlas:local-endpoint')).toContain('http://localhost:1234');
    expect(window.localStorage.getItem('ontology-atlas:local-endpoint')).toContain('qwen3:8b');
    expect(screen.getByTestId('ai-local-status-lmstudio')).toHaveAttribute('data-tone', 'success');
  });

  it('shows the saved runner with its model, grey until a Check counts what it has', async () => {
    window.localStorage.setItem('ontology-atlas:local-endpoint', JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'qwen3:8b' }));
    mocks.secretVerify.mockResolvedValue(verifyResult({ ok: true, httpStatus: 200, body: '{"data":[{"id":"qwen3:8b"},{"id":"gemma4:12b"},{"id":"phi4:14b"}]}' }));
    renderPanel(makeConnection());
    expect(screen.getByTestId('ai-local-status-ollama')).toHaveTextContent(`${NS}.statusSaved`);
    expect(screen.getByTestId('ai-local-status-ollama')).toHaveAttribute('data-tone', 'saved');
    // The model the conversation calls is named beside the runner's address.
    expect(screen.getByTestId('ai-local-connected')).toHaveTextContent('http://localhost:11434 · qwen3:8b');
    fireEvent.click(screen.getByTestId('ai-check-local-ollama'));
    await waitFor(() =>
      expect(screen.getByTestId('ai-local-status-ollama')).toHaveTextContent(`${NS}.statusConnected · ${NS}.statusModelCount:3`),
    );
    expect(screen.getByTestId('ai-local-status-ollama')).toHaveAttribute('data-tone', 'success');
    expect(mocks.secretVerify).toHaveBeenCalledWith('local', '/vault', 'http://localhost:11434');
  });

  it('tells an unreachable runner, a wrong program and an empty runner apart', async () => {
    const seen = new Map<string, string>();
    for (const [result, marker, tone] of [
      [verifyResult({ httpStatus: null, message: 'x' }), 'statusUnreachable', 'danger'],
      [verifyResult({ httpStatus: 404 }), 'statusNotCompatible', 'danger'],
      [verifyResult({ ok: true, httpStatus: 200, body: '{"data":[]}' }), 'statusNoModels', 'warning'],
    ] as const) {
      mocks.secretVerify.mockResolvedValue(result);
      const view = renderPanel(makeConnection());
      fireEvent.click(screen.getByTestId('ai-register-local-ollama'));
      fireEvent.click(screen.getByTestId('ai-verify-local'));
      await screen.findByTestId('ai-local-failure');
      const status = screen.getByTestId('ai-local-status-ollama');
      expect(status).toHaveTextContent(`${NS}.${marker}`);
      expect(status).toHaveAttribute('data-tone', tone);
      seen.set(marker, screen.getByTestId('ai-local-failure').textContent ?? '');
      view.unmount();
    }
    expect(new Set(seen.values()).size).toBe(3);
  });

  it('looking at another runner does not break the one in use', async () => {
    window.localStorage.setItem('ontology-atlas:local-endpoint', JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'qwen3:8b' }));
    mocks.secretVerify.mockResolvedValue(verifyResult({ ok: true, httpStatus: 200, body: '{"data":[{"id":"llama3"}]}' }));
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-local-llamacpp'));
    // Switching is stated before it happens.
    expect(screen.getByTestId('ai-local-one-at-a-time')).toHaveTextContent(`${NS}.localOneAtATime:${NS}.runnerOllama`);
    fireEvent.click(screen.getByTestId('ai-verify-local'));
    await waitFor(() => expect(screen.getByTestId('ai-local-verified')).toBeInTheDocument());
    expect(window.localStorage.getItem('ontology-atlas:local-endpoint')).toContain('qwen3:8b');
    expect(screen.getByTestId('ai-local-connected')).toBeInTheDocument();
  });

  it('keeps an embedding-only model out of first place and labels it', async () => {
    mocks.secretVerify.mockResolvedValue(
      verifyResult({ ok: true, httpStatus: 200, body: '{"data":[{"id":"embeddinggemma:latest"},{"id":"qwen3:8b"},{"id":"nomic-embed-text:latest"}]}' }),
    );
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-local-ollama'));
    fireEvent.click(screen.getByTestId('ai-verify-local'));
    const caption = await screen.findByTestId('ai-local-verified');
    expect(caption.textContent).toContain(`${NS}.localVerifiedWithEmbedding:1`);
    fireEvent.click(screen.getByTestId('ai-local-model'));
    const options = screen.getAllByRole('option').map((node) => node.textContent ?? '');
    expect(options[0]).toContain('qwen3:8b');
    expect(options).toHaveLength(3);
    expect(options[1]).toContain(`${NS}.localModelEmbeddingOnly`);
  });

  it('says "nothing leaves this computer" only for a loopback address', () => {
    window.localStorage.setItem('ontology-atlas:local-endpoint', JSON.stringify({ baseUrl: 'https://box.example.com:8080', model: 'qwen3:8b' }));
    renderPanel(makeConnection());
    // An address that is none of the defaults is the typed row.
    expect(screen.getByTestId('ai-local-status-custom')).toHaveTextContent(`${NS}.statusSaved`);
    fireEvent.click(screen.getByTestId('ai-change-local-custom'));
    expect(screen.getByText(/agents\.models\.localScopeRemote:box\.example\.com:8080/)).toBeInTheDocument();
    expect(screen.queryByText(/agents\.models\.localScopeLoopback/)).toBeNull();
  });
});

describe('Jev evidence check (experimental)', () => {
  it('adds a Jev key through the same field grammar and keeps it out of state', async () => {
    const applyJevStatus = vi.fn();
    mocks.jevSecretSet.mockResolvedValue({ stored: true, last4: '9x9x' });
    renderPanel(makeConnection({ applyJevStatus }));
    expect(screen.getByTestId('jev-key-status')).toHaveTextContent(`${NS}.statusNoKey`);
    // Without a key there is nothing to send, so there is no check to open.
    expect(screen.queryByTestId('jev-open-check')).toBeNull();
    fireEvent.click(screen.getByTestId('jev-register'));
    expect(screen.getByText(`${NS}.jev.pasteSafety:api.typesafe.ai`)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('ai-key-input-jev'), { target: { value: 'ts-secret-value' } });
    fireEvent.click(screen.getByTestId('ai-save-jev'));
    await waitFor(() => expect(applyJevStatus).toHaveBeenCalledWith({ stored: true, last4: '9x9x' }));
    expect(mocks.jevSecretSet).toHaveBeenCalledWith('ts-secret-value');
    expect(document.body.innerHTML).not.toContain('ts-secret-value');
  });

  it('shows the exact request before the send is possible, and sends only that', async () => {
    const refreshAudit = vi.fn();
    mocks.jevJudge.mockResolvedValue({
      choice: 'contradicted',
      confidence: 0.91,
      probabilities: { supported: 0.04, contradicted: 0.91, insufficient: 0.05 },
      responseModel: 'jev-1.13.0',
      loggedAt: 'x',
    });
    renderPanel(makeConnection({ jevStatus: { stored: true, last4: '9x9x' }, refreshAudit }));
    fireEvent.click(screen.getByTestId('jev-open-check'));
    const send = screen.getByTestId('jev-send');
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByTestId('jev-claim'), { target: { value: 'A refund request immediately restores inventory.' } });
    fireEvent.change(screen.getByTestId('jev-evidence'), { target: { value: 'After refund approval, a stock-restoration job is queued.' } });
    const expected = buildJevPayload(
      'A refund request immediately restores inventory.',
      'After refund approval, a stock-restoration job is queued.',
    );
    // On screen, unfolded, before the press.
    expect(screen.getByTestId('jev-request-preview')).toHaveTextContent(expected);
    expect(screen.getByTestId('jev-request-preview')).toBeVisible();
    expect(mocks.jevJudge).not.toHaveBeenCalled();
    fireEvent.click(send);
    await waitFor(() => expect(screen.getByTestId('jev-result')).toHaveAttribute('data-choice', 'contradicted'));
    expect(mocks.jevJudge).toHaveBeenCalledWith('/vault', expected);
    // Advice, not acceptance — and the sent log moves.
    expect(screen.getByTestId('jev-result')).toHaveTextContent(`${NS}.jev.advisory`);
    expect(refreshAudit).toHaveBeenCalled();
  });

  it('holds the text still while a request is out, so the answer sits under what it judged', async () => {
    let answer: (value: unknown) => void = () => {};
    mocks.jevJudge.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    renderPanel(makeConnection({ jevStatus: { stored: true, last4: '9x9x' } }));
    fireEvent.click(screen.getByTestId('jev-open-check'));
    expect(screen.getByTestId('jev-send-blocked')).toHaveTextContent(`${NS}.jev.needBoth`);
    fireEvent.change(screen.getByTestId('jev-claim'), { target: { value: 'claim' } });
    fireEvent.change(screen.getByTestId('jev-evidence'), { target: { value: 'evidence' } });
    expect(screen.queryByTestId('jev-send-blocked')).toBeNull();
    fireEvent.click(screen.getByTestId('jev-send'));
    await waitFor(() => expect(screen.getByTestId('jev-claim')).toHaveAttribute('readonly'));
    expect(screen.getByTestId('jev-evidence')).toHaveAttribute('readonly');
    expect(screen.getByTestId('jev-send')).toBeDisabled();
    answer({
      choice: 'supported',
      confidence: 0.8,
      probabilities: { supported: 0.8, contradicted: 0.1, insufficient: 0.1 },
      responseModel: 'jev-1.13.0',
      loggedAt: 'x',
    });
    await waitFor(() => expect(screen.getByTestId('jev-result')).toHaveAttribute('data-choice', 'supported'));
    expect(screen.getByTestId('jev-claim')).not.toHaveAttribute('readonly');
    // The caveats sit on the answer they qualify.
    expect(screen.getByTestId('jev-result')).toHaveTextContent(`${NS}.jev.experimentalNote`);
  });

  it('will not send without a folder to record the transfer in', () => {
    renderPanel(makeConnection({ jevStatus: { stored: true, last4: '9x9x' } }), null);
    fireEvent.click(screen.getByTestId('jev-open-check'));
    fireEvent.change(screen.getByTestId('jev-claim'), { target: { value: 'claim' } });
    fireEvent.change(screen.getByTestId('jev-evidence'), { target: { value: 'evidence' } });
    expect(screen.getByTestId('jev-send')).toBeDisabled();
    expect(screen.getByText(`${NS}.jev.needVault`)).toBeInTheDocument();
  });

  it('builds the request the Rust bridge accepts — one shared fixture', () => {
    const fixture = readFileSync(join(process.cwd(), 'tests/fixtures/jev-request.sample.json'), 'utf8').trim();
    expect(
      buildJevPayload(
        'A refund request immediately restores inventory.',
        'After refund approval, a stock-restoration job is queued.',
      ),
    ).toBe(fixture);
  });
});

describe('sent log', () => {
  const entry: LlmAuditEntry = {
    v: 1,
    at: '2026-07-26T09:12:33.120Z',
    provider: 'jev',
    host: 'api.typesafe.ai',
    model: 'jev-latest',
    purpose: 'judgment',
    question: null,
    scope: { nodes: [], promptChars: 400, vaultChars: 57 },
    tools: null,
    payloadSha256: 'e3b0',
    outcome: 'ok',
    httpStatus: 200,
    responseChars: 42,
    durationMs: 640,
  };

  it('is not ashamed of an empty log — nothing sent is the promise kept', () => {
    renderPanel(makeConnection());
    expect(screen.getByTestId('ai-audit-count')).toHaveTextContent(`${NS}.auditEmpty`);
    expect(screen.queryAllByTestId('ai-audit-row')).toHaveLength(0);
  });

  it('states the whole count and lists the newest lines with their scope and purpose', () => {
    renderPanel(makeConnection({ auditEntries: [entry], auditTotal: 12 }));
    expect(screen.getByTestId('ai-audit-count')).toHaveTextContent(`${NS}.auditSummary:12`);
    const rows = screen.getAllByTestId('ai-audit-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('api.typesafe.ai');
    expect(rows[0]).toHaveTextContent(`${NS}.auditPurposeJudgment`);
    // Jev reads no file: the row counts what the person pasted, never "folder characters".
    expect(rows[0]).toHaveTextContent(`${NS}.auditScopePasted:400`);
    expect(rows[0]).not.toHaveTextContent(`${NS}.auditScope:`);
  });

  it('offers to show the log file only once there is one, and selects that file', () => {
    const empty = renderPanel(makeConnection());
    expect(screen.queryByTestId('ai-audit-open')).toBeNull();
    empty.unmount();
    renderPanel(makeConnection({ auditEntries: [entry], auditTotal: 1 }));
    fireEvent.click(screen.getByTestId('ai-audit-open'));
    expect(mocks.reveal).toHaveBeenCalledWith('/vault', '.ontology-atlas/llm-audit.jsonl');
  });

  it('says nothing about the count before the log has been read', () => {
    renderPanel(makeConnection({ auditTotal: null }));
    expect(screen.queryByTestId('ai-audit-count')).toBeNull();
    expect(screen.getByTestId('ai-audit-reading')).toBeEmptyDOMElement();
  });

  it('names the file the record lives in, mono on the path only', () => {
    renderPanel(makeConnection({ auditEntries: [entry], auditTotal: 1 }));
    const path = screen.getByText('.ontology-atlas/llm-audit.jsonl');
    expect(path.className).toContain('font-mono');
    expect(path.parentElement?.className ?? '').not.toContain('font-mono');
  });

  it('says where the record would go when no folder is open', () => {
    renderPanel(makeConnection(), null);
    expect(screen.getByTestId('ai-audit-no-vault')).toHaveTextContent(`${NS}.auditNoVault`);
    expect(screen.queryByTestId('ai-audit-open')).toBeNull();
  });
});

describe('focus, announcements and abandoned checks', () => {
  it('announces a check once through the panel, not through eight live statuses', async () => {
    mocks.secretVerify.mockResolvedValue({ provider: 'anthropic', ok: true, denied: false, httpStatus: 200, message: null, durationMs: 1, loggedAt: 'x' });
    renderPanel(makeConnection({ statuses: STORED_ANTHROPIC }));
    expect(document.querySelectorAll('[data-testid="ai-connection-view"] [role="status"]')).toHaveLength(0);
    fireEvent.click(screen.getByTestId('ai-verify-anthropic'));
    await waitFor(() =>
      expect(screen.getByTestId('models-announcer')).toHaveTextContent(`${NS}.providerAnthropic · ${NS}.statusConnected`),
    );
    expect(screen.getByTestId('models-announcer')).toHaveAttribute('aria-live', 'polite');
  });

  it('hands focus back to the opener when a save closes the row', async () => {
    mocks.secretSet.mockResolvedValue({ provider: 'openai', stored: true, last4: 'wxyz' });
    const view = renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-openai'));
    fireEvent.change(screen.getByTestId('ai-key-input-openai'), { target: { value: 'sk-x' } });
    fireEvent.click(screen.getByTestId('ai-save-openai'));
    // The parent now holds a stored key: the opener became Replace, and focus lands on it.
    view.rerender(
      <ModelConnectionsPanel
        connection={makeConnection({ statuses: { anthropic: null, openai: { provider: 'openai', stored: true, last4: 'wxyz' }, gemini: null } })}
        vaultRootPath="/vault"
        downloadHref="/download/"
      />,
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('ai-replace-openai')));
  });

  it('checking another address from the runner in use saves nothing', async () => {
    window.localStorage.setItem('ontology-atlas:local-endpoint', JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'qwen3:8b' }));
    mocks.secretVerify.mockResolvedValue(verifyResult({ ok: true, httpStatus: 200, body: '{"data":[{"id":"llama3"}]}' }));
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-change-local-ollama'));
    // The open row has one check: the header's stands aside while the row is open.
    expect(screen.queryByTestId('ai-check-local-ollama')).toBeNull();
    fireEvent.change(screen.getByTestId('ai-local-url'), { target: { value: 'http://localhost:1234' } });
    fireEvent.click(screen.getByTestId('ai-verify-local'));
    await waitFor(() => expect(screen.getByTestId('ai-local-verified')).toBeInTheDocument());
    expect(JSON.parse(window.localStorage.getItem('ontology-atlas:local-endpoint') ?? '{}')).toEqual({
      baseUrl: 'http://localhost:11434',
      model: 'qwen3:8b',
    });
    // The header still speaks for its own address, which nobody checked.
    expect(screen.getByTestId('ai-local-status-ollama')).toHaveTextContent(`${NS}.statusSaved`);
  });

  it('an abandoned check of another port does not stick to the row', async () => {
    mocks.secretVerify.mockResolvedValue(verifyResult({ httpStatus: null, message: 'refused' }));
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-local-ollama'));
    fireEvent.change(screen.getByTestId('ai-local-url'), { target: { value: 'http://localhost:11435' } });
    fireEvent.click(screen.getByTestId('ai-verify-local'));
    await screen.findByTestId('ai-local-failure');
    // The row's own address was not the one asked.
    expect(screen.getByTestId('ai-local-status-ollama')).toHaveTextContent(`${NS}.statusNotConnected`);
    fireEvent.click(screen.getByTestId('ai-cancel-local'));
    await waitFor(() => expect(screen.queryByTestId('ai-local-url')).toBeNull());
    fireEvent.click(screen.getByTestId('ai-register-local-ollama'));
    expect((screen.getByTestId('ai-local-url') as HTMLInputElement).value).toBe('http://localhost:11434');
    expect(screen.queryByTestId('ai-local-failure')).toBeNull();
  });
});

describe('Escape order', () => {
  it('leaves the row open when an inner control already handled the Escape', () => {
    render(<ModelConnectionsPanel connection={makeConnection()} vaultRootPath="/vault" downloadHref="/download/" />);
    fireEvent.click(screen.getByTestId('ai-register-openai'));
    const input = screen.getByTestId('ai-key-input-openai');
    input.addEventListener('keydown', (event) => event.preventDefault());
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByTestId('ai-detail-openai')).toHaveAttribute('data-state', 'open');
  });

  it('collapses the open row without letting an outer layer see it', () => {
    const outerEscape = vi.fn();
    render(
      <div onKeyDown={(event) => event.key === 'Escape' && outerEscape()}>
        <ModelConnectionsPanel connection={makeConnection()} vaultRootPath="/vault" downloadHref="/download/" />
      </div>,
    );
    fireEvent.click(screen.getByTestId('ai-register-openai'));
    fireEvent.keyDown(screen.getByTestId('ai-key-input-openai'), { key: 'Escape' });
    expect(screen.getByTestId('ai-detail-openai')).toHaveAttribute('data-state', 'closed');
    expect(outerEscape).not.toHaveBeenCalled();
  });

  it('passes Escape up when no row is open', () => {
    const outerEscape = vi.fn();
    render(
      <div onKeyDown={(event) => event.key === 'Escape' && outerEscape()}>
        <ModelConnectionsPanel connection={makeConnection()} vaultRootPath="/vault" downloadHref="/download/" />
      </div>,
    );
    fireEvent.keyDown(screen.getByTestId('ai-connection-view'), { key: 'Escape' });
    expect(outerEscape).toHaveBeenCalledTimes(1);
  });
});
