# Ontology-first / Topology-as-ontology 재구성 — Design Spec

> Date: 2026-05-30 · Branch: `self-improve` only (never main) · No npm/pnpm publish
> Status: design approved (direction), implementing slice-by-slice via 15-min loop

## One line

> **온톨로지가 우선이고, 토폴로지가 곧 그 온톨로지의 1차 표현이자 편집 surface다. 문서는 노드에 매인 설명(부가물)이지, 자유 노트가 아니다.**

User's words (verbatim intent):
- "온톨로지를 토폴로지로 표현하는 게 더 좋지 않을까? (빌더라는 것 자체가 더 어려운 느낌)"
- "온톨로지가 우선이고 그 부가로 문서가 붙고, 그 문서를 문서탭에서 설명으로 사람이나 에이전트가 보충. 그냥 옵시디언처럼 아무거나 적는 문서 서비스가 아니다."
- "디자인은 디자인 시스템 기반, 이미 토폴로지가 되어있으니 기능만 잘하면 될 듯."

## Why (이건 pivot 이 아니라 drift 교정)

`docs/PRODUCT-DIRECTION.md` 가 이미 ontology-first 를 결정함:
- "Spine = .md 의 ontology. Topology / tree / builder 은 그 spine 의 *views*" (line 25)
- "Decision 1 — Direction A (ontology-first)" (line 75)
- Old mission(prose-first, "AI extracts") → 폐기. Current = "ontology substrate, 문서는 그 위" (line 456–465)

즉 방향은 이미 헌장에 있는데 **구현(빌더 분리 + 토폴로지 read-only + /docs 자유편집)이 거기서 새어나간 상태.** 이 spec 은 구현을 헌장으로 되돌린다.

## Current state (재사용 대상)

- `/topology` — Sigma WebGL spatial network. 노드 클릭 → drawer(주로 *읽기*). `src/widgets/topology-map-sigma`, `src/views/home`.
- `/ontology` — tree + ego graph (browse). `src/views/ontology-view`.
- `/ontology/edit` — xyflow ERD "빌더". 드래그로 조립 → vault md export. RelationWriteConfirm + builder-vault-write(mode-aware). ← "이상하게 조립"의 정체.
- `/docs` — vault picker/editor (markdown 본문 자유 편집). `src/views/docs-vault`, `src/widgets/docs-vault`.
- vault frontmatter = 진실원. MCP 23 tools + CLI 가 같은 vault 를 read/write.

## Target IA

1. **Topology = 1차 온톨로지 surface (보기 + 편집).** Sigma 그래프 위에서 노드 선택→인라인 편집, 노드 생성, 드래그로 관계 생성. 모두 vault md 로 write (빌더의 write/confirm 로직 재사용). 별도 xyflow 빌더는 "고급 캔버스"로 강등(또는 흡수).
2. **Ontology-first authoring.** 작성은 그래프에서 시작. 노드를 만들면 → 설명(prose 본문)이 따라 붙는다.
3. **문서 = 노드 설명 (부가).** `/docs` 는 온톨로지 노드의 *설명* 을 사람/에이전트가 보충하는 곳. 자유 노트 아님 — 항상 노드에 스코프.
4. **디자인 재사용.** 디자인 시스템 + 기존 토폴로지 그대로. 기능에 집중. 신규 비주얼/금지패턴(glow 등) 없음.

## Approach: A (점진 in-place) — 추천

- A: 기존 Sigma 토폴로지에 편집 어포던스 추가, 빌더 vault-write/relation-confirm 재사용, 빌더 강등, 문서탭=노드 설명. **위험 낮음, 재사용 최대.** ← 채택
- B: xyflow 완전 제거, 편집 전부 토폴로지로. (relation-write-confirm 재현 비용)
- C: Sigma+xyflow 단일 편집 캔버스 통합. (최고 비용)

## Phased slices (additive-first · 파괴적 단계는 사전 승인)

각 슬라이스 = 한 루프 iteration의 단위. 슬라이스 시작 전 codegraph 로 정확한 통합 지점 매핑.

- **S1 — 토폴로지 인라인 편집.** 노드 선택 → kind/domain/summary 편집 → vault md write (builder-vault-write 재사용). 읽기 drawer 를 편집 가능으로.
- **S2 — 토폴로지 노드 생성.** 그래프에서 새 노드 추가 → add_concept 와 같은 schema 로 vault md.
- **S3 — 토폴로지 관계 생성.** 두 노드 드래그 연결 → RelationWriteConfirm 재사용 → vault md.
- **S4 — 문서탭 = 노드 설명.** `/docs` 를 노드 본문(설명) 편집으로 재구성, 온톨로지 스코프. 자유 노트 성격 약화.
- **S5 — 빌더 강등/흡수 (⚠️ 파괴적, 사용자 승인 필수).** `/ontology/edit` 를 "고급 캔버스"로 강등하거나 핵심 흐름을 토폴로지로 흡수. 라우트/문서 영향 → 반드시 사전 확인.
- **S6 — ontology-first 빈 상태/온보딩.** 첫 노드를 문서가 아니라 토폴로지에서 만들도록.

## Verification (슬라이스마다)

`pnpm exec tsc --noEmit` · `pnpm lint` (FSD 경계) · `pnpm test:run` (관련 범위 우선, TDD) · `pnpm test:i18n:messages` (en·ko, UI 카피 변경 시) · `pnpm vault:validate` (vault 변경 시) · 브라우저 런타임 확인(콘솔 0 에러, 실제 동작). 새 capability 는 dogfood vault + docs 동기화.

## Risks / 사용자 승인 필요

- **S5(빌더 강등/제거)** = 출시된 라우트/문서를 건드림 → 반드시 사전 확인.
- 토폴로지 직접 편집의 vault-write 경합(동시 사람/에이전트 편집) → expected_mtime 가드 패턴 유지.
- FSD 경계: 토폴로지 위젯이 빌더의 write 로직을 직접 import 못 함 → 공용 write 로직을 shared/entities 로 끌어내리는 소규모 리팩터 필요할 수 있음(현재 위치 먼저 확인).
- 정적 export 제약 유지 (server action 금지).

## Out of scope (별도 쓰레드)

- **Live agent-activity 모드** (자동 baseline + ambient indicator + Tauri 파일워처) — 설계 완료, 별도 구현 예정.
- **T3 live glow** — 디자인 헌장(forbidden: glow/neon) 결정 사항. 헌장 유지(은은한 인디고 ring/밝기) vs 진화(먼저 forbidden.md 갱신). 사용자 결정 대기.
