'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { JevCheck } from '@/features/jev-judgment';
import {
  secretClear,
  secretErrorMessage,
  secretSet,
  secretVerify,
  LOCAL_PROVIDER,
  SECRET_PROVIDERS,
  SECRET_PROVIDER_HOSTS,
  type SecretProvider,
  type SecretStatus,
} from '@/shared/lib/tauri-secrets';
import {
  JEV_DESTINATION,
  jevSecretClear,
  jevSecretSet,
  type JevSecretStatus,
} from '@/shared/lib/tauri-jev';
import { useNativeErrorLookup } from '@/shared/lib/use-native-error-lookup';
import {
  clearLocalEndpoint,
  countChatCapableModels,
  hostOfBaseUrl,
  isEmbeddingOnlyModel,
  isLocalEndpointReady,
  readLocalEndpoint,
  readLocalVerdict,
  writeLocalEndpoint,
  type LocalEndpointSettings,
  type LocalVerifyReason,
} from '@/shared/lib/local-endpoint';
import type { LlmAuditEntry } from '@/shared/lib/llm-audit-log';
import { LLM_AUDIT_LOG_RELATIVE_PATH } from '@/shared/lib/llm-audit-log';
import { getTauriVaultRootPath, revealTauriVaultFile } from '@/shared/lib/tauri-vault-fs';
import { useLocalVault } from '@/entities/vault-session';
import { buildRouteFocusHref, rememberRouteFocusIntent } from '@/shared/ui/route-focus-manager';
import { controlClass, fieldClass } from '@/shared/ui/control-class';
import { Chip } from '@/shared/ui/controls';
import { EmptyState } from '@/shared/ui/empty-state';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { Download } from 'lucide-react';
import { Select } from '@/shared/ui/select';
import { cn } from '@/shared/lib/cn';
import { useRowDisclosure } from '@/shared/lib/use-row-disclosure';
import { AI_PROVIDER_LABEL_KEY } from '../model/ai-providers';
import {
  LOCAL_RUNNERS,
  normalizeRunnerBaseUrl,
  runnerForBaseUrl,
  type LocalRunner,
  type LocalRunnerId,
} from '../model/local-runners';
import { useAiConnection, type AiConnectionState } from '../model/use-ai-connection';
import { SettingsGroupHeading } from './settings-primitives';

/**
 * The Agents destination's **models tab** (owner, 2026-09-25): which model Atlas's own
 * conversation calls, and with whose key. It moved here whole from the settings sheet's API Key
 * pane; the sheet keeps one pointer row and nothing else, so no fact is stated in two places.
 *
 * Owner-approved layout, top to bottom:
 *
 *   Local models   Ollama  http://localhost:11434   ● connected · N models  [Check]
 *                  LM Studio http://localhost:1234   ○ not connected         [Connect]
 *   API keys       OpenAI   ● ····4f2                                        [Check][Replace]
 *                  Anthropic ○ no key                                         [Add]
 *   External check Jev evidence check  (experimental)  ○ no key               [Add]
 *   Sent log       N transfers · all recorded in this folder                  [Show in Finder]
 *
 * What this screen holds to:
 * - **There is no path that redraws a full key.** A draft lives only in `KeyDraftForm`, which
 *   unmounts when its row collapses; after a save the screen knows only `last4`.
 * - **Honest web degradation.** With no bridge it renders no input field at all, says why, and
 *   links to the app. It shows no example rows either: a sample key row would be fake data.
 * - **A status is a fact the screen checked, or it says so.** Nothing is probed on arrival: every
 *   request is a line in the sent log, and this screen sends nothing on its own. A runner nobody
 *   checked reads "not connected", never "off"; a saved runner or key reads "saved" in grey until
 *   a check turns it green.
 * - **Looking never breaks what works.** Checking an address saves nothing unless it is the saved
 *   address; a different runner becomes the conversation's only when a model is picked there.
 * - **One row open at a time, every opening reversible**, and every way a row closes (Cancel,
 *   Esc, save, remove, pick) hands focus back to the control that opened it.
 * - **One control grammar.** Every trailing control is a `Chip` at the row size (`lg`); the
 *   status beside it is a dot on the status tokens plus a word, never colour alone. Results are
 *   announced once through one polite live region, not by eight live statuses.
 */

const CLEAR_ARM_MS = 3000;

/** The quiet trailing control every row uses (check, replace, cancel, disconnect). */
const ROW_CHIP =
  'shrink-0 border-[color:var(--color-border-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset';

/** The indigo emphasis for the one control that commits (save, check an address). */
const COMMIT_CHIP =
  'shrink-0 border-[color:var(--color-indigo-line-a32)] hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-line-a13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset';

type RowKey = `key:${SecretProvider}` | `local:${LocalRunnerId}` | 'jev:key' | 'jev:check';

type VerifyState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'denied'; status: number | null }
  | { kind: 'failed'; message: string };

/** A runner check remembers **which address** it asked, so a result never lands on another. */
type LocalVerifyState =
  | { kind: 'idle' }
  | { kind: 'checking'; url: string }
  | { kind: 'done'; url: string; reason: LocalVerifyReason; models: string[]; detail: string };

/**
 * The status grammar, one meaning per mark: hollow = nothing here, filled grey = saved but not
 * checked in this visit, green = checked and working, amber = answered with nothing to use,
 * red = checked and failed.
 */
type StatusTone = 'success' | 'saved' | 'warning' | 'danger' | 'idle';

/** Announce one sentence through the panel's single polite live region. */
type Announce = (message: string) => void;

function sameAddress(a: string, b: string): boolean {
  return normalizeRunnerBaseUrl(a) === normalizeRunnerBaseUrl(b);
}

/**
 * A control that turns `disabled` while it works drops focus to `<body>` in Chromium and WebKit.
 * After the work, put focus back on it — but only if nothing else took focus meanwhile.
 */
function refocusIfLost(ref: RefObject<HTMLElement | null>) {
  window.setTimeout(() => {
    const active = document.activeElement;
    if (!active || active === document.body) ref.current?.focus({ preventScroll: true });
  }, 0);
}

