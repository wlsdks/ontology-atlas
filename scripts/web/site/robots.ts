import { SITE_URL } from '@/shared/config';

/** The search crawlers of answer engines, named so a later change to the wildcard rule cannot drop them. */
const ANSWER_ENGINE_CRAWLERS = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Google-Extended'];

export function robotsRules() {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      { userAgent: ANSWER_ENGINE_CRAWLERS, allow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

export function robotsTxt(): string {
  const { rules, sitemap } = robotsRules();
  const groups = rules.map(({ userAgent, allow }) => [...[userAgent].flat().map((agent) => `User-Agent: ${agent}`), `Allow: ${allow}`].join('\n'));
  return `${groups.join('\n\n')}\n\nSitemap: ${sitemap}\n`;
}
