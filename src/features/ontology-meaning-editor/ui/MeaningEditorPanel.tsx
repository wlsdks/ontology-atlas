'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { GitBranch, Plus } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import {
  buildOntologyRelationEditPlan,
  buildOntologyRelationRemovalPlan,
  eligibleRelationTargets,
  IMPACT_EDIT_RELATIONS,
  RELATION_EDGE_TYPE,
  relationsAllowedFor,
  type MeaningEditRelation,
  type OntologyRelationEditPlan,
} from '@/entities/knowledge-graph';
import { isImeComposing } from '@/shared/lib/keyboard/ime-composition';
import { Button, CloseButton, RowButton, Surface, Textarea } from '@/shared/ui';
import { fieldLabel } from '@/shared/ui/control-class';
import { Input } from '@/shared/ui/fields/input';
import { SegmentedControl } from '@/shared/ui/fields/segmented-control';
import { OntologyMapKindGlyph } from '@/shared/ui/ontology-node/map-kind-glyph';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

export interface MeaningEditorNode {
  id: string;
  slug: string;
  title: string;
  kind: string;
  names?: readonly string[];
  domainTitle?: string | null;
}

export interface MeaningEditorSource extends MeaningEditorNode {
  frontmatter: Record<string, unknown>;
}

export interface MeaningEditorRelationRow {
  relation: MeaningEditRelation;
  direction: 'out' | 'in';
  otherId: string;
  otherTitle: string;
  why: string | null;
}

export interface MeaningEditorPreview {
  sourceId: string;
  targetId: string;
  relationType: string;
  phase: 'draft' | 'committing';
}

export type MeaningEditorWrite = 'added' | 'changed' | 'removed';

const RELATION_ORDER: readonly MeaningEditRelation[] = ['dependsOn', 'relates', 'contains', 'isA'];

interface Draft {
  relation: MeaningEditRelation;
  targetId: string;
  why: string;
  from: { relation: MeaningEditRelation; targetId: string } | null;
}

