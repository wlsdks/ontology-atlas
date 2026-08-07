'use client';

import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { FolderOpen, GitBranch, Map as MapIcon, Network, Plus } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { controlClass } from '@/shared/ui';

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
  canPickFolder = false,
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
   * **능력이 가른다 — 런타임도, 「이미 열었나」도 아니다** (2026-08-08 카운슬).
   *
   * 종전 판정은 `isTauriVaultRuntime() || hasOpenVault` 였다. 그 둘 다 아닌
   * 사람 — **FSA 를 지원하는 브라우저로 처음 온 웹 방문자** — 에게 이 패널이
   * 「macOS 앱을 설치하세요」로 답했다. 그 사람의 브라우저는 지금 이 자리에서
   * 폴더를 열 수 있다. 되는 것을 안 된다고 쓰는 것이고(`surfaces.md`),
   * 2026-08-07 슬라이스가 세 자리에서 고친 것과 같은 병이 여기 남아 있었다.
   *
   * 판정의 단일 출처는 `OpenVaultCta` 와 같다: `vault.status !== 'unsupported'`.
   * 그 `status` 는 `isSupported()` 안에서 이미 Tauri 런타임을 포함하므로,
   * 이 한 값이 옛 두 조건을 **덮으면서** 웹 방문자까지 맞게 가른다. 값을 넘기는
   * 쪽은 `useLocalVault()` 를 이미 들고 있는 `HomePage` 다 — 이 위젯이 provider
   * 에 묶이면 단위 시험이 provider 없이는 못 도는 것도 함께 막는다.
   */
  canPickFolder?: boolean;
}) {
  const t = useTranslations('topology.empty');
  const isNoProjects = reason ? reason === 'no-projects' : projectCount === 0;
  const showPickerPath = canPickFolder;
  const hasDocsToBootstrap = docsFoundCount > 0 && onStartFromDocs !== undefined;
  const kicker = hasDocsToBootstrap
    ? t('kickerDocsFound', { count: docsFoundCount })
    : isNoProjects
      ? t('kicker', { count: projectCount })
      : t('kickerNoDeps', { count: projectCount });

  /*
   * ── 행동은 **한 벌로 보인다** (2026-08-03, 소유자 지적: *"버튼 삐뚤한거
   * 싫어서"*) ────────────────────────────────────────────────────────────────
   *
   * 종전은 `flex-wrap justify-center` 였다. 그러면 각 버튼의 폭이 **글자 수로**
   * 정해지고 줄바꿈 자리도 글자 수가 정한다 — 넷이 1·2·1 로 앉아 가운데 줄만
   * 튀어나온 계단이 됐다. 이건 취향 문제가 아니라 이 저장소가 이미 이름 붙인
   * 규율의 위반이다: **치수 규칙성** — 반복되는 세트의 치수는 설계 결정이지
   * 내용물의 부산물이 아니다(`design.md`).
   *
   * 그래서 세로 한 벌로 세운다. 폭이 전부 같고 줄바꿈 자리가 없다. 위계는
   * 폭이 아니라 **채움**이 진다(주 행동만 인디고 면).
   */
  const ACTION =
    "w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]";
  const PRIMARY = controlClass({
    shape: 'chip',
    size: 'lg',
    tone: 'accentOnTint',
    className: `${ACTION} border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] font-[var(--font-weight-signature)] hover:border-[color:var(--color-indigo-a60)] hover:bg-[color:var(--color-indigo-a24)]`,
  });
  const SECONDARY = controlClass({
    shape: 'chip',
    size: 'lg',
    tone: 'secondary',
    className: `${ACTION} border-[color:var(--color-border-soft)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]`,
  });

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4">
      <div
        className="pointer-events-auto flex w-[min(380px,calc(100vw-2rem))] flex-col rounded-[var(--radius-panel)] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-5 shadow-[var(--shadow-elevation-1)]"
        role="status"
        aria-label={isNoProjects ? t('titleNoProjects') : t('titleNoDeps')}
        aria-live="polite"
      >
        {/* 산문은 **왼쪽 맞춤**이다. 380px 상자에서 3줄짜리 문단을 가운데
            맞추면 양끝이 다 들쭉날쭉해지고, 그건 버튼 계단과 같은 병이다. */}
        <p className="font-mono text-caption tracking-[var(--tracking-caps-14)] uppercase text-[color:var(--color-text-quaternary)]">
          {kicker}
        </p>
        <h2 className="mt-2 text-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {hasDocsToBootstrap
            ? t('titleDocsFound')
            : isNoProjects
              ? t('titleNoProjects')
              : t('titleNoDeps')}
        </h2>
        <p className="mt-2 text-body leading-body text-[color:var(--color-text-tertiary)]">
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
        <p className="mt-2 text-label leading-prose text-[color:var(--color-text-quaternary)]">
          {t('crossViewHint')}
        </p>
        <div className="mt-4 flex flex-col gap-1.5 border-t border-[color:var(--color-divider)] pt-4">
          {hasDocsToBootstrap ? (
            <button
              type="button"
              onClick={onStartFromDocs}
              data-testid="empty-start-from-docs"
              className={PRIMARY}
            >
              <MapIcon size={ICON_SIZE.md} aria-hidden="true" />
              {t('ctaStartFromDocs')}
            </button>
          ) : null}
          {canCreateNode && onCreateNode ? (
            <button
              type="button"
              onClick={onCreateNode}
              data-testid="empty-create-node"
              className={hasDocsToBootstrap ? SECONDARY : PRIMARY}
            >
              <Plus size={ICON_SIZE.md} aria-hidden="true" />
              {t('ctaCreateNode')}
            </button>
          ) : null}
          <Link href="/ontology/" className={SECONDARY}>
            <Network size={ICON_SIZE.md} aria-hidden="true" />
            {t('ctaTree')}
          </Link>
          <Link href="/ontology/studio/" className={SECONDARY}>
            <GitBranch size={ICON_SIZE.md} aria-hidden="true" />
            {t(isNoProjects ? 'ctaBuilder' : 'ctaBuilderNoDeps')}
          </Link>
          {hasDocsToBootstrap ? null : (
            <Link
              href={showPickerPath ? '/docs/?intent=local' : '/download/'}
              className={SECONDARY}
            >
              <FolderOpen size={ICON_SIZE.md} aria-hidden="true" />
              {t(showPickerPath ? 'ctaOpenVaultPicker' : 'ctaOpenVaultDownload')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
