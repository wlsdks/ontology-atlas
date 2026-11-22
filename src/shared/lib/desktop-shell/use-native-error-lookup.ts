'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import type { NativeErrorLookup } from './native-error';

/**
 * The `nativeErrors` catalogue as the lookup the Tauri bridges take: a command answers with a machine
 * code (`src-tauri/src/coded_error.rs`) because Rust cannot know the reader's language. `t.has` rather than
 * a hard-coded list, so a code not yet written here falls through to the English detail instead of
 * throwing on a missing key.
 */
export function useNativeErrorLookup(): NativeErrorLookup {
  const t = useTranslations('nativeErrors');
  return useCallback((code: string) => (t.has(code) ? t(code) : undefined), [t]);
}
