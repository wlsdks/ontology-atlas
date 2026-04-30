'use client';

import { RotateCcw, Send, Webhook } from 'lucide-react';
import type { DeveloperActivityDelivery } from '@/features/docs-vault-activity';

interface Props {
  deliveries: DeveloperActivityDelivery[];
  onReprocess: (deliveryId: string) => void;
  onRedeliver: (deliveryId: string) => void;
  reprocessingId?: string | null;
  redeliveringId?: string | null;
}

const STATUS_LABEL: Record<DeveloperActivityDelivery['status'], string> = {
  received: '수신',
  processed: '반영',
  ignored: '대상 없음',
  failed: '실패',
};

const STATUS_HELP: Record<DeveloperActivityDelivery['status'], string> = {
  received: '수신만 되었고 아직 활동으로 반영되지 않았습니다.',
  processed: 'Docs Vault 작업 이벤트로 반영됐습니다.',
  ignored: '문서나 프로젝트 매핑이 없어 자동 반영하지 않았습니다.',
  failed: '처리 중 오류가 발생해 운영자 확인이 필요합니다.',
};

const GITHUB_REDELIVERY_LABEL: Record<
  NonNullable<DeveloperActivityDelivery['githubRedeliveryStatus']>,
  string
> = {
  requested: '요청됨',
  failed: '실패',
};

