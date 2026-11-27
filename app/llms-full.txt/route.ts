import { llmsFullTxt } from '../../scripts/web/site/llms';

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(llmsFullTxt(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
