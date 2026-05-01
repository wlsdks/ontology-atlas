'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PermissionGate } from '@/features/permissions';
import {
  loadActiveTBox,
  type ActiveTBox,
} from '@/entities/ontology-tbox';
import { getOntologyKindLabel } from '@/entities/ontology-class';
import {
  ACCOUNT_QUERY_KEY,
} from '@/shared/lib/account-scope';
import { OperationsNav } from '@/widgets/operations-nav';
import { OntologyExportModal } from '@/widgets/ontology-export-modal';
import { OntologyImportModal } from '@/widgets/ontology-import-modal';
import { TBoxClassCreateModal } from '@/widgets/tbox-class-create-modal';
import { TBoxClassEditModal } from '@/widgets/tbox-class-edit-modal';
import { TBoxRelationCreateModal } from '@/widgets/tbox-relation-create-modal';
import type { OntologyClass } from '@/entities/ontology-class';

/**
 * `/settings/ontology` — 활성 TBox 보기 (read-only, P1 Phase 2 첫 슬라이스).
 *
 * 클래스 / 관계 / 활성 versionId 표시. 사용자 변경 (클래스 추가 / 새
 * version 생성) UI 는 다음 fire 에서 추가 — 이번 단계는 "지금 어떤
 * schema 가 활성인지" 가시화 + 진입점 확보.
 *
 * 미래 Phase 2 후반:
 *   - "+ 클래스 추가" 버튼 → 모달 → createTBoxVersion + activateTBoxVersion
 *   - "+ 관계 추가" 버튼 → 같은 패턴
 *   - "version 히스토리" link → listTBoxVersions read-only view
 *
 * spec: docs/superpowers/specs/2026-04-28-ontology-tbox-evolution.md
 */
