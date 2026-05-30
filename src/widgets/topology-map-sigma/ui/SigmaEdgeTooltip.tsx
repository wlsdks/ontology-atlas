'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

export interface SigmaEdgeTooltipData {
  source: string;
  target: string;
  sourceName: string;
  targetName: string;
  kind?: string;
  x: number;
  y: number;
}

interface Props {
  data: SigmaEdgeTooltipData;
}

export interface EdgeKindLabels {
  knowledge: string;
  referencedBy: string;
  contains: string;
  dependsOn: string;
}

/**
 * 엣지 kind → 표시 라벨. 모두 i18n labels 로 받아 로컬라이즈한다 — 이전엔
 * contains 만 로컬라이즈되고 나머지는 하드코딩 영어였다(ko 사용자 회귀).
 */
export function kindLabel(kind: string | undefined, labels: EdgeKindLabels): string {
  if (kind === 'knowledge') return labels.knowledge;
  if (kind === 'referenced-by') return labels.referencedBy;
  if (kind === 'contains') return labels.contains;
  return labels.dependsOn;
}

/**
 * 엣지 hover 시 "A → B · depends on" 형태로 관계 방향·종류를 노출.
 * viewport 우·하단 경계에 닿으면 커서 반대쪽으로 flip. 렌더 후 실제
 * bounding box 로 측정해 이름 길이에 무관하게 정확히 맞춘다.
 */
export function SigmaEdgeTooltip({ data }: Props) {
  const t = useTranslations('topologyWidgets.edgeTooltip');
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [flip, setFlip] = useState<{ x: boolean; y: boolean }>({
    x: false,
    y: false,
  });
  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    setFlip({
      x: data.x + 14 + rect.width > vpW,
      y: data.y + 14 + rect.height > vpH,
    });
  }, [data.x, data.y, data.sourceName, data.targetName]);
  const style: React.CSSProperties = {
    left: flip.x ? data.x - 14 : data.x + 14,
    top: flip.y ? data.y - 14 : data.y + 14,
    transform: `translate(${flip.x ? '-100%' : '0'}, ${flip.y ? '-100%' : '0'})`,
  };
  return (
    <div
      ref={tooltipRef}
      className="pointer-events-none absolute z-10 flex items-center gap-2 rounded-md border border-[color:rgba(139,151,255,0.28)] bg-[color:rgba(12,14,20,1)] px-3 py-1.5 text-[11px] text-[color:var(--color-text-primary)] shadow-[0_8px_20px_rgba(0,0,0,0.5)]"
      style={style}
    >
      <span>{data.sourceName}</span>
      <span className="text-[color:rgba(139,151,255,0.85)]">→</span>
      <span>{data.targetName}</span>
      <span className="ml-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {kindLabel(data.kind, {
          knowledge: t('kindKnowledge'),
          referencedBy: t('kindReferencedBy'),
          contains: t('kindContains'),
          dependsOn: t('kindDependsOn'),
        })}
      </span>
    </div>
  );
}
