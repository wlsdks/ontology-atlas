# Wedge-Driven Self-Improvement Charter

> Date: 2026-05-30 · Branch: `self-improve` only (never main) · No npm/pnpm publish · Local-first (no backend)
> 자가개선 루프의 north star. 매 iteration 이 문서를 읽고, **wedge 를 더 날카롭게**
> 하거나 **복잡도를 줄이는** 단일 최고-레버리지 개선을 골라 구현한다.

## The wedge — "왜 이걸 써야만 하는가" (한 줄)

> **당신의 AI 코딩 에이전트는 세션마다 코드베이스를 잊는다. 이건 에이전트가 MCP로
> 직접 키우고 질의하는 git-네이티브 코드베이스 ontology 기억 — 그리고 그게 자라는
> 걸 당신은 실시간 토폴로지에서 보고, 고친다. (백엔드 0, repo 안에 사는 그래프)**

유일무이한 **4-조합** (경쟁재 중 넷 다 가진 건 없음):
1. **Agent-maintained** — 에이전트가 MCP 23 tools 로 직접 read/write·질의. (vs 수동 ontology 에디터 Protégé)
2. **Git-native** — frontmatter md = 그래프, repo 안, diff 로 리뷰·버전관리. 백엔드 0. (vs mem0류 비-git AI 메모리)
3. **Live topology** — 그래프가 곧 편집 surface, 에이전트 편집이 클릭 없이 pulse. (vs Notion/Obsidian 자유노트)
4. **Graph-DB queryable** — scan·path·reachability·impact·domain-matrix 를 로컬에서. (vs 단순 노트/위키)

wedge 를 흐리는 것(자유노트화, 백엔드 도입, 비-graph 기능, 비개발자 타겟화)은 **반대 방향**.

## ★ 심장 = 실시간 시각 성장 모먼트 (THE core)

> **틀어놓기만 해도 — 에이전트가 vault 를 고치면 온톨로지가 토폴로지로 *실시간으로
> 자라나는 게 시각적으로 보인다.* 이 모먼트가 제품의 심장이다.**

**graph DB 그 이상의 *시각적* 가치 (user, 2026-05-30):** Atlas 는 사람·에이전트
*공통의 빠른 이해(comprehension) surface.* 같은 시각 그래프가 두 청중에게:
- **사람** — Atlas 를 *보기만 해도* 코드베이스 구조·도메인·비즈니스 가치를 빠르게 판단(회의·설계 결정).
- **AI agent** — "이런 구조구나·이런 의미구나" 를 빠르게 인식해 *더 정확히·더 잘* 코딩(MCP 로 같은 그래프 질의).

즉 시각 표현의 목표는 *예쁨* 만이 아니라 **의미·구조를 한눈에 전달**하는 것. 시각 인코딩(kind/domain/관계/허브/변경)이 *읽히지* 않으면 실패.

그래서 두 가지가 *최우선* 이다 (다른 모든 렌즈보다 위):
- **(A) 시각적 아름다움** — 이 모먼트가 *예뻐야* 한다. Linear-grade 폴리시. 노드 등장·pulse·전환이 우아하게(디자인 헌장 내: 무채색+인디고, glow/neon/scale-hover 금지 — 부드러운 opacity/border/위치 ease 로). 빈 상태→자라는 상태의 미학.
- **(B) 실시간 성능 (렉 0)** — 틀어놓고 보는데 끊기면 끝이다. 60fps 유지, 대형 vault 에서도. **현재 렉 근원: 변경마다 `buildLocalManifest`(전체 FS walk) + `buildGraph`(전체 그래프 재빌드).** north-star = **증분 업데이트**(변경 파일/노드만 patch, 전체 재스캔·재빌드·재레이아웃 회피 — Tauri 워처는 이미 변경 경로 emit, diff toaster 는 mtime diff 보유 → 재료 있음). 폴링 주기·debounce·Sigma render budget·좌표 보존도 이 축.

## 그다음 렌즈 (위 A·B 다음, 레버리지 순)

