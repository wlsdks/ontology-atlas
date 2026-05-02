'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  appendClassAndActivate,
  type ActiveTBox,
} from '@/entities/ontology-tbox/api';
import type { OntologyClass } from '@/entities/ontology-class';
import { getFirebaseAuth } from '@/shared/api';

export interface TBoxClassCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  /** 활성 TBox — duplicate ID 검사 + version snapshot 기반. */
  activeTBox: ActiveTBox;
  /** 새 version 활성화 후 호출 — UI 가 loadActiveTBox 다시 트리거. */
  onCreated?: (versionId: string, newClassId: string) => void;
}

interface FormState {
  /** 'capability' / 'concept' 같은 kebab-case ID. fact node.kind 의 합법 값. */
  id: string;
  /** 한국어 이름 (예: "역량"). UI 에서 chip / list 라벨로 표시. */
  name: string;
  description: string;
  parentClassId: string;
  changeNote: string;
}

const INITIAL_FORM: FormState = {
  id: '',
  name: '',
  description: '',
  parentClassId: '',
  changeNote: '',
};

const ID_PATTERN = /^[a-z][a-z0-9_-]{0,40}$/;

/**
 * 새 ontology 클래스 1개 추가 + 새 TBox version 활성화.
 *
 * 패턴: ManualNodeCreateModal (#66) 와 같은 구조 (form state / ESC / overlay
 * click / aria-labelledby), 단 결과 액션은 entity api 의
 * `appendClassAndActivate` — 새 version 생성 + 활성화 한 번에.
 *
 * 권한: firestore.rules `isAccountOwner` — owner 가 아니면 setDoc 이 reject.
 * UI 는 사전 검사 안 함, 사용자 친절 메시지로 표시.
 */
export function TBoxClassCreateModal({
  open,
  onOpenChange,
  accountId,
  activeTBox,
  onCreated,
}: TBoxClassCreateModalProps) {
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
    return activeTBox.classes.find((cls) => cls.id === trimmed) ?? null;
  }, [form.id, activeTBox.classes]);

  const idFormatError = useMemo(() => {
    const trimmed = form.id.trim();
    if (!trimmed) return null;
    return ID_PATTERN.test(trimmed) ? null : 'id 형식이 맞지 않아요';
  }, [form.id]);

  const parentOptions = useMemo(() => activeTBox.classes, [activeTBox.classes]);

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
      const newClass: OntologyClass = {
        id: form.id.trim(),
        name: form.name.trim(),
        description: form.description.trim()
          ? form.description.trim()
          : undefined,
        parentClassId: form.parentClassId.trim() || undefined,
        version: 1,
        createdAt: new Date(),
        createdBy: uid,
      };
      const result = await appendClassAndActivate({
        accountId,
        current: activeTBox,
        newClass,
        createdBy: uid,
        changeNote: form.changeNote.trim() || undefined,
      });
      onCreated?.(result.versionId, newClass.id);
      onOpenChange(false);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : '클래스 추가 중 오류가 났어요.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tbox-class-modal-title"
      aria-describedby="tbox-class-modal-desc"
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
              TBox · 클래스 추가
            </p>
            <h2
              id="tbox-class-modal-title"
              className="mt-1 text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
            >
              새 ontology 클래스
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
            id="tbox-class-modal-desc"
            className="text-xs leading-5 text-[color:var(--color-text-tertiary)]"
          >
            새 클래스를 추가하면 활성 TBox 의 새 version 이 만들어지고 즉시
            활성화돼요. 이전 version 은 immutable 로 보존돼요.
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
              placeholder="예: concept · pattern · decision"
              className="w-full rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 font-mono text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-[color:var(--color-text-quaternary)]">
              영문 소문자 + 숫자 + <code className="font-mono">-</code>
              <code className="font-mono">_</code> 만. 첫 글자는 소문자.
            </p>
            {idFormatError ? (
              <p className="mt-1 text-[11px] text-[color:var(--color-status-warning)]">
                {idFormatError}
              </p>
            ) : null}
            {idCollision ? (
              <p className="mt-1 text-[11px] text-[color:var(--color-status-warning)]">
                이 id 는 이미 “{idCollision.name}” 로 활성 TBox 에 있어요.
                다른 id 로 바꾸세요.
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
              placeholder="예: 개념 · 패턴 · 결정"
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
              placeholder="이 클래스가 무엇을 표현하는지 한두 줄."
              className="w-full resize-none rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              상위 클래스 (옵션)
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
              placeholder="예: 진안의 도메인 추가 — concept 클래스"
              className="w-full rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-[color:var(--color-text-quaternary)]">
              version 히스토리에 표시. 비우면 자동 메모.
            </p>
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
              {submitting ? '추가 중…' : '클래스 추가 + 활성화'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
