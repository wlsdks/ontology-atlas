"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getTopologyFocusHref } from "@/entities/project";
import { TopologyV2KindGlyph } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { controlClass } from "@/shared/ui/control-class";
import { useRowDisclosure } from "@/shared/lib/use-row-disclosure";
import { DomainCapacityBar, DomainCapacityLegend } from "@/widgets/domain-capacity-bar";
import type { DomainCompositionRow } from "../model/domain-composition";

export interface DomainCompositionRowsLabels {
  capabilityUnit: string;
  elementUnit: string;
  /** 막대를 읽는 법 — 묶음에 한 줄. */
  legendCaption: string;
  /** 히어로 칩 합과 행 합이 다른 이유. 같은 각주 문단 안에 이어 붙인다. */
  overlapNote: string;
  /** 막대가 `aria-hidden` 이므로 수치는 여기 실린다. */
  rowToggleAria: (row: DomainCompositionRow) => string;
  mapLinkLabel: string;
  capabilitiesEmpty: string;
}

interface Props {
  domains: DomainCompositionRow[];
  labels: DomainCompositionRowsLabels;
}

/**
 * 구성 탭 — 도메인 **행** 목록. 카드 격자(`DomainCompositionGrid`)를 은퇴시키고
 * 그 자리를 받았다 (2026-08-12, 소유자 선택 B안).
 *
 * ## 카드가 진 이유는 취향이 아니라 두 결함이었다
 *
 * ① **「역량 N개 더」는 갈 곳이 없는 수였다.** 카드는 상위 2개만 그리고 나머지를
 * 발줄로 셌는데, 그 N 개를 보려면 지도로 떠나야 했다 — 화면 안에서 펼칠 수도,
 * 누를 수도 없는 수. 게다가 「상위 2」의 기준(연결 많은 순)은 어디에도 적혀
 * 있지 않았으니, 읽는 사람에게는 그냥 두 개가 뽑혀 나온 것이었다.
 * ② **같은 수치를 세 가지 그림으로** 말했다(히어로 칩 · 방사 지도 · 카드).
 *
 * 행은 둘을 한 번에 지운다: 목록은 **그 자리에서** 전부 펼쳐지고(발줄 없음),
 * 그림은 앱이 이미 쓰는 하나의 문법(`DomainCapacityBar`)으로 수렴한다.
 *
 * ## 위젯은 표현 전용, 배치와 상호작용은 여기가 소유한다
 *
 * `insights-domain-row-link`(분석 구성 탭)와 **같은 규율**이다 — 막대 부품은
 * `/projects` 카드와 공유되므로 부품 안에 컨트롤을 넣으면 그쪽이 중첩
 * 인터랙티브가 된다. 그래서 감싸는 쪽이 히트 영역·호버·초점 링·손가락 바닥을
 * 더하고, 행의 배치는 한 픽셀도 건드리지 않는다(`block`/`w-auto`/`py-0`).
 *
 * ## 지도로 가는 문은 펼친 안에 하나
 *
 * 행마다 지도 칩을 달면 아홉 개짜리 잉크 열이 하나 더 생기고, 접힌 행이 두
 * 개의 목적지를 갖는다(무엇이 주인공인지 사라진다). 접힌 행의 일은 하나 —
 * 「무엇이 들어 있나」를 펼치는 것 — 이고, 펼친 뒤에 그 목록과 함께 지도 문이
 * 나온다. 프로젝트 전체를 지도에서 여는 길은 히어로의 주 버튼이 이미 갖고 있다.
 */
export function DomainCompositionRows({ domains, labels }: Props) {
  return (
    <div className="flex flex-col">
      {/* 막대 두 조각의 열쇠는 묶음에 한 줄 — 행마다 반복하면 소음이다. */}
      <DomainCapacityLegend
        labels={{ capabilityUnit: labels.capabilityUnit, elementUnit: labels.elementUnit }}
        className="mb-1.5"
      />
      <ul data-testid="project-detail-domain-rows" className="flex flex-col">
        {domains.map((domain) => (
          <DomainRow key={domain.id} domain={domain} labels={labels} />
        ))}
      </ul>
      {/*
        각주는 **한 문단**이다. 막대를 읽는 법과 「히어로 칩 합 ≠ 행 합」은 둘 다
        이 목록을 읽는 데 필요한 같은 종류의 주석이라, 문단을 둘로 쪼개면 조용한
        회색 블록이 둘로 늘어나 목록의 마지막 행과 경쟁한다.
      */}
      <p
        data-testid="project-detail-domain-overlap-note"
        className="mt-2.5 break-keep border-t border-[color:var(--color-divider)] pt-2.5 text-label leading-label text-[color:var(--color-text-quaternary)]"
      >
        {labels.legendCaption} {labels.overlapNote}
      </p>
    </div>
  );
}

