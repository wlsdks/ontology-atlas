# Backlog — oh-my-ontology

> 작업 *순번* 만. user 가 "T?? 진행해" 하면 그것만 분해해서 실행.
> 완료된 항목은 ✅ 표시 후 별도 batch 정리 시 일괄 삭제.
>
> **갱신 (2026-05-01 저녁)**: mission v2 cleanup 7 PR 머지 후 전면 재정렬.

---

## ✅ 완료 (mission v2 phase, 2026-05-01)

### Phase 3 (AI agent partner) + mission v2 cleanup 7 PR 머지

| 항목 | 결과 |
|---|---|
| **Phase 3 — MCP 서버** | ✅ PR #5/#7 — `mcp/` 패키지 v0.2.0, 7 도구 (`list_concepts` · `get_concept` · `find_evidence` · `find_backlinks` · `add_concept` · `add_relation` · `patch_concept`) |
| **dogfood vault** | ✅ PR #5/#7/#10 — `docs/ontology/` 21 노드 (1 project + 8 domain + 7 capability + 4 element + 1 vault-readme) |
| **Stage 1 — UI "분석 시작" CTA 제거** | ✅ PR #5 — 3 view 정리 |
| **Stage 2 — entity httpsCallable 제거** | ✅ PR #5 — `enqueueKnowledgeExtractionJob` |
| **Stage 3 — functions/ extraction 제거** | ✅ PR #5 — 1080 → 543 줄, 3 LLM lib 삭제 |
| **Stage 4 light + full — review queue surface** | ✅ PR #5/#6 — `/review/knowledge`, `applyReviewAction`, 6 view caller, 2 callable, helper 통째 제거 |
| **Stage 5 / Q1=(a) — `/` ontology hub auto-vault** | ✅ PR #6 — `useOntologyInsight` 신설 |
| **빈 vault empty-state mode-aware** | ✅ PR #8 |
| **README + AGENTS mission v2 동기화** | ✅ PR #9 |
| **V1.1 Wikidata spec 구현** | ✅ PR #10 — `qualifiers?[]` + `rank?` 옵셔널 (additive, breakage 0) |
| **stale "Demo" title 잔재 정리** | ✅ PR #11 — Playwright MCP QA 발견 |

### 그 이전 (refactor/first-principles-slim-1 PR #1, 23 commits)

