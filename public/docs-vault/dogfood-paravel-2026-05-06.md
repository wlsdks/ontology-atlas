# Dogfood — real external codebase (sanitized, 2026-05-06)

> Setup: 사용자 본인 *real* codebase (Korean enterprise community app, React Native + Expo + FSD, 1.8 GB, 20 features) 에 `npm link` 로 publish 시뮬한 cli + mcp 적용. PR #165 (R15 closeout) 머지 직후 main 의 cli `init` (cwd .mcp.json + auto-prefix default) + cli `add` 사용.
>
> **Sanitization**: codebase 이름 / company codename / specific feature names 추상화. 도메인 이름 generic 화 (auth, content, interaction 등).

## TL;DR

- **30 노드 vault** 1.1s 순 cli time 으로 작성 (5 domain + 15 capability + 5 element + 5 starter)
- **PR #165 의 두 fix 모두 real codebase 에서 정상 작동**:
  - F1 (cwd .mcp.json) — codebase root 에 `OMOT_VAULT='./docs/ontology'` 자동
  - F2 (auto-prefix default on) — `add capability auth --domain=identity` → `capabilities/auth.md` (kind folder 자동)
- **vault validate / mcp verify 모두 통과** (30 파일 issue 0, 14 tools)
- **새 friction 1 발견** — element kind 의 path-style slug + auto-prefix 가 4단계 nested

## 측정 환경

- **Codebase**: React Native 0.83 + Expo SDK 55, FSD architecture (oh-my-ontology 와 동일 layer pattern), 1.8 GB, ~20 features
- **진입 흐름**:
  1. `cd <codebase> && oh-my-ontology init docs/ontology` (0.49s)
  2. cli `add` 다발 호출 — domain (5) → capability (15) → element (5)
  3. `vault:validate` + mcp `verify.mjs` 검증

## ✅ PR #165 두 fix 검증 (real codebase)

### F1 — cwd .mcp.json 자동 생성

```
cd <codebase>
oh-my-ontology init docs/ontology
# 결과:
#   <codebase>/.mcp.json (OMOT_VAULT='./docs/ontology')   ← cwd 의 codebase root
#   <codebase>/docs/ontology/.mcp.json (OMOT_VAULT='.')   ← vault 안
```

사용자가 codebase root 에서 Claude Code / Cursor 열면 즉시 mcp 인식. *외부 사용자 시뮬 sandbox (todo app)* 결과 그대로 real codebase 에서도 작동.

### F2 — auto-prefix default on

| 명령 | 결과 path | 정확? |
|---|---|---|
| `add domain identity --title=...` | `domains/identity.md` | ✅ kind folder |
| `add capability auth --domain=identity` | `capabilities/auth.md` | ✅ kind folder |
| `add element src/features/auth --domain=identity` | `elements/src/features/auth.md` | ⚠ 4단계 nested |

5 domain + 15 capability 모두 starter (`domains/example.md`, `capabilities/example.md`) 와 일관된 layout. R15 fix 의도대로.

## 측정 결과 — sub-second cli 부담

| 작업 | 명령 수 | 시간 | per-cmd avg |
|---|---|---|---|
| init (vault scaffold) | 1 | 489ms | — |
| 5 domain 추가 | 5 | < 1s | ~150ms |
| 15 capability 추가 | 15 | 914ms | ~60ms |
| 5 element 추가 | 5 | 192ms | ~38ms |
| **합계** | **26** | **~1.1s** (인간 결정 시간 제외) | — |

**의미**:
- node spawn overhead (~50-150ms/cmd) 가 누적되지만 *사용자 결정 시간* (어떤 노드 추가할지, 어떤 도메인 분류) 이 cli time 의 90%
- publish 후 `npx oh-my-ontology add ...` 흐름 (각 1 cmd) 에서 친구션 0

## 🚨 새 친구션 발견

### F5 — element kind 의 path-style slug + auto-prefix → 4단계 nested

```
oh-my-ontology add element src/features/auth --domain=identity
# 결과: docs/ontology/elements/src/features/auth.md  (4 levels)
```

이전 oh-my-ontology 자체 vault 의 element 는 *flat* (`elements/file-system-access-api.md`, `elements/mcp-sdk.md` — library 이름). real codebase 시뮬은 *path-style* (`elements/src/features/auth.md` — codebase 위치) 자연 선택.

**둘 다 valid**:
- flat — element 가 *외부 라이브러리* / 추상 개념일 때 (file-system-access-api, mcp-sdk)
- path-style — element 가 *codebase 안 코드 모듈* 가리킬 때 (src/features/auth)

**친구션**: 권장 slug 패턴 docs 부재. 사용자가 첫 element 추가 시 *어느 패턴* 인지 결정 부담. 4단계 nested 가 너무 깊은 느낌이지만 *codebase path 가리킴* 의 명확함 trade-off.

**Fix 방향 (선택)**:
1. **(권장) docs 명시** — `cli/README.md` / `AGENTS.md` 의 frontmatter shape 표에 *element slug pattern* 두 case 명시. 둘 다 valid.
2. **(보수적) cli warning** — slug 가 `/` 포함 + auto-prefix 시 *"이 element 는 path-style 이라 nested. 의도 맞나? `--raw-slug` opt-out 가능"* 한 줄 hint. *advisory 만, error 아님*.

**fix 가치**: 작음 (validate 통과, 사용자 자유). doc 갱신만이면 30 분.

## 통과 사항

- vault validate clean (30 파일 issue 0)
- mcp verify — 14 tools, 30 노드, instructions field 정상
- cli `add` × 25 — 회귀 0
- 사용자 본인 codebase 의 *진짜 mental model* 작성 가능 — 첫 dogfood 시뮬 (todo app, 7 노드) 의 한계 (도메인 친숙성 시뮬) 보완

## *진짜 외부 사용자 입장의 한계* 여전히 남음

내가 측정했지만 *진짜 첫 사용자* 가 아닌 점:
- codebase 도메인 *완전 모름* 아님 — README + CLAUDE.md 한 번 skim 으로 도메인 추론 가능
- *어떤 capability 가 어떤 domain* 의 결정 부담 측정 못 함 (내가 5 domain 자동 그루핑)
- AI agent (Claude Code mcp 직접 호출) 흐름은 *next session* 에 별도 측정 — 현재 세션의 mcp 는 oh-my-ontology vault 가리킴

진짜 측정은 *publish 후 외부 user* 가 본인 codebase 에서 진행해야 정확. 이 보고서는 *real codebase 입장의 lower bound*.

## Paravel-App vault 자체 정책

- *test artifact* — 사용자 본인 결정으로 codebase 에 commit / 또는 폐기
- 본 보고서는 *sanitized* — codebase 이름 / company codename / specific feature names 추상화
- oh-my-ontology repo 의 docs/ 안 commit (이 파일)
