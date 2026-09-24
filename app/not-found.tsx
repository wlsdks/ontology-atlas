"use client";

import { NotFoundScreen } from "@/views/terminal-state";

/**
 * The 404 for every unresolved path. Under `output: 'export'` the static host serves this root
 * file even for `/ko/…`, and the root layout mounts no intl provider, so the screen brings its
 * own (`standalone`): locale from the URL's first segment, `<html lang>` set to match.
 * `app/[locale]/not-found.tsx` renders the same component, so the twins cannot drift.
 */
export default function NotFound() {
  return <NotFoundScreen standalone />;
}
