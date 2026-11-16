import { SITE_URL } from '@/shared/config';
import { GUIDE_PAGES, guideCanonicalPath, readVaultDoc } from '@/views/gateway-doc';

// Static export: written once at build time, beside llms.txt.
export const dynamic = 'force-static';

/**
 * The whole guide as one plain-text file (llmstxt.org's `llms-full.txt`), so an answer engine
 * can read every chapter in one request. Each chapter is the same reviewed Markdown the guide
 * pages render, headed by its address.
 */
export function GET(): Response {
  const chapters = GUIDE_PAGES.flatMap((page) => {
    const body = readVaultDoc(page.slug);
    if (!body) return [];
    return [`<!-- ${SITE_URL}/en/${guideCanonicalPath(page)}/ -->\n\n${body.trim()}`];
  });
  const text = `# Ontology Atlas guide\n\n> The full guide of Ontology Atlas, an open-source app that keeps a map of what your code does and why as Markdown in your repository. Summary and links: ${SITE_URL}/llms.txt\n\n${chapters.join('\n\n---\n\n')}\n`;
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