export interface ModelConnectionsPanelProps {
  connection: AiConnectionState;
  /** The vault's absolute path where known on the desktop — where every transfer is recorded. */
  vaultRootPath: string | null;
  downloadHref: string;
  onDownloadNavigate?: () => void;
}

export function ModelConnectionsPanel({
  connection,
  vaultRootPath,
  downloadHref,
  onDownloadNavigate,
}: ModelConnectionsPanelProps) {
  const t = useTranslations('agents.models');
  const {
    bridgeAvailable,
    statuses,
    applyStatus,
    jevStatus,
    applyJevStatus,
    keysRead,
    auditEntries,
    auditTotal,
    refreshAudit,
  } = connection;
  const [expanded, setExpanded] = useState<RowKey | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [local, setLocal] = useState<LocalEndpointSettings>(() => readLocalEndpoint());
  const [announcement, setAnnouncement] = useState('');

  /**
   * Close a row and hand focus back to its opener. Every way a row closes goes through here, so
   * none of them drops the reader's place on `<body>`. The opener is found by the row's key, not
   * its test id: a row's opener changes from Add to Replace the moment a key is saved.
   */
  const collapse = useCallback((key: RowKey) => {
    setExpanded((current) => (current === key ? null : current));
    window.setTimeout(() => {
      rootRef.current
        ?.querySelector<HTMLButtonElement>(`[data-row-opener="${key}"]`)
        ?.focus({ preventScroll: true });
    }, 0);
  }, []);

  /**
   * **Every outcome on this tab is said by its row, and read out here — never in a toast**
   * (2026-09-26). Saving, replacing or removing a key and choosing or dropping a runner each
   * change the row they were pressed in (its status, its last four, its buttons). They also
   * raised a toast repeating it, and on this tall page the toast had no free place to stand:
   * measured on a real folder it covered the sent-log caption at 1512x949, and the Jev row's name
   * and caption at 1280x800. The row is the confirmation; the announcer carries it to a screen
   * reader.
   */
  const announce = useCallback<Announce>((message) => {
    // Cleared first, so the same sentence twice in a row is still read twice.
    setAnnouncement('');
    window.setTimeout(() => setAnnouncement(message), 60);
  }, []);

  if (!bridgeAvailable) {
    /*
     * The same empty-state shape the Agents tab wears on the web (title that says why, what still
     * holds, and the app as the one filled press), so the two tabs read as one destination. No
     * sample rows: a key or runner drawn here would be data this browser does not have.
     */
    return (
      <div className="grid min-w-0 content-start gap-3" data-testid="ai-connection-view">
        <div data-testid="ai-connection-web-degraded">
          <EmptyState
            tone="solid"
            className="rounded-card border-[color:var(--color-border-soft)]"
            title={t('webDegradedTitle')}
            description={
              <>
                <span className="block">{t('webDegradedBody')}</span>
                {/* Why key-less runners do not work here either: without it the card reads as
                    "if keys are the problem, then key-less Ollama must work". */}
                <span className="mt-1.5 block" data-testid="ai-connection-web-degraded-local">
                  {t('webDegradedLocalBody')}
                </span>
              </>
            }
            action={
              <Link
                href={downloadHref}
                onClick={onDownloadNavigate}
                data-testid="ai-connection-download-link"
                className={controlClass({
                  shape: 'pill',
                  size: 'lg',
                  tone: 'onAccent',
                  className:
                    'atlas-touch-floor atlas-touch-floor-wide gap-1.5 focus-visible:ring-[color:var(--color-text-primary)]',
                })}
              >
                <Download size={ICON_SIZE.md} aria-hidden />
                {t('webDegradedCta')}
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const activeRunner: LocalRunnerId | null = isLocalEndpointReady(local)
    ? runnerForBaseUrl(local.baseUrl)
    : null;

  return (
    <div
      ref={rootRef}
      className="grid min-w-0 content-start gap-6"
      data-testid="ai-connection-view"
      onKeyDown={(event) => {
        // Esc collapses the open row first and stops there. An Esc an inner control already
        // handled (the model list closing itself) is not a second request to close the row.
        if (event.key !== 'Escape' || expanded === null || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        collapse(expanded);
      }}
    >
      <ModelGroup label={t('localTitle')} hint={t('localTitleHint')} testId="models-local">
        {LOCAL_RUNNERS.map((runner) => (
          <LocalRunnerRow
            key={runner.id}
            runner={runner}
            local={local}
            activeRunner={activeRunner}
            vaultRootPath={vaultRootPath}
            expanded={expanded === `local:${runner.id}`}
            onExpand={() => setExpanded(`local:${runner.id}`)}
            onCollapse={() => collapse(`local:${runner.id}`)}
            onSettings={setLocal}
            onVerified={refreshAudit}
            announce={announce}
          />
        ))}
      </ModelGroup>

      <ModelGroup label={t('keysTitle')} hint={t('keysTitleHint')} testId="models-keys">
        {SECRET_PROVIDERS.map((provider) => (
          <KeyRow
            key={provider}
            provider={provider}
            status={statuses[provider]}
            read={keysRead}
            vaultRootPath={vaultRootPath}
            expanded={expanded === `key:${provider}`}
            onExpand={() => setExpanded(`key:${provider}`)}
            onCollapse={() => collapse(`key:${provider}`)}
            onStatus={(next) => {
              applyStatus(provider, next);
              collapse(`key:${provider}`);
            }}
            onVerified={refreshAudit}
            announce={announce}
          />
        ))}
      </ModelGroup>

      <ModelGroup label={t('externalTitle')} testId="models-external">
        <JevRow
          status={jevStatus}
          read={keysRead}
          vaultRootPath={vaultRootPath}
          mode={expanded === 'jev:key' ? 'key' : expanded === 'jev:check' ? 'check' : null}
          onMode={(mode) => setExpanded(mode === 'key' ? 'jev:key' : 'jev:check')}
          onCollapse={(mode) => collapse(mode === 'key' ? 'jev:key' : 'jev:check')}
          onStatus={(next) => {
            applyJevStatus(next);
            collapse('jev:key');
          }}
          onSent={refreshAudit}
          announce={announce}
        />
      </ModelGroup>

      <AuditSection entries={auditEntries} total={auditTotal} vaultRootPath={vaultRootPath} />

      <p className="sr-only" aria-live="polite" data-testid="models-announcer">
        {announcement}
      </p>
    </div>
  );
}

/** A named group of rows: the eyebrow and its one-line hint above one bordered list. */
function ModelGroup({
  label,
  hint,
  testId,
  children,
}: {
  label: string;
  hint?: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className="min-w-0" data-testid={testId}>
      <SettingsGroupHeading
        label={label}
        trailing={
          hint ? <span className="text-label text-[color:var(--color-text-tertiary)]">{hint}</span> : undefined
        }
      />
      <div className="mt-1.5 divide-y divide-[color:var(--color-divider)] overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
        {children}
      </div>
    </section>
  );
}

/**
 * One row's anatomy: a fixed header band (name, one caption, status, controls) and a detail area
 * under it that opens and closes on the shared disclosure curve. The header never changes shape
 * between states, so opening reads as the row growing, not as a row being swapped.
 */
function ModelRow({
  testId,
  name,
  badge,
  caption,
  captionTone = 'neutral',
  status,
  actions,
  detailOpen,
  detailTestId,
  detail,
}: {
  testId: string;
  name: string;
  badge?: ReactNode;
  caption?: ReactNode;
  captionTone?: 'neutral' | 'danger';
  status: ReactNode;
  actions: ReactNode;
  detailOpen: boolean;
  detailTestId: string;
  detail: ReactNode;
}) {
  const { mounted, boxRef, contentRef } = useRowDisclosure(detailOpen);
  return (
    <div data-testid={testId}>
      <div className="flex min-h-14 min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
        <div className="min-w-0 flex-1 basis-44">
          <p className="flex flex-wrap items-baseline gap-x-2 text-body text-[color:var(--color-text-primary)]">
            {name}
            {badge}
          </p>
          {caption ? (
            <p
              className={cn(
                'mt-0.5 text-label leading-label [overflow-wrap:anywhere]',
                captionTone === 'danger'
                  ? 'text-[color:var(--color-danger-text)]'
                  : 'text-[color:var(--color-text-tertiary)]',
              )}
            >
              {caption}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          {status}
          {actions}
        </div>
      </div>
      <div
        ref={boxRef}
        className="ai-row-disclosure"
        data-state={detailOpen ? 'open' : 'closed'}
        data-testid={detailTestId}
        // Disabled the moment it starts closing, so an invisible input never sits in the tab order.
        inert={!detailOpen}
      >
        {mounted ? (
          <div ref={contentRef} className="ai-row-disclosure-body grid gap-2 px-3 pb-3">
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A status: a dot on the status tokens and a word. The word carries the meaning; the dot is
 * redundant on purpose. Not a live region: eight rows announcing themselves on arrival is noise,
 * so results are announced once by the panel.
 */
function RowStatus({
  tone,
  children,
  testId,
}: {
  tone: StatusTone;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      data-tone={tone}
      className={cn(
        'ai-row-swap inline-flex min-w-0 items-center gap-1.5 text-label',
        tone === 'danger'
          ? 'text-[color:var(--color-danger-text)]'
          : tone === 'warning'
            ? 'text-[color:var(--color-status-warning)]'
            : tone === 'success'
              ? 'text-[color:var(--color-success-text-a90)]'
              : tone === 'saved'
                ? 'text-[color:var(--color-text-secondary)]'
                : 'text-[color:var(--color-text-tertiary)]',
      )}
    >
      <StatusDot tone={tone} />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

function StatusDot({ tone }: { tone: StatusTone }) {
  return (
    <span
      aria-hidden
      data-status-dot={tone}
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        tone === 'success'
          ? 'bg-[color:var(--color-status-success)]'
          : tone === 'danger'
            ? 'bg-[color:var(--color-status-danger)]'
            : tone === 'warning'
              ? 'bg-[color:var(--color-status-warning)]'
              : tone === 'saved'
                ? 'bg-[color:var(--color-text-tertiary)]'
                : 'border border-[color:var(--color-text-quaternary)]',
      )}
    />
  );
}

/**
 * The trailing control that opens a row. It stays in place while its row is open, so the way
 * back is where the person pressed, but it is **not drawn pressed**: an indigo border there
 * would stand beside the row's indigo commit action (save, check), and two controls in one row
 * would claim to be primary (the settings sheet's own inspection, 2026-09-25). `aria-expanded`
 * carries the state; the accent belongs to the one action that commits. `data-row-opener` is
 * where focus returns when the row closes by any path.
 */
function OpenChip({
  testId,
  rowKey,
  open,
  onOpen,
  onClose,
  children,
}: {
  testId: string;
  rowKey: RowKey;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Chip
      size="lg"
      tone="secondary"
      hoverInk="strong"
      hoverBorder="strong"
      data-testid={testId}
      data-row-opener={rowKey}
      aria-expanded={open}
      onClick={open ? onClose : onOpen}
      className={ROW_CHIP}
    >
      {children}
    </Chip>
  );
}

/** A saved key's status: the last four for the eye, a sentence for a screen reader. */
function StoredKey({ last4, checked }: { last4: string; checked: boolean }) {
  const t = useTranslations('agents.models');
  return (
    <>
      {checked ? `${t('statusConnected')} · ` : null}
      <span aria-hidden className="font-mono">
        ····{last4}
      </span>
      <span className="sr-only">{t('statusKeyStored', { last4 })}</span>
    </>
  );
}

// ─── API keys ──────────────────────────────────────────────────────────────────────────

function KeyRow({
  provider,
  status,
  read,
  vaultRootPath,
  expanded,
  onExpand,
  onCollapse,
  onStatus,
  onVerified,
  announce,
}: {
  provider: SecretProvider;
  status: SecretStatus | null;
  /** Whether the Keychain has answered yet; until then the row draws no status or control. */
  read: boolean;
  vaultRootPath: string | null;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onStatus: (next: SecretStatus) => void;
  onVerified: () => void;
  announce: Announce;
}) {
  const t = useTranslations('agents.models');
  const nativeErrors = useNativeErrorLookup();
  const [error, setError] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyState>({ kind: 'idle' });
  const verifyRef = useRef<HTMLButtonElement | null>(null);
  const label = t(AI_PROVIDER_LABEL_KEY[provider]);
  const stored = status?.stored === true;
  const host = SECRET_PROVIDER_HOSTS[provider];
  const rowKey: RowKey = `key:${provider}`;

  const handleVerify = async () => {
    if (!vaultRootPath || verify.kind === 'checking') return;
    setVerify({ kind: 'checking' });
    setError(null);
    try {
      const result = await secretVerify(provider, vaultRootPath);
      if (!result) return;
      if (result.ok) {
        setVerify({ kind: 'ok' });
        announce(`${label} · ${t('statusConnected')}`);
      } else if (result.denied) {
        // Rust decides what counts as denied — the code differs per vendor (Gemini uses 400).
        setVerify({ kind: 'denied', status: result.httpStatus });
        announce(`${label} · ${t('verifyDenied', { status: result.httpStatus ?? '' })}`);
      } else {
        setVerify({ kind: 'failed', message: result.message ?? String(result.httpStatus ?? '') });
        announce(`${label} · ${t('statusFailed')}`);
      }
    } catch (err) {
      setVerify({ kind: 'failed', message: secretErrorMessage(err, nativeErrors) });
      announce(`${label} · ${t('statusFailed')}`);
    } finally {
      // Success or denial, the call was logged — so the count moves immediately.
      onVerified();
      refocusIfLost(verifyRef);
    }
  };

  const statusNode = !read ? null : verify.kind === 'checking' ? (
    <RowStatus tone="idle" testId={`ai-status-${provider}`}>
      {t('verifying')}
    </RowStatus>
  ) : verify.kind === 'denied' ? (
    <RowStatus tone="danger" testId={`ai-status-${provider}`}>
      {t('verifyDenied', { status: verify.status ?? '' })}
    </RowStatus>
  ) : verify.kind === 'failed' ? (
    <RowStatus tone="danger" testId={`ai-status-${provider}`}>
      {t('statusFailed')}
    </RowStatus>
  ) : stored ? (
    <RowStatus tone={verify.kind === 'ok' ? 'success' : 'saved'} testId={`ai-stored-${provider}`}>
      <StoredKey last4={status?.last4 ?? ''} checked={verify.kind === 'ok'} />
    </RowStatus>
  ) : (
    <RowStatus tone="idle" testId={`ai-status-${provider}`}>
      {t('statusNoKey')}
    </RowStatus>
  );

  // One caption line: an error, a check's failure, why a check is not offered, or where the key goes.
  const caption =
    error ??
    (verify.kind === 'failed'
      ? t('verifyFailed', { message: verify.message })
      : stored && !vaultRootPath
        ? t('verifyNeedsVault')
        : null);

  return (
    <ModelRow
      testId={`ai-provider-${provider}`}
      name={label}
      caption={caption ?? <span className="font-mono">{host}</span>}
      captionTone={error || verify.kind === 'failed' ? 'danger' : 'neutral'}
      status={statusNode}
      actions={
        read ? (
          <>
            {/* Offered only where it can run: without a folder there is nowhere to record the
                request, and the caption says so instead of a disabled button saying nothing. */}
            {stored && vaultRootPath ? (
              <Chip
                ref={verifyRef}
                size="lg"
                tone="secondary"
                hoverInk="strong"
                hoverBorder="strong"
                data-testid={`ai-verify-${provider}`}
                onClick={() => void handleVerify()}
                disabled={verify.kind === 'checking'}
                title={t('verifyScope', { host })}
                className={ROW_CHIP}
              >
                {t('actionCheck')}
              </Chip>
            ) : null}
            <OpenChip
              testId={stored ? `ai-replace-${provider}` : `ai-register-${provider}`}
              rowKey={rowKey}
              open={expanded}
              onOpen={onExpand}
              onClose={onCollapse}
            >
              {stored ? t('actionReplace') : t('actionAdd')}
            </OpenChip>
          </>
        ) : null
      }
      detailOpen={expanded}
      detailTestId={`ai-detail-${provider}`}
      detail={
        <>
          {/* `key` is the draft's lifetime: collapsing replaces the instance, so a pasted value
              disappears the moment collapsing begins, not when the motion ends. */}
          <KeyDraftForm
            key={expanded ? 'draft-open' : 'draft-closing'}
            testSuffix={provider}
            inputLabel={t('keyLabel', { provider: label })}
            open={expanded}
            onCancel={onCollapse}
            onSave={async (value) => {
              const next = await secretSet(provider, value);
              if (next) {
                setVerify({ kind: 'idle' });
                onStatus(next);
                // The row now shows the key's last four; the announcer reads the same fact out.
                announce(`${label} · ${t('saved')}`);
              }
            }}
            onError={setError}
          />
          <DraftFoot
            note={t('pasteSafety', { provider: label })}
            clear={
              stored ? (
                <ClearKeyChip
                  testId={`ai-clear-${provider}`}
                  onClear={async () => {
                    try {
                      const next = await secretClear(provider);
                      setVerify({ kind: 'idle' });
                      if (next) onStatus(next);
                      announce(`${label} · ${t('cleared')}`);
                    } catch (err) {
                      setError(secretErrorMessage(err, nativeErrors));
                    }
                  }}
                />
              ) : null
            }
          />
        </>
      }
    />
  );
}

/**
 * The paste field — a component that exists only while its row is open, so the draft goes with
 * it. There is no clearing code because there is nowhere for a draft to remain.
 */
function KeyDraftForm({
  testSuffix,
  inputLabel,
  open,
  onCancel,
  onSave,
  onError,
}: {
  testSuffix: string;
  inputLabel: string;
  open: boolean;
  onCancel: () => void;
  onSave: (value: string) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations('agents.models');
  const nativeErrors = useNativeErrorLookup();
  const [draftKey, setDraftKey] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // Explicit rather than `autoFocus` for `preventScroll`: the box is 0px tall at mount.
    inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  const handleSave = async () => {
    if (!draftKey.trim() || saving) return;
    setSaving(true);
    onError(null);
    try {
      await onSave(draftKey);
      // Cleared the instant the save succeeds — the only moment a full key exists on screen ends.
      setDraftKey('');
    } catch (err) {
      onError(secretErrorMessage(err, nativeErrors));
      // The save button was disabled while it worked; the field is where the fix happens.
      refocusIfLost(inputRef);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        ref={inputRef}
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={draftKey}
        aria-label={inputLabel}
        placeholder={t('keyPlaceholder')}
        data-testid={`ai-key-input-${testSuffix}`}
        onChange={(event) => setDraftKey(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void handleSave();
        }}
        className={fieldClass({ size: 'md', className: 'min-w-0 flex-1 font-mono placeholder:font-sans' })}
      />
      <Chip
        size="lg"
        tone="secondary"
        hoverInk="strong"
        hoverBorder="strong"
        data-testid={`ai-cancel-${testSuffix}`}
        onClick={onCancel}
        className={ROW_CHIP}
      >
        {t('cancel')}
      </Chip>
      <Chip
        size="lg"
        tone="accentOnTint"
        data-testid={`ai-save-${testSuffix}`}
        onClick={() => void handleSave()}
        disabled={!draftKey.trim() || saving}
        className={COMMIT_CHIP}
      >
        {saving ? t('saving') : t('save')}
      </Chip>
    </div>
  );
}

/** The line under a key field: where the key goes, and — for a saved key — the way to remove it. */
function DraftFoot({ note, clear }: { note: string; clear: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <p className="min-w-0 flex-1 basis-60 text-label leading-label text-[color:var(--color-text-tertiary)]">
        {note}
      </p>
      {clear}
    </div>
  );
}

/** Two presses to remove a key: the first arms (danger tone), the second removes. Disarms after 3s. */
function ClearKeyChip({ testId, onClear }: { testId: string; onClear: () => Promise<void> }) {
  const t = useTranslations('agents.models');
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  return (
    <Chip
      size="lg"
      tone={armed ? 'danger' : 'secondary'}
      hoverInk={armed ? 'none' : 'strong'}
      hoverBorder={armed ? 'none' : 'strong'}
      data-testid={testId}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          timer.current = window.setTimeout(() => setArmed(false), CLEAR_ARM_MS);
          return;
        }
        if (timer.current !== null) window.clearTimeout(timer.current);
        setArmed(false);
        void onClear();
      }}
      className={cn(
        ROW_CHIP,
        armed ? 'border-[color:var(--color-danger-a32)] hover:bg-[color:var(--color-danger-a10)]' : null,
      )}
    >
      {armed ? t('clearConfirm') : t('clearKey')}
    </Chip>
  );
}

// ─── Local runners ─────────────────────────────────────────────────────────────────────

/**
 * One runner row. There is one saved runner (`local-endpoint.ts`); a row is the one in use when
 * the saved address is its address and a model is picked. A check result belongs to the address
 * it asked: the header shows it only for the row's own address, and the open detail only for the
 * address in the field, so an abandoned check of another port never sticks to the row.
 */
function LocalRunnerRow({
  runner,
  local,
  activeRunner,
  vaultRootPath,
  expanded,
  onExpand,
  onCollapse,
  onSettings,
  onVerified,
  announce,
}: {
  runner: LocalRunner;
  local: LocalEndpointSettings;
  activeRunner: LocalRunnerId | null;
  vaultRootPath: string | null;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onSettings: (next: LocalEndpointSettings) => void;
  onVerified: () => void;
  announce: Announce;
}) {
  const t = useTranslations('agents.models');
  const nativeErrors = useNativeErrorLookup();
  const active = activeRunner === runner.id;
  const savedHere = runnerForBaseUrl(local.baseUrl) === runner.id;
  /** The row's own address: the saved one when it is this row's, else the runner's default. */
  const address = runner.id === 'custom' ? (savedHere ? local.baseUrl : '') : runner.defaultBaseUrl;
  const [draftUrl, setDraftUrl] = useState(() => address || runner.defaultBaseUrl);
  const [verify, setVerify] = useState<LocalVerifyState>({ kind: 'idle' });
  const headerCheckRef = useRef<HTMLButtonElement | null>(null);
  const detailCheckRef = useRef<HTMLButtonElement | null>(null);
  const label = t(runner.labelKey);
  const rowKey: RowKey = `local:${runner.id}`;

  // Opening starts from the row's own address, not from whatever was typed and abandoned last
  // time. Adjusted during render (React's shape for "reset state when a prop changes").
  const [seenExpanded, setSeenExpanded] = useState(expanded);
  if (expanded !== seenExpanded) {
    setSeenExpanded(expanded);
    if (expanded) setDraftUrl(address || runner.defaultBaseUrl);
  }

  const headerVerify: LocalVerifyState =
    verify.kind !== 'idle' && address && sameAddress(verify.url, address) ? verify : { kind: 'idle' };
  const detailVerify: LocalVerifyState =
    verify.kind !== 'idle' && draftUrl.trim() && sameAddress(verify.url, draftUrl) ? verify : { kind: 'idle' };
  const models = detailVerify.kind === 'done' ? detailVerify.models : [];

  const statusWord = (state: LocalVerifyState): string => {
    if (state.kind === 'checking') return t('verifying');
    if (state.kind === 'done') {
      if (state.reason === 'ok') {
        const count = t('statusModelCount', { count: state.models.length });
        return active ? `${t('statusConnected')} · ${count}` : count;
      }
      if (state.reason === 'unreachable') return t('statusUnreachable');
      if (state.reason === 'no-models') return t('statusNoModels');
      if (state.reason === 'not-compatible') return t('statusNotCompatible');
      return t('statusFailed');
    }
    return active ? t('statusSaved') : t('statusNotConnected');
  };

  const runVerify = async (url: string, ref: RefObject<HTMLButtonElement | null>) => {
    const target = url.trim();
    if (!vaultRootPath || verify.kind === 'checking' || !target) return;
    setVerify({ kind: 'checking', url: target });
    try {
      const result = await secretVerify(LOCAL_PROVIDER, vaultRootPath, target);
      if (!result) return;
      const verdict = readLocalVerdict(result);
      const done: LocalVerifyState = { kind: 'done', url: target, ...verdict };
      setVerify(done);
      // Only a re-check of **the saved address** touches what is saved: it keeps the model if the
      // runner still has it and drops it if not. Any other address saves nothing until a model is
      // picked there, so looking never breaks the runner the conversation is using.
      if (verdict.reason === 'ok' && isLocalEndpointReady(local) && sameAddress(target, local.baseUrl)) {
        const model = verdict.models.includes(local.model) ? local.model : '';
        if (model !== local.model) {
          const next = { baseUrl: local.baseUrl, model };
          onSettings(next);
          writeLocalEndpoint(next);
        }
      }
      announce(`${label} · ${statusWord(done)}`);
    } catch (err) {
      setVerify({ kind: 'done', url: target, reason: 'failed', models: [], detail: secretErrorMessage(err, nativeErrors) });
      announce(`${label} · ${t('statusFailed')}`);
    } finally {
      // Success or failure, this call was logged — so the count moves immediately.
      onVerified();
      refocusIfLost(ref);
    }
  };

  const pickModel = (model: string) => {
    if (!model) return;
    const next = { baseUrl: draftUrl.trim(), model };
    onSettings(next);
    writeLocalEndpoint(next);
    announce(`${label} · ${t('localSaved')}`);
    onCollapse();
  };

  const disconnect = () => {
    clearLocalEndpoint();
    onSettings(readLocalEndpoint());
    setVerify({ kind: 'idle' });
    announce(`${label} · ${t('localDisconnected')}`);
    onCollapse();
  };

  const headerTone: StatusTone =
    headerVerify.kind === 'checking'
      ? 'idle'
      : headerVerify.kind === 'done'
        ? headerVerify.reason === 'ok'
          ? 'success'
          : headerVerify.reason === 'no-models'
            ? 'warning'
            : 'danger'
        : active
          ? 'saved'
          : 'idle';

  const otherActive = activeRunner !== null && activeRunner !== runner.id;
  const detailIsSaved = active && sameAddress(draftUrl, local.baseUrl);

  return (
    <ModelRow
      testId={runner.rowTestId}
      name={label}
      caption={
        active ? (
          // The runner in use names the model the conversation calls, beside its address — the
          // one line that says what "in use" means here.
          <span data-testid="ai-local-connected" className="font-mono">
            {address} · {local.model}
          </span>
        ) : address ? (
          <span className="font-mono">{address}</span>
        ) : (
          t('runnerCustomAddress')
        )
      }
      status={
        <RowStatus tone={headerTone} testId={`ai-local-status-${runner.id}`}>
          {statusWord(headerVerify)}
        </RowStatus>
      }
      actions={
        <>
          {/* The header check asks the saved address, so it stands only while the row is closed:
              an open row has one check, the one beside the address being typed. */}
          {active && !expanded && vaultRootPath ? (
            <Chip
              ref={headerCheckRef}
              size="lg"
              tone="secondary"
              hoverInk="strong"
              hoverBorder="strong"
              data-testid={`ai-check-local-${runner.id}`}
              onClick={() => void runVerify(local.baseUrl, headerCheckRef)}
              disabled={verify.kind === 'checking'}
              className={ROW_CHIP}
            >
              {t('actionCheck')}
            </Chip>
          ) : null}
          <OpenChip
            testId={active ? `ai-change-local-${runner.id}` : `ai-register-local-${runner.id}`}
            rowKey={rowKey}
            open={expanded}
            onOpen={onExpand}
            onClose={onCollapse}
          >
            {active ? t('actionReplace') : t('actionConnect')}
          </OpenChip>
        </>
      }
      detailOpen={expanded}
      detailTestId={`ai-detail-local-${runner.id}`}
      detail={
        <>
          <div className="flex min-w-0 items-center gap-2">
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={draftUrl}
              aria-label={t('localBaseUrlLabel')}
              placeholder={runner.defaultBaseUrl || t('localBaseUrlPlaceholder')}
              data-testid="ai-local-url"
              onChange={(event) => setDraftUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void runVerify(draftUrl, detailCheckRef);
              }}
              className={fieldClass({ size: 'md', className: 'min-w-0 flex-1 font-mono placeholder:font-sans' })}
            />
            <Chip
              size="lg"
              tone="secondary"
              hoverInk="strong"
              hoverBorder="strong"
              data-testid="ai-cancel-local"
              onClick={onCollapse}
              className={ROW_CHIP}
            >
              {t('cancel')}
            </Chip>
            <Chip
              ref={detailCheckRef}
              size="lg"
              tone="accentOnTint"
              data-testid="ai-verify-local"
              onClick={() => void runVerify(draftUrl, detailCheckRef)}
              disabled={verify.kind === 'checking' || !vaultRootPath || !draftUrl.trim()}
              className={COMMIT_CHIP}
            >
              {verify.kind === 'checking' ? t('verifying') : t('actionCheck')}
            </Chip>
          </div>

          {/* The model field appears only once there is something to choose. */}
          {models.length > 0 ? (
            <div className="flex min-w-0 items-center gap-2" data-testid="ai-local-model-row">
              <Select
                size="md"
                value={detailIsSaved ? local.model : ''}
                onChange={pickModel}
                options={models.map((model) => ({
                  value: model,
                  label: model,
                  // Annotated, not removed: the name alone cannot say it cannot chat.
                  description: isEmbeddingOnlyModel(model) ? t('localModelEmbeddingOnly') : undefined,
                }))}
                placeholder={t('localModelPlaceholder')}
                ariaLabel={t('localModelLabel')}
                className="min-w-0 flex-1"
                data-testid="ai-local-model"
              />
              {active ? (
                <Chip
                  size="lg"
                  tone="secondary"
                  hoverInk="strong"
                  hoverBorder="strong"
                  data-testid="ai-local-disconnect"
                  onClick={disconnect}
                  className={ROW_CHIP}
                >
                  {t('localDisconnect')}
                </Chip>
              ) : null}
            </div>
          ) : active ? (
            <div className="flex min-w-0 items-center justify-end gap-2">
              <Chip
                size="lg"
                tone="secondary"
                hoverInk="strong"
                hoverBorder="strong"
                data-testid="ai-local-disconnect"
                onClick={disconnect}
                className={ROW_CHIP}
              >
                {t('localDisconnect')}
              </Chip>
            </div>
          ) : null}

          <LocalCaption
            verify={detailVerify}
            host={hostOfBaseUrl(draftUrl || address)}
            vaultKnown={vaultRootPath !== null}
          />
          {otherActive ? (
            <p
              data-testid="ai-local-one-at-a-time"
              className="text-label leading-label text-[color:var(--color-text-tertiary)]"
            >
              {t('localOneAtATime', {
                current: t(LOCAL_RUNNERS.find((candidate) => candidate.id === activeRunner)?.labelKey ?? 'runnerCustom'),
              })}
            </p>
          ) : null}
        </>
      }
    />
  );
}

/**
 * The open row's one explanatory line — the next thing to do differs per state, so the sentence
 * does too. "Nothing leaves this computer" is said only for a loopback address, where it is true.
 */
function LocalCaption({
  verify,
  host,
  vaultKnown,
}: {
  verify: LocalVerifyState;
  host: string;
  vaultKnown: boolean;
}) {
  const t = useTranslations('agents.models');
  if (!vaultKnown) {
    return (
      <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">
        {t('verifyNeedsVault')}
      </p>
    );
  }
  if (verify.kind === 'done' && verify.reason !== 'ok') {
    const message =
      verify.reason === 'unreachable'
        ? t('localFailUnreachable', { host })
        : verify.reason === 'not-compatible'
          ? t('localFailNotCompatible', { host })
          : verify.reason === 'no-models'
            ? t('localFailNoModels')
            : t('verifyFailed', { message: verify.detail });
    return (
      <p data-testid="ai-local-failure" className="text-label leading-label text-[color:var(--color-danger-text)]">
        {message}
      </p>
    );
  }
  if (verify.kind === 'done' && verify.reason === 'ok') {
    // The count is the row's status; this line says what to do with it, and names embeddings
    // only when there are some.
    const chatCount = countChatCapableModels(verify.models);
    return (
      <p data-testid="ai-local-verified" className="text-label leading-label text-[color:var(--color-text-secondary)]">
        {chatCount === verify.models.length
          ? t('localVerified')
          : t('localVerifiedWithEmbedding', { chat: chatCount })}
      </p>
    );
  }
  return (
    <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">
      {isLoopbackHost(host) ? t('localScopeLoopback', { host }) : t('localScopeRemote', { host })}
    </p>
  );
}

/** Is this machine itself — the same decision as Rust's `is_loopback_authority`. */
function isLoopbackHost(authority: string): boolean {
  const host = authority.startsWith('[')
    ? (authority.slice(1).split(']')[0] ?? '')
    : (authority.split(':')[0] ?? '');
  return host === 'localhost' || host === '::1' || host.startsWith('127.');
}

// ─── External check (Jev, experimental) ────────────────────────────────────────────────

function JevRow({
  status,
  read,
  vaultRootPath,
  mode,
  onMode,
  onCollapse,
  onStatus,
  onSent,
  announce,
}: {
  status: JevSecretStatus | null;
  read: boolean;
  vaultRootPath: string | null;
  mode: 'key' | 'check' | null;
  onMode: (mode: 'key' | 'check') => void;
  onCollapse: (mode: 'key' | 'check') => void;
  onStatus: (next: JevSecretStatus) => void;
  onSent: () => void;
  announce: Announce;
}) {
  const t = useTranslations('agents.models');
  const tJev = useTranslations('agents.models.jev');
  const nativeErrors = useNativeErrorLookup();
  const [error, setError] = useState<string | null>(null);
  const stored = status?.stored === true;

  return (
    <ModelRow
      testId="ai-provider-jev"
      name={tJev('name')}
      badge={
        /*
         * Beside the name it qualifies, in the row's quiet ink (design council, 2026-09-25): an
         * amber outlined badge was the most saturated mark on the tab, so the one experimental
         * row won the first look over the connected runner the tab exists to show.
         */
        <span data-testid="models-experimental" className="text-label text-[color:var(--color-text-tertiary)]">
          ({t('experimental')})
        </span>
      }
      // Where the key goes is said once, at the paste field and over the request itself.
      caption={error ?? tJev('caption')}
      captionTone={error ? 'danger' : 'neutral'}
      status={
        !read ? null : stored ? (
          <RowStatus tone="saved" testId="jev-key-status">
            <StoredKey last4={status?.last4 ?? ''} checked={false} />
          </RowStatus>
        ) : (
          <RowStatus tone="idle" testId="jev-key-status">
            {t('statusNoKey')}
          </RowStatus>
        )
      }
      actions={
        read ? (
          <>
            {stored ? (
              <OpenChip
                testId="jev-open-check"
                rowKey="jev:check"
                open={mode === 'check'}
                onOpen={() => onMode('check')}
                onClose={() => onCollapse('check')}
              >
                {t('actionRun')}
              </OpenChip>
            ) : null}
            <OpenChip
              testId={stored ? 'jev-replace' : 'jev-register'}
              rowKey="jev:key"
              open={mode === 'key'}
              onOpen={() => onMode('key')}
              onClose={() => onCollapse('key')}
            >
              {stored ? t('actionReplace') : t('actionAdd')}
            </OpenChip>
          </>
        ) : null
      }
      detailOpen={mode !== null}
      detailTestId="ai-detail-jev"
      detail={
        mode === 'check' ? (
          <JevCheck vaultPath={vaultRootPath} onSent={onSent} />
        ) : (
          <>
            <KeyDraftForm
              key={mode === 'key' ? 'draft-open' : 'draft-closing'}
              testSuffix="jev"
              inputLabel={tJev('keyLabel')}
              open={mode === 'key'}
              onCancel={() => onCollapse('key')}
              onSave={async (value) => {
                const next = await jevSecretSet(value);
                if (next) {
                  onStatus(next);
                  announce(`${tJev('name')} · ${t('saved')}`);
                }
              }}
              onError={setError}
            />
            <DraftFoot
              note={tJev('pasteSafety', { host: JEV_DESTINATION })}
              clear={
                stored ? (
                  <ClearKeyChip
                    testId="ai-clear-jev"
                    onClear={async () => {
                      try {
                        const next = await jevSecretClear();
                        if (next) onStatus(next);
                        announce(`${tJev('name')} · ${t('cleared')}`);
                      } catch (err) {
                        setError(secretErrorMessage(err, nativeErrors));
                      }
                    }}
                  />
                ) : null
              }
            />
          </>
        )
      }
    />
  );
}

// ─── Sent log ──────────────────────────────────────────────────────────────────────────

/** The sent log — only real JSONL lines, and the count of all of them. It never invents a summary. */
function AuditSection({
  entries,
  total,
  vaultRootPath,
}: {
  entries: LlmAuditEntry[];
  total: number | null;
  vaultRootPath: string | null;
}) {
  const t = useTranslations('agents.models');
  const hasLog = Boolean(vaultRootPath) && total !== null && total > 0;
  return (
    <section
      aria-label={t('auditTitle')}
      className="min-w-0 border-t border-[color:var(--color-divider)] pt-4"
      data-testid="ai-audit-tail"
    >
      {/* One line carries the section's name and its fact ("N transfers Atlas sent · all recorded
          in this folder"), so the name is not said twice above the sentence that contains it. */}
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {!vaultRootPath ? (
          <p className="text-body text-[color:var(--color-text-tertiary)]" data-testid="ai-audit-no-vault">
            {t('auditNoVault')}
          </p>
        ) : total === null ? (
          // Not read yet: hold the line's height and say nothing rather than a false zero.
          <p aria-hidden className="min-h-[var(--leading-body)]" data-testid="ai-audit-reading" />
        ) : total === 0 ? (
          <p className="text-body text-[color:var(--color-text-tertiary)]" data-testid="ai-audit-count" data-count={0}>
            {t('auditEmpty')}
          </p>
        ) : (
          <p className="text-body text-[color:var(--color-text-secondary)]" data-testid="ai-audit-count" data-count={total}>
            {t('auditSummary', { count: total })}
          </p>
        )}
        {/* It selects the log file itself, and exists only once there is one: a button that
            promised the file and opened a folder without it was the settings pane's defect. */}
        {hasLog && vaultRootPath ? (
          <Chip
            size="lg"
            tone="secondary"
            hoverInk="strong"
            hoverBorder="strong"
            data-testid="ai-audit-open"
            onClick={() => void revealTauriVaultFile(vaultRootPath, LLM_AUDIT_LOG_RELATIVE_PATH)}
            className={ROW_CHIP}
          >
            {t('auditOpen')}
          </Chip>
        ) : null}
      </div>
      <div className="mt-2 grid gap-2">
        {hasLog ? (
          <ol className="grid gap-1" aria-label={t('auditRecent', { count: entries.length })}>
            {[...entries].reverse().map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="flex min-w-0 items-center gap-2" data-testid="ai-audit-row">
                <span className="shrink-0 font-mono text-label text-[color:var(--color-text-tertiary)]">
                  {formatAuditTime(entry.at)}
                </span>
                <span className="min-w-0 flex-1 truncate text-label text-[color:var(--color-text-tertiary)]">
                  {entry.host ?? entry.provider} ·{' '}
                  {entry.purpose === 'verify'
                    ? t('auditPurposeVerify')
                    : entry.purpose === 'judgment'
                      ? t('auditPurposeJudgment')
                      : t('auditPurposeAsk')}{' '}
                  ·{' '}
                  {entry.purpose === 'judgment'
                    ? // Jev reads no file: what left is what the person pasted.
                      t('auditScopePasted', { chars: entry.scope.promptChars })
                    : t('auditScope', { chars: entry.scope.vaultChars })}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-label',
                    entry.outcome === 'ok'
                      ? 'text-[color:var(--color-text-secondary)]'
                      : entry.outcome === 'unknown'
                        ? 'text-[color:var(--color-text-tertiary)]'
                        : 'text-[color:var(--color-danger-text)]',
                  )}
                >
                  {entry.outcome === 'ok'
                    ? t('auditOutcomeOk')
                    : entry.outcome === 'denied'
                      ? t('auditOutcomeDenied')
                      : entry.outcome === 'error'
                        ? t('auditOutcomeError')
                        : t('auditOutcomeUnknown')}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        {vaultRootPath ? (
          <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">
            <span className="font-mono">{LLM_AUDIT_LOG_RELATIVE_PATH}</span>
            {' · '}
            {t('auditPathNote')}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** A log entry's time — `MM.DD HH:mm` in the local timezone. If the value is odd, the raw string is shown. */
function formatAuditTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The models tab as the Agents page mounts it: the open folder (where every transfer is
 * recorded) and the Keychain state are read here, only while the tab is up, so nothing is
 * queried silently from another tab.
 */
export function ModelConnections() {
  const localVault = useLocalVault();
  const handle = localVault.status === 'loaded' ? (localVault.handle ?? null) : null;
  const vaultRootPath = handle ? (getTauriVaultRootPath(handle) ?? null) : null;
  const connection = useAiConnection({ enabled: true, vaultHandle: handle });
  return (
    <ModelConnectionsPanel
      connection={connection}
      vaultRootPath={vaultRootPath}
      downloadHref={buildRouteFocusHref('/download/')}
      onDownloadNavigate={() => rememberRouteFocusIntent('/download/')}
    />
  );
}
