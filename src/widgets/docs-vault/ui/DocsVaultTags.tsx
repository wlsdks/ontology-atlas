'use client';

import { ChevronDown, Hash, X } from 'lucide-react';

interface Props {
  tags: Record<string, string[]>;
  /** 현재 선택된 태그. null 이면 필터 해제. */
  activeTag: string | null;
  onSelect: (tag: string | null) => void;
}

/**
 * Vault 태그 인덱스. manifest.tags 에서 나온 모든 태그를 빈도순으로 노출.
 * 클릭 = 필터 on/off. 활성 태그에는 인디고 배경, 해제 × 버튼 표기.
 */
export function DocsVaultTags({ tags, activeTag, onSelect }: Props) {
  const entries = Object.entries(tags);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1].length - a[1].length);
  const visibleEntries =
    activeTag && entries.every(([tag]) => tag !== activeTag)
      ? entries.slice(0, 12)
      : entries
          .filter(([tag], index) => index < 12 || tag === activeTag)
          .sort((a, b) => {
            if (a[0] === activeTag) return -1;
            if (b[0] === activeTag) return 1;
            return b[1].length - a[1].length;
          });

  return (
    <details
      className="group flex-none border-t border-[color:var(--color-overlay-2)] px-2 py-2"
      open={activeTag !== null}
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]">
        <Hash size={10} aria-hidden />
        <span>태그</span>
        <span className="text-[color:var(--color-text-quaternary)]">
          {activeTag ? `#${activeTag}` : entries.length}
        </span>
        <ChevronDown
          size={11}
          aria-hidden
          className="ml-auto transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="mt-1.5 flex flex-wrap gap-1 px-1">
        {visibleEntries.map(([tag, slugs]) => {
          const active = activeTag === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onSelect(active ? null : tag)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] transition-colors ${
                active
                  ? 'bg-[color:rgba(94,106,210,0.16)] text-[color:rgba(200,210,255,0.95)]'
                  : 'border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] hover:border-[color:rgba(139,151,255,0.3)] hover:text-[color:var(--color-text-primary)]'
              }`}
              title={`${tag} · ${slugs.length}건`}
            >
              {active ? <X size={9} aria-hidden /> : null}
              {tag}
              <span className="opacity-60">{slugs.length}</span>
            </button>
          );
        })}
      </div>
    </details>
  );
}
