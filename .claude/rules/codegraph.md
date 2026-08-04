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
> 그 확장판이다. **codegraph 가 없는 클라이언트는 이 규칙 전체를 그냥 무시하면
> 된다** — 모든 항목에 「도구가 없을 때는 이렇게」가 같은 줄에 적혀 있다. 도구는
> `colbymchenry/codegraph` 다(이름이 같은 남의 도구가 최소 넷 있으니 헷갈리지
> 말 것). 버전 번호를 보고 판단하는 규칙은 하나도 없다 — 전부 도구가 출력하는
> 상태로 판단한다.

## 이 도구가 무엇인지 — 이걸 알아야 언제 믿을지 판단할 수 있다

- **소스 코드를 문법적으로 파싱해서 만든 색인이다(tree-sitter/Rust). LLM 이
  요약한 게 아니다.** 같은 입력이면 같은 답이 나오고, 틀릴 때는 지어내서가
  아니라 **파서가 못 읽는 부분이 있어서** 틀린다. 그래서 결과가 미심쩍을 때
  올바른 대응은 grep 으로 다시 확인하는 것이 아니라, **이 질문이 애초에 이
  도구가 답할 수 있는 질문인지** 따져 보는 것이다: 심볼과 호출 관계에 대한
  질문인가, 아니면 문자열·값에 대한 질문인가.
- **아는 것**: 심볼(함수·컴포넌트·클래스·파일)과 그들 사이의 관계(호출·참조·
  import), 심볼의 실제 소스 코드, 그리고 심볼 하나를 고쳤을 때 영향을 받는
  범위(그 심볼을 부르는 곳 + 그 심볼을 덮는 테스트).
  **모르는 것**: 문자열/i18n 값(`messages/*.json`) · 주석 · 마크다운 · 생성된
  JSON · git 이력 · CSS 토큰 값 · **인터페이스의 필드 이름**(실측: `OntologyChangeset`
  의 필드인 `touchedNodeIds` 를 query 로도 explore 로도 못 찾았고, grep 은 바로
  찾아냈다).
- **explore 가 돌려준 소스는 그 파일을 이미 읽은 것으로 친다**(원문 그대로,
  줄번호까지 — 공식 문서에 명시돼 있다). 내용을 이해하려고 그 파일을 다시 Read
  하거나 grep 하는 것은 토큰만 두 배 쓰는 낭비다. 단 그 파일을 **Edit 하려면**
  하니스 규칙상 Read 를 따로 한 번 해야 한다.

## 어떤 상황에 무엇을 부르나

| 상황 | codegraph 가 있으면 | 없으면 |
|---|---|---|
| 낯선 영역에서 작업 시작 | `codegraph_explore` 에 **정확한 심볼·파일명 묶음** | `grep -rn` + Read |
| 심볼 이름을 아직 모름 | `codegraph_search`(CLI `codegraph query`)로 이름부터, 그다음 explore | `grep -rn` |
| rename · 삭제 · 시그니처 변경 전 | `codegraph_callers`/`codegraph_impact` **+ 주석·문서용 grep 1회** — 실측: `isGatewaySurface` 를 언급한 8파일 중 4개가 주석이었고 그래프는 주석을 못 본다 | `grep -rn` 전수 |
| 테스트가 깨짐 / 무엇을 돌릴지 | CLI `codegraph affected <바뀐 파일...>` — 실측: `manual-connect.ts` 한 파일에서 그 PR 이 실제로 고쳐야 했던 테스트 7개를 그대로 지목 — 결과는 `pnpm checks:changed` 로 교차 확인(affected 는 vitest 설정을 모른다) | `pnpm checks:changed` |
| X 가 Y 에 어떻게 닿나 | 두 이름을 **함께** explore (call path 포함) | grep 으로 사슬 수동 추적 |

**질문은 문장으로 하지 말고 심볼 이름을 나열해서 한다.** 제작자가 문서에 못박아
둔 말 그대로다 — "정확한 출력에는 정확한 입력이 필요하다".

- 나쁨: `codegraph_context("how is the gateway decided")`
- 좋음: `codegraph explore isGatewaySurface nav-destination.ts`
  → 실측 출력 한 호출: 정의 + 소비자(AppShell 3곳) + 커버링 테스트
  (`gateway-routes.contract.test.ts`)까지.

