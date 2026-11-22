import type { ReactNode, RefObject } from 'react';
import { useTranslations } from 'next-intl';
import type { SecretProvider } from '@/shared/lib/llm-connection/tauri-secrets';
import { Chip } from '@/shared/ui/controls/controls';
import { TermHint } from '@/shared/ui/hints/term-hint';
import type { GlossaryTerm } from '@/shared/config/term-glossary';
import { cn } from '@/shared/lib/cn';
import { useRowDisclosure } from '@/shared/lib/list-rows/use-row-disclosure';
import type { LocalRunnerId } from '../../model/local-runners';
import { SettingsGroupHeading } from '../settings-primitives';

export const ROW_CHIP =
  'shrink-0 border-[color:var(--color-border-soft)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset';

export const COMMIT_CHIP =
  'shrink-0 border-[color:var(--color-indigo-line-a32)] hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-line-a13)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset';

export type RowKey = `key:${SecretProvider}` | `local:${LocalRunnerId}` | 'jev:key' | 'jev:check';

/**
 * The status grammar, one meaning per mark: hollow = nothing here, filled grey = saved but not
 * checked in this visit, green = checked and working, amber = answered with nothing to use,
 * red = checked and failed.
 */
export type StatusTone = 'success' | 'saved' | 'warning' | 'danger' | 'idle';

export type Announce = (message: string) => void;

/**
 * A control that turns `disabled` while it works drops focus to `<body>` in Chromium and WebKit.
 * After the work, put focus back on it — but only if nothing else took focus meanwhile.
 */
export function refocusIfLost(ref: RefObject<HTMLElement | null>) {
  window.setTimeout(() => {
    const active = document.activeElement;
    if (!active || active === document.body) ref.current?.focus({ preventScroll: true });
  }, 0);
}

export function ModelGroup({
  label,
  hint,
  testId,
  term,
  children,
}: {
  label: string;
  hint?: string;
  term?: GlossaryTerm;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className="min-w-0" data-testid={testId}>
      <SettingsGroupHeading
        label={term ? <TermHint term={term}>{label}</TermHint> : label}
        trailing={
          hint ? <span className="text-label text-[color:var(--color-text-tertiary)]">{hint}</span> : undefined
        }
      />
      <div className="mt-1.5 divide-y divide-[color:var(--color-divider)] overflow-hidden rounded-card bg-[color:var(--color-overlay-2)]">
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
export function ModelRow({
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
      <div className="flex min-h-14 min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <div className="min-w-0 flex-1 basis-44">
          <p className="flex flex-wrap items-baseline gap-x-2 text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {name}
            {badge}
          </p>
          {caption ? (
            <p
              className={cn(
                'mt-0.5 text-body leading-body [overflow-wrap:anywhere]',
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
          <div ref={contentRef} className="ai-row-disclosure-body grid gap-2 px-4 pb-3">
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
export function RowStatus({
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
 * The trailing control that opens a row, staying in place while it is open. It is not drawn
 * pressed, so the row's commit action keeps the only accent; `aria-expanded` carries the state
 * and `data-row-opener` is where focus returns when the row closes.
 */
export function OpenChip({
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

export function StoredKey({ last4, checked }: { last4: string; checked: boolean }) {
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
