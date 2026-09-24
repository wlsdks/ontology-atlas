'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { Checkbox, Chip, Disclosure } from '@/shared/ui';
import { badgeClass } from '@/shared/ui/badge-class';

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
  /*
   * ⚠️ **One fact once** (measured 2026-09-25, 1512 wide). Every relation card carried the same
   * two-line "no reason was recorded" warning and the same two full-size buttons: six cards said
   * one fact six times across about 1,056px of scroll, while the header chip already offered to
   * write the missing reasons. The fact is now one line over the group; each card keeps what is
   * its own — the sentence, the relation tag, its reason when there is one — and one compact
   * action row, so cards in the list come out the same height.
   */
  const missingReasons = relations.filter((relation) => !relation.why).length;
  const mixedReasons = missingReasons > 0 && missingReasons < relations.length;
  return <div className="flex flex-col gap-4">
    {/*
      ⚠️ **The name belongs to the header, not the body** (2026-09-25). The panel header already
      titles the picked node (its `h2`), and the body repeated the kind and the name as a second
      headline 180px lower — two title-weight strings for one name in one column. The kind moved
      into the header's eyebrow line; the body starts with what the node means, then what its kind
      means, both at reading size rather than the micro caption.
    */}
    {node ? <section className="space-y-2" aria-label={node.title}>
      <p className="whitespace-pre-wrap text-body-lg leading-body-lg">{node.summary?.trim() || t('definitionMissing')}</p>
      <p className="text-body leading-body text-[color:var(--color-text-secondary)]">{glossary(`criteria.${selectedKind}`)}</p>
      <div className="pt-1"><Chip size="lg" onClick={() => onEvidence(node.id)}>{t('openDefinition')}</Chip></div>
    </section> : <p>{t('selectNode')}</p>}
    {node || relations.length ? <section className={cn('space-y-3', node && divided)}>
      <div className="space-y-1">
        <p className={SECTION_LABEL}>{t('relationsEyebrow')}{relations.length ? <span className="tabular-nums"> · {relations.length}</span> : null}</p>
        {missingReasons > 0 ? <p data-testid="meaning-relations-missing-reasons" className="text-label leading-label text-[color:var(--color-text-secondary)]">{t('rationaleMissingGroup', { count: missingReasons })}</p> : null}
      </div>
      {relations.length ? <ul className="flex flex-col gap-2">{relations.map((relation) => <li key={relation.id}><article className="flex flex-col gap-2 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
        {/*
          Round two (2026-09-25): the tag leads the card as its eyebrow and the actions follow the
          text from the same start line, at the column's one chip size. With the tag at the left
          of the action row and md chips pushed to the far right, a 460px card at 1920 carried a
          hollow band between them, and the column showed two chip heights.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <span data-testid="meaning-relation-type" className={badgeClass({ shape: 'tag', className: 'border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]' })}>{relation.typeLabel}</span>
          {mixedReasons && !relation.why ? <span className="text-label leading-label text-[color:var(--color-text-tertiary)]">{t('rationaleMissingShort')}</span> : null}
        </div>
        <p className="text-body leading-body font-[var(--font-weight-strong)]">{relation.sentence}</p>
        {relation.why ? <p className="text-body leading-body text-[color:var(--color-text-secondary)]">{relation.why}</p> : null}
        <div className="flex flex-wrap gap-2 pt-0.5">
          <Chip size="lg" onClick={() => onSelectRelation(relation.id)}>{t('showConnection')}</Chip>
          {relation.declaredBy ? <Chip size="lg" onClick={() => onEvidence(relation.declaredBy!)}>{t('declaringDocument')}</Chip> : null}
        </div>
      </article></li>)}</ul> : <p className="text-label leading-label text-[color:var(--color-text-secondary)]">{t('relationGuide')}</p>}
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
