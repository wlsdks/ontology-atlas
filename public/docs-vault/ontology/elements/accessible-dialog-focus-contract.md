---
slug: elements/accessible-dialog-focus-contract
kind: element
title: Accessible Dialog Focus Contract
domain: onboarding-ux
dependencies: [capabilities/first-run-onboarding-guides]
---

# Accessible Dialog Focus Contract

`src/shared/lib/use-dialog-focus-trap.ts` — 첫 실행 과정의 모달 표면이
공유하는 키보드·포커스 계약.

- 열릴 때 대화상자 또는 지정한 최초 제어로 포커스를 옮긴다.
- `Tab`과 `Shift+Tab` 순환을 모달 내부의 조작 가능한 항목에 가둔다.
- 닫힐 때 모달을 연 제어로 포커스를 복원한다.
- 허용된 표면은 `Escape`로 닫을 수 있다.

현재 소비자는 `VaultOpenGuideSheet`와 `GuidedTourOverlay`다. 가이드 투어의
지도 상호작용 단계는 카드 내부의 실제 버튼을 제공하며, 이 버튼을
키보드로 활성화하면 강조 노드를 선택하고 다음 단계의 데이터시트를 연다.
계약 테스트는 각 소비자 테스트에서 최초 포커스, 순환, 닫기 복원을
검증한다.