const formatter = new Intl.DateTimeFormat('ko-KR', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function DocsVaultDeliveryLogPanel({
  deliveries,
  onReprocess,
  onRedeliver,
  reprocessingId,
  redeliveringId,
}: Props) {
  const visibleDeliveries = deliveries.slice(0, 5);
  const failedCount = deliveries.filter(
    (delivery) => delivery.status === 'failed',
  ).length;
  const ignoredCount = deliveries.filter(
    (delivery) => delivery.status === 'ignored',
  ).length;

  return (
    <section
      className="mx-auto max-w-[760px] px-6 pt-3 md:px-10"
      aria-label="GitHub webhook delivery log"
    >
      <details className="rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(12,14,20,0.35)]">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(139,151,255,0.45)]">
          <Webhook
            size={14}
            aria-hidden
            className="text-[color:rgba(139,151,255,0.85)]"
          />
          <span className="min-w-0 flex-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            GitHub Delivery Recovery
          </span>
          {failedCount > 0 || ignoredCount > 0 ? (
            <span
              role="status"
              aria-live="polite"
              className="rounded-sm border border-[color:rgba(224,196,140,0.22)] bg-[color:rgba(224,196,140,0.07)] px-1.5 py-0.5 text-[10px] text-[color:rgba(224,196,140,0.9)]"
            >
              확인 필요 {failedCount + ignoredCount}
            </span>
          ) : null}
          <span className="rounded-sm border border-[color:var(--color-divider)] px-1.5 py-0.5 font-mono text-[9px] text-[color:var(--color-text-quaternary)]">
            {deliveries.length}
          </span>
        </summary>
        <div className="border-t border-[color:var(--color-border-soft)] p-3">
          <p className="mb-3 text-[11px] leading-[1.55] text-[color:var(--color-text-tertiary)]">
            저장된 payload 재처리는 Aslan 안에서 다시 반영하고, GitHub 재전송은
            GitHub App delivery 자체를 다시 받도록 요청합니다.
          </p>
          {visibleDeliveries.length > 0 ? (
            <ul className="space-y-2">
              {visibleDeliveries.map((delivery) => {
                const canReprocess =
                  delivery.status === 'failed' || delivery.status === 'ignored';
                const isBusy = reprocessingId === delivery.id;
                const canRedeliver = Boolean(delivery.deliveryId);
                const isRedelivering = redeliveringId === delivery.id;
                return (
                  <li
                    key={delivery.id}
                    className="flex min-w-0 flex-col gap-2 rounded-sm border border-[color:var(--color-border-soft)] bg-[color:rgba(8,10,16,0.45)] px-2.5 py-2 sm:flex-row sm:items-start"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <span
                        aria-hidden
                        className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${statusDotClass(delivery.status)}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="rounded-sm border border-[color:var(--color-divider)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]"
                            title={STATUS_HELP[delivery.status]}
                          >
                            {STATUS_LABEL[delivery.status]}
                          </span>
                          <p
                            className="min-w-0 flex-1 truncate text-[12px] font-medium text-[color:var(--color-text-primary)]"
                            translate="no"
                          >
                            {delivery.repository ?? 'GitHub delivery'}
                          </p>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                          <span translate="no">{delivery.eventName}</span>
                          {delivery.updatedAt ? (
                            <span>
                              {formatter.format(new Date(delivery.updatedAt))}
                            </span>
                          ) : null}
                          {delivery.actor ? (
                            <span translate="no">{delivery.actor}</span>
                          ) : null}
                          {delivery.deliveryId ? (
                            <span translate="no">
                              delivery {delivery.deliveryId.slice(0, 8)}
                            </span>
                          ) : null}
                          {delivery.targetSlugs.length > 0 ? (
                            <span>{delivery.targetSlugs.length} targets</span>
                          ) : null}
                        </div>
                        {delivery.targetSlugs.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {delivery.targetSlugs.slice(0, 4).map((slug) => (
                              <span
                                key={slug}
                                translate="no"
                                className="max-w-[180px] truncate rounded-sm border border-[color:var(--color-divider)] px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--color-text-tertiary)]"
                                title={slug}
                              >
                                {slug}
                              </span>
                            ))}
                            {delivery.targetSlugs.length > 4 ? (
                              <span className="rounded-sm border border-[color:var(--color-divider)] px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                                +{delivery.targetSlugs.length - 4}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-2 rounded-sm border border-[color:rgba(224,196,140,0.16)] bg-[color:rgba(224,196,140,0.04)] px-2 py-1 text-[10.5px] text-[color:rgba(224,196,140,0.86)]">
                            매핑된 문서 없음
                          </p>
                        )}
                        {delivery.reason ? (
                          <p className="mt-1 line-clamp-2 text-[11px] leading-[1.45] text-[color:var(--color-text-tertiary)]">
                            {delivery.reason}
                          </p>
                        ) : null}
                        {delivery.githubRedeliveryStatus ? (
                          <p className="mt-1 line-clamp-2 text-[11px] leading-[1.45] text-[color:var(--color-text-tertiary)]">
                            GitHub 재전송{' '}
                            {
                              GITHUB_REDELIVERY_LABEL[
                                delivery.githubRedeliveryStatus
                              ]
                            }
                            {delivery.githubRedeliveryError
                              ? ` · ${delivery.githubRedeliveryError}`
                              : ''}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-none flex-wrap items-center justify-end gap-1.5">
                      {canReprocess ? (
                        <button
                          type="button"
                          onClick={() => onReprocess(delivery.id)}
                          disabled={isBusy || isRedelivering}
                          aria-label={`${delivery.repository ?? delivery.eventName} 저장된 payload 재처리`}
                          className="inline-flex h-7 items-center gap-1 rounded-sm border border-[color:rgba(139,151,255,0.28)] px-2 text-[11px] text-[color:rgba(200,210,255,0.92)] transition-colors hover:border-[color:rgba(139,151,255,0.55)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(139,151,255,0.5)] disabled:cursor-wait disabled:opacity-60"
                          title="저장된 payload 를 다시 projection 합니다."
                        >
                          <RotateCcw size={12} aria-hidden />
                          {isBusy ? '재처리 중' : 'payload 재처리'}
                        </button>
                      ) : null}
                      {canRedeliver ? (
                        <button
                          type="button"
                          onClick={() => onRedeliver(delivery.id)}
                          disabled={isBusy || isRedelivering}
                          aria-label={`${delivery.repository ?? delivery.eventName} GitHub delivery 재전송 요청`}
                          className="inline-flex h-7 items-center gap-1 rounded-sm border border-[color:var(--color-overlay-3)] px-2 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.45)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(139,151,255,0.5)] disabled:cursor-wait disabled:opacity-60"
                          title="GitHub App delivery 를 GitHub 에서 다시 전송합니다."
                        >
                          <Send size={12} aria-hidden />
                          {isRedelivering ? '재전송 요청 중' : 'GitHub 재전송'}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[12px] leading-[1.5] text-[color:var(--color-text-tertiary)]">
              GitHub webhook 이 실패하거나 문서 매핑이 빠졌을 때만 여기를 열어 복구합니다.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}

function statusDotClass(status: DeveloperActivityDelivery['status']) {
  if (status === 'processed') return 'bg-[color:rgba(83,190,137,0.85)]';
  if (status === 'failed') return 'bg-[color:rgba(238,108,108,0.88)]';
  if (status === 'ignored') return 'bg-[color:rgba(224,196,140,0.85)]';
  return 'bg-[color:rgba(139,151,255,0.9)]';
}