| # | 항목 | 결과 |
|---|---|---|
| T3+T4 | share-doc 시스템 제거 | ✅ |
| T5+T6 | AI 추출 client + functions path 제거 | ✅ (mission v2 cleanup 으로 마무리) |
| T7-T9 | mode-aware (`useProjects` / Drawer / Form / 검수큐 banner) | ✅ |
| T10 | 빌더 fullscreen | ✅ |
| T11 | 빌더 트리 시각 위계 | ✅ |
| T14 | account-settings 단순화 | ✅ |
| T15 | dev-admin-bypass 제거 | ✅ |
| T16 | frontmatter parser nested | ✅ |
| T17 | 빌더 onboarding 카피 | ✅ |
| T18 | V1.1 qualifiers + rank | ✅ (PR #10) |
| T25 | client-error 단순화 | ✅ |
| T26 | dagre layout 단순화 | ✅ |

### Open questions 해소

- **Q1** — `/` 자동 vault 전환 → ✅ (a) 채택, useOntologyInsight 도입
- **Q2** — share-doc 시스템 제거 → ✅ 이미 제거됨 (commit d27e3d0). `CopyProjectLinkButton` 만 보존

---

## 결정 필요 (user input 후 unblock)

### V2 spec Open questions Q3-Q8

`docs/ONTOLOGY-MODEL-V2-DRAFT.md` §11 의 8 질문 중 Q1·Q2 해소, Q3-Q8 대기:

- **Q3** — V1.x dual-read 기간 (마이그레이션 안전망 길이)
- **Q4** — V1.4 ActionType 인증 모델 (V1.4 차단)
- **Q5** — extractionModelId 검증 정책 (V1.3 의 일부)
- **Q6** — summary 마이그레이션 방식 (V1.2 의 일부)
- **Q7** — literal naming scope (V1.2 의 일부)
- **Q8** — ActionInvocation 보존 기간 (V1.4 의 일부)
- **Q (multi-vault)** — 다중 vault 활성 시점 (v0.x = single 가정 vs 처음부터 multi)

### T13. OperationsNav 온톨로지 탭 분기 결정

mission v2 후 4탭 (문서 / 온톨로지 / 토폴로지 / 정리) 정리 완료. 추가 분기는 user UX 결정 — defer.

---

## P0 — 즉시 실행 가능 (mission v2 정렬, 위험 낮음, 가치 큼)

### T28. demo blueprint mission v2 정렬

- **현재**: `src/shared/mocks/demo-blueprint.ts` 의 CONTAINER_THEMES 에 "검수 큐", "frontmatter 추출", "stub 승격" 같은 mission v1 잔재 capability
- **변경**: mission v2 정렬 (vault frontmatter / AI agent partner / MCP / mode-aware)
- **est**: 1 commit, 데이터 변경만

### T29. /docs/ first-time UX — dogfood vault hint

- **현재**: `/docs/` LocalVaultPicker 가 vault 미활성일 때 generic 안내
- **개선**: "이 repo 자체의 ontology 를 보려면 `docs/ontology/` 를 선택하세요" 같은 dogfood hint
- **est**: 1 commit, 위젯 카피 갱신

### ~~T30. MCP `find_path(from, to)`~~ — ✅ R11 v0.7.0

mcp 14 도구의 read 8 에 포함. BFS, undirected, maxHops default 5.

### ~~T31. MCP `list_kinds` / `list_domains`~~ — ✅ R11 v0.7.0

`list_kinds` 구현. `list_domains` 는 `list_concepts({ kind: 'domain' })` 으로 cover (별도 도구 불필요).

---

## P1 — V1.x 진화 (additive, breakage 0)

### T19. V1.5 — Relation Cardinality

- "belongs_to.sourceCardinality = 'one'" 같은 1:1 / 1:N 제약
- spec: `docs/ONTOLOGY-MODEL-V2-DRAFT.md` §6
- 의존: 없음 (T18 ✅ 후 가능)
- est: 3-5 commit

### T20. V1.3 — Rich References

- evidence 에 `retrievedAt` / `extractionModelId` / `confidence`
- spec: §4
- 의존: Q5 답변 (extractionModelId 검증 정책)
- est: 3-5 commit

### T21. V1.2 — Literal Properties

- node 에 `description` / `color` / `releasedAt` 같은 atomic property
- 새 컬렉션 `knowledgeApprovedLiterals/{literalId}`
- spec: §3
- 의존: Q6 (summary 마이그레이션) + Q7 (literal naming scope)
- est: 7-10 commit

### T32. V1.4 — Action Type — DEFERRED

- spec: §5 + `docs/ACTION-TYPE-SECURITY-DRAFT.md`
- 의존: Q4 (인증 모델) + 보안 sub-spec 통과
- est: TBD — DEFERRED 명시

### T22. V2 통합 KnowledgeStatement (5-phase)

- 의존: T18 ✅ + T19 + T20 + T21 모두 stable + 90일 dual-read soak
- est: 30+ commit, 9-12 개월

---

## ~~P2 — Phase 4 (비개발자 surface 다듬기)~~ — DROPPED (R12 #33)

PRODUCT-DIRECTION v3 (R12 fire #25 / #33) 에서 PM-primary 결정 reverted.
> Primary audience = developer + their AI agent. PM-친화 surface = bonus, not target.

T33-36 는 *if-bonus* 로 격하. 사용자 explicit 요청 들어오면 재평가.

### ~~T33. 빌더 onboarding "ERD 이상" 카피 정렬~~ — dropped
### ~~T34. 기술 용어 ↔ 한국어 일반 용어 매핑 layer~~ — dropped
### ~~T35. 노드 색 / 아이콘 — kind 별 친숙~~ — dropped
### ~~T36. 검색 시 "코드 / 문서 / 사람" 분류~~ — dropped

---

## P3 — 인프라 / 회귀 차단

### T23. mode-aware e2e tests

- local / cloud / static 시나리오로 각 surface 검증
- needs: Firebase emulator 셋업 (m4 와 같은 의존)
- est: 3-5 commit + 인프라

### T37. mode-aware Playwright MCP routine QA

- 매 PR 또는 nightly 로 핵심 라우트 navigate + console error check
- needs: CI runner 가 Playwright MCP 실행 가능한가 확인
- est: 1-2 commit

### ~~T38. functions Firestore 컬렉션 archival~~ — VOID (R10b)

R10b 에서 firebase / functions / firestore 의존 통째 삭제. archival 대상 자체 사라짐.

### ~~T24. knowledge-* 컬렉션 통합 검토~~ — VOID (R10b)

knowledge-* 컬렉션 자체가 사라짐. vault frontmatter 가 단일 진실원.

---

## P4 — Marginal value (defer)

### ~~MCP `delete_concept`~~ — ✅ R11 v0.4 + v0.7

R11 v0.4 에 dry-run + backlinks 가드 + force 추가. R11 v0.7 에 expected_mtime conflict guard 통합. mcp 14 도구의 write 6 에 포함.

### MCP `rename_concept` / `merge_concepts` — ✅ R11 v0.7.0 (NEW)

graph-level write 도구. atomic backlink redirect (frontmatter array · inline string · body links). dry-run default + expected_mtime guard. 14 도구의 write 6.
- 결정: defer

### CHANGELOG batch cleanup
- 완료된 ✅ 항목들을 BACKLOG 에서 제거 + CHANGELOG 로 이동
- 운영 작업, 가치 marginal

### T12. NodeDetailPanel evidence excerpt modal
- 트리 row evidence chip 클릭 시 markdown 발췌 modal
- AI 영역 의존 — T20 (rich references) 후

### T27. 큰 view 파일 정리
- `KnowledgeDocumentDetailPage` (이미 -300 줄 정리됨, 1100+ 줄 잔여)
- mission v2 후 정리 가치 marginal — defer

### m4. 비활성화된 e2e 재활성화
- T23 와 같은 의존 (Firebase emulator)

---

## 추천 진행 순서

1. **P0 (T28-T31)** — mission v2 정렬 + MCP ergonomics 즉시 처리
2. **Q3-Q8 user 답** — V1.2/V1.3 차단 풀기
3. **T19 (V1.5)** — Q 답 무관, 즉시 가능
4. **T20 (V1.3)** + **T21 (V1.2)** — Q5/Q6/Q7 답 후
5. **P2 (T33-T36)** — 비개발자 surface 다듬기 (Phase 4)
6. **T23 / T37** — 인프라 (Firebase emulator, Playwright MCP CI)
7. **T22 V2 통합** — 마지막

## 참조 문서

- `docs/PRODUCT-DIRECTION.md` — mission v2 방향, 4 phase
- `docs/FEATURES.md` — 사용자가 *지금* 사용 가능한 기능 전수
- `docs/ONTOLOGY-MODEL-V2-DRAFT.md` — V1.x → V2 spec
- `docs/MISSION-CLEANUP-CANDIDATES.md` — 4 stage cleanup 진행 (모두 ✅)
- `docs/CHANGELOG.md` — 시간순 사용자 가시 변화
- `mcp/README.md` — MCP 서버 7 도구 + 등록
