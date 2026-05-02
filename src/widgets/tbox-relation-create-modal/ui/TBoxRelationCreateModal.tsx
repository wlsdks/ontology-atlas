'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  appendRelationAndActivate,
  type ActiveTBox,
} from '@/entities/ontology-tbox/api';
import type {
  OntologyRelation,
  OntologyRelationCategory,
} from '@/entities/ontology-relation';
import { getFirebaseAuth } from '@/shared/api';

export interface TBoxRelationCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  activeTBox: ActiveTBox;
  onCreated?: (versionId: string, newRelationId: string) => void;
}

const CATEGORIES: { value: OntologyRelationCategory; label: string; helper: string }[] = [
  { value: 'structure', label: 'structure', helper: '구조 — contains / belongs_to' },
  { value: 'behavior', label: 'behavior', helper: '동작 — depends_on / uses / implements' },
  { value: 'evidence', label: 'evidence', helper: '근거 — describes (document → 개념)' },
  { value: 'weak', label: 'weak', helper: '약 연관 — related_to' },
];

interface FormState {
  /** 'depends_on' / 'triggers' 같은 snake_case ID. fact edge.type 의 합법 값. */
  id: string;
  /** 한국어 이름 (예: "발화"). UI 표시. */
  name: string;
  inverseName: string;
  description: string;
  category: OntologyRelationCategory;
  symmetric: boolean;
  transitive: boolean;
  changeNote: string;
}

const INITIAL_FORM: FormState = {
  id: '',
  name: '',
  inverseName: '',
  description: '',
  category: 'behavior',
  symmetric: false,
  transitive: false,
  changeNote: '',
};

const ID_PATTERN = /^[a-z][a-z0-9_]{0,40}$/;

/**
 * 새 ontology 관계 1개 추가 + 새 TBox version 활성화.
 *
 * TBoxClassCreateModal (#85) 와 같은 구조 — 새 (id, name, …) 입력 + dedup
 * 사전 검사 + appendRelationAndActivate. category / symmetric / transitive
 * 같은 관계 metadata 도 입력 (TBox 의 시맨틱 제약).
 *
 * sourceClassIds / targetClassIds 는 v1 에서 입력 안 받고 빈 배열 (모든 클래스
 * 허용) 로 시작. 이후 phase 에서 class 제약 select UI 추가.
 */
export function TBoxRelationCreateModal({
  open,
  onOpenChange,
  accountId,
  activeTBox,
  onCreated,
}: TBoxRelationCreateModalProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const idInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(INITIAL_FORM);
    setSubmitting(false);
    setSubmitError(null);
    const handle = setTimeout(() => idInputRef.current?.focus(), 50);
    return () => clearTimeout(handle);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const idCollision = useMemo(() => {
    const trimmed = form.id.trim();
    if (!trimmed) return null;
    return activeTBox.relations.find((rel) => rel.id === trimmed) ?? null;
  }, [form.id, activeTBox.relations]);

  const idFormatError = useMemo(() => {
    const trimmed = form.id.trim();
    if (!trimmed) return null;
    return ID_PATTERN.test(trimmed) ? null : 'id 형식이 맞지 않아요';
  }, [form.id]);

  const canSubmit =
    !submitting &&
    form.id.trim().length > 0 &&
    form.name.trim().length > 0 &&
    !idCollision &&
    !idFormatError;

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    const auth = getFirebaseAuth();
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setSubmitError('로그인 정보를 찾을 수 없어요.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const newRelation: OntologyRelation = {
        id: form.id.trim(),
        name: form.name.trim(),
        inverseName: form.inverseName.trim() || undefined,
        description: form.description.trim() || undefined,
        sourceClassIds: [],
        targetClassIds: [],
        category: form.category,
        symmetric: form.symmetric,
        transitive: form.transitive,
        version: 1,
        createdAt: new Date(),
        createdBy: uid,
      };
      const result = await appendRelationAndActivate({
        accountId,
        current: activeTBox,
        newRelation,
        createdBy: uid,
        changeNote: form.changeNote.trim() || undefined,
      });
      onCreated?.(result.versionId, newRelation.id);
      onOpenChange(false);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : '관계 추가 중 오류가 났어요.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tbox-relation-modal-title"
      aria-describedby="tbox-relation-modal-desc"
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
              TBox · 관계 추가
            </p>
            <h2
              id="tbox-relation-modal-title"
              className="mt-1 text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
            >
              새 ontology 관계
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
            id="tbox-relation-modal-desc"
            className="text-xs leading-5 text-[color:var(--color-text-tertiary)]"
          >
            새 관계 타입을 추가하면 활성 TBox 의 새 version 이 만들어지고
            즉시 활성화돼요. source/target 클래스 제약은 빈 배열 (모든 클래스
            허용) 로 시작 — 추후 phase 에서 좁힐 수 있어요.
          </p>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              ID *
            </label>
            <input
              ref={idInputRef}
              type="text"
              value={form.id}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, id: event.target.value }))
              }
              placeholder="예: triggers · supersedes · documents"
              className="w-full rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 font-mono text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-[color:var(--color-text-quaternary)]">
              영문 소문자 + 숫자 + <code className="font-mono">_</code>{' '}
              만. snake_case 권장 (기존 7 종 시드와 일관).
            </p>
            {idFormatError ? (
              <p className="mt-1 text-[11px] text-[color:var(--color-status-warning)]">
                {idFormatError}
              </p>
            ) : null}
            {idCollision ? (
              <p className="mt-1 text-[11px] text-[color:var(--color-status-warning)]">
                이 id 는 이미 “{idCollision.name}” 로 활성 TBox 에 있어요.
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              이름 *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="예: 발화 · 대체 · 문서화"
              className="w-full rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              역방향 표시명 (옵션)
            </label>
            <input
              type="text"
              value={form.inverseName}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, inverseName: event.target.value }))
              }
              placeholder="예: triggered-by — UI 에서 incoming 표시용"
              className="w-full rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              설명 (옵션)
            </label>
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              rows={2}
              placeholder="이 관계가 무엇을 표현하는지 한두 줄."
              className="w-full resize-none rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              카테고리 *
            </label>
            <select
              value={form.category}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  category: event.target.value as OntologyRelationCategory,
                }))
              }
              className="w-full rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label} — {cat.helper}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-[color:var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked={form.symmetric}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, symmetric: event.target.checked }))
                }
              />
              symmetric (A→B = B→A)
            </label>
            <label className="flex items-center gap-2 text-sm text-[color:var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked={form.transitive}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, transitive: event.target.checked }))
                }
              />
              transitive (A→B + B→C ⇒ A→C)
            </label>
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              변경 메모 (옵션)
            </label>
            <input
              type="text"
              value={form.changeNote}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, changeNote: event.target.value }))
              }
              placeholder="예: incident → capability 매핑용 — triggers 관계"
              className="w-full rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            />
          </div>

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
              {submitting ? '추가 중…' : '관계 추가 + 활성화'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
