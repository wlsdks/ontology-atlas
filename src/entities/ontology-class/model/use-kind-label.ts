'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';

// vault-readme: scaffold 한 vault root 의 README.md 가 갖는 sentinel kind.
// 6 정식 kind 외 i18n 라벨이 잡히지 않으면 사용자가 raw "vault-readme" 텍스트를
// 보던 회귀 — i18n 키는 messages 에 이미 있어서 단순 list 추가로 wire.
const KNOWN_KINDS = ['project', 'domain', 'capability', 'element', 'document', 'vault-readme', 'unknown'] as const;
type KnownKind = (typeof KNOWN_KINDS)[number];

function isKnown(kind: string): kind is KnownKind {
  return (KNOWN_KINDS as ReadonlyArray<string>).includes(kind);
}

/**
 * Locale-aware ontology kind label resolver.
 *
 * Returns a `(kind: string) => string` function that maps the canonical
 * kind id (`project` / `domain` / `capability` / `element` / `document` /
 * `unknown`) to the localized display label. Unknown kinds (e.g. user-
 * defined custom kinds) fall through to the raw kind string so we never
 * render an empty chip.
 *
 * Use this hook from any client component that renders a kind label —
 * tree chips, ego graph, search results, builder palette, inspector,
 * insights breakdown. The pure `getOntologyKindLabel` is kept for vault
 * data / non-i18n contexts (tests, build scripts).
 *
 * The returned function is **referentially stable** for a given locale — some
 * callers put it in a `useEffect` dependency array (`VaultDiffToaster`, which
 * labels vault-change toasts). A fresh closure per render would re-run those
 * effects on every render.
 */
export function useOntologyKindLabel() {
  const t = useTranslations('kinds');
  return useCallback((kind: string): string => (isKnown(kind) ? t(kind) : kind), [t]);
}
