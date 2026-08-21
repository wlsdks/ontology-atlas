'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { GitBranch, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  buildOntologyRelationEditPlan,
  buildOntologyRelationRemovalPlan,
  RELATION_EDGE_TYPE,
  type OntologyRelationEditPlan,
  type MeaningEditRelation,
} from '@/entities/knowledge-graph';
import { OntologyChangeReview } from '@/features/ontology-change-review';
import { Button, IconButton, Select, Surface, Textarea } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';

export interface MeaningEditorNode {
  id: string;
  slug: string;
  title: string;
  kind: string;
}

export interface MeaningEditorSource extends MeaningEditorNode {
  frontmatter: Record<string, unknown>;
}

export interface MeaningEditorPreview {
  sourceId: string;
  targetId: string;
  relationType: string;
  phase: 'draft' | 'committing';
}

const RELATIONS: readonly MeaningEditRelation[] = ['isA', 'dependsOn', 'contains', 'relates'];

function candidateAllowed(
  source: MeaningEditorSource,
  candidate: MeaningEditorNode,
  relation: MeaningEditRelation,
): boolean {
  if (candidate.id === source.id) return false;
  if (relation === 'isA') {
    return (
      candidate.kind === source.kind &&
      ['domain', 'capability', 'element'].includes(source.kind)
    );
  }
  if (relation === 'contains') {
    return (
      (source.kind === 'project' && candidate.kind === 'domain') ||
      (source.kind === 'domain' && candidate.kind === 'capability') ||
      (source.kind === 'capability' && candidate.kind === 'element')
    );
  }
  return true;
}

