'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { Checkbox, Chip, Disclosure } from '@/shared/ui';

/**
 * The section label — **sans, not mono caps** (owner, 2026-09-06). The reasoning, and the
 * measurement behind it, is in `AnalysisWorkbench.tsx` beside the same constant: `uppercase` does
 * nothing to Hangul, `:lang(ko)` already zeroes the caps tracking, and what was left of the
 * eyebrow was a fixed-advance face pushing syllable blocks apart. Kept identical to the
 * workbench's so the two halves of one panel do not label their groups two different ways.
 */
const SECTION_LABEL = 'text-caption font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]';

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
  /*
   * **The tab answers "what did I pick" first** (owner, 2026-09-06: "messy"). With nothing
   * picked it used to open on the ontology glossary, the five kind definitions, a checkbox with
   * its help text, a relations heading with its guide, and only then the sentence that mattered
   * — pick something on the map. Every block wore the same grey, so a person read a wall to
   * find the one instruction. Now: the picked thing or the instruction to pick one; the map
   * display switch on its own line; the glossary folded under one question at the end.
   */
  const divided = 'border-t border-[color:var(--color-divider)] pt-4';
  /*
   * ⚠️ **A rule needs something above it to divide** (measured 2026-09-06, 460px panel). With
   * nothing picked this tab was one sentence, a rule, a switch and a fold, a rule, and another
   * fold — three hairlines around two lines of content, and the first thing the eye met after the
   * instruction was a horizontal line rather than the switch it was drawing.
   *
   * The map-display switch and the two folds are one trailing group — what the map shows and what
   * the words mean — so they take one rule between them, and they take it only when something
   * stands above them to be divided from.
   */
  const trailing = node || relations.length ? divided : '';
  return <div className="flex flex-col gap-4">
    {node ? <section className="space-y-2">
      <p className={SECTION_LABEL}>{kindsLabel(selectedKind)}</p>
      <h3 className="text-body-lg font-[var(--font-weight-strong)]">{node.title}</h3>
      <p className="text-caption text-[color:var(--color-text-secondary)]">{glossary(`criteria.${selectedKind}`)}</p>
      <p className="whitespace-pre-wrap">{node.summary?.trim() || t('definitionMissing')}</p>
      <Chip size="lg" onClick={() => onEvidence(node.id)}>{t('openDefinition')}</Chip>
    </section> : <p>{t('selectNode')}</p>}
    {node || relations.length ? <section className={cn('space-y-3', node && divided)}>
      <p className={SECTION_LABEL}>{t('relationsEyebrow')}</p>
      {relations.length ? relations.map((relation) => <article key={relation.id} className="space-y-2 rounded-card border border-[color:var(--color-border-soft)] p-[var(--card-pad)]">
        <p className="font-[var(--font-weight-strong)]">{relation.sentence}</p>
        <p className="text-caption text-[color:var(--color-text-secondary)]">{relation.typeLabel}</p>
        <p>{relation.why || t('rationaleMissing')}</p>
        <div className="flex flex-wrap gap-2"><Chip size="lg" onClick={() => onSelectRelation(relation.id)}>{t('showConnection')}</Chip>{relation.declaredBy ? <Chip size="lg" onClick={() => onEvidence(relation.declaredBy!)}>{t('declaringDocument')}</Chip> : null}</div>
      </article>) : <p className="text-caption text-[color:var(--color-text-secondary)]">{t('relationGuide')}</p>}
    </section> : null}
    <div className={cn('space-y-3', trailing)}>
      {onShowLabelsChange ? <>
        <Checkbox label={t('showRelationMeaning')} checked={showLabels === true} onChange={(event) => onShowLabelsChange(event.target.checked)} />
        <Disclosure summary={t('captionHelp')}><p className="mt-2 text-caption text-[color:var(--color-text-secondary)]">{t('captionGuide')}</p></Disclosure>
      </> : null}
      <Disclosure summary={t('kindCriteria')}>
        <p className="mt-3 text-caption text-[color:var(--color-text-secondary)]">{glossary('ontologyDefinition')}</p>
        <dl className="mt-3 space-y-3">{kinds.map((kind) => <div key={kind}><dt className="font-[var(--font-weight-strong)]">{kindsLabel(kind)}</dt><dd className="mt-1 text-caption text-[color:var(--color-text-secondary)]">{glossary(`criteria.${kind}`)}</dd></div>)}</dl>
      </Disclosure>
    </div>
  </div>;
}
