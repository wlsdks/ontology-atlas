---
uid: 12dfb05e-c76a-4d1c-b24d-e4c80db2be04
slug: capabilities/agent-work-visibility
kind: capability
title: Agent Work Visibility
display_ko: 에이전트 작업 가시화
display_en: Agent Work Visibility
domain: domains/agent-integration
elements: []
path: src/features/agent-activity
created_by: "agent:unknown"
---

## 정의
사람이 지도에서 AI 에이전트의 제품명, 검증된 현재 단계, 작업 목표와 대상, 다음 행동을 한 흐름으로 판독하는 능력. fresh heartbeat가 있을 때만 계획·편집·검증·승인 대기를 현재형으로 말하고, 쓰기 로그만 최근이면 작업 중이라고 추측하지 않고 변경 감지 또는 마지막 작업으로 구분한다.

## 경계
- 화면은 `codex-mcp-client`·`codex-acp` 같은 감사용 client/runtime ID를 Codex·Claude Code 같은 사람용 제품명으로 바꾸지만, 원본 로그와 heartbeat 값은 그대로 보존한다. 지도 상태 줄뿐 아니라 전역 레일과 상세 activity 표면도 같은 표시 이름 경계를 쓴다.
- 현재 대상은 heartbeat나 도구 입력이 실재하는 볼트 slug를 밝힌 경우에만 지도 링과 포커스로 연결한다. 이미 지도 위에서는 같은 HomePage의 선택 상태를 갱신해 볼트를 remount하지 않고, 독립 소비처만 `/topology?mode=focus&p=…` fallback을 쓴다. 모르는 대상은 링크나 링을 만들지 않는다.
- 앱 안 ACP의 `onTurnActivityChange`는 같은 렌더 주기에 지도 포커스와 활동 칩을 먼저 갱신하고, sidecar 기록은 외부 소비자·재시작 연속성을 위해 뒤따른다. 현재 인앱 차례에 대상이 없으면 직전 sidecar 대상을 되살리지 않는다.
- 우측 에이전트 도크가 열리면 INDEX는 저장 선호를 바꾸지 않고 세션 동안 접혀 지도 폭을 내준다. 도크를 닫으면 원래 선호가 복구되고, INDEX 탭을 직접 열면 도크가 닫힌다.
- 도크 공간은 기존 `--agent-panel-reflow-duration`으로 먼저 열리고 카메라는 같은
  클럭의 live spring으로 새 폭을 따라간다. ACP 세션은 전환 뒤 240ms의 착지 창까지
  지난 다음 시작해 프로세스 기동이 지도 layout/camera 모션을 끊지 않는다. 에이전트가
  열린 동안 자동 INDEX 강등은 카메라 의미를 다시 맞추되 직접 팬·줌한 시점은 빼앗지 않는다.
- 한 사용자 차례의 thought와 tool call은 기본 접힌 `작업 과정 · N단계` 한 묶음이다. 에이전트 답변은 별도 본문으로 남고, 상세을 펼치면 원래 작업 순서와 실재 target을 볼 수 있다. thought의 Markdown은 원문 표식이 아니라 굵게·코드·목록으로 렌더된다.
- 알림은 도구 호출마다 쏟지 않고 작업 시작·종료와 구조 변화 단위로 집계한다.
  현재 작업 판독은 우상단 도구줄 아래 상태 행에서, 과거 알림은 맨 오른쪽 독립
  종과 넓은 inbox에서 연다. 두 표면은 한 feed를 공유하지만 내용을 섞지 않는다.
- 앱 안 ontology 쓰기의 allow/reject와 terminal status는 `.ontology-atlas/acp-work.jsonl`의 bounded snapshot으로 남고 알림 popover에서 작업 영수증으로 읽힌다. 전체 대화·thought·tool output·절대 경로·본문 값은 남기지 않으며, 실행 사실을 기록하는 `activity.jsonl`과 섞지 않는다.
- `created_by: human`은 provenance일 뿐 검토 필요 상태가 아니며, 예약 reader kind인 `vault-readme`는 지도 편집 대상이나 개념 census가 아니다.

## 근거
- src/features/agent-activity/model/agent-work-projection.ts: heartbeat·쓰기 세션의 정직한 우선순위와 live/recent-write/completed 분리
- src/features/agent-activity/model/use-agent-activity-feed.ts: 인앱 ACP 관측값이 다음 sidecar 폴링보다 먼저 현재 작업 projection을 이기는 세션 오버레이
- src/features/agent-activity/ui/AgentActivityChip.tsx: 에이전트·단계·현재/마지막 대상과 작업 상세/집계 기록 표면
- src/shared/lib/acp-work-receipt.ts: 요청·typed 변경·사람 결정·최종 상태만 보존하는 bounded append-only receipt와 최신 snapshot read model
- src/features/acp-session/model/use-acp-session.ts: ontology write allow/reject와 tool terminal status를 같은 receipt id로 내보내는 수명주기
- src/features/acp-session/model/acp-turn-activity.ts: ACP 사용자 요청·도구·권한 대기에서 단계와 실재 target 파생
- src/views/home/lib/acp-agent-heartbeat.ts: 순서가 보장된 vault heartbeat write/clear와 지도 focus handoff
- src/views/home/lib/resolve-contextual-index-state.ts: 사용자 선호를 보존하는 INDEX 세션 강등
- src/widgets/acp-chat-panel/ui/group-events.ts: 사용자 차례별 thought/tool 작업 과정 집계
- src/widgets/acp-chat-panel/ui/AcpChatPanel.tsx: 접힌 작업 과정, Markdown 상세, 단계 수와 실행 중 상태
- src/views/home/ui/HomePage.tsx: INDEX·지도·ACP 도크의 공간 우선 전환과 상호배타
- src/shared/lib/agent-display-name.ts: 감사용 원본 ID와 사람용 표시 이름 경계

## 확신도
high (0.95): 순수 파생·컴포넌트·ACP 통합 계약, 360~2560 overflow sweep, 설치 앱 Codex Computer Use 왕복과 30/120fps 모션 녹화로 검증한다.
