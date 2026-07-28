'use client';

import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { FolderOpen, GitBranch, Map as MapIcon, Network, Plus } from 'lucide-react';
import { isTauriVaultRuntime } from '@/shared/lib/tauri-vault-fs';

/**
 * Topology empty-state — explains whether the current vault lacks project
 * roots or visible relations, then offers state-specific recovery: bootstrap
 * found docs, create a node, expand the Topology INDEX, open Workshop, or
 * choose a vault. The old tree/Builder surfaces are compatibility routes only;
 * visible actions land in the current Topology/Workshop workflow.
 */
export function TopologyEmptyState({
  projectCount,
  reason,
  canCreateNode = false,
  onCreateNode,
  docsFoundCount = 0,
  onStartFromDocs,
  hasOpenVault = false,
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
  /**
   * 2026-07-24 온보딩 라운드 — 웹(non-Tauri)에서도 로컬 vault 를 이미 연
   * 사용자에게는 "macOS 앱을 설치하고…" 다운로드 카피가 오안내다(방금
   * 폴더를 열었는데 설치를 권함). vault 가 열려 있으면 picker 카피/CTA 를
   * 쓴다.
   */
  hasOpenVault?: boolean;
}) {
  const t = useTranslations('topology.empty');
  const isNoProjects = reason ? reason === 'no-projects' : projectCount === 0;
  // picker 경로: 데스크톱 런타임이거나 이미 로컬 vault 를 연 웹 세션.
  const showPickerPath = isTauriVaultRuntime() || hasOpenVault;
  const hasDocsToBootstrap = docsFoundCount > 0 && onStartFromDocs !== undefined;
  const kicker = hasDocsToBootstrap
    ? t('kickerDocsFound', { count: docsFoundCount })
    : isNoProjects
      ? t('kicker', { count: projectCount })
      : t('kickerNoDeps', { count: projectCount });

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4">
      <div
        className="pointer-events-auto w-[min(380px,calc(100vw-2rem))] rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5 py-5 text-center shadow-[var(--shadow-elevation-1)]"
        role="status"
        aria-label={isNoProjects ? t('titleNoProjects') : t('titleNoDeps')}
        aria-live="polite"
      >
        <p className="font-mono text-caption uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
          {kicker}
        </p>
        <h2 className="mt-2 text-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {hasDocsToBootstrap
            ? t('titleDocsFound')
            : isNoProjects
              ? t('titleNoProjects')
              : t('titleNoDeps')}
        </h2>
        <p className="mt-2 text-body leading-relaxed text-[color:var(--color-text-tertiary)]">
          {hasDocsToBootstrap
            ? t('bodyDocsFound', { count: docsFoundCount })
            : isNoProjects
              ? t(
                  showPickerPath
                    ? 'bodyNoProjectsPicker'
                    : 'bodyNoProjectsDownload',
                )
              : t('bodyNoDeps')}
        </p>
        <p className="mt-3 text-label leading-relaxed text-[color:var(--color-text-tertiary)]">
          {t('crossViewHint')}
        </p>
        <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          {hasDocsToBootstrap ? (
            <button
              type="button"
              onClick={onStartFromDocs}
              data-testid="empty-start-from-docs"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] px-4 text-body font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:var(--color-indigo-a24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
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
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] px-4 text-body font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:var(--color-indigo-a24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
            >
              <Plus size={14} aria-hidden="true" />
              {t('ctaCreateNode')}
            </button>
          ) : null}
          <Link
            href="/ontology/"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-indigo-a40)] bg-[color:var(--color-indigo-a14)] px-4 text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-a60)] hover:bg-[color:var(--color-indigo-a20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
          >
            <Network size={14} aria-hidden="true" />
            {t('ctaTree')}
          </Link>
          <Link
            href="/ontology/studio/"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] px-4 text-body text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
          >
            <GitBranch size={14} aria-hidden="true" />
            {t(isNoProjects ? 'ctaBuilder' : 'ctaBuilderNoDeps')}
          </Link>
          {hasDocsToBootstrap ? null : (
          <Link
            href={showPickerPath ? "/docs/?intent=local" : "/download/"}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] px-4 text-body text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
          >
            <FolderOpen size={14} aria-hidden="true" />
            {t(
              showPickerPath
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
