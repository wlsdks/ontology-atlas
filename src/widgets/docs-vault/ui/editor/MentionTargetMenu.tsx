import { useLocale, useTranslations } from 'next-intl';
import type { VaultDoc } from '@/entities/docs-vault';
import { useOntologyKindLabel } from '@/entities/ontology-class';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-text/locale-display-name';
import { OntologyMapKindGlyph, RowButton, Surface } from '@/shared/ui';
import { MENTION_MENU_CLASS, MENTION_MENU_MAX_HEIGHT, mentionMenuStyle } from './mention-menu-box';

interface Props {
  held: { query: string; active: number; matches: VaultDoc[] };
  open: boolean;
  at: { top: number; left: number } | null;
  onHover: (index: number) => void;
  onPick: (doc: VaultDoc) => void;
}

/** The list a typed `@` opens: the documents it can name, before a relation is chosen. */
export function MentionTargetMenu({ held, open, at, onHover, onPick }: Props) {
  const t = useTranslations('vaultWidgets.editor');
  const locale = useLocale();
  const kindLabel = useOntologyKindLabel();
  return (
    <Surface
      open={open}
      origin="bottom left"
      className={MENTION_MENU_CLASS}
      style={mentionMenuStyle(at)}
    >
      <div className="border-b border-[color:var(--color-border-soft)] px-2 py-1.5 text-label text-[color:var(--color-text-tertiary)]">
        <span className="block truncate">
          {t('mentionLabel', {
            query: held.query ? ` · “${held.query}”` : '',
          })}
        </span>
        {/* States up front that choosing writes to frontmatter, not only a link. */}
        <span className="block truncate text-label text-[color:var(--color-text-quaternary)]">
          {t('mentionHint')}
        </span>
      </div>
      {held.matches.length === 0 ? (
        <p className="px-2 py-2 text-label text-[color:var(--color-text-tertiary)]">
          {t('mentionEmpty')}
        </p>
      ) : null}
      <ul className="overflow-auto py-0.5" style={{ maxHeight: MENTION_MENU_MAX_HEIGHT - 64 }}>
        {held.matches.map((d, itemIndex) => (
          <li key={d.slug}>
            <RowButton
              active={itemIndex === held.active}
              onMouseEnter={() => onHover(itemIndex)}
              onClick={() => onPick(d)}
              className="hover:bg-[color:var(--color-overlay-1)]"
            >
              <OntologyMapKindGlyph
                kind={String(d.frontmatter?.kind ?? 'unknown')}
                size={12}
              />
              <span className="truncate text-body text-[color:var(--color-text-primary)]">
                {resolveLocaleDisplayName(d.frontmatter, locale, d.title)}
              </span>
              <span className="ml-auto shrink-0 truncate text-label text-[color:var(--color-text-quaternary)]">
                {kindLabel(String(d.frontmatter?.kind ?? ''))}
              </span>
            </RowButton>
          </li>
        ))}
      </ul>
      <div className="border-t border-[color:var(--color-border-soft)] px-2 py-1.5 text-label text-[color:var(--color-text-quaternary)]">
        {t('mentionFooter')}
      </div>
    </Surface>
  );
}
