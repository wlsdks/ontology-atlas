# Backlog — oh-my-ontology

> 작업 *순번* 만. user 가 "T?? 진행해" 하면 그것만 분해해서 실행.
> 완료된 항목은 ✅ 표시 후 별도 batch 정리 시 일괄 삭제.
>
> **갱신 (2026-05-06)**: R12/R13/R14 wave 묶음 정리 후 전면 재정렬. 4 surface 완성, dogfood 25 노드, AI agent ↔ vault 자동 sync 도달.

---

## ✅ 완료 (R12-R14, 2026-05-04 ~ 2026-05-05)

### R14 (#155-#163, 2026-05-05) — AI agent ↔ vault 자동 sync + 웹 즉시 반영

| PR | 항목 | 결과 |
|---|---|---|
| #155 | vault polling 5s | ✅ visible-only `setInterval`, fingerprint diff |
| #156 | graph diff pulse | ✅ 새 노드 amber sine 5s on `/topology` |
| #157 | added toast | ✅ 모든 페이지 'Added: <slug>' |
| #158 | modified toast | ✅ slug 동일 + mtime 변화 'Edited: <slug>' |
| #159 | walkthrough 5 fix + topology↔ontology 회복 | ✅ /topology 1 노드 → 68 노드 112 엣지 |
| #160 | frontmatter schema 양식 (3 entry points 동기화) | ✅ `mcp/cli/src/lib/schema.mjs` single source |
| #161 | CLI `import` — 외부 .md 정규화 후 vault 정착 | ✅ cli 5 → 6 명령 |
| #162 | `/ontology-sync` skill + AGENTS read-while-coding 룰 | ✅ 명시 trigger 갈래 |
| #163 | SessionStart hook — vault census 자동 inject | ✅ 암시 trigger 갈래 |

### R13 (#43-#67, 2026-05-04) — AI agent quality 첫 측정 + VSCode plugin

| PR | 항목 | 결과 |
|---|---|---|
| #47 #48 | AI agent benchmark 7 task × 3 카테고리 cross-agent (Claude Code + Codex) | ✅ n=2, MCP 가치 measurable (CC: hallucination 9→0, Codex: tool calls -76%) |
| #45 | MCP `instructions` field (v0.7.1) | ✅ 매 세션 prompt 수준 안내 |
| #49-#67 | VSCode plugin v0.1.0 → v0.9.0 | ✅ status bar / backlinks / add concept / MCP connect — **R15 에서 plugin 자체 제거** (daily driver 가 AI-agent 터미널로 전환) |

### R12 (#27-#42, 2026-05-04) — developer-primary 결정 + CLI 5 명령 + dogfood graph 완전화

| 항목 | 결과 |
|---|---|
| Primary audience = developer + AI agent (PM drop) | ✅ PRODUCT-DIRECTION v3 |
| CLI 4 새 명령 (`list / validate / add / find`) | ✅ cli v0.2.0 |
| Cross-package contract 4-way (parser) / 3-way (validator) | ✅ 12fix×4 + 8fix×3 = 72 case |
| dogfood graph orphan 8 → 1 (의도적 1) | ✅ |

### R11 (2026-05-04) — vault tooling + parser contract + MCP graph-level write

| 항목 | 결과 |
|---|---|
| `pnpm vault:validate` / `vault:migrate` | ✅ |
| MCP v0.7.0 — 14 tools (8 read + 6 write, `rename_concept` / `merge_concepts` 추가) | ✅ |
| 3-way frontmatter parser contract | ✅ |
| MCP conflict guard (mtime 기반 silent overwrite 차단) | ✅ |

### Open questions 해소

- **Q1** — `/` 자동 vault 전환 → ✅ (a) 채택, useOntologyInsight 도입
- **Q2** — share-doc 시스템 제거 → ✅ commit d27e3d0
- **T30** MCP `find_path(from, to)` → ✅ R11 v0.7.0
- **T31** MCP `list_kinds` → ✅ R11 v0.7.0 (`list_domains` 는 `list_concepts({ kind: 'domain' })` 으로 cover)

---

## ~~결정 필요 (user input 후 unblock)~~ — Q3-Q8 자체 무효

`docs/archive/ONTOLOGY-MODEL-V2-DRAFT.md` 의 head 표 (2026-05-02 갱신) 가 답을 이미 확정:

- **Q1·Q2** — 해소 (mission v2 cleanup)
- **Q3-Q7** — 답 확정 (2026-05-02, user 추천 기본 채택)
- **Q8** — V1.4 자체 N/A (functions/ 폐기로 server-side action 사라짐) → 즉시 영향 0

V2 통합 자체도 `mission v2 default path 에서 invisible` 한 cloud 컬렉션 합병이라 ⏸ N/A. **R10b (firebase 영구 제거) 후 V1.x 진화 cloud-side 컨텍스트 자체 dead**. spec 은 *향후 서버 도입 결정 시 재활성* 위해 archive 보존.

---

## P0 — 즉시 실행 가능 (위험 낮음, 가치 큼)

### ~~T28. demo blueprint mission v2 정렬~~ — VOID

`src/shared/mocks/demo-blueprint.ts` 자체가 이미 제거됨 (어느 라운드에 사라졌는지 git log 미확인 — 이미 cleanup 완료). manifest.json 의 잔재 텍스트는 build-time generated docs 인용이라 직접 손볼 대상 아님.

### T29. /docs/ first-time UX — dogfood vault hint

- **현재**: `/docs/` LocalVaultPicker 가 vault 미활성일 때 generic 안내
- **개선**: "이 repo 자체의 ontology 를 보려면 `docs/ontology/` 를 선택하세요" 같은 dogfood hint
- **est**: 1 commit, 위젯 카피 갱신 (en/ko)

