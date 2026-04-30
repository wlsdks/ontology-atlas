'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { getProjectRelationshipMeta } from '@/entities/project';
import { cn } from '@/shared/lib/cn';
import { useTaxonomy } from '@/features/taxonomy';

interface LegendRowProps {
  marker: React.ReactNode;
  label: string;
  description?: string;
}

function LegendRow({ marker, label, description }: LegendRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-5 w-10 shrink-0 items-center justify-center">{marker}</span>
      <div className="flex flex-col">
        <span className="text-xs leading-tight text-[color:var(--color-text-secondary)]">
          {label}
        </span>
        {description && (
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
            {description}
          </span>
        )}
      </div>
    </div>
  );
}

function CategoryMarker({
  borderStyle,
  sideLabelText,
}: {
  borderStyle: 'underline' | 'dashed' | 'sideLabel' | 'solid';
  sideLabelText?: string;
}) {
  if (borderStyle === 'underline') {
    return (
      <span className="block h-4 w-10 rounded-sm border border-[color:var(--color-border-soft)] border-b-2 border-b-[color:var(--color-indigo-brand)]" />
    );
  }
  if (borderStyle === 'dashed') {
    return (
      <span className="block h-4 w-10 rounded-sm border border-dashed border-[color:var(--color-border-strong)]" />
    );
  }
  if (borderStyle === 'sideLabel') {
    return (
      <span className="relative block h-4 w-10 rounded-sm border border-[color:var(--color-border-soft)]">
        <span className="absolute -left-1 top-0.5 font-mono text-[7px] uppercase text-[color:var(--color-text-quaternary)]">
          {sideLabelText?.slice(0, 1) ?? 'S'}
        </span>
      </span>
    );
  }
  return <span className="block h-4 w-10 rounded-sm border border-[color:var(--color-divider)]" />;
}

function StatusMarker({ color }: { color: 'success' | 'warning' | 'paused' | 'neutral' }) {
  const className =
    color === 'success'
      ? 'bg-[color:var(--color-status-success)]'
      : color === 'warning'
        ? 'bg-[color:var(--color-status-warning)]'
        : color === 'paused'
          ? 'bg-[color:var(--color-status-paused)]'
          : 'bg-[color:var(--color-text-quaternary)]';

  return <span className={cn('block h-1.5 w-1.5 rounded-full', className)} />;
}

function ConnectionMarker({
  strokeDasharray,
  strokeWidth,
}: {
  strokeDasharray?: string;
  strokeWidth: number;
}) {
  return (
    <svg width="40" height="12" viewBox="0 0 40 12" fill="none" aria-hidden>
      <path
        d="M2 6H38"
        stroke="var(--color-text-secondary)"
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
      />
    </svg>
  );
}

interface LegendProps {
  hidden?: boolean;
  showCategories?: boolean;
}

export function Legend({ hidden = false, showCategories = true }: LegendProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { categories, statuses } = useTaxonomy();
  const connectionRows = [
    getProjectRelationshipMeta("auth"),
    getProjectRelationshipMeta("agent"),
    getProjectRelationshipMeta("dependency"),
  ];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (containerRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (hidden) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="pointer-events-auto fixed left-[max(1rem,env(safe-area-inset-left))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 md:absolute md:bottom-[212px] md:left-auto md:right-6 md:z-10 xl:right-8"
    >
      {/* 모바일에서는 Featured paths 위에 떠 있어야 닫기 버튼이 가려지지 않는다. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3 text-[8px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)] md:h-10 md:gap-2 md:border-[color:var(--color-divider)] md:bg-[color:var(--color-panel)] md:px-3.5 md:text-[9px] md:text-[color:var(--color-text-tertiary)]',
          'transition-colors hover:text-[color:var(--color-text-secondary)] md:hover:text-[color:var(--color-text-primary)] active:bg-[color:var(--color-overlay-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]',
        )}
        aria-label={open ? "범례 접기" : "범례 펼치기"}
        aria-expanded={open}
      >
        <span className="md:hidden">범례</span>
        <span className="hidden md:inline">범례</span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="범례"
          className="absolute bottom-full left-0 mb-2 w-[min(232px,calc(100vw-2rem))] rounded-[20px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-4 shadow-xl md:left-auto md:right-0 md:w-[244px]"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                범례
              </p>
              <p className="mt-1 text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
                보더와 점선, 연결 규칙을 한눈에 확인합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
              aria-label="범례 닫기"
            >
              <X size={14} />
            </button>
          </div>
          {showCategories && (
            <section>
              <h3 className="mb-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                카테고리
              </h3>
              <div className="flex flex-col gap-2">
                {categories.map((category) => (
                  <LegendRow
                    key={category.id}
                    marker={
                      <CategoryMarker
                        borderStyle={category.borderStyle}
                        sideLabelText={category.sideLabelText ?? category.labelEn ?? category.label}
                      />
                    }
                    label={category.label}
                    description={category.labelEn}
                  />
                ))}
                <LegendRow
                  marker={
                    <span className="block h-4 w-10 rounded-sm border border-[color:var(--color-indigo-brand)] bg-[color:rgba(94,106,210,0.2)]" />
                  }
                  label="허브"
                  description="많이 참조되는 중심 노드"
                />
                <LegendRow
                  marker={
                    <span className="block h-4 w-10 rounded-sm border border-[color:rgba(168,178,198,0.4)] bg-[color:rgba(168,178,198,0.18)]" />
                  }
                  label="서비스"
                  description="허브에 연결된 일반 노드"
                />
              </div>
            </section>
          )}

          <section className={cn('border-[color:var(--color-overlay-2)] pt-4', showCategories ? 'mt-5 border-t' : 'mt-0')}>
            <h3 className="mb-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              상태
            </h3>
            <div className="flex flex-col gap-2">
              {statuses.map((status) => (
                <LegendRow
                  key={status.id}
                  marker={<StatusMarker color={status.dotColor} />}
                  label={status.label}
                  description={status.labelEn}
                />
              ))}
            </div>
          </section>

          <section className="mt-5 border-t border-[color:var(--color-overlay-2)] pt-4">
            <h3 className="mb-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              연결
            </h3>
            <div className="flex flex-col gap-2">
              {connectionRows.map((connection) => (
                <LegendRow
                  key={connection.kind}
                  marker={
                    <ConnectionMarker
                      strokeDasharray={connection.strokeDasharray}
                      strokeWidth={connection.strokeWidth}
                    />
                  }
                  label={connection.label}
                  description={connection.description}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
