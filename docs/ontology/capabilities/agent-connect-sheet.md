---
slug: capabilities/agent-connect-sheet
kind: capability
title: Agent Connect Sheet (AI 에이전트 연결)
display_ko: AI 도구 연결하기
display_en: Connect Your AI Tool
domain: ai-agent-partner
elements: [src/shared/config/agent-package-distribution.ts]
---

INDEX 푸터의 에이전트 상태 클릭 → 연결 시트 (2026-07-21, P2a — 웨지 표면). 구성: ① heartbeat 파일 기반 연결 상태(조용한 수집 0 — 에이전트가 스스로 남긴 로컬 파일 읽기) ② Claude Code `.mcp.json` / Codex / generic 등록 스니펫(데스크톱 경로 자동, 웹 안내) + 데스크톱 설정 파일 자동 생성 ③ agent-brief 가 사용자의 실제 도메인 이름들을 되말하는 미리보기(이해받음의 순간 — 감정 카피 규칙: 사용자 고유 명사 원문 포함).

전략 근거: 백엔드(MCP 32도구·스킬·heartbeat)는 이미 있었고 표면의 발견가능성만 없었다. in-panel 프로세스 실행은 신규 능력이라 재스코프에서 제외.

구현: `src/widgets/agent-connect/ui/AgentConnectSheet.tsx`.

## 2026-07-27 배포 가능성 주의 계층

공개 `ontology-atlas`와 `ontology-atlas-mcp` 패키지가 npm E404이면 연결
시트는 네 client 버튼, restart, connection check, 고급 `npx` 복사를
보여주지 않는다. 공용 `AgentClientButtons`가 확인일·패키지명·source
checkout 가이드를 담은 warning gate 하나를 주의 승자로 렌더한다. 설치 앱
설정 패널과 INDEX 연결 시트가 같은 `AgentPackageDistribution` 계약을
주입받으므로 한 표면만 거짓 `ready`로 남을 수 없다.

Codex Computer Use 설치 앱 proof는 한국어 설정 화면에서 `사용 불가`,
`npm E404`, `소스 체크아웃 설정 보기`를 읽었고 후속 연결 제어가 0개임을
확인했다.
