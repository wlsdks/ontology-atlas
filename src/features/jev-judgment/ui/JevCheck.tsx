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
 * The experimental Jev evidence check: the exact request is shown unfolded before any send,
 * nothing is sent without a folder to audit it in, the answer is advice with no write path,
 * and the key never passes through here.
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
      // A disabled button drops focus to <body> in Chromium and WebKit; restore it unless taken.
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
        {/* The whole request with no inner scroll, so nothing unseen is sent; ligatures off so `!==` reads as sent. */}
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
      {/* A disabled send says why beside it. */}
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        {!ready ? (
          <p
            data-testid="jev-send-blocked"
            className="min-w-0 flex-1 basis-48 text-label leading-label text-[color:var(--color-text-tertiary)]"
          >
            {vaultPath ? t('needBoth') : t('needVault')}
          </p>
        ) : null}
        {/* Commit tone, not filled: an experimental check must not be the strongest control. */}
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
