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
      className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[color:var(--color-canvas)]"
    >
      <div className="mx-auto flex w-full max-w-[880px] flex-1 flex-col px-4 py-6 sm:px-6">
        <AtlasGitPanel
          vaultPath={vaultPath}
          sessionChangeset={changeset}
          // 목적지에는 닫기가 없다 — 레일로 다른 곳에 가면 그게 나가기다.
          // 패널이 모달 시절 헤더에 X 를 그리므로 no-op 을 넘겨 숨긴다.
          onClose={NOOP_CLOSE}
          hideClose
          className="flex-1"
        />
      </div>
    </main>
  );
}

const NOOP_CLOSE = () => {};
