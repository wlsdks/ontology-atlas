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
 * The `failures` catalogue, as the lookup a catch site takes.
 *
 * The sibling of `useNativeErrorLookup` for failures thrown inside the web app rather than
 * returned by a Tauri command, and it differs from that one in exactly one way: **an
 * unrecognised failure falls back to the caller's own translated sentence, never to the
 * English detail.** `nativeErrorMessage` may degrade to English because a Rust detail is a
 * machine fact appended to a Korean sentence; here the English *is* the sentence, and
 * showing it is the B2 defect (installed-app inspection before v1.2.2).
 *
 * `t.has` rather than a hard-coded list, so a code minted at a throw site and not yet
 * written into `messages/*.json` falls back to the caller's sentence instead of throwing
 * on a missing key.
 */
export function useFailureSentence(): (err: unknown, fallback: string) => FailureCopy {
  const t = useTranslations('failures');
  return useCallback(
    (err: unknown, fallback: string): FailureCopy => {
      const code = failureCodeOf(err);
      const sentence = code && t.has(code) ? t(code) : fallback;
      return { sentence, detail: failureDetailOf(err) };
    },
    [t],
  );
}
