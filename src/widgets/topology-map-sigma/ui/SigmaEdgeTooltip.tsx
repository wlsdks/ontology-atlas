'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Clipboard, X } from 'lucide-react';
import { formatQueryOntologyCall } from '@/shared/lib/ontology-query-call';
import { copyText } from '@/shared/lib/copy-text';
import type { SigmaEdgeAttrs } from '../lib/graph-build';
import {
  TOPOLOGY_RELATION_INSPECTOR_DURATION_MS,
  TOPOLOGY_RELATION_INSPECTOR_EASING_NAME,
  TOPOLOGY_RELATION_INSPECTOR_MOTION_CONTRACT,
} from '../lib/motion-tokens';

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

export interface RelationTypeLabels {
  contains: string;
  dependsOn: string;
  relates: string;
  describes: string;
  uses: string;
  belongsTo: string;
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

export function relationTypeDisplayLabel(
  relationType: string | undefined,
  labels: RelationTypeLabels,
): string {
  const normalized = relationType?.replaceAll('-', '_');
  if (normalized === 'contains') return labels.contains;
  if (normalized === 'depends_on' || normalized === 'depends') return labels.dependsOn;
  if (
    normalized === 'relates' ||
    normalized === 'relates_to' ||
    normalized === 'related_to'
  ) {
    return labels.relates;
  }
  if (normalized === 'describes') return labels.describes;
  if (normalized === 'uses') return labels.uses;
  if (normalized === 'belongs_to') return labels.belongsTo;
  return relationType ?? labels.dependsOn;
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

export function relationClaimLensTone(
  quality: SigmaEdgeTooltipData['relationQuality'] | undefined,
): string {
  if (quality === 'strong') return 'border-[color:var(--topology-selected-relation-claim-strong-border)] bg-[color:var(--topology-selected-relation-claim-strong-surface)] text-[color:var(--topology-selected-relation-claim-strong-text)]';
  if (quality === 'weak') return 'border-[color:var(--topology-selected-relation-claim-weak-border)] bg-[color:var(--topology-selected-relation-claim-weak-surface)] text-[color:var(--topology-selected-relation-claim-weak-text)]';
  if (quality === 'review') return 'border-[color:var(--topology-selected-relation-claim-review-border)] bg-[color:var(--topology-selected-relation-claim-review-surface)] text-[color:var(--topology-selected-relation-claim-review-text)]';
  return 'border-[color:var(--topology-selected-relation-claim-supported-border)] bg-[color:var(--topology-selected-relation-claim-supported-surface)] text-[color:var(--topology-selected-relation-claim-supported-text)]';
}

export function relationClaimLensDotTone(
  quality: SigmaEdgeTooltipData['relationQuality'] | undefined,
): string {
  if (quality === 'strong') return 'bg-[color:var(--topology-selected-relation-claim-strong-dot)]';
  if (quality === 'weak') return 'bg-[color:var(--topology-selected-relation-claim-weak-dot)]';
  if (quality === 'review') return 'bg-[color:var(--topology-selected-relation-claim-review-dot)]';
  return 'bg-[color:var(--topology-selected-relation-claim-supported-dot)]';
}

export function relationAgentDecisionTone(gateKind: RelationAgentGateKind): string {
  if (gateKind === 'handoff-ready') return 'border-[color:var(--topology-selected-relation-gate-handoff-border)] bg-[color:var(--topology-selected-relation-gate-handoff-surface)]';
  if (gateKind === 'preflight-first') return 'border-[color:var(--topology-selected-relation-gate-preflight-border)] bg-[color:var(--topology-selected-relation-gate-preflight-surface)]';
  return 'border-[color:var(--topology-selected-relation-gate-review-border)] bg-[color:var(--topology-selected-relation-gate-review-surface)]';
}

export function relationAgentDecisionLabelTone(gateKind: RelationAgentGateKind): string {
  if (gateKind === 'handoff-ready') return 'text-[color:var(--topology-selected-relation-gate-handoff-text)]';
  if (gateKind === 'preflight-first') return 'text-[color:var(--topology-selected-relation-gate-preflight-text)]';
  return 'text-[color:var(--topology-selected-relation-gate-review-text)]';
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
    return 'border-[color:var(--topology-selected-relation-copy-secondary-border)] bg-[color:var(--topology-selected-relation-copy-secondary-surface)] text-[color:var(--topology-selected-relation-copy-secondary-text)] hover:bg-[color:var(--topology-selected-relation-copy-secondary-hover-surface)] hover:text-[color:var(--topology-selected-relation-copy-secondary-hover-text)]';
  }
  const token = relationGateToken(gateKind);
  if (token === 'handoff') return 'border-[color:var(--topology-selected-relation-copy-handoff-border)] bg-[color:var(--topology-selected-relation-copy-handoff-surface)] text-[color:var(--topology-selected-relation-copy-handoff-text)] hover:bg-[color:var(--topology-selected-relation-copy-handoff-hover-surface)] hover:text-[color:var(--topology-selected-relation-copy-handoff-hover-text)]';
  if (token === 'preflight') return 'border-[color:var(--topology-selected-relation-copy-preflight-border)] bg-[color:var(--topology-selected-relation-copy-preflight-surface)] text-[color:var(--topology-selected-relation-copy-preflight-text)] hover:bg-[color:var(--topology-selected-relation-copy-preflight-hover-surface)] hover:text-[color:var(--topology-selected-relation-copy-preflight-hover-text)]';
  return 'border-[color:var(--topology-selected-relation-copy-review-border)] bg-[color:var(--topology-selected-relation-copy-review-surface)] text-[color:var(--topology-selected-relation-copy-review-text)] hover:bg-[color:var(--topology-selected-relation-copy-review-hover-surface)] hover:text-[color:var(--topology-selected-relation-copy-review-hover-text)]';
}

function relationQualityToken(
  quality: SigmaEdgeTooltipData['relationQuality'] | undefined,
): NonNullable<SigmaEdgeTooltipData['relationQuality']> {
  return quality ?? 'supported';
}

function relationGateToken(gateKind: RelationAgentGateKind): 'handoff' | 'preflight' | 'review' {
  if (gateKind === 'handoff-ready') return 'handoff';
  if (gateKind === 'preflight-first') return 'preflight';
  return 'review';
}

export const SELECTED_EDGE_CARD_DOCK_CLASS =
  'right-[var(--topology-selected-relation-card-inset)] top-[var(--topology-selected-relation-card-top)] w-[min(86vw,284px)] lg:w-[var(--topology-selected-relation-card-width)]';

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
  }, [data.x, data.y, data.sourceName, data.targetName, data.kind, data.relationType]);
  const style: React.CSSProperties = {
    left: flip.x ? data.x - 14 : data.x + 14,
    top: flip.y ? data.y - 14 : data.y + 14,
    transform: `translate(${flip.x ? '-100%' : '0'}, ${flip.y ? '-100%' : '0'})`,
  };
  const relationType = data.relationType ?? data.kind ?? 'depends_on';
  const relationTypeLabel = relationTypeDisplayLabel(relationType, {
    contains: t('relationTypeContains'),
    dependsOn: t('relationTypeDependsOn'),
    relates: t('relationTypeRelates'),
    describes: t('relationTypeDescribes'),
    uses: t('relationTypeUses'),
    belongsTo: t('relationTypeBelongsTo'),
  });
  const evidenceState = relationEvidenceState(data);
  const evidenceLabel = relationEvidenceLabel(data, {
    sourceBacked: (count) => t('evidenceCount', { count }),
    authored: t('authoredEvidence'),
    needsReview: t('noEvidence'),
  });
  return (
    <div
      ref={tooltipRef}
      data-testid="topology-edge-tooltip"
      data-edge-tooltip-contract="compact-relation-fact"
      data-edge-tooltip-surface-token="--topology-edge-tooltip-surface"
      data-edge-tooltip-border-token="--topology-edge-tooltip-border"
      data-relation-type={relationType}
      data-relation-evidence-state={evidenceState}
      className="pointer-events-none absolute z-10 max-w-[min(420px,calc(100vw-32px))] rounded-md border border-[color:var(--topology-edge-tooltip-border)] bg-[color:var(--topology-edge-tooltip-surface)] px-3 py-2 text-[11px] text-[color:var(--color-text-primary)] shadow-[var(--topology-edge-tooltip-shadow)]"
      style={style}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate">{data.sourceName}</span>
        <span className="shrink-0 text-[color:var(--topology-edge-tooltip-arrow)]">→</span>
        <span className="min-w-0 truncate">{data.targetName}</span>
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        <span className="shrink-0">{relationTypeLabel}</span>
        <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
        <span className="min-w-0 truncate">{evidenceLabel}</span>
        <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
        <span className="shrink-0">
          {kindLabel(data.kind, {
            knowledge: t('kindKnowledge'),
            referencedBy: t('kindReferencedBy'),
            contains: t('kindContains'),
            dependsOn: t('kindDependsOn'),
          })}
        </span>
      </div>
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
  const visibleEvidenceLabel = relationEvidenceLabel(data, {
    sourceBacked: (count) => t('evidenceCountShort', { count }),
    authored: t('authoredEvidence'),
    needsReview: t('noEvidence'),
  });
  const evidenceState = relationEvidenceState(data);
  const claimLensText = relationClaimLensText({
    qualityLabel,
    evidenceLabel,
    typedFactLabel: t('typedFactLabel'),
  });
  const claimLensVisibleText = relationClaimLensText({
    qualityLabel,
    evidenceLabel: visibleEvidenceLabel,
    typedFactLabel: t('typedFactShortLabel'),
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
  const agentDecisionVisibleText = relationAgentDecisionText(data, {
    handoffReady: t('agentDecisionHandoffReadyVisible'),
    preflightFirst: t('agentDecisionPreflightFirstVisible'),
    reviewFirst: t('agentDecisionReviewFirstVisible'),
  });
  const semanticFactVisibleHint = t('semanticFactVisibleHint');
  const relationContractFullText = `${t('semanticFactHint')} ${t('qualityContractHint')}`;
  const primaryCopyAction = relationPrimaryCopyAction(agentGateKind);
  const primaryCopyActionLabel =
    primaryCopyAction === 'explain_relation'
      ? t('actionExplainRelation')
      : t('actionRelationCheck');
  const primaryCopyActionVisibleLabel =
    primaryCopyAction === 'explain_relation'
      ? t('actionExplainRelationVisible')
      : t('actionRelationCheckVisible');
  const primaryCopyPayloadVisibleLabel = t('copyPayloadVisibleLabel');
  const primaryCopyPayloadVisibleSummary =
    primaryCopyAction === 'explain_relation'
      ? t('copyPayloadExplainVisibleSummary')
      : t('copyPayloadCheckVisibleSummary');
  const primaryCopyActionRouteLabel =
    primaryCopyAction === 'explain_relation'
      ? t('routeActionExplainRelationShort')
      : t('routeActionRelationCheckShort');
  const agentGateRouteLabel =
    agentGateKind === 'handoff-ready'
      ? t('routeGateHandoffReadyShort')
      : agentGateKind === 'preflight-first'
        ? t('routeGatePreflightFirstShort')
        : t('routeGateReviewFirstShort');
  const relationType = data.relationType ?? data.kind ?? 'depends_on';
  const relationQuality = relationQualityToken(data.relationQuality);
  const visibleRelationTypeLabel = relationTypeDisplayLabel(relationType, {
    contains: t('relationTypeContains'),
    dependsOn: t('relationTypeDependsOn'),
    relates: t('relationTypeRelates'),
    describes: t('relationTypeDescribes'),
    uses: t('relationTypeUses'),
    belongsTo: t('relationTypeBelongsTo'),
  });
  const primaryCopyPayloadSummary = t('copyPayloadSummary', {
    tool: 'query_ontology',
    action: primaryCopyActionLabel,
    source: data.source,
    target: data.target,
    type: relationType,
    evidence: evidenceState,
    gate: agentGateKind,
  });
  const primaryCopyPayloadHandleSummary = `${data.source} → ${data.target}`;
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
      data-relation-type={relationType}
      data-relation-type-label={visibleRelationTypeLabel}
      data-agent-gate={agentGateLabel}
      data-agent-gate-kind={agentGateKind}
      data-agent-decision={agentDecisionText}
      data-surface-role="active-relation-inspector"
      data-card-density="compact"
      data-density-contract="mini-relation-inspector"
      data-dock-contract="right-compact-relation-rail"
      data-attention-lane="right-inspector-rail"
      data-map-clearance-contract="selected-label-keeps-map-lane"
      data-scale-contract="density-fixed-no-ui-zoom"
      data-overflow-contract="no-horizontal-scroll"
      data-width-token="--topology-selected-relation-card-width"
      data-max-height-token="--topology-selected-relation-card-max-height"
      data-inset-token="--topology-selected-relation-card-inset"
      data-copy-action-min-width-token="--topology-selected-relation-action-min-width"
      data-copy-payload-min-height-token="--topology-selected-relation-copy-payload-min-height"
      data-route-step-min-width-token="--topology-selected-relation-route-step-min-width"
      data-surface-token="--topology-selected-relation-card-surface"
      data-border-token="--topology-selected-relation-card-border"
      data-shadow-token="--topology-selected-relation-card-shadow"
      data-accent-text-token="--topology-selected-relation-accent-text"
      data-accent-muted-token="--topology-selected-relation-accent-muted"
      data-focus-ring-token="--topology-selected-relation-focus-ring"
      data-copy-primary-shadow-token="--topology-selected-relation-copy-primary-shadow"
      data-typography-contract="legible-compact-relation-inspector"
      data-kicker-font-size-token="--topology-selected-relation-kicker-font-size"
      data-chip-font-size-token="--topology-selected-relation-chip-font-size"
      data-route-label-font-size-token="--topology-selected-relation-route-label-font-size"
      data-route-value-font-size-token="--topology-selected-relation-route-value-font-size"
      data-payload-font-size-token="--topology-selected-relation-payload-font-size"
      data-elevation-contract="solid-active-inspector-over-map"
      data-motion-contract={TOPOLOGY_RELATION_INSPECTOR_MOTION_CONTRACT}
      data-motion-duration-ms={TOPOLOGY_RELATION_INSPECTOR_DURATION_MS}
      data-motion-easing={TOPOLOGY_RELATION_INSPECTOR_EASING_NAME}
      className={`pointer-events-auto absolute z-30 flex max-h-[var(--topology-selected-relation-card-max-height)] flex-col gap-1.5 overflow-x-hidden overflow-y-auto rounded-lg border border-[color:var(--topology-selected-relation-card-border)] bg-[color:var(--topology-selected-relation-card-surface)] p-1.5 text-[10px] text-[color:var(--color-text-primary)] shadow-[var(--topology-selected-relation-card-shadow)] motion-safe:animate-[topology-relation-inspector-enter_180ms_ease-out_1] motion-reduce:animate-none ${SELECTED_EDGE_CARD_DOCK_CLASS}`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[length:var(--topology-selected-relation-kicker-font-size)] uppercase tracking-[0.10em] text-[color:var(--topology-selected-relation-accent-text)]">
            {t('selectedTitle')}
          </div>
          <div
            data-testid="sigma-selected-edge-claim-lens"
            data-relation-quality={relationQuality}
            data-claim-lens-surface-token={`--topology-selected-relation-claim-${relationQuality}-surface`}
            data-claim-lens-border-token={`--topology-selected-relation-claim-${relationQuality}-border`}
            data-claim-lens-text-token={`--topology-selected-relation-claim-${relationQuality}-text`}
            data-claim-lens-dot-token={`--topology-selected-relation-claim-${relationQuality}-dot`}
            data-claim-lens-full-text={claimLensText}
            data-claim-lens-visible-text={claimLensVisibleText}
            data-claim-lens-copy-contract="visible-proof-full-proof-accessible"
            title={claimLensText}
            className={`mt-0.5 inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[length:var(--topology-selected-relation-chip-font-size)] uppercase tracking-[0.08em] ${relationClaimLensTone(
              data.relationQuality,
            )}`}
          >
            <span
              data-relation-quality-dot
              data-dot-token={`--topology-selected-relation-claim-${relationQuality}-dot`}
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${relationClaimLensDotTone(
                data.relationQuality,
              )}`}
            />
            <span data-claim-lens-visible-summary className="min-w-0 truncate">
              {claimLensVisibleText}
            </span>
            <span className="sr-only">{claimLensText}</span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] font-semibold leading-3.5">
            <span className="truncate">{data.sourceName}</span>
            <span className="shrink-0 text-[color:var(--topology-selected-relation-accent-muted)]">→</span>
            <span className="truncate">{data.targetName}</span>
          </div>
          <div
            data-testid="sigma-selected-edge-handle-strip"
            data-source-handle={data.source}
            data-target-handle={data.target}
            data-relation-type={relationType}
            data-handle-summary={ontologyHandleSummary}
            className="sr-only"
          >
            <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t('ontologyHandlesLabel')}
            </div>
            <div className="mt-0.5 line-clamp-2 break-words font-mono text-[9px] leading-3 text-[color:var(--color-text-secondary)]">
              {ontologyHandleSummary}
            </div>
          </div>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[length:var(--topology-selected-relation-chip-font-size)] uppercase tracking-[0.08em] text-[color:var(--color-text-tertiary)]">
            <span className="text-[color:var(--color-text-secondary)]">
              {visibleRelationTypeLabel || relationLabel}
            </span>
            <span aria-hidden="true" className="text-[color:var(--color-text-quaternary)]">·</span>
            <span
              data-relation-quality-tone-token={`--topology-selected-relation-quality-${relationQuality}`}
              data-relation-quality-surface-token={`--topology-selected-relation-quality-${relationQuality}-surface`}
              data-relation-quality-border-token={`--topology-selected-relation-quality-${relationQuality}-border`}
              data-relation-quality-text-token={`--topology-selected-relation-quality-${relationQuality}-text`}
              className="text-[color:var(--color-text-tertiary)]"
            >
              {qualityLabel}
            </span>
            <span aria-hidden="true" className="text-[color:var(--color-text-quaternary)]">·</span>
            <span>
              {evidenceLabel}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-0.5 text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--topology-selected-relation-focus-ring)]"
          aria-label={t('closeSelectedAriaLabel')}
        >
          <X size={14} />
        </button>
      </div>
      <div data-testid="sigma-selected-edge-proof-band" className="grid grid-cols-2 gap-1.5">
        <div
          data-testid="sigma-selected-edge-contract"
          data-relation-contract="typed-fact-not-similarity"
          data-relation-contract-visible-text={semanticFactVisibleHint}
          data-relation-contract-full-text={relationContractFullText}
          data-relation-contract-copy-contract="visible-judgment-full-explanation-accessible"
          className="min-w-0 rounded-lg border border-[color:var(--topology-selected-relation-subtle-border)] bg-[color:var(--topology-selected-relation-subtle-surface)] px-2.5 py-1.5"
        >
          <div className="font-mono text-[length:var(--topology-selected-relation-route-label-font-size)] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {t('relationContractLabel')}
          </div>
          <p
            data-relation-contract-visible-summary={semanticFactVisibleHint}
            title={relationContractFullText}
            className="mt-0.5 truncate text-[11px] leading-3.5 text-[color:var(--color-text-secondary)]"
          >
            {semanticFactVisibleHint}
          </p>
          <p className="sr-only">
            {t('semanticFactHint')}
          </p>
          <p className="sr-only">
            {t('qualityContractHint')}
          </p>
        </div>
        <div
          data-testid="sigma-selected-edge-agent-decision"
          data-agent-decision={agentDecisionText}
          data-agent-decision-visible-text={agentDecisionVisibleText}
          data-agent-decision-copy-contract="visible-judgment-full-decision-accessible"
          data-agent-gate-kind={agentGateKind}
          data-agent-gate-surface-token={`--topology-selected-relation-gate-${relationGateToken(
            agentGateKind,
          )}-surface`}
          data-agent-gate-border-token={`--topology-selected-relation-gate-${relationGateToken(
            agentGateKind,
          )}-border`}
          data-agent-gate-text-token={`--topology-selected-relation-gate-${relationGateToken(
            agentGateKind,
          )}-text`}
          className={`min-w-0 rounded-lg border px-2.5 py-1.5 ${relationAgentDecisionTone(
            agentGateKind,
          )}`}
        >
          <div
            className={`font-mono text-[length:var(--topology-selected-relation-route-label-font-size)] uppercase tracking-[0.12em] ${relationAgentDecisionLabelTone(
              agentGateKind,
            )}`}
          >
            {t('agentDecisionLabel')}
          </div>
          <p
            data-agent-decision-visible-summary={agentDecisionVisibleText}
            title={agentDecisionText}
            className="mt-0.5 truncate text-[11px] leading-3.5 text-[color:var(--color-text-secondary)]"
          >
            {agentDecisionVisibleText}
          </p>
          <p className="sr-only">
            {agentDecisionText}
          </p>
        </div>
      </div>
      <div
        data-testid="sigma-selected-edge-agent-route"
        data-agent-gate-kind={agentGateKind}
        data-relation-evidence-state={evidenceState}
        data-primary-copy-action={primaryCopyAction}
        data-route-density="micro-rail"
        data-route-layout-contract="three-step-human-route-action-metadata"
        data-route-visible-steps="fact,evidence,gate"
        data-route-action-visibility="metadata-only"
        data-route-step-min-width-token="--topology-selected-relation-route-step-min-width"
        data-overflow-contract="no-horizontal-scroll"
        className="grid min-w-0 shrink-0 grid-cols-3 overflow-hidden rounded-lg border border-[color:var(--topology-selected-relation-subtle-border)] bg-[color:var(--topology-selected-relation-subtle-surface)] max-[960px]:min-h-16 max-[960px]:grid-cols-2"
      >
        <RouteStep
          kind="fact"
          label={t('routeFact')}
          value={t('typedFactLabel')}
          visibleValue={t('routeFactValueShort')}
        />
        <RouteStep kind="evidence" label={t('routeEvidence')} value={evidenceLabel} />
        <RouteStep
          kind="gate"
          label={t('routeGate')}
          value={agentGateLabel}
          visibleValue={agentGateRouteLabel}
          tone={agentGateKind}
        />
        <RouteStep
          kind="action"
          label={t('routeAction')}
          value={primaryCopyActionLabel}
          visibleValue={primaryCopyActionRouteLabel}
          tone={agentGateKind}
          hidden
        />
      </div>
      <div
        data-testid="sigma-selected-edge-metric-strip"
        className="sr-only"
      >
        <Metric label={t('relationLabel')} value={visibleRelationTypeLabel || relationLabel} />
        <Metric label={t('qualityLabel')} value={qualityLabel} />
        <Metric label={t('evidenceLabel')} value={evidenceLabel} />
        <Metric label={t('agentGateLabel')} value={agentGateLabel} testId="sigma-selected-edge-agent-gate" />
      </div>
      <div
        data-testid="sigma-selected-edge-next-action"
        data-next-action-contract="primary-action-first"
        data-next-action={primaryCopyAction}
        data-next-action-surface-token="--topology-selected-relation-next-action-surface"
        data-next-action-border-token="--topology-selected-relation-next-action-border"
        data-next-action-accent-text-token="--topology-selected-relation-accent-text"
        className="min-w-0 rounded-lg border border-[color:var(--topology-selected-relation-next-action-border)] bg-[color:var(--topology-selected-relation-next-action-surface)] p-1.5"
      >
        <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0 truncate font-mono text-[length:var(--topology-selected-relation-route-label-font-size)] uppercase tracking-[0.12em] text-[color:var(--topology-selected-relation-accent-text)]">
            {t('primaryCopyBadge')}
          </div>
          <div className="shrink-0 font-mono text-[length:var(--topology-selected-relation-route-label-font-size)] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
            {primaryCopyActionVisibleLabel}
          </div>
        </div>
        <div
          data-testid="sigma-selected-edge-copy-actions"
          data-copy-action-min-width-token="--topology-selected-relation-action-min-width"
          data-density-contract="single-row-compact"
          data-overflow-contract="no-horizontal-scroll"
          className="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden"
        >
          <CopyButton
            copied={copied === 'preflight'}
            actionKind="relation_check"
            gateKind={agentGateKind}
            label={copied === 'preflight' ? t('copied') : t('copyPreflight')}
            visibleLabel={
              copied === 'preflight' ? t('copied') : t('actionRelationCheckVisible')
            }
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
            visibleLabel={
              copied === 'explain' ? t('copied') : t('actionExplainRelationVisible')
            }
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
          data-copy-payload-handle-summary={primaryCopyPayloadHandleSummary}
          data-cli-fallback-command={cliFallbackCommand}
          data-copy-payload-call={primaryCopyPayloadCall}
          data-min-height-token="--topology-selected-relation-copy-payload-min-height"
          data-copy-payload-accent-muted-token="--topology-selected-relation-accent-muted"
          data-overflow-contract="no-horizontal-scroll"
          className="mt-1.5 flex min-h-[var(--topology-selected-relation-copy-payload-min-height)] min-w-0 items-center gap-1.5 overflow-hidden rounded-lg border border-[color:var(--topology-selected-relation-payload-border)] bg-[color:var(--topology-selected-relation-payload-surface)] px-2 py-1"
        >
          <div
            data-copy-payload-label={t('copyPayloadLabel')}
            data-copy-payload-visible-label={primaryCopyPayloadVisibleLabel}
            data-copy-payload-label-contract="compact-visible-label-full-label-accessible"
            className="shrink-0 text-[10px] font-medium leading-3 text-[color:var(--topology-selected-relation-accent-muted)]"
          >
            <span aria-hidden="true">{primaryCopyPayloadVisibleLabel}</span>
            <span className="sr-only">{t('copyPayloadLabel')}</span>
          </div>
          <div
            data-copy-payload-summary={primaryCopyPayloadSummary}
            data-copy-payload-visible-summary={primaryCopyPayloadVisibleSummary}
            data-copy-payload-visible-contract="tool-action-visible-handles-accessible"
            title={primaryCopyPayloadSummary}
            className="min-w-0 flex-1 truncate font-mono text-[length:var(--topology-selected-relation-payload-font-size)] leading-3 text-[color:var(--color-text-secondary)]"
          >
            {primaryCopyPayloadVisibleSummary}
          </div>
          <span
            data-copy-payload-handle-summary={primaryCopyPayloadHandleSummary}
            className="sr-only"
          >
            {primaryCopyPayloadHandleSummary}
          </span>
          <div
            data-cli-fallback-summary={cliFallbackCommand}
            title={`${t('cliFallbackLabel')} ${cliFallbackCommand}`}
            className="sr-only"
          />
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
  visibleValue,
  hidden,
}: {
  kind: 'fact' | 'evidence' | 'gate' | 'action';
  label: string;
  tone?: RelationAgentGateKind;
  value: string;
  visibleValue?: string;
  hidden?: boolean;
}) {
  const renderedValue = visibleValue ?? value;
  const valueTone = tone ? relationAgentDecisionLabelTone(tone) : 'text-[color:var(--color-text-secondary)]';
  const stepClass =
    'min-h-8 min-w-[var(--topology-selected-relation-route-step-min-width)] border-r border-[color:var(--topology-selected-relation-subtle-border)] px-1.5 py-1 last:border-r-0 max-[960px]:min-w-0 max-[960px]:border-b max-[960px]:even:border-r-0 max-[960px]:[&:nth-last-child(-n+2)]:border-b-0';

  return (
    <div
      data-route-step={kind}
      data-route-step-label={label}
      data-route-step-value={value}
      data-route-step-visible-value={renderedValue}
      data-route-step-copy-contract="visible-route-value-full-value-accessible"
      data-route-step-visibility={hidden ? 'metadata-only' : 'visible'}
      title={`${label}: ${value}`}
      className={hidden ? 'sr-only' : stepClass}
    >
      {hidden ? (
        null
      ) : (
        <>
          <div
            data-route-step-label-text
            className="truncate font-mono text-[length:var(--topology-selected-relation-route-label-font-size)] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]"
          >
            {label}
          </div>
          <div
            data-route-step-visible-value-text
            data-route-step-value-text
            className={`mt-0.5 truncate text-[length:var(--topology-selected-relation-route-value-font-size)] leading-3 ${valueTone}`}
          >
            {renderedValue}
          </div>
          {renderedValue === value ? null : <span className="sr-only">{value}</span>}
        </>
      )}
    </div>
  );
}

function Metric({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div
      data-testid={testId}
      data-metric-value={value}
      className="min-w-0 rounded-md border border-[color:var(--topology-selected-relation-subtle-border)] bg-[color:var(--topology-selected-relation-subtle-surface)] px-2.5 py-2 min-[1500px]:px-2 min-[1500px]:py-1.5"
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
  visibleLabel,
}: {
  actionKind: RelationCopyActionKind;
  copied: boolean;
  gateKind: RelationAgentGateKind;
  label: string;
  onClick: () => void;
  payloadCall: string;
  primary: boolean;
  primaryBadge: string;
  visibleLabel: string;
}) {
  const copyToneToken = primary
    ? `--topology-selected-relation-copy-${relationGateToken(gateKind)}`
    : '--topology-selected-relation-copy-secondary';
  return (
    <button
      type="button"
      data-relation-copy-action={actionKind}
      data-relation-copy-payload-call={payloadCall}
      data-relation-copy-priority={primary ? 'primary' : 'secondary'}
      data-copy-recommended={primary ? 'true' : 'false'}
      data-copy-recommendation-label={primary ? primaryBadge : undefined}
      data-copy-label-contract="visible-action-full-label-accessible"
      data-copy-visible-label={visibleLabel}
      data-copy-full-label={label}
      data-focus-ring-token="--topology-selected-relation-focus-ring"
      data-primary-shadow-token={
        primary ? '--topology-selected-relation-copy-primary-shadow' : undefined
      }
      data-copy-surface-token={`${copyToneToken}-surface`}
      data-copy-border-token={`${copyToneToken}-border`}
      data-copy-text-token={`${copyToneToken}-text`}
      data-copy-hover-surface-token={`${copyToneToken}-hover-surface`}
      data-copy-hover-text-token={`${copyToneToken}-hover-text`}
      title={payloadCall}
      aria-label={primary ? `${label} · ${primaryBadge}` : label}
      onClick={onClick}
      className={`inline-flex min-h-7 min-w-[var(--topology-selected-relation-action-min-width)] flex-1 basis-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-0.5 text-[11px] font-medium leading-none tracking-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--topology-selected-relation-focus-ring)] ${primary ? 'shadow-[var(--topology-selected-relation-copy-primary-shadow)]' : ''} ${relationCopyButtonTone({
        gateKind,
        primary,
      })}`}
    >
      {copied ? <Check size={11} /> : <Clipboard size={11} />}
      <span className="min-w-0 truncate">{visibleLabel}</span>
    </button>
  );
}
