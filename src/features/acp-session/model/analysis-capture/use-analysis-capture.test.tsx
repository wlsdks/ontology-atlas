import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AcpTurnStart } from '../use-acp-session';
import { ANALYSIS_FINDINGS_INSTRUCTION, type AnalysisCaptureContext } from './analysis-capture';
import { useAnalysisCapture } from './use-analysis-capture';

const context: AnalysisCaptureContext = {
  mode: 'meaning', surface: 'map', handle: {} as FileSystemDirectoryHandle, writable: true, fileHandles: new Map(),
  scope: { projectSlug: null, projectUid: null, targetSlugs: [], profileSlug: null },
  graph: { nodes: [], edges: [] }, sourceFingerprint: null, profileHash: null,
};
const turn = (text: string): AcpTurnStart => ({
  runtimeId: 'test', sessionId: 's-1', vaultRoot: '/vault', userEventId: 'u-1', text, startedAt: '2026-11-16T10:00:00.000Z',
});

describe('which turns become an analysis record', () => {
  it('leaves an ordinary chat turn unrecorded', () => {
    const { result } = renderHook(() => useAnalysisCapture(context));
    expect(result.current.onTurnStarted(turn('What does the refund capability own?'))).toBeNull();
  });
  it('records a turn whose request asks for the findings block', () => {
    const { result } = renderHook(() => useAnalysisCapture(context));
    expect(result.current.onTurnStarted(turn(`Review the meaning.\n${ANALYSIS_FINDINGS_INSTRUCTION}`))).toBeTypeOf('function');
  });
  it('records every turn for a caller that selects its own requests', () => {
    const { result } = renderHook(() => useAnalysisCapture(context, () => true));
    expect(result.current.onTurnStarted(turn('Investigate the selected concepts.'))).toBeTypeOf('function');
  });
});
