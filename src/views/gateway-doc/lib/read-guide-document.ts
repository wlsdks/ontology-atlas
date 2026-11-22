import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { GuidePage } from '../model/guide-pages';
import { readGatewayDocument, type GatewayDocument } from './read-vault-doc';

/**
 * Guide chapters in the reader's language. English is the vault document; another locale's body is
 * localized data kept outside the vault, so the Library and MCP see one guide, read at build time
 * by the route's server component only.
 */
export const GUIDE_TRANSLATIONS_DIR = 'docs-i18n/guide';

export const guideSourcePath = (page: GuidePage, locale: string) =>
  locale === 'en' ? `docs/${page.slug}.md` : `${GUIDE_TRANSLATIONS_DIR}/${locale}/${page.segment}.md`;

export function readGuideDocument(page: GuidePage, locale: string): GatewayDocument & { sourcePath: string } {
  const translated = join(process.cwd(), guideSourcePath(page, locale));
  if (locale === 'en' || !existsSync(translated)) {
    return { ...readGatewayDocument(page.slug), sourcePath: guideSourcePath(page, 'en') };
  }
  return { raw: readFileSync(translated, 'utf8'), bundledOmittedSections: 0, language: locale, sourcePath: guideSourcePath(page, locale) };
}
