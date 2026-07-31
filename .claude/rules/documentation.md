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

| 코드 변경 | 함께 수정해야 할 문서 |
|---|---|
| 새 라우트 추가 | `docs/FEATURES.md` + `docs/ARCHITECTURE.md` |
| 새 커맨드 / 스크립트 | `README.md` |
| 아키텍처 재구성 | `docs/ARCHITECTURE.md` + `AGENTS.md` |
| 디자인 토큰 추가 | `docs/DESIGN-SYSTEM.md` + `app/globals.css` |
| MCP 도구 추가·rename | `mcp/README.md` + `docs/ontology/capabilities/mcp-server.md` + dogfood README |
| 새 capability / domain / element 노드 | `docs/ontology/<kind>s/<slug>.md` (dogfood) |

## 자주 하는 실수

- 구현만 하고 CHANGELOG 누락 → 리뷰 시 지적
- 설계 결정을 구두로만 기록 → 3세션 후 컨텍스트 상실
- dogfood vault 의 capability / element 슬러그가 실 파일과 drift

## Rule of Thumb

> "미래의 나와 AI에게 보내는 편지라고 생각하고 써라."

코드를 읽지 않고도 "이 프로젝트가 뭘 하는지, 어떻게 굴러가는지, 왜 이렇게 만들어졌는지"를 알 수 있어야 한다.
