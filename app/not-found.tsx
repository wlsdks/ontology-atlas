import { NotFoundScreen } from "@/views/terminal-state";
import { NOT_FOUND_PICK, pickStandaloneMessages } from "@/i18n/standalone-messages";

/**
 * The 404 for every unresolved path. Under `output: 'export'` the static host serves this root
 * file even for `/ko/…`, and the root layout mounts no intl provider, so the screen brings its
 * own: locale from the URL's first segment, `<html lang>` set to match.
 *
 * This file stays a **server component** so it can pick the few namespaces the screen reads
 * and pass them as props; a client import of the message files would ship both whole.
 * `app/[locale]/not-found.tsx` renders the same component, so the twins cannot drift.
 */
export default function NotFound() {
  return <NotFoundScreen standaloneMessages={pickStandaloneMessages(NOT_FOUND_PICK)} />;
}
