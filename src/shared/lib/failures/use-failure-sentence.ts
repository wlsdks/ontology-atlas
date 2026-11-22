'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { failureCodeOf, failureDetailOf } from './failure-code';

/**
 * What a screen shows for a failure, and what it must not show.
 *
 * `sentence` is the reader's language and is the only half that may reach the page body.
 * `detail` is the machine's English and belongs in a `data-*` attribute, the console, or a
 * technical-information fold — the places a developer looks and a reader does not.
 */
export interface FailureCopy {
  sentence: string;
  detail: string | null;
}

/**
 * Unlike `useNativeErrorLookup`, an unrecognised failure falls back to the caller's translated
 * sentence, never the English detail: here the English is the whole sentence. `t.has`, so a code
 * not yet in `messages/*.json` falls back instead of throwing on a missing key.
 */
export function useFailureSentence(): (error: unknown, fallback: string) => FailureCopy {
  const t = useTranslations('failures');
  return useCallback(
    (error: unknown, fallback: string): FailureCopy => {
      const code = failureCodeOf(error);
      const sentence = code && t.has(code) ? t(code) : fallback;
      return { sentence, detail: failureDetailOf(error) };
    },
    [t],
  );
}
