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

## 매 iteration 이 4 렌즈로 평가 — 가장 레버리지 큰 1개를 고른다

- **강력함(powerful)** — 그래프/토폴로지/질의가 "이 코드베이스를 이해·항해·영향분석" 의 진짜 도구가 되는가. 깊이↑.
- **에이전트 연계** — MCP 루프가 더 타이트한가. 에이전트가 더 좋은 컨텍스트/핸드오프/변경리뷰를 얻는가. (B0~B3 · live 모드 위에)
- **사람 유용** — 사람이 토폴로지/insights 를 봤을 때 "아 이렇게 생겼구나" 가 즉시 오는가. 회의·온보딩에서 쓸 만한가.
- **wedge 자명성** — 제품을 처음 켠 사람이 "왜 이걸 써야 하는지" 를 1분 안에 체감하는가. (온보딩·빈상태·가치 모먼트)

그리고 **무엇을 만들든 복잡도는 줄인다** — 새 표면을 더하면 중복/덜 쓰는 표면을 걷어낸다(A1 패턴). 순증가 금지.

## 후보 방향 (루프가 탐색·우선순위화 — 고정 체크리스트 아님)

- 에이전트 변경의 "무엇을·왜" 리뷰를 더 강하게 (A/B 루프 심화: 변경 diff 의 의미·영향 요약, 에이전트가 자기 변경 근거를 vault 에 남기기).
- 토폴로지를 "코드베이스 이해" 도구로 — impact/path/blast-radius 를 토폴로지에서 직접, 한 클릭 understanding.
- Prime-agent 브리핑 품질 — 에이전트가 받는 1-paste 컨텍스트가 실제로 답을 개선하는가 (측정·강화).
- wedge 자명한 첫 모먼트 — fresh repo 에서 init→bootstrap→에이전트가 답 개선→sync 제안의 10분 루프(PRODUCT-DIRECTION 의 미완 게이트)를 제품 안에서 체감.
- 복잡도 감축 — 덜 쓰는/중복 표면 정리(허브 카드·레일·라우트), 코드 중복 entity 레이어로 통합.

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

- (아직 없음 — 첫 iteration 부터 기록)
