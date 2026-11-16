import nav from '../../messages/en/gatewayNav.json';
import { SITE_URL } from '@/shared/config';
import { GUIDE_PAGES, guideCanonicalPath } from '@/views/gateway-doc';

// Static export: written once at build time, like robots.txt and the sitemap.
export const dynamic = 'force-static';

const REPO = 'https://github.com/wlsdks/ontology-atlas';

/**
 * A plain-text map of the site for answer engines (llmstxt.org): what Atlas is in the site's own
 * words, then the pages that say more. Every claim here is one the visible pages already make.
 */
export function GET(): Response {
  const titles = nav.guidePages as Record<string, string>;
  const guide = GUIDE_PAGES.map(
    (page) => `- [${titles[page.titleKey] ?? page.segment}](${SITE_URL}/en/${guideCanonicalPath(page)}/)`,
  ).join('\n');
  const body = `# Ontology Atlas

> Understand your system as AI agents change its code. Ontology Atlas is an open-source app that keeps a map of what your code does and why as Markdown in your repository, read by both you and your coding agent.

- One Markdown file per concept, in an \`atlas/\` folder of your repository, versioned and reviewed in Git like the code.
- Claude Code, Codex, Cursor and Antigravity read the map over MCP before a task; their proposed updates stay proposals until you accept them.
- After a commit, the map marks the concepts whose files changed, so you know what to recheck.
- A line on the map is a declared relationship, not proof of runtime impact; missing evidence shows as unknown.
- Free and MIT licensed. No account and no backend run by Atlas; a coding agent you connect talks to its own provider.
- Desktop app for macOS (Apple Silicon, notarized) and a Windows x64 beta; the map also runs in the browser.

## Start

- [Download](${SITE_URL}/en/download/): the desktop app and what it does
- [Try it in the browser](${SITE_URL}/en/topology/)
- [Changelog](${SITE_URL}/en/changelog/)

## Guide

${guide}

## Source

- [Repository](${REPO}): the app, the MCP server and the CLI
- [MCP server](${REPO}/blob/main/mcp/README.md): the tools an agent calls
- [CLI](${REPO}/blob/main/cli/README.md)
- [License (MIT)](${REPO}/blob/main/LICENSE)
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
