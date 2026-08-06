import { Link } from "@/i18n/navigation";
import { getTopologyFocusHref } from "@/entities/project";
import { TopologyV2KindGlyph } from "@/shared/ui";
import type { DomainCompositionCard } from "../model/domain-composition";
import { controlClass } from '@/shared/ui/control-class';

/**
 * 카드 하나가 보여줄 상위 역량 개수. **상수다 — 데이터에 따라 흔들리지 않는다.**
 *
 * 3개 이상을 보여주기 시작하면 카드가 리스트로 퇴화하고, 카드마다 높이가 달라져
 * 격자가 격자로 안 읽힌다. 넘치는 몫은 발줄("N개 더")과 카드 진입(지도 focus)이
 * 담당한다 (Shneiderman: details on demand).
 */
const CAPABILITY_SLOTS = 2;

interface Props {
  domains: DomainCompositionCard[];
  maxTotal: number;
  capabilityLabel: string;
  elementLabel: string;
  /** 넘치는 역량 수 안내. `moreCapabilityCount === 0` 이면 호출되지 않는다. */
  moreLine: (moreCapabilityCount: number) => string;
}

/**
 * 프로젝트 상세 "도메인 구성" 카드 격자. 각 카드는
 * `/topology?mode=focus&p=domain:<slug>` 로 이동한다 — 화면의 typed fact 는
 * 그래프에서 확인 가능해야 한다는 design gate 원칙.
 *
 * ## 카드 높이는 내용이 아니라 해부구조가 정한다
 *
 * 소유자 지적(2026-07-26): *"박스 사이즈가 안맞지? 삐뚤빼뚤해보이는거말야"*.
 *
 * 원인은 카드마다 채워지는 **줄 수**가 달랐던 것이다 — 역량이 1개인 도메인은
 * 목록이 한 줄, 발줄도 카드에 따라 1절("요소 2개")과 2절("요소 2개 · 역량 1개
 * 더") 사이를 오갔다. 그리드는 행 안에서만 stretch 하므로 행끼리도 안 맞았다.
 *
 * 그래서 슬롯을 고정했다:
 *
 * - 목록은 항상 `CAPABILITY_SLOTS` 줄 — 역량이 하나뿐이면 **빈 슬롯을 자리만
 *   남긴 채** 둔다. 없는 줄은 아래 것들을 끌어올려 정렬을 깨뜨린다.
 * - 발줄은 항상 존재하되 **넘침 전용 한 절**이다. 요소 수는 위 계량 행이 유일한
 *   자리다 — 같은 수치를 한 카드에서 두 번 쓰지 않는다 (Tufte).
 * - `grid-auto-rows: 1fr` 은 해부구조가 지켜지면 발동할 일 없는 안전망이다.
 *
 * 대가는 정직하게: 작은 vault 에서는 빈 슬롯이 허공으로 보인다. 눈이 훑는
 * 반복 세트에서만 치를 값어치가 있는 대가다.
 */
export function DomainCompositionGrid({
  domains,
  maxTotal,
  capabilityLabel,
  elementLabel,
  moreLine,
}: Props) {
  return (
    <div
      className="grid grid-cols-1 gap-[var(--card-gap)] sm:grid-cols-2 lg:grid-cols-3"
      style={{ gridAutoRows: "1fr" }}
    >
      {domains.map((domain, index) => {
        const percent = maxTotal > 0 ? Math.round((domain.total / maxTotal) * 100) : 0;
        // 빈 슬롯까지 포함한 고정 길이 — 렌더가 데이터 길이에 끌려가지 않는다.
        const capabilitySlots = Array.from(
          { length: CAPABILITY_SLOTS },
          (_, slot) => domain.topCapabilities[slot] ?? null,
        );
        return (
          <Link
            key={domain.id}
            href={getTopologyFocusHref(domain.id)}
            data-testid="project-detail-domain-card"
            className={controlClass({ shape: "card", size: "lg", className: "group flex-col bg-[color:var(--color-panel)] p-[var(--card-pad)] shadow-[inset_0_1px_0_var(--color-overlay-1)] hover:border-[color:var(--color-border-strong)]" })}
          >
            <div className="flex items-center gap-2">
              <TopologyV2KindGlyph kind="domain" size={16} />
              <span className="min-w-0 flex-1 truncate text-body-lg font-[var(--font-weight-emphasis)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">
                {domain.title}
              </span>
              <span
                data-token="engraved-numeral"
                className="shrink-0 font-mono text-body-lg text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
              >
                {domain.total}
              </span>
            </div>

            {/* 계량 행 — 역량·요소 수의 **유일한** 자리. */}
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
              <span className="shrink-0 font-mono text-label whitespace-nowrap text-[color:var(--color-text-quaternary)]">
                {capabilityLabel}{" "}
                <b
                  data-token="engraved-numeral"
                  className="font-[var(--font-weight-strong)] text-[color:var(--engraved-numeral-face)]"
                >
                  {domain.capabilityCount}
                </b>
                {" · "}
                {elementLabel}{" "}
                <b
                  data-token="engraved-numeral"
                  className="font-[var(--font-weight-strong)] text-[color:var(--engraved-numeral-face)]"
                >
                  {domain.elementCount}
                </b>
              </span>
            </div>

            <div className="mt-2 flex flex-1 flex-col">
              {capabilitySlots.map((title, slot) => (
                <div
                  key={title ?? `empty-${slot}`}
                  aria-hidden={title === null}
                  className="flex items-center gap-1.5 text-body text-[color:var(--color-text-secondary)]"
                  style={{ height: "var(--card-row-h)" }}
                >
                  {title === null ? null : (
                    <>
                      <TopologyV2KindGlyph kind="capability" size={13} />
                      <span className="min-w-0 flex-1 truncate">{title}</span>
                    </>
                  )}
                </div>
              ))}
              {/* 발줄은 비어도 자리를 지킨다 — 사라지면 카드 높이가 흔들린다. */}
              <span
                className="mt-auto pt-1 text-label text-[color:var(--color-text-quaternary)]"
                aria-hidden={domain.moreCapabilityCount === 0}
              >
                {domain.moreCapabilityCount > 0 ? moreLine(domain.moreCapabilityCount) : " "}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
