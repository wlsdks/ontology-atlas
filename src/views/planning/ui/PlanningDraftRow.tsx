'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { isImeComposing } from '@/shared/lib/keyboard/ime-composition';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { EXIT_TRANSITION, MOTION, useExitLockout } from '@/shared/motion';
import { Input } from '@/shared/ui/fields/input';

/** The title field for a new home document, opening in place at the top of the file list. */
export function PlanningDraftRow({ busy, failed, onSubmit, onCancel }: { busy: boolean; failed: boolean; onSubmit: (title: string) => void; onCancel: () => void }) {
  const t = useTranslations('planning');
  const reduced = usePrefersReducedMotion();
  const [title, setTitle] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const { ref, onAnimationStart } = useExitLockout<HTMLDivElement>();
  useEffect(() => { field.current?.focus({ preventScroll: true }); }, []);
  return <motion.div
    ref={ref}
    onAnimationStart={onAnimationStart}
    data-planning-draft
    initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
    animate={{ height: 'auto', opacity: 1 }}
    exit={reduced ? { opacity: 0, transition: EXIT_TRANSITION } : { height: 0, opacity: 0, transition: EXIT_TRANSITION }}
    transition={reduced ? MOTION.fast : MOTION.base}
    className="overflow-hidden"
  >
    <div className="p-1 pb-2">
      <Input
        ref={field}
        aria-label={t('documentTitle')}
        placeholder={t('documentTitle')}
        value={title}
        readOnly={busy}
        error={failed ? t('createDocumentFailed') : undefined}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (isImeComposing(event)) return;
          if (event.key === 'Enter') { event.preventDefault(); if (title.trim()) onSubmit(title); }
          else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
        }}
        className="w-full"
      />
    </div>
  </motion.div>;
}
