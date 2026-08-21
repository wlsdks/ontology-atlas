---
uid: 981cd7f6-506a-4b2b-b62c-cd56896e81b0
slug: elements/agents-destination
kind: element
title: Agents Destination
domain: domains/agent-integration
path: src/views/agents/ui/AgentsPage.tsx
created_by: "agent:unknown"
display_ko: 「에이전트」 목적지
display_en: Agents Destination
---

## 정의

이 컴퓨터의 AI 코딩 도구를 **받고 · 깔고 · 붙이고 · 고치고 · 대화를 여는** 한
자리(`/agents/`). 레일의 여덟 번째 목적지다.

## 왜 목적지인가 (2026-08-20, 원장 90)

이 일은 2026-08-20 까지 설정 시트의 두 칸(「실행기」·「MCP 연결」)이었고, 지도
위에는 같은 일을 하는 연결 시트가 따로 있었다 — **한 가지 일에 주소가 셋**이었다.

옮긴 근거는 화면 폭이 아니다(설치 앱 실측: 정상 경로에서 시트의 46~47%가 오히려
빈다). 근거는 **그릇**이다:

- 모달이 뒤를 딤으로 막고 Esc 를 소유한다 — 52MB 를 받는 동안 지도를 못 본다.
- **설정은 값을 고르는 자리**이고, 이것은 **진행 상태가 있는 운영 작업**이다.

스킬이 문서함과 갈라선 것과 같은 문법이다(2026-08-09): 답하는 질문이 다르면
목적지가 다르다.

## 이 자리가 담는 것

1. **실행기 목록** — 이 기기에서 확인된 도구가 먼저 펼쳐지고 나머지는 접힌다.
2. **연결 점검** — 여덟 단계를 재고, 고칠 수 있는 것은 그 자리에서 고친다.
3. **앱 전용 설치** — Node 와 CLI 를 앱 폴더 안에만 받는다. 버전 고정 · 해시
   대조 · 명령 원문 선공개(원장 88·89). 진행률과 완료가 화면에 남고, 창을
   닫았다 열어도 유지된다.
4. **MCP 연결** — 밖의 에이전트에게 이 폴더를 알려 주는 설정. 웹에서도 된다 —
   MCP 는 화면이 아니라 **폴더에 붙는다**(2026-08-01 원장).

## 경계

- **API Key 와 작업 공간은 설정에 남는다.** 전자는 2026-08-16 「경로 동결·
  비강조」가 서 있고, 후자는 볼트가 답하는 축이 다르다(`local-vault-management`).
- **볼트를 연 뒤에만 MCP 설정판을 그린다** (소유자 확정 2026-08-21). 볼트가
  없으면 저장할 설정 자체가 없고, 그때 「대신 저장하지 못한다」는 아직 존재하지
  않는 파일에 대해 못 한다고 말하는 것이다.
- **레일은 여덟이 상한이다** (소유자 서명). 최소 창(720)에서 여덟 번째가 8px
  남기고 들어가고, 폭 2400 이상의 배율 1.1 에서는 761px 를 요구해 넘치므로
  상한과 함께 레일 스크롤 처리가 걸려 있다.
- 웹에서는 프로그램을 못 띄운다 — 이유와 갈 곳, 그리고 **이 화면에서도 되는
  것**을 함께 말한다.

## 근거

- src/views/agents/ui/AgentsPage.tsx: 목적지 본체
- src/widgets/app-settings-menu/ui/AcpRuntimeSettings.tsx: 실행기 목록·점검
- src/widgets/app-settings-menu/ui/AgentSetupSection.tsx: MCP 연결 절(볼트 게이트)
- src/features/acp-doctor/ui/AgentDoctor.tsx: 여덟 검사·수리·설치 진행
- src/features/acp-doctor/model/use-install-notice.ts: 설치 완료 레일 배지
- src/shared/config/destinations.ts: 목적지 등재(여덟 상한 계약)
- tests/contract/destination-shortcuts.contract.test.ts: 상한·스크롤 처리 계약
- tests/e2e/web-surface-smoke.spec.ts: 웹 강등 3항 계약
- docs/DECISIONS.md 2026-08-20 (90)

## 확신도

high (0.9): 라우트·이관·게이트가 계약과 e2e 로 받쳐 있고, 설치 앱에서 두 화면을
직접 열어 확인했다. 레일 배지가 설치 앱에서 실제로 서는 장면은 단위 시험과
브라우저 이동 지속성 측정으로 대신했다 — 그 한 자리는 아직 설치본 실측이 없다.
