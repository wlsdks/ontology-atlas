---
slug: elements/accessible-dialog-focus-contract
kind: element
title: Accessible Dialog Focus Contract
domain: onboarding-ux
dependencies: [capabilities/first-run-onboarding-guides]
---

# Accessible Dialog Focus Contract

`src/shared/lib/use-dialog-focus-trap.ts` — 겹쳐 뜨는 표면이 공유하는
키보드·포커스 계약.

- 열릴 때 대화상자 또는 지정한 최초 제어로 포커스를 옮긴다.
- 닫힐 때 그 표면을 연 제어로 포커스를 복원한다.
- 허용된 표면은 `Escape`로 닫을 수 있다.
- **`Tab` 순환 가둠은 모달일 때만이다** (`trapTab`, 기본 참).

## 비모달 표면은 초점을 가두지 않는다

`trapTab: false` 는 2026-07-29 설정 도크에서 생겼다. 도크는 오른쪽에 붙어
scrim 없이 뜨고 바깥의 지도가 살아 있다 — 값을 바꾸면서 그 결과를 봐야 하는
표면이기 때문이다. 바깥이 살아 있는데 초점만 가두면 **키보드 사용자만** 그
지도에 갈 수 없고, WAI-ARIA 도 non-modal dialog 는 초점을 가두지 않는다.

같은 이유로 비모달 표면은 `aria-modal` 도 달지 않는다 — 바깥이 조작 가능한데
"나머지는 없는 셈 치라" 고 보조기술에 말하면 그것은 거짓이다.

**딸려 오는 것**: 가이드 자동 시작 가드(`features/guided-tour/model/auto-start-guard.ts`)
는 "다른 표면과 대화 중" 을 `aria-modal` 로 판정했다. 비모달 표면은 그 속성이
없으므로 `data-surface-role` 마커로 잇는다. 새 비모달 표면을 만들 때 이 배선을
빠뜨리면 그 위로 안내가 뜬다.

## 소비자

`VaultOpenGuideSheet` · `GuidedTourOverlay` (모달) · `AppSettingsMenu` (비모달
도크). 계약 테스트는 각 소비자 테스트에서 최초 포커스, 순환 여부, 닫기 복원을
검증한다.
