---
slug: capabilities/first-run-onboarding-guides
kind: capability
title: First-Run Onboarding Guides (auto tour · pre-picker sheet · start checklist)
domain: onboarding-ux
elements: [elements/accessible-dialog-focus-contract]
---

# First-Run Onboarding Guides

2026-07-24 온보딩 라운드 — 라이브 답사(비개발자 피드백)로 확인한 첫 사용
이탈 지점 4곳을 **기존 온보딩 자산의 재배치**로 해소한 역량. 새 시스템을
만들지 않고 결정적 순간에 가이드를 세운다.

1. **가이드 투어 첫 방문 자동 시작** — 샘플 모드 정착 + `guided-tour:v1`
   미기록이면 900ms 뒤 1회 자동 시작. `canAutoStartGuidedTour`
   (`src/features/guided-tour/model/auto-start-guard.ts`)가 모달/포커스
   이탈/이미 열린 투어를 가드(stacked-transient 금지). 첫 실행 카드에
   "2분 구경하기" CTA(`first-run-tour-cta`) 병행.
2. **폴더 열기 사전 안내 시트** — `VaultOpenGuideSheet`
   (`src/features/docs-vault-local/ui/`). 안심 3줄(아무 폴더 OK · 로컬
   유지 · 빈 폴더 자동 스캐폴드) + 기존/새로 분기 후에만 OS 폴더 선택창.
3. **빈 vault 시작 체크리스트** — `VaultStartChecklist`
   (`src/widgets/topology-controls/ui/`). 프로젝트 → 도메인 → 관계 →
   AI 에이전트 연결(선택) 4단계, 실카운트(ontologyInsight 파생)에서 완료
   상태 파생. 웹에서 macOS 설치를 권하던 빈 상태 오안내 브랜치 제거
   (`TopologyEmptyState.hasOpenVault`).
4. **용어 순화 + 일반 모드 승격** — 노드 카드 "근거 선언됨"→"문서 있음",
   "인계 복사"→"AI 요약 복사", census 라벨 한국어화, '일반(쉬운 말)'
   보기를 첫 실행 카드 1클릭 토글(`first-run-plain-toggle`)로 승격.

투어 4단계 인터랙티브 컷아웃은 프로브 대비 16px 클릭 여유를 두고
(`GuidedTourOverlay` `TOUR_HOLE_PADDING`), 프로브 중심 클릭 통과를
`tests/e2e/guided-tour.spec.ts` 회귀로 고정한다.

2026-07-25 사용성 감사에서 첫 실행 투어와 볼트 열기 안내 시트가 같은
접근성 계약을 쓰도록 `Accessible Dialog Focus Contract`를 추가했다. 두
표면 모두 열릴 때 대화상자로 포커스를 옮기고, `Tab`/`Shift+Tab`을 내부에
가두며, 닫은 뒤 기존 실행 지점으로 포커스를 돌려준다. 투어의 인터랙티브
단계는 키보드로도 활성화할 수 있다.
