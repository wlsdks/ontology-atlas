import type { Metadata } from "next";
import { NotFoundScreen } from "@/views/terminal-state";
import { NOT_FOUND_PICK, pickStandaloneMessages } from "@/i18n/standalone-messages";

/**
 * Under `output: 'export'` the static host serves this root file even for `/ko/…`, and the root
 * layout mounts no intl provider. It stays a server component so it picks the few namespaces the
 * screen reads; a client import of the message files would ship both whole.
 */
/** Next adds `noindex` to a 404 but keeps the root layout's `index, follow` beside it; say it once. */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function NotFound() {
  return <NotFoundScreen standaloneMessages={pickStandaloneMessages(NOT_FOUND_PICK)} />;
}
