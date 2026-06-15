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

export type RelationEvidenceState = 'source-backed' | 'authored' | 'needs-review';

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

export type RelationAgentGateKind = 'handoff-ready' | 'preflight-first' | 'review-first';
export type RelationCopyActionKind = 'relation_check' | 'explain_relation';

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

export function relationEvidenceState(
  data: Pick<SigmaEdgeTooltipData, 'authored' | 'evidenceCount'>,
): RelationEvidenceState {
  if ((data.evidenceCount ?? 0) > 0) return 'source-backed';
  if (data.authored) return 'authored';
  return 'needs-review';
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
  const gateKind = relationAgentGateKind(data);
  if (gateKind === 'handoff-ready') return labels.handoffReady;
  if (gateKind === 'preflight-first') return labels.preflightFirst;
  return labels.reviewFirst;
}

export function relationAgentDecisionText(
  data: Pick<SigmaEdgeTooltipData, 'authored' | 'evidenceCount' | 'relationQuality'>,
  labels: RelationAgentDecisionLabels,
): string {
  const gateKind = relationAgentGateKind(data);
  if (gateKind === 'handoff-ready') return labels.handoffReady;
  if (gateKind === 'preflight-first') return labels.preflightFirst;
  return labels.reviewFirst;
}

export function relationAgentGateKind(
  data: Pick<SigmaEdgeTooltipData, 'authored' | 'evidenceCount' | 'relationQuality'>,
): RelationAgentGateKind {
  if (data.relationQuality === 'review') return 'review-first';
  if (data.relationQuality === 'weak') return 'preflight-first';
  if ((data.evidenceCount ?? 0) > 0 || data.authored) return 'handoff-ready';
  return 'review-first';
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

export function relationAgentDecisionTone(gateKind: RelationAgentGateKind): string {
  if (gateKind === 'handoff-ready') return 'border-[color:rgba(139,151,255,0.20)] bg-[color:rgba(139,151,255,0.075)]';
  if (gateKind === 'preflight-first') return 'border-[color:rgba(217,161,65,0.24)] bg-[color:rgba(217,161,65,0.08)]';
  return 'border-[color:rgba(226,105,105,0.26)] bg-[color:rgba(226,105,105,0.09)]';
}

export function relationAgentDecisionLabelTone(gateKind: RelationAgentGateKind): string {
  if (gateKind === 'handoff-ready') return 'text-[color:rgba(139,151,255,0.88)]';
  if (gateKind === 'preflight-first') return 'text-[color:rgba(247,212,150,0.88)]';
  return 'text-[color:rgba(255,190,190,0.90)]';
}

export function relationPrimaryCopyAction(
  gateKind: RelationAgentGateKind,
): RelationCopyActionKind {
  return gateKind === 'handoff-ready' ? 'explain_relation' : 'relation_check';
}

export function relationCopyButtonTone({
  gateKind,
  primary,
}: {
  gateKind: RelationAgentGateKind;
  primary: boolean;
}): string {
  if (!primary) {
    return 'border-[color:rgba(255,255,255,0.10)] bg-[color:rgba(255,255,255,0.035)] text-[color:var(--color-text-tertiary)] hover:bg-[color:rgba(255,255,255,0.06)] hover:text-[color:var(--color-text-secondary)]';
  }
  if (gateKind === 'handoff-ready') {
    return 'border-[color:rgba(139,151,255,0.34)] bg-[color:rgba(139,151,255,0.12)] text-[color:rgba(222,225,255,0.94)] hover:bg-[color:rgba(139,151,255,0.18)] hover:text-[color:var(--color-text-primary)]';
  }
  if (gateKind === 'preflight-first') {
    return 'border-[color:rgba(217,161,65,0.34)] bg-[color:rgba(217,161,65,0.12)] text-[color:rgba(247,212,150,0.92)] hover:bg-[color:rgba(217,161,65,0.18)] hover:text-[color:var(--color-text-primary)]';
  }
  return 'border-[color:rgba(226,105,105,0.34)] bg-[color:rgba(226,105,105,0.12)] text-[color:rgba(255,190,190,0.92)] hover:bg-[color:rgba(226,105,105,0.18)] hover:text-[color:var(--color-text-primary)]';
}

export const SELECTED_EDGE_CARD_DOCK_CLASS =
  'right-4 top-[96px] w-[min(90vw,360px)] md:right-6 lg:left-[calc(2rem+515px+18px)] lg:right-auto lg:w-[300px] min-[1500px]:!w-[360px] xl:top-[96px] 2xl:left-[calc(2rem+515px+26px)]';

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
  const evidenceState = relationEvidenceState(data);
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
  const agentGateKind = relationAgentGateKind(data);
  const agentDecisionText = relationAgentDecisionText(data, {
    handoffReady: t('agentDecisionHandoffReady'),
    preflightFirst: t('agentDecisionPreflightFirst'),
    reviewFirst: t('agentDecisionReviewFirst'),
  });
  const primaryCopyAction = relationPrimaryCopyAction(agentGateKind);
  const primaryCopyActionLabel =
    primaryCopyAction === 'explain_relation'
      ? t('actionExplainRelation')
      : t('actionRelationCheck');
  const relationType = data.relationType ?? data.kind ?? 'depends_on';
  const primaryCopyPayloadSummary = t('copyPayloadSummary', {
    tool: 'query_ontology',
    action: primaryCopyActionLabel,
    source: data.source,
    target: data.target,
    type: relationType,
    evidence: evidenceState,
    gate: agentGateKind,
  });
  const ontologyHandleSummary = `${data.source} → ${data.target} · ${relationType}`;
  const preflightCopyPayload = {
    operation: 'relation_check',
    from: data.source,
    to: data.target,
    type: relationType,
  };
  const explainCopyPayload = {
    operation: 'explain_relation',
    from: data.source,
    to: data.target,
    direction: 'undirected',
    maxHops: 5,
    limit: 10,
  };
  const primaryCopyPayloadCall = formatQueryOntologyCall(
    primaryCopyAction === 'relation_check' ? preflightCopyPayload : explainCopyPayload,
  );
  const cliFallbackCommand =
    primaryCopyAction === 'relation_check'
      ? `ontology-atlas relation-check ${shellQuote(data.source)} ${shellQuote(data.target)} ${shellQuote(
          relationType,
        )} [vault]`
      : `ontology-atlas explain ${shellQuote(data.source)} ${shellQuote(
          data.target,
        )} [vault] --type ${shellQuote(relationType)}`;
  const copyCheck = async (kind: 'preflight' | 'explain') => {
    const text =
      kind === 'preflight'
        ? formatQueryOntologyCall(preflightCopyPayload)
        : formatQueryOntologyCall(explainCopyPayload);
    if (await copyText(text)) {
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1200);
    }
  };

  return (
    <aside
      data-testid="sigma-selected-edge-card"
      data-relation-quality={data.relationQuality ?? 'supported'}
      data-relation-evidence-state={evidenceState}
      data-agent-gate={agentGateLabel}
      data-agent-gate-kind={agentGateKind}
      data-agent-decision={agentDecisionText}
      data-surface-role="active-relation-inspector"
      data-card-density="compact"
      className={`pointer-events-auto absolute z-30 flex max-h-[calc(100dvh-7rem)] flex-col gap-2 overflow-y-auto rounded-lg border border-[color:rgba(139,151,255,0.28)] bg-[color:rgba(13,15,21,0.96)] p-2.5 text-[11px] text-[color:var(--color-text-primary)] shadow-[0_16px_36px_rgba(0,0,0,0.46)] backdrop-blur-md ${SELECTED_EDGE_CARD_DOCK_CLASS}`}
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
          <div className="mt-1 flex min-w-0 items-center gap-2 text-[12px] font-semibold leading-4">
            <span className="truncate">{data.sourceName}</span>
            <span className="shrink-0 text-[color:rgba(139,151,255,0.82)]">→</span>
            <span className="truncate">{data.targetName}</span>
          </div>
          <div
            data-testid="sigma-selected-edge-handle-strip"
            data-source-handle={data.source}
            data-target-handle={data.target}
            data-relation-type={relationType}
            data-handle-summary={ontologyHandleSummary}
            className="mt-1 min-w-0 rounded-md border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.028)] px-2 py-1"
          >
            <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t('ontologyHandlesLabel')}
            </div>
            <div className="mt-0.5 line-clamp-2 break-words font-mono text-[9px] leading-3 text-[color:var(--color-text-secondary)]">
              {ontologyHandleSummary}
            </div>
          </div>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
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
      <div data-testid="sigma-selected-edge-proof-band" className="grid grid-cols-2 gap-1.5">
        <div
          data-testid="sigma-selected-edge-contract"
          data-relation-contract="typed-fact-not-similarity"
          className="min-w-0 rounded-md border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.035)] px-2 py-1.5"
        >
          <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t('relationContractLabel')}
          </div>
          <p className="mt-1 line-clamp-2 text-[10px] leading-3 text-[color:var(--color-text-secondary)]">
            {t('semanticFactHint')}
          </p>
          <p className="sr-only">
            {t('qualityContractHint')}
          </p>
        </div>
        <div
          data-testid="sigma-selected-edge-agent-decision"
          data-agent-decision={agentDecisionText}
          data-agent-gate-kind={agentGateKind}
          className={`min-w-0 rounded-md border px-2 py-1.5 ${relationAgentDecisionTone(
            agentGateKind,
          )}`}
        >
          <div
            className={`font-mono text-[8px] uppercase tracking-[0.14em] ${relationAgentDecisionLabelTone(
              agentGateKind,
            )}`}
          >
            {t('agentDecisionLabel')}
          </div>
          <p className="mt-1 line-clamp-2 text-[10px] leading-3 text-[color:var(--color-text-secondary)]">
            {agentDecisionText}
          </p>
        </div>
      </div>
      <div
        data-testid="sigma-selected-edge-agent-route"
        data-agent-gate-kind={agentGateKind}
        data-relation-evidence-state={evidenceState}
        data-primary-copy-action={primaryCopyAction}
        className="grid grid-cols-[repeat(4,minmax(76px,1fr))] overflow-x-auto overflow-y-hidden rounded-md border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.03)]"
      >
        <RouteStep kind="fact" label={t('routeFact')} value={t('typedFactLabel')} />
        <RouteStep kind="evidence" label={t('routeEvidence')} value={evidenceLabel} />
        <RouteStep
          kind="gate"
          label={t('routeGate')}
          value={agentGateLabel}
          tone={agentGateKind}
        />
        <RouteStep
          kind="action"
          label={t('routeAction')}
          value={primaryCopyActionLabel}
          tone={agentGateKind}
        />
      </div>
      <div
        data-testid="sigma-selected-edge-metric-strip"
        className="sr-only"
      >
        <Metric label={t('relationLabel')} value={data.relationType ?? relationLabel} />
        <Metric label={t('qualityLabel')} value={qualityLabel} />
        <Metric label={t('evidenceLabel')} value={evidenceLabel} />
        <Metric label={t('agentGateLabel')} value={agentGateLabel} testId="sigma-selected-edge-agent-gate" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <CopyButton
          copied={copied === 'preflight'}
          actionKind="relation_check"
          gateKind={agentGateKind}
          label={copied === 'preflight' ? t('copied') : t('copyPreflight')}
          onClick={() => void copyCheck('preflight')}
          payloadCall={formatQueryOntologyCall(preflightCopyPayload)}
          primary={primaryCopyAction === 'relation_check'}
          primaryBadge={t('primaryCopyBadge')}
        />
        <CopyButton
          copied={copied === 'explain'}
          actionKind="explain_relation"
          gateKind={agentGateKind}
          label={copied === 'explain' ? t('copied') : t('copyExplain')}
          onClick={() => void copyCheck('explain')}
          payloadCall={formatQueryOntologyCall(explainCopyPayload)}
          primary={primaryCopyAction === 'explain_relation'}
          primaryBadge={t('primaryCopyBadge')}
        />
      </div>
      <div
        data-testid="sigma-selected-edge-copy-payload"
        data-copy-payload-tool="query_ontology"
        data-copy-payload-action={primaryCopyAction}
        data-copy-payload-from={data.source}
        data-copy-payload-to={data.target}
        data-copy-payload-type={relationType}
        data-copy-payload-evidence={evidenceState}
        data-copy-payload-gate={agentGateKind}
        data-cli-fallback-command={cliFallbackCommand}
        data-copy-payload-call={primaryCopyPayloadCall}
        className="min-w-0 rounded-md border border-[color:rgba(139,151,255,0.16)] bg-[color:rgba(94,106,210,0.055)] px-2 py-1.5"
      >
        <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-[color:rgba(139,151,255,0.84)]">
          {t('copyPayloadLabel')}
        </div>
        <div
          data-copy-payload-summary={primaryCopyPayloadSummary}
          title={primaryCopyPayloadSummary}
          className="mt-1 max-h-8 overflow-hidden break-words font-mono text-[10px] leading-4 text-[color:var(--color-text-secondary)]"
        >
          {primaryCopyPayloadSummary}
        </div>
        <div
          data-cli-fallback-summary={cliFallbackCommand}
          title={`${t('cliFallbackLabel')} ${cliFallbackCommand}`}
          className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-[9px] leading-3 text-[color:var(--color-text-tertiary)]"
        >
          <span className="shrink-0 uppercase tracking-[0.12em]">{t('cliFallbackLabel')}</span>
          {' '}
          <span className="min-w-0 truncate">{cliFallbackCommand}</span>
        </div>
      </div>
    </aside>
  );
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function RouteStep({
  kind,
  label,
  tone,
  value,
}: {
  kind: 'fact' | 'evidence' | 'gate' | 'action';
  label: string;
  tone?: RelationAgentGateKind;
  value: string;
}) {
  const valueTone = tone ? relationAgentDecisionLabelTone(tone) : 'text-[color:var(--color-text-secondary)]';
  return (
    <div
      data-route-step={kind}
      data-route-step-label={label}
      data-route-step-value={value}
      className="min-w-[76px] border-r border-[color:rgba(255,255,255,0.07)] px-1.5 py-1.5 last:border-r-0"
    >
      <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {label}
      </div>
      <div className={`mt-0.5 truncate text-[10px] leading-3 ${valueTone}`}>
        {value}
      </div>
    </div>
  );
}

