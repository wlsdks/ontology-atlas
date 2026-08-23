'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  secretClear,
  secretErrorMessage,
  secretSet,
  secretVerify,
  LOCAL_PROVIDER,
  SECRET_PROVIDERS,
  SECRET_PROVIDER_HOSTS,
  type ConnectionProvider,
  type SecretProvider,
  type SecretStatus,
} from '@/shared/lib/tauri-secrets';
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
import { openTauriVaultInFinder } from '@/shared/lib/tauri-vault-fs';
import { controlClass, fieldClass } from '@/shared/ui/control-class';
import { Chip } from '@/shared/ui/controls';
import { Select } from '@/shared/ui/select';
import { useToast } from '@/shared/ui/toast';
import { cn } from '@/shared/lib/cn';
import { useRowDisclosure } from '@/shared/lib/use-row-disclosure';
import { AI_PROVIDER_LABEL_KEY } from '../model/ai-providers';
import type { AiConnectionState } from '../model/use-ai-connection';

/**
 * The [AI Connection] subview (#80 S1·S2) — put my API key in this computer's keychain,
 * check in one click that the key is alive, and read the calls that went out from
 * a log inside the vault.
 *
 * What this screen holds to:
 * - **There is no path that redraws the full key.** The input state is cleared the
 *   moment a save succeeds, and after that the screen knows only `last4` (exactly
 *   the Rust contract).
 * - **Honest web degradation.** With no bridge it renders no input field and
 *   explains why this is desktop-only. Explaining is a trust asset; hiding is not.
 * - **What connecting opens is written above the list.** The first question of
 *   anyone arriving here is "what do I get if I connect". While that answer sat as
 *   a footnote below the list, this screen was **denying an already-shipped agent
 *   by calling it "coming soon"** — a leftover from before the feature existed,
 *   which had stopped being honesty and become a lie. The copy now states **only
 *   what works today**.
 * - **Security claims go no further than the code proves.** No "absolutely safe"
 *   phrasing (trust charter ⑥). For a named vendor, all we can prove is "it only
 *   goes to the official address hard-coded here", so the verification-scope copy
 *   names that address.
 * - **Unregistered rows stay collapsed.** Three input fields stacked at once make
 *   the settings sheet read as a form gate. A collapsed row still states its
 *   status (unregistered); only its visual weight drops.
 * - **Expanding is reversible.** Someone who pressed [Register Key] and changed their
 *   mind needs a way back on screen — both a visible [Cancel] and Esc.
 *
 * ## This screen's visual hierarchy (2026-07-26 owner report)
 *
 * The **vendor list is the only** filled, bordered box. People come here mostly to
 * enter a key, but with the vendor list, the outbound table and the sent log all
 * stacked in the same border-plus-surface, that reason is not what reads first
 * (ink builds a catalogue of boxes instead of a hierarchy). So only the block you
 * operate has a box, and the blocks you read (trust notice · what goes out · sent
 * log) drop to a divider plus a label. No information is removed — only the weight
 * differs.
 */

const CLEAR_ARM_MS = 3000;

/**
 * **Hover and focus** for a neutral chip. The value layer (`controlClass`)
 * deliberately does not supply this layer (frequency eats the motion budget, so
 * the consumer decides the hover colour), so it is written once here and used by
 * four sites — written by hand four times, one copy eventually diverges.
 */
const NEUTRAL_CHIP_HOVER =
  'shrink-0 hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset';

/**
 * The **border and hover** of the indigo emphasis chip — one copy, for the same
 * reason. `tone: 'accentOnTint'` gives only the text colour (that is what the ramp
 * owns), and the border tint and hover are still outside the ramp. Four sites
 * (verify ×2 · save · local verify) were holding the same string by hand.
 */
const INDIGO_CHIP =
  'shrink-0 border-[color:var(--color-indigo-line-a32)] hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-line-a13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset';

/** The audit log file's vault-relative path — only the path is mono; the Korean beside it uses the body face. */
const LLM_AUDIT_RELATIVE_PATH = '.ontology-atlas/llm-audit.jsonl';

type VerifyState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'denied'; status: number | null }
  | { kind: 'failed'; message: string };

export interface AiConnectionPanelProps {
  connection: AiConnectionState;
  /** The vault's absolute path where known on the desktop — where the audit log is written. */
  vaultRootPath: string | null;
  downloadHref: string;
  onDownloadNavigate: () => void;
}

