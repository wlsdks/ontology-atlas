'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import type { KnowledgeProjectInsight } from '@/entities/knowledge-graph';
import {
  subscribeKnowledgeApprovedGraph,
  subscribeKnowledgePublicGraph,
} from '@/entities/knowledge-graph/api';
import {
  loadActiveTBox,
  type ActiveTBox,
} from '@/entities/ontology-tbox/api';
import { getFirebaseAuth } from '@/shared/api';
import {
  exportPayloadToJson,
  serializeOntologyExportV1,
  suggestExportFilename,
} from '@/shared/lib/ontology-export';

export interface OntologyExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string | null;
}

interface FetchedData {
  insight: KnowledgeProjectInsight;
  tbox: ActiveTBox;
}

/**
 * Ontology JSON 내보내기 — 활성 graph + TBox snapshot 을 v1 형식으로
 * Blob download.
 *
 * 흐름:
 *   1. modal open 시 useEffect 가 nodes/edges + 활성 TBox fetch (병렬)
 *   2. 사용자가 옵션 (note / TBox 포함 여부) 입력
 *   3. '내보내기' 클릭 → serialize → JSON → Blob → anchor click 다운로드
 *
 * 형식: ontology-export-v1 (P3 spec). pretty=true 기본 (사용자 검토용).
 *
 * spec: docs/superpowers/specs/2026-04-28-ontology-export-import.md
 */
