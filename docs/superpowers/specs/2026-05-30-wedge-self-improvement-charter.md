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
