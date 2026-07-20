'use client';

import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { FolderOpen, GitBranch, Map as MapIcon, Network, Plus } from 'lucide-react';
import { isTauriVaultRuntime } from '@/shared/lib/tauri-vault-fs';

/**
 * Topology empty-state — when the graph has 0–1 projects, showing the
 * lone Sigma dot tells the user "this page is broken" rather than "this
 * page has no edges yet" (eval finding B3, 2026-05-02). Displays a
 * quiet empty panel with one explanatory sentence and recovery CTAs.
 *
 * 토폴로지는 *프로젝트 의존도* 1 view 뿐 — vault 의 다른 kind (domain /
 * capability / element) 노드가 풍부해도 여기서는 안 보인다. 그래서
 * "트리에서 ontology 전체 보기" CTA 를 함께 노출해, 사용자가 "이 화면은
 * 비었지만 데이터는 있다" 를 즉시 인지할 수 있게 한다.
 */
export function TopologyEmptyState({
  projectCount,
  reason,
  canCreateNode = false,
  onCreateNode,
  docsFoundCount = 0,
  onStartFromDocs,
}: {
  projectCount: number;
  reason?: 'no-projects' | 'no-relations';
  /** S6 — writable 로컬 vault 면 "첫 노드를 토폴로지에서" 가 1차 진입. */
  canCreateNode?: boolean;
  onCreateNode?: () => void;
  /**
   * 부트스트랩 게이트 (discovery.md F1/F2): 열린 vault 에 .md 는 있는데
   * 지도 노드가 0 일 때 — 사용자의 문서 존재를 먼저 인정하고("N개를
   * 찾았어요") "내 문서로 지도 만들기"를 1차 CTA 로 세운다. 이 브랜치가
   * 켜지면 기존 macOS 다운로드 안내(방금 vault 를 연 사람에게 앱 설치를
   * 권하던 오안내)는 내려간다.
   */
  docsFoundCount?: number;
  onStartFromDocs?: () => void;
}) {
  const t = useTranslations('topology.empty');
  const isNoProjects = reason ? reason === 'no-projects' : projectCount === 0;
  const isDesktopRuntime = isTauriVaultRuntime();
  const hasDocsToBootstrap = docsFoundCount > 0 && onStartFromDocs !== undefined;
  const kicker = hasDocsToBootstrap
    ? t('kickerDocsFound', { count: docsFoundCount })
    : isNoProjects
      ? t('kicker', { count: projectCount })
      : t('kickerNoDeps', { count: projectCount });

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4">
      <div
        className="pointer-events-auto w-[min(380px,calc(100vw-2rem))] rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5 py-5 text-center shadow-[0_10px_28px_var(--color-shadow-a25)]"
        role="status"
        aria-label={isNoProjects ? t('titleNoProjects') : t('titleNoDeps')}
        aria-live="polite"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
          {kicker}
        </p>
        <h2 className="mt-2 text-[16px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {hasDocsToBootstrap
            ? t('titleDocsFound')
            : isNoProjects
              ? t('titleNoProjects')
              : t('titleNoDeps')}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--color-text-tertiary)]">
          {hasDocsToBootstrap
            ? t('bodyDocsFound', { count: docsFoundCount })
            : isNoProjects
              ? t(
                  isDesktopRuntime
                    ? 'bodyNoProjectsPicker'
                    : 'bodyNoProjectsDownload',
                )
              : t('bodyNoDeps')}
        </p>
        <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--color-text-tertiary)]">
          {t('crossViewHint')}
        </p>
        <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          {hasDocsToBootstrap ? (
            <button
              type="button"
              onClick={onStartFromDocs}
              data-testid="empty-start-from-docs"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] px-4 text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:var(--color-indigo-a24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
            >
              <MapIcon size={14} aria-hidden="true" />
              {t('ctaStartFromDocs')}
            </button>
          ) : null}
          {canCreateNode && onCreateNode ? (
            <button
              type="button"
              onClick={onCreateNode}
              data-testid="empty-create-node"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] px-4 text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:var(--color-indigo-a24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
            >
              <Plus size={14} aria-hidden="true" />
              {t('ctaCreateNode')}
            </button>
          ) : null}
          <Link
            href="/ontology/"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-indigo-a40)] bg-[color:var(--color-indigo-a14)] px-4 text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-a60)] hover:bg-[color:var(--color-indigo-a20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
          >
            <Network size={14} aria-hidden="true" />
            {t('ctaTree')}
          </Link>
          <Link
            href="/ontology/edit/"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] px-4 text-[12px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
          >
            <GitBranch size={14} aria-hidden="true" />
            {t(isNoProjects ? 'ctaBuilder' : 'ctaBuilderNoDeps')}
          </Link>
          {hasDocsToBootstrap ? null : (
          <Link
            href={isDesktopRuntime ? "/docs/?intent=local" : "/download/"}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] px-4 text-[12px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
          >
            <FolderOpen size={14} aria-hidden="true" />
            {t(
              isDesktopRuntime
                ? 'ctaOpenVaultPicker'
                : 'ctaOpenVaultDownload',
            )}
          </Link>
          )}
        </div>
      </div>
    </div>
  );
}
