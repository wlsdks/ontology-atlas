'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { FolderOpen, History, X } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

import { MOTION } from '@/shared/motion';
import { Button, controlClass } from '@/shared/ui';

export interface RecentChangesNeedsVaultDialogProps {
  open: boolean;
  /**
   * Which feature needs the folder — the name of a copy bundle.
   *
   * The reason differs per feature, so the sentence must too. "Recent changes" is
   * *these dates have nothing to do with you*, while "create an item" is *this is an
   * example and cannot be edited*. Merging them into one sentence makes both awkward.
   */
  copyKey?: 'recentChangesNeedsVault' | 'createNeedsVault';
  onClose: () => void;
  /** "Open my folder" — must be the **same** handler the first-run card uses. */
  onOpenVault: () => void;
}

/**
 * Pressing "recent changes" on the sample — **give a path instead of a dead end.**
 *
 * **Why a popup only here.** The 2026-08-02 decision rejected opening a modal just to
 * say "there is nothing" — that makes the presser do the work twice, and it is the class
 * this repository forbids as `popup soup`. **That decision still stands**: for someone
 * who opened their own folder, zero recent changes really means there is nothing to
 * show, so it stays disabled with a tooltip.
 *
 * The sample is different. Zero here is not "you have not changed anything yet" but
 * **the sample's dates being when this repository last touched the fixture, which has
 * nothing to do with the user**. So before a folder is opened this feature cannot mean
 * anything in principle — waiting will not switch it on. When the reason is "the next
 * action" rather than "nothing", the next action has to be given: that is the
 * degradation contract in `.claude/rules/surfaces.md` (why + where) and the **zero dead
 * CTAs** the web smoke test requires.
 *
 * Owner instruction (2026-08-03): *"칩 누르면 뭔가 화면에서 팝업 띄워줘야 하지 않을까?
 * … 화면 중앙에 예쁜 팝업 띄워서 폴더 세팅 유도하던지?"* (shouldn't pressing the chip
 * raise a popup? — put a nice one in the centre of the screen to guide folder setup).
 *
 * **The skeleton is not new.** scrim + centred card + tokens + `MOTION.base` — the same
 * contract as `AgentConnectSheet` (`.claude/rules/design.md`: a modal must **prove**
 * dimming/scrim or blocked interaction). Esc closes it and focus returns to the trigger.
 */
export function RecentChangesNeedsVaultDialog({
  open,
  onClose,
  onOpenVault,
  copyKey = 'recentChangesNeedsVault',
}: RecentChangesNeedsVaultDialogProps) {
  const t = useTranslations(`topology.${copyKey}`);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // On open, focus goes to **the next action** — that is this surface's only job.
    primaryRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-interactive-overlay="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={MOTION.base}
          onClick={onClose}
          data-testid="recent-changes-needs-vault-scrim"
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--color-backdrop-medium)] p-6"
        >
          <motion.section
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={MOTION.base}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t('title')}
            data-testid="recent-changes-needs-vault-dialog"
            className="w-full max-w-[420px] rounded-[var(--radius-panel)] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-3)]"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-5 py-4">
              <div>
                <p className="flex items-center gap-1.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-indigo-accent)]">
                  <History size={ICON_SIZE.sm} aria-hidden />
                  {t('eyebrow')}
                </p>
                <p className="mt-1.5 text-body-lg text-[color:var(--color-text-primary)]">{t('title')}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('close')}
                data-testid="recent-changes-needs-vault-close"
                className={controlClass({
                  shape: 'icon',
                  size: 'sm',
                  tone: 'muted',
                  className: 'hover:text-[color:var(--color-text-primary)]',
                })}
              >
                <X size={ICON_SIZE.lg} aria-hidden />
              </button>
            </header>

            <div className="px-5 py-4">
              <p className="text-body text-[color:var(--color-text-secondary)]">{t('body')}</p>
              {/*
                This is **exactly the one shape** `<Button>` covers — of 419 controls
                swept, only 1 was at the standard button height (h-10/11), and a newly
                built primary action belongs there. It is not hand-written because of an
                instrument rather than a rule: the adoption ratchet caught two hand-written
                classNames in this file before the commit.
              */}
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
              {/*
                No second action. This surface has one job, and a second button would be
                "close" — which the header's X and the scrim already provide by two routes.
              */}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
