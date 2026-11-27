import { createFileRoute, redirect } from '@tanstack/react-router';

import { detectLocale } from '@/i18n/detect-locale';

const STORAGE_KEY = 'ontology-atlas:locale';

function storedLocale(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * `/` decides the language and nothing else: the stored choice, else the system list. Query and hash
 * carry deep links such as `/?p=…` and arrive unchanged.
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
    throw redirect({ to: '/$locale/', params: { locale: detectLocale(languages, storedLocale()) }, search: true, hash: true });
  },
});
