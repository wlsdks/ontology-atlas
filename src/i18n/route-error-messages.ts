import koRouteError from '@/messages/ko/routeError.json';
import enRouteError from '@/messages/en/routeError.json';
import jaRouteError from '@/messages/ja/routeError.json';
import zhRouteError from '@/messages/zh/routeError.json';
import type { StandaloneMessages } from './standalone-messages';

/** The error boundary's copy in every language: one small namespace, so it can ride on every page. */
export const ROUTE_ERROR_MESSAGES: StandaloneMessages = {
  ko: { routeError: koRouteError },
  en: { routeError: enRouteError },
  ja: { routeError: jaRouteError },
  zh: { routeError: zhRouteError },
};
