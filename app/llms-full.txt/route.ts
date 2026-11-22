import { SITE_URL } from '@/shared/config';
import { GUIDE_PAGES, guideCanonicalPath, readVaultDoc } from '@/views/gateway-doc';

export const dynamic = 'force-static';

export function GET(): Response {
  const chapters = GUIDE_PAGES.flatMap((page) => {
    const body = readVaultDoc(page.slug);
    if (!body) return [];
    return [`<!-- ${SITE_URL}/en/${guideCanonicalPath(page)}/ -->\n\n${body.trim()}`];
  });
  const text = `# Ontology Atlas guide\n\n> The full guide of Ontology Atlas, an open-source app that keeps a map of what your code does and why as Markdown in your repository. Summary and links: ${SITE_URL}/llms.txt\n\n${chapters.join('\n\n---\n\n')}\n`;
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
