'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Clipboard, X } from 'lucide-react';
import { formatQueryOntologyCall } from '@/shared/lib/ontology-query-call';
import { copyText } from '@/shared/lib/copy-text';
import type { SigmaEdgeAttrs } from '../lib/graph-build';

export interface SigmaEdgeTooltipData {
  edgeId?: string;
  source: string;
  target: string;
  sourceName: string;
  targetName: string;
  kind?: string;
  relationType?: string;
  relationQuality?: SigmaEdgeAttrs['relationQuality'];
  evidenceCount?: number;
  authored?: boolean;
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

export interface RelationQualityLabels {
  strong: string;
  supported: string;
  weak: string;
  review: string;
}

export interface RelationEvidenceLabels {
  sourceBacked: (count: number) => string;
  authored: string;
  needsReview: string;
}

export interface RelationAgentGateLabels {
  handoffReady: string;
  preflightFirst: string;
  reviewFirst: string;
}

export interface RelationAgentDecisionLabels {
  handoffReady: string;
  preflightFirst: string;
  reviewFirst: string;
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

export function relationQualityLabel(
  quality: SigmaEdgeTooltipData['relationQuality'] | undefined,
  labels: RelationQualityLabels,
): string {
  if (quality === 'strong') return labels.strong;
  if (quality === 'weak') return labels.weak;
  if (quality === 'review') return labels.review;
  return labels.supported;
}

export function relationEvidenceLabel(
  data: Pick<SigmaEdgeTooltipData, 'authored' | 'evidenceCount'>,
  labels: RelationEvidenceLabels,
): string {
  if ((data.evidenceCount ?? 0) > 0) return labels.sourceBacked(data.evidenceCount ?? 0);
  if (data.authored) return labels.authored;
  return labels.needsReview;
}

export function relationClaimLensText({
  qualityLabel,
  evidenceLabel,
  typedFactLabel,
}: {
  qualityLabel: string;
  evidenceLabel: string;
  typedFactLabel: string;
}): string {
  return `${qualityLabel} · ${evidenceLabel} · ${typedFactLabel}`;
}

export function relationAgentGateLabel(
  data: Pick<SigmaEdgeTooltipData, 'authored' | 'evidenceCount' | 'relationQuality'>,
  labels: RelationAgentGateLabels,
): string {
  if (data.relationQuality === 'review') return labels.reviewFirst;
  if (data.relationQuality === 'weak') return labels.preflightFirst;
  if ((data.evidenceCount ?? 0) > 0 || data.authored) return labels.handoffReady;
  return labels.reviewFirst;
}

export function relationAgentDecisionText(
  data: Pick<SigmaEdgeTooltipData, 'authored' | 'evidenceCount' | 'relationQuality'>,
  labels: RelationAgentDecisionLabels,
): string {
  if (data.relationQuality === 'review') return labels.reviewFirst;
  if (data.relationQuality === 'weak') return labels.preflightFirst;
  if ((data.evidenceCount ?? 0) > 0 || data.authored) return labels.handoffReady;
  return labels.reviewFirst;
}

function relationQualityTone(
  quality: SigmaEdgeTooltipData['relationQuality'] | undefined,
): string {
  if (quality === 'strong') return 'border-[color:rgba(139,151,255,0.44)] bg-[color:rgba(139,151,255,0.15)] text-[color:rgba(222,225,255,0.96)]';
  if (quality === 'weak') return 'border-[color:rgba(217,161,65,0.34)] bg-[color:rgba(217,161,65,0.12)] text-[color:rgba(247,212,150,0.92)]';
  if (quality === 'review') return 'border-[color:rgba(226,105,105,0.34)] bg-[color:rgba(226,105,105,0.12)] text-[color:rgba(255,190,190,0.92)]';
  return 'border-[color:rgba(72,184,203,0.30)] bg-[color:rgba(72,184,203,0.11)] text-[color:rgba(187,237,244,0.92)]';
}

export function relationClaimLensTone(
  quality: SigmaEdgeTooltipData['relationQuality'] | undefined,
): string {
  if (quality === 'strong') return 'border-[color:rgba(139,151,255,0.30)] bg-[color:rgba(139,151,255,0.10)] text-[color:rgba(222,225,255,0.94)]';
  if (quality === 'weak') return 'border-[color:rgba(217,161,65,0.24)] bg-[color:rgba(217,161,65,0.08)] text-[color:rgba(247,212,150,0.88)]';
  if (quality === 'review') return 'border-[color:rgba(226,105,105,0.26)] bg-[color:rgba(226,105,105,0.09)] text-[color:rgba(255,190,190,0.90)]';
  return 'border-[color:rgba(72,184,203,0.22)] bg-[color:rgba(72,184,203,0.08)] text-[color:rgba(187,237,244,0.92)]';
}

export function relationClaimLensDotTone(
  quality: SigmaEdgeTooltipData['relationQuality'] | undefined,
): string {
  if (quality === 'strong') return 'bg-[color:rgba(139,151,255,0.96)]';
  if (quality === 'weak') return 'bg-[color:rgba(217,161,65,0.94)]';
  if (quality === 'review') return 'bg-[color:rgba(226,105,105,0.94)]';
  return 'bg-[color:rgba(72,184,203,0.95)]';
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

export function SigmaSelectedEdgeCard({
  data,
  onClose,
}: {
  data: SigmaEdgeTooltipData;
  onClose: () => void;
}) {
  const t = useTranslations('topologyWidgets.edgeTooltip');
  const [copied, setCopied] = useState<'preflight' | 'explain' | null>(null);
  const relationLabel = kindLabel(data.kind, {
    knowledge: t('kindKnowledge'),
    referencedBy: t('kindReferencedBy'),
    contains: t('kindContains'),
    dependsOn: t('kindDependsOn'),
  });
  const qualityLabel = relationQualityLabel(data.relationQuality, {
    strong: t('qualityStrong'),
    supported: t('qualitySupported'),
    weak: t('qualityWeak'),
    review: t('qualityReview'),
  });
  const evidenceLabel = relationEvidenceLabel(data, {
    sourceBacked: (count) => t('evidenceCount', { count }),
    authored: t('authoredEvidence'),
    needsReview: t('noEvidence'),
  });
  const claimLensText = relationClaimLensText({
    qualityLabel,
    evidenceLabel,
    typedFactLabel: t('typedFactLabel'),
  });
  const agentGateLabel = relationAgentGateLabel(data, {
    handoffReady: t('agentGateHandoffReady'),
    preflightFirst: t('agentGatePreflightFirst'),
    reviewFirst: t('agentGateReviewFirst'),
  });
  const agentDecisionText = relationAgentDecisionText(data, {
    handoffReady: t('agentDecisionHandoffReady'),
    preflightFirst: t('agentDecisionPreflightFirst'),
    reviewFirst: t('agentDecisionReviewFirst'),
  });
  const copyCheck = async (kind: 'preflight' | 'explain') => {
    const text =
      kind === 'preflight'
        ? formatQueryOntologyCall({
            operation: 'relation_check',
            from: data.source,
            to: data.target,
            type: data.relationType ?? data.kind ?? 'depends_on',
          })
        : formatQueryOntologyCall({
            operation: 'explain_relation',
            from: data.source,
            to: data.target,
            direction: 'undirected',
            maxHops: 5,
            limit: 10,
          });
    if (await copyText(text)) {
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1200);
    }
  };

  return (
    <aside
      data-testid="sigma-selected-edge-card"
      data-relation-quality={data.relationQuality ?? 'supported'}
      data-agent-gate={agentGateLabel}
      data-agent-decision={agentDecisionText}
      className="pointer-events-auto absolute right-4 top-[96px] z-30 flex w-[min(92vw,410px)] flex-col gap-3 rounded-lg border border-[color:rgba(139,151,255,0.28)] bg-[color:rgba(13,15,21,0.96)] p-3 text-[12px] text-[color:var(--color-text-primary)] shadow-[0_18px_44px_rgba(0,0,0,0.48)] backdrop-blur-md md:right-6 xl:right-8"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:rgba(139,151,255,0.92)]">
            {t('selectedTitle')}
          </div>
          <div
            data-testid="sigma-selected-edge-claim-lens"
            data-relation-quality={data.relationQuality ?? 'supported'}
            className={`mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.11em] ${relationClaimLensTone(
              data.relationQuality,
            )}`}
          >
            <span
              data-relation-quality-dot
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${relationClaimLensDotTone(
                data.relationQuality,
              )}`}
            />
            <span className="min-w-0 truncate">{claimLensText}</span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-[13px] font-semibold leading-5">
            <span className="truncate">{data.sourceName}</span>
            <span className="shrink-0 text-[color:rgba(139,151,255,0.82)]">→</span>
            <span className="truncate">{data.targetName}</span>
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-[color:rgba(255,255,255,0.10)] bg-[color:rgba(255,255,255,0.04)] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[color:var(--color-text-secondary)]">
              {data.relationType ?? relationLabel}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] ${relationQualityTone(
                data.relationQuality,
              )}`}
            >
              {qualityLabel}
            </span>
            <span className="rounded-full border border-[color:rgba(255,255,255,0.10)] bg-[color:rgba(255,255,255,0.035)] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
              {evidenceLabel}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
          aria-label={t('closeSelectedAriaLabel')}
        >
          <X size={15} />
        </button>
      </div>
      <p className="text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
        {t('semanticFactHint')}
      </p>
      <div
        data-testid="sigma-selected-edge-agent-decision"
        data-agent-decision={agentDecisionText}
        className="rounded-md border border-[color:rgba(139,151,255,0.18)] bg-[color:rgba(139,151,255,0.07)] px-2.5 py-2"
      >
        <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-[color:rgba(139,151,255,0.88)]">
          {t('agentDecisionLabel')}
        </div>
        <p className="mt-1 text-[11px] leading-4 text-[color:var(--color-text-secondary)]">
          {agentDecisionText}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Metric label={t('relationLabel')} value={data.relationType ?? relationLabel} />
        <Metric label={t('qualityLabel')} value={qualityLabel} />
        <Metric label={t('evidenceLabel')} value={evidenceLabel} />
        <Metric label={t('agentGateLabel')} value={agentGateLabel} testId="sigma-selected-edge-agent-gate" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton
          copied={copied === 'preflight'}
          label={copied === 'preflight' ? t('copied') : t('copyPreflight')}
          onClick={() => void copyCheck('preflight')}
        />
        <CopyButton
          copied={copied === 'explain'}
          label={copied === 'explain' ? t('copied') : t('copyExplain')}
          onClick={() => void copyCheck('explain')}
        />
      </div>
    </aside>
  );
}

function Metric({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div
      data-testid={testId}
      data-metric-value={value}
      className="min-w-0 rounded-md border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.035)] px-2.5 py-2"
    >
      <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {label}
      </div>
      <div className="mt-1 truncate text-[12px] text-[color:var(--color-text-primary)]">
        {value}
      </div>
    </div>
  );
}

function CopyButton({
  copied,
  label,
  onClick,
}: {
  copied: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-[color:rgba(139,151,255,0.28)] bg-[color:rgba(139,151,255,0.10)] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:rgba(139,151,255,0.16)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
    >
      {copied ? <Check size={12} /> : <Clipboard size={12} />}
      <span>{label}</span>
    </button>
  );
}
