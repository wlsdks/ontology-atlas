'use client';

import { statusDotColor, statusLabel } from '../lib/labels';

export interface SigmaNodeTooltipData {
  name: string;
  domain: string;
  description?: string;
  statusId?: string;
  tags?: string[];
  isHub: boolean;
  /** 해당 노드의 총 연결 수 (in + out degree). undefined 면 배지 숨김. */
  degree?: number;
  x: number;
  y: number;
}

interface Props {
  data: SigmaNodeTooltipData;
}

const TOOLTIP_W = 260;
const TOOLTIP_H = 180;

/**
 * 노드 hover 시 나타나는 리치 툴팁. viewport 우·하단 잘림 방지를 위해
 * 커서 반대 방향으로 auto-flip. window.inner{Width,Height} 로 경계 계산.
 */
export function SigmaNodeTooltip({ data }: Props) {
  const vpW = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const vpH = typeof window !== 'undefined' ? window.innerHeight : 900;
  const flipX = data.x + 16 + TOOLTIP_W > vpW;
  const flipY = data.y + 16 + TOOLTIP_H > vpH;
  const style: React.CSSProperties = {
    left: flipX ? data.x - TOOLTIP_W - 16 : data.x + 16,
    top: flipY ? data.y - TOOLTIP_H - 4 : data.y + 16,
  };
  const dotColor = data.statusId ? statusDotColor(data.statusId) : null;

  return (
    <div
      className="pointer-events-none absolute z-10 flex w-[260px] flex-col gap-2 overflow-hidden rounded-md border border-[color:rgba(139,151,255,0.28)] bg-[color:rgba(12,14,20,1)] px-3.5 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.5)]"
      style={style}
    >
      {/* Status accent 세로 바 — 좌측에 status dot color 를 2px 막대로 세워
          상태를 즉시 파악 가능하게. 카드 배경은 계속 무채색 유지. */}
      {dotColor ? (
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 bottom-0 w-[2px]"
          style={{ backgroundColor: dotColor }}
        />
      ) : null}
      <div className="flex items-center gap-2">
        {dotColor ? (
          <span
            className="inline-block h-1.5 w-1.5 flex-none rounded-full"
            style={{ backgroundColor: dotColor }}
            aria-hidden
          />
        ) : null}
        <span className="text-[13px] font-medium leading-tight text-[color:var(--color-text-primary)]">
          {data.name}
        </span>
        {data.isHub ? (
          <span className="ml-auto rounded-sm border border-[color:rgba(139,151,255,0.35)] px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-[color:rgba(139,151,255,0.9)]">
            허브
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {data.domain ? (
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:rgba(139,151,255,0.85)]">
            {data.domain}
          </span>
        ) : null}
        {data.statusId ? (
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {statusLabel(data.statusId)}
          </span>
        ) : null}
        {typeof data.degree === 'number' && data.degree > 0 ? (
          <span
            className="ml-auto font-mono text-[9px] tabular-nums tracking-[0.08em] text-[color:var(--color-text-quaternary)]"
            title="연결된 프로젝트 수"
          >
            연결 {data.degree}
          </span>
        ) : null}
      </div>
      {data.description ? (
        <p className="text-[11px] leading-[1.55] text-[color:var(--color-text-secondary)] line-clamp-3">
          {data.description}
        </p>
      ) : null}
      {data.tags && data.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {data.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-sm border border-[color:var(--color-border-soft)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
