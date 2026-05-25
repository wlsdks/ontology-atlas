# UX 1원리 분석 — 다음 우선순위

> **작성**: 2026-05-01 (mission v2 cleanup + atomic audit 완료 후)
> **방법**: 사용자 입장에서 *mission v2 약속* 을 1원리 게이트로 검증.
> **Mission v2**: "사람과 AI agent 가 같이 저작하는 codebase 의 ontology"

---

## 0. 전제 — 청중 3종

| 청중 | 첫 진입 행동 | mission v2 약속 |
|---|---|---|
| **개발자** (이 도구를 자기 codebase 에) | clone → `pnpm dev` → vault 폴더 선택 | 코드 ↔ 개념 매핑, AI agent 와 같이 저작 |
| **PM / 디자이너 / 운영** | 개발자가 띄워준 곳에 진입 → vault 보기 | ERD 이상의 도메인 지도 |
| **AI agent** (Claude Code 등) | `.mcp.json` 등록 → MCP 호출 | 코드 분석한 결과를 ontology 로 commit |

---

## 1. 사용자 journey 1원리 게이트

### 게이트 질문
> *"X 가 없어도 새 사용자가 첫 ontology 노드를 보는데 5분 안 걸리는가?"*
> *"X 가 없어도 PM 청중이 frontmatter / kind / capability 가 뭔지 직관적으로 이해하는가?"*
> *"X 가 없어도 AI agent 가 등록 → 첫 호출까지 0 마찰인가?"*

### Journey 분해

#### Step 1 — 진입 (Landing)
**현재**: `pnpm dev` → `/` → unauthenticated 면 LandingPage. mission v2 카피 + MiniTopology + 3-step rail + "내 마크다운 폴더 열기" + "샘플 그래프 둘러보기".