export function OntologyExportModal({
  open,
  onOpenChange,
  accountId,
}: OntologyExportModalProps) {
  const [data, setData] = useState<FetchedData | null>(null);
  const [fetchError, setFetchError] = useState<Error | null>(null);
  const [includeTBox, setIncludeTBox] = useState(true);
  const [pretty, setPretty] = useState(true);
  const [note, setNote] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  // A2-3 — 데이터 소스. `public` 은 발행된 projection (외부 공유용 백업),
  // `approved` 는 canonical store (publish 전 포함, golden 채점 / 1 차
  // 백업 용). 같은 modal 안에서 라디오로 전환.
  const [source, setSource] = useState<'public' | 'approved'>('public');

  // open 시 한 번 fetch — onSnapshot 첫 emit 받고 unsubscribe.
  useEffect(() => {
    if (!open) return;
    setData(null);
    setFetchError(null);
    setDownloadError(null);

    let unsub: (() => void) | null = null;
    let cancelled = false;
    let receivedInsight = false;

    const tboxPromise = loadActiveTBox(accountId);

    const subscribeFn =
      source === 'approved'
        ? subscribeKnowledgeApprovedGraph
        : subscribeKnowledgePublicGraph;

    unsub = subscribeFn(
      accountId,
      (insight) => {
        if (cancelled || receivedInsight) return;
        receivedInsight = true;
        unsub?.();
        unsub = null;
        tboxPromise
          .then((tbox) => {
            if (cancelled) return;
            setData({ insight, tbox });
          })
          .catch((err: unknown) => {
            if (cancelled) return;
            setFetchError(err instanceof Error ? err : new Error(String(err)));
          });
      },
      (err) => {
        if (cancelled) return;
        setFetchError(err);
      },
    );

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [open, accountId, source]);

  // ESC 닫기.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const nodeCount = data?.insight.nodes.length ?? 0;
  const edgeCount = data?.insight.edges.length ?? 0;
  const classCount = data?.tbox.classes.length ?? 0;
  const relationCount = data?.tbox.relations.length ?? 0;
  const tboxVersionId = data?.tbox.versionId ?? '—';

  const canDownload = !!data && !downloading;

  const handleDownload = () => {
    if (!data || !accountId) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const auth = getFirebaseAuth();
      const uid = auth.currentUser?.uid ?? 'unknown';
      const payload = serializeOntologyExportV1({
        exportedBy: uid,
        accountId,
        tboxVersionId: data.tbox.versionId,
        nodes: data.insight.nodes,
        edges: data.insight.edges,
        options: {
          classes: includeTBox ? data.tbox.classes : [],
          relations: includeTBox ? data.tbox.relations : [],
          note: note.trim() || undefined,
        },
      });
      const json = exportPayloadToJson(payload, { pretty });
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = suggestExportFilename(payload);
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      onOpenChange(false);
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : '내보내기 실패',
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ontology-export-modal-title"
      aria-describedby="ontology-export-modal-desc"
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
              Ontology · 내보내기
            </p>
            <h2
              id="ontology-export-modal-title"
              className="mt-1 text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
            >
              JSON 백업 받기
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
            id="ontology-export-modal-desc"
            className="text-xs leading-5 text-[color:var(--color-text-tertiary)]"
          >
            현재 활성 ontology 의 노드 + 엣지 + (옵션) TBox snapshot 을 한
            JSON 파일로 받습니다. 형식: <code className="font-mono">ontology-export-v1</code>.
            Date 는 ISO string 으로, 정렬은 id ASC 으로 결정적 출력.
          </p>

          {fetchError ? (
            <div
              role="alert"
              className="rounded-lg border border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-3 py-2 text-xs text-[color:var(--color-status-danger)]"
            >
              데이터 불러오기 실패: {fetchError.message}
            </div>
          ) : null}

          <fieldset className="space-y-1.5 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3">
            <legend className="px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              데이터 소스
            </legend>
            <label className="flex items-start gap-2 text-sm text-[color:var(--color-text-secondary)]">
              <input
                type="radio"
                name="ontology-export-source"
                value="public"
                checked={source === 'public'}
                onChange={() => setSource('public')}
                className="mt-1"
              />
              <span>
                공개 화면 (현재 발행됨) — 외부 공유 / 다운스트림 백업.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-[color:var(--color-text-secondary)]">
              <input
                type="radio"
                name="ontology-export-source"
                value="approved"
                checked={source === 'approved'}
                onChange={() => setSource('approved')}
                className="mt-1"
              />
              <span>
                Approved (canonical, 미발행 포함) — 1 차 진실원 백업 / golden 채점.
              </span>
            </label>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <Stat label="노드" value={data ? String(nodeCount) : '…'} />
            <Stat label="엣지" value={data ? String(edgeCount) : '…'} />
            <Stat label="TBox 클래스" value={data ? String(classCount) : '…'} />
            <Stat label="TBox 관계" value={data ? String(relationCount) : '…'} />
          </div>
          <p className="font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
            TBox version · {tboxVersionId}
          </p>

          <div className="space-y-2 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3">
            <label className="flex items-start gap-2 text-sm text-[color:var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked={includeTBox}
                onChange={(event) => setIncludeTBox(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                TBox 포함 (클래스 {classCount} · 관계 {relationCount}) — round-trip 시 schema 복원 가능
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-[color:var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked={pretty}
                onChange={(event) => setPretty(event.target.checked)}
                className="mt-0.5"
              />
              <span>읽기 좋게 (들여쓰기) — 파일 크기 ↑, diff 시각 비교 ↑</span>
            </label>
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              메모 (옵션)
            </label>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="예: 백업 2026-04-28 — capability 정리 직전"
              className="w-full rounded-lg border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-[color:var(--color-text-quaternary)]">
              payload 의 <code className="font-mono">note</code> 필드에 박힘 — 미래 import 시 식별.
            </p>
          </div>

          <p className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
            ⚠️ 노드 summary / manualNote 에 민감 정보가 있을 수 있어요. 외부 공유 전 한 번 검토하세요.
          </p>

          {downloadError ? (
            <div
              role="alert"
              className="rounded-lg border border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-3 py-2 text-xs text-[color:var(--color-status-danger)]"
            >
              {downloadError}
            </div>
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
            onClick={handleDownload}
            disabled={!canDownload}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.16)] px-3 py-2 text-xs font-medium text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={12} aria-hidden />
            {downloading ? '내보내는 중…' : 'JSON 다운로드'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
        {label}
      </p>
      <p className="mt-0.5 break-keep text-[15px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
        {value}
      </p>
    </div>
  );
}
