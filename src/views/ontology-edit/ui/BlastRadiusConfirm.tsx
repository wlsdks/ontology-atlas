'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, X } from 'lucide-react';
import type { VaultBacklinkMatch } from '../lib/find-vault-backlinks';

interface Props {
  open: boolean;
  /** Slug being deleted. */
  slug: string;
  /** Optional human title — when present, shown next to the slug. */
  title?: string;
  /** Backlinks discovered via findVaultBacklinks(). 0 length is a clean delete. */
  backlinks: VaultBacklinkMatch[];
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Blast-radius confirm modal — replaces the window.confirm() before vault
 * doc delete. Visualizes the affected nodes (slug + title + which
 * frontmatter key matched) so the user can decide consciously.
 *
 * Eval Feature power F5 ("launch demo's hero moment") — the data was
 * already in `find-vault-backlinks.ts`; we just promote it from a single
 * confirm sentence to a richer dialog. Mirrors the MCP `delete_concept`
 * tool's two-stage guard but with a visual surface humans can act on.
 *
 * Pattern matches existing ManualNodeCreateModal / ManualEdgeCreateModal:
 * focus-trap-light (auto-focus cancel button), Esc to cancel, click
 * outside the panel to cancel.
 */
export function BlastRadiusConfirm({ open, slug, title, backlinks, onCancel, onConfirm }: Props) {
  const t = useTranslations('ontologyPages.edit.page.blastRadius');
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  // Auto-focus the safe action (cancel) so accidental Enter does not
  // trigger destructive delete. mirrors browser confirm() default-no.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const hasBacklinks = backlinks.length > 0;
  const previewCount = Math.min(backlinks.length, 8);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="blast-radius-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[color:rgba(8,9,10,0.7)] px-4 py-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
        <header className="flex items-start justify-between gap-3 border-b border-[color:var(--color-divider)] px-6 py-4">
          <div className="flex items-start gap-3">
            <span
              className={
                hasBacklinks
                  ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color:rgba(229,72,77,0.4)] bg-[color:rgba(229,72,77,0.14)] text-[color:rgba(255,141,138,0.95)]'
                  : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color:rgba(244,183,49,0.4)] bg-[color:rgba(244,183,49,0.14)] text-[color:rgba(238,198,128,0.95)]'
              }
              aria-hidden
            >
              <AlertTriangle size={16} />
            </span>
            <div>
              <p
                id="blast-radius-title"
                className="text-[15px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
              >
                {hasBacklinks ? t('titleWithBacklinks', { count: backlinks.length }) : t('titleClean')}
              </p>
              <p className="mt-1 font-mono text-[11px] text-[color:var(--color-text-tertiary)]">
                {title ? `${title} · ${slug}` : slug}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('closeAriaLabel')}
            className="shrink-0 rounded-md p-1 text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-6 py-4">
          <p className="text-[13px] leading-relaxed text-[color:var(--color-text-secondary)]">
            {hasBacklinks ? t('bodyWithBacklinks') : t('bodyClean')}
          </p>

          {hasBacklinks ? (
            <div className="mt-4 max-h-64 overflow-y-auto rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)]">
              <ul className="divide-y divide-[color:var(--color-divider)]">
                {backlinks.slice(0, previewCount).map((b) => (
                  <li key={b.slug} className="px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[13px] text-[color:var(--color-text-primary)]">
                        {b.title}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                        {b.matchedKeys.join(' · ')}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-[color:var(--color-text-tertiary)]">
                      {b.slug}
                    </p>
                  </li>
                ))}
              </ul>
              {backlinks.length > previewCount ? (
                <p className="border-t border-[color:var(--color-divider)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                  {t('moreCount', { count: backlinks.length - previewCount })}
                </p>
              ) : null}
            </div>
          ) : null}

          <p className="mt-4 text-[12px] text-[color:var(--color-text-tertiary)]">
            {hasBacklinks ? t('hintWithBacklinks') : t('hintClean')}
          </p>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[color:var(--color-divider)] px-6 py-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-4 text-[12px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(139,151,255,0.32)] hover:text-[color:var(--color-text-primary)]"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              hasBacklinks
                ? 'inline-flex h-9 items-center rounded-md border border-[color:rgba(229,72,77,0.4)] bg-[color:rgba(229,72,77,0.14)] px-4 text-[12px] font-[var(--font-weight-signature)] text-[color:rgba(255,141,138,0.95)] transition-colors hover:border-[color:rgba(229,72,77,0.6)] hover:bg-[color:rgba(229,72,77,0.2)]'
                : 'inline-flex h-9 items-center rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-4 text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(139,151,255,0.32)]'
            }
          >
            {hasBacklinks ? t('confirmWithBacklinks') : t('confirmClean')}
          </button>
        </footer>
      </div>
    </div>
  );
}
