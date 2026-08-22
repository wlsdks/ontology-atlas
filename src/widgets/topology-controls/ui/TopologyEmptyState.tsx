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
  /** With a writable local vault, "create the first node from the topology" is the primary entry. */
  canCreateNode?: boolean;
  onCreateNode?: () => void;
  /**
   * The bootstrap gate (discovery.md F1/F2): the open vault has `.md` files but zero
   * map nodes. It acknowledges the user's documents first ("we found N") and makes
   * "build a map from my documents" the primary CTA. With this branch on, the old
   * macOS download guidance — misdirection that offered an app install to someone who
   * had just opened a vault — steps down.
   */
  docsFoundCount?: number;
  onStartFromDocs?: () => void;
  /**
   * **Capability decides — not the runtime, and not "have they already opened one"**
   * (2026-08-08 council).
   *
   * The old decision was `isTauriVaultRuntime() || hasOpenVault`. Someone who is
   * neither — **a first-time web visitor on an FSA-capable browser** — got this panel
   * answering 「install the macOS app」. That person's browser can open a folder right
   * here, right now. Writing "you can't" where you can (`surfaces.md`) is the same
   * illness the 2026-08-07 slice fixed in three places, still surviving here.
   *
   * The decision's single source is the same as `OpenVaultCta`'s:
   * `vault.status !== 'unsupported'`. That `status` already includes the Tauri runtime
   * inside `isSupported()`, so this one value **covers** both old conditions while
   * also splitting web visitors correctly. It is passed in by `HomePage`, which
   * already holds `useLocalVault()` — that also keeps this widget from being bound to
   * a provider, which would stop its unit tests running without one.
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
   * ── The actions **read as one set** (2026-08-03, owner: *"버튼 삐뚤한거 싫어서"* —
   * because I don't like crooked buttons) ──────────────────────────────────────
   *
   * It used to be `flex-wrap justify-center`. Then each button's width is set **by its
   * character count** and so is the wrap point — four buttons sat 1·2·1, a staircase
   * with only the middle row sticking out. This is not a matter of taste but a
   * violation of a discipline this repository has already named: **dimension
   * regularity** — a repeated set's dimensions are a design decision, not a by-product
   * of its content (`design.md`).
   *
   * So they stand as one vertical set. Every width matches and there is no wrap point.
   * Hierarchy is carried by **fill** rather than width (only the primary action gets
   * an indigo surface).
   */
  const ACTION =
    "w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]";
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
        {/* Prose is **left-aligned**. Centring a three-line paragraph in a 380px box
            makes both edges ragged, which is the same illness as the button staircase. */}
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
          <Link href="/topology/?workbench=create" className={SECONDARY}>
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
