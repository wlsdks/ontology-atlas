# PRODUCT DIRECTION — 온톨로지 워크벤치 (사람 + AI agent 공동 저작)

> 작성일 (v2): 2026-05-01
> 결정 반영: user 가 **Direction A** (온톨로지 first) 확정 + **dogfooding + AI agent 협업** 방향 추가
> 본 문서는 [PRODUCT-DIRECTION.md](./PRODUCT-DIRECTION.md) v1 의 strategic 진단을 그대로 두고, **결정 + 새 방향**을 v2 로 덮음.

---

## TL;DR — 1원리 한 줄 (v2)

> **이 프로젝트는 온톨로지 워크벤치다 — 비개발자와 AI agent 가 같이 한 codebase 의 mental model 을 함께 저작한다.**

- 토폴로지 = 출구 (view) 중 하나
- 척추 = md 문서 → 자라는 ontology
- 비개발자 (PM · 디자이너 · 운영) 도 ERD 보다 친숙한 surface
- AI agent (Claude Code 같은) 도 같은 ontology 를 읽고 쓰는 *partner* — generic 한 ontology 도구와 차별화되는 angle

---

## 1. user 결정 요약

### 결정 1 — Direction A (온톨로지 first)

`/` 가 **온톨로지 hub** 가 됨:
- 첫 진입: 트리 + ego graph (현재 `/ontology` 의 핵심을 끌어올림)
- 토폴로지는 sub view — `/topology` 또는 `/?view=topology`
- 사용자가 "이 서비스는 내 도메인 지식을 정리하는 곳" 으로 즉시 인지

근거 (user 인용):
> "온톨로지 서비스니까 말이지? 특히 이 온톨로지는 ERD 이상으로 비개발자를 위함이기도 하잖아?"

### 결정 2 — Self-hosting + AI agent 협업

핵심 통찰:
> "지금 만들고 있는 이 서비스 자체를 우리가 서비스를 만들면서 해보는건 어떨까? 내 로컬에 패키지 하나 만들고 그거보고 오프라인으로 실행하게 해서 계속 채워나가고 검토하면서 이 온톨로지 서비스 자체가 개발하는 ai agent 에도 도움이 되도록 할 수 있을까?"

해독:
1. **Dogfooding** — 우리가 이 프로젝트의 docs/ 를 본 서비스의 vault 로 사용
2. **로컬 패키지** — 사용자 디스크에 install, 오프라인으로 실행 (Firebase 없이도)
3. **AI agent 가 partner** — 코드를 읽는 Claude Code 가 같은 ontology 를 읽고 쓸 수 있어야 함

이게 차별화 포인트. **generic ontology workbench (Protégé 등) → "AI 와 사람이 같이 저작하는 codebase mental model"**.

---

## 2. 두 청중, 한 ontology

| 청중 | 이 서비스로 무엇을 함 |
|---|---|
| **개발자** | 코드 ↔ 개념 매핑 — "이 capability 는 어느 service 가 구현?" |
| **PM / 디자이너 / 운영** | 코드 안 읽고 시스템 mental model 이해 — "어떤 도메인 / 어떤 element 들" |
| **AI agent** (Claude Code 등) | codebase 의 사전 지식. "이 프로젝트에서 'auth' 이 무엇을 의미하는가" 문답 가능 |

같은 ontology 가 세 청중 모두 만족시킨다는 것이 새 mission.

---

## 3. AI agent 협업 — 구체적으로 무엇

### 3-A. 읽기 path (이미 가능)

AI agent 가 vault (`projects/*.md`) 를 읽으면 frontmatter 가 ontology 를 직접 표현:

```yaml
---
slug: auth-platform
kind: project
domain: 인증
capabilities:
  - 토큰 발급
  - 권한 검증
  - 사용자 상태 추적
elements: [JWT, Postgres, refresh-token]
dependencies: [user-service, audit-trail]
---

# Auth Platform

사용자 인증·세션·권한을 한 곳에서 ...
```

→ frontmatter 만으로 capabilities + elements + edges 자동 stub 생성됨 (이미 구현). AI agent 가 이 vault 를 읽으면 즉시 mental model 획득.

### 3-B. 쓰기 path (필요)