export function AiConnectionPanel({
  connection,
  vaultRootPath,
  downloadHref,
  onDownloadNavigate,
}: AiConnectionPanelProps) {
  const t = useTranslations('settings.ai');
  const { bridgeAvailable, statuses, applyStatus, auditEntries, refreshAudit } =
    connection;
  // Only one expands at a time — the screen must show exactly one key being
  // entered, so the safety copy beside the paste field reads as being about that key.
  const [expanded, setExpanded] = useState<ConnectionProvider | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  /**
   * Cancel an expansion — the single path shared by the [Cancel] button and Esc.
   *
   * Collapsing alone discards the draft key (`KeyDraftForm` unmounts). The one
   * extra thing done here is **returning focus**: without sending it back to the
   * [Register Key] just pressed, focus falls to body, which loses the user's place and
   * also kills the next rung of the Esc order (subview → root) — the sheet's
   * keydown no longer arrives once focus has left the dialog.
   */
  const cancelDraft = (provider: ConnectionProvider) => {
    setExpanded(null);
    window.setTimeout(() => {
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-testid="ai-register-${provider}"]`)
        ?.focus({ preventScroll: true });
    }, 0);
  };

  const handleStatusChange = (provider: SecretProvider, next: SecretStatus) => {
    // If the save finished or the key was cleared, the row collapses again —
    // especially **right after clearing**: an input reopened where a value was just
    // emptied reads as the screen pressing you to enter it again.
    setExpanded((current) => (current === provider ? null : current));
    applyStatus(provider, next);
  };

  if (!bridgeAvailable) {
    return (
      <div
        className="grid max-w-[var(--settings-content-measure)] content-start gap-3"
        data-testid="ai-connection-view"
      >
        <TrustHeadline>{t('principle')}</TrustHeadline>
        <div
          className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5"
          data-testid="ai-connection-web-degraded"
        >
          <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
            {t('webDegradedTitle')}
          </p>
          <p className="mt-1 break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
            {t('webDegradedBody')}
          </p>
          {/* Once the key-less path (connect by address) existed, the paragraph
              above alone made the degradation only half honest — it reads as "if
              keys are the problem, then key-less Ollama must work". Why that does
              not work either, and where to go instead, are said in the same card. */}
          <p
            className="mt-1.5 break-keep text-label leading-label text-[color:var(--color-text-tertiary)]"
            data-testid="ai-connection-web-degraded-local"
          >
            {t('webDegradedLocalBody')}
          </p>
          <Link
            href={downloadHref}
            onClick={onDownloadNavigate}
            data-testid="ai-connection-download-link"
            className={controlClass({ shape: "chip", tone: "accentOnTint", className: "mt-2 h-8 border-[color:var(--color-indigo-line-a32)] px-2.5 text-label hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-line-a13)]" })}
          >
            {t('webDegradedCta')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    // The width is pinned to **the same value as the root face's rows**
    // (`--settings-content-measure`). Drilling in removed the LNB, and the content
    // ate those 180px, so within the same sheet a row spread to 846px and the gap
    // between "Anthropic ‥‥‥ [Register Key]" became one long emptiness. What is pinned is
    // the row, not the sheet — the sheet is fixed size, and shrinking it breaks the
    // root's two-column LNB.
    <div
      className="grid max-w-[var(--settings-content-measure)] content-start gap-3"
      data-testid="ai-connection-view"
      onKeyDown={(event) => {
        // The **innermost rung** of the Esc order. With an expanded input card,
        // collapse that first and stop the same keypress leaking upward — without
        // interception the settings sheet retreats to the root view on that same
        // Esc, so someone cancelling one key loses the subview too (the inward
        // extension of "one overlay owns one Escape").
        if (event.key !== 'Escape' || expanded === null) return;
        event.preventDefault();
        event.stopPropagation();
        cancelDraft(expanded);
      }}
    >
      <TrustHeadline>{t('principle')}</TrustHeadline>

      {/* It sits **above** the list because the first question of anyone arriving
          here is "what do I get if I connect", and "how do I connect" comes second.
          While this sentence was a footnote below the list the order was inverted,
          and it was denying an already-shipped feature as "coming soon" — the agent
          panel's [Register Key in Settings] sends people here, and the arrival screen was
          invalidating the CTA that sent them. So the copy states **only what works
          today**: it reads and answers (10 read tools) · writes happen after
          confirmation (`scope.consent` is already that contract). Not one word of
          future tense. */}
      {/* The size is `text-label` (11px) — this sentence is **a line meant to be
          read**, not the ramp's "micro label, legend, timestamp" (9.5px). Leading
          comes with the step's own pair (16px).
          The width stays inside the prose measure — the dock's prose column was
          846px, which at 9.5px fitted **74 characters per line** (over
          `--measure-prose: 70ch`). Control rows use 820px, so this cap applies to
          **prose only**. */}
      <p
        data-testid="ai-what-it-unlocks"
        className="max-w-[var(--git-setup-measure)] break-keep px-1 text-label text-[color:var(--color-text-secondary)]"
      >
        {t('whatItUnlocks')}
      </p>

      {/* The only block in this panel with a filled bordered box — the place you operate. */}
      <div
        ref={listRef}
        className="divide-y divide-[color:var(--color-divider)] overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]"
      >
        {SECRET_PROVIDERS.map((provider) => (
          <ProviderCard
            key={provider}
            provider={provider}
            status={statuses[provider]}
            vaultRootPath={vaultRootPath}
            expanded={expanded === provider}
            onExpand={() => setExpanded(provider)}
            onCancel={() => cancelDraft(provider)}
            onStatusChange={handleStatusChange}
            onVerified={refreshAudit}
          />
        ))}
        {/* The fourth row — the path where you enter an **address** rather than a
            key. It shares the box because people come to this screen for the same
            reason ("attach my model"), and standing up a second box would give this
            panel two attention winners and collapse the hierarchy (§ this screen's
            visual hierarchy). */}
        <LocalEndpointCard
          vaultRootPath={vaultRootPath}
          expanded={expanded === LOCAL_PROVIDER}
          onExpand={() => setExpanded(LOCAL_PROVIDER)}
          onCancel={() => cancelDraft(LOCAL_PROVIDER)}
          onCollapse={() => setExpanded(null)}
          onVerified={refreshAudit}
        />
      </div>

      <SupportingSection title={t('scopeTitle')}>
        <dl className="grid gap-1.5">
          {[
            { label: t('scopeWhatLabel'), value: t('scopeWhatValue') },
            { label: t('scopeWhenLabel'), value: t('scopeWhenValue') },
            { label: t('scopeLogLabel'), value: t('scopeLogValue') },
          ].map((row) => (
            <div key={row.label} className="flex gap-3">
              <dt className="w-12 shrink-0 text-body leading-body text-[color:var(--color-text-tertiary)]">
                {row.label}
              </dt>
              <dd className="min-w-0 break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </SupportingSection>

      <AuditTail
        entries={auditEntries}
        vaultRootPath={vaultRootPath}
      />
    </div>
  );
}

/**
 * The one-line trust notice — the first sentence that should be read in this panel.
 *
 * The old styling was `text-label` plus tertiary, the **dimmest ink on screen**.
 * Writing this product's core promises — keychain, when transmission happens,
 * logging — at footnote size is materially the same as deleting them. It is raised
 * with body size and secondary ink and given no box, so the vendor list below
 * (primary ink plus border) is still the attention winner.
 */
function TrustHeadline({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-[var(--git-setup-measure)] break-keep px-1 text-body leading-body text-[color:var(--color-text-secondary)]">
      {children}
    </p>
  );
}

/**
 * A block you read — a thin divider plus a plain label instead of a border and
 * surface.
 *
 * Why no mono/uppercase/wide-tracking eyebrow on the label: that combination is a
 * Latin-only convention, so Hangul gets no capitalisation and **only the word gaps
 * widen** (the gap the owner read as "What is going out"). The heading here is a
 * Korean sentence, so it is demoted by size and ink rather than by decoration.
 */
function SupportingSection({
  title,
  action,
  children,
  testId,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      aria-label={title}
      data-testid={testId}
      className="border-t border-[color:var(--color-divider)] px-1 pt-3"
    >
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="text-label text-[color:var(--color-text-tertiary)]">{title}</h3>
        {action}
      </div>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function ProviderCard({
  provider,
  status,
  vaultRootPath,
  expanded,
  onExpand,
  onCancel,
  onStatusChange,
  onVerified,
}: {
  provider: SecretProvider;
  status: SecretStatus | null;
  vaultRootPath: string | null;
  /** Is this unregistered row expanding its input? The panel owns expansion (one at a time). */
  expanded: boolean;
  onExpand: () => void;
  /** Go back without entering anything — the only path that makes expanding reversible. */
  onCancel: () => void;
  onStatusChange: (provider: SecretProvider, next: SecretStatus) => void;
  onVerified: () => void;
}) {
  const t = useTranslations('settings.ai');
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyState>({ kind: 'idle' });
  const [clearArmed, setClearArmed] = useState(false);
  const clearTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
    },
    [],
  );

  const label = t(AI_PROVIDER_LABEL_KEY[provider]);
  const stored = status?.stored === true;

  const handleVerify = async () => {
    if (!vaultRootPath || verify.kind === 'checking') return;
    setVerify({ kind: 'checking' });
    try {
      const result = await secretVerify(provider, vaultRootPath);
      if (!result) return;
      if (result.ok) setVerify({ kind: 'ok' });
      // Rust decides what counts as denied — the status code meaning denial differs
      // per vendor (Gemini uses 400), and duplicating that knowledge on screen makes
      // the two diverge silently.
      else if (result.denied) setVerify({ kind: 'denied', status: result.httpStatus });
      else
        setVerify({
          kind: 'failed',
          message: result.message ?? String(result.httpStatus ?? ''),
        });
    } catch (err) {
      setVerify({ kind: 'failed', message: secretErrorMessage(err) });
    } finally {
      // Success or denial, the call was logged — so the log is shown immediately.
      onVerified();
    }
  };

  const handleSaved = (next: SecretStatus) => {
    onStatusChange(provider, next);
    // The row changing itself (input → registered ···· last 4) is the primary
    // evidence, and the toast confirms that fact in words — symmetric with clearing
    // (`cleared`). With only one of the two, "I pressed it, so what happened?" remains.
    toast.show(t('saved'));
  };

  const handleClear = async () => {
    if (!clearArmed) {
    // Two-step confirmation — not heavy enough a judgement for a modal, and easy to undo.
      setClearArmed(true);
      clearTimer.current = window.setTimeout(() => setClearArmed(false), CLEAR_ARM_MS);
      return;
    }
    if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
    setClearArmed(false);
    try {
      const next = await secretClear(provider);
      if (next) onStatusChange(provider, next);
      setVerify({ kind: 'idle' });
      toast.show(t('cleared'));
    } catch (err) {
      setError(secretErrorMessage(err));
    }
  };

  // Whether the detail area should be open — either a registered row (verify/clear)
  // or an unregistered row expanding its input. Both cases use **the same area**, so
  // a successful save (input form → registered actions) passes through the same
  // single height transition as opening and closing.
  const detailOpen = stored || expanded;
  // Destructured on receipt — reading a property off an object holding a ref during
  // render makes the React Compiler lint count it as "ref access during render"
  // (there is no actual access).
  const {
    mounted: detailMounted,
    boxRef: detailBoxRef,
    contentRef: detailContentRef,
  } = useRowDisclosure(detailOpen);

  return (
    <div data-testid={`ai-provider-${provider}`}>
      {/* **The same header band regardless of state** (`--control-row-h`). Drawing a
          different row per state (the old structure) makes expansion a replacement,
          so there is nothing to transition, and the name column also shifts by 8px.
          One band plus a detail area below it fixes the name and grows only below —
          so the movement reads as a collapsed row *becoming* an expanded one rather
          than being swapped for something else (dimension regularity). */}
      <div className="flex h-[var(--control-row-h)] items-center justify-between gap-3 px-3">
        {/* The vendor name is identity, not status — it is drawn in the same ink whether or not a key is registered. Being unregistered is already said without ambiguity by whether the following slot is a [Register Key] button or the last 4 characters. Dimming the name too encodes the same fact twice while making this screen's primary task ("find my vendor") harder. This list is the panel's attention winner, so the name is body size, primary ink. */}
        <p className="text-body text-[color:var(--color-text-primary)]">{label}</p>
        {stored ? (
          // Status words use the body face and only the masked last 4 are mono —
          // treating the whole thing as monospace widens the gap after "Registered" so the
          // label and value look separated. This fragment fading in right after a
          // save is the face of "it saved".
          <span
            key={status?.last4 ?? 'stored'}
            data-testid={`ai-stored-${provider}`}
            className="ai-row-swap flex items-baseline gap-1.5 text-label text-[color:var(--color-text-tertiary)]"
          >
            {t('storedLabel')}
            <span className="font-mono">···· {status?.last4 ?? ''}</span>
          </span>
        ) : (
          <Chip
            data-testid={`ai-register-${provider}`}
            // Having declared `aria-expanded`, pressing again must collapse it —
            // otherwise a promise made to a screen reader becomes a lie. So this
            // button also returns through **the same path** as [Cancel] and Esc
            // (`onCancel`).
            onClick={expanded ? onCancel : onExpand}
            aria-expanded={expanded}
            // It does not disappear while expanded but stays in the **pressed
            // state**. If it vanished, nothing on screen would point at where the
            // card came from, and the place to return to on collapse would go with
            // it. Pressed now comes from the value layer's `active` — one ramp state
            // instead of three hand-written indigos.
            active={expanded}
            className={cn(
              'shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset',
              expanded
                ? null
                : 'hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-indigo-accent)]',
            )}
          >
            {t('keyRegister')}
          </Chip>
        )}
      </div>

      <div
        ref={detailBoxRef}
        className="ai-row-disclosure"
        data-state={detailOpen ? 'open' : 'closed'}
        data-testid={`ai-detail-${provider}`}
        // It stays in the DOM while collapsing (≈180ms), so it is disabled
        // immediately to keep an invisible input out of tab order and the screen
        // reader — the price of an exit motion is not paid in accessibility.
        inert={!detailOpen}
      >
        {detailMounted ? (
          <div ref={detailContentRef} className="ai-row-disclosure-body px-3 pb-2.5">
            {/* Only this block cross-fades when the state changes — the height is
                carried by the outer transition, so the two finish as one movement. */}
            <div key={stored ? 'stored' : 'draft'} className="ai-row-swap grid gap-2">
              {stored ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Chip
                    tone="accentOnTint"
                    data-testid={`ai-verify-${provider}`}
                    onClick={() => void handleVerify()}
                    disabled={verify.kind === 'checking' || !vaultRootPath}
                    className={INDIGO_CHIP}
                  >
                    {verify.kind === 'checking' ? t('verifying') : t('verify')}
                  </Chip>
                  <Chip
                    // Arming changes the tone — colour states first that this
                    // deletion cannot be undone. The ramp's `danger`, not a
                    // hand-written danger colour.
                    tone={clearArmed ? 'danger' : 'default'}
                    data-testid={`ai-clear-${provider}`}
                    onClick={() => void handleClear()}
                    className={cn(
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset',
                      clearArmed
                        ? 'border-[color:var(--color-danger-a32)] hover:bg-[color:var(--color-danger-a10)]'
                        : 'border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]',
                    )}
                  >
                    {clearArmed ? t('clearConfirm') : t('clear')}
                  </Chip>
                </div>
              ) : (
                // `key` is the draft's lifetime. The key changes on the commit where
                // collapsing begins and this instance unmounts, so a value being
                // pasted disappears on the spot rather than waiting for the exit
                // motion — the motion is not bought by stretching "on screen only
                // until saved" into "until the collapse finishes".
                <KeyDraftForm
                  key={expanded ? 'draft-open' : 'draft-closing'}
                  provider={provider}
                  label={label}
                  open={expanded}
                  onSaved={handleSaved}
                  onCancel={onCancel}
                  onError={setError}
                />
              )}

              <ProviderCaption
                error={error}
                provider={label}
                host={SECRET_PROVIDER_HOSTS[provider]}
                stored={stored}
                verify={verify}
                vaultKnown={vaultRootPath !== null}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type LocalVerifyState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'done'; reason: LocalVerifyReason; models: string[]; detail: string };

/**
 * The fourth row — **the path where you enter an address, not a key** (Ollama ·
 * LM Studio · llama.cpp server · vLLM …).
 *
 * Its anatomy matches the three rows above (header band plus detail area). The
 * only difference is what goes in the detail area: **one address field and one
 * model** instead of a pasted key.
 *
 * ## Why the model is not typed by hand
 *
 * A runner's model names carry tags like `qwen3:8b`, so people transcribe them
 * wrongly. And when they do, the runner answers with one line of 404, so all that
 * remains on screen is "failed". So one [Check Connection] fetches the list too, and
 * choosing happens only from that list — removing any way to pick a name that does
 * not exist.
 *
 * ## Each failure reason gets its own sentence
 *
 * If "not running", "wrong port" and "no such model" are not distinguished, the
 * user cannot tell which of the three to act on. The decision happens in one place
 * (`readLocalVerdict` — Rust has already separated status codes from curl exit
 * codes), and here it only gets a sentence attached.
 */
function LocalEndpointCard({
  vaultRootPath,
  expanded,
  onExpand,
  onCancel,
  onCollapse,
  onVerified,
}: {
  vaultRootPath: string | null;
  expanded: boolean;
  onExpand: () => void;
  onCancel: () => void;
  onCollapse: () => void;
  onVerified: () => void;
}) {
  const t = useTranslations('settings.ai');
  const toast = useToast();
  const [settings, setSettings] = useState<LocalEndpointSettings>(() => readLocalEndpoint());
  const [draftUrl, setDraftUrl] = useState(() => readLocalEndpoint().baseUrl);
  const [verify, setVerify] = useState<LocalVerifyState>({ kind: 'idle' });

  const label = t(AI_PROVIDER_LABEL_KEY[LOCAL_PROVIDER]);
  const connected = isLocalEndpointReady(settings);
  const detailOpen = connected || expanded;
  const {
    mounted: detailMounted,
    boxRef: detailBoxRef,
    contentRef: detailContentRef,
  } = useRowDisclosure(detailOpen);

  /** Models selectable after a successful check. Nothing is stored — the runner is the source of truth. */
  const models = verify.kind === 'done' ? verify.models : [];

  const handleVerify = async () => {
    if (!vaultRootPath || verify.kind === 'checking') return;
    setVerify({ kind: 'checking' });
    try {
      const result = await secretVerify(LOCAL_PROVIDER, vaultRootPath, draftUrl.trim());
      if (!result) return;
      const verdict = readLocalVerdict(result);
      setVerify({ kind: 'done', ...verdict });
      if (verdict.reason === 'ok') {
        // The address is saved the moment it answers — nobody should have to type it
        // again just because they have not picked a model yet. The condition for
        // conversation to switch on is still "a model has been picked too"
        // (`isLocalEndpointReady`).
        const model = verdict.models.includes(settings.model) ? settings.model : '';
        const next = { baseUrl: draftUrl.trim(), model };
        setSettings(next);
        writeLocalEndpoint(next);
      }
    } catch (err) {
      setVerify({
        kind: 'done',
        reason: 'failed',
        models: [],
        detail: secretErrorMessage(err),
      });
    } finally {
      // Success or failure, this call was logged — so the log is shown immediately.
      onVerified();
    }
  };

  const handlePickModel = (model: string) => {
    const next = { baseUrl: settings.baseUrl || draftUrl.trim(), model };
    setSettings(next);
    writeLocalEndpoint(next);
    if (model) {
      toast.show(t('localSaved'));
      onCollapse();
    }
  };

  const handleDisconnect = () => {
    clearLocalEndpoint();
    const cleared = readLocalEndpoint();
    setSettings(cleared);
    setDraftUrl(cleared.baseUrl);
    setVerify({ kind: 'idle' });
    toast.show(t('localDisconnected'));
  };

  const host = hostOfBaseUrl(settings.baseUrl || draftUrl);

  return (
    <div data-testid="ai-provider-local">
      <div className="flex h-[var(--control-row-h)] items-center justify-between gap-3 px-3">
        <p className="text-body text-[color:var(--color-text-primary)]">{label}</p>
        {connected ? (
          <span
            key={settings.model}
            data-testid="ai-local-connected"
            className="ai-row-swap flex min-w-0 items-baseline gap-1.5 text-label text-[color:var(--color-text-tertiary)]"
          >
            {t('localConnected')}
            <span className="truncate font-mono">{settings.model}</span>
          </span>
        ) : (
          <Chip
            data-testid="ai-register-local"
            onClick={expanded ? onCancel : onExpand}
            aria-expanded={expanded}
            active={expanded}
            className={cn(
              'shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset',
              expanded
                ? null
                : 'hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-indigo-accent)]',
            )}
          >
            {t('localConnect')}
          </Chip>
        )}
      </div>

      <div
        ref={detailBoxRef}
        className="ai-row-disclosure"
        data-state={detailOpen ? 'open' : 'closed'}
        data-testid="ai-detail-local"
        inert={!detailOpen}
      >
        {detailMounted ? (
          <div ref={detailContentRef} className="ai-row-disclosure-body grid gap-2 px-3 pb-2.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={draftUrl}
                aria-label={t('localBaseUrlLabel')}
                placeholder={t('localBaseUrlPlaceholder')}
                data-testid="ai-local-url"
                onChange={(event) => setDraftUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleVerify();
                }}
                className={fieldClass({ size: "md", className: "min-w-0 flex-1 font-mono placeholder:font-sans" })}
              />
              {!connected ? (
                <Chip
                  data-testid="ai-cancel-local"
                  onClick={onCancel}
                  className={NEUTRAL_CHIP_HOVER}
                >
                  {t('cancel')}
                </Chip>
              ) : null}
              <Chip
                tone="accentOnTint"
                data-testid="ai-verify-local"
                onClick={() => void handleVerify()}
                disabled={verify.kind === 'checking' || !vaultRootPath || !draftUrl.trim()}
                className={INDIGO_CHIP}
              >
                {verify.kind === 'checking' ? t('verifying') : t('verify')}
              </Chip>
            </div>

            {/* The model field appears **only once there is something to choose**.
                Drawing an empty select in advance hangs the instruction "choose
                here" on a state where nothing can be chosen. */}
            {models.length > 0 ? (
              <div className="flex items-center gap-2" data-testid="ai-local-model-row">
                <Select
                  size="md"
                  value={settings.model}
                  onChange={handlePickModel}
                  // Only rows judged to be embeddings get a second line — the name
                  // alone cannot tell you whether `embeddinggemma:latest` can hold a
                  // conversation, and not knowing, a person picks the first one (the
                  // owner actually did). It is **annotated, not removed**: removing
                  // it would make the screen deny something present on the user's
                  // own machine.
                  options={models.map((model) => ({
                    value: model,
                    label: model,
                    description: isEmbeddingOnlyModel(model)
                      ? t('localModelEmbeddingOnly')
                      : undefined,
                  }))}
                  placeholder={t('localModelPlaceholder')}
                  ariaLabel={t('localModelLabel')}
                  className="min-w-0 flex-1"
                  data-testid="ai-local-model"
                />
                {connected ? (
                  <Chip
                    data-testid="ai-local-disconnect"
                    onClick={handleDisconnect}
                    className={NEUTRAL_CHIP_HOVER}
                  >
                    {t('localDisconnect')}
                  </Chip>
                ) : null}
              </div>
            ) : connected ? (
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--color-text-tertiary)]">
                  {settings.model}
                </span>
                <Chip
                  data-testid="ai-local-disconnect"
                  onClick={handleDisconnect}
                  className={NEUTRAL_CHIP_HOVER}
                >
                  {t('localDisconnect')}
                </Chip>
              </div>
            ) : null}

            <LocalCaption
              verify={verify}
              connected={connected}
              host={host}
              vaultKnown={vaultRootPath !== null}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * This row's single line — the next thing to do **differs per state**, so the
 * sentence does too.
 *
 * The local path's transmission-scope copy lives here. Loopback and non-loopback
 * split because "nothing leaves this computer" is true only on `localhost`, and a
 * user may point at another machine over https (which is allowed). Writing that
 * sentence where it is not true would make this product's whole trust story a lie.
 */
function LocalCaption({
  verify,
  connected,
  host,
  vaultKnown,
}: {
  verify: LocalVerifyState;
  connected: boolean;
  host: string;
  vaultKnown: boolean;
}) {
  const t = useTranslations('settings.ai');

  if (!vaultKnown) {
    return (
      <p className="break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
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
      <p
        data-testid="ai-local-failure"
        className="flex items-start gap-1.5 break-keep text-label leading-label text-[color:var(--color-status-danger)]"
      >
        <StatusDot tone="danger" />
        {message}
      </p>
    );
  }
  if (verify.kind === 'done' && verify.reason === 'ok') {
    // Saying only "N installed models" reads as though all N are worth choosing — on the
    // measured runner, 4 of 7 were embedding-only. With no embeddings at all the
    // sentence stays as it was (no distinction is invented where there is none).
    const chatCount = countChatCapableModels(verify.models);
    return (
      <p
        data-testid="ai-local-verified"
        className="flex items-center gap-1.5 break-keep text-label leading-label text-[color:var(--color-status-success)]"
      >
        <StatusDot tone="success" />
        {chatCount === verify.models.length
          ? t('localVerified', { count: verify.models.length })
          : t('localVerifiedWithEmbedding', {
              count: verify.models.length,
              chat: chatCount,
            })}
      </p>
    );
  }
  return (
    <p className="break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
      {connected
        ? isLoopbackHost(host)
          ? t('localScopeLoopback', { host })
          : t('localScopeRemote', { host })
        : t('localHint')}
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

/**
 * The paste field — **a component that exists only while expanded.**
 *
 * The point is that the draft key is held here rather than by the parent. When the
 * row collapses this component unmounts and **the draft goes with it** — there is
 * no clearing code, because there is nowhere for it to remain.
 *
 * Why go to the trouble: collapsing a row creates the belief "it left the screen,
 * so it must be gone". A draft held by the parent makes that belief false — a key
 * pasted and then abandoned by moving to another row would stay in memory until the
 * sheet closes. Tying the lifetime to visibility turns this panel's contract ("a
 * pasted key is on screen only until it is saved") from discipline into structure.
 *
 * So [Cancel] does no clearing here — it only tells the parent to collapse. This
 * component disappearing *is* the draft disappearing.
 *
 * **An exit motion does not stretch that contract.** For the collapse to be
 * visible, the collapsing area has to stay in the DOM until the transition ends
 * (≈180ms), and if the draft rode along, the sentence above would quietly widen
 * from "when the row collapses" to "when the collapse animation finishes". So the
 * caller ties `key` to the expanded state and replaces this instance wholesale on
 * the commit where collapsing **begins** — still "no clearing code, nowhere to
 * remain". The promise is not shaved to buy a motion.
 *
 * **No confirmation dialog even with text entered.** ① What is lost is a value you
 * can paste again from the clipboard or the vendor console, ② a modal on a modal is
 * a stacking form this repository forbids, and ③ this card's confirmation budget is
 * already spent on [Clear]'s two-step arming — charging the same friction for
 * reversible and irreversible actions makes the real warning cheap.
 */
function KeyDraftForm({
  provider,
  label,
  open,
  onSaved,
  onCancel,
  onError,
}: {
  provider: SecretProvider;
  label: string;
  /** Is this row still expanded — false means it is collapsing (exit transition). */
  open: boolean;
  onSaved: (next: SecretStatus) => void;
  onCancel: () => void;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations('settings.ai');
  const [draftKey, setDraftKey] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // The user just pressed [Register Key] to open this field, so do not make them click
    // again. The explicit call rather than `autoFocus` is for `preventScroll`: the
    // container's height at mount is 0 (the transition's start point), and the panel
    // jumps if the browser tries to correct with a scroll.
    inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  const handleSave = async () => {
    if (!draftKey.trim() || saving) return;
    setSaving(true);
    onError(null);
    try {
      const next = await secretSet(provider, draftKey);
      // Clear the key from front-end state the instant the save succeeds — this ends
      // the only moment the full key can exist on this screen.
      setDraftKey('');
      if (next) onSaved(next);
    } catch (err) {
      onError(secretErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={draftKey}
        aria-label={t('keyLabel', { provider: label })}
        placeholder={t('keyPlaceholder')}
        data-testid={`ai-key-input-${provider}`}
        onChange={(event) => setDraftKey(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void handleSave();
        }}
        // The value is mono (a machine string) and the guidance uses the body face —
        // drawing a Korean placeholder monospaced too widens the word gaps into
        // "Paste API Key".
        className={fieldClass({ size: "md", className: "min-w-0 flex-1 font-mono placeholder:font-sans" })}
      />
      {/* The neutral control left of save — the exit for someone who pressed and
          changed their mind. Esc does the same thing, but Esc is invisible. An
          expansion with no visible way back is a trap, so a discoverable control is
          what makes the contract hold. */}
      <Chip
        data-testid={`ai-cancel-${provider}`}
        onClick={onCancel}
        className={NEUTRAL_CHIP_HOVER}
      >
        {t('cancel')}
      </Chip>
      <Chip
        tone="accentOnTint"
        data-testid={`ai-save-${provider}`}
        onClick={() => void handleSave()}
        disabled={!draftKey.trim() || saving}
        className={INDIGO_CHIP}
      >
        {saving ? t('saving') : t('save')}
      </Chip>
    </div>
  );
}

/** Exactly one line of explanation per card — the card's height anatomy is the same across states. */
function ProviderCaption({
  error,
  provider,
  host,
  stored,
  verify,
  vaultKnown,
}: {
  error: string | null;
  provider: string;
  /** The host this verification request goes to — a destination claim only as strong as we can prove. */
  host: string;
  stored: boolean;
  verify: VerifyState;
  vaultKnown: boolean;
}) {
  const t = useTranslations('settings.ai');

  if (error) {
    return (
      <p className="break-keep text-label leading-label text-[color:var(--color-status-danger)]">
        {error}
      </p>
    );
  }
  if (!stored) {
    // The moment of pasting is the moment trust is judged — permanently visible
    // below the field, not a tooltip that appears on focus.
    return (
      <p className="break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
        {t('pasteSafety', { provider })}
      </p>
    );
  }
  if (!vaultKnown) {
    return (
      <p className="break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
        {t('verifyNeedsVault')}
      </p>
    );
  }
  if (verify.kind === 'ok') {
    return (
      <p className="flex items-center gap-1.5 text-label text-[color:var(--color-status-success)]">
        <StatusDot tone="success" />
        {t('verified')}
      </p>
    );
  }
  if (verify.kind === 'denied') {
    return (
      <p className="flex items-center gap-1.5 text-label text-[color:var(--color-status-danger)]">
        <StatusDot tone="danger" />
        {t('verifyDenied', { status: verify.status ?? '' })}
      </p>
    );
  }
  if (verify.kind === 'failed') {
    return (
      <p className="flex items-center gap-1.5 break-keep text-label leading-label text-[color:var(--color-status-danger)]">
        <StatusDot tone="danger" />
        {t('verifyFailed', { message: verify.message })}
      </p>
    );
  }
  return (
    <p className="break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
      {t('verifyScope', { host })}
    </p>
  );
}

function StatusDot({ tone }: { tone: 'success' | 'danger' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-1.5 shrink-0 rounded-full',
        tone === 'success'
          ? 'bg-[color:var(--color-status-success)]'
          : 'bg-[color:var(--color-status-danger)]',
      )}
    />
  );
}

/** Sent log — it draws only real JSONL lines. It never invents a summary for lines that do not exist. */
function AuditTail({
  entries,
  vaultRootPath,
}: {
  entries: LlmAuditEntry[];
  vaultRootPath: string | null;
}) {
  const t = useTranslations('settings.ai');

  return (
    <SupportingSection
      title={t('auditTitle')}
      testId="ai-audit-tail"
      action={
        vaultRootPath ? (
          <button
            type="button"
            data-testid="ai-audit-open"
            onClick={() => void openTauriVaultInFinder(vaultRootPath)}
            /*
             * Text that is pressable on its own is `link`. The ramp's floor is WCAG
             * 2.5.8 (AA)'s 24×24 — the old comment called 44 "satisfying 2.5.8", but
             * 44 is the touch value from 2.5.5 (AAA) and the HIG, and that comes from
             * `.touch-hit-expand` on a coarse pointer (floor reset 2026-08-04).
             */
            className={controlClass({
              shape: 'link',
              size: 'sm',
              className:
                'touch-hit-expand hover:text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset',
            })}
          >
            {t('auditOpen')}
          </button>
        ) : null
      }
    >
      <div className="grid gap-1">
        {entries.length === 0 ? (
          <p className="break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
            {t('auditEmpty')}
          </p>
        ) : (
          [...entries].reverse().map((entry, index) => (
            <div
              key={`${entry.at}-${index}`}
              className="flex items-center gap-2"
              data-testid="ai-audit-row"
            >
              <span className="shrink-0 font-mono text-label text-[color:var(--color-text-quaternary)]">
                {formatAuditTime(entry.at)}
              </span>
              <span className="min-w-0 flex-1 truncate text-label text-[color:var(--color-text-tertiary)]">
                {entry.provider} ·{' '}
                {entry.purpose === 'verify' ? t('auditPurposeVerify') : t('auditPurposeAsk')}{' '}
                · {t('auditScope', { chars: entry.scope.vaultChars })}
              </span>
              <span
                className={cn(
                  'shrink-0 text-label',
                  entry.outcome === 'ok'
                    ? 'text-[color:var(--color-status-success)]'
                    : entry.outcome === 'unknown'
                      ? 'text-[color:var(--color-text-quaternary)]'
                      : 'text-[color:var(--color-status-danger)]',
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
            </div>
          ))
        )}
      </div>
      {/* Only the path is mono; the text beside it uses the body face. A whole
          line in mono widens word gaps into "Whether to commit is your choice",
          because the monospace glyph width carries straight into letter
          spacing. A file path is a machine string, so mono is information there —
          the sentence next to it is not. */}
      <p className="mt-2 break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
        <span className="font-mono">{LLM_AUDIT_RELATIVE_PATH}</span>
        {' · '}
        {t('auditPathNote')}
      </p>
    </SupportingSection>
  );
}

/** A log entry's time — `MM.DD HH:mm` in the local timezone. If the value is odd, the raw string is shown. */
function formatAuditTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
