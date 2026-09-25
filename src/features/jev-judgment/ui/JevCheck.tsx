'use client';

import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';

import {
  buildJevPayload,
  JEV_DESTINATION,
  jevJudge,
  type JevJudgment,
} from '@/shared/lib/tauri-jev';
import { useNativeErrorLookup } from '@/shared/lib/use-native-error-lookup';
import { nativeErrorMessage } from '@/shared/lib/native-error';
import { Chip } from '@/shared/ui/controls';
import { Textarea } from '@/shared/ui/input';

/**
 * The experimental Jev evidence check, as the composer under the models tab's Jev row.
 *
 * What this surface promises, and where each promise is kept:
 * - **The exact request is on screen before any press can send it.** The preview is not folded
 *   into a disclosure (the first port had it inside `<details>`, so the send button could fire a
 *   request nobody had looked at). It is the same string `jev_judge` receives, and the Rust
 *   bridge refuses any other shape (`validate_payload`), so what is shown is what goes.
 * - **Nothing is sent without a folder to record it in.** The bridge reserves the audit line
 *   before the HTTP call and refuses to send when it cannot; the button says why it is disabled.
 * - **Advice, not acceptance.** The answer is drawn with the sentence that it changes nothing, and
 *   no write path exists from here to the vault.
 * - **The key never passes through here.** Key entry is the row's own form; this composer only
 *   knows that a key exists.
 */
export function JevCheck({
  vaultPath,
  onSent,
}: {
  /** The open folder's absolute path, where the transfer is recorded. `null` blocks sending. */
  vaultPath: string | null;
  /** Called after every attempt that reached the bridge, so the sent-log count refreshes. */
  onSent: () => void;
}) {
  const t = useTranslations('agents.models.jev');
  const nativeErrors = useNativeErrorLookup();
  const previewId = useId();
  const [claim, setClaim] = useState('');
  const [evidence, setEvidence] = useState('');
  const [result, setResult] = useState<JevJudgment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendRef = useRef<HTMLButtonElement | null>(null);
  const payload = buildJevPayload(claim, evidence);
  const ready = Boolean(vaultPath) && claim.trim().length > 0 && evidence.trim().length > 0;

  const send = async () => {
    if (!vaultPath || !ready || sending) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      setResult(await jevJudge(vaultPath, payload));
    } catch (reason) {
      setError(nativeErrorMessage(reason, nativeErrors));
    } finally {
      setSending(false);
      onSent();
      // The send button was disabled while the request was out, which drops focus to <body> in
      // Chromium and WebKit; put it back unless something else took it.
      window.setTimeout(() => {
        const active = document.activeElement;
        if (!active || active === document.body) sendRef.current?.focus({ preventScroll: true });
      }, 0);
    }
  };

  return (
    <div className="grid min-w-0 gap-3" data-testid="jev-check">
      <p className="max-w-[var(--git-setup-measure)] text-label leading-label text-[color:var(--color-text-tertiary)]">
        {t('intro')}
      </p>
      <Textarea
        label={t('claimLabel')}
        placeholder={t('claimPlaceholder')}
        value={claim}
        onChange={(event) => {
          setClaim(event.target.value);
          setResult(null);
        }}
        rows={2}
        maxLength={2000}
        // Held still while a request is out, so the answer can only ever sit under the text it judged.
        readOnly={sending}
        data-testid="jev-claim"
      />
      <Textarea
        label={t('evidenceLabel')}
        placeholder={t('evidencePlaceholder')}
        value={evidence}
        onChange={(event) => {
          setEvidence(event.target.value);
          setResult(null);
        }}
        rows={4}
        maxLength={8000}
        readOnly={sending}
        data-testid="jev-evidence"
      />
      <section aria-labelledby={previewId} className="grid min-w-0 gap-1.5">
        <h4 id={previewId} className="text-label text-[color:var(--color-text-secondary)]">
          {t('requestTitle', { host: JEV_DESTINATION })}
        </h4>
        {/*
          The whole request, never a scrolling window onto it (responsive seat, 2026-09-25): a
          capped box at the 1040 minimum window hid 41% of a pasted function under a scrollbar
          macOS does not draw, so a person could send what they never saw. The page scroll
          carries it, and Send comes after all of it. Tokens wrap where they must, not mid-word,
          and ligatures are off so `!==` reads as the three characters that are sent.
        */}
        <pre
          data-testid="jev-request-preview"
          className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] [font-variant-ligatures:none] rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2.5 font-mono text-label leading-label text-[color:var(--color-text-secondary)]"
        >
          {payload}
        </pre>
        <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">
          {t('requestNote')}
        </p>
      </section>
      {/* A disabled send says why, beside it: a greyed button alone leaves the person guessing
          which of three things is missing. */}
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        {!ready ? (
          <p
            data-testid="jev-send-blocked"
            className="min-w-0 flex-1 basis-48 text-label leading-label text-[color:var(--color-text-tertiary)]"
          >
            {vaultPath ? t('needBoth') : t('needVault')}
          </p>
        ) : null}
        {/* The panel's commit tone (tinted indigo), not the tab's one filled press: an
            experimental check must not be the strongest control on the screen. */}
        <Chip
          size="lg"
          tone="accentOnTint"
          hoverSurface="lift"
          ref={sendRef}
          data-testid="jev-send"
          disabled={!ready || sending}
          onClick={() => void send()}
          className="shrink-0 border-[color:var(--color-indigo-line-a32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]"
        >
          {sending ? t('sending') : t('send')}
        </Chip>
      </div>
      {result ? (
        <div
          role="status"
          data-testid="jev-result"
          data-choice={result.choice}
          className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]"
        >
          <p className="text-body text-[color:var(--color-text-primary)]">
            {t(`choices.${result.choice}`)}
          </p>
          <p className="mt-1 text-label leading-label text-[color:var(--color-text-secondary)]">
            {t('confidence', { value: Math.round(result.confidence * 100), model: result.responseModel })}
          </p>
          {/* The caveats sit on the answer they qualify, not above the button. */}
          <p className="mt-1 text-label leading-label text-[color:var(--color-text-tertiary)]">
            {t('advisory')} {t('experimentalNote')}
          </p>
        </div>
      ) : null}
      {error ? (
        <p role="alert" data-testid="jev-error" className="text-label leading-label text-[color:var(--color-danger-text)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
