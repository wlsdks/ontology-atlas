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
  - *통합 매핑 (codegraph, 2026-05-30):* 빌더 저장 경로 = `src/views/ontology-edit/ui/OntologyEditPage.tsx` `saveEphemeral` → `slugify(title)` → `${kind}s/${slug}.md` → `buildVaultMarkdown` → 로컬 vault write(`useLocalVault()` = `src/features/docs-vault-local`, views/home 가 import 가능 — FSD OK). 그러나 `buildVaultMarkdown`/`slugify` 는 `src/views/ontology-edit/lib` (다른 view) → cross-view import 금지.
  - **S1.0 (groundwork, 비파괴):** `buildVaultMarkdown` + `slugify` + frontmatter 직렬화를 shared 레이어(`src/entities/docs-vault/lib` 또는 `src/shared/lib`)로 추출. 빌더는 그 위치에서 import (동작 무변). 단위/contract test 로 drift 차단. ← 토폴로지 재사용 unblock.
  - **S1.1:** 토폴로지 drawer(`src/views/home/ui/TopologyOntologyDrawer.tsx`)에 편집 어포던스 추가 → `useLocalVault()` 저장 + S1.0 의 공용 직렬화 사용. 빈이름/`isUntitledTitle` 가드 + 동시편집(expected_mtime) 가드 재사용.
    - **S1.1.0 (완료, 커밋 2fcc3e4b):** `src/views/home/lib/topology-node-edit.ts` 순수 모델 — `resolveTopologyNodeEditTarget(node, docs)`(node.evidenceIds[0]=sourceSlug 로 편집 대상 문서 해석) + `buildNodeFrontmatterEdit(current, edits)`(바뀐 frontmatter 키만 updates, 빈값→null 삭제, no-op skip). 9 test.
    - **S1.1.1a (완료, 커밋 69faf463):** `src/views/home/ui/InlineFieldEdit.tsx` — frontmatter 단일 필드 읽기↔편집↔저장/취소 primitive (라벨 prop 주입, Enter 저장/Esc 취소, 헌장 준수). 6 test.
    - **S1.1.1b-i (완료, 커밋 a84f5fb6):** drawer 에 `domainEdit?:{value,onSave,labels}|null` prop + header 아래 `InlineFieldEdit` 렌더. 미지정 시 읽기 전용(무변). drawer test 2개.
    - **S1.1.1b-ii (다음, HomePage write 글루):** `HomePage`(1303 drawer 렌더)에 `useLocalVault()` 추가 → `resolveTopologyNodeEditTarget(selectedOntologyNode, vault.manifest?.docs ?? [])` 로 target, writable(manifest!==null)+target 있으면 `domainEdit={{ value: String(editTarget.frontmatter.domain ?? ""), onSave: async (next)=>{ const {updates,changed}=buildNodeFrontmatterEdit(editTarget.frontmatter,{domain:next}); if(!changed) return; try{ await vault.updateFrontmatter(editTarget.vaultSlug, updates, {expectedMtime: editTarget.mtime}); toast 성공 }catch{ toast 실패 } }, labels }}`. i18n: `home.ontologyDrawer.domainEdit.*`(field/edit/save/cancel/placeholder/empty/saving) en·ko. updateFrontmatter 가 저장 후 자동 refresh→재-derive. *검증:* tsc/lint/i18n + (local-vault write e2e 는 headless 폴더 pick 불가 — 정직히 표기, static 렌더만 확인). `HomePage`(`src/views/home/ui/HomePage.tsx:1303` 렌더, useOntologyInsight+useLocalVault 보유)가 `resolveTopologyNodeEditTarget(node, vault.manifest.docs)` 로 target 잡고, 저장 시 `vault.updateFrontmatter(target.vaultSlug, buildNodeFrontmatterEdit(target.frontmatter,{domain}).updates, {expectedMtime: target.mtime})`. writable vault(manifest!==null) 아닐 때 편집 disabled + "vault 필요" hint. 저장 후 기존 R13 폴링/refresh 가 재-derive → 토폴로지 반영. *검증 한계:* drawer 컴포넌트 test(편집 어포던스 렌더·미가능시 disabled) + 브라우저 static 렌더 확인까지 가능, local-vault write e2e 는 headless 에서 폴더 pick 불가라 정직히 표기.
