'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExternalLink, ShieldAlert, ShieldOff } from 'lucide-react';
import { getSharedDoc, type SharedDoc } from '@/entities/shared-doc';

function ShareDocContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get('t') ?? null;
  // 초기 state 에서 token 없으면 'missing' 으로 start — setState-in-effect
  // 를 피하기 위해. token 있으면 'loading' 으로 시작 후 effect 에서 fetch.
  const [state, setState] = useState<{
    status: 'loading' | 'missing' | 'expired' | 'over-limit' | 'loaded' | 'error';
    doc: SharedDoc | null;
    error?: string;
  }>(() => ({
    status: token ? 'loading' : 'missing',
    doc: null,
  }));

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getSharedDoc(token)
      .then((r) => {
        if (cancelled) return;
        if (!r.doc) {
          setState({ status: 'missing', doc: null });
          return;
        }
        if (r.expired) {
          setState({ status: 'expired', doc: r.doc });
          return;
        }
        if (r.overLimit) {
          setState({ status: 'over-limit', doc: r.doc });
          return;
        }
        setState({ status: 'loaded', doc: r.doc });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: 'error',
          doc: null,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // frontmatter 제거 (저장 시 그대로 넣는 경우 대비)
  const body =
    state.doc?.content?.startsWith('---')
      ? state.doc.content.replace(/^---[\s\S]*?\n---\n?/, '')
      : (state.doc?.content ?? '');

  return (
    <main className="min-h-screen bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]">
      {/* 상단 바 — 공개 공유 링크 표식 */}
      <header className="flex h-12 items-center gap-3 border-b border-[color:var(--color-border-soft)] px-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          공유 링크 · {token ? token.slice(0, 8) : '—'}
        </span>
        <div className="ml-auto">
          <Link
            href="/"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[color:var(--color-divider)] px-3 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)]"
          >
            Aslan Project Map
            <ExternalLink size={11} aria-hidden />
          </Link>
        </div>
      </header>

      {state.status === 'loading' ? (
        <div className="mx-auto max-w-[760px] p-8">
          <div className="h-4 w-2/3 animate-pulse rounded bg-[color:var(--color-border-soft)]" />
          <div className="mt-3 h-3 w-5/6 animate-pulse rounded bg-[color:var(--color-overlay-2)]" />
          <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-[color:var(--color-overlay-2)]" />
        </div>
      ) : state.status === 'missing' ? (
        <StatusCard
          icon={
            <ShieldOff
              size={26}
              className="text-[color:var(--color-text-quaternary)]"
              aria-hidden
            />
          }
          title="이 공유 링크는 존재하지 않아요"
          body="URL 이 바뀌었거나 이미 삭제된 링크입니다. 보낸 사람에게 새 링크를 요청하세요."
        />
      ) : state.status === 'expired' ? (
        <StatusCard
          tone="indigo"
          icon={
            <ShieldAlert
              size={26}
              className="text-[color:rgba(139,151,255,0.9)]"
              aria-hidden
            />
          }
          title="이 공유 링크는 만료됐어요"
          body={`만료 시점: ${state.doc?.expiresAt?.toLocaleString('ko-KR') ?? '—'}`}
        />
      ) : state.status === 'over-limit' ? (
        <StatusCard
          tone="indigo"
          icon={
            <ShieldAlert
              size={26}
              className="text-[color:rgba(139,151,255,0.9)]"
              aria-hidden
            />
          }
          title="조회 한도에 도달했어요"
          body={`최대 ${state.doc?.maxViews}회까지 열람 가능한 링크였습니다.`}
        />
      ) : state.status === 'error' ? (
        <StatusCard
          tone="danger"
          icon={
            <ShieldOff
              size={26}
              className="text-[color:rgba(220,150,150,0.9)]"
              aria-hidden
            />
          }
          title="로드 중 오류"
          body={
            <span className="font-mono text-[11px] text-[color:var(--color-text-quaternary)]">
              {state.error}
            </span>
          }
        />
      ) : (
        <article
          data-docs-viewer
          className="mx-auto max-w-[760px] px-6 py-8 md:px-10 md:py-10"
        >
          <h1 className="mb-2 text-[26px] font-semibold leading-tight text-[color:var(--color-text-primary)]">
            {state.doc?.title}
          </h1>
          <div className="mb-6 flex flex-wrap gap-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            <span>{state.doc?.slug}</span>
            {state.doc?.expiresAt ? (
              <span>만료 {state.doc.expiresAt.toLocaleDateString('ko-KR')}</span>
            ) : null}
            {state.doc?.maxViews !== null && state.doc?.maxViews !== undefined ? (
              <span>
                조회 {state.doc.viewCount + 1} / {state.doc.maxViews}
              </span>
            ) : null}
          </div>
          <div className="prose-invert-like">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {body}
            </ReactMarkdown>
          </div>
        </article>
      )}
    </main>
  );
}

/**
 * 상태별 안내 카드 — missing/expired/over-limit/error 공용. tone 으로
 * 테두리·배경 색만 분기해 "딱딱한 에러 화면" 대신 부드러운 카드 느낌.
 */
function StatusCard({
  icon,
  title,
  body,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  tone?: 'neutral' | 'indigo' | 'danger';
}) {
  const borderClass =
    tone === 'indigo'
      ? 'border-[color:rgba(139,151,255,0.28)]'
      : tone === 'danger'
        ? 'border-[color:rgba(220,120,120,0.3)]'
        : 'border-[color:var(--color-divider)]';
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[520px] items-center p-6">
      <div
        className={`flex w-full flex-col items-center gap-3 rounded-md border ${borderClass} bg-[color:rgba(12,14,20,0.5)] px-8 py-10 text-center`}
      >
        {icon}
        <h1 className="text-[16px] font-semibold text-[color:var(--color-text-primary)]">
          {title}
        </h1>
        <div className="max-w-[420px] text-[13px] leading-[1.6] text-[color:var(--color-text-tertiary)]">
          {body}
        </div>
      </div>
    </div>
  );
}

export function ShareDocPage() {
  return (
    <Suspense fallback={null}>
      <ShareDocContent />
    </Suspense>
  );
}