- **강력함(powerful)** — 그래프/토폴로지/질의가 "이 코드베이스를 이해·항해·영향분석" 의 진짜 도구가 되는가. 깊이↑.
- **에이전트 연계** — MCP 루프가 더 타이트한가. 에이전트가 더 좋은 컨텍스트/핸드오프/변경리뷰를 얻는가. (B0~B3 · live 모드 위에)
- **사람 유용** — 사람이 토폴로지/insights 를 봤을 때 "아 이렇게 생겼구나" 가 즉시 오는가.
- **wedge 자명성** — 처음 켠 사람이 "왜 이걸 써야 하는지" 를 1분 안에 체감하는가. (특히 위 실시간 성장 모먼트로)

그리고 **무엇을 만들든 복잡도는 줄인다** — 새 표면을 더하면 중복/덜 쓰는 표면을 걷어낸다(A1 패턴). 순증가 금지. 성능 최적화도 *코드를 더 복잡하게* 만들지 않는 선에서(증분 경로가 전체-재빌드 경로와 *공존*하며 단순함을 해치면 재고).

## 후보 방향 (루프가 탐색·우선순위화 — 고정 체크리스트 아님)

**★ 시각·성능 (최우선):**
- **증분 그래프 업데이트** — vault-changed 시 전체 buildLocalManifest+buildGraph 대신 변경 노드/엣지만 patch. 큰 단계 → 측정(대형 vault 재빌드 시간 벤치, scripts/perf-* 활용) → 변경파일만 manifest 갱신 → graph add/drop/merge node. 좌표 보존.
- **자라나는 애니메이션의 미학** — 새 노드 등장 시 부드러운 fade/ease-in(헌장 내), pulse 전환 매끄럽게, prefers-reduced-motion 존중.
- **Sigma render 최적화** — 대형 그래프 FPS(LOD·culling·label budget), 폴링/debounce 튜닝, 좌표 안정.
- **시각 폴리시** — 토폴로지·live indicator·노드/엣지 톤·전환의 Linear-grade 다듬기(디자인 헌장).

**그다음:**
- 에이전트 변경 "무엇을·왜" 리뷰 심화 (A/B 루프: 변경 diff 의미·영향 요약, 에이전트가 근거를 vault 에 남기기).
- 토폴로지를 이해 도구로 — impact/path/blast-radius 한 클릭 understanding.
- Prime-agent 브리핑 품질, wedge 자명한 첫 모먼트(10분 루프), 복잡도 감축(중복 표면·코드 통합).

## 절차 (매 iteration)

1. `git branch --show-current` = self-improve 아니면 즉시 중단·보고. main commit/push 금지.
2. 이 charter + 최근 커밋 읽고 → 4렌즈로 **단일 최고-레버리지 개선** 1개 선정. codegraph 로 통합 지점 매핑(grep 루프 금지).
3. TDD: 실패 테스트 → 구현 → 검증(tsc · lint · test:run 관련범위 · i18n en·ko · vault). UI 는 chrome-devtools 로 콘솔 0 + 실제 동작. Tauri Rust 는 cargo check/test.
4. self-improve 커밋(conventional + 한국어 본문 + Co-Authored-By). `--no-verify`·publish 금지.
5. 새 capability/element/domain → dogfood vault + docs 동기화.

## 가드 / surface 조건 (멈추고 사용자에게 물을 것)

- 되돌릴 수 없는/파괴적 변경(라우트 삭제, 데이터 마이그레이션), 백엔드·인증 도입 유혹, 디자인 헌장 위반(glow/neon/2채색), wedge 와 무관한 큰 기능.
- 제품 방향이 모호한 갈림길(예: 비개발자 타겟화 여부) — 추측 말고 surface.
- 그 외엔 무중단 연속. 너무 빨리 끝내지 말 것(한 iteration = 의미있는 개선 1개, 검증+커밋). 끝에 무엇을·왜 짧게 보고.

## 진행 로그 (루프가 append)

