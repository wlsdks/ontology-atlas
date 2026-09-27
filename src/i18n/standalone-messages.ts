import koMessages from '@/messages/ko.json';
import enMessages from '@/messages/en.json';

/**
 * Server-side only: the message subset for screens outside `app/[locale]/layout.tsx` (the root
 * 404 and error boundary). Never import it from a `'use client'` module, or about 836 KB of JSON
 * ships in every page; a server component passes the picked namespaces as props.
 * `tests/contract/standalone-messages-server-only.contract.test.ts` enforces this.
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
 * The root 404's copy plus what the gateway chrome on it reads; `download` is large, so only
 * the crumb's key rides along. `TerminalState.test.tsx` fails on any missing message.
 */
export const NOT_FOUND_PICK: StandaloneMessagePick = {
  notFound: true,
  gatewayNav: true,
  locale: true,
  download: ['downloadSectionLabel'],
};
