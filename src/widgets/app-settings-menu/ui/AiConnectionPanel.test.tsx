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
 * Web degradation — a browser has nowhere safe to keep a key. Rather than failing
 * silently or hiding, it builds no input field at all and explains why.
 */
describe('AiConnectionPanel web degradation', () => {
  it('renders no key input at all when the desktop bridge is absent', () => {
    renderPanel(makeConnection({ bridgeAvailable: false }));
    expect(screen.getByTestId('ai-connection-web-degraded')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-key-input-anthropic')).toBeNull();
    expect(screen.queryByTestId('ai-key-input-openai')).toBeNull();
    expect(screen.queryByTestId('ai-key-input-gemini')).toBeNull();
    // Not even a collapsed row — a browser has no place to receive a key.
    expect(screen.queryByTestId('ai-register-anthropic')).toBeNull();
    expect(screen.queryByTestId('ai-verify-anthropic')).toBeNull();
    // The same holds for the key-less path (connect by address) — and **why that
    // does not work either** is stated separately. Without it the degradation is only
    // half honest: it reads as "if keys are the problem, then key-less Ollama works".
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
 * Collapsing unregistered rows — with three vendors, three permanently visible
 * password inputs make the settings sheet a form gate. A collapsed row still states
 * the "unregistered" status and only sheds visual weight.
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

    // Opening another row collapses the previous one — the screen must show exactly
    // one key so the safety copy beside the paste field is unambiguous. The collapse
    // starts **in the same frame** (data-state) and leaves the DOM when the transition ends.
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
    // The exposure window collapsing creates — the row collapses but the component
    // lives on, so a key pasted and abandoned could disappear from the screen while
    // remaining in state. The user believes they gave up, and "on screen only until
    // saved" is broken.
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
    // An input still open right after a save or delete reads as the screen pressing
    // you to enter another one.
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

    // The parent holds statuses, so this render returns to the collapsed row.
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
    // The only moment the full key exists in screen state ends with the save.
    expect(document.body.innerHTML).not.toContain('sk-ant-secret-value');

    // Re-expanding the row leaves it empty — the input collapsing out of sight and
    // the state being cleared are different facts, and it is the latter that has to
    // be confirmed here.
    fireEvent.click(screen.getByTestId('ai-register-anthropic'));
    expect(
      (screen.getByTestId('ai-key-input-anthropic') as HTMLInputElement).value,
    ).toBe('');
  });

  it('confirms a save in words as well as in the row itself', async () => {
    // The row changing itself is the primary evidence, but that change may be off
    // screen or the eye may be elsewhere. Words confirm it too, symmetric with
    // clearing (`cleared`) — with only one of the two, "I pressed it, so what
    // happened?" remains.
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
    // The screen-side face of log-before-send: with nowhere to log, there is no sending either.
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
    // Charter ⑥ — for a named vendor the only claim we can prove is "it only goes to
    // the official address hard-coded here". Naming that address is the whole of the claim.
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
    // A denied call was logged too — the log surface is re-read immediately.
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
    // If the screen read only 401/403 as denial, a Gemini user entering a wrong key
    // sees "could not verify" and thinks the app is broken (measured 2026-07-26:
    // Gemini answers a wrong key with 400 `API_KEY_INVALID`).
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
    // A connection-check line has no `tools` field — the position the reader reads as null.
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
    // A whole line in mono widens Hangul word gaps, which the owner read as double
    // spaces. A path is a machine string, so mono is information there — the sentence
    // beside it is not.
    renderPanel(makeConnection({ auditEntries: [entry] }));
    const path = screen.getByText('.ontology-atlas/llm-audit.jsonl');
    expect(path.className).toContain('font-mono');
    expect(path.parentElement?.className ?? '').not.toContain('font-mono');
  });
});

/**
 * A reversible expansion — the way out for someone who pressed [키 등록] and enters
 * nothing. Owner report from measurement (2026-07-26): "입력 안하고 닫고싶을수도
 * 있잖아?" (you might want to close it without entering anything). At the time the
 * expanded card had only [저장] and no way to collapse it on screen.
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

    // Undoing starts **in that frame** — no confirmation dialog, no delay.
    expect(screen.getByTestId('ai-detail-openai')).toHaveAttribute(
      'data-state',
      'closed',
    );
    // The draft does not wait for the transition. The component is kept alive 180ms
    // longer so the collapse is visible, but stretching "a pasted key is on screen
    // only until it is saved" by that much would be shaving the promise to buy a motion.
    expect(document.body.innerHTML).not.toContain('sk-openai-abandoned');
    expect(screen.getByTestId('ai-register-openai')).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByTestId('ai-key-input-openai')).toBeNull());
  });

  it('keeps the collapsing region out of tab order the moment it starts closing', () => {
    // The price of an exit motion is not paid in accessibility — an invisible input
    // must not stay in tab order and the screen reader for 180ms.
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-openai'));
    expect(screen.getByTestId('ai-detail-openai')).not.toHaveAttribute('inert');

    fireEvent.click(screen.getByTestId('ai-cancel-openai'));
    expect(screen.getByTestId('ai-detail-openai')).toHaveAttribute('inert');
  });

  it('sends the row out the same way it came in — one surface, two states', () => {
    // For the way out to differ from the way in there have to be two surfaces. With
    // one, there is nowhere for a direction-specific curve to live.
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
    // That the three siblings are one list reads as "only the expanded row grows
    // downward". A replaced header is not growth but a swap for something else.
    renderPanel(makeConnection());
    const trigger = screen.getByTestId('ai-register-openai');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(screen.getByTestId('ai-register-openai')).toBe(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('honours the aria-expanded promise — the trigger closes what it opened', () => {
    // Declaring `aria-expanded` and then having the second click do nothing makes the
    // promise to a screen-reader user a lie.
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
    // Focus falling to body loses the user's place, and it also kills the outer
    // dialog's Esc order (subview → root → close).
    renderPanel(makeConnection());
    fireEvent.click(screen.getByTestId('ai-register-openai'));
    fireEvent.click(screen.getByTestId('ai-cancel-openai'));

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId('ai-register-openai')),
    );
  });

  it('lets Escape collapse the row without letting the settings sheet see it', () => {
    // The innermost rung of the Esc order. Without interception the same keypress
    // retreats the settings sheet all the way to the root view, so someone cancelling
    // one key loses the subview too.
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

    // Exactly the same path as the button — Esc also begins collapsing in that frame.
    expect(screen.getByTestId('ai-detail-openai')).toHaveAttribute(
      'data-state',
      'closed',
    );
    expect(outerEscape).not.toHaveBeenCalled();
  });

  it('passes Escape up to the sheet when no row is expanded', () => {
    // The next rung of the order has to stay alive — swallowing it even when the
    // inner rung is empty makes Esc dead in the settings subview.
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
 * Visual hierarchy — the only filled bordered box is the block you operate (the
 * vendor list). With all three stacked at equal weight, the reason people came here
 * (registering a key) is not what reads first.
 */
describe('AiConnectionPanel hierarchy', () => {
  it('gives the filled container to the vendor list and to nothing else', () => {
    const { container } = renderPanel(makeConnection());
    const filled = container.querySelectorAll('.bg-\\[color\\:var\\(--color-overlay-1\\)\\]');
    expect(filled).toHaveLength(1);
    expect(filled[0]).toContainElement(screen.getByTestId('ai-register-anthropic'));
  });

  it('keeps every trust fact on screen while demoting its weight', () => {
    // Whether the hierarchy adjustment leaked into deleting information — the
    // charter line, the three "what goes out" rows and the log file name must all remain.
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
   * 「what do I get if I connect」 comes before 「how do I connect」 — while that
   * sentence sat as a footnote below the list, the footnote was denying an
   * **already-shipped agent** as "coming soon" and invalidating the CTA that sent
   * people here (`vaultAgentPanel.degraded.noKeyAction`).
   */
  it('연결이 무엇을 여는지를 벤더 목록보다 먼저 말한다', () => {
    const { container } = renderPanel(makeConnection());
    const unlocks = screen.getByTestId('ai-what-it-unlocks');
    const list = container.querySelector('.bg-\\[color\\:var\\(--color-overlay-1\\)\\]');
    expect(unlocks).toBeInTheDocument();
    expect(list).not.toBeNull();
    // DOM order is reading order.
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
 * The fourth row — the path where you enter an **address** rather than a key.
 *
 * Three things are held here: ① each failure reason gets its own sentence (not
 * running · wrong port · no such model), ② the model is chosen from a list rather
 * than typed by hand, and ③ the transmission-scope copy says "nothing leaves this
 * computer" only on loopback.
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
    // Standing up a second box would give this panel two attention winners and collapse the hierarchy.
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
    // The address is passed **only through the address path** — the same contract Rust
    // enforces by rejecting an address on a keychain vendor has to hold on screen too.
    expect(mocks.secretVerify).toHaveBeenCalledWith('local', '/vault', 'http://localhost:11434');
    // The model field appears only once there is something to choose.
    expect(screen.getByTestId('ai-local-model-row')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ai-local-model'));
    fireEvent.click(screen.getByText('qwen3:8b'));
    await waitFor(() => expect(screen.getByTestId('ai-local-connected')).toBeInTheDocument());
    // The choice persists in this browser, so the map's right dock comes alive without a reload.
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
    // Three distinct sentences are what tell the user what to do next.
    expect(seen.size).toBe(3);
  });

  it('"이 컴퓨터 밖으로 안 나간다" 는 루프백일 때만 말한다', async () => {
    // A user may point at another machine over https (which is allowed). Writing that
    // sentence where it is not true makes this product's whole trust story a lie.
    window.localStorage.setItem(
      'ontology-atlas:local-endpoint',
      JSON.stringify({ baseUrl: 'https://box.example.com:8080', model: 'qwen3:8b' }),
    );
    renderPanel(makeConnection());
    expect(screen.getByText(/settings\.ai\.localScopeRemote/)).toBeInTheDocument();
    expect(screen.queryByText(/settings\.ai\.localScopeLoopback/)).toBeNull();
  });

  /**
   * Alphabetical order put `embeddinggemma:latest` first, and the owner actually
   * chose it and had it saved as 「연결됨」 — **a state that will fail on the first
   * question was displayed as success.** It is fixed by ordering and annotation, not
   * by deletion (labelling is not hiding).
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
    // The first entry is one that can hold a conversation.
    expect(options[0]).toContain('qwen3:8b');
    // The two embedding models do not disappear — saying they are absent is the bigger lie.
    expect(options).toHaveLength(3);
    // Only the unusable rows state that fact on a second line.
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
