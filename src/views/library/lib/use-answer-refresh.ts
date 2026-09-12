"use client";

import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import {
  answerRefreshBrief, answerRevisionStore, buildAnswerRevision,
  prepareAnswerRefresh, saveAnswerRevision, type AnswerRefreshSnapshot,
} from '@/features/library';
import { codedFailure } from '@/shared/lib/failure-code';
import { useFailureSentence, type FailureCopy } from '@/shared/lib/use-failure-sentence';

interface RefreshTurn {
  id: number;
  snapshot: AnswerRefreshSnapshot;
  writer: string;
}

interface RefreshState {
  phase: 'idle' | 'preparing' | 'running' | 'review' | 'saving';
  snapshot: AnswerRefreshSnapshot | null;
  proposal: ReturnType<typeof buildAnswerRevision> | null;
  /**
   * **Not a string.** It used to be `error.message`, and on a Korean screen that meant
   * "The retained question or its history cannot be read." in the page body (installed-app
   * inspection before v1.2.2, B2). A `FailureCopy` carries the translated sentence and keeps the
   * English where only a developer looks, and its type is what stops a raw message being put back.
   */
  error: FailureCopy | null;
}

const INITIAL: RefreshState = { phase: 'idle', snapshot: null, proposal: null, error: null };

export function useAnswerRefresh({ handle, sources, writer, vaultRoot, start }: {
  handle: FileSystemDirectoryHandle | null;
  sources: readonly { path: string }[];
  writer: string;
  vaultRoot: string | null;
  start: (text: string, kind: 'refresh') => void;
}) {
  const t = useTranslations('library');
  const failureCopy = useFailureSentence();
  /** Every catch below turns a thrown failure into copy here, so no branch can skip the step. */
  const copyOf = useCallback(
    (error: unknown): FailureCopy => failureCopy(error, t('answers.refreshFailed')),
    [failureCopy, t],
  );
  const [state, setState] = useState<RefreshState>(INITIAL);
  const generation = useRef(0);
  const pending = useRef<RefreshTurn | null>(null);
  const locked = useRef(false);

  const begin = useCallback(async (slug: string) => {
    if (!handle || !vaultRoot || locked.current) return;
    locked.current = true;
    const id = ++generation.current;
    pending.current = null;
    setState({ ...INITIAL, phase: 'preparing' });
    try {
      const snapshot = await prepareAnswerRefresh(answerRevisionStore(handle), slug, sources.map((source) => source.path));
      if (generation.current !== id) return;
      pending.current = { id, snapshot, writer };
      setState({ phase: 'running', snapshot, proposal: null, error: null });
      start(answerRefreshBrief({
        question: snapshot.question, previousSlug: slug, previousText: snapshot.previousText,
        vaultRoot, sources: snapshot.sourcePaths,
      }), 'refresh');
    } catch (error) {
      if (generation.current === id) setState({ ...INITIAL, error: copyOf(error) });
    } finally { locked.current = false; }
  }, [copyOf, handle, sources, start, vaultRoot, writer]);

  const capture = useCallback(() => pending.current, []);
  const receive = useCallback((turn: RefreshTurn, response: string | null, outcome: string) => {
    if (generation.current !== turn.id || pending.current !== turn) return;
    pending.current = null;
    if (outcome !== 'completed' || !response?.trim()) {
      setState({ phase: 'idle', snapshot: turn.snapshot, proposal: null, error: copyOf(codedFailure('answer-turn-incomplete', outcome)) });
      return;
    }
    try {
      const proposal = buildAnswerRevision({ ...turn.snapshot, response, writer: turn.writer, now: new Date(), knownSources: turn.snapshot.sourcePaths });
      setState({ phase: 'review', snapshot: turn.snapshot, proposal, error: null });
    } catch (error) {
      setState({ phase: 'idle', snapshot: turn.snapshot, proposal: null, error: copyOf(error) });
    }
  }, [copyOf]);

  const save = useCallback(async () => {
    if (!handle || !state.snapshot || !state.proposal || state.proposal.problems.length || locked.current) return null;
    const id = generation.current;
    locked.current = true;
    setState((current) => ({ ...current, phase: 'saving', error: null }));
    try {
      const result = await saveAnswerRevision(answerRevisionStore(handle), state.snapshot, state.proposal);
      if (generation.current === id) setState(INITIAL);
      return result;
    } catch (error) {
      if (generation.current === id) setState((current) => ({ ...current, phase: 'review', error: copyOf(error) }));
      return null;
    } finally { locked.current = false; }
  }, [copyOf, handle, state.proposal, state.snapshot]);

  const dismiss = useCallback(() => {
    if (locked.current) return;
    generation.current += 1;
    pending.current = null;
    setState(INITIAL);
  }, []);

  return { ...state, begin, capture, receive, save, dismiss };
}
