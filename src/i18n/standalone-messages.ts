import koMessages from '@/messages/ko.json';
import enMessages from '@/messages/en.json';

/**
 * **Server-side only.** The message subset for the screens that render outside
 * `app/[locale]/layout.tsx` (the root 404 and the root error boundary).
 *
 * ⚠️ Never import this file from a `'use client'` module. The two message files are about
 * 836 KB of JSON; a client import put all of it into the JavaScript of every page, because the
 * root error boundary belongs to the root layout's client tree (measured on PR #1839,
 * 2026-09-25). A server component calls `pickStandaloneMessages` and hands the few namespaces
 * the screen reads to `StandaloneMessagesProvider` as props, so the page carries a few KB of
 * serialized props instead. `tests/contract/standalone-messages-server-only.contract.test.ts`
 * keeps the import on the server.
 */
const ALL = { ko: koMessages, en: enMessages } as const;

export type StandaloneLocale = keyof typeof ALL;
export type StandaloneMessages = Record<StandaloneLocale, Record<string, unknown>>;

/**
 * Which namespaces to carry: `true` takes the whole namespace, a key list takes only those
 * keys (for a large namespace where the screen reads one or two labels).
 */
export type StandaloneMessagePick = Record<string, true | readonly string[]>;

export function pickStandaloneMessages(pick: StandaloneMessagePick): StandaloneMessages {
  const out = { ko: {}, en: {} } as StandaloneMessages;
  for (const locale of Object.keys(ALL) as StandaloneLocale[]) {
    const source = ALL[locale] as Record<string, Record<string, unknown>>;
    for (const [namespace, keys] of Object.entries(pick)) {
      const ns = source[namespace];
      if (!ns) continue;
      out[locale][namespace] =
        keys === true ? ns : Object.fromEntries(keys.filter((k) => k in ns).map((k) => [k, ns[k]]));
    }
  }
  return out;
}

/** The root error boundary's copy. Small enough to ride on every page (about 0.6 KB). */
export const ROUTE_ERROR_PICK: StandaloneMessagePick = { routeError: true };

/**
 * The root 404's copy: its own namespace plus what the gateway chrome on top of it reads
 * (`gatewayNav`, the language switch's `locale`). `GatewayNav` reads a single label from the
 * large `download` namespace (its crumb), so only that key is carried. A namespace missing here
 * is a console error and a raw key on screen; `TerminalState.test.tsx` renders the 404 with this
 * set and fails on any missing message.
 */
export const NOT_FOUND_PICK: StandaloneMessagePick = {
  notFound: true,
  gatewayNav: true,
  locale: true,
  download: ['downloadSectionLabel'],
};
