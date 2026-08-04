"use client";

import { useLatinEyebrow } from "@/shared/lib/latin-eyebrow";
import { useRelationVocabulary, type RelationRegister } from "@/entities/knowledge-graph";

/**
 * 지도 우하단 상시 계기 — 선 인코딩(spine/terminal · quality stroke) 을
 * 설명하는 유일한 표면이라 first-run 여부와 무관하게 켜져 있는다
 * (W3 분석 보기 은퇴 — 이전에는 `TopologyAnalysisBar` overview 모드 안에만
 * 있어 그 모드를 벗어나면 선 의미를 잃어버렸다). `FirstRunReadout` 과 같은
 * 계기 판독 문법(mono 소문자, uppercase tracking, dot 구분)을 쓰지만 그
 * 컴포넌트의 가시성(정적 모드 + 미dismiss)에는 묶이지 않는다 — 렌더 위치는
 * `HomePage` 가 같은 bottom-right 스택 안에 둘을 나란히 배치한다.
 *
 * "상시" 는 first-run 상태 기준이다 — 뷰포트 기준으로는 `md:flex`
 * (< 768px 는 `hidden`) 로 좁은 화면에서 의도적으로 숨긴다. 좁은 화면은
 * 이 계기를 놓을 여유 공간이 없고, 선 인코딩보다 노드 자체 탐색이
 * 우선이라는 판단(UX 교차검증 라운드, 2026-07-19).
 *
 * P1a-1 (persona 실측 N5 — 표면마다 4벌 관계 어휘): 두 항목 모두
 * `useRelationVocabulary`(entities/knowledge-graph) formal 레지스터에서
 * 가져온다 — 인사이트·빌더와 같은 "포함"/"의존" 단어.
 *
 * 2026-07-23 (Image #9 소유자 관찰 + salience 리서치): 오른쪽 항목이
 * 이전엔 "확실도(confidence)" gradient(강함↔약함) 였다. 그러나 ① vault
 * 관계에 confidence 필드가 0건이고 ② 렌더러도 per-edge confidence 로 색을
 * 바꾸지 않아, 이 스와치는 존재하지 않는 데이터의 범례(장식)였다(Tufte
 * chartjunk). 게다가 gradient 의 weak 끝이 amber(--topology-relation-
 * stroke-weak, 217,161,65)라 hub/Layer-0 예약 톤을 관계선에 흘렸다. 지도가
 * 실제로 그리는 인코딩은 "타입"이다 — contains=실선 spine, depends=파선.
 * 그래서 범례를 실제 인코딩(contains 실선 / depends 파선) 설명으로 교체한다.
 *
 * 슬라이스 C (개발/비개발 모드 토글) — `register` prop (기본 `"formal"`).
 * 비개발(plain) 모드에서 HomePage 가 `"plain"` 을 넘겨 데이터시트와 같은
 * 어휘(plain 레지스터)로 통일한다.
 */
export function TopologyRelationLegend({
  register = "formal",
}: {
  register?: RelationRegister;
} = {}) {
  const relationVocabulary = useRelationVocabulary();
  // 진입 검수 E-10 — 범례 낱말은 ko 에서 「포  함」·「의  존」·「큰  줄기  보기」로
  // 벌어졌다. 라틴 범례에서는 아이브로가 정상 신호라 로케일 조건으로만 끈다.
  const eyebrow = useLatinEyebrow("tracking-[var(--tracking-caps-16)]");

  return (
    <div
      data-testid="topology-relation-legend"
      className={`pointer-events-none hidden items-center gap-3.5 text-caption text-[color:var(--color-text-quaternary)] md:flex ${eyebrow}`}
    >
      <span className="flex items-center gap-2">
        <span aria-hidden className="relative h-2.5 w-8 shrink-0">
          <span className="absolute left-0 right-1 top-1/2 h-px -translate-y-1/2 rounded-full bg-[color:var(--topology-relation-spine-halo)]" />
          <span className="absolute right-0 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-[color:var(--topology-relation-spine-terminal)]" />
        </span>
        {relationVocabulary("contains", register)}
      </span>
      <span className="flex items-center gap-2">
        {/* 방향 있는 관계 — 파선 + **테이퍼**(source 굵 → target 얇). 스와치도
            같은 문법으로 좌→우 가늘어진다. */}
        <span
          aria-hidden
          className="h-[3px] w-8 shrink-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, var(--topology-relation-spine-halo) 0 4px, transparent 4px 7px)",
            clipPath: "polygon(0 0, 100% 33%, 100% 67%, 0 100%)",
          }}
        />
        {/* 어휘 사전 canonical 키는 `depends_on` — 렌더 축약형 "depends" 를
            넘기면 미지 타입 raw fallback 으로 ko 에서 "DEPENDS" 가 노출됐다
            (소유자 스크린샷 실발견 2026-07-23). */}
        {relationVocabulary("depends_on", register)}
      </span>
      <span className="flex items-center gap-2">
        {/* 대칭 관계 — 파선 + **균일 굵기**. 양끝이 대등하다는 사실이
            "테이퍼가 없다" 로 인코딩된다. 이 항목이 없던 동안 범례는 모든
            파선을 "의존" 이라 불렀는데, 실제 볼트에서는 그 파선의 70%가
            방향 없는 `related_to` 였다(2026-07-31 dogfood 실측 62/89). */}
        <span
          aria-hidden
          className="h-[2px] w-8 shrink-0 rounded-full"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, var(--topology-relation-spine-halo) 0 4px, transparent 4px 7px)",
          }}
        />
        {relationVocabulary("related_to", register)}
      </span>
    </div>
  );
}
