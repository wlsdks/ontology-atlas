'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import type { ActionFeedbackState } from '@/shared/motion/action-feedback-glyph';
import { summarizeAddSources, type AddSourcesOutcome } from '../lib/add-sources';

type ImportPhase = 'picking' | 'importing' | 'feedback' | 'idle';

export function useSourceImportFeedback(scope: unknown) {
  const [context, setContext] = useState({ scope, epoch: 0 });
  if (!Object.is(context.scope, scope)) setContext({ scope, epoch: context.epoch + 1 });
  const [operation, setOperation] = useState<{ epoch: number; phase: ImportPhase } | null>(null);
  const generation = useRef({ value: 0 });
  const live = useRef({ mounted: false, epoch: context.epoch });
  const { state: feedback, settle } = useCopyFeedback();
  useLayoutEffect(() => {
    const lifecycle = { mounted: true, epoch: context.epoch };
    const tokens = generation.current;
    live.current = lifecycle;
    return () => { lifecycle.mounted = false; tokens.value++; };
  }, [context.epoch]);

  const begin = useCallback(() => {
    const epoch = context.epoch;
    const token = ++generation.current.value;
    const current = () => live.current.mounted && live.current.epoch === epoch && generation.current.value === token;
    const change = (phase: ImportPhase) => { if (current()) setOperation({ epoch, phase }); };
    change('picking');
    return {
      importing: () => change('importing'),
      finish: (outcome: AddSourcesOutcome) => {
        if (!current()) return;
        const { added, failed } = summarizeAddSources(outcome);
        if (outcome.cancelled || (added === 0 && failed === 0)) { change('idle'); return; }
        settle(failed > 0 ? 'failed' : 'done');
        change('feedback');
      },
      fail: () => { if (current()) { settle('failed'); change('feedback'); } },
    };
  }, [context.epoch, settle]);

  const phase = operation?.epoch === context.epoch ? operation.phase : 'idle';
  const state: ActionFeedbackState = phase === 'importing' ? 'working' : phase === 'feedback' ? feedback : 'idle';
  return { state, begin };
}
