"use client";

import { AtlasGitPanel, useAtlasGitContext } from "@/widgets/atlas-git-panel";

/**
 * 발자취 — 볼트 문서의 변경을 기록하는 **목적지** (2026-07-25 승격).
 *
 * ## 왜 모달이 아니라 목적지인가
 *
 * 이전엔 레일 하단 유틸 타일에서 560px scrim 모달로 열렸다. 소유자 요청은
 * "LNB 아이콘들 바로 아래에 Git 추가 · 연동부터 관리까지 한 메뉴" 였고,
 * 실제로 이 표면이 하는 일(무엇이 바뀌었나 → 무엇을 남길까 → 언제 무슨 의미가
 * 바뀌었나)은 **머무르며 읽는 작업**이라 560px 모달에 맞지 않는다.
 *
 * 승격하면서 **유틸 타일과 모달은 흡수했다** — 입구가 둘이면 `#65`(페이지마다
 * 레일 아이콘 수가 달랐던 결함)와 같은 계열의 혼란이 재발한다. 미커밋 변경
 * 수는 목적지 아이콘의 warning 뱃지로 옮겼다(`AppNavRail`).
 *
 * ## 청중
 *
 * 구 타일은 `audiencePlain` 이면 렌더하지 않았다. 목적지는 **전 청중에 노출**
 * 한다 — "누가 언제 무슨 의미를 바꿨나" 는 기획자·임원도 보는 정보이고 그건
 * 개발 작업이 아니다. 청중에 따라 레일 항목 수가 달라지는 것 자체가 #65 계열
 * 결함이기도 하다. (쓰기 동작의 청중 게이트는 별 슬라이스 — 지금은 패널이
 * 웹/데스크톱으로만 갈린다.)
 *
 * ## 지금 상태
 *
 * 본문은 기존 `AtlasGitPanel` 을 그대로 쓴다. 시안 v2 의 2열 레이아웃(좌:
 * 변경 목록 + sticky 컴포저 / 우: 증거 pane ≥600px)은 Scope 2 후속이다 —
 * 라우트·레일·흡수를 먼저 착지시켜 입구가 하나가 되게 하는 것이 이 슬라이스다.
 */
export function GitPage() {
  const { vaultPath, changeset } = useAtlasGitContext();

  return (
    <main
      data-testid="git-page"
      // 높이 계약 (2026-07-26 — 소유자 "공백이 너무 많다" 판정의 실제 뿌리).
      //
      // 이 목적지는 셸이 주는 높이를 **받지 않고** `flex-1` 로만 서 있었다.
      // 구 셸에서 세로는 주축이었고 주축의 자식 높이는 flex-basis(=콘텐츠)로
      // 잡히므로, 내용이 짧은 상태에서 페이지가 콘텐츠 높이로 접혔다.
      // 1920×1223 실측: main 554px — 레일의 우측 구분선과 캔버스 배경이 화면
      // 중턱(y=554)에서 **끊겼다**. 소유자가 본 "800px 공백" 은 빈 페이지가
      // 아니라 **앱이 없는 영역**이었다. 여백 문제로 보였지만 레이아웃 결함이다.
      //
      // 셸이 `h-dvh` 로 뷰포트를 소유하므로(AppShell) 페이지는 `h-full` 로
      // 그 높이를 받고 스크롤은 안에서 처리한다 — 홈·문서함과 같은 문법이다.
      className="flex h-full flex-col overflow-hidden bg-[color:var(--color-canvas)]"
    >
      {/* 페이지 프레임 — 모달의 560px 이 아니라 목적지 폭이다. 실측(2026-07-25)
          에서 `max-w-[880px]` + 상단 정렬이 1200×1223 페이지의 상단 300px 만
          채워 "미완성" 으로 읽혔다. 컨테이너를 1280 까지 열고 세로로 채운다 —
          시안 v2 의 2열(좌 1fr + 우 ≥600px)을 담을 수 있는 폭이기도 하다.
          연결 전 상태(셋업 모드)에서는 패널이 이 프레임 정중앙에 단일 컬럼으로
          선다 — 폭을 좁히는 건 패널이 하고, 프레임은 그대로 목적지 폭이다. */}
      <div className="mx-auto flex w-full max-w-[1280px] min-h-0 flex-1 flex-col overflow-hidden px-4 pt-5 sm:px-8">
        <AtlasGitPanel vaultPath={vaultPath} sessionChangeset={changeset} className="flex-1" />
      </div>
    </main>
  );
}
