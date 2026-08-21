---
uid: a1c4bbe0-f3f3-4c8c-97ca-762bab54dd3c
slug: capabilities/acp-runtime
kind: capability
title: In-App Coding Agent Runtime (ACP)
display_ko: 앱 안 코딩 에이전트 실행기 (ACP)
display_en: In-App Coding Agent Runtime (ACP)
domain: domains/agent-integration
elements: []
path: src-tauri/src/acp.rs
created_by: human
dependencies: [capabilities/mcp-server]
relation_notes: { capabilities/mcp-server: ACP 세션은 session/new 의 mcpServers 로 이 서버를 주입받아 볼트 도구를 얻는다 (src/features/acp-session/model/vault-mcp-server.ts). 그래서 ACP 는 MCP 서버를 대체하는 경로가 아니라 그 위에 서는 경로다. }
---

## 정의
사용자가 이미 설치해 둔 코딩 에이전트(Claude Code, Codex 등)를 앱이 ACP(Agent
Client Protocol) v1 로 직접 띄우고, 그 세션의 설정을 격리하고, 볼트 밖 파일
접근을 사람에게 되묻는 능력. 새 API 키도 새 벤더 연동도 필요 없다: 그 도구가
이미 쓰는 구독 인증을 그대로 쓴다.

이 능력이 실제로 하는 일 일곱:

1. **탐지.** 이 기기의 실행기 상태를 다섯으로 갈라 판정한다: `ready`,
   `cli-missing`, `node-missing`, `uvx-missing`, `binary-missing`. 상태를
   「설치됨/아님」 둘로 뭉개지 않는 이유는 각 상태마다 사용자가 할 일이 다르기
   때문이다.
2. **목록은 커밋된 스냅샷에서 온다.** ACP 레지스트리를 빌드 때 한 번 받아
   `src-tauri/src/acp-registry.json` 에 저장하고, 실행 중에는 네트워크를 부르지
   않는다. 신뢰 헌장 ①(인터넷 없이 돌아간다)과 ②(사용자가 켠 통신만)가 함께
   걸리는 자리라서다. 아이콘도 같은 이유로 빌드 때 받아 `public/acp-icons/` 에
   번들한다.
3. **설정 격리.** 앱이 띄우는 세션은 앱 데이터 폴더 안의 자기 설정 디렉터리를
   쓴다(`CLAUDE_CONFIG_DIR`). 사용자의 전역 설정을 물려받으면 터미널에서 「다
   허용」해 둔 사람에게는 앱이 아무것도 못 막는다. 자격증명은 복사하지 않고
   심볼릭 링크로 원본을 가리킨다.
4. **권한 판정.** 볼트 안이면 앱이 대신 허용하고, 밖이면 사용자에게 묻는다.
   판정 근거는 제목 문자열이 아니라 권한 요청 원문의
   `toolCall.rawInput.file_path`(절대 경로)이며, 경로를 못 찾으면 묻는다. 판정의
   볼트 루트는 화면이 요청마다 보내는 값이 아니라 `acp_start`가 검증·정규화해
   네이티브 세션에 묶은 값이다. 세션을 찾지 못하거나 루트가 유효하지 않아도
   묻는 쪽으로 닫힌다. 세션 시작 뒤 루트 경로가 외부 심볼릭 링크로 바뀌면
   정규 경로 불일치로 거절해 권한 경계가 세션 중에 움직이지 않게 한다.
5. **작업 폴더 위생.** 세션의 작업 폴더는 폴더 피커가 쓰는 것과 같은 볼트 루트
   판정을 통과해야 한다. 파일시스템 루트, 홈 디렉터리 자체, OS/앱 디렉터리는
   거절한다.
6. **작업 방식 안전 상태.** 어댑터가 내놓은 모드는 확인됨 · 위험 · 미검증으로
   가른다. 권한 확인을 없애는 것으로 확인된 모드는 숨기고, 미검증 모드는
   `AcpSessionChoices.unverifiedModeIds`에 보존해 기존 선택기에서 「확인 안 됨」과
   그 뜻을 함께 보여 준다.
7. **프로세스 트리 종료.** 자식은 자기 프로세스 그룹을 갖고, 종료는 SIGTERM 뒤
   최대 1초를 기다렸다가 SIGKILL로 그룹 전체를 끝낸다. 완료 여부도 리더 PID가
   아니라 원래 PGID의 생존으로 판정하므로 리더가 먼저 회수돼도 TERM을 무시한
   손자를 놓치지 않는다. 어댑터가 띄운 손자까지 같이 끝내지 않으면 앱을 꺼도
   프로세스가 남는다.

## 경계
- **「에이전트」 목적지(`/agents/`)와 홈 지도 오른쪽 대화 패널이 현재 사용자
  표면이다.** 격리 관문을 실측한 실행기를 고르면 `HomePage`가 `AcpChatPanel`을
  열고 현재 볼트를 작업 폴더와 MCP 서버로 넘긴다.

  ⚠️ 이 줄은 2026-08-20 까지 *"설정의 「실행기」 절 … 별도 경로나 새 화면은
  아니다"* 였다. 원장 (90)이 그것을 뒤집었다. 설치·연결은 값을 고르는 일이 아니라
  진행 상태가 있는 운영 작업이라, 뒤를 막는 모달이 그릇으로 맞지 않았다. 같은
  부품(`AcpRuntimeSettings`)이 목적지와 설정 시트 양쪽에 서고, 소개 줄을 그릴지는
  부르는 쪽이 정한다.
