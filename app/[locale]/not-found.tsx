"use client";

import { NotFoundScreen } from "@/views/terminal-state";

/**
 * A 404 inside a locale segment. `NextIntlClientProvider` is already mounted by the locale
 * layout, so the shared screen reads it directly. Same component as the root `not-found.tsx`.
 */
export default function LocaleNotFound() {
  return <NotFoundScreen />;
}