## 이렇게 쓰면 안 쓰느니만 못하다 — 실패 4종

1. **문장으로 물었다.** 증상: 질문과 상관없는 심볼이 뒤섞여 돌아온다(실측:
   `explore touchedNodeIds` 가 아무 관계 없는 `node` 심볼들을 돌려줬다).
   대처: 그 결과를 근거로 쓰지 말 것. `codegraph query` 로 이름을 먼저 확정한
   다음 다시 explore 한다. 이름을 확정 못 하면 그 질문은 codegraph 가 답할
   질문이 아니다 → grep 으로 간다.
2. **오래된 결과를 그대로 믿었다.** 알아채는 법: MCP 응답 맨 위에 `⚠️` 로 뜨는
   "색인이 아직 안 따라잡았다"는 배너. 뜨면 **거기 나열된 파일만** Read 하고,
   나머지는 최신이니 그대로 믿으면 된다. 배너가 안 뜨는 경로(CLI 를 한 번만
   부를 때)에서는 `codegraph status` 의 **"Pending Changes:"** 절이 확실한
   확인 수단이다(실측). 위험한 때는 브랜치를 크게 갈아탄 직후다. 대처: 아직
   반영 안 된 파일은 Read 하거나 `codegraph sync`(수 초) 를 돌린다.
3. **이 도구가 못 보는 것을 묻고, "no results" 를 "그런 건 없다"로 결론지었다.**
   i18n 문구 · 설정 값 · 생성된 파일(`src/entities/docs-vault/data/*` ·
   `public/docs-vault/**`) · 볼트 마크다운(그건 ontology-atlas MCP 의 일이다) ·
   테스트 단언 문자열 · testid 셀렉터가 그렇다. 여기서 codegraph 가 아무것도
   못 찾은 것은 **없다는 증거가 아니다.** 대처: grep.
4. **답을 받고도 grep 으로 다시 확인했다.** 토큰만 두 배 쓰고 새로 얻는 근거는
   없다. 출력이 미심쩍으면 같은 도구에 이름만 바꿔 한 번 더 물어본다. grep 으로
   넘어가는 것은 3번처럼 도구 범위 밖 질문일 때만이다.

## 색인이 최신인지 — 버전이 아니라 배너와 상태 출력으로 판단한다

파일 감시(워처)가 저장할 때마다 알아서 색인을 갱신한다(저장 후 수백 ms~수 초
지연, 연결이 끊겼다 붙으면 밀린 것을 따라잡는다). `codegraph sync` 를 손으로
돌릴 때는 워처가 돌지 않던 시간대(세션 밖에서 크게 pull 했거나 워크트리)뿐이다.
`codegraph status` 가 엔진 버전이 안 맞는다고 경고하면 `codegraph index` 로
색인을 다시 만든다 (이 저장소 실측: 1,719 파일 ≈ 1초) — 물어볼 것 없이 그냥
하면 된다.

## 워크트리 (이 저장소는 늘 워크트리로 작업한다)

색인은 워크트리끼리 공유되지 않는다(업스트림 이슈 #155). 워크트리에서 부르면
**"index belongs to a different git working tree"** 경고가 뜬다(실측 — 아무
말 없이 틀린 답을 주지는 않는다). 그 워크트리에서 쓰려면 `codegraph init .`
을 돌린다(실측 ~4초, `.codegraph/` 는 gitignore 된다). gitignore 된 경로에서
워처가 아무 신호 없이 죽었다는 업스트림 보고가 있으니,
`.claude/worktrees/**` 안에서 결과가 이상하면 `codegraph status` 부터 본다.

## 텔레메트리

이 도구는 익명 사용 기록을 **기본으로 수집한다**(`codegraph telemetry` 로 확인;
`~/.codegraph/telemetry-queue.jsonl` 에 쌓인다). 우리 신뢰 헌장의 "조용한 수집 0"
은 **우리 제품이 우리 사용자에게 하는 약속**이지 남이 만든 도구에까지 적용되는
규칙은 아니다. 그래도 이런 상태라는 건 알고 있어야 한다. 끄는 명령은
`codegraph telemetry off` 인데, **켤지 끌지는 소유자가 정한다 — 에이전트가
말없이 바꾸지 않는다.**
