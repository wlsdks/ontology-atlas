import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';

import { buildOntologyChangeSet } from '@/entities/knowledge-graph';
import { EXIT_WINDOW_MS, useHeldValue } from '@/shared/lib/use-presence';
import { MOTION } from '@/shared/motion';

import type { ChatT, SessionState } from './types';

export function usePermissionReview({
  pending,
  inputRef,
  setDraft,
  t,
}: {
  pending: SessionState['pending'];
  inputRef: RefObject<HTMLTextAreaElement | null>;
  setDraft: Dispatch<SetStateAction<string>>;
  t: ChatT;
}) {
  const pendingHeld = useHeldValue(
    pending,
    pending?.request.toolCallId ?? pending?.request.filePath ?? null,
  );
  const pendingHeldChangeSet = useMemo(
    () =>
      pendingHeld?.request.reviewKind === 'ontology-write' && pendingHeld.request.toolName
        ? buildOntologyChangeSet(pendingHeld.request.toolName, pendingHeld.request.rawInput)
        : null,
    [pendingHeld],
  );
  const [deferredPermission, setDeferredPermission] = useState<typeof pending>(null);
  const livePendingRef = useRef(pending);
  useLayoutEffect(() => { livePendingRef.current = pending; }, [pending]);
  const permissionDeferred = pending !== null && deferredPermission === pending;

  const [declinedToolIds, setDeclinedToolIds] = useState<ReadonlySet<string>>(() => new Set());

  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  const requestComposerFocus = useCallback(() => setComposerFocusRequest((count) => count + 1), []);
  const noteVerdict = useCallback(
    (request: { toolCallId?: string | null; options: ReadonlyArray<{ optionId: string; kind: string }> }, optionId: string | null) => {
      const chosen = request.options.find((option) => option.optionId === optionId);
      const declined = optionId === null || chosen?.kind === 'reject_once' || chosen?.kind === 'reject_always';
      const id = request.toolCallId;
      if (declined && id) setDeclinedToolIds((current) => (current.has(id) ? current : new Set(current).add(id)));

      requestComposerFocus();
    },
    [requestComposerFocus],
  );
  const [answerHold, setAnswerHold] = useState(0);
  useEffect(() => {
    if (answerHold === 0) return;
    const id = window.setTimeout(() => setAnswerHold(0), EXIT_WINDOW_MS + MOTION.settle.duration * 1000);
    return () => window.clearTimeout(id);
  }, [answerHold]);
  const pendingForCard = useMemo(
    () => (pendingHeld
      ? {
          ...pendingHeld,
          resolve: (optionId: string | null) => {
            noteVerdict(pendingHeld.request, optionId);
            pendingHeld.resolve(optionId);
            setAnswerHold((count) => count + 1);
          },
        }
      : null),
    [noteVerdict, pendingHeld],
  );
  const requestCorrection = () => {
    if (!pendingHeld || livePendingRef.current !== pendingHeld) return;
    const rejected = pendingHeld.request.options.find((option) => option.kind === 'reject_once');
    const correction = t('permission.correctionDraft', {
      task: pendingHeld.origin?.task?.outcome ?? pendingHeld.origin?.turn?.text ?? '',
      target: pendingHeldChangeSet?.items.map((item) => item.target).join(', ') ?? pendingHeld.request.toolName ?? '',
      requestId: String(pendingHeld.request.requestId ?? pendingHeld.request.toolCallId ?? ''),
    });
    livePendingRef.current = null;
    noteVerdict(pendingHeld.request, rejected?.optionId ?? null);
    pendingHeld.resolve(rejected?.optionId ?? null);
    setAnswerHold((count) => count + 1);
    setDeferredPermission(null);
    setDraft((existing) => existing.trim() ? `${existing}\n\n${correction}` : correction);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };
  return {
    pendingHeld,
    pendingHeldChangeSet,
    pendingForCard,
    deferredPermission,
    setDeferredPermission,
    livePendingRef,
    permissionDeferred,
    declinedToolIds,
    composerFocusRequest,
    requestComposerFocus,
    answerHold,
    requestCorrection,
  };
}