✅ **PASS** (PR #9 으로 mission v2 정렬). 마찰 0.

#### Step 2 — Vault 활성화 (`/docs`)
**현재**: LocalVaultPicker → "내 PC 마크다운 폴더 열기" 버튼 → showDirectoryPicker → 폴더 선택 → manifest 빌드 → vault surface 표시.

⚠️ **마찰**:
- "어떤 폴더를 골라야 하지?" 답 없음 — 사용자가 자기 codebase 의 docs/ 를 골라야 하나, 빈 폴더를 골라야 하나, 이 repo 의 `docs/ontology/` 같은 dogfood 데이터를 시도해야 하나?
- 첫 시도 vault 가 비어있으면 (대부분의 사용자) 다음 step 이 **흐려진다**.

🎯 **개선 (BACKLOG T29 — Dogfood vault hint)**:
- LocalVaultPicker 에 "처음이세요? 이 repo 의 `docs/ontology/` 를 선택해 보세요 — 이 도구 자체의 ontology 가 보입니다" 같은 hint
- 또는 *샘플 vault zip* 을 README 에 안내

#### Step 3 — Vault 활성됐는데 ontology 없음 (빈 트리)
**현재**: `/` 가 vault 모드로 자동 전환 (Q1=(a)) → 빈 트리 + mode-aware empty state ("vault 가 비어있어요 — frontmatter 를 적으면 즉시 자라요" + 2-step + "빌더 열기" / "vault 살펴보기" CTA). PR #8 처리.

⚠️ **마찰** (이미 부분 처리, 추가 가능):
- "frontmatter 를 어떻게 적지?" 의 답이 *문서 외부* 에 있음 (FEATURES.md, BACKLOG, etc.)
- 사용자가 어디로 가야 첫 노드를 만들지 명확하지 않음

🎯 **개선 (새 P1 — UX-1)**:
- 빈 vault 의 empty state 에 **"첫 노드 만들기" inline snippet** — vault 안에 `concept-1.md` 같은 파일을 자동 생성하는 옵션 (scaffoldTopology 비슷하지만 한 노드만)
- 또는 빌더에서 "First Concept" coach 를 띄워 시각으로 첫 노드 만들기 → 자동 vault 저장 (Builder C-5 의 vault md write path 와 같은 의존)

#### Step 4 — 사용자가 frontmatter 적기
**현재**: 사용자가 본인 vault 안의 `.md` 에 직접 frontmatter 추가. 형식:
```yaml
---
kind: capability
title: 인증
domain: auth
elements: [JWT, Postgres]
relates: [user-service]
---
```

⚠️ **마찰** (큰 부분):
- 비개발자에게 *YAML frontmatter* 는 학습 곡선 큼
- "kind / domain / capabilities / elements / relates" 같은 *영문 식별자* — 한국어 청중에게 직관 떨어짐
- 어떤 kind 가 있는지, 어떤 relates 가 의미 있는지 *문서 외부* 에 있음

🎯 **개선 (Phase 4 T34 — 한국어 매핑 layer)**:
- UI 에서 "분류 / 관련 도메인 / 구성요소 / 관계" 한국어 라벨 노출 (코드 식별자는 유지)
- frontmatter 예시 snippet 을 *vault 내 README.md* 에 자동 생성 (scaffoldTopology 일부)
- 빌더에서 시각으로 만든 후 자동으로 frontmatter 형식으로 저장

#### Step 5 — Mode 인지
**현재**: 사용자가 지금 *local 모드* 인지 *cloud 모드* 인지 *static 모드* 인지 한눈에 확인하는 surface 부족. OperationsNav 의 "문서" 탭 description 정도만 mode-aware.

⚠️ **마찰** (UX 안전망):
- 사용자가 cloud 모드인 줄 알고 데이터를 입력했는데 사실 vault 모드 → 다른 곳에 저장됨
- vault 가 갑자기 끊기면 (권한 만료) 사용자가 모르고 cloud fallback 으로 글 씀
- mode 전환 시 *현재 어디에 데이터가 가나* 명시 부족

🎯 **개선 (새 P0 — UX-2 — Mode badge)**:
- OperationsNav 우측에 *현재 mode chip* 항상 표시 — `vault: 23 docs` / `cloud (sync)` / `demo (read-only)`
- chip click → 모드 detail panel (현재 vault path / Firebase 연결 상태 / 변경 source 분포)
- vault → cloud 전환 시 toast warning

#### Step 6 — AI agent 등록 (MCP)
**현재**: `.mcp.json.example` 복사 → `OMOT_VAULT` 설정 → Claude Code 재시작 → tool 메뉴에 7 도구 등장.

⚠️ **마찰**:
- `.mcp.json.example` 의 정확한 복사 위치 (`.mcp.json` 인지 user-global config 인지)
- "Claude Code 재시작" — 사용자가 잊고 1차 호출 실패
- 첫 호출 — agent 가 `list_concepts` 시도하면 빈 결과 → 사용자에게 *작동했는지* 확인 어려움

🎯 **개선 (새 P1 — UX-3 — MCP onboarding)**:
- `mcp/README.md` 에 *동영상 / GIF* 또는 단계별 스크린샷
- `mcp/scripts/verify.mjs` 같은 verify CLI — `node mcp/scripts/verify.mjs` 실행하면 etcd JSON-RPC 로 7 도구 모두 spec + 1 호출 OK 검증
- README 에 "Claude Code 에 등록 후 다음 4 줄을 LLM 에게 주세요" sample prompt:
  > 1. `mcp__oh-my-ontology__list_concepts` 호출해 vault 의 모든 노드를 list 해줘
  > 2. `get_concept({slug: "project"})` 로 root 노드 detail 보여줘
  > 3. `find_backlinks({slug: "capabilities/mcp-server"})` 로 의존자 찾아줘
  > 4. `add_concept` 로 새 capability 노드 만들어줘

#### Step 7 — Frontmatter ↔ 빌더 양방향
**현재**: frontmatter 를 적으면 트리에 즉시 등장. 빌더에서 노드 만들면 cloud (Firestore) 에 commit, ephemeral 만 md 로 export 가능. **vault 직접 write 없음**.

⚠️ **마찰** (Builder 1원리 audit P1):
- 사용자가 빌더 시각으로 노드 만든 후, 그게 vault 의 .md 에 저장되지 않으면 *AI agent 와 양립 불가* (agent 는 vault 만 봄)
- ephemeral export → 다운로드 → 사용자가 수동으로 vault 에 옮김 = 마찰 큼

🎯 **개선 (Builder C-5 + vault md write — 가장 큰 1원리 gap)**:
- 빌더 save 시 mode 분기:
  - local 모드: 직접 `vault/<slug>.md` 작성 (frontmatter + body)
  - cloud 모드: Firestore upsert (현재 동작)
- approved 노드 in-canvas 편집 — frontmatter patch 또는 Firestore update mode 별로

---

## 2. 1원리로 본 다음 우선순위

### P0 즉시 (1-2 PR, 위험 낮음, 가치 큼)

#### P0-1. **`/docs/` first-time UX — dogfood vault hint** (BACKLOG T29)
LocalVaultPicker 에 "이 repo 의 `docs/ontology/` 를 선택해 보세요" 안내. 비전 검증의 가장 빠른 path.

#### P0-2. **Mode badge** (UX-2 신규)
OperationsNav 우측에 현재 mode chip 항상 표시. 사용자가 *어디에 글이 가나* 한눈에. 안전망 + 학습 효과.

#### P0-3. **demo blueprint mission v2 정렬** (BACKLOG T28)
demo 데이터의 mission v1 잔재 capability ("검수 큐", "frontmatter 추출", "stub 승격") → mission v2 정렬. 사용자가 demo 둘러볼 때 mission 모순 안 보이게.

### P1 — 1-2 주 (substantial 변경)

#### P1-1. **Builder C-5 + Vault md write** (1원리 가장 큰 gap)
- 빌더 save → mode 분기 (local: vault `.md`, cloud: Firestore)
- approved 노드 in-canvas 편집

이게 mission v2 의 *사람 + AI agent 양방향 저작* 약속의 핵심 missing piece.

#### P1-2. **첫 노드 만들기 onboarding** (UX-1 신규)
빈 vault 의 empty state 에 inline "첫 노드 만들기" — `concept-1.md` 자동 생성 또는 빌더 첫 진입시 coach mark.

#### P1-3. **MCP onboarding 강화** (UX-3 신규)
`mcp/scripts/verify.mjs` + README 의 sample prompt + GIF.

### P2 — Phase 4 비개발자 친화 (순서)

#### P2-1. **한국어 매핑 layer** (BACKLOG T34)
"kind" → "분류" / "node" → "개념" / "edge" → "관계". UI 라벨 변경, 코드 식별자 유지.

#### P2-2. **빌더 onboarding 카피** (BACKLOG T33)
"ERD 이상 — 도메인 지도" 카피. 비개발자 청중을 위한 metaphor.

#### P2-3. **kind 별 lucide 아이콘** (BACKLOG T35)
project=Folder, capability=Cog, element=Box. 색은 단일 인디고 유지.

#### P2-4. **검색 PM 친화 분류** (BACKLOG T36)
"개념 / 글 / 사람" 라벨로 변경.

### P3 — V1.x ontology 진화

- T19 V1.5 cardinality (즉시 가능)
- T20 V1.3 rich refs (Q5 답 후)
- T21 V1.2 literals (Q6+Q7 답 후)
- T22 V2 통합 (마지막)

---

## 3. 1원리 결정 — 다음 진행 순서

> "지금 mission v2 의 약속 이 가장 *사용자 입장에서* 깨지는 곳이 어디인가?"

답:
1. **Mode 인지 부족** (UX-2 mode badge) — 사용자가 데이터가 어디로 가는지 모름
2. **Builder ↔ vault 양방향성 부재** (P1-1) — 사람 + AI agent 양립 약속 깨짐
3. **첫 사용자 demo 마찰** (P0-1 dogfood hint + P0-3 demo 정렬)

추천 순서:
1. **P0 batch (T28 + T29 + UX-2 mode badge)** — 1 PR, ~150 줄
2. **P1-1 Builder C-5 + vault md write** — 별도 PR, 큰 변경
3. **P1-2 첫 노드 onboarding + P1-3 MCP onboarding** — 2-3 PR
4. **P2 Phase 4 비개발자** — 별도 작업 phase

---

## 4. 새 P0/P1 항목 BACKLOG 추가 후보

| ID | 항목 | priority |
|---|---|---|
| **UX-1** | 빈 vault empty-state inline "첫 노드 만들기" | P1 |
| **UX-2** | OperationsNav 의 mode badge (현재 어떤 source) | P0 |
| **UX-3** | MCP onboarding GIF + verify CLI + sample prompt | P1 |
| **UX-4** | Builder C-5 + vault md write (P1-1) | P1 |

기존 BACKLOG 의 P0 후보 (T28 / T29 / T30 / T31) 와 위 UX 후보를 머지해 다음 batch 정의.

---

## 5. 결론

mission v2 cleanup 11 PR 후 *코드 정렬* 은 매우 견고하지만, **사용자 첫 5분 journey 의 마찰 3 곳** 이 발견됨:

1. **Vault 폴더 어떤 걸 고르나** (T29 hint 로 해소 가능)
2. **현재 어떤 mode 인가** (UX-2 mode badge 로 해소)
3. **Builder 결과가 vault md 로 저장 안 됨** (P1-1 가장 큰 1원리 gap)

이 3 가지가 *mission v2 의 약속 이 사용자 입장에서 깨지는 곳* — 다음 phase 의 우선순위.
