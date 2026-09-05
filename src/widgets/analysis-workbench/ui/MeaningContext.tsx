'use client';

import { useTranslations } from 'next-intl';
import { Checkbox, Chip } from '@/shared/ui';

/** Explanatory UI for the normative kinds and relation directions in the Atlas specification. */
export function MeaningContext({ node, relations, onSelectRelation, onEvidence, showLabels, onShowLabelsChange }: {
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
  return <div className="space-y-4">
    {!node && !relations.length ? <p>{glossary('ontologyDefinition')}</p> : null}
    {node ? <section className="space-y-2">
      <h3 className="text-body-lg font-[var(--font-weight-strong)]">{node.title}</h3>
      <p className="text-caption text-[color:var(--color-text-secondary)]">{kindsLabel(selectedKind)}</p>
      <p>{glossary(`criteria.${selectedKind}`)}</p>
      <p className="whitespace-pre-wrap text-[color:var(--color-text-secondary)]">{node.summary?.trim() || t('definitionMissing')}</p>
      <Chip onClick={() => onEvidence(node.id)}>{t('openDefinition')}</Chip>
    </section> : <details><summary className="content-center [@media(pointer:coarse)]:min-h-[var(--touch-target-min)]">{t('kindCriteria')}</summary><dl className="mt-3 space-y-3">{kinds.map((kind) => <div key={kind}><dt className="font-[var(--font-weight-strong)]">{kindsLabel(kind)}</dt><dd className="mt-1 text-[color:var(--color-text-secondary)]">{glossary(`criteria.${kind}`)}</dd></div>)}</dl></details>}
    {onShowLabelsChange ? <div className="space-y-2"><Checkbox label={t('showRelationMeaning')} checked={showLabels === true} onChange={(event) => onShowLabelsChange(event.target.checked)} />{node ? <details><summary className="content-center text-caption [@media(pointer:coarse)]:min-h-[var(--touch-target-min)]">{t('captionHelp')}</summary><p className="mt-2 text-caption text-[color:var(--color-text-secondary)]">{t('captionGuide')}</p></details> : <p className="text-caption text-[color:var(--color-text-secondary)]">{t('captionGuide')}</p>}</div> : null}
    <section className="space-y-3"><h3 className="text-body-lg font-[var(--font-weight-strong)]">{t('relations')}</h3>
      <p className="text-caption text-[color:var(--color-text-secondary)]">{t('relationGuide')}</p>
      {relations.length ? relations.map((relation) => <article key={relation.id} className="space-y-2 rounded-card border border-[color:var(--color-border-soft)] p-[var(--card-pad)]">
        <p className="font-[var(--font-weight-strong)]">{relation.sentence}</p>
        <p className="text-caption text-[color:var(--color-text-secondary)]">{relation.typeLabel}</p>
        <p>{relation.why || t('rationaleMissing')}</p>
        <div className="flex flex-wrap gap-2"><Chip onClick={() => onSelectRelation(relation.id)}>{t('showConnection')}</Chip>{relation.declaredBy ? <Chip onClick={() => onEvidence(relation.declaredBy!)}>{t('declaringDocument')}</Chip> : null}</div>
      </article>) : <p>{t('selectNode')}</p>}
    </section>
  </div>;
}
