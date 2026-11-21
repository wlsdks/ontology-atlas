import type { useTranslations } from 'next-intl';

import type { CatalogueVariant } from '@/shared/config/mcp/mcp-catalogue';

import { requiredVariables } from '../../model/catalogue-variant';

export type Translate = ReturnType<typeof useTranslations<'connectors'>>;

export function asksClause(t: Translate, variant: CatalogueVariant): string {
  const required = requiredVariables(variant);
  if (required.length > 0)
    return t('asksTokenShort', { keys: required.map((variable) => variable.name).join(', ') });
  if (variant.kind === 'remote' && variant.auth === 'oauth') return t('asksOauthShort');
  return t('variantAsksNothing');
}

export function variantLabel(t: Translate, variant: CatalogueVariant): string {
  if (variant.kind === 'remote')
    return variant.label ? t('variantRemoteLabelled', { label: variant.label }) : t('variantRemote');
  return t('variantLocal', { runtime: variant.runtime });
}
