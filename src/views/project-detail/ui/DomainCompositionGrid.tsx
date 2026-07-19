import { Link } from "@/i18n/navigation";
import { getTopologyFocusHref } from "@/entities/project";
import { TopologyV2KindGlyph } from "@/shared/ui";
import type { DomainCompositionCard } from "../model/domain-composition";

interface Props {
  domains: DomainCompositionCard[];
  maxTotal: number;
  capabilityLabel: string;
  elementLabel: string;
  moreLine: (elementCount: number, moreCapabilityCount: number) => string;
}

/**
 * 프로젝트 상세 zone 2 — "도메인 구성" 3×N machined 카드 그리드. 각 카드는
 * `/topology?mode=focus&p=domain:<slug>` 로 이동(row = topology focus 진입점,
 * design gate 의 "typed fact 는 그래프로 확인 가능해야" 원칙). capacity meter
 * 는 가장 큰 도메인(0번째, 이미 total desc 정렬됨)만 인디고로 강조.
 */
export function DomainCompositionGrid({ domains, maxTotal, capabilityLabel, elementLabel, moreLine }: Props) {
  return (
    <div className="grid grid-cols-1 gap-[var(--card-gap)] sm:grid-cols-2 lg:grid-cols-3">
      {domains.map((domain, index) => {
        const percent = maxTotal > 0 ? Math.round((domain.total / maxTotal) * 100) : 0;
        return (
          <Link
            key={domain.id}
            href={getTopologyFocusHref(domain.id)}
            data-testid="project-detail-domain-card"
            className="group flex flex-col rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] shadow-[inset_0_1px_0_var(--color-overlay-1)] transition-colors hover:border-[color:var(--color-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)]"
          >
            <div className="flex items-center gap-2">
              <TopologyV2KindGlyph kind="domain" size={16} />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-[560] tracking-[-0.01em] text-[color:var(--color-text-primary)]">
                {domain.title}
              </span>
              <span
                data-token="engraved-numeral"
                className="shrink-0 font-mono text-[13px] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
              >
                {domain.total}
              </span>
            </div>

            <div className="mt-2.5 flex items-center gap-2.5">
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-[color:var(--color-border-soft)]">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${percent}%`,
                    backgroundColor: index === 0 ? "var(--color-indigo-brand)" : "var(--color-text-quaternary)",
                  }}
                />
              </span>
              <span className="shrink-0 font-mono text-[10.5px] whitespace-nowrap text-[color:var(--color-text-quaternary)]">
                {capabilityLabel}{" "}
                <b
                  data-token="engraved-numeral"
                  className="font-semibold text-[color:var(--engraved-numeral-face)]"
                >
                  {domain.capabilityCount}
                </b>
                {" · "}
                {elementLabel}{" "}
                <b
                  data-token="engraved-numeral"
                  className="font-semibold text-[color:var(--engraved-numeral-face)]"
                >
                  {domain.elementCount}
                </b>
              </span>
            </div>

            <div className="mt-2 flex flex-1 flex-col">
              {domain.topCapabilities.map((title) => (
                <div key={title} className="flex items-center gap-1.5 py-0.5 text-[12.5px] text-[color:var(--color-text-secondary)]">
                  <TopologyV2KindGlyph kind="capability" size={13} />
                  <span className="min-w-0 flex-1 truncate">{title}</span>
                </div>
              ))}
              <span className="mt-auto pt-1 text-[11px] text-[color:var(--color-text-quaternary)]">
                {moreLine(domain.elementCount, domain.moreCapabilityCount)}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
