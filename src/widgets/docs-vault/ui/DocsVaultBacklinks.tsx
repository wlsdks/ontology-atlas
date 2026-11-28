import { useLocale, useTranslations } from 'use-intl';
import { FileText } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import type { VaultDoc } from '@/entities/docs-vault';
import { OntologyMapKindGlyph, isOntologyMapRenderableKind } from '@/shared/ui/ontology-node/map-kind-glyph';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-text/locale-display-name';
import { Chip } from '@/shared/ui';

interface Props {
  sources: readonly string[];
  docsBySlug: Map<string, VaultDoc>;
  onNavigate: (slug: string) => void;
  hideHeading?: boolean;
}

export function DocsVaultBacklinks({ sources, docsBySlug, onNavigate, hideHeading = false }: Props) {
  const t = useTranslations('vaultWidgets.backlinks');
  const locale = useLocale();
  if (sources.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
      {hideHeading ? null : (
        <span className="flex-none font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
          {t('heading', { count: sources.length })}
        </span>
      )}
      {sources.map((fromSlug) => {
        const doc = docsBySlug.get(fromSlug);
        if (!doc) return null;
        const kind = doc.frontmatter?.kind;
        const kindText = typeof kind === 'string' ? kind : '';
        return (
          <Chip
            key={fromSlug}
            size="lg"
            tone="secondary"
            onClick={() => onNavigate(doc.slug)}
            className="flex-none hover:border-[color:var(--color-indigo-line-a40)] hover:text-[color:var(--color-text-primary)]"
          >
            {kindText && isOntologyMapRenderableKind(kindText) ? (
              <OntologyMapKindGlyph kind={kindText} size={11} />
            ) : (
              <FileText size={ICON_SIZE.sm} className="opacity-60" aria-hidden />
            )}
            <span className="max-w-[160px] truncate">
              {resolveLocaleDisplayName(doc.frontmatter, locale, doc.title)}
            </span>
          </Chip>
        );
      })}
    </div>
  );
}
