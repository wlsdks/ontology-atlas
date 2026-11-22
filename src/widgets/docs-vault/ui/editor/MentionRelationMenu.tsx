import { useLocale, useTranslations } from 'next-intl';
import type { VaultDoc } from '@/entities/docs-vault';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-text/locale-display-name';
import { RowButton, Surface } from '@/shared/ui';
import {
  MENTION_RELATIONS,
  RELATION_LABEL_KEY,
  type MentionRelationId,
} from '../../lib/mention-relation';
import { MENTION_MENU_CLASS, mentionMenuStyle } from './mention-menu-box';

interface Props {
  target: VaultDoc;
  selected: MentionRelationId;
  at: { top: number; left: number } | null;
  onHover: (relationId: MentionRelationId) => void;
  onPick: (relationId: MentionRelationId) => void;
}

/** The menu after a concept is chosen: which relation the mention writes to frontmatter. */
export function MentionRelationMenu({ target, selected, at, onHover, onPick }: Props) {
  const t = useTranslations('vaultWidgets.editor');
  const tRelations = useTranslations('ontologyRelations');
  const locale = useLocale();
  return (
    <Surface
      open
      origin="bottom left"
      role="menu"
      aria-label={t('mentionRelationLabel', {
        title: resolveLocaleDisplayName(target.frontmatter, locale, target.title),
      })}
      className={MENTION_MENU_CLASS}
      style={mentionMenuStyle(at)}
    >
      <div className="border-b border-[color:var(--color-border-soft)] px-2 py-1.5 text-label text-[color:var(--color-text-tertiary)]">
        {t('mentionRelationLabel', {
          title: resolveLocaleDisplayName(target.frontmatter, locale, target.title),
        })}
      </div>
      <ul className="py-0.5">
        {MENTION_RELATIONS.map((relation) => (
          <li key={relation.id}>
            <RowButton
              role="menuitem"
              active={relation.id === selected}
              onMouseEnter={() => onHover(relation.id)}
              data-testid={`editor-mention-relation-${relation.id}`}
              onClick={() => onPick(relation.id)}
              className="hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
            >
              <span className="truncate text-body">
                {tRelations(`relationShort.${RELATION_LABEL_KEY[relation.id]}`)}
              </span>
            </RowButton>
          </li>
        ))}
      </ul>
      <div className="border-t border-[color:var(--color-border-soft)] px-2 py-1.5 text-label leading-label text-[color:var(--color-text-quaternary)]">
        {t('mentionRelationFooter')}
      </div>
    </Surface>
  );
}
