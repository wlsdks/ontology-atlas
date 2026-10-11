'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import type { NativeErrorLookup } from './native-error';

/**
 * The `nativeErrors` catalogue, as the lookup the Tauri bridges take.
 *
 * A Tauri command answers with a machine code (`src-tauri/src/errors.rs`), never a
 * finished sentence, because Rust cannot know which language the reader chose. This
 * is where that choice is applied. `t.has` rather than a hard-coded list: a code
 * minted in Rust and not yet written here falls through to the English detail, which
 * still says something true, instead of throwing on a missing key.
 */
export function useNativeErrorLookup(): NativeErrorLookup {
  const t = useTranslations('nativeErrors');
  return useCallback((code: string) => (t.has(code) ? t(code) : undefined), [t]);
}
