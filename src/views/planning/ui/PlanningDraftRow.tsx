'use client';

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { isImeComposing } from '@/shared/lib/keyboard/ime-composition';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { EXIT_TRANSITION, MOTION, useExitLockout } from '@/shared/motion';
import { Input } from '@/shared/ui/fields/input';

/**
 * The rules a new document's title follows wherever it is typed: Enter submits a non-empty title
 * unless an input method is composing, a busy create keeps the text, and Escape cancels where there
 * is something to cancel.
 */
export function usePlanningTitle({ busy, failed, onSubmit, onCancel }: { busy: boolean; failed: boolean; onSubmit: (title: string) => void; onCancel?: () => void }) {
  const t = useTranslations('planning');
  const [title, setTitle] = useState('');
  const submittable = !busy && title.trim() !== '';
  const submit = () => { if (submittable) onSubmit(title); };
  const field = {
    'aria-label': t('documentTitle'),
    placeholder: t('documentTitle'),
    value: title,
    readOnly: busy,
    error: failed ? t('createDocumentFailed') : undefined,
    onChange: (event: ChangeEvent<HTMLInputElement>) => setTitle(event.target.value),
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (isImeComposing(event)) return;
      if (event.key === 'Enter') { event.preventDefault(); submit(); }
      else if (event.key === 'Escape' && onCancel) { event.preventDefault(); event.stopPropagation(); onCancel(); }
    },
  };
  return { field, submit, submittable };
}

/** The title field for a new home document, opening in place at the top of the file list. */
export function PlanningDraftRow({ busy, failed, onSubmit, onCancel }: { busy: boolean; failed: boolean; onSubmit: (title: string) => void; onCancel: () => void }) {
  const reduced = usePrefersReducedMotion();
  const { field: fieldProps } = usePlanningTitle({ busy, failed, onSubmit, onCancel });
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
      <Input ref={field} {...fieldProps} className="w-full" />
    </div>
  </motion.div>;
}
