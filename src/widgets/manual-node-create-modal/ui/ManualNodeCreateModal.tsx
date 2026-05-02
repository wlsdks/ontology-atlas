"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import {
  MANUAL_NODE_KINDS,
  validateManualKnowledgeNodeInput,
  type AddManualKnowledgeNodeInput,
  type KnowledgeGraphNode,
  type ManualNodeKind,
} from "@/entities/knowledge-graph";
import { findSimilarOntologyNodes, recommendDocumentSlug } from "@/shared/lib/ontology-tree";
import { useOntologyKindLabel } from "@/entities/ontology-class";

export interface ManualNodeCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  /** 기존 ontology 노드 — dedup 매치 + 같은 ID 충돌 추측. */
  existingNodes: KnowledgeGraphNode[];
  /** 생성 성공 시 호출. 페이지가 selectedNode 점프 등 후속 처리. */
  onCreated?: (nodeId: string) => void;
}

interface FormState {
  kind: ManualNodeKind;
  id: string;
  /** 사용자가 ID 를 한 번이라도 직접 수정했는지. true 면 title 변경에 따라
   *  자동 갱신 안 함 (사용자 의도 존중). */
  idEdited: boolean;
  title: string;
  summary: string;
  manualNote: string;
}

const INITIAL_FORM: FormState = {
  kind: "capability",
  id: "",
  idEdited: false,
  title: "",
  summary: "",
  manualNote: "",
};

function buildSuggestedId(kind: ManualNodeKind, title: string): string {
  const slug = recommendDocumentSlug(title);
  if (!slug) return "";
  return `${kind}.${slug}`;
}

