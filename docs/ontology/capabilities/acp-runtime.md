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
---

## 정의
사용자가 이미 설치해 둔 코딩 에이전트(Claude Code, Codex 등)를 앱이 ACP(Agent
Client Protocol) v1 로 직접 띄우고, 그 세션의 설정을 격리하고, 볼트 밖 파일
접근을 사람에게 되묻는 능력. 새 API 키도 새 벤더 연동도 필요 없다: 그 도구가
이미 쓰는 구독 인증을 그대로 쓴다.

이 능력이 실제로 하는 일 여섯:

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
   `toolCall.rawInput.file_path`(절대 경로)이며, 경로를 못 찾으면 묻는다.
5. **작업 폴더 위생.** 세션의 작업 폴더는 폴더 피커가 쓰는 것과 같은 볼트 루트
   판정을 통과해야 한다. 파일시스템 루트, 홈 디렉터리 자체, OS/앱 디렉터리는
   거절한다.
6. **프로세스 트리 종료.** 자식은 자기 프로세스 그룹을 갖고, 종료는 SIGTERM 뒤
   최대 1초를 기다렸다가 SIGKILL 로 그룹 전체를 끝낸다. 어댑터가 띄운 손자까지
   같이 끝내지 않으면 앱을 꺼도 프로세스가 남는다.

## 경계
- **오늘 사용자가 쓸 수 있는 표면은 설정의 「실행기」 절 하나다.** 대화 패널
  모듈(`src/widgets/acp-chat-panel/`)은 있지만 앱 어디에서도 열리는 자리가 없다.
- **앱이 실제로 띄우는 것은 격리 표에 있는 실행기뿐이고, 오늘 그것은
  `claude-acp` 하나다.** 나머지는 목록과 상태 판정에는 나오되 띄우려 하면
  `isolation-unsupported` 로 닫힌다. codex 는 격리를 실측했다가 작업 폴더 밖
  쓰기에 권한 요청이 오지 않아 표에 넣지 않았다.
- 격리되지 않은 실행기는 화면에서 「확인 안 됨」으로 표시한다. 목록에서 빼거나
  조용히 두지 않고, 알고 고르게 한다.
- 브라우저는 프로세스를 띄울 수 없다. `isAcpBridgeAvailable()` 이 false 이면
  화면이 왜 안 되는지와 어디서 되는지를 말한다.
- Windows 의 프로세스 트리 소유(Job Object)는 이 조각 밖이다. `taskkill /T` 로
  시도하고 실패하면 손자가 남을 수 있다.

## 근거
- src-tauri/src/acp.rs: 레지스트리 파싱, 실행기 탐지, 실행 경로 해소, 설정 격리,
  권한 판정, 프로세스 그룹 종료
- src-tauri/src/lib.rs: `acp_detect_runtimes` · `acp_start` · `acp_send` ·
  `acp_stop` · `acp_permission_verdict` 다섯 command 와 볼트 루트 거절
- scripts/build-acp-registry.mjs: 빌드 시점 레지스트리·아이콘 스냅샷
  (`pnpm acp:registry`, `pnpm acp:registry:check`)
- src/shared/lib/tauri-acp.ts: 능력 브리지와 웹 강등 계약
- src/features/acp-session/model/acp-client.ts ·
  src/features/acp-session/model/use-acp-session.ts: JSON-RPC 클라이언트와 세션
  수명, 권한 응답 대기
- src/widgets/app-settings-menu/ui/AcpRuntimeSettings.tsx: 오늘 사용자가 여는
  유일한 ACP 표면
- docs/DECISIONS.md 2026-08-16 기록 둘: ACP v1 도입 범위와 설정 격리 판정

## 확신도
medium (0.7): 프로토콜·프로세스 층과 설정 절은 코드와 실측 기록이 받치지만,
대화 패널은 진입점이 없어 실사용으로 확인된 적이 없다.
