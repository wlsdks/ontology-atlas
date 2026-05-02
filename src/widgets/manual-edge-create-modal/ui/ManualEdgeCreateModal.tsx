"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  composeManualEdgeId,
  KNOWLEDGE_EDGE_TYPES,
  validateManualKnowledgeEdgeInput,
  type AddManualKnowledgeEdgeInput,
  type KnowledgeEdgeType,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";

export interface ManualEdgeCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  /** 모든 ontology 노드 — to 검색 + from 선택 후보. */
  existingNodes: KnowledgeGraphNode[];
  /** 같은 (type, from, to) edge 중복 사전 감지. */
  existingEdges: KnowledgeGraphEdge[];
  /** 모달 열릴 때 from 노드 ID prefill (NodeDetailPanel 의 "+ 관계 추가" 흐름). */
  prefillFromId?: string;
  onCreated?: (edgeId: string) => void;
}

interface FormState {
  fromId: string;
  toQuery: string;
  toId: string;
  type: KnowledgeEdgeType;
  label: string;
  manualNote: string;
}

function initialForm(prefillFromId: string): FormState {
  return {
    fromId: prefillFromId,
    toQuery: "",
    toId: "",
    type: "depends_on",
    label: "",
    manualNote: "",
  };
}

export function ManualEdgeCreateModal({
  open,
  onOpenChange,
  accountId,
  existingNodes,
  existingEdges,
  prefillFromId = "",
  onCreated,
}: ManualEdgeCreateModalProps) {
  const [form, setForm] = useState<FormState>(() => initialForm(prefillFromId));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [alreadyExistsId, setAlreadyExistsId] = useState<string | null>(null);

  // 모달 열림 시 prefill 반영 + reset
  useEffect(() => {
    if (!open) return;
    setForm(initialForm(prefillFromId));
    setSubmitting(false);
    setSubmitError(null);
    setAlreadyExistsId(null);
  }, [open, prefillFromId]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const fromNode = useMemo(
    () => existingNodes.find((node) => node.id === form.fromId) ?? null,
    [existingNodes, form.fromId],
  );

  // to 검색 — title 또는 id 부분 매치, 자기 자신 제외, 최대 8 결과
  const toCandidates = useMemo(() => {
    const query = form.toQuery.trim().toLowerCase();
    if (query.length === 0) return [];
    return existingNodes
      .filter((node) => node.id !== form.fromId)
      .filter((node) =>
        node.title.toLowerCase().includes(query) ||
        node.id.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [existingNodes, form.toQuery, form.fromId]);

  const selectedToNode = useMemo(
    () => existingNodes.find((node) => node.id === form.toId) ?? null,
    [existingNodes, form.toId],
  );

  const validation = useMemo(
    () =>
      validateManualKnowledgeEdgeInput({
        accountId,
        from: form.fromId,
        to: form.toId,
        type: form.type,
      }),
    [accountId, form.fromId, form.toId, form.type],
  );

  const composedEdgeId = useMemo(() => {
    if (!form.fromId || !form.toId) return null;
    return composeManualEdgeId(form.type, form.fromId, form.toId);
  }, [form.type, form.fromId, form.toId]);

  const edgeCollision = useMemo(() => {
    if (!composedEdgeId) return null;
    return existingEdges.find((edge) => edge.id === composedEdgeId) ?? null;
  }, [existingEdges, composedEdgeId]);

  const canSubmit = validation.ok && !submitting && !edgeCollision;

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    setAlreadyExistsId(null);
    try {
      const input: AddManualKnowledgeEdgeInput = {
        accountId,
        from: form.fromId,
        to: form.toId,
        type: form.type,
        label: form.label.trim() ? form.label.trim() : undefined,
        manualNote: form.manualNote.trim() ? form.manualNote.trim() : undefined,
        // from 노드의 projectIds 를 그대로 가져와서 publish projection 시 같은
        // 프로젝트 그래프에 묶임. 둘 다 합집합 하는 게 더 정확하지만 v0 단순화.
        projectIds: fromNode?.projectIds ?? [],
      };
      const { addManualKnowledgeEdge } = await import("@/entities/knowledge-graph/api");
      const result = await addManualKnowledgeEdge(input);
      if (result.alreadyExists) {
        setAlreadyExistsId(result.id);
        return;
      }
      onCreated?.(result.id);
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "관계 생성 중 오류가 났어요.";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-edge-modal-title"
      aria-describedby="manual-edge-modal-desc"
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
              Manual edge
            </p>
            <h2
              id="manual-edge-modal-title"
              className="mt-1 text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
            >
              새 관계 직접 추가
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="모달 닫기"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
          >
            <X size={14} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <p
            id="manual-edge-modal-desc"
            className="text-xs leading-5 text-[color:var(--color-text-tertiary)]"
          >
            from → to 두 노드 사이에 관계를 직접 그립니다. 같은 (type, from,
            to) 가 이미 있으면 자동 dedup.
          </p>

          {/* FROM */}
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              From
            </label>
            {fromNode ? (
              <div className="rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm">
                <p className="text-[color:var(--color-text-primary)]">
                  {fromNode.title}
                  <span className="ml-2 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                    {fromNode.kind}
                  </span>
                </p>
                <p className="mt-0.5 break-all font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                  {fromNode.id}
                </p>
              </div>
            ) : (
              <p className="rounded-lg border border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-3 py-2 text-xs text-[color:var(--color-status-danger)]">
                from 노드를 찾을 수 없어요. 모달을 닫고 트리에서 다른 노드를
                선택하세요.
              </p>
            )}
          </div>

          {/* TYPE */}
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              관계 type
            </label>
            <select
              value={form.type}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  type: event.target.value as KnowledgeEdgeType,
                }))
              }
              className="w-full rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            >
              {KNOWLEDGE_EDGE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* TO */}
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              To
            </label>
            {selectedToNode ? (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.08)] px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="text-[color:var(--color-text-primary)]">
                    {selectedToNode.title}
                    <span className="ml-2 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                      {selectedToNode.kind}
                    </span>
                  </p>
                  <p className="mt-0.5 break-all font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                    {selectedToNode.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({ ...prev, toId: "", toQuery: "" }))
                  }
                  className="text-xs text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]"
                >
                  변경
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={form.toQuery}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, toQuery: event.target.value }))
                  }
                  placeholder="노드 제목 또는 ID 검색"
                  className="w-full rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
                />
                {toCandidates.length > 0 ? (
                  <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] p-1">
                    {toCandidates.map((candidate) => (
                      <li key={candidate.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              toId: candidate.id,
                              toQuery: candidate.title,
                            }))
                          }
                          className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[color:rgba(94,106,210,0.10)]"
                        >
                          <span className="text-xs text-[color:var(--color-text-primary)]">
                            {candidate.title}
                            <span className="ml-2 font-mono text-[9px] text-[color:var(--color-text-quaternary)]">
                              {candidate.kind}
                            </span>
                          </span>
                          <span className="break-all font-mono text-[9px] text-[color:var(--color-text-quaternary)]">
                            {candidate.id}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : form.toQuery.trim().length > 0 ? (
                  <p className="mt-1 px-2 text-[11px] text-[color:var(--color-text-quaternary)]">
                    매치 없음.
                  </p>
                ) : null}
              </>
            )}
            {edgeCollision ? (
              <p className="mt-1 text-[11px] text-[color:var(--color-status-warning)]">
                같은 (type, from, to) 관계가 이미 존재합니다.
              </p>
            ) : null}
          </div>

          {/* LABEL */}
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              라벨 (옵션)
            </label>
            <input
              type="text"
              value={form.label}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, label: event.target.value }))
              }
              placeholder="type 외에 더 설명이 필요할 때."
              className="w-full rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            />
          </div>

          {/* NOTE */}
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              메모 (옵션)
            </label>
            <textarea
              value={form.manualNote}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, manualNote: event.target.value }))
              }
              rows={2}
              placeholder="이 관계를 손으로 만든 이유."
              className="w-full resize-none rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            />
          </div>

          {alreadyExistsId ? (
            <div
              role="alert"
              className="rounded-lg border border-[color:rgba(245,158,11,0.32)] bg-[color:rgba(245,158,11,0.08)] px-3 py-2 text-xs text-[color:var(--color-status-warning)]"
            >
              관계 “{alreadyExistsId}” 가 이미 존재합니다.
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
              취소
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.16)] px-3 py-2 text-xs font-medium text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "추가 중…" : "관계 추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
