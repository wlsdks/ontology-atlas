'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  updateClassMetadataAndActivate,
  type ActiveTBox,
} from '@/entities/ontology-tbox/api';
import type { OntologyClass } from '@/entities/ontology-class';
import { getFirebaseAuth } from '@/shared/api';

export interface TBoxClassEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  activeTBox: ActiveTBox;
  /** 편집 대상 클래스 — open 시점의 값으로 초기 form 채움. */
  target: OntologyClass | null;
  onUpdated?: (versionId: string, classId: string) => void;
}

interface FormState {
  name: string;
  description: string;
  parentClassId: string;
  changeNote: string;
}

/**
 * 활성 TBox 의 한 클래스 metadata (name / description / parentClassId) 만
 * 갱신 + 새 version 자동 활성화.
 *
 * id 는 immutable — fact node.kind 와 묶여 변경 시 cascade migration 필요
 * (별도 phase 의 deprecate+추가 패턴 사용).
 *
 * spec: docs/superpowers/specs/2026-04-28-ontology-tbox-evolution.md §6 Phase 4
 */
export function TBoxClassEditModal({
  open,
  onOpenChange,
  accountId,
  activeTBox,
  target,
  onUpdated,
}: TBoxClassEditModalProps) {
  const [form, setForm] = useState<FormState>({
    name: '',
    description: '',
    parentClassId: '',
    changeNote: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // open + target 변경 시 form 초기값 reset.
  useEffect(() => {
    if (!open || !target) return;
    setForm({
      name: target.name,
      description: target.description ?? '',
      parentClassId: target.parentClassId ?? '',
      changeNote: '',
    });
    setSubmitting(false);
    setSubmitError(null);
  }, [open, target]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  // 다른 부모 후보 = 자기 자신 제외 (cycle 회피 — 단 한 단계만 검사. 더
  // 깊은 cycle 은 별도 검증 필요한데 v1 단순화).
  const parentOptions = useMemo(
    () => (target ? activeTBox.classes.filter((cls) => cls.id !== target.id) : []),
    [activeTBox.classes, target],
  );

  // 변경 감지 — 모두 같으면 disable.
  const isDirty = useMemo(() => {
    if (!target) return false;
    return (
      form.name !== target.name
      || form.description !== (target.description ?? '')
      || form.parentClassId !== (target.parentClassId ?? '')
    );
  }, [form, target]);

  const canSubmit =
    !submitting && form.name.trim().length > 0 && isDirty;

  if (!open || !target) return null;

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
      // patch — 변경된 필드만 전달. parentClassId 빈 문자열은 root 변환 신호.
      const patch: { name?: string; description?: string; parentClassId?: string } = {};
      if (form.name !== target.name) patch.name = form.name.trim();
      if (form.description !== (target.description ?? '')) {
        patch.description = form.description.trim();
      }
      if (form.parentClassId !== (target.parentClassId ?? '')) {
        patch.parentClassId = form.parentClassId.trim();
      }
      const result = await updateClassMetadataAndActivate({
        accountId,
        current: activeTBox,
        classId: target.id,
        patch,
        createdBy: uid,
        changeNote: form.changeNote.trim() || undefined,
      });
      onUpdated?.(result.versionId, target.id);
      onOpenChange(false);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : '클래스 수정 중 오류가 났어요.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tbox-class-edit-modal-title"
      aria-describedby="tbox-class-edit-modal-desc"
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
              TBox · 클래스 수정
            </p>
            <h2
              id="tbox-class-edit-modal-title"
              className="mt-1 text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
            >
              <span className="font-mono text-[12px] text-[color:var(--color-text-tertiary)]">{target.id}</span>{' '}
              · {target.name}
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
            id="tbox-class-edit-modal-desc"
            className="text-xs leading-5 text-[color:var(--color-text-tertiary)]"
          >
            라벨 / 설명 / 상위 클래스만 수정 가능. id 는 fact 노드 kind 와
            묶여 immutable — 다른 id 가 필요하면 새 클래스를 추가하고 기존
            클래스를 deprecate 하세요 (다음 phase).
          </p>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              ID (수정 불가)
            </label>
            <input
              type="text"
              value={target.id}
              readOnly
              disabled
              className="w-full cursor-not-allowed rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2 font-mono text-sm text-[color:var(--color-text-quaternary)]"
            />
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
              className="w-full rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              설명
            </label>
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              rows={2}
              className="w-full resize-none rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              상위 클래스
            </label>
            <select
              value={form.parentClassId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, parentClassId: event.target.value }))
              }
              className="w-full rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            >
              <option value="">— 없음 (root 클래스) —</option>
              {parentOptions.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.id} · {cls.name}
                </option>
              ))}
            </select>
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
              placeholder="예: 라벨 정정 — '역량' → '역량(컴포넌트)'"
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
              {submitting ? '수정 중…' : '수정 + 새 version 활성화'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