AI agent 가 코드를 분석하면서 새로 발견한 사실을 ontology 에 commit:

```bash
# 예: AI agent 가 파일을 분석한 후
$ ohmy add element src/features/billing/lib/cycle-rule.ts \
    --kind element \
    --capability "구독 주기 계산" \
    --project billing-service
```

방법 (옵션):
1. **CLI** — `npx oh-my-ontology add ...` (frontmatter 자동 작성)
2. **MCP 서버** — Claude Code 가 직접 도구 호출 (`mcp__oh-my-ontology__add_node`)
3. **프로그래매틱 API** — 패키지에서 `addNode({...})` import

가장 ergonomic 한 건 **3 (MCP 서버)**. AI agent 가 codebase 탐색 → 발견한 개념을 ontology 에 *직접* 추가. 인간 검수자가 빌더에서 본다.

### 3-C. 양방향 sync

```
human edits builder canvas
        │
        ▼
ontology 그래프 (vault frontmatter)
        ▲
        │
AI agent reads codebase → adds nodes via MCP/CLI
```

같은 graph. 같은 vault. 다른 입력 경로.

---

## 4. 로컬 패키지 — 어떻게 distribute

### 옵션 A — npm 패키지 + CLI

```bash
# 사용자가 자기 프로젝트 root 에서
$ npx oh-my-ontology@latest

# 시작:
# - 현재 디렉토리를 vault 로 인식
# - localhost:3210 에 web UI 띄움
# - 브라우저 자동 열림
# - Firebase 미설정 → local 모드 자동 활성
```

장점:
- 설치 0 마찰 (npm/pnpm 만 있으면 됨)
- 모든 프로젝트가 잠재 vault
- offline-first 기본
- Next.js 빌드 산출을 그대로 distribute 가능 (정적 export + 미니 서버)

단점:
- Node.js 의존
- 배포 후 패키지 사이즈 (Sigma + xyflow + 등 무거움)

### 옵션 B — Electron 데스크톱 앱

장점: 진짜 native 느낌
단점: 빌드 복잡, 배포 무거움, "AI agent 가 같이 쓰는" 컨셉과 안 맞음 (CLI 가 더 자연)

### 옵션 C — 그대로 Next.js 정적 export + 가이드만

`pnpm dev` 후 사용. 패키지화 X. 가이드 + 환경 변수 옵션화.

장점: 가장 빠름. 새 dependency 0.
단점: 배포 차단 (clone 부담).

### 권장: A 옵션 (CLI + npx)

`oh-my-ontology` 라는 npm 패키지로 publish. 사용자는 어떤 프로젝트의 root 에서든 `npx oh-my-ontology` 로 띄울 수 있게. AI agent 도 같은 패키지의 MCP 서버 또는 CLI 호출로 참여.

---

## 5. AI agent 가 partner 가 되는 surface

### 5-A. MCP 서버

`oh-my-ontology-mcp` 별도 패키지. Claude Code 와 호환:

```json
// .mcp.json or settings
{
  "mcpServers": {
    "oh-my-ontology": {
      "command": "npx",
      "args": ["-y", "oh-my-ontology-mcp"],
      "env": { "OMOT_VAULT": "./" }
    }
  }
}
```

도구:
- `list_concepts` — vault 의 모든 노드 (kind 별 필터)
- `get_concept` — 단일 노드 + 이웃
- `add_concept` — 새 노드 (frontmatter 작성)
- `add_relation` — 두 노드 사이 edge
- `find_evidence` — 어떤 코드가 이 concept 의 근거인지

이게 있으면 AI agent 가 codebase 탐색 시 **"이 파일이 어느 concept 의 element 인가?"** 을 직접 알 수 있음. 매번 다시 추론 X.

### 5-B. AGENTS.md / CLAUDE.md 에 ontology 인덱스 자동 생성

빌드 타임에 ontology 의 high-level 구조를 markdown 으로 dump:

```markdown
# This project's ontology (auto-generated)

## Domains
- 인증: 토큰 발급 · 권한 검증 · 사용자 상태 추적
- 결제: 구독 · 사용량 · 청구

## Capabilities
- 토큰 발급 [auth-platform/iam-core]
- ...
```