function SettingsOntologyContent() {
  const searchParams = useSearchParams();
  const accountId = null;
  const [tbox, setTBox] = useState<ActiveTBox | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [relationModalOpen, setRelationModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [classEditTarget, setClassEditTarget] = useState<OntologyClass | null>(null);
  // 새 version 활성화 후 잠시 hint 표시 — 사용자에게 "방금 만든 게 활성화됐다" 신호.
  const [recentVersionId, setRecentVersionId] = useState<string | null>(null);
  // 새 version 활성화 후 자동 reload 트리거.
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setTBox(null);
    setLoadError(null);
    loadActiveTBox(accountId)
      .then((next) => {
        if (!cancelled) setTBox(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err : new Error(String(err)));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, reloadTick]);

  return (
    <main className="min-h-screen bg-[color:var(--color-canvas)]">
      <h1 className="sr-only">온톨로지 schema</h1>
      <OperationsNav />

      <div className="mx-auto w-full max-w-3xl px-5 py-6 md:px-10 md:py-10">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={'/settings/'}
              className="mb-2 inline-flex items-center gap-1 text-[12px] text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]"
            >
              <ArrowLeft size={12} aria-hidden /> 정리로 돌아가기
            </Link>
            <h1 className="break-keep text-[28px] font-[var(--font-weight-signature)] tracking-[var(--tracking-section)] text-[color:var(--color-text-primary)] md:text-3xl">
              온톨로지 schema
            </h1>
            <p className="mt-2 break-keep text-sm leading-6 text-[color:var(--color-text-secondary)]">
              활성 TBox — 노드 클래스 + 관계 타입. 새 클래스 / 관계 추가는 곧
              이 화면에서 가능해질 예정. 현재는 활성 schema 만 가시화.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {tbox ? (
              <button
                type="button"
                onClick={() => setImportModalOpen(true)}
                aria-label="ontology JSON 가져오기"
                title="TBox 만 import (Phase 3)"
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                <span>가져오기</span>
              </button>
            ) : null}
            {tbox ? (
              <button
                type="button"
                onClick={() => setExportModalOpen(true)}
                aria-label="ontology 내보내기"
                title="JSON 백업 다운로드"
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                <span>내보내기</span>
              </button>
            ) : null}
            {tbox ? (
              <button
                type="button"
                onClick={() => setClassModalOpen(true)}
                aria-label="새 ontology 클래스 추가"
                title="새 클래스 추가 + version 활성화"
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.16)] px-3 text-xs text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)]"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>클래스 추가</span>
              </button>
            ) : null}
            {tbox ? (
              <span
                className="shrink-0 rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:rgba(159,170,235,0.95)]"
                title="활성 TBox version"
              >
                version · {tbox.versionId}
              </span>
            ) : null}
          </div>
        </header>

        {recentVersionId ? (
          <div
            role="status"
            className="mb-4 rounded-2xl border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.06)] px-5 py-3 text-[12.5px] leading-5 text-[color:rgba(159,170,235,0.95)]"
          >
            새 version <span className="font-mono">{recentVersionId}</span> 활성화 완료. 추출 워커 + 매뉴얼 작성이 새 schema 를 자동 사용해요.
          </div>
        ) : null}

        {loadError ? (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-5 py-4 text-sm text-[color:var(--color-status-danger)]"
          >
            TBox 를 불러오는 중 오류: {loadError.message}
          </div>
        ) : null}

        {!tbox && !loadError ? (
          <div className="rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-6 py-10 text-center text-sm text-[color:var(--color-text-tertiary)]">
            불러오는 중…
          </div>
        ) : null}

        {tbox ? (
          <div className="space-y-7">
            <section>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="break-keep text-[12px] text-[color:var(--color-text-quaternary)]">
                  클래스 ({tbox.classes.length})
                </h2>
                <p className="text-[11px] text-[color:var(--color-text-quaternary)]">
                  fact 노드의 <code className="font-mono">kind</code> 합법 값
                </p>
              </div>
              <ul className="overflow-hidden rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
                {tbox.classes.map((cls, index) => {
                  const isLast = index === tbox.classes.length - 1;
                  return (
                    <li
                      key={cls.id}
                      className={`flex items-start gap-3 px-4 py-3.5 ${
                        isLast ? '' : 'border-b border-[color:var(--color-overlay-2)]'
                      }`}
                    >
                      <span className="inline-flex shrink-0 rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.08)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:rgba(159,170,235,0.95)]">
                        {getOntologyKindLabel(cls.id)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-keep text-[14px] text-[color:var(--color-text-primary)]">
                          <span className="font-mono">{cls.id}</span>
                          <span className="ml-2 text-[color:var(--color-text-tertiary)]">
                            · {cls.name}
                          </span>
                        </p>
                        {cls.description ? (
                          <p className="mt-0.5 break-keep text-[12.5px] leading-5 text-[color:var(--color-text-tertiary)]">
                            {cls.description}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => setClassEditTarget(cls)}
                        aria-label={`${cls.name} 클래스 수정`}
                        title="라벨 / 설명 / 상위 클래스 수정"
                        className="shrink-0 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
                      >
                        편집
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="break-keep text-[12px] text-[color:var(--color-text-quaternary)]">
                  관계 ({tbox.relations.length})
                </h2>
                <div className="flex items-center gap-2">
                  <p className="hidden text-[11px] text-[color:var(--color-text-quaternary)] sm:block">
                    fact 엣지의 <code className="font-mono">type</code> 합법 값
                  </p>
                  <button
                    type="button"
                    onClick={() => setRelationModalOpen(true)}
                    aria-label="새 ontology 관계 추가"
                    title="새 관계 추가 + version 활성화"
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.16)] px-2.5 text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)]"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    관계 추가
                  </button>
                </div>
              </div>
              <ul className="overflow-hidden rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
                {tbox.relations.map((rel, index) => {
                  const isLast = index === tbox.relations.length - 1;
                  return (
                    <li
                      key={rel.id}
                      className={`flex items-start gap-3 px-4 py-3.5 ${
                        isLast ? '' : 'border-b border-[color:var(--color-overlay-2)]'
                      }`}
                    >
                      <span className="inline-flex shrink-0 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-tertiary)]">
                        {rel.category}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-keep text-[14px] text-[color:var(--color-text-primary)]">
                          <span className="font-mono">{rel.id}</span>
                          <span className="ml-2 text-[color:var(--color-text-tertiary)]">
                            · {rel.name}
                          </span>
                        </p>
                        {rel.description ? (
                          <p className="mt-0.5 break-keep text-[12.5px] leading-5 text-[color:var(--color-text-tertiary)]">
                            {rel.description}
                          </p>
                        ) : null}
                        <p className="mt-1 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                          {rel.symmetric ? 'symmetric' : 'directed'}
                          {' · '}
                          {rel.transitive ? 'transitive' : 'non-transitive'}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-5 py-4">
              <Link
                href={'/settings/ontology/history/'}
                className="inline-flex items-center gap-1.5 break-keep rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-1.5 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
              >
                version 히스토리 →
              </Link>
              <p className="break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                과거 TBox snapshot 이 immutable 로 보존돼요.
              </p>
            </section>
          </div>
        ) : null}

        {tbox ? (
          <>
            <TBoxClassCreateModal
              open={classModalOpen}
              onOpenChange={setClassModalOpen}
              accountId={accountId ?? ''}
              activeTBox={tbox}
              onCreated={(versionId) => {
                setRecentVersionId(versionId);
                setReloadTick((tick) => tick + 1);
              }}
            />
            <TBoxRelationCreateModal
              open={relationModalOpen}
              onOpenChange={setRelationModalOpen}
              accountId={accountId ?? ''}
              activeTBox={tbox}
              onCreated={(versionId) => {
                setRecentVersionId(versionId);
                setReloadTick((tick) => tick + 1);
              }}
            />
            <OntologyExportModal
              open={exportModalOpen}
              onOpenChange={setExportModalOpen}
              accountId={accountId}
            />
            <OntologyImportModal
              open={importModalOpen}
              onOpenChange={setImportModalOpen}
              accountId={accountId}
              activeTBox={tbox}
              onApplied={(versionId) => {
                setRecentVersionId(versionId);
                setReloadTick((tick) => tick + 1);
              }}
            />
            <TBoxClassEditModal
              open={classEditTarget !== null}
              onOpenChange={(next) => {
                if (!next) setClassEditTarget(null);
              }}
              accountId={accountId ?? ''}
              activeTBox={tbox}
              target={classEditTarget}
              onUpdated={(versionId) => {
                setRecentVersionId(versionId);
                setReloadTick((tick) => tick + 1);
              }}
            />
          </>
        ) : null}
      </div>
    </main>
  );
}

export function SettingsOntologyPage() {
  return (
    <PermissionGate>
      <SettingsOntologyContent />
    </PermissionGate>
  );
}
