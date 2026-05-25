'use client';

import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { FolderOpen, GitBranch, Network } from 'lucide-react';
import { isTauriVaultRuntime } from '@/shared/lib/tauri-vault-fs';

/**
 * Topology empty-state — when the graph has 0–1 projects, showing the
 * lone Sigma dot tells the user "this page is broken" rather than "this
 * page has no edges yet" (eval finding B3, 2026-05-02). Displays a
 * Toss-quality card with one explanatory sentence and three recovery CTAs.
 *
 * 토폴로지는 *프로젝트 의존도* 1 view 뿐 — vault 의 다른 kind (domain /
 * capability / element) 노드가 풍부해도 여기서는 안 보인다. 그래서
 * "트리에서 ontology 전체 보기" CTA 를 함께 노출해, 사용자가 "이 화면은
 * 비었지만 데이터는 있다" 를 즉시 인지할 수 있게 한다.
 */
export function TopologyEmptyState({ projectCount }: { projectCount: number }) {
  const t = useTranslations('topology.empty');
  const isNoProjects = projectCount === 0;
  const isDesktopRuntime = isTauriVaultRuntime();

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6">
      <div className="pointer-events-auto max-w-md rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-8 text-center shadow-[0_18px_48px_rgba(0,0,0,0.35)]">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
          {t('kicker', { count: projectCount })}
        </p>
        <h2 className="mt-3 text-[20px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {isNoProjects ? t('titleNoProjects') : t('titleNoDeps')}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--color-text-tertiary)]">
          {isNoProjects
            ? t(
                isDesktopRuntime
                  ? 'bodyNoProjectsPicker'
                  : 'bodyNoProjectsDownload',
              )
            : t('bodyNoDeps')}
        </p>
        <p className="mt-3 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-[11px] leading-relaxed text-[color:var(--color-text-tertiary)]">
          {t('crossViewHint')}
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <Link
            href="/ontology/"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.4)] bg-[color:rgba(94,106,210,0.14)] px-4 text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.6)] hover:bg-[color:rgba(94,106,210,0.2)]"
          >
            <Network size={14} aria-hidden="true" />
            {t('ctaTree')}
          </Link>
          <Link
            href="/ontology/edit/"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] px-4 text-[12px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)]"
          >
            <GitBranch size={14} aria-hidden="true" />
            {t('ctaBuilder')}
          </Link>
          <Link
            href={isDesktopRuntime ? "/docs/?intent=local" : "/download/"}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] px-4 text-[12px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)]"
          >
            <FolderOpen size={14} aria-hidden="true" />
            {t(
              isDesktopRuntime
                ? 'ctaOpenVaultPicker'
                : 'ctaOpenVaultDownload',
            )}
          </Link>
        </div>
      </div>
    </div>
  );
}
