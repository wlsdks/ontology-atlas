'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createAnalysisTurnObserver, requestsAnalysisFindings, type AnalysisCaptureContext, type AnalysisSaveState } from './analysis-capture';
import type { AcpTurnStart } from '../use-acp-session';

/** Capture is owned alongside the conversation, independent of which dock section is visible. */
export function useAnalysisCapture(context: AnalysisCaptureContext, isAnalysisRequest: (requestText: string) => boolean = requestsAnalysisFindings) {
  const latest = useRef(context);
  useLayoutEffect(() => { latest.current = context; }, [context]);
  const [state, setState] = useState<AnalysisSaveState | null>(null);
  const onTurnStarted = useCallback((start: AcpTurnStart) => isAnalysisRequest(start.text)
    ? createAnalysisTurnObserver(context, () => latest.current, setState)(start)
    : null, [context, isAnalysisRequest]);
  return { onTurnStarted, state: state?.handle === context.handle ? state : null, setState };
}
