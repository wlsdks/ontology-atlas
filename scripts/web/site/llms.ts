import nav from '../../../messages/en/gatewayNav.json';
import { SITE_URL } from '@/shared/config';
import { GUIDE_PAGES, guideCanonicalPath, readVaultDoc } from '@/views/gateway-doc';

const REPO = 'https://github.com/wlsdks/ontology-atlas';

/** The summary an answer engine reads first. Every claim here is one the visible pages already make. */
export function llmsTxt(): string {
  const titles = nav.guidePages as Record<string, string>;
  const guide = GUIDE_PAGES.map((page) => `- [${titles[page.titleKey] ?? page.segment}](${SITE_URL}/en/${guideCanonicalPath(page)}/)`).join('\n');
  return `# Ontology Atlas

> Understand your system as AI agents change its code. Ontology Atlas is an open-source app that keeps a map of what your code does and why as Markdown in your repository, read by both you and your coding agent.

- One Markdown file per concept, in an \`atlas/\` folder of your repository, versioned and reviewed in Git like the code.
- Claude Code, Codex, Cursor and Antigravity read the map over MCP before a task; their proposed updates stay proposals until you accept them.
- After a commit, the map marks the concepts whose files changed, so you know what to recheck.
- A line on the map is a declared relationship, not proof of runtime impact; missing evidence shows as unknown.
- Free and MIT licensed. No account and no backend run by Atlas; a coding agent you connect talks to its own provider.
- Desktop app for macOS (Apple Silicon, notarized) and a Windows x64 beta. Elsewhere, a read-only sample map is on the website and the MCP server runs from the source code.

## Start

- [Download](${SITE_URL}/en/download/): the desktop app and what it does
- [Sample map](${SITE_URL}/en/sample/): a read-only map of a sample online store
- [Changelog](${SITE_URL}/en/changelog/)

## Guide

${guide}

## Source

- [Repository](${REPO}): the app, the MCP server and the CLI
- [MCP server](${REPO}/blob/main/mcp/README.md): the tools an agent calls
- [CLI](${REPO}/blob/main/cli/README.md)
- [License (MIT)](${REPO}/blob/main/LICENSE)

## Optional

- [The whole guide in one file](${SITE_URL}/llms-full.txt)
`;
}

/** The whole English guide in one file, chapter by chapter in reading order. */
export function llmsFullTxt(): string {
  const chapters = GUIDE_PAGES.flatMap((page) => {
    const body = readVaultDoc(page.slug);
    if (!body) return [];
    return [`<!-- ${SITE_URL}/en/${guideCanonicalPath(page)}/ -->\n\n${body.trim()}`];
  });
  return `# Ontology Atlas guide\n\n> The full guide of Ontology Atlas, an open-source app that keeps a map of what your code does and why as Markdown in your repository. Summary and links: ${SITE_URL}/llms.txt\n\n${chapters.join('\n\n---\n\n')}\n`;
}
