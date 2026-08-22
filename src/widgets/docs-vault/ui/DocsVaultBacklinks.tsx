'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import type {
  VaultBacklinkEntry,
  VaultDoc,
} from '@/entities/docs-vault';
import { TopologyV2KindGlyph, isTopologyV2RenderableKind } from '@/shared/ui/topology-v2-kind-glyph';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';
import { Chip, IconButton } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';

interface Props {
  entries: VaultBacklinkEntry[];
  docsBySlug: Map<string, VaultDoc>;
  onNavigate: (slug: string) => void;
  hideHeading?: boolean;
  /**
   * 'list' (default) — an Obsidian-style vertical list where each item expands and
   * collapses its context.
   * 'strip' — an anchor strip at the pane's bottom (docs-vault-final spec).
   * Horizontal chips that navigate on click, with no context expansion — for
   * scanning at a glance.
   */
  layout?: 'list' | 'strip';
}

/**
 * The backlinks panel — other documents that reference this one, grouped by
 * document. Each item toggles to show 120 characters of context around the link in
 * that document. The same experience as Obsidian's "Linked mentions".
 */
export function DocsVaultBacklinks({
  entries,
  docsBySlug,
  onNavigate,
  hideHeading = false,
  layout = 'list',
}: Props) {
  const t = useTranslations('vaultWidgets.backlinks');
  const locale = useLocale();
  if (entries.length === 0) return null;
  if (layout === 'strip') {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {hideHeading ? null : (
          <span className="flex-none font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
            {t('heading', { count: entries.length })}
          </span>
        )}
        {entries.map((entry) => {
          const doc = docsBySlug.get(entry.fromSlug);
          if (!doc) return null;
          const kind = doc.frontmatter?.kind;
          const kindStr = typeof kind === 'string' ? kind : '';
          return (
            <Chip
              key={entry.fromSlug}
              size="lg"
              tone="secondary"
              onClick={() => onNavigate(doc.slug)}
              className="flex-none hover:border-[color:var(--color-indigo-line-a40)] hover:text-[color:var(--color-text-primary)]"
            >
              {kindStr && isTopologyV2RenderableKind(kindStr) ? (
                <TopologyV2KindGlyph kind={kindStr} size={11} />
              ) : (
                <FileText size={ICON_SIZE.sm} className="opacity-60" aria-hidden />
              )}
              <span className="max-w-[160px] truncate">
                {resolveLocaleDisplayName(doc.frontmatter, locale, doc.title)}
              </span>
            </Chip>
          );
        })}
      </div>
    );
  }
  return (
    <section>
      {hideHeading ? null : (
        <h3 className="mb-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
          {t('heading', { count: entries.length })}
        </h3>
      )}
      <ul className="flex flex-col gap-1.5 text-body">
        {entries.map((entry) => (
          <BacklinkItem
            key={entry.fromSlug}
            entry={entry}
            doc={docsBySlug.get(entry.fromSlug)}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </section>
  );
}

function BacklinkItem({
  entry,
  doc,
  onNavigate,
}: {
  entry: VaultBacklinkEntry;
  doc: VaultDoc | undefined;
  onNavigate: (slug: string) => void;
}) {
  const t = useTranslations('vaultWidgets.backlinks');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  if (!doc) return null;
  return (
    <li className="rounded-micro border border-transparent transition-colors hover:border-[color:var(--color-overlay-2)]">
      <div className="flex items-stretch">
        <IconButton
          label={open ? t('collapse') : t('expand')}
          size="sm"
          tone="muted"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="hover:text-[color:var(--color-text-secondary)]"
        >
          {open ? <ChevronDown size={ICON_SIZE.sm} /> : <ChevronRight size={ICON_SIZE.sm} />}
        </IconButton>
        <button
          type="button"
          onClick={() => onNavigate(doc.slug)}
          className={controlClass({ hoverInk: 'strong', shape: "row", size: "sm", className: "group min-w-0 flex-1 gap-1.5 rounded-micro py-0.5" })}
        >
          <FileText
            size={ICON_SIZE.sm}
            className="flex-none opacity-60"
            aria-hidden
          />
          <span className="truncate text-[color:var(--color-text-tertiary)] transition-colors group-hover:text-[color:var(--color-text-primary)]">
            {resolveLocaleDisplayName(doc.frontmatter, locale, doc.title)}
          </span>
        </button>
      </div>
      {open ? (
        <p
          className="mt-1 whitespace-normal rounded-micro bg-[color:var(--color-overlay-1)] px-2 py-1.5 text-label leading-label text-[color:var(--color-text-quaternary)]"
          dangerouslySetInnerHTML={{
            __html: formatContext(entry.context),
          }}
        />
      ) : null}
    </li>
  );
}

// Replace what the build script wrapped in **[linkText]** with an indigo emphasis
// span, escaping everything else against XSS. "context" is still raw markdown, so a
// few symbols (* ` >) may remain, but it is rendered through textContent only.
function formatContext(raw: string): string {
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(
    /\*\*\[([^\]]+)\]\*\*/g,
    (_, text) =>
      `<span class="rounded-micro bg-[color:var(--color-indigo-line-a15)] px-1 text-[color:var(--color-indigo-pale-a92)]">${text}</span>`,
  );
}
