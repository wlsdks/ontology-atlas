import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../../messages/en.json';
import { deskLine } from '@/features/vault-vectors/model/desk-line';
import { OFF_VECTOR_STATUS, type VectorFailure } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import type { MeaningRun } from '../model/meaning-run';
import { useMeaningRunCopy } from './use-meaning-run-copy';

const FAILURES: VectorFailure[] = ['download', 'modelCheck', 'needsDirect', 'diskShort', 'modelGone', 'runnerDown', 'modelMissing', 'modelFailed', 'write', 'auditBlocked', 'unreadable'];

describe("the seat's sentence for a failed meaning run", () => {
  it.each(FAILURES.flatMap((failure) => [[failure, null], [failure, { doneBytes: 412_000_000, totalBytes: 2_288_243_938, checking: false }]] as const))(
    'is the desk sentence formatted from the line values alone (%s, kept %o)',
    (failure, model) => {
      const line = deskLine({
        status: { ...OFF_VECTOR_STATUS, phase: 'failed', failure, failureDetail: 'embed-model-not-ready', model },
        isApp: true, indexOn: true, markdownFiles: 10, runnerModel: 'bge-m3:latest',
      })!;
      const run = { phase: 'failed', failure: { message: line.message, values: line.values } } as unknown as MeaningRun;
      const onError = vi.fn();
      const wrapper = ({ children }: { children: ReactNode }) => (
        <NextIntlClientProvider locale="en" messages={en} onError={onError}>{children}</NextIntlClientProvider>
      );
      const { result } = renderHook(() => useMeaningRunCopy(run, null), { wrapper });
      expect(onError).not.toHaveBeenCalled();
      expect(JSON.stringify(result.current.line)).not.toContain('questionDesk');
    },
  );

  it('names what a cut-off download kept', () => {
    const line = deskLine({
      status: { ...OFF_VECTOR_STATUS, phase: 'failed', failure: 'modelGone', model: { doneBytes: 412_000_000, totalBytes: 2_288_243_938, checking: false } },
      isApp: true, indexOn: true, markdownFiles: 10, runnerModel: null,
    })!;
    const run = { phase: 'failed', failure: { message: line.message, values: line.values } } as unknown as MeaningRun;
    const wrapper = ({ children }: { children: ReactNode }) => <NextIntlClientProvider locale="en" messages={en}>{children}</NextIntlClientProvider>;
    const { result } = renderHook(() => useMeaningRunCopy(run, null), { wrapper });
    expect(JSON.stringify(result.current.line)).toContain('412 MB of 2.3 GB');
  });
});
