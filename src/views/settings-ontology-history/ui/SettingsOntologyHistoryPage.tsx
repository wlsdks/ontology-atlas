'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PermissionGate } from '@/features/permissions';
import type {
  OntologyTBoxActiveState,
  OntologyTBoxVersion,
} from '@/entities/ontology-tbox';
import {
  getActiveTBoxState,
  listTBoxVersions,
} from '@/entities/ontology-tbox/api';
import {
  ACCOUNT_QUERY_KEY,
} from '@/shared/lib/account-scope';
import { OperationsNav } from '@/widgets/operations-nav';
import { EmptyState } from '@/shared/ui';

/**
 * `/settings/ontology/history` — 과거 TBox version snapshot 목록 (read-only).
 *
 * 각 행은 versionId / createdAt / createdBy / changeNote / 클래스·관계 카운트
 * 표시. 활성 version 은 인디고 강조 + 'active' pill. 항목 immutable 이라
 * 클릭 시 detail / restore 액션 없음 (현재) — 미래 phase 에서 'restore' 추가
 * 가능 (활성 state swap 만 하면 됨).
 *
 * spec: docs/superpowers/specs/2026-04-28-ontology-tbox-evolution.md
 */
function SettingsOntologyHistoryContent() {
  const searchParams = useSearchParams();
  const accountId = null;
  const [versions, setVersions] = useState<OntologyTBoxVersion[] | null>(null);
  const [activeState, setActiveState] = useState<OntologyTBoxActiveState | null>(
    null,
  );
  const [loadError, setLoadError] = useState<Error | null>(null);

  useEffect(() => {
    if (!accountId) {
      setVersions([]);
      setActiveState(null);
      return;
    }
    let cancelled = false;
    setVersions(null);
    setLoadError(null);
    Promise.all([listTBoxVersions(accountId), getActiveTBoxState(accountId)])
      .then(([list, state]) => {
        if (cancelled) return;
        setVersions(list);
        setActiveState(state);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  return (
    <main className="min-h-screen bg-[color:var(--color-canvas)]">
      <h1 className="sr-only">온톨로지 schema 히스토리</h1>
      <OperationsNav />

      <div className="mx-auto w-full max-w-3xl px-5 py-6 md:px-10 md:py-10">
        <header className="mb-6">
          <Link
            href={'/settings/ontology/'}
            className="mb-2 inline-flex items-center gap-1 text-[12px] text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]"
          >
            <ArrowLeft size={12} aria-hidden /> 활성 schema 로 돌아가기
          </Link>
          <h1 className="break-keep text-[28px] font-[var(--font-weight-signature)] tracking-[var(--tracking-section)] text-[color:var(--color-text-primary)] md:text-3xl">
            schema 히스토리
          </h1>
          <p className="mt-2 break-keep text-sm leading-6 text-[color:var(--color-text-secondary)]">
            과거 TBox version snapshot — immutable 로 보존돼요. 클래스/관계가
            추가될 때마다 새 version 이 자라요.
          </p>
        </header>

        {loadError ? (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-5 py-4 text-sm text-[color:var(--color-status-danger)]"
          >
            히스토리를 불러오는 중 오류: {loadError.message}
          </div>
        ) : null}

        {!versions && !loadError ? (
          <div className="rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-6 py-10 text-center text-sm text-[color:var(--color-text-tertiary)]">
            불러오는 중…
          </div>
        ) : null}

        {versions && versions.length === 0 ? (
          <EmptyState
            tone="solid"
            align="center"
            title="아직 만들어진 version snapshot 이 없어요"
            description="활성 schema 에서 클래스 또는 관계를 추가하면 첫 version 이 생겨요."
          />
        ) : null}

        {versions && versions.length > 0 ? (
          <ul className="overflow-hidden rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
            {versions.map((version, index) => {
              const isActive = activeState?.versionId === version.versionId;
              const isLast = index === versions.length - 1;
              return (
                <li
                  key={version.versionId}
                  className={`flex flex-wrap items-start gap-3 px-4 py-3.5 ${
                    isLast ? '' : 'border-b border-[color:var(--color-overlay-2)]'
                  } ${isActive ? 'bg-[color:rgba(94,106,210,0.06)]' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <p className="break-all font-mono text-[12px] text-[color:var(--color-text-primary)]">
                        {version.versionId}
                      </p>
                      {isActive ? (
                        <span className="inline-flex shrink-0 rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:rgba(159,170,235,0.95)]">
                          active
                        </span>
                      ) : null}
                      <span className="font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                        {version.createdAt.toLocaleString('ko-KR')}
                      </span>
                    </div>
                    {version.changeNote ? (
                      <p className="mt-1 break-keep text-[12.5px] leading-5 text-[color:var(--color-text-secondary)]">
                        {version.changeNote}
                      </p>
                    ) : null}
                    <p className="mt-1 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                      클래스 {version.classes.length} · 관계 {version.relations.length} · by {version.createdBy}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </main>
  );
}

export function SettingsOntologyHistoryPage() {
  return (
    <PermissionGate>
      <SettingsOntologyHistoryContent />
    </PermissionGate>
  );
}
