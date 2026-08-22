'use client';

import { useEffect, useRef } from 'react';
import { controlClass } from '@/shared/ui';

/**
 * The scope sheet before the first turn — it states once, before sending, **what
 * goes where**.
 *
 * In a tool loop the model decides what rides on the next round trip, so a full
 * preview beforehand is structurally impossible. The equivalent that keeps the
 * charter's aims (zero silent collection, the user knowing the scope, auditability)
 * is ① this sheet's advance notice ② the tool rows appended live each round trip
 * ③ after-the-fact comparison against the audit log inside the vault.
 */
export function AgentScopeSheet({
  provider,
  host,
  auditPath,
  labels,
  onAccept,
  onCancel,
}: {
  provider: string;
  host: string;
  auditPath: string;
  labels: {
    title: string;
    body: (args: { provider: string; host: string }) => string;
    liveRows: string;
    /**
     * The write-consent promise. This sheet is where a person **consents to the
     * whole**, yet the old copy spoke only of reading, sending and logging and never
     * of the fact that documents can be edited, nor of the safeguards. If writing is
     * within the scope of the consent, it has to be stated there for the consent to
     * be consent.
     */
    consent: string;
    recorded: (path: string) => string;
    accept: string;
    cancel: string;
  };
  onAccept: () => void;
  onCancel: () => void;
}) {
  const acceptRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    acceptRef.current?.focus();
  }, []);

  return (
    <div
      data-testid="agent-scope-sheet"
      role="group"
      aria-label={labels.title}
      className="flex flex-col gap-3 rounded-card border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] p-3"
    >
      <p className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)] [word-break:keep-all]">
        {labels.title}
      </p>
      <p className="text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
        {labels.body({ provider, host })}
      </p>
      <ul className="flex flex-col gap-1 text-label tracking-label text-[color:var(--color-text-tertiary)]">
        <li>{labels.liveRows}</li>
        <li data-testid="agent-scope-consent">{labels.consent}</li>
        <li data-testid="agent-scope-audit-path">{labels.recorded(auditPath)}</li>
      </ul>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          data-testid="agent-scope-cancel"
          onClick={onCancel}
          className={controlClass({ hoverInk: 'strong', hoverBorder: 'strong',
            shape: 'chip',
            size: 'md',
            tone: 'secondary',
            className: 'tracking-label border-[color:var(--color-border-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
          })}
        >
          {labels.cancel}
        </button>
        <button
          ref={acceptRef}
          type="button"
          data-testid="agent-scope-accept"
          onClick={onAccept}
          className={controlClass({
            tone: 'onAccent',
            className:
              'tracking-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
          })}
        >
          {labels.accept}
        </button>
      </div>
    </div>
  );
}