- **S2 — 토폴로지 노드 생성.** 그래프에서 새 노드 추가 → add_concept 와 같은 schema 로 vault md.
  - **S2.0 (완료, 커밋 71a099aa):** `buildNewNodeDoc({title,kind,domain?})→{slug,markdown}` + `vaultFolderForKind` + `buildVaultMarkdown` domain 지원 (entities/docs-vault). 빌더도 vaultFolderForKind 로 통일(비파괴). 14+ test.
  - **S2.1a (완료, 커밋 97c01789):** `src/views/home/ui/CreateNodeForm.tsx` — title + kind(domain/capability/element) + optional domain → onCreate 콜백. 라벨 prop 주입, Enter 제출. 6 test.
  - **S2.1b (다음, 마운트+글루):** HomePage 에 CreateNodeForm 진입점(토글 버튼 → form, writable 로컬 vault 일 때만) → onCreate 에서 `buildNewNodeDoc({title,kind,domain})` → `vault.createDoc(slug, markdown)`(중복 slug 면 throw→toast). 저장 후 자동 refresh→재-derive 로 그래프 등장. i18n `topology.createNode.*` en·ko. writable 게이트.
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

## 사용자 결정 (2026-05-30, "진행해줘 한번에")

전체 프로그램을 무중단 연속 구현하도록 승인됨. per-step 승인 대기 없이 진행하되, *진짜* blocker(빌드 깨짐·모호한 데이터·되돌릴 수 없는 외부 영향)만 surface.
- **glow(T3) = 옵션 (a) 확정.** 디자인 헌장 유지. "반짝/눈에 띔"은 **헌장 호환**(인디고 ring + 밝기/opacity pulse). `forbidden.md` 의 glow/neon 금지 그대로, 헌장 파일 수정 금지.
- **S5(빌더) = 비파괴 강등 확정.** `/ontology/edit` 라우트 *유지*. 토폴로지를 1차 편집 surface 로 올리고 빌더는 내비에서 "고급"으로 강등(되돌림 가능). 라우트 삭제·문서 폐기 금지.

## Live agent-activity 모드 (이 프로그램에 포함 — 설계 완료)

에이전트가 vault 를 편집하면 클릭 없이 화면에 *티나게* 반영. (기존 R13 폴링/toast 위에 얹음)

- **웹:** vault 첫 load 시 자동 baseline 1회(`markChangeBaseline`, local 모드 + nodes>0 + baseline 없음일 때) → 이후 폴링이 변경 감지하면 `changedSlugs`(=touchedNodeIds) 가 채워져 토폴로지가 자동 pulse(기존 B1 경로 재사용). 초기 load 는 변경으로 표시하지 않음. + 상시 ambient indicator(`src/widgets/operations-nav` 에 "🟢 Live · 방금 N개 변경" 배지, transient toast 아님, 헌장 호환 인디고 emphasis). static/dogfood 모드는 live 없음.
- **Tauri 데스크톱:** `src-tauri/Cargo.toml` 에 `notify-debouncer-full`(500ms debounce) 추가 → `start_vault_watch(root)` 커맨드(`#[tauri::command]`, lib.rs:288 `generate_handler!` 등록 + `.manage(VaultWatcherState)`)가 `.md` 변경 시 `AppHandle.emit("vault-changed", {path,kind})` → JS `listen('vault-changed')`(`@tauri-apps/api/event`) 가 기존 refresh 트리거. `capabilities/default.json` 에 `fs:read-all`/`fs:list-all` 추가. *검증 한계:* `cargo build`/`cargo test --manifest-path src-tauri/Cargo.toml` 까지는 가능, 전체 데스크톱 e2e 는 이 환경에서 불가 — 정직하게 표기.

## 진행 상황 (loop 갱신)

- [x] S1.0 직렬화 추출 (7fd46b20) · [x] S1.1.0 편집 모델 (2fcc3e4b) · [x] S1.1.1a InlineFieldEdit primitive (69faf463) · [x] S1.1.1b-i drawer 슬롯 (a84f5fb6) · [x] S1.1.1b-ii HomePage write 글루 (95b351c5) — **S1 완성: 토폴로지에서 domain 직접 편집 e2e** · [x] S2.0 새 노드 생성 모델 (71a099aa) · [x] S2.1a CreateNodeForm (97c01789) · [ ] S2.1b 마운트+createDoc 글루 · [ ] S3 · [ ] S4 · [ ] S5(비파괴) · [ ] S6 · [ ] live-web · [ ] live-tauri