export function ManualNodeCreateModal({
  open,
  onOpenChange,
  accountId,
  existingNodes,
  onCreated,
}: ManualNodeCreateModalProps) {
  const t = useTranslations('ontologyWidgets');
  const kindLabel = useOntologyKindLabel();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [alreadyExistsId, setAlreadyExistsId] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // 모달 열림 reset + title 자동 포커스
  useEffect(() => {
    if (!open) return;
    setForm(INITIAL_FORM);
    setSubmitting(false);
    setSubmitError(null);
    setAlreadyExistsId(null);
    const handle = setTimeout(() => titleInputRef.current?.focus(), 50);
    return () => clearTimeout(handle);
  }, [open]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const suggestedId = useMemo(
    () => buildSuggestedId(form.kind, form.title),
    [form.kind, form.title],
  );

  const dedupMatches = useMemo(() => {
    if (!form.title.trim()) return [];
    return findSimilarOntologyNodes(
      { id: form.id || form.title, title: form.title, kind: form.kind },
      existingNodes,
      4,
    );
  }, [form.title, form.id, form.kind, existingNodes]);

  const idCollision = useMemo(() => {
    const trimmed = form.id.trim();
    if (!trimmed) return null;
    return existingNodes.find((node) => node.id === trimmed) ?? null;
  }, [form.id, existingNodes]);

  const validation = useMemo(
    () =>
      validateManualKnowledgeNodeInput({
        accountId,
        id: form.id,
        title: form.title,
        kind: form.kind,
      }),
    [accountId, form.id, form.title, form.kind],
  );

  const canSubmit = validation.ok && !submitting && !idCollision;

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    setAlreadyExistsId(null);
    try {
      const input: AddManualKnowledgeNodeInput = {
        accountId,
        id: form.id.trim(),
        title: form.title,
        kind: form.kind,
        summary: form.summary.trim() ? form.summary.trim() : undefined,
        manualNote: form.manualNote.trim() ? form.manualNote.trim() : undefined,
      };
      const { addManualKnowledgeNode } = await import("@/entities/knowledge-graph/api");
      const result = await addManualKnowledgeNode(input);
      if (result.alreadyExists) {
        setAlreadyExistsId(result.id);
        return;
      }
      onCreated?.(result.id);
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('manualNode.submitErrorFallback');
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-node-modal-title"
      aria-describedby="manual-node-modal-desc"
      className="fixed inset-0 z-50 flex items-start justify-center bg-[color:rgba(8,9,12,0.66)] px-4 pt-[10vh]"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-[color:var(--color-overlay-3)] bg-[color:var(--color-panel)] shadow-[0_20px_56px_rgba(0,0,0,0.50)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[color:var(--color-divider)] px-5 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
              {t('manualNode.eyebrow')}
            </p>
            <h2
              id="manual-node-modal-title"
              className="mt-1 text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
            >
              {t('manualNode.title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t('manualNode.closeAria')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
          >
            <X size={14} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <p
            id="manual-node-modal-desc"
            className="text-xs leading-5 text-[color:var(--color-text-tertiary)]"
          >
            {t('manualNode.description')}
          </p>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t('manualNode.kindLabel')}
            </label>
            <select
              value={form.kind}
              onChange={(event) => {
                const nextKind = event.target.value as ManualNodeKind;
                setForm((prev) => ({
                  ...prev,
                  kind: nextKind,
                  // 자동 추천이 활성 상태면 새 kind 로 prefix 도 갱신.
                  id: prev.idEdited ? prev.id : buildSuggestedId(nextKind, prev.title),
                }));
              }}
              className="w-full rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            >
              {MANUAL_NODE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind} · {kindLabel(kind)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t('manualNode.titleLabel')}
            </label>
            <input
              ref={titleInputRef}
              type="text"
              value={form.title}
              onChange={(event) => {
                const nextTitle = event.target.value;
                setForm((prev) => ({
                  ...prev,
                  title: nextTitle,
                  id: prev.idEdited ? prev.id : buildSuggestedId(prev.kind, nextTitle),
                }));
              }}
              placeholder={t('manualNode.titlePlaceholder')}
              className="w-full rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            />
            {dedupMatches.length > 0 ? (
              <div
                className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
                  dedupMatches[0].score >= 80
                    ? "border-[color:rgba(245,158,11,0.32)] bg-[color:rgba(245,158,11,0.08)] text-[color:var(--color-status-warning)]"
                    : "border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-tertiary)]"
                }`}
              >
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                  {dedupMatches[0].score >= 80
                    ? t('manualNode.dedupHeadingHigh')
                    : t('manualNode.dedupHeadingLow')}
                </p>
                <ul className="space-y-1">
                  {dedupMatches.slice(0, 3).map((match) => (
                    <li
                      key={match.node.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="truncate">
                        <span className="text-[color:var(--color-text-primary)]">
                          {match.node.title}
                        </span>
                        <span className="ml-2 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                          {match.node.kind}
                        </span>
                      </span>
                      <span className="font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                        {match.score}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t('manualNode.idLabel')}
            </label>
            <input
              type="text"
              value={form.id}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  id: event.target.value,
                  idEdited: true,
                }))
              }
              placeholder={suggestedId || t('manualNode.idPlaceholder')}
              className="w-full rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 font-mono text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-[color:var(--color-text-quaternary)]">
              {t.rich('manualNode.idHelp', {
                code: (chunks) => <code className="font-mono">{chunks}</code>,
              })}
            </p>
            {idCollision ? (
              <p className="mt-1 text-[11px] text-[color:var(--color-status-warning)]">
                {t('manualNode.idCollision', { title: idCollision.title })}
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t('manualNode.summaryLabel')}
            </label>
            <textarea
              value={form.summary}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, summary: event.target.value }))
              }
              rows={2}
              placeholder={t('manualNode.summaryPlaceholder')}
              className="w-full resize-none rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t('manualNode.noteLabel')}
            </label>
            <textarea
              value={form.manualNote}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, manualNote: event.target.value }))
              }
              rows={2}
              placeholder={t('manualNode.notePlaceholder')}
              className="w-full resize-none rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            />
          </div>

          {alreadyExistsId ? (
            <div
              role="alert"
              className="rounded-lg border border-[color:rgba(245,158,11,0.32)] bg-[color:rgba(245,158,11,0.08)] px-3 py-2 text-xs text-[color:var(--color-status-warning)]"
            >
              {t('manualNode.alreadyExists', { id: alreadyExistsId })}
            </div>
          ) : null}

          {submitError ? (
            <div
              role="alert"
              className="rounded-lg border border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-3 py-2 text-xs text-[color:var(--color-status-danger)]"
            >
              {submitError}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-[color:var(--color-divider)] pt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
            >
              {t('manualNode.cancel')}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.16)] px-3 py-2 text-xs font-medium text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? t('manualNode.submitting') : t('manualNode.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
