'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import {
  getKnowledgeDocumentDetailHref,
  getKnowledgeDocumentKindLabel,
  getKnowledgeDocumentStatusLabel,
  type KnowledgeDocument,
} from '@/entities/knowledge-document';
import {
  getPublicDocumentsForProject,
  subscribeKnowledgeDocumentsByProject,
} from '@/entities/knowledge-document/api';
import { DetailCard, EmptyState } from '@/shared/ui';

interface ProjectDocumentsListProps {
  projectSlug: string;
  accountId?: string | null;
  canManageProject: boolean;
  documentNewHref: string;
  returnTo: string;
  /**
   * true 면 비인증 게스트용 경로 — getPublicDocumentsForProject 로 published
   * 문서만 1-shot fetch. false 면 계정 멤버/admin — 기존 subscribe 로 모든
   * 상태의 문서 실시간 수신. Firestore rules 에서 게스트는 published 문서만
   * 공개 계정에서 읽을 수 있어 이 분기가 필요.
   */
  publicOnly?: boolean;
  hideEmptyForPublic?: boolean;
}

function formatRelative(date: Date): string {
  const now = Date.now();
  const then = date.getTime();
  if (!Number.isFinite(then) || then <= 0) return '—';
  const diffMs = now - then;
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return '오늘';
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}일 전`;
  if (diffMs < 30 * day) return `${Math.floor(diffMs / (7 * day))}주 전`;
  if (diffMs < 365 * day) return `${Math.floor(diffMs / (30 * day))}개월 전`;
  return `${Math.floor(diffMs / (365 * day))}년 전`;
}

function statusTone(status: KnowledgeDocument['status']): string {
  switch (status) {
    case 'published':
      return 'border-[color:rgba(94,106,210,0.3)] text-[color:var(--color-indigo-accent)]';
    case 'reviewing':
      return 'border-[color:rgba(244,183,49,0.3)] text-[color:var(--color-status-warning)]';
    case 'error':
      return 'border-[color:rgba(236,116,116,0.3)] text-[color:var(--color-status-danger)]';
    default:
      return 'border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]';
  }
}

/**
 * 프로젝트 상세 페이지의 "등록된 문서" 섹션. projectIds array-contains 쿼리로
 * 현재 프로젝트에 연결된 knowledgeDocuments 만 구독. 오너/admin 은 여기서 바로
 * 새 문서 등록 + 기존 문서 관리 페이지로 이동. 일반 뷰어에게는 문서 수 + 제목
 * 만 보여서 "이 프로젝트엔 이런 문서가 있다" 정도의 맥락 제공.
 *
 * extraction/publish 파이프와 독립적으로 동작 — 문서 upload 즉시 여기 나타남.
 */
export function ProjectDocumentsList({
  projectSlug,
  accountId,
  canManageProject,
  documentNewHref,
  returnTo,
  publicOnly = false,
  hideEmptyForPublic = false,
}: ProjectDocumentsListProps) {
  // null = 아직 fetch 결과가 들어오지 않은 loading 상태. 빈 배열과 구분해서
  // loading skeleton vs empty state 를 분기. setState-in-effect 를 피하려고
  // null sentinel 로 표현.
  const [documents, setDocuments] = useState<KnowledgeDocument[] | null>(null);

  useEffect(() => {
    if (publicOnly) {
      // 게스트 — rule 상 published 만 읽을 수 있으므로 1-shot.
      let cancelled = false;
      void getPublicDocumentsForProject(projectSlug, accountId ?? null).then(
        (docs) => {
          if (cancelled) return;
          setDocuments(docs);
        },
      );
      return () => {
        cancelled = true;
      };
    }

    // 멤버/admin — 모든 상태를 realtime 으로 수신.
    const unsubscribe = subscribeKnowledgeDocumentsByProject(
      projectSlug,
      accountId ?? null,
      setDocuments,
      (error: Error) => {
        console.warn('[ProjectDocumentsList] subscribe failed', error);
      },
    );
    return () => unsubscribe();
  }, [projectSlug, accountId, publicOnly]);

  const loading = documents === null;
  const list = documents ?? [];
  const count = list.length;

  if (hideEmptyForPublic && publicOnly && !loading && count === 0) {
    return null;
  }

  return (
    <DetailCard
      eyebrow="등록된 문서"
      title={`이 프로젝트에 연결된 지식 문서 ${count}개`}
      description="md 파일을 등록하면 바로 이 목록에 반영됩니다. 분해·공개는 문서 상세에서 진행합니다."
      headerAction={
        canManageProject ? (
          <Link
            href={documentNewHref}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-[color:var(--color-indigo-brand)] px-3 text-xs font-[var(--font-weight-signature)] text-white transition-colors hover:bg-[color:var(--color-indigo-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
          >
            <Plus size={12} />
            새 문서 등록
          </Link>
        ) : null
      }
    >
      <>
        {loading ? (
          <ul className="flex flex-col gap-2" aria-label="문서 목록 불러오는 중">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="h-[56px] animate-pulse rounded-xl border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)]"
              />
            ))}
          </ul>
        ) : count === 0 ? (
          <EmptyState
            size="compact"
            title="아직 이 프로젝트에 연결된 문서가 없습니다"
            description={
              canManageProject
                ? "위의 '새 문서 등록' 을 눌러 md 파일 또는 본문을 올리면 이곳에 바로 나타납니다."
                : "공간 주인이 문서를 등록하면 여기에 표시됩니다."
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((document) => {
              const href = getKnowledgeDocumentDetailHref(
                document.id,
                accountId ?? null,
                { projectId: projectSlug, returnTo },
              );
              const kindLabel = getKnowledgeDocumentKindLabel(document.kind);
              const statusLabel = getKnowledgeDocumentStatusLabel(document.status);
              return (
                <li key={document.id}>
                  <Link
                    href={href}
                    className="group flex items-center gap-3 rounded-xl border border-[color:var(--color-border-soft)] px-4 py-3 transition-colors hover:border-[color:rgba(94,106,210,0.28)] hover:bg-[color:var(--color-overlay-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
                  >
                    <FileText
                      size={14}
                      className="shrink-0 text-[color:var(--color-text-quaternary)] transition-colors group-hover:text-[color:var(--color-indigo-accent)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                        {document.title}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                        <span>{kindLabel}</span>
                        <span className="text-[color:var(--color-border-strong)]">·</span>
                        <span>{formatRelative(document.updatedAt)}</span>
                        {document.latestJobStatus ? (
                          <>
                            <span className="text-[color:var(--color-border-strong)]">·</span>
                            <span>job {document.latestJobStatus}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={`inline-flex h-5 shrink-0 items-center rounded-full border px-2 font-mono text-[9px] uppercase tracking-[0.1em] ${statusTone(document.status)}`}
                    >
                      {statusLabel}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </>
    </DetailCard>
  );
}