export function MeaningEditorPanel({
  open,
  source,
  candidates,
  initialRelation = 'dependsOn',
  initialTargetId = null,
  initialWhy = '',
  onPreview,
  onApply,
  onClose,
  onExited,
  className,
}: {
  open: boolean;
  source: MeaningEditorSource;
  candidates: readonly MeaningEditorNode[];
  initialRelation?: MeaningEditRelation;
  initialTargetId?: string | null;
  initialWhy?: string;
  onPreview: (preview: MeaningEditorPreview | null) => void;
  onApply: (plan: OntologyRelationEditPlan) => Promise<void>;
  onClose: () => void;
  onExited?: () => void;
  className?: string;
}) {
  const t = useTranslations('meaningEditor');
  const [relation, setRelation] = useState<MeaningEditRelation>(initialRelation);
  const [targetId, setTargetId] = useState(initialTargetId ?? '');
  const [why, setWhy] = useState(initialWhy);
  const [plan, setPlan] = useState<OntologyRelationEditPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = useMemo(
    () => candidates.filter((candidate) => candidateAllowed(source, candidate, relation)),
    [candidates, relation, source],
  );
  const target = eligible.find((candidate) => candidate.id === targetId) ?? null;
  const originalTarget = candidates.find((candidate) => candidate.id === initialTargetId) ?? null;
  const whyRequired = relation === 'dependsOn';
  const canReview = Boolean(target) && (!whyRequired || why.trim().length > 0);

  useEffect(() => {
    if (!open || !target) {
      onPreview(null);
      return;
    }
    onPreview({
      sourceId: source.id,
      targetId: target.id,
      relationType: RELATION_EDGE_TYPE[relation],
      phase: saving ? 'committing' : 'draft',
    });
    return () => onPreview(null);
  }, [open, onPreview, relation, saving, source.id, target]);

  const review = () => {
    if (!target || !canReview) return;
    setError(null);
    const nextPlan = buildOntologyRelationEditPlan({
      sourceSlug: source.slug,
      targetSlug: target.slug,
      fromRelation: originalTarget ? initialRelation : null,
      fromTargetSlug: originalTarget?.slug ?? null,
      toRelation: relation,
      why,
      frontmatter: source.frontmatter,
    });
    if (nextPlan.changeSet.fields.length === 0) {
      setError(t('noChanges'));
      return;
    }
    setPlan(nextPlan);
  };

  const remove = () => {
    if (!originalTarget) return;
    setError(null);
    const nextPlan = buildOntologyRelationRemovalPlan({
      sourceSlug: source.slug,
      targetSlug: originalTarget.slug,
      relation: initialRelation,
      frontmatter: source.frontmatter,
    });
    if (nextPlan.changeSet.fields.length === 0) {
      setError(t('noChanges'));
      return;
    }
    setPlan(nextPlan);
  };

  const apply = async () => {
    if (!plan || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onApply(plan);
    } catch {
      setSaving(false);
      setError(t('saveError'));
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || saving) return;
    event.stopPropagation();
    if (plan) setPlan(null);
    else onClose();
  };

  return (
    <Surface
      open={open}
      onExited={onExited}
      className={["w-[var(--topology-v2-panel-width)]", className ?? ""].join(" ")}
    >
      <section
        role="group"
        aria-label={t('ariaLabel', { name: source.title })}
        data-testid="meaning-editor-panel"
        data-meaning-editor-step={plan ? 'review' : 'edit'}
        onKeyDown={handleKeyDown}
        className="flex max-h-[var(--topology-v2-panel-max-height)] w-full flex-col overflow-y-auto rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] shadow-[var(--topology-v2-panel-shadow)]"
      >
        <header className="flex items-start gap-2 px-[var(--topology-v2-panel-pad)] pb-3 pt-[15px]">
          <span className="mt-0.5 text-[color:var(--color-indigo-accent)]">
            <GitBranch size={ICON_SIZE.md} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <h2 className="truncate text-title font-[var(--font-weight-strong)] leading-title text-[color:var(--topology-v2-panel-text-primary)]">
              {source.title}
            </h2>
            <p className="mt-1 text-label leading-label text-[color:var(--topology-v2-panel-text-tertiary)]">
              {plan ? t('reviewBody') : t('editBody')}
            </p>
          </span>
          <IconButton label={t('close')} size="sm" onClick={onClose} disabled={saving}>
            <X size={ICON_SIZE.lg} aria-hidden />
          </IconButton>
        </header>

        <div className="grid gap-3 border-t border-[color:var(--topology-v2-panel-divider)] px-[var(--topology-v2-panel-pad)] py-4">
          {plan ? (
            <OntologyChangeReview
              changeSet={plan.changeSet}
              testId="meaning-editor-change-review"
            />
          ) : (
            <>
              <Select
                size="lg"
                value={relation}
                onChange={(value) => {
                  setRelation(value as MeaningEditRelation);
                  setPlan(null);
                }}
                ariaLabel={t('relation')}
                options={RELATIONS.map((value) => ({
                  value,
                  label: t(`relationName.${value}`),
                }))}
                data-testid="meaning-editor-relation"
              />
              <Select
                size="lg"
                value={targetId}
                onChange={(value) => {
                  setTargetId(value);
                  setPlan(null);
                }}
                ariaLabel={t('target')}
                options={eligible.map((candidate) => ({
                  value: candidate.id,
                  label: candidate.title,
                  description: candidate.slug,
                }))}
                data-testid="meaning-editor-target"
              />
              <Textarea
                label={t('why')}
                className="w-full"
                rows={3}
                value={why}
                onChange={(event) => setWhy(event.target.value)}
                hint={t(whyRequired ? 'whyRequiredHint' : 'whyHint')}
                data-testid="meaning-editor-why"
              />
            </>
          )}
          {error ? (
            <p role="alert" className="text-body text-[color:var(--color-status-danger)]">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-[color:var(--topology-v2-panel-divider)] bg-[color:var(--topology-v2-panel-surface)] px-[var(--topology-v2-panel-pad)] py-3">
          {!plan && originalTarget ? (
            <Button
              variant="ghost"
              className="mr-auto text-[color:var(--color-status-danger)]"
              data-testid="meaning-editor-remove"
              onClick={remove}
              disabled={saving}
            >
              {t('remove')}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            onClick={() => (plan ? setPlan(null) : onClose())}
            disabled={saving}
          >
            {plan ? t('back') : t('cancel')}
          </Button>
          {plan ? (
            <Button
              variant="primary"
              data-testid="meaning-editor-apply"
              onClick={() => void apply()}
              disabled={saving || plan.changeSet.fields.length === 0}
            >
              {saving ? t('saving') : t('apply')}
            </Button>
          ) : (
            <Button
              variant="primary"
              data-testid="meaning-editor-review"
              onClick={review}
              disabled={!canReview}
            >
              {t('review')}
            </Button>
          )}
        </footer>
      </section>
    </Surface>
  );
}
