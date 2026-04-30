'use client';

import { cn } from '@/shared/lib/cn';
import type { Project, ProjectCategory } from '@/entities/project';
import { useTaxonomy } from '@/features/taxonomy';

interface Props {
  active: ProjectCategory | null;
  onChange: (next: ProjectCategory | null) => void;
  focusedHub: string | null;
  onToggleHub: (slug: string) => void;
  hubs: Project[];
  /** 모바일/데스크톱 공통 패널 열림 여부. */
  open: boolean;
  /** 선택 후 부모에서 패널을 닫게 하기 위한 콜백. */
  onClosed: () => void;
}

export function RegionNavigator({
  active,
  onChange,
  focusedHub,
  onToggleHub,
  hubs,
  open,
  onClosed,
}: Props) {
  const { categories } = useTaxonomy();

  const handleSelectAll = () => {
    onChange(null);
    onClosed();
  };

  const handleSelectCategory = (id: string) => {
    onChange(id);
    onClosed();
  };

  const handleHubClick = (slug: string) => {
    onToggleHub(slug);
    onClosed();
  };

  return (
    <div
      role="region"
      aria-label="영역 네비게이터"
      className={cn(
        // 모바일: 상단 툴바 아래 중앙 패널. md+ : 우측 고정 카드.
        'pointer-events-auto absolute z-10',
        'left-1/2 top-[8.25rem] w-[calc(100vw-2rem)] max-w-xs -translate-x-1/2',
        'md:left-auto md:right-6 md:top-[5.25rem] md:w-auto md:max-w-none md:translate-x-0',
        open ? 'flex' : 'hidden',
      )}
    >
      <div className="flex w-full flex-col items-stretch gap-2 rounded-[24px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-3 shadow-[0_18px_48px_rgba(0,0,0,0.22)] md:w-[120px] md:gap-1.5 md:p-2.5">
        <span className="ml-1 mt-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
          영역 보기
        </span>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={handleSelectAll}
            aria-pressed={active === null}
            className={cn(
              'min-w-[120px] rounded-xl px-3 py-2.5 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset md:min-w-0 md:px-2.5 md:py-2 md:text-[11px]',
              'font-[var(--font-weight-signature)]',
              active === null
                ? 'bg-[color:rgba(94,106,210,0.16)] text-[color:var(--color-text-primary)] ring-1 ring-[color:rgba(94,106,210,0.45)]'
                : 'text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]',
            )}
          >
            전체
          </button>
          {categories.map((cat) => {
            const isActive = active === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectCategory(cat.id)}
                aria-pressed={isActive}
                className={cn(
                  'min-w-[120px] rounded-xl px-3 py-2.5 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset md:min-w-0 md:px-2.5 md:py-2 md:text-[11px]',
                  'font-[var(--font-weight-signature)]',
                  isActive
                    ? 'bg-[color:rgba(94,106,210,0.16)] text-[color:var(--color-text-primary)] ring-1 ring-[color:rgba(94,106,210,0.45)]'
                    : 'text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]',
                )}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {hubs.length > 0 && (
          <>
            <span className="ml-1 mt-2 border-t border-[color:var(--color-overlay-2)] pt-3 font-mono text-[8px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)] md:mt-1.5 md:pt-2.5">
              허브 중심
            </span>
            <div className="flex flex-col gap-1">
              {hubs.map((h) => {
                const isActive = focusedHub === h.slug;
                return (
                  <button
                    key={h.slug}
                    type="button"
                    onClick={() => handleHubClick(h.slug)}
                    aria-pressed={isActive}
                    className={cn(
                      'flex min-w-[120px] items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset md:min-w-0 md:px-2.5 md:py-2 md:text-[11px]',
                      'font-[var(--font-weight-signature)]',
                      isActive
                        ? 'bg-[color:rgba(94,106,210,0.16)] text-[color:var(--color-indigo-accent)] ring-1 ring-[color:rgba(94,106,210,0.45)]'
                        : 'text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]',
                    )}
                    >
                    <span className="min-w-0 truncate">{h.name}</span>
                    <span className="flex items-center gap-2">
                      {isActive && (
                        <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-indigo-accent)]">
                          선택됨
                        </span>
                      )}
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          isActive
                            ? 'bg-[color:var(--color-indigo-accent)]'
                            : 'bg-[color:var(--color-text-quaternary)]',
                        )}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
