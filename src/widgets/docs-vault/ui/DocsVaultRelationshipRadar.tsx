'use client';

import { Link2, Radar, X } from 'lucide-react';
import type { RelationshipRadarSuggestion } from '@/entities/docs-vault';

interface Props {
  suggestions: RelationshipRadarSuggestion[];
  confirmedSlugs: Set<string>;
  dismissedCount?: number;
  onNavigate: (slug: string) => void;
  onConfirm: (slug: string) => void;
  onReset: (slug: string) => void;
  onDismiss: (slug: string) => void;
  onClearDismissed: () => void;
}

export function DocsVaultRelationshipRadar({
  suggestions,
  confirmedSlugs,
  dismissedCount = 0,
  onNavigate,
  onConfirm,
  onReset,
  onDismiss,
  onClearDismissed,
}: Props) {
  if (suggestions.length === 0 && dismissedCount === 0) return null;
  const reviewedCount = suggestions.filter((item) =>
    confirmedSlugs.has(item.doc.slug),
  ).length;
  const pendingCount = suggestions.length - reviewedCount;
  const leadTitle = suggestions[0]?.doc.title ?? '무시한 후보 있음';

  return (
    <section
      className="mx-auto max-w-[760px] px-6 pt-4 md:px-10"
      aria-label="Relationship Radar"
    >
      <details className="group rounded-md border border-[color:rgba(224,196,140,0.16)] bg-[color:rgba(224,196,140,0.04)]">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(224,196,140,0.45)]">
          <Radar
            size={14}
            aria-hidden
            className="text-[color:rgba(224,196,140,0.9)]"
          />
          <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            추천 연결
          </span>
          <span
            role="status"
            aria-live="polite"
            className="rounded-sm border border-[color:rgba(224,196,140,0.24)] px-1.5 py-0.5 font-mono text-[9px] text-[color:rgba(224,196,140,0.88)]"
          >
            검토 {pendingCount}
          </span>
          {reviewedCount > 0 ? (
            <span className="rounded-sm border border-[color:rgba(139,151,255,0.18)] px-1.5 py-0.5 font-mono text-[9px] text-[color:rgba(200,210,255,0.86)]">
              완료 {reviewedCount}
            </span>
          ) : null}
          {dismissedCount > 0 ? (
            <span className="rounded-sm border border-[color:var(--color-divider)] px-1.5 py-0.5 font-mono text-[9px] text-[color:var(--color-text-quaternary)]">
              무시 {dismissedCount}
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-[11px] text-[color:var(--color-text-tertiary)]">
            자동 연결 없이 후보만 정리 · {leadTitle}
          </span>
        </summary>
        <div className="border-t border-[color:var(--color-border-soft)] px-3 py-2">
          <p className="text-[11px] leading-[1.55] text-[color:var(--color-text-tertiary)]">
            기획자가 연관 후보를 검토하는 목록입니다. 검토 완료와 무시는 이
            볼트에 저장되며, 실제 문서 링크는 편집에서 직접 추가합니다.
          </p>
        </div>
        {suggestions.length > 0 ? (
          <ul className="space-y-2 px-3 pb-3">
            {suggestions.map((item) => {
              const confirmed = confirmedSlugs.has(item.doc.slug);
              return (
                <li
                  key={item.doc.slug}
                  className="flex min-w-0 items-start gap-2 rounded-sm border border-[color:var(--color-border-soft)] bg-[color:rgba(12,14,20,0.45)] px-2.5 py-2"
                >
                  <Link2
                    size={12}
                    aria-hidden
                    className="mt-0.5 flex-none text-[color:rgba(224,196,140,0.75)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-[color:var(--color-text-primary)]">
                        {item.doc.title}
                      </p>
                      <span
                        className="font-mono text-[9px] text-[color:var(--color-text-quaternary)]"
                        aria-label={`추천 신뢰도 ${item.score}`}
                        title={`추천 신뢰도 ${item.score}`}
                      >
                        {item.score}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(item.linked ? ['이미 연결됨'] : item.reasons)
                        .slice(0, 3)
                        .map((reason) => (
                          <span
                            key={reason}
                            className="rounded-sm border border-[color:var(--color-border-soft)] px-1.5 py-0.5 text-[10px] text-[color:var(--color-text-tertiary)]"
                          >
                            {reason}
                          </span>
                        ))}
                      {confirmed ? (
                        <span
                          role="status"
                          aria-live="polite"
                          className="rounded-sm border border-[color:rgba(139,151,255,0.24)] px-1.5 py-0.5 text-[10px] text-[color:rgba(200,210,255,0.9)]"
                        >
                          검토 완료
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-none items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onNavigate(item.doc.slug)}
                      aria-label={`${item.doc.title} 문서 보기`}
                      className="rounded-sm border border-[color:rgba(224,196,140,0.28)] px-2 py-1 text-[11px] text-[color:rgba(230,210,170,0.92)] transition-colors hover:border-[color:rgba(224,196,140,0.55)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(224,196,140,0.45)]"
                    >
                      문서 보기
                    </button>
                    {!confirmed ? (
                      <button
                        type="button"
                        onClick={() => onConfirm(item.doc.slug)}
                        aria-label={`${item.doc.title} 추천 검토 완료`}
                        className="rounded-sm border border-[color:var(--color-divider)] px-2 py-1 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(139,151,255,0.5)]"
                      >
                        검토 완료
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onReset(item.doc.slug)}
                        aria-label={`${item.doc.title} 추천 검토 취소`}
                        className="rounded-sm border border-[color:var(--color-divider)] px-2 py-1 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(139,151,255,0.5)]"
                      >
                        검토 취소
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDismiss(item.doc.slug)}
                      aria-label={`${item.doc.title} 추천 무시`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(220,120,120,0.45)] hover:text-[color:rgba(240,180,180,0.95)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(224,196,140,0.45)]"
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-3 pb-3 text-[11px] leading-[1.55] text-[color:var(--color-text-tertiary)]">
            표시할 후보가 없습니다. 무시한 후보를 되돌리면 다시 검토할 수
            있습니다.
          </p>
        )}
        {dismissedCount > 0 ? (
          <div className="flex items-center justify-between gap-2 border-t border-[color:var(--color-border-soft)] px-3 py-2">
            <p className="min-w-0 text-[11px] text-[color:var(--color-text-quaternary)]">
              무시한 후보 {dismissedCount}개는 이 문서에서 숨겨져 있습니다.
            </p>
            <button
              type="button"
              onClick={onClearDismissed}
              className="flex-none rounded-sm border border-[color:var(--color-overlay-3)] px-2 py-1 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(224,196,140,0.45)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(224,196,140,0.45)]"
            >
              무시 되돌리기
            </button>
          </div>
        ) : null}
      </details>
    </section>
  );
}
