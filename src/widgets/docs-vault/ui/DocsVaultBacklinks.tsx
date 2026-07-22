'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import type {
  VaultBacklinkEntry,
  VaultDoc,
} from '@/entities/docs-vault';
import { TopologyV2KindGlyph, isTopologyV2RenderableKind } from '@/shared/ui/topology-v2-kind-glyph';

interface Props {
  entries: VaultBacklinkEntry[];
  docsBySlug: Map<string, VaultDoc>;
  onNavigate: (slug: string) => void;
  hideHeading?: boolean;
  /**
   * 'list' (기본) — 옵시디언식 세로 리스트, 항목별 컨텍스트 expand/collapse.
   * 'strip' — pane 하단 앵커 스트립 (docs-vault-final spec). 가로 chip,
   * 클릭 시 바로 navigate (컨텍스트 expand 없음 — 한눈에 훑는 용도).
   */
  layout?: 'list' | 'strip';
}

/**
 * 역참조 패널 — 이 문서를 참조한 다른 문서들을 문서별로 묶어서 보여준다.
 * 각 항목은 토글해서 해당 문서 내 링크 주변 컨텍스트 (120자) 를 볼 수 있다.
 * 옵시디언의 "Linked mentions" 와 같은 경험.
 */
export function DocsVaultBacklinks({
  entries,
  docsBySlug,
  onNavigate,
  hideHeading = false,
  layout = 'list',
}: Props) {
  const t = useTranslations('vaultWidgets.backlinks');
  if (entries.length === 0) return null;
  if (layout === 'strip') {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {hideHeading ? null : (
          <span className="flex-none font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t('heading', { count: entries.length })}
          </span>
        )}
        {entries.map((entry) => {
          const doc = docsBySlug.get(entry.fromSlug);
          if (!doc) return null;
          const kind = doc.frontmatter?.kind;
          const kindStr = typeof kind === 'string' ? kind : '';
          return (
            <button
              key={entry.fromSlug}
              type="button"
              onClick={() => onNavigate(doc.slug)}
              className="inline-flex flex-none items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1 text-body text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-line-a40)] hover:text-[color:var(--color-text-primary)]"
            >
              {kindStr && isTopologyV2RenderableKind(kindStr) ? (
                <TopologyV2KindGlyph kind={kindStr} size={11} />
              ) : (
                <FileText size={11} className="opacity-60" aria-hidden />
              )}
              <span className="max-w-[160px] truncate">{doc.title}</span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <section>
      {hideHeading ? null : (
        <h3 className="mb-2 font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
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
  const [open, setOpen] = useState(false);
  if (!doc) return null;
  return (
    <li className="rounded-sm border border-transparent transition-colors hover:border-[color:var(--color-overlay-2)]">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? t('collapse') : t('expand')}
          className="flex w-5 flex-none items-center justify-center text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
        >
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
        <button
          type="button"
          onClick={() => onNavigate(doc.slug)}
          className="group flex min-w-0 flex-1 items-center gap-1.5 rounded-sm py-0.5 text-left transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          <FileText
            size={10}
            className="flex-none opacity-60"
            aria-hidden
          />
          <span className="truncate text-[color:var(--color-text-tertiary)] transition-colors group-hover:text-[color:var(--color-text-primary)]">
            {doc.title}
          </span>
        </button>
      </div>
      {open ? (
        <p
          className="mt-1 whitespace-normal rounded-sm bg-[color:var(--color-overlay-1)] px-2 py-1.5 text-label leading-[1.55] text-[color:var(--color-text-quaternary)]"
          dangerouslySetInnerHTML={{
            __html: formatContext(entry.context),
          }}
        />
      ) : null}
    </li>
  );
}

// 빌드 스크립트가 **[linkText]** 로 감싼 부분을 인디고 강조 span 으로 치환.
// 나머지는 전부 escape 해서 xss 방어. "context" 는 이미 raw 마크다운 이라
// 일부 기호 (* ` >) 가 남아있을 수 있지만 textContent 로만 렌더한다.
function formatContext(raw: string): string {
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(
    /\*\*\[([^\]]+)\]\*\*/g,
    (_, text) =>
      `<span class="rounded-sm bg-[color:var(--color-indigo-line-a15)] px-1 text-[color:var(--color-indigo-pale-a92)]">${text}</span>`,
  );
}