export function MeaningEditorPanel({
  open,
  source,
  candidates,
  relations,
  initialRelation = 'dependsOn',
  initialTargetId = null,
  initialWhy = '',
  onPreview,
  onApply,
  onEditIncoming,
  onRemoveIncoming,
  onClose,
  onExited,
  className,
}: {
  open: boolean;
  source: MeaningEditorSource;
  candidates: readonly MeaningEditorNode[];
  relations: readonly MeaningEditorRelationRow[];
  initialRelation?: MeaningEditRelation;
  initialTargetId?: string | null;
  initialWhy?: string;
  onPreview: (preview: MeaningEditorPreview | null) => void;
  onApply: (plan: OntologyRelationEditPlan, what: MeaningEditorWrite, targetTitle: string) => Promise<void>;
  onEditIncoming: (row: MeaningEditorRelationRow) => void;
  onRemoveIncoming: (row: MeaningEditorRelationRow) => Promise<void>;
  onClose: () => void;
  onExited?: () => void;
  className?: string;
}) {
  const t = useTranslations('meaningEditor');
  const format = useFormatter();
  const allowed = useMemo(() => relationsAllowedFor(source.kind), [source.kind]);
  const firstRelation = allowed.includes(initialRelation) ? initialRelation : (allowed[0] ?? 'dependsOn');
  const openingDraft = (): Draft => ({
    relation: firstRelation,
    targetId: initialTargetId ?? '',
    why: initialWhy,
    from: initialTargetId ? { relation: initialRelation, targetId: initialTargetId } : null,
  });
  const [draft, setDraft] = useState<Draft | null>(openingDraft);
  const [query, setQuery] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const relationLabelId = useId();
  const targetRef = useRef<HTMLInputElement>(null);

  /* Reopening reuses this mounted instance, so opening starts from what it was opened for. */
  const [openedWith, setOpenedWith] = useState(`${open}:${initialRelation}:${initialTargetId ?? ''}`);
  const openKey = `${open}:${initialRelation}:${initialTargetId ?? ''}`;
  if (openKey !== openedWith) {
    // Adjusted during render so a stale draft never paints.
    setOpenedWith(openKey);
    if (open) {
      setDraft(openingDraft());
      setQuery(null);
      setSaving(false);
      setError(null);
    }
  }

  const candidateById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const target = draft ? candidateById.get(draft.targetId) ?? null : null;
  const matches = useMemo(
    () =>
      draft && query !== null
        ? eligibleRelationTargets(
            source,
            candidates.map((c) => ({ ...c, names: c.names ?? [c.title] })),
            draft.relation,
            query,
          ).slice(0, 8)
        : [],
    [candidates, draft, query, source],
  );
  const whyRequired = draft?.relation === 'dependsOn';
  const canApply = Boolean(draft && target) && (!whyRequired || Boolean(draft?.why.trim()));
  const sortedRows = useMemo(
    () =>
      [...relations].sort(
        (a, b) =>
          (a.direction === b.direction ? 0 : a.direction === 'out' ? -1 : 1) ||
          RELATION_ORDER.indexOf(a.relation) - RELATION_ORDER.indexOf(b.relation) ||
          a.otherTitle.localeCompare(b.otherTitle),
      ),
    [relations],
  );

  useEffect(() => {
    if (!open || !draft || !target) {
      onPreview(null);
      return;
    }
    onPreview({
      sourceId: source.id,
      targetId: target.id,
      relationType: RELATION_EDGE_TYPE[draft.relation],
      phase: saving ? 'committing' : 'draft',
    });
    return () => onPreview(null);
  }, [draft, onPreview, open, saving, source.id, target]);

  const write = async (plan: OntologyRelationEditPlan, what: MeaningEditorWrite, targetTitle: string) => {
    if (plan.changeSet.fields.length === 0) {
      setError(t('noChanges'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onApply(plan, what, targetTitle);
      setDraft(null);
      setQuery(null);
    } catch {
      setError(t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  const apply = () => {
    if (!draft || !target || !canApply || saving) return;
    const fromTarget = draft.from ? candidateById.get(draft.from.targetId) ?? null : null;
    const plan = buildOntologyRelationEditPlan({
      sourceSlug: source.slug,
      targetSlug: target.slug,
      targetKind: target.kind,
      fromRelation: fromTarget ? draft.from!.relation : null,
      fromTargetSlug: fromTarget?.slug ?? null,
      fromTargetKind: fromTarget?.kind ?? null,
      toRelation: draft.relation,
      why: draft.why,
      frontmatter: source.frontmatter,
    });
    void write(plan, draft.from ? 'changed' : 'added', target.title);
  };

  const removeOut = (row: MeaningEditorRelationRow) => {
    const other = candidateById.get(row.otherId);
    if (!other || saving) return;
    const plan = buildOntologyRelationRemovalPlan({
      sourceSlug: source.slug,
      targetSlug: other.slug,
      targetKind: other.kind,
      relation: row.relation,
      frontmatter: source.frontmatter,
    });
    void write(plan, 'removed', other.title);
  };

  const removeIn = async (row: MeaningEditorRelationRow) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onRemoveIncoming(row);
    } catch {
      setError(t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  const editRow = (row: MeaningEditorRelationRow) => {
    if (row.direction === 'in') {
      onEditIncoming(row);
      return;
    }
    setError(null);
    setQuery(null);
    setDraft({
      relation: allowed.includes(row.relation) ? row.relation : firstRelation,
      targetId: row.otherId,
      why: row.why ?? '',
      from: { relation: row.relation, targetId: row.otherId },
    });
  };

  const startAdd = () => {
    setError(null);
    setDraft({ relation: firstRelation, targetId: '', why: '', from: null });
    setQuery('');
    window.requestAnimationFrame(() => targetRef.current?.focus());
  };

  const chooseTarget = (id: string) => {
    setDraft((current) => (current ? { ...current, targetId: id } : current));
    setQuery(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (saving) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (query !== null) setQuery(null);
      else if (draft && relations.length > 0) setDraft(null);
      else onClose();
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey || isImeComposing(event)) return;
    const field = event.target as HTMLElement;
    if (field.tagName !== 'INPUT' && field.tagName !== 'TEXTAREA') return;
    event.preventDefault();
    if (query !== null && field === targetRef.current) {
      if (matches[0]) chooseTarget(matches[0].id);
      return;
    }
    apply();
  };

  const rowSentence = (row: MeaningEditorRelationRow) =>
    row.direction === 'out'
      ? t(`outgoing.${row.relation}`, { name: row.otherTitle })
      : t(`incoming.${row.relation}`, { name: row.otherTitle });

  return (
    <Surface
      open={open}
      onExited={onExited}
      className={[
        'w-[var(--map-panel-width)]',
        open ? 'pointer-events-auto' : 'pointer-events-none',
        className ?? '',
      ].join(' ')}
    >
      <section
        role="group"
        aria-label={t('ariaLabel', { name: source.title })}
        data-testid="meaning-editor-panel"
        data-meaning-editor-step={draft ? 'edit' : 'list'}
        onKeyDown={handleKeyDown}
        className="flex max-h-[var(--map-panel-max-height)] w-full scroll-pb-20 flex-col overflow-y-auto rounded-[var(--map-panel-radius)] border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] shadow-[var(--map-panel-shadow)]"
      >
        <header className="flex items-start gap-2 px-[var(--map-panel-pad)] pb-3 pt-[15px]">
          <span className="mt-0.5 text-[color:var(--color-indigo-accent)]">
            <GitBranch size={ICON_SIZE.md} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <h2 className="truncate text-title font-[var(--font-weight-strong)] leading-title text-[color:var(--map-panel-text-primary)]">
              {source.title}
            </h2>
            <p className="mt-1 text-label leading-label text-[color:var(--map-panel-text-tertiary)]">
              {t('editBody')}
            </p>
          </span>
          <CloseButton label={t('close')} onClick={onClose} disabled={saving} />
        </header>

        <ul
          aria-label={t('listHeading')}
          data-testid="meaning-editor-relations"
          className="flex flex-col border-t border-[color:var(--map-panel-divider)] px-[var(--map-panel-pad)] py-2"
        >
          {sortedRows.length === 0 ? (
            <li className="py-1.5 text-label text-[color:var(--map-panel-text-quaternary)]">{t('listEmpty')}</li>
          ) : null}
          {sortedRows.map((row) => {
            const editing =
              row.direction === 'out' && draft?.from?.targetId === row.otherId && draft.from.relation === row.relation;
            return (
              <li
                key={`${row.direction}:${row.relation}:${row.otherId}`}
                data-testid="meaning-editor-relation-row"
                data-direction={row.direction}
                data-relation={row.relation}
                data-editing={editing ? 'true' : undefined}
                className="flex min-h-9 items-start gap-2 py-1.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-body leading-body text-[color:var(--map-panel-text-primary)]">
                    {rowSentence(row)}
                  </span>
                  {row.why ? (
                    <span className="mt-0.5 block text-label leading-label text-[color:var(--map-panel-text-tertiary)]">
                      {row.why}
                    </span>
                  ) : null}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => editRow(row)}
                  data-testid="meaning-editor-row-edit"
                >
                  {t('edit')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[color:var(--color-status-danger)]"
                  disabled={saving}
                  onClick={() => (row.direction === 'out' ? removeOut(row) : void removeIn(row))}
                  data-testid="meaning-editor-remove"
                >
                  {t('remove')}
                </Button>
              </li>
            );
          })}
        </ul>

        {draft ? (
          <div
            data-testid="meaning-editor-form"
            className="grid grid-cols-[minmax(0,1fr)] gap-3 border-t border-[color:var(--map-panel-divider)] px-[var(--map-panel-pad)] py-4"
          >
            <div className="flex flex-col gap-1.5">
              <span id={relationLabelId} className={fieldLabel()}>
                {t('relation')}
              </span>
              <SegmentedControl
                labelledBy={relationLabelId}
                variant="chips"
                size="md"
                fill
                value={draft.relation}
                onChange={(relation) => {
                  const keep = target && eligibleRelationTargets(source, [{ ...target, names: [target.title] }], relation, '').length > 0;
                  setDraft({ ...draft, relation, targetId: keep ? draft.targetId : '' });
                }}
                testId="meaning-editor-relation"
                options={RELATION_ORDER.filter((value) => allowed.includes(value)).map((value) => ({
                  value,
                  testId: `meaning-editor-relation-${value}`,
                  label: t(`relationName.${value}`),
                }))}
              />
              {/* Each help line names the program that reads the value (tests/contract/controls/field-help-consumers.contract.test.ts). */}
              <p data-testid="meaning-editor-relation-help" className="text-label leading-label text-[color:var(--map-panel-text-tertiary)]">
                <span className="block text-[color:var(--map-panel-text-secondary)]">{t(`relationHint.${draft.relation}`)}</span>
                {t('relationHelp')}
              </p>
            </div>
            <div
              className="flex flex-col gap-1"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setQuery(null);
              }}
            >
              <Input
                ref={targetRef}
                label={t('target')}
                className="w-full"
                value={query ?? target?.title ?? ''}
                placeholder={t('searchPlaceholder')}
                autoComplete="off"
                role="combobox"
                aria-expanded={query !== null}
                aria-autocomplete="list"
                disabled={saving}
                autoFocus={!draft.targetId}
                onFocus={(event) => {
                  event.currentTarget.select();
                  if (query === null) setQuery('');
                }}
                onChange={(event) => setQuery(event.target.value)}
                data-testid="meaning-editor-target"
              />
              {query !== null ? (
                // WebKit does not focus a pressed button, so the field's blur would close this list before the click lands.
                <ul role="listbox" aria-label={t('target')} data-testid="meaning-editor-target-matches" className="flex flex-col gap-px" onMouseDown={(event) => event.preventDefault()}>
                  {matches.map((match) => {
                    const candidate = candidateById.get(match.id);
                    return (
                      <li key={match.id} role="presentation">
                        <RowButton
                          role="option"
                          aria-selected={draft.targetId === match.id}
                          size="sm"
                          onClick={() => chooseTarget(match.id)}
                          data-testid="meaning-editor-target-option"
                        >
                          <OntologyMapKindGlyph kind={match.kind} size={11} />
                          <span className="min-w-0 truncate">{candidate?.title ?? match.slug}</span>
                          <span className="ml-auto min-w-0 max-w-[45%] shrink truncate text-label text-[color:var(--map-panel-text-quaternary)]">
                            {candidate?.domainTitle
                              ? t('targetWhere', { kind: t(`kindName.${match.kind}`), domain: candidate.domainTitle })
                              : t(`kindName.${match.kind}`)}
                          </span>
                        </RowButton>
                      </li>
                    );
                  })}
                  {matches.length === 0 ? (
                    <li className="px-2 py-1 text-label text-[color:var(--map-panel-text-quaternary)]">{t('targetNoMatch')}</li>
                  ) : null}
                </ul>
              ) : null}
              <p data-testid="meaning-editor-target-help" className="text-label leading-label text-[color:var(--color-text-quaternary)]">
                {t('targetHelp', {
                  relations: format.list(
                    IMPACT_EDIT_RELATIONS.map((value) => t(`relationName.${value}`)),
                    { type: 'conjunction' },
                  ),
                })}
              </p>
            </div>
            <Textarea
              label={t(whyRequired ? 'whyRequired' : 'why')}
              className="w-full"
              rows={2}
              autoGrow
              maxRows={8}
              value={draft.why}
              disabled={saving}
              onChange={(event) => setDraft({ ...draft, why: event.target.value })}
              hint={
                whyRequired
                  ? t('whyDependsHint', { source: source.title, target: target?.title ?? t('thatOne') })
                  : t('whyHint')
              }
              data-testid="meaning-editor-why"
            />
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="px-[var(--map-panel-pad)] pb-2 text-body text-[color:var(--color-status-danger)]">
            {error}
          </p>
        ) : null}

        <footer className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-[color:var(--map-panel-divider)] bg-[color:var(--map-panel-surface)] px-[var(--map-panel-pad)] py-3">
          {draft ? (
            <>
              <span className="mr-auto text-label text-[color:var(--map-panel-text-quaternary)]">{t('keysHint')}</span>
              {relations.length > 0 ? (
                <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
                  {t('cancel')}
                </Button>
              ) : null}
              <Button
                variant="primary"
                data-testid="meaning-editor-apply"
                onClick={apply}
                disabled={!canApply || saving}
              >
                {saving ? t('saving') : t('apply')}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={startAdd} disabled={saving} data-testid="meaning-editor-add">
              <Plus size={ICON_SIZE.sm} aria-hidden />
              {t('add')}
            </Button>
          )}
        </footer>
      </section>
    </Surface>
  );
}
