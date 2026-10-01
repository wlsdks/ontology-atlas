'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { FolderOpen, History } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

import {
  EXIT_TRANSITION,
  MOTION,
  SHEET_RISE,
  SHEET_SETTLED,
  useExitLockout,
} from '@/shared/motion';
import { Button, CloseButton } from '@/shared/ui';

export interface RecentChangesNeedsVaultDialogProps {
  open: boolean;
  /** Which feature needs the folder; each has its own reason, so its own sentence. */
  copyKey?: 'recentChangesNeedsVault' | 'createNeedsVault' | 'editNeedsVault';
  onClose: () => void;
  /** "Open my folder" — must be the **same** handler the first-run card uses. */
  onOpenVault: () => void;
}

/**
 * On the sample, recent changes cannot mean anything before a folder opens, so the press leads
 * to opening one (`.claude/rules/surfaces.md`: why and where). An opened folder with zero
 * changes stays disabled. Same scrim contract as `AgentConnectSheet` (`.claude/rules/design.md`).
 */
export function RecentChangesNeedsVaultDialog({
  open,
  onClose,
  onOpenVault,
  copyKey = 'recentChangesNeedsVault',
}: RecentChangesNeedsVaultDialogProps) {
  const t = useTranslations(`topology.${copyKey}`);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const { ref: scrimLockoutRef, onAnimationStart: scrimLockoutOnAnimationStart } = useExitLockout<HTMLDivElement>();
  const { ref: dialogLockoutRef, onAnimationStart: dialogLockoutOnAnimationStart } = useExitLockout<HTMLDivElement>();

  // The latest `onClose` without re-running the open effect, which would steal focus back.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    // Every close returns focus to the control that opened it, or it falls to BODY.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // On open, focus goes to **the next action** — that is this surface's only job.
    primaryRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={scrimLockoutRef}
          data-interactive-overlay="true"
          onAnimationStart={scrimLockoutOnAnimationStart}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: EXIT_TRANSITION }}
          transition={MOTION.base}
          onClick={onClose}
          data-testid="recent-changes-needs-vault-scrim"
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--color-backdrop-medium)] p-6"
        >
          <motion.section
            ref={dialogLockoutRef}
            onAnimationStart={dialogLockoutOnAnimationStart}
            initial={SHEET_RISE}
            animate={SHEET_SETTLED}
            exit={{ ...SHEET_RISE, transition: EXIT_TRANSITION }}
            transition={MOTION.base}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t('title')}
            data-testid="recent-changes-needs-vault-dialog"
            className="w-full max-w-[var(--dialog-w-sm)] rounded-[var(--radius-panel)] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-3)]"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-5 py-4">
              <div>
                <p className="flex items-center gap-1.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-indigo-accent)]">
                  <History size={ICON_SIZE.sm} aria-hidden />
                  {t('eyebrow')}
                </p>
                <p className="mt-1.5 text-body-lg text-[color:var(--color-text-primary)]">{t('title')}</p>
              </div>
              <CloseButton
                onClick={onClose}
                label={t('close')}
                data-testid="recent-changes-needs-vault-close"
              />
            </header>

            <div className="px-5 py-4">
              <p className="text-body text-[color:var(--color-text-secondary)]">{t('body')}</p>
              {/* The standard `<Button>` shape; the adoption ratchet counts hand-written classNames. */}
              <Button
                ref={primaryRef}
                onClick={() => {
                  onClose();
                  onOpenVault();
                }}
                data-testid="recent-changes-needs-vault-open"
                className="mt-4 w-full"
              >
                <FolderOpen size={ICON_SIZE.md} aria-hidden />
                {t('action')}
              </Button>
              {/* One action: the header's X and the scrim already close it. */}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
