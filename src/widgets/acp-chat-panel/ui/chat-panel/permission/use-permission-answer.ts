'use client';

import { useEffect, useState } from 'react';

import { EXIT_WINDOW_MS } from '@/shared/lib/render-timing/use-presence';

export type Answer = 'allow' | 'reject' | 'correct' | 'always';

/**
 * The answer given to one request, keyed by `reviewStateKey` so a new request starts unanswered.
 * `answerWith` runs the answer once: a second press after it settled does nothing, and a throwing
 * send is recorded as failed so the person can try again.
 */
export function usePermissionAnswer(reviewStateKey: string) {
  const [answer, setAnswer] = useState<{ key: string; choice: Answer; outcome: 'done' | 'failed' } | null>(null);
  const answered = answer?.key === reviewStateKey ? answer.choice : null;
  const outcome = answer?.key === reviewStateKey ? answer.outcome : null;
  const failed = outcome === 'failed';
  const settled = outcome === 'done';
  const [receiptKey, setReceiptKey] = useState<string | null>(null);
  const [answerInReach, setAnswerInReach] = useState<'allow' | 'reject' | null>(null);
  const receiptReady = settled && receiptKey === reviewStateKey;
  useEffect(() => {
    if (!settled) return;
    const id = window.setTimeout(() => setReceiptKey(reviewStateKey), EXIT_WINDOW_MS * 2);
    return () => window.clearTimeout(id);
  }, [settled, reviewStateKey]);

  const answerWith = (choice: Answer, action: () => void) => {
    if (settled) return;
    try {
      action();
    } catch {
      setAnswer({ key: reviewStateKey, choice, outcome: 'failed' });
      return;
    }
    setAnswer({ key: reviewStateKey, choice, outcome: 'done' });
  };
  const showReceipt = () => setReceiptKey(reviewStateKey);

  return { answered, outcome, failed, settled, receiptReady, showReceipt, answerInReach, setAnswerInReach, answerWith };
}
