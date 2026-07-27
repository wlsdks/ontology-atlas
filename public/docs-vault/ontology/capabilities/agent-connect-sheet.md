---
slug: capabilities/agent-connect-sheet
kind: capability
title: Agent Connect Sheet (AI 에이전트 연결)
display_ko: AI 도구 연결하기
display_en: Connect Your AI Tool
domain: ai-agent-partner
elements: [src/shared/config/mcp-server-launch.ts]
---

INDEX 푸터의 에이전트 상태 클릭 → 연결 시트 (2026-07-21, P2a — 웨지 표면). 구성: ① heartbeat 파일 기반 연결 상태(조용한 수집 0 — 에이전트가 스스로 남긴 로컬 파일 읽기) ② Claude Code `.mcp.json` / Codex / generic 등록 스니펫(데스크톱 경로 자동, 웹 안내) + 데스크톱 설정 파일 자동 생성 ③ agent-brief 가 사용자의 실제 도메인 이름들을 되말하는 미리보기(이해받음의 순간 — 감정 카피 규칙: 사용자 고유 명사 원문 포함).

전략 근거: 백엔드(MCP 32도구·스킬·heartbeat)는 이미 있었고 표면의 발견가능성만 없었다. in-panel 프로세스 실행은 신규 능력이라 재스코프에서 제외.

구현: `src/widgets/agent-connect/ui/AgentConnectSheet.tsx`.

## 2026-07-27 실행 가능성 계층 (구 npm 게이트 대체)

npm 발행 계획이 폐기되면서(`docs/DECISIONS.md`) "패키지가 올라갔는가"를 묻던
게이트는 사라졌다 — 답이 영원히 아니오라서 그 뒤의 원클릭 경로가 통째로
잠들어 있었다. 지금 시트를 가르는 질문은 **"이 자리에서 서버를 띄울 방법을
아는가"**(`McpServerLaunch`)다. 설치 앱은 안다(번들 바이너리 절대 경로)이므로
client 버튼·설정 쓰기·자가 검증을 모두 연다. 브라우저는 모르므로 소스 체크아웃
안내로 정직하게 강등된다. 설정 패널과 INDEX 연결 시트가 같은 계약을 주입받아
한 표면만 거짓 `ready`로 남을 수 없다는 성질은 그대로다.

쓰기는 조용하지 않다 — 무엇을 어디에 쓸지(경로 전부 + 새로 만듦/덮어씀 +
평문이라 git diff 로 확인된다는 사실) 먼저 보여주고, 사용자가 누른 뒤에야
쓴다. 그다음 번들 서버를 스폰해 `get_concept` 까지 왕복한 결과만 초록으로
보고한다.