function Metric({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div
      data-testid={testId}
      data-metric-value={value}
      className="min-w-0 rounded-md border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(255,255,255,0.035)] px-2.5 py-2 min-[1500px]:px-2 min-[1500px]:py-1.5"
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
  actionKind,
  copied,
  gateKind,
  label,
  onClick,
  payloadCall,
  primary,
  primaryBadge,
}: {
  actionKind: RelationCopyActionKind;
  copied: boolean;
  gateKind: RelationAgentGateKind;
  label: string;
  onClick: () => void;
  payloadCall: string;
  primary: boolean;
  primaryBadge: string;
}) {
  return (
    <button
      type="button"
      data-relation-copy-action={actionKind}
      data-relation-copy-payload-call={payloadCall}
      data-relation-copy-priority={primary ? 'primary' : 'secondary'}
      data-copy-recommended={primary ? 'true' : 'false'}
      title={payloadCall}
      onClick={onClick}
      className={`inline-flex min-h-8 items-center justify-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)] ${primary ? 'shadow-[0_0_0_1px_rgba(139,151,255,0.18),0_8px_22px_rgba(0,0,0,0.22)]' : ''} ${relationCopyButtonTone({
        gateKind,
        primary,
      })}`}
    >
      {copied ? <Check size={11} /> : <Clipboard size={11} />}
      <span>{label}</span>
      {primary ? (
        <span
          data-relation-copy-primary-badge
          aria-hidden="true"
          className="-mr-1 rounded-full border border-[color:rgba(255,255,255,0.16)] bg-[color:rgba(255,255,255,0.08)] px-1.5 py-0.5 text-[8px] tracking-[0.08em] text-[color:var(--color-text-primary)]"
        >
          {primaryBadge}
        </span>
      ) : null}
    </button>
  );
}
