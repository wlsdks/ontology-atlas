'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMediaQuery } from 'usehooks-ts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Tooltip } from '@/shared/ui';
import type { Project } from '@/entities/project';

// 첫 진입 사용자에게 21개 hub 목록이 즉시 펼쳐져 있으면 중앙 토폴로지로
// 시선이 가지 못한다. 사용자가 한 번 직접 펼치면 그 선택을 기억한다.
const RAIL_OPEN_KEY = 'demo:sigma-hub-rail-open:v1';

interface SigmaHubRailProps {
  projects: Project[];
  selectedSlug?: string | null;
  onSelect: (slug: string) => void;
  /**
   * true 면 Hub Rail 을 완전히 숨김 (tab 포함). 좌상단 Hero 패널이 펼쳐져
   * 있을 때 위치가 겹치는 걸 방지. Hero 가 접히면 false 로 돌아와 정상 렌더.
   */
  suppressed?: boolean;
  /**
   * Layer 1 내부에서 각 hub 이름의 container prefix (예: "Demo Reactor · ")
   * 를 제거해 rail 을 간결하게 만든다. 미지정이면 원본 이름 유지 (Layer 0).
   */
  stripNamePrefix?: string;
}

/**
 * 좌측 세로 허브 shortcut 바. 11개 내외의 허브 프로젝트를 목록으로 노출해
 * 클릭 한 번에 해당 허브로 이동시킨다. 지도의 "주요 정거장" 역할. 접힘 시
 * 얇은 탭만 남겨 지도 공간 확보.
 */
export function SigmaHubRail({
  projects,
  selectedSlug,
  onSelect,
  suppressed = false,
  stripNamePrefix,
}: SigmaHubRailProps) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(RAIL_OPEN_KEY) === '1';
  });
  const setOpenPersisted = useCallback((next: boolean) => {
    setOpen(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RAIL_OPEN_KEY, next ? '1' : '0');
    }
  }, []);
  const activeButtonRef = useRef<HTMLButtonElement | null>(null);
  const buttonsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  // SSR/정적 export 호환 — initializeWithValue:false 로 hydration mismatch 회피.
  const prefersReducedMotion = useMediaQuery(
    '(prefers-reduced-motion: reduce)',
    { initializeWithValue: false },
  );
  useEffect(() => {
    if (!open) return;
    const btn = activeButtonRef.current;
    if (!btn) return;
    btn.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }, [selectedSlug, open, prefersReducedMotion]);
  if (suppressed) return null;
  const prefixWithSep = stripNamePrefix?.trim()
    ? `${stripNamePrefix.trim()} · `
    : '';
  const shortenName = (name: string): string => {
    if (!prefixWithSep || !name.startsWith(prefixWithSep)) return name;
    const rest = name.slice(prefixWithSep.length).trim();
    return rest.length > 0 ? rest : name;
  };
  // 각 프로젝트의 degree (의존 + 참조 총합) 를 계산해 허브 우측 배지로 노출.
  // 허브끼리 규모 차이가 한눈에 들어오게. O(N + E) 한 번만 돌림.
  const degreeBySlug = new Map<string, number>();
  for (const project of projects) {
    const current = degreeBySlug.get(project.slug) ?? 0;
    degreeBySlug.set(project.slug, current + project.dependencies.length);
    for (const dep of project.dependencies) {
      degreeBySlug.set(dep, (degreeBySlug.get(dep) ?? 0) + 1);
    }
  }
  // mission v2 후 Layer 0 컨테이너 시스템 폐기 (PR #41/#42). hub 만 rail 에
  // 노출.
  const hubs = projects
    .filter((p) => p.isHub)
    .slice()
    .sort(
      (a, b) => (degreeBySlug.get(b.slug) ?? 0) - (degreeBySlug.get(a.slug) ?? 0),
    );
  if (hubs.length === 0) return null;
  const railLabel = '허브';

  if (!open) {
    return (
      <Tooltip content="허브 바 펼치기" side="right" withProvider={false}>
        <button
          type="button"
          onClick={() => setOpenPersisted(true)}
          aria-label="허브 바 펼치기"
          className="pointer-events-auto absolute left-0 top-1/2 z-10 hidden h-16 w-5 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-[color:var(--color-divider)] bg-[color:var(--color-panel)] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)] focus-visible:ring-inset md:flex"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </Tooltip>
    );
  }

  const moveFocusToSlug = (slug: string) => {
    const el = buttonsRef.current.get(slug);
    if (el) el.focus();
    onSelect(slug);
  };

  return (
    <div
      role="listbox"
      aria-label={railLabel}
      className="pointer-events-auto absolute bottom-[212px] left-4 top-[140px] z-10 hidden max-h-[calc(100vh-352px)] w-[180px] flex-col gap-1 overflow-auto rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2 py-2 md:left-6 md:flex xl:left-8"
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
          {railLabel} · {hubs.length}
        </span>
        <Tooltip content="허브 바 접기" side="right" withProvider={false}>
          <button
            type="button"
            onClick={() => setOpenPersisted(false)}
            aria-label="허브 바 접기"
            className="rounded-sm text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
        </Tooltip>
      </div>
      {hubs.map((hub, idx) => {
        const active = selectedSlug === hub.slug;
        const degree = degreeBySlug.get(hub.slug) ?? 0;
        const dotColor = active
          ? 'var(--color-indigo-accent)'
          : 'rgba(139,151,255,0.5)';
        return (
          <button
            key={hub.slug}
            ref={(el) => {
              if (el) buttonsRef.current.set(hub.slug, el);
              else buttonsRef.current.delete(hub.slug);
              if (active) activeButtonRef.current = el;
            }}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => onSelect(hub.slug)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                moveFocusToSlug(hubs[(idx + 1) % hubs.length].slug);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                moveFocusToSlug(
                  hubs[(idx - 1 + hubs.length) % hubs.length].slug,
                );
              } else if (e.key === 'Home') {
                e.preventDefault();
                moveFocusToSlug(hubs[0].slug);
              } else if (e.key === 'End') {
                e.preventDefault();
                moveFocusToSlug(hubs[hubs.length - 1].slug);
              }
            }}
            title={`${hub.name} · 연결 ${degree}`}
            className={`relative flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)] focus-visible:ring-inset ${
              active
                ? 'bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-text-primary)]'
                : 'text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]'
            }`}
          >
            {active ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-1 left-0 w-[2px] rounded-full bg-[color:var(--color-indigo-accent)]"
              />
            ) : null}
            <span
              className="h-1.5 w-1.5 flex-none rounded-full"
              style={{ backgroundColor: dotColor }}
              aria-hidden
            />
            <span className="flex-1 truncate">{shortenName(hub.name)}</span>
            <span
              className={`shrink-0 font-mono text-[9px] tabular-nums tracking-[0.04em] ${
                active
                  ? 'text-[color:rgba(139,151,255,0.95)]'
                  : 'text-[color:var(--color-text-quaternary)]'
              }`}
            >
              {degree}
            </span>
          </button>
        );
      })}
    </div>
  );
}