function DomainRow({
  domain,
  labels,
}: {
  domain: DomainCompositionRow;
  labels: DomainCompositionRowsLabels;
}) {
  const [open, setOpen] = useState(false);
  // 펼침은 하드컷이 아니다 — 높이 전이(`--motion-base`)와 내용 크로스페이드
  // (`--motion-fast`)를 앱 공통 문법에서 그대로 받는다. reduced-motion 등가
  // 규칙도 이미 그 클래스에 등록돼 있다(`app/globals.css`).
  const { mounted, boxRef, contentRef } = useRowDisclosure(open);
  const panelId = `project-detail-domain-panel-${domain.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return (
    <li className="min-w-0 border-b border-[color:var(--color-divider)] last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={labels.rowToggleAria(domain)}
        data-testid="project-detail-domain-row-toggle"
        onClick={() => setOpen((value) => !value)}
        /*
          폭을 **명시**한다 — 분석 탭의 선례(`insights-domain-row-link`)는 `<a>`
          라 `w-auto` 로도 칸을 채우지만, **`<button>` 은 폼 컨트롤이라
          `width:auto` 가 shrink-to-fit 이다.** 그대로 베끼면 눌리는 면이 460px
          인데 아래 구분선은 944px 까지 그려져, 행의 오른쪽 절반이 「선은 있는데
          눌리지 않는」 띠가 된다(실측). `100% + 0.75rem` 은 좌우로 6px 씩 나간
          호버 면(`-mx-1.5 px-1.5`)을 되찾는 몫이고, 세로 인셋만 0 으로 되돌려
          아홉 행의 42px 리듬을 지킨다.
        */
        className={controlClass({
          shape: "row",
          size: "sm",
          className:
            "-mx-1.5 w-[calc(100%+0.75rem)] gap-2 px-1.5 py-0 hover:bg-[color:var(--color-overlay-1)]",
        })}
      >
        <span className="min-w-0 flex-1">
          <DomainCapacityBar
            row={domain}
            labels={{ capabilityUnit: labels.capabilityUnit, elementUnit: labels.elementUnit }}
          />
        </span>
        {/*
          **접힌 행은 자기가 열린다는 것을 말해야 한다.** 이 개편이 지운
          「역량 N개 더」는 적어도 글자로 보였는데, 그 자리를 받은 행이 아무
          표식도 없으면 아홉 줄이 읽기 전용 목록으로 보인다(커서와 호버는
          마우스를 올린 다음에야 말한다). 열림 상태를 나타내는 셰브런은 헌장이
          장식 화살표 금지의 예외로 명시한 것이고, 지도 INDEX 트리 행이 이미
          같은 문법(90도 회전 + `--motion-fast`)을 쓴다.
        */}
        <ChevronRight
          size={ICON_SIZE.sm}
          aria-hidden="true"
          className={`shrink-0 text-[color:var(--color-text-quaternary)] transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      <div
        ref={boxRef}
        id={panelId}
        className="ai-row-disclosure"
        data-state={open ? "open" : "closed"}
        data-testid="project-detail-domain-disclosure"
        // 접히는 동안에도 DOM 에 남으므로, 보이지 않는 링크가 탭 순서와
        // 스크린리더에 남지 않게 즉시 비활성화한다.
        inert={!open}
      >
        {mounted ? (
          <div ref={contentRef} className="ai-row-disclosure-body pb-2.5">
            {/* 자식은 부모 제목 아래로 들여쓴다(글리프 15 + 갭 8 = 23px 이
                제목의 시작 자리다) — 안 들여쓰면 펼친 목록이 도메인 행과 같은
                단에 서서 「도메인이 여덟 개 더 생긴 것」처럼 읽힌다. */}
            {domain.capabilities.length > 0 ? (
              <ul className="flex flex-col pl-[23px]">
                {domain.capabilities.map((title, index) => (
                  <li
                    // 같은 표시 제목이 둘 있을 수 있다(다른 슬러그, 같은 이름).
                    key={`${title}-${index}`}
                    // 높이를 내용에 맡기지 않는다 — 목록 안에서도 리듬이 같아야
                    // 「몇 개인가」가 길이로 읽힌다(치수 규칙성).
                    style={{ height: "var(--card-row-h)" }}
                    className="flex items-center gap-1.5 text-body text-[color:var(--color-text-secondary)]"
                  >
                    <TopologyV2KindGlyph kind="capability" size={13} />
                    <span className="min-w-0 flex-1 truncate">{title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="break-keep pl-[23px] text-body text-[color:var(--color-text-tertiary)]">
                {labels.capabilitiesEmpty}
              </p>
            )}
            <Link
              href={getTopologyFocusHref(domain.id)}
              data-testid="project-detail-domain-map-link"
              className={controlClass({
                shape: "chip",
                size: "sm",
                className: "mt-2 ml-[23px] hover:text-[color:var(--color-text-primary)]",
              })}
            >
              {labels.mapLinkLabel}
            </Link>
          </div>
        ) : null}
      </div>
    </li>
  );
}