AI agent 가 codebase 진입 시 첫 페이지에서 이걸 보면 mental model 즉시 형성.

---

## 6. 단계 — 실행 가능 하게 분해

### ✅ Phase 1 — 정체성 정렬 (UI) — 머지 완료

1. ✅ `/` 를 ontology hub 로
2. ✅ `/topology` 신규 라우트
3. ✅ 랜딩 카피 — "AI 와 함께 자라는 codebase ontology"
4. ✅ demo 슬림 — 21 → 6 컨테이너, ~50 flat projects, ontology 노드 ~42

### ⏸ Phase 2 — Self-hosting — DEFERRED

`bin` + CLI 패키지화. **user 정책상 firebase 배포 안 함** + `pnpm dev` 로 충분히 검증 가능 → DEFERRED. 추후 재검토.

### ✅ Phase 3 — AI agent partner — 머지 완료

1. ✅ `mcp/` 패키지 — MCP 서버 v0.2.0 (PR #5/#7)
2. ✅ 7 도구: `list_concepts` / `get_concept` / `find_evidence` / `find_backlinks` / `add_concept` / `add_relation` / `patch_concept`
3. ⏸ CLI 명령 (`ohmy`) — DEFERRED (MCP 가 충분, CLI 는 Phase 2 의존)
4. ⏸ AGENTS.md 자동 생성 — DEFERRED (수동 갱신 + dogfood vault 가 대체)
5. ✅ `docs/ontology/` dogfood vault — 21 노드, 자기 mental model 표현

### ⏳ Phase 4 — 비개발자 surface 다듬기 — 진행 예정

자세히: `docs/BACKLOG.md` T33-T36.

1. ⏳ 빌더 onboarding "ERD 이상 — 도메인 지도" 카피 정렬
2. ⏳ 기술 용어 ↔ 한국어 일반 용어 매핑 layer
3. ⏳ 노드 색 / 아이콘 — kind 별 친숙
4. ⏳ 검색 시 "코드 / 문서 / 사람" 분류 (PM 친화)

---

## 7. 신구 mission 비교

### 구 mission (AGENTS.md, 현재)

> 사용자가 글을 쓰면 시스템이 개념·관계·근거를 추출해 검수·승인하면 토폴로지·트리·ERD 세 가지 view 로 자라난다.

### 신 mission (이 문서로 제안)

> **사람과 AI agent 가 같이 저작하는 codebase 의 ontology.**
>
> - 사람: vault frontmatter 또는 빌더에서 직접 노드/관계 추가
> - AI agent (Claude Code 등): MCP 또는 CLI 로 코드 탐색 결과를 ontology 에 commit
> - 모두 같은 vault 그래프. 모두 같은 view 들 (트리 hub / 토폴로지 sub-view / ERD)
> - 패키지로 distribute — 어느 codebase 에서든 `npx oh-my-ontology`

차이:
- "AI 가 추출" 이라는 cloud-extraction 약속 → "AI agent 가 partner" 라는 협업 약속
- 비용 모델 — cloud LLM 비용 자체가 사라짐 (Claude Code 가 이미 user 의 LLM 비용 부담)
- 정체성 명확 — generic ontology 도구가 아니라 **codebase 와 AI agent 가 만나는 워크벤치**

---

## 8. 즉시 다음 액션 (user 명령 대기 중)

이 v2 문서는 *방향* 만 정렬. 어느 단계부터 진행할지 결정 필요:

### 옵션 A — Phase 1 즉시 시작 (UI 정체성 정렬)
- `/` ↔ `/topology` swap
- demo 슬림
- 랜딩 카피
- est: 1-2 일 (commit 5-7 개)

### 옵션 B — Phase 2 먼저 (self-hosting)
- npm 패키지화 + CLI
- 가장 큰 기술 변경 — 다른 작업 가속됨
- est: 1-2 일

### 옵션 C — 이 문서 review + 추가 결정
- v2 의 가정 (비용 / 청중 / 우선순위) 더 다듬기
- 그 다음 Phase 결정

내 1원리 의견: **A** 부터. UI 정체성이 정렬돼야 self-hosting 시작 시 사용자가 보는 첫 화면이 "올바른 mission" 표현. self-hosting 은 그 다음.
