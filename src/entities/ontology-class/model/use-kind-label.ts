'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';

// `vault-readme` is the scaffolded root README's kind; without it the raw id would show.
const KNOWN_KINDS = ['project', 'domain', 'capability', 'element', 'document', 'vault-readme', 'unknown'] as const;
type KnownKind = (typeof KNOWN_KINDS)[number];

function isKnown(kind: string): kind is KnownKind {
  return (KNOWN_KINDS as ReadonlyArray<string>).includes(kind);
}

/**
 * A `(kind) => label` resolver for the current locale; unknown kinds fall through to the raw string.
 * Referentially stable per locale, since some callers list it in effect dependencies.
 */
export function useOntologyKindLabel() {
  const t = useTranslations('kinds');
  return useCallback((kind: string): string => (isKnown(kind) ? t(kind) : kind), [t]);
}
