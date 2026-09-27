'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { FileText } from 'lucide-react';
import { Checkbox, Chip, Disclosure, IconButton } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { badgeClass } from '@/shared/ui/badge-class';

/** Sans, not mono caps; identical to the workbench's section label in `AnalysisWorkbench.tsx`. */
const SECTION_LABEL = 'text-caption font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]';

/** Explanatory UI for the normative kinds and relation directions in the Atlas specification. */
export function MeaningContext({ node, relations, onSelectRelation, onEvidence, showLabels, onShowLabelsChange, reasonsAction = false }: {
  /**
   * True when the panel header already offers to write the missing reasons (its "Fill N missing
   * reasons" action). The group line then stays silent unless only some relations lack one.
   */
  reasonsAction?: boolean;
  showLabels?: boolean;
  onShowLabelsChange?: (show: boolean) => void;
  node: { id: string; title: string; kind: string; summary?: string | null } | null;
  relations: readonly { id: string; sentence: string; typeLabel: string; why: string | null; declaredBy: string | null }[];
  onSelectRelation: (id: string) => void;
  onEvidence: (slug: string) => void;
}) {
  const t = useTranslations('analysisWorkbench');
  const glossary = useTranslations('searchWidgets.shortcuts.glossary');
  const kindsLabel = useTranslations('kinds');
  const kinds = ['project', 'domain', 'capability', 'element', 'document'];
  const selectedKind = node && [...kinds, 'vault-readme'].includes(node.kind) ? node.kind : 'unknown';
  const divided = 'border-t border-[color:var(--color-divider)] pt-4';
  /* The trailing group takes a rule only when something stands above it. */
  const trailing = node || relations.length ? divided : '';
  const missingReasons = relations.filter((relation) => !relation.why).length;
  const mixedReasons = missingReasons > 0 && missingReasons < relations.length;
  /*
   * Speaks only when no header action states the count, or when only some relations lack a reason.
   */
  const reasonLine = missingReasons > 0 && (!reasonsAction || mixedReasons);
  return <div className="flex flex-col gap-4">
    {node ? <section className="space-y-2" aria-label={node.title}>
      <p className="whitespace-pre-wrap text-body-lg leading-body-lg">{node.summary?.trim() || t('definitionMissing')}</p>
      <p className="text-body leading-body text-[color:var(--color-text-secondary)]">{glossary(`criteria.${selectedKind}`)}</p>
      <div className="pt-1"><Chip size="lg" onClick={() => onEvidence(node.id)}>{t('openDefinition')}</Chip></div>
    </section> : <p>{t('selectNode')}</p>}
    {node || relations.length ? <section className={cn('space-y-3', node && divided)}>
      <div className="space-y-1">
        <p className={SECTION_LABEL}>{t('relationsEyebrow')}{relations.length ? <span className="tabular-nums"> · {relations.length}</span> : null}</p>
        {reasonLine ? <p data-testid="meaning-relations-missing-reasons" className="text-label leading-label text-[color:var(--color-text-secondary)]">{t('rationaleMissingGroup', { count: missingReasons })}</p> : null}
      </div>
      {relations.length ? <ul data-testid="meaning-relations" className="overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] divide-y divide-[color:var(--color-divider)]">{relations.map((relation) => <li key={relation.id} data-testid="meaning-relation" className="flex items-center">
        <button
          type="button"
          data-control="row"
          aria-label={`${t('showConnection')}: ${relation.sentence}`}
          onClick={() => onSelectRelation(relation.id)}
          className={controlClass({ shape: 'row', size: 'md', stacked: true, hoverSurface: 'lift', className: 'min-w-0 flex-1 flex-col items-start gap-1.5 px-[var(--card-pad)] py-3' })}
        >
          <span className="flex flex-wrap items-center gap-2">
            <span data-testid="meaning-relation-type" className={badgeClass({ shape: 'tag', className: 'border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]' })}>{relation.typeLabel}</span>
            {mixedReasons && !relation.why ? <span className="text-label leading-label text-[color:var(--color-text-tertiary)]">{t('rationaleMissingShort')}</span> : null}
          </span>
          <span className="block text-body leading-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{relation.sentence}</span>
          {relation.why ? <span className="block text-body leading-body text-[color:var(--color-text-secondary)]">{relation.why}</span> : null}
        </button>
        {relation.declaredBy ? <IconButton size="lg" hoverInk="strong" hoverSurface="lift" label={t('declaringDocument')} className="mr-2 shrink-0" onClick={() => onEvidence(relation.declaredBy!)}><FileText size={ICON_SIZE.sm} aria-hidden /></IconButton> : null}
      </li>)}</ul> : <p className="text-label leading-label text-[color:var(--color-text-secondary)]">{t('relationGuide')}</p>}
    </section> : null}
    <div className={cn('space-y-3', trailing)}>
      {onShowLabelsChange ? <>
        <Checkbox label={t('showRelationMeaning')} checked={showLabels === true} onChange={(event) => onShowLabelsChange(event.target.checked)} />
        <Disclosure summary={t('captionHelp')}><p className="mt-2 text-label leading-label text-[color:var(--color-text-secondary)]">{t('captionGuide')}</p></Disclosure>
      </> : null}
      <Disclosure summary={t('kindCriteria')}>
        <p className="mt-3 text-body leading-body text-[color:var(--color-text-secondary)]">{glossary('ontologyDefinition')}</p>
        <dl className="mt-3 space-y-3">{kinds.map((kind) => <div key={kind}><dt className="font-[var(--font-weight-strong)]">{kindsLabel(kind)}</dt><dd className="mt-1 text-body leading-body text-[color:var(--color-text-secondary)]">{glossary(`criteria.${kind}`)}</dd></div>)}</dl>
      </Disclosure>
    </div>
  </div>;
}