### ~~F1. dogfood vscode-plugin capability 갱신~~ — VOID (R15)

R15 에서 vscode-plugin 자체 제거. capability `vscode-plugin-ide-entry` 도 삭제. 갱신 대상 자체 사라짐.

### F2. VaultDiffToaster diff logic 단위 test

- **현재**: `src/features/docs-vault-local/model/VaultDiffToaster.tsx` 의 added/modified 분류 + mtime 비교 + null guard 가 unit test 부재. 사용자 강조한 "웹 즉시 반응" 의 핵심 회귀 risk
- **변경**: diff 계산을 pure helper 로 추출, 8+ case (첫 mount baseline / added / modified / 둘 다 / null mtime skip / overflow PREVIEW)
- **est**: 2 commit, helper 추출 + test 추가

### C3. AI agent benchmark scale n=2 → n=5+ — *user-triggered*

- **현재**: R13 의 cross-agent (Claude Code + Codex) benchmark n=2. 강한 confirming evidence
- **상태**: R14 closeout 에서 `docs/benchmark/README.md` 에 "Current measurement status" + 재측정 가이드 (`pnpm benchmark --bypass` 등) 추가. 실제 측정은 user 가 explicit trigger
  - Codex 자동: `--dangerously-bypass-approvals-and-sandbox` 가 필요해 user 명시 승인
  - Claude Code self: 새 session 에서 manual walk
- **재측정 가치 시점**: vault 25 → 50 노드 도달 시점 (effect 가 scale 되는지 saturate 되는지)

---

## ~~P1 — V1.x 진화 (cloud-first 가정)~~ — 모두 N/A 또는 머지됨

R10b (firebase / functions / firestore 영구 제거) 후 cloud-side 진화 컨텍스트 자체 사라짐. archive spec 의 진행 상태표 (2026-05-02):

| Track | 상태 |
|---|---|
| V1.1 — Statement Qualifiers + Rank | ✅ 머지 (PR #10) |
| V1.5 — Relation Cardinality | ✅ 머지 (PR #23) |
| V1.2 — Literal Properties | 🟡 vault-adaptation (cloud collection 신설 안 함, frontmatter scalar 직접 편집 PR 진행 중) |
| V1.3 — Rich References | ⏸ N/A — cloud LLM 추출 흐름 폐기 |
| V1.4 — Action Type | ⏸ N/A — server-side action 게이트 폐기 |
| V2 — 통합 KnowledgeStatement | ⏸ N/A — cloud 컬렉션 invisible |

미래 cloud collab 단계 재도입 시 archive 로부터 재활성. 현재 P1 무.

---

## P3 — 인프라 / 회귀 차단

### T37. Playwright MCP routine QA

- 매 PR 또는 nightly 로 핵심 라우트 navigate + console error check
- needs: CI runner 가 Playwright MCP 실행 가능한가 확인
- est: 1-2 commit

### F3. .mcp.json git-tracked (✅ 이번 R14 closeout 에서 추가)

- 사용자가 git clone 후 Claude Code 열면 즉시 19 tools 자동 등록.

### ~~T23. mode-aware e2e tests~~ — VOID (R10b)

R10b 에서 firebase 제거. cloud / static 모드 구분 자체가 사라짐.

### ~~T38. functions Firestore 컬렉션 archival~~ — VOID (R10b)
### ~~T24. knowledge-* 컬렉션 통합 검토~~ — VOID (R10b)

---

## P4 — Marginal value (defer)

### CHANGELOG batch cleanup
완료된 ✅ 항목들을 BACKLOG 에서 제거 + CHANGELOG 로 이동. 운영 작업, 가치 marginal.

### T12. NodeDetailPanel evidence excerpt modal
T20 (rich references) 후.

### T27. 큰 view 파일 정리
- `KnowledgeDocumentDetailPage` (이미 -300 줄 정리됨, 1100+ 줄 잔여) — defer

---

## ~~P2 — Phase 4 (비개발자 surface 다듬기)~~ — DROPPED (R12 #33)

PRODUCT-DIRECTION v3 에서 PM-primary 결정 reverted.
> Primary audience = developer + their AI agent. PM-친화 surface = bonus, not target.

T33-36 는 *if-bonus* 로 격하. 사용자 explicit 요청 들어오면 재평가.

---

## 추천 진행 순서

P1 V1.x 진화가 모두 ✅/N/A 로 닫혔고, 4 surface 도 모두 작동. 현재는 *signal-driven* — user 명시 product call 또는 사용자 보고 들어오는 것 위주.

1. **P0 잔여 (C3 user-trigger)** — 사용자 시간 날 때 `pnpm benchmark --bypass` 실행
2. **T37** — 인프라 (Playwright MCP CI) — nightly QA 가치 검토
3. **V1.2 vault-adaptation** — frontmatter literal property (description / color / releasedAt) 빌더 인스펙터 직접 편집 — PR 진행 중이면 closure
4. **사용자 product call** — 비개발자 surface (R12 dropped) 재평가 / npm publish (cli · mcp) 등은 사용자 명시 트리거

## 참조 문서

- `docs/PRODUCT-DIRECTION.md` — mission v3 방향
- `docs/FEATURES.md` — 사용자가 *지금* 사용 가능한 기능 전수
- `docs/archive/ONTOLOGY-MODEL-V2-DRAFT.md` — V1.x 진화 spec (cloud 부분 N/A archive)
- `docs/CHANGELOG.md` — 시간순 사용자 가시 변화
- `mcp/README.md` — MCP 서버 14 도구 + 등록
- `docs/benchmark/` — AI agent quality 측정 매트릭스