- **세션의 볼트 MCP 서버는 한 벌만 유지한다.** Codex가 현재 볼트의 유효한
  `.codex/config.toml`에서 앱이 주입하려는 것과 같은 명령을 스스로 읽는 경우에만
  중복 주입을 생략한다. 명령이 같아도 현재 볼트용 전체 설정 검증이 실패하면 앱이
  검증된 서버를 주입한다. self-read를 실측하지 않은 런타임도 종전 주입을 유지한다.
- **앱이 실제로 띄우는 것은 격리 표에 있는 실행기뿐이고, 오늘 그것은
  `claude-acp` 하나다.** 나머지는 목록과 상태 판정에는 나오되 띄우려 하면
  `isolation-unsupported` 로 닫힌다. codex 는 격리를 실측했다가 작업 폴더 밖
  쓰기에 권한 요청이 오지 않아 표에 넣지 않았다.
- 격리되지 않은 실행기는 설정에서 「확인 안 됨」으로 표시한다. 실행 가능한
  어댑터가 내놓은 미검증 **작업 방식**도 대화 패널의 모드 선택기에서 따로
  「확인 안 됨」으로 표시한다. 둘을 안전 판정 완료로 뭉개지 않는다.
- 권한 판정 IPC는 `sessionId`와 요청 경로만 받는다. WebView가 `vaultRoot`를
  다시 선언해 네이티브 세션의 경계를 바꾸는 인자는 없다.
- 브라우저는 프로세스를 띄울 수 없다. `isAcpBridgeAvailable()` 이 false 이면
  화면이 왜 안 되는지와 어디서 되는지를 말한다.
- Windows 의 프로세스 트리 소유(Job Object)는 이 조각 밖이다. `taskkill /T` 로
  시도하고 실패하면 손자가 남을 수 있다.

## 근거
- src-tauri/src/acp.rs: 레지스트리 파싱, 실행기 탐지, 실행 경로 해소, 설정 격리,
  권한 판정, 프로세스 그룹 종료
- src-tauri/src/acp_doctor.rs: 여덟 검사(도구·실행기·관문·npx 캐시·앱 몫 설정·
  자격증명 링크·옛 키체인·로그인)와 수리, 앞 단계가 막히면 뒤를 「막혀 있음」으로
  닫는 선행 판정 (2026-08-20)
- src-tauri/src/managed_node.rs: Node 런타임을 앱 전용 자리에 받아 두고 **해시를
  대조한다**. 버전 고정 · 받은 뒤 SHA-256 대조 · 안 맞으면 지우고 실패 ·
  `<app-data>/runtimes/node` 밖으로는 한 바이트도 안 쓴다 (원장 89)
- src-tauri/src/lib.rs: `acp_detect_runtimes` · `acp_start` · `acp_send` ·
  `acp_stop` · `acp_permission_verdict` 다섯 command, 세션별 검증 루트 소유와
  볼트 루트 거절
- scripts/build-acp-registry.mjs: 빌드 시점 레지스트리·아이콘 스냅샷
  (`pnpm acp:registry`, `pnpm acp:registry:check`)
- src/shared/lib/tauri-acp.ts: 능력 브리지와 웹 강등 계약
- src/features/acp-session/model/mode-safety.ts ·
  src/features/acp-session/model/acp-client.ts ·
  src/features/acp-session/model/use-acp-session.ts: 모드 안전 분류, JSON-RPC
  클라이언트와 상태가 보존되는 세션 수명
- src/widgets/app-settings-menu/ui/AcpRuntimeSettings.tsx: 실행기 탐지·격리 상태 표면
  (목적지와 설정 시트가 같이 쓴다 — 소개 줄을 그릴지는 부르는 쪽이 정한다)
- src/views/agents/ui/AgentsPage.tsx: 「에이전트」 목적지 — 이 능력의 현재 사용자
  표면 (`[[elements/agents-destination]]`)
- src/views/home/ui/HomePage.tsx · src/widgets/acp-chat-panel/ui/AcpChatPanel.tsx:
  지도 옆 ACP 대화 진입점과 미검증 작업 방식 표시
- docs/DECISIONS.md 2026-08-16 ACP 도입·격리 기록과 2026-08-17 (53)·(54)·
  (56)·(57)·(58): 어댑터 안전 상태의 화면 전달, 세션 루트 권한 경계, 프로세스
  그룹 수명 판정, 현재 볼트에 유효한 MCP 서버의 단일 실행
- docs/DECISIONS.md 2026-08-20 (88)·(89)·(90): 에이전트 CLI 를 앱이 대신 깔아
  주는 조건 넷(사용자가 누른다 · 명령 원문을 먼저 보여 준다 · 앱 전용 자리 ·
  버전 고정), Node 런타임의 고정·검증·격리, 그리고 이 능력의 사용자 표면이
  설정 시트에서 「에이전트」 목적지로 옮겨 간 결정

## 확신도
medium-high (0.8): 프로토콜·프로세스 층, 설정 절, 홈의 패널 진입점과 모드 상태
전달은 코드와 컴포넌트 테스트가 받친다. 설치 앱의 실제 어댑터가 새 미검증 모드를
내놓는 장면에서 라벨·설명이 잘리지 않는지는 아직 실측하지 않았다.
