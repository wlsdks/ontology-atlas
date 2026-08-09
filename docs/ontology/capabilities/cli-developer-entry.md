---
uid: dce02204-0454-4a2d-8db3-68d669065489
slug: capabilities/cli-developer-entry
kind: capability
title: CLI Developer Entry
domain: domains/agent-integration
elements: []
path: cli/src
created_by: "agent:unknown"
dependencies: [capabilities/mcp-server]
display: CLI Developer Entry
display_ko: 터미널에서 쓰기
display_en: Terminal Commands
---

# CLI Developer Entry

앱이나 MCP 클라이언트 없이도 같은 로컬 마크다운 볼트를 검사·조회·작성하고,
에이전트 연결과 그래프 작업을 터미널에서 재현하게 하는 운영 진입점이다.

## 사용자 결과

- 개발자와 에이전트는 새 vault 생성부터 검증, 의미 조회, 관계 분석, 안전한 로컬
  체크포인트까지 하나의 명령 표면에서 수행한다.
- MCP가 연결되지 않은 환경에서도 동일한 compiler/query 결과와 복구 명령을 받아
  작업을 이어갈 수 있다.
- `--json` 출력은 자동화가 산문을 파싱하지 않고 상태·경고·다음 행동을 판단하게 한다.

## 정체성 경계

- `init`·`add`·`import`·`bootstrap`은 새 노드의 lowercase UUIDv4 `uid`를 한 번
  발급한다. list/find JSON은 `{uid, slug}`를 함께 반환한다.
- exact find는 UID와 slug를 지원하지만, 관계·경로·URL 인자는 읽을 수 있는 slug를
  유지한다.
- `validate`는 missing/invalid/duplicate primary·merged UID를 오류로 막고,
  interop export는 `urn:uuid:<uid>`를 외부 정체성으로 사용한다.

## 핵심 흐름

1. `init` 또는 기존 vault의 `agent-setup`으로 로컬 작업 좌표를 준비한다. ready는
   절대 경로의 bundled binary 또는 `node` + 절대 `mcp/src/index.js`라는 지원
   launch shape와 실제 대상 파일·vault 좌표가 모두 맞을 때만 성립하며, 퇴역한
   `npx` 설정은 review로 남긴다.
2. `validate`, `overview`, `workspace-brief`, `agent-brief`로 상태와 시작점을 읽는다.
3. `find`, `show`, graph query 명령으로 필요한 노드·경로·영향만 좁혀 본다.
4. `add` / `import` / `bootstrap`과 명시적 apply 명령으로 승인한 변경만 쓴다.
   단 `infer-imports --apply`는 차단되고 bootstrap/index도 import endpoint나 의미
   `depends_on`을 자동 작성하지 않는다. 미리보기의 선은 `imports`로 표시되며,
   import는 정확한 근거가 붙은 검토 후보이지 승인된 의존 관계가 아니다.
5. `mcp-verify`, `preflight`, `snapshot`으로 연결·영향·로컬 Git 체크포인트를 검증한다.

## 포함 / 제외

- 포함: vault scaffold/import/validate, MCP 연결 진단, deterministic graph query와
  agent handoff, repo 분석 제안, 명시적 write/apply, vault 범위 Git preflight/snapshot.
- 제외: npm 전역 배포, 원격 백엔드, 모델 실행, 자동 push, 사용자 승인 없는 의미
  생성·저장, 소스 구조 검색 도구의 대체.

## 구현 근거

- `cli/src/index.mjs` · `cli/src/lib/cli-commands.mjs` — 명령 dispatcher와 registry
- `cli/src/commands/` — 각 명령 구현
- `cli/src/lib/mcp-call.mjs` — MCP와 같은 구조화 결과를 쓰는 graph 명령 경계
- `src/shared/config/mcp-server-launch.ts` — 앱과 CLI가 공유하는 두 launch shape 판정
- `scripts/smoke-packed-cli.mjs` — 패킹된 설치 환경의 end-to-end smoke
- `cli/README.md` — 현재 명령·옵션의 상세 단일 진실원

## 확신도

high (0.95) — local/integration/packed CLI suite와 MCP parity contract가 같은 vault
규격과 결과 shape를 검증한다.
