import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import en from '../../../../messages/en.json';
import type { MeaningRun } from '../model/meaning-run';
import { useMeaningRunCopy } from './use-meaning-run-copy';

const wrapper = ({ children }: { children: ReactNode }) => <NextIntlClientProvider locale="en" messages={en}>{children}</NextIntlClientProvider>;

describe("the seat's words for a meaning run that ended without finishing", () => {
  it.each(['failed', 'stopped'] as const)('say the failure as the app layer wrote it (%s)', (phase) => {
    const failure = 'The model could not run on this computer: it did not answer in time.';
    const run = { phase, failure } as unknown as MeaningRun;
    const { result } = renderHook(() => useMeaningRunCopy(run, null), { wrapper });
    expect(result.current.line).toBe(failure);
  });
});
