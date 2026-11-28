import koNotFound from '@/messages/ko/notFound.json';
import koGatewayNav from '@/messages/ko/gatewayNav.json';
import koLocale from '@/messages/ko/locale.json';
import { downloadSectionLabel as koDownloadLabel } from '@/messages/ko/download.json';
import enNotFound from '@/messages/en/notFound.json';
import enGatewayNav from '@/messages/en/gatewayNav.json';
import enLocale from '@/messages/en/locale.json';
import { downloadSectionLabel as enDownloadLabel } from '@/messages/en/download.json';
import jaNotFound from '@/messages/ja/notFound.json';
import jaGatewayNav from '@/messages/ja/gatewayNav.json';
import jaLocale from '@/messages/ja/locale.json';
import { downloadSectionLabel as jaDownloadLabel } from '@/messages/ja/download.json';
import zhNotFound from '@/messages/zh/notFound.json';
import zhGatewayNav from '@/messages/zh/gatewayNav.json';
import zhLocale from '@/messages/zh/locale.json';
import { downloadSectionLabel as zhDownloadLabel } from '@/messages/zh/download.json';
import type { StandaloneMessages } from './standalone-messages';

/**
 * The 404's copy plus what the gateway chrome on it reads; `download` is large, so only the crumb's key is
 * imported. `TerminalState.test.tsx` fails on any missing message.
 */
export const NOT_FOUND_MESSAGES: StandaloneMessages = {
  ko: { notFound: koNotFound, gatewayNav: koGatewayNav, locale: koLocale, download: { downloadSectionLabel: koDownloadLabel } },
  en: { notFound: enNotFound, gatewayNav: enGatewayNav, locale: enLocale, download: { downloadSectionLabel: enDownloadLabel } },
  ja: { notFound: jaNotFound, gatewayNav: jaGatewayNav, locale: jaLocale, download: { downloadSectionLabel: jaDownloadLabel } },
  zh: { notFound: zhNotFound, gatewayNav: zhGatewayNav, locale: zhLocale, download: { downloadSectionLabel: zhDownloadLabel } },
};
