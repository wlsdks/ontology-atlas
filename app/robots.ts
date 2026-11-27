import type { MetadataRoute } from 'next';
import { robotsRules } from '../scripts/web/site/robots';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return robotsRules();
}