- **iter 1 (perf baseline):** `deriveOntologyFromVault` 에 live-update perf 회귀 가드 추가(`derive-ontology-from-vault.perf.test.ts`). **발견: derive 는 싸다 — 611 docs → 611 nodes/edges 를 ~6ms (jsdom).** 즉 "틀어놓고 보는" 렉의 병목은 derive 가 *아니라* (a) `buildLocalManifest` 전체 FS walk(브라우저 I/O) + (b) `buildGraph`/Sigma render. → **증분 업데이트는 FS-walk + graph-build/render 를 타겟**(derive 재실행은 저렴하니 후순위). 다음 iteration: buildGraph 재빌드 비용 측정 또는 변경파일-only manifest 재읽기.
- **iter 14 (사람유용 — hover 에 소유 domain, 일관성 완성):** 렌즈 = *비즈니스 영역(domain) at a glance*. iter 9 가 hover tooltip 의 ontology 노드 domain 을 `''` 로 비웠는데(garbage 조각 차단), project 노드는 domain 을 보여줘 *불일치* — ontology 노드는 hover 에서 kind+degree 만, 비즈니스 영역 안 보임. → 소유 domain 을 graph in-neighbor(kind:domain)에서 derive 해 채움(`resolveOwnerDomainLabel`). 이제 hover = "CAPABILITY · MODE-AWARE ADAPTERS · 14 links" (kind+domain+degree), project 노드와 일관. **버그 발견·정정:** domain 노드가 inter-domain coupling 엣지를 owner 로 오인(브라우저서 "DOMAIN · AI AGENT PARTNER" 관찰) → resolver 가 domain 노드엔 null 반환하게 self-guard + regression test. 검증: owner-domain pure 5 test(capability→owner · domain→null · domain+domain-in-neighbor→null · element→null · unknown→null) · tsc · lint(0) · 토폴로지 widget 165 test · 브라우저(fix 前 hover 동작·버그 관찰 — chrome-devtools MCP 가 iter 중 끊겨 fix 후 재확인은 단위+가드로 커버). dogfood: `topology-sigma-render` 동기화. 다음 후보: 또 다른 surface 또는 consolidation.
- **iter 13 (에이전트 연계/사람유용 — 변경 패널 silent-cap 해소):** 렌즈 = *A/B 변경 리뷰 루프* (에이전트가 vault 키우면 사람이 리뷰). `/ontology` 변경 패널이 added/changed/removed 칩을 kind 별 `slice(0,24)` 로 *조용히* 잘랐다 — 에이전트 bulk 변경(bootstrap/대량 add)이면 칩 리스트가 완전해 보이지만 아님(summary 총계는 보이나 칩 목록엔 잘림 표시 없음). 프로젝트엔 이미 "silent cap 해소" 패턴(insights 허브 패널, CHANGELOG 2026-05-29) + charter "no silent caps" 원칙 존재. → kind 별 24개 초과 시 "+N 더" chip 노출(`MAX_CHANGE_CHIPS` 상수화). 다른 surface(변경 패널, tree view — 12 iter 중 처음). 검증: OntologyChangePanel component test 2 case 추가(>24 → +N · ≤24 → 없음) · tsc · lint(0) · i18n en/ko parity · 브라우저(/ontology 변경 패널 렌더, 콘솔 0). dogfood: `changes-only-review` 동기화. 다음 후보: graph-DB 도구 또는 또 다른 surface.
- **iter 12 (B 실시간 성능 — 좌표 보존, charter #1 north-star):** 렌즈 = *증분/좌표 보존* (charter 최우선 B). **iter 8 재검토로 viable 판명:** worker-layout-controller 가 그래프의 *현재* x/y 로 worker 를 seed(line 22)하고, 224노드 dogfood 는 autoStart=false(>120)라 worker 가 static — 즉 rebuild 시 reflow 는 `settleLayout` 재실행에서 오고, 보존 좌표가 그대로 worker/렌더러의 출발점이 된다. iter 8 의 "worker 가 덮어쓴다" 결론은 틀렸음. → graph rebuild 시 `useLayoutEffect`(paint 전, renderer useEffect 보다 먼저)가 직전 build 좌표를 복원(`restoreNodeCoords`) → 기존 노드 제자리, 새 노드만 settle 위치 → 전체 reflow 없이 "새 노드 돋아남" 또렷(wedge 심장 가독성). **React Compiler 와 안 싸우게:** memo 는 순수 유지(ref/localStorage 미접근), 좌표 보존·드래그 적용은 모두 layoutEffect 에서 imperative(`preserve-manual-memoization` warning 회피 — 처음엔 memo 안에서 ref 써서 9 warning 났다가 layoutEffect 로 이동). pure helper `coord-preservation.ts`(snapshot/restore). 검증: helper 6 unit test · tsc · lint(warning 0) · 토폴로지 widget 160 test · 초기 로드 정상(빈 캐시 복원=no-op, 224노드 동일 레이아웃, 콘솔 0). **한계:** 라이브 rebuild 의 무-reflow 시각은 headless 트리거 불가 — 메커니즘(layoutEffect 순서 + worker seed)은 구조적으로 sound + restore 단위 증명. dogfood: `vault-live-updates` 동기화(element + 본문). 다음 후보: tree(/ontology) surface 또는 graph-DB 도구.
- **iter 11 (강력함 — drawer 관계 행 클릭 = 그래프 탐색):** 렌즈 = *graph-DB 를 클릭으로 탐색* (display 가 아닌 navigation — 새 aspect). 발견: drawer 의 관계 미리보기 행이 상대 노드 title 을 **클릭 불가 텍스트**로만 보여줬다. 볼 수는 있어도 거기로 *이동* 못 함. → 행을 button 으로(상대 노드 존재 + onSelectNode 주입 시), 클릭 시 `handleSelect(other.id)` → 토폴로지 선택·focus + drawer 가 그 노드로 교체. 연결을 클릭하며 그래프를 탐색하는 루프 완성. 다른 aspect(navigation, iter 9/10 은 comprehension display). **재사용:** 기존 handleSelect(Sigma 클릭과 동일 경로). 새 상태 0. 검증: drawer component test(관계 행 클릭 → onSelectNode(id)) · tsc · lint(0) · home 93 test · 브라우저 end-to-end(/topology mcp-server → 관계 "mcp/scripts/json-rpc-lines.mjs" 클릭 → URL `?p=element:...&mode=focus` + drawer 가 그 노드로 교체, 콘솔 0). dogfood: `topology-ontology-inspection` body 동기화. 다음 후보: graph-DB 도구 시각화 또는 tree(/ontology) surface.
- **iter 10 (사람유용 — drawer read-only 모드에 소유 domain context):** 렌즈 = *비즈니스 영역(domain) at a glance* (wedge "사람은 atlas 보면서 비즈니스 가치 빠르게 정한다"). 발견한 gap: 노드 drawer 가 domain 을 **writable vault 일 때만**(domainEdit 인풋) 보여줬다 — read-only(예: dogfood /topology, 로컬 vault 미선택)면 노드의 소유 domain 이 *아예 안 보였다*. → drawer model 에 `ownerDomain`(incoming domain-kind 엣지로 derive) 추가 + read-only 일 때 "Domain: X" 노출(writable 이면 기존 인풋 유지). 다른 surface(drawer, iter9 는 tooltip) · 다른 aspect(domain context, iter3/4 는 blast radius). **재사용:** 기존 model nodes+edges, 새 graph 없음. 검증: drawer model test 2 case(domain-kind 엣지 resolve · domain 노드는 null) · tsc · lint(0) · i18n en/ko · home 92 test · 브라우저(/topology mcp-server drawer → "DOMAIN · AI Agent Partner" read-only 렌더, 콘솔 0). dogfood: `topology-ontology-inspection` body 동기화. 다음 후보: graph-DB 도구(components/topological-order 시각화) 또는 또 다른 surface.
- **iter 9 (사람유용 + 버그픽스 — hover tooltip 에 kind, garbage domain 정정):** 렌즈 = *hover 한 손동작 comprehension* (가장 빈번한 touch). 발견한 버그: ontology 노드 hover 시 `SigmaNodeTooltip` 의 domain 라벨이 project 용 `extractDomainLabel('capabilities/mcp-server')` 를 거쳐 `'capabilities/mcp'` 같은 **조각**을 보여줬다(slug split('-')[0]). + kind(capability/domain/element — iter2 색 범례의 1차 분류)는 텍스트로 아예 없었다. → ontology 노드(`isOntology`)는 domain 자리를 비우고 `ontologyTopKind`(attrs 에 이미 존재, 주석상 "tooltip 표시용" 인데 미배선이었음) + `useOntologyKindLabel`(iter2) 로 kind chip 노출. project 노드는 기존 domain 라벨 유지. **재사용:** 기존 attrs.ontologyTopKind + iter2 라벨 훅, 새 i18n 0. 검증: SigmaNodeTooltip 신규 component test 4 case(kind 노출 / garbage domain 회귀 가드 / project domain) · tsc · lint(0) · 토폴로지 widget 155 test · **브라우저 end-to-end**(hover 합성 트리거 → "Ontology Core · DOMAIN · 12 links", garbage 없음, 콘솔 0). dogfood: `topology-sigma-render` body 동기화. 다음 후보: 실제 domain frontmatter 를 ext 노드 attrs 로 thread(완전 정보) 또는 graph-DB 도구.
- **iter 8 (복잡도 감축 — 런타임 indigo single-source 정합):** 렌즈 = *복잡도↓ / 디자인 single-source*. 7 feature iter 후 A1 패턴(순증가 대신 정합). `indigo-tokens.ts` 의 `indigoRgba()` 는 "Sigma WebGL / Canvas 등 CSS var 안 닿는 런타임 사이트" 를 위해 존재하는데, 정작 그 사이트들(SigmaTopology reducer 5곳 — focus/path/impact/hover edge 색 · SigmaMinimap SVG 3곳)이 `'rgba(139,151,255,X)'` 를 *하드코딩* 해 추상화를 우회하고 있었다(디자인 헌장 "hardcoded hex 금지" 위반 + drift 위험). → `indigoRgba('highlight', X)` 로 통일. **순증가 0**(새 표면 없음, 기존 추상화를 그 목적 사이트에서 실제 사용). Tailwind arbitrary-value 사이트는 정책상 의도적 하드코딩이라 제외. 검증: 등가성 *증명*(token 출력 === 기존 literal, node 로 확인) · tsc · lint(0) · 토폴로지 widget 151 test · 브라우저(/topology mcp-server focus — 색 동일 렌더, 콘솔 0). vault/i18n 무변경(순수 refactor). 다음 후보: 사람유용(hover tooltip kind+degree) 또는 graph-DB 도구.
- **iter 7 (A 시각적 아름다움 — 새 노드 grow-in entrance):** 렌즈 = *charter #1 = 심장*(온톨로지가 토폴로지로 *자라나는 게 시각적으로 보인다*). 라이브로 추가된 노드가 그냥 pop 하던 걸 → size 0 근처→full ease-out 으로 *자라나게*. 탐색 결론: wedge-자명성(landing)은 이미 wedge 를 잘 전달(openSource 패널 "agents keep forgetting... markdown frontmatter inside your repo... share one memory"), reduced-motion 도 이미 pulse tick 에서 존중 → 둘 다 gap 아님. 그래서 charter #1(A) 로. **구현:** 순수 `entranceSizeFactor`(`reducer-entrance.ts`, ease-out, reduceMotion/age≥duration→1) + `firstSeenRef`(slug→등장 시각, 첫 build 는 `now-duration` 으로 seed 해 로드 시 일괄 애니메이션 X) + 전역 `enteringUntilRef` 가드(평상시 per-node 비용 0, 등장 후 NODE_ENTRANCE_MS 만 동작) + tick 에 hasEntering 조건. position 은 worker, size 만 reducer 에서 — 충돌 0. 복잡도: hot-path 추가는 전역 가드로 transient, 곡선은 순수 모듈로 분리(테스트 가능). 검증: entrance 6 unit test(reduceMotion/clamp/단조/ease-out) · tsc · lint(0) · 토폴로지 widget 151 test · 초기 로드 정상(seed 작동 — 224 노드 full size, mass-animation 없음) · 콘솔 0. **검증 한계:** 라이브 노드-추가 grow-in 시각은 headless 트리거 불가 — 메커니즘(곡선+seed)은 단위로, 로드는 스크린샷으로 커버. dogfood: `vault-live-updates` 에 grow-in row + element + 본문 동기화. 다음 후보: 복잡도 감축(누적 중복 통합) 또는 graph-DB 비-blast-radius 도구(cycles 등).
- **iter 6 (에이전트 연계 — SessionStart 첫 인상에 hub):** 렌즈 = *agent 의 message #1 구조 인식* (wedge #1 차별점 = agent-maintained). SessionStart hook 이 vault census + **알파벳 첫 8개** 노드를 inject 했는데 — 알파벳순은 노이즈, agent 가 "이 코드베이스의 중요한 개념" 을 못 잡는다. → hook 의 CLI 호출을 `list`→`overview` 로 바꿔 한 번에 census + **domain 분포** + **degree 상위 hub 6개**(load-bearing 개념) 를 inject. agent 가 첫 순간부터 cli-developer-entry(deg 91)·views(88)·mcp-server·vault-local-first 등 *핵심 구조* 를 인지. `.claude` + `.codex` 양쪽 동일 적용(2 comment line 빼고 identical 유지). 복잡도: list→overview 는 *교체*(순증 0), 한 CLI 호출로 더 풍부. 검증: 양 hook end-to-end 실행(hub deg 정상 렌더 확인 — f-string `{x,0}` 콤마버그 → `or 0` 수정), `scripts/claude-hooks.test.mjs` 3 pass, vault clean(64), 기존 출력 assert 하는 test 없음 확인. docs: FEATURES.md + dogfood `session-start-ontology-context` body 동기화. 다음 후보: (A) 자라나는 노드 entrance 미학, 또는 wedge-자명성(첫 실행 화면).
- **iter 5 (강력함+사람유용 — blast radius 를 *공간적으로*):** 렌즈 = *graph DB 그 이상의 시각적 가치* (wedge 본질). iter 3/4 가 blast radius 를 *숫자* 로 노출했지만, "어느 노드들이 영향받나" 는 그래프에서 안 보였다. → drawer 에 "지도에서 영향 보기(Show impact on map)" 토글 추가 → 선택 노드의 전이 affected set 을 토폴로지에서 인디고로 띄우고 나머지 deep dim. graph-DB reachability 질의가 *부분그래프 형태* 로 읽힌다. **기존 `applyContextDimOverlay` set-dim 메커니즘 재사용**(search/path 와 같은 경로) — `impactNodes` 분기 1개 추가(node+edge reducer). 토글 state 는 *어느 노드에 켜졌는지* 로 둬(`impactNodeSlug`) selection 바뀌면 derived active 자동 false — setState-in-effect(cascading render) 회피. **탐색 발견:** B(실시간 성능)는 이미 성숙 — idle poll 은 fingerprint 비교로 rebuild skip(stable manifest ref), 라이브 레이아웃은 Web Worker(연속 FA2), buildGraph 는 O(P·D) 최적화됨. 남은 B = 증분 레이아웃(워커 lifecycle 과 좌표 보존 조율) = 아키텍처 다단계 항목(단일 iteration 부적합). 검증: reducer-context-dim 15 test(impact 분기 4 case 포함)·tsc·lint(warning 0)·home+widget 235 test·i18n en/ko·vault clean·브라우저(/topology mcp-server "Show impact on map" → affected 부분그래프 인디고 강조 + 나머지 dim, 토글 aria-pressed, 콘솔 0). dogfood: `topology-ontology-inspection` body 확장. 다음 후보: (A) 자라나는 노드 entrance 미학, 또는 wedge-자명성(첫 실행).
- **iter 4 (에이전트 연계 — brief 에 전이 blast radius):** 렌즈 = *agent handoff 품질* (wedge #1 차별점 = agent-maintained + graph-DB queryable). iter 3 가 *사람* drawer 에 전이 reach 를 노출했지만, 에이전트의 1차 아티팩트인 collaborator **brief**(copyable 핸드오프/prime 텍스트)의 "Change impact" 섹션은 여전히 1-hop degree 만 담아, 에이전트가 "이거 바꿔도 안전한가" 를 과소평가된 수로 판단. → brief "Change impact" 에 "Blast radius (transitive): Affected N, Depends on M" 한 줄 추가. **iter 3 의 `model.reach` + drawer reach 라벨 재사용 — 새 i18n 키 0, 새 traversal 0**(complexity↓). TDD(brief exact-string test 에 라인 추가) → 검증: tsc·lint·home 90 test·i18n parity·vault clean(64)·브라우저(/topology mcp-server "Copy brief" 클릭 → 복사된 텍스트에 "Blast radius (transitive): Affected 25, Depends on 220" 실제 포함, 콘솔 0). dogfood sync: `capabilities/collaborator-reader-brief` body 확장(노드 순증 0). 사람(iter3)·에이전트(iter4) 두 청중 모두 같은 graph-DB 영향 수를 받음. 다음 후보: (A) 자라나는 노드 entrance 미학 또는 (B) buildGraph 재빌드 비용 측정.
- **iter 3 (강력함+사람유용+에이전트 — 전이 blast radius):** 렌즈 = *graph-DB 질의를 시각적으로*. 노드 drawer 의 "change impact" 가 1-hop degree(`incomingCount`/`outgoingCount`)만 보여줘 *진짜* 변경 영향을 과소평가했다(예: mcp-server 직접 dependent 8 → 전이 25). → drawer model 에 `reach: {dependents, dependencies}` 추가(전이 closure). **기존 `buildOntologyReachability` 엔진 재사용 — 새 BFS 코드 0**(incoming=blast radius, CLI `blast-radius --direction incoming` 와 동일 방향; depth=노드수로 full closure, limit:1 로 할당 최소화, 사이클 안전). drawer Relations 섹션에 "변경 영향 범위(전이) — Affected N · Depends on M" 노출(Affected 가 hero, signature weight). 효과: 사람은 "이거 바꾸면 N개 영향" 한눈에, 에이전트는 같은 model 값 접근 — graph DB 그 이상의 시각적 가치. TDD(전이>직접 증명 + 사이클 유한성) → 검증: tsc·lint·i18n en/ko·home 90 test·vault clean·브라우저(/topology mcp-server drawer "Affected: 25 · Depends on: 220", 콘솔 0). dogfood sync: `capabilities/topology-ontology-inspection` body 확장(노드 순증 0). 다음 후보: collaborator brief 에도 reach 노출(agent brief 품질), 또는 증분 graph 업데이트 측정.
- **iter 2 (comprehension — kind 범례):** 렌즈 = *사람 유용/시각 인코딩 읽힘*. 토폴로지 노드 border 색이 kind(domain 블루그레이 / capability 인디고 / element 틸그레이 / unknown amber)를 인코딩하는데 **그 의미를 설명하는 범례가 없었다** — audit(stale/orphan/promotion) 범례만 health 모드에 존재. → SigmaTopology 에 compact "What the colors mean" 범례 추가(bottom-left, `!minimal && !auditHighlight` — audit 범례와 *상호배타*라 clutter 순증 0). 색은 `ontologyBorderTone` **단일 소스 재사용**(graph-build 와 동일 — drift 0), 라벨은 `useOntologyKindLabel` + i18n `kindLegendTitle`/`kindLegendUnknown`(en·ko). 검증: tsc·lint·i18n·widget 141 test·브라우저(/topology 224노드, 범례 4행 렌더, 콘솔 0). 효과: 사람이 Atlas 첫인상에서 색→구조 의미를 즉시 해독(wedge "보기만 해도 구조 파악"). 다음 후보: 증분 graph 업데이트 측정 또는 자라나는 애니메이션 미학.
