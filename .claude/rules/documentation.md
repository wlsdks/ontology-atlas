---
paths:
  - "docs/**/*.md"
  - "*.md"
  - "mcp/README.md"
  - "cli/README.md"
---

# 문서 유지 규칙

## 원칙

**문서화가 프로젝트의 생명선**이다. 코드만 고치고 문서 안 고치면 안 된다. 이 프로젝트는 AI가 계속 작업할 것이므로, 문서가 유일한 세션 간 지식 전달 매체다.

## 문서 우선순위

| 문서 | 우선도 | 언제 수정? |
|---|---|---|
| `AGENTS.md` (+ `CLAUDE.md` wrapper) | ⭐⭐⭐ | 작업 방식·규칙·주요 결정 변경 시 |
| `README.md` | ⭐⭐⭐ | 빠른 시작·커맨드·진입점 변경 시 |
| `docs/PRODUCT-DIRECTION.md` | ⭐⭐⭐ | mission 직접 변경 시 |
| `docs/FEATURES.md` | ⭐⭐ | 기능 추가·제거 시 (사용자 가시 surface) |
| `docs/ARCHITECTURE.md` | ⭐⭐ | 전체 구조·파일 배치 변경 시 |
| `docs/DESIGN-SYSTEM.md` | ⭐⭐ | 디자인 토큰·컴포넌트 규칙 변경 시 |
| `docs/DEPLOYMENT.md` | ⭐⭐ | 배포 절차 변경 시 |
| `docs/CHANGELOG.md` | ⭐⭐ | 주요 변경마다 날짜 추가 |
| `docs/ontology/*.md` | ⭐⭐ | dogfood vault — 실제 코드 구조와 정합 유지 |
| `mcp/README.md` | ⭐⭐ | MCP 도구 추가·시그니처 변경 시 |
| `.claude/rules/*` | ⭐⭐ | 규율 자체가 진화할 때 |

## 코드-문서 쌍

**표는 `.claude/rules/git.md` 로 옮겼다** — 상주 규칙이라 코드를 고치는 사람에게
실린다. 이 파일은 `.md` 를 열 때만 실려서, 짝을 빠뜨릴 사람에게는 도달하지
않았다.

## CI 가 문서에 대해 검사해도 되는 것 (2026-08-01 확정)

> **기계가 만들 수 있는 것만 검사한다. 사람이 판단해서 쓴 문장은 검사하지 않는다.**

이 저장소는 반대로 해 봤고 실패했다 — `check-package-contracts.test.mjs` 가
3,419줄 · 단언 2,126개였는데 **1,915개(90%)가 「README 에 이 문장이 있는가」**
였다. 그 핀은 두 방향으로 틀렸다: 도구 동작이 바뀌고 문서가 안 바뀌면 문장이
그대로라 **통과**하고, 문서를 더 나은 말로 고치면 **빨개진다.** 실제로 같은 날
볼트 재생성으로 사라진 노드를 인용하는 산문이 남았는데 1,915개 중 아무것도
잡지 못했다. 배경과 웹 조사 근거: `docs/DECISIONS.md` 2026-08-01.

새 문서 게이트를 만들 때는 셋 중 하나여야 한다.

| 갈래 | 형태 | 이 저장소의 것 |
|---|---|---|
| 생성 후 diff | 코드에서 표면을 **재생성**해 커밋된 산출물과 대조 | `pnpm docs:surface:check` — 실행 중인 MCP 서버에 `tools/list` 를 물어 `docs/.generated/mcp-surface.json` 을 만들고 diff. 덤으로 등록된 도구/커맨드 이름이 README 에 나오는지 본다 |
| 참조 무결성 | **대상이 실재하는가** | `pnpm docs:links` (깨진 링크 + 산문이 인용하는 파일 경로) · `assertPnpmScriptsExist` (문서의 `pnpm ...` 가 실재하는가) |
| 코드 유도 대조 | 기대값을 **코드에서 만들어** 붙인다 | enum 전수 · 공개 계약의 수 · 버전 정합 |

**하지 말 것**: 산문 한 문장을 `assert.match` 로 고정. 낡은 수를 하나씩 손으로
등재하는 금지어 사전(항목을 안 더하면 조용히 무력해지고, 더하면 사람이 계속
잡일을 한다). 볼트 노드 수를 세는 게이트(`AGENTS.md` 「no document writes the
number」와 정면 충돌 — 문서는 명령을 적는다).

**새 문서 검사는 `docs/DEVELOPMENT-CHECKS.md` 에 등재하고 `README.md` 의 명령
목록에도 넣는다.**

## 자주 하는 실수

- 구현만 하고 CHANGELOG 누락 → 리뷰 시 지적
- 설계 결정을 구두로만 기록 → 3세션 후 컨텍스트 상실
- dogfood vault 의 capability / element 슬러그가 실 파일과 drift
- **문서가 사라진 파일을 계속 인용** → `pnpm docs:links` 가 잡는다. 볼트를
  재생성하거나 문서를 옮긴 PR 에서는 반드시 돌린다

## Rule of Thumb

> "미래의 나와 AI에게 보내는 편지라고 생각하고 써라."

코드를 읽지 않고도 "이 프로젝트가 뭘 하는지, 어떻게 굴러가는지, 왜 이렇게 만들어졌는지"를 알 수 있어야 한다.
