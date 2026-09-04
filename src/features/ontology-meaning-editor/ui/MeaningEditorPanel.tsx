'use client';

import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
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
import { fieldLabel } from '@/shared/ui/control-class';
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

  /*
   * ⚠️ **Reopening reuses this instance** (2026-08-24). The panel stays mounted
   * after `onClose` so its exit animation can run (`Surface` + `onExited`), and
   * `HomePage` keys it by node id — so opening "relation edit" again on the same
   * node hands back the *same* component with all of its step state intact.
   *
   * Paired with `apply` leaving `saving` true on the success path, that was a
   * dead end a person could not get out of: the panel came back showing the
   * review of a change already written to Markdown, its confirm button frozen in
   * the busy state, and -- because every control is `disabled={saving}` -- the
   * "edit again" and close buttons were dead too. The only way out was dismissing the whole
   * node panel. Measured on the installed rc.10 build: still frozen after 90s,
   * with no second write and no error.
   *
   * Opening is the one moment the step is unambiguously "start over", so the
   * transient state is cleared here rather than guessing on the way out.
   */
  const [openedWith, setOpenedWith] = useState(open);
  if (open !== openedWith) {
    // React's documented "adjust state when a prop changes" pattern rather than an
    // effect: the reset has to land in the same render the panel reopens in, so the
    // stale review never paints even for a frame.
    setOpenedWith(open);
    if (open) {
      setPlan(null);
      setSaving(false);
      setError(null);
      setRelation(initialRelation);
      setTargetId(initialTargetId ?? '');
      setWhy(initialWhy);
    }
  }

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
      setError(t('saveError'));
    } finally {
      // Also on the success path: the caller closes the panel, but the instance
      // outlives that close (see the reopen note above), so leaving `saving` true
      // is what froze the reopened panel in its busy state.
      setSaving(false);
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
              {/*
                Both selects used to carry an `ariaLabel` and nothing visible.
                A person reading the panel saw two unnamed dropdowns and no
                statement of what either value goes on to do. The label says
                what the field is; the help line says which program reads it
                and what that program does with it — derived from the code, not
                from intention (`tests/contract/field-help-consumers.contract.test.ts`
                pins each named consumer to the file that performs it).
              */}
              <FieldWithHelp
                id="meaning-editor-relation-field"
                label={t('relation')}
                help={t('relationHelp')}
                testId="meaning-editor-relation-help"
              >
                {(id, describedBy) => (
                  <Select
                    id={id}
                    size="lg"
                    value={relation}
                    onChange={(value) => {
                      setRelation(value as MeaningEditRelation);
                      setPlan(null);
                    }}
                    ariaLabel={t('relation')}
                    ariaDescribedby={describedBy}
                    options={RELATIONS.map((value) => ({
                      value,
                      label: t(`relationName.${value}`),
                    }))}
                    data-testid="meaning-editor-relation"
                  />
                )}
              </FieldWithHelp>
              <FieldWithHelp
                id="meaning-editor-target-field"
                label={t('target')}
                help={t('targetHelp')}
                testId="meaning-editor-target-help"
              >
                {(id, describedBy) => (
                  <Select
                    id={id}
                    size="lg"
                    value={targetId}
                    onChange={(value) => {
                      setTargetId(value);
                      setPlan(null);
                    }}
                    ariaLabel={t('target')}
                    ariaDescribedby={describedBy}
                    options={eligible.map((candidate) => ({
                      value: candidate.id,
                      label: candidate.title,
                      description: candidate.slug,
                    }))}
                    data-testid="meaning-editor-target"
                  />
                )}
              </FieldWithHelp>
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

/**
 * A labelled field whose help line names the program that reads the value.
 *
 * `Select` carries no label or hint of its own (unlike `Input`/`Textarea`), so
 * this wraps it in the same three-part shape the field primitives use — label,
 * control, quaternary help — and hands the control both ids so the help reaches
 * a screen reader as the field's description rather than as loose text beside it.
 */
function FieldWithHelp({
  id,
  label,
  help,
  testId,
  children,
}: {
  id: string;
  label: string;
  help: string;
  testId: string;
  children: (id: string, describedBy: string) => ReactNode;
}) {
  const helpId = `${id}-help`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={fieldLabel()}>
        {label}
      </label>
      {children(id, helpId)}
      <p
        id={helpId}
        data-testid={testId}
        className="text-label leading-label text-[color:var(--color-text-quaternary)]"
      >
        {help}
      </p>
    </div>
  );
}
