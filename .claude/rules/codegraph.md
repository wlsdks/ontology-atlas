---
paths:
  - "src/**"
  - "app/**"
  - "mcp/**"
  - "cli/**"
  - "scripts/**"
  - "src-tauri/**"
  - "tests/**"
---

# CodeGraph — 구조 질문의 1차 도구 (클라이언트에 있으면)

> **조건부 로드** — 코드 파일을 읽을 때 실린다(위 `paths:`). 세션 시작 시점의
> 트리거 요약은 `AGENTS.md` "Code intelligence" 절(상주)이 담당하고, 이 파일은
> 그 확장판이다. **codegraph 가 없는 클라이언트는 이 규칙 전체를 조용히 무시하면
> 된다** — 모든 항목에 무도구 대안이 같은 줄에 있다. 도구는
> `colbymchenry/codegraph` 다(이름이 겹치는 남의 도구 최소 넷과 혼동 금지).
> 버전 번호로 작동하는 규칙은 없다 — 전부 상태 출력으로 판단한다.

## 이 도구가 무엇인지 — 판단의 기준이 되는 모델

- **AST 파싱 산출물이다(tree-sitter/Rust), LLM 요약이 아니다.** 결정론적이고,
  틀릴 때는 환각이 아니라 **파싱·해석 한계** 때문이다. 그래서 "의심"의 올바른
  형태는 재검증 grep 이 아니라 **경계 확인**이다: 이 질문이 심볼·호출 관계
  질문인가, 리터럴·값 질문인가.
- **아는 것**: 심볼(함수·컴포넌트·클래스·파일)과 엣지(호출·참조·import),
  심볼의 실소스, 심볼별 blast radius(호출자 + 커버링 테스트).
  **모르는 것**: 문자열/i18n 값(`messages/*.json`) · 주석 · 마크다운 · 생성물
  JSON · git 이력 · CSS 토큰 값 · **인터페이스 필드명**(실측: `touchedNodeIds`
  — `OntologyChangeset` 의 필드 — 를 query/explore 모두 못 찾았고 grep 은
  즉답했다).
- **explore 가 돌려준 소스는 그 파일을 이미 읽은 것이다**(verbatim, 줄번호
  포함 — 공식 문서 명시). 이해 목적의 재-Read·재-grep 은 토큰만 두 배 쓰는
  낭비다. 단 **Edit 하려면** 하니스 규칙상 그 파일 Read 가 따로 필요하다.

## 판단 지점 → 호출

| 순간 | codegraph 있으면 | 없으면 |
|---|---|---|
| 낯선 영역에서 작업 시작 | `codegraph_explore` 에 **정확한 심볼·파일명 묶음** | `grep -rn` + Read |
| 심볼 이름을 아직 모름 | `codegraph_search`(CLI `codegraph query`)로 이름부터, 그다음 explore | `grep -rn` |
| rename · 삭제 · 시그니처 변경 전 | `codegraph_callers`/`codegraph_impact` **+ 주석·문서용 grep 1회** — 실측: `isGatewaySurface` 를 언급한 8파일 중 4개가 주석이었고 그래프는 주석을 못 본다 | `grep -rn` 전수 |
| 테스트가 깨짐 / 무엇을 돌릴지 | CLI `codegraph affected <바뀐 파일...>` — 실측: `manual-connect.ts` 한 파일에서 그 PR 이 실제로 고쳐야 했던 테스트 7개를 그대로 지목 — 결과는 `pnpm checks:changed` 로 교차 확인(affected 는 vitest 설정을 모른다) | `pnpm checks:changed` |
| X 가 Y 에 어떻게 닿나 | 두 이름을 **함께** explore (call path 포함) | grep 으로 사슬 수동 추적 |

**질문 형태 규칙: 문장 금지, 심볼 묶음으로.** 제작자 명시 — "정확한 출력에는
정확한 입력이 필요하다".

- 나쁨: `codegraph_context("how is the gateway decided")`
- 좋음: `codegraph explore isGatewaySurface nav-destination.ts`
  → 실측 출력 한 호출: 정의 + 소비자(AppShell 3곳) + 커버링 테스트
  (`gateway-routes.contract.test.ts`)까지.

## 실패 모드 4종 — 이래서 "잘 못 쓰면 안 쓰니만 못하다"

1. **문장으로 물었다.** 증상: 질문과 무관한 심볼 잡탕이 온다(실측:
   `explore touchedNodeIds` 가 무관한 `node` 심볼들을 돌려줬다). 복구: 그
   결과를 근거로 쓰지 말 것. `codegraph query` 로 이름을 확정하고 다시 explore.
   이름이 확정 안 되면 그 질문은 codegraph 의 일이 아니다 → grep.
2. **낡은 결과를 권위 있게 믿었다.** 탐지: MCP 응답 머리의 `⚠️` staleness
   배너(뜨면 **그 파일만** Read — 나머지는 신선하고 권위 있다). 배너가 없는
   경로(CLI 단발 호출)에서는 `codegraph status` 의 **"Pending Changes:"** 절이
   확정 탐지다(실측). 위험 구간은 브랜치 대량 전환 직후. 복구: pending 파일은
   Read, 또는 `codegraph sync`(수 초).
3. **못 보는 것을 묻고 "no results" 를 "없음"으로 결론.** i18n 문구 · config
   값 · 생성물(`src/entities/docs-vault/data/*` · `public/docs-vault/**`) ·
   vault 마크다운(그건 ontology-atlas MCP 의 일이다) · 테스트 단언 문자열 ·
   testid 셀렉터. 여기서 codegraph 의 침묵은 **부재 증명이 아니다**. 복구: grep.
4. **답을 받고도 grep 으로 재확인.** 토큰 2배, 추가 근거 0. 출력이 미심쩍으면
   같은 도구로 이름을 바꿔 한 번 더 — grep 폴백은 3번 경계 질문일 때만.

## 신선도 — 배너·상태 출력으로 작동한다, 버전 고정 아님

워처 자동 동기화가 기본이다(저장 후 수백 ms~수 초 디바운스; 재연결 시 따라잡기).
수동 `codegraph sync` 는 워처가 없던 시간대(세션 밖 대량 pull, 워크트리)만.
`codegraph status` 가 엔진 버전 경고를 내면 `codegraph index` 로 재구축한다
(이 저장소 실측: 1,719 파일 ≈ 1초) — 세션 진행자가 그냥 하면 된다.

## 워크트리 (이 저장소는 상시 사용)

인덱스는 워크트리 간 공유되지 않는다(업스트림 이슈 #155). 워크트리에서 부르면
**"index belongs to a different git working tree"** 경고가 뜬다(실측 — 조용히
틀린 답을 주지는 않는다). 그 워크트리에서 쓰려면 `codegraph init .`(실측 ~4초,
`.codegraph/` 는 gitignore 됨). gitignore 된 경로에서 워처가 조용히 죽은 업스트림
보고가 있으니, `.claude/worktrees/**` 안에서는 결과가 이상하면 `codegraph status`
부터 본다.

## 텔레메트리

익명 사용 텔레메트리가 **기본 켜짐**이다(`codegraph telemetry` 로 확인;
`~/.codegraph/telemetry-queue.jsonl` 에 쌓인다). 우리 신뢰 헌장("조용한 수집 0")
은 우리 제품이 사용자에게 하는 약속이지 외부 도구에 소급되는 것은 아니지만,
상태는 알고 있어야 한다. 끄기는 `codegraph telemetry off` — **소유자 판단이며
에이전트가 말없이 바꾸지 않는다.**
