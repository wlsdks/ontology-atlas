'use client';

import { useEffect, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { type ActiveTBox } from '@/entities/ontology-tbox/api';
import {
  applyTBoxImport,
  detectImportConflicts,
  parseOntologyImportV1,
  type ImportConflictPolicy,
  type ImportPreview,
} from '@/shared/lib/ontology-import';
import { getFirebaseAuth } from '@/shared/api';

export interface OntologyImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string | null;
  activeTBox: ActiveTBox | null;
  onApplied?: (versionId: string) => void;
}

const POLICY_OPTIONS: { value: ImportConflictPolicy; label: string; helper: string }[] = [
  {
    value: 'merge-manual-wins',
    label: 'merge (manual wins)',
    helper: '기존 항목 유지, payload 신규만 추가 — default',
  },
  {
    value: 'skip',
    label: 'skip',
    helper: '같은 ID 는 무시, 신규만 추가',
  },
  {
    value: 'overwrite',
    label: 'overwrite',
    helper: 'payload 항목으로 교체 (기존 metadata 손실 가능)',
  },
];

/**
 * Ontology JSON import — TBox 만 (Phase 3 첫 슬라이스).
 *
 * fact graph (nodes/edges) import 는 Phase 4 Cloud Function 도입 후 — client
 * batch write 로 수만 노드 안전하게 처리 어려움. 현재 단계는 schema (TBox)
 * 만 로드해 새 워크스페이스 cold start 또는 외부 schema reuse 에 사용.
 *
 * 흐름:
 *   1. 파일 선택 → FileReader → JSON string
 *   2. parseOntologyImportV1 → 검증
 *   3. detectImportConflicts → preview (counts + 충돌 ID)
 *   4. 사용자 conflict 정책 선택 + '실행' → applyTBoxImport
 *
 * spec: docs/superpowers/specs/2026-04-28-ontology-export-import.md
 */
export function OntologyImportModal({
  open,
  onOpenChange,
  accountId,
  activeTBox,
  onApplied,
}: OntologyImportModalProps) {
  const [filename, setFilename] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [policy, setPolicy] = useState<ImportConflictPolicy>('merge-manual-wins');
  const [note, setNote] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      // close 시 reset.
      setFilename(null);
      setParseError(null);
      setPreview(null);
      setPolicy('merge-manual-wins');
      setNote('');
      setApplying(false);
      setApplyError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const handleFile = (file: File) => {
    setFilename(file.name);
    setParseError(null);
    setPreview(null);
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? '');
      const result = parseOntologyImportV1(raw);
      if (!result.ok) {
        setParseError(result.error);
        return;
      }
      // conflict detection — activeTBox 가 없으면 모두 신규.
      const detected = detectImportConflicts({
        payload: result.payload,
        currentNodes: [],
        currentEdges: [],
        currentClasses: activeTBox?.classes ?? [],
        currentRelations: activeTBox?.relations ?? [],
      });
      setPreview(detected);
    };
    reader.onerror = () => {
      setParseError('파일 읽기 실패');
    };
    reader.readAsText(file);
  };

  const handleApply = async () => {
    if (!preview || !accountId || !activeTBox) return;
    const auth = getFirebaseAuth();
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setApplyError('로그인 정보를 찾을 수 없어요.');
      return;
    }
    setApplying(true);
    setApplyError(null);
    try {
      const result = await applyTBoxImport({
        payload: preview.payload,
        accountId,
        current: activeTBox,
        importedBy: uid,
        conflictPolicy: policy,
        noteSuffix: note.trim() || undefined,
      });
      onApplied?.(result.versionId);
      onOpenChange(false);
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : '가져오기 실패');
    } finally {
      setApplying(false);
    }
  };

  const canApply = !!preview && !applying && !!accountId && !!activeTBox;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ontology-import-modal-title"
      aria-describedby="ontology-import-modal-desc"
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
              Ontology · 가져오기
            </p>
            <h2
              id="ontology-import-modal-title"
              className="mt-1 text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
            >
              JSON 에서 TBox 가져오기
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

        <div className="space-y-4 px-5 py-5">
          <p
            id="ontology-import-modal-desc"
            className="text-xs leading-5 text-[color:var(--color-text-tertiary)]"
          >
            export 파일에서 TBox (클래스 + 관계) 만 활성 schema 로 가져옵니다.
            노드 / 엣지 import 는 안전한 batch 처리를 위해 Phase 4 (Cloud Function)
            에서 추가 예정.
          </p>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              파일 선택
            </label>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFile(file);
              }}
              className="block w-full text-xs text-[color:var(--color-text-secondary)] file:mr-3 file:rounded-md file:border file:border-[color:var(--color-overlay-3)] file:bg-[color:var(--color-overlay-2)] file:px-3 file:py-1.5 file:text-xs file:text-[color:var(--color-text-primary)] hover:file:border-[color:rgba(94,106,210,0.32)]"
            />
            {filename ? (
              <p className="mt-1 break-all text-[11px] text-[color:var(--color-text-quaternary)]">
                {filename}
              </p>
            ) : null}
            {parseError ? (
              <p className="mt-1 text-[11px] text-[color:var(--color-status-warning)]">
                {parseError}
              </p>
            ) : null}
          </div>

          {preview ? (
            <>
              <div className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                  Preview
                </p>
                <ul className="mt-2 space-y-1 text-[12.5px] leading-5 text-[color:var(--color-text-secondary)]">
                  <li>
                    클래스 {preview.payload.tbox.classes.length} (충돌{' '}
                    {preview.conflictClassIds.length} · 신규{' '}
                    {preview.payload.tbox.classes.length - preview.conflictClassIds.length})
                  </li>
                  <li>
                    관계 {preview.payload.tbox.relations.length} (충돌{' '}
                    {preview.conflictRelationIds.length} · 신규{' '}
                    {preview.payload.tbox.relations.length - preview.conflictRelationIds.length})
                  </li>
                  <li className="text-[color:var(--color-text-quaternary)]">
                    노드 {preview.payload.nodes.length} · 엣지{' '}
                    {preview.payload.edges.length} — Phase 4 까지는 import 안 됨
                  </li>
                </ul>
              </div>

              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                  충돌 정책
                </label>
                <div className="space-y-1">
                  {POLICY_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-start gap-2 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-xs text-[color:var(--color-text-secondary)]"
                    >
                      <input
                        type="radio"
                        name="conflict-policy"
                        value={option.value}
                        checked={policy === option.value}
                        onChange={() => setPolicy(option.value)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-mono text-[color:var(--color-text-primary)]">{option.label}</span>
                        <span className="ml-2 text-[color:var(--color-text-tertiary)]">— {option.helper}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                  메모 (옵션)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="예: 다른 워크스페이스에서 가져옴"
                  className="w-full rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
                />
              </div>

              {applyError ? (
                <div
                  role="alert"
                  className="rounded-lg border border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-3 py-2 text-xs text-[color:var(--color-status-danger)]"
                >
                  {applyError}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[color:var(--color-divider)] px-5 py-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.16)] px-3 py-2 text-xs font-medium text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload size={12} aria-hidden />
            {applying ? '가져오는 중…' : 'TBox 가져오기 + version 활성화'}
          </button>
        </div>
      </div>
    </div>
  );
}
