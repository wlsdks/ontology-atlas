# Dogfood friction report — external-user simulation (2026-05-06)

> Setup: `/tmp/omot-dogfood-*` 에 작은 todo app (4 도메인: auth/task/notification/user) 만든 후, `npm link` 로 cli + mcp 글로벌 시뮬. 외부 사용자 첫 흐름 시뮬레이션.

## TL;DR

- **2 critical friction** — fix 가치 큼, publish 후에도 그대로 (즉시 fix 가능)
- **2 setup friction** — publish 가 원래 plan 이라 publish 후 사라짐 (fix 불필요)
- **MCP 14 tools 동작** — sandbox vault (7 nodes) 에 spawn 후 list_concepts / get_concept 정상

## 측정 환경

- 가상 codebase: 작은 todo app (~5 source files, 4 도메인)
- 진입 흐름:
  1. `cd /tmp/omot-dogfood-*` (myproject root)
  2. `oh-my-ontology init docs/ontology` (vault scaffold)
  3. `oh-my-ontology list/validate/add` (terminal exploration)
  4. `.mcp.json` 으로 AI agent 등록 시도

각 step 시간 측정 (모두 sub-second 범위 — perf 부담 0).

---

## 🚨 Critical friction (publish 후에도 그대로)

### F1. `.mcp.json` 위치가 vault target 안 — 사용자가 codebase root 에서 못 인식

**현재 동작**:
```
cd myproject
oh-my-ontology init docs/ontology
# 결과: myproject/docs/ontology/.mcp.json 만 생성
```

**문제**:
- Claude Code / Cursor 의 `.mcp.json` discovery 는 *cwd* 또는 `~/.claude` config 기준
- 일반적인 사용자 흐름: `cd myproject` 후 그곳에서 AI agent 실행 — *myproject root* 가 cwd
- vault 안 (`docs/ontology/`) 의 `.mcp.json` 은 *그 안에서 직접 agent 실행* 했을 때만 인식
- 사용자가 *Next steps step 4* 의 안내만 보고는 *어디로 cd 해야 하는지* 모호

**Fix 방향 (선호 순)**:
1. **cwd 에도 `.mcp.json` 생성** — `OMOT_VAULT: "./docs/ontology"` (relative nested) 박아서 codebase root 에 작성. 가장 자연스러움
2. cwd === target 인 경우 (e.g. `init .`) 한 번만
3. 기존 cwd .mcp.json 있으면 보존 + warn

**Impact**: 외부 사용자가 init 후 *AI agent 즉시 인식* 하는 가장 큰 마찰점. publish 후에도 그대로.

---

### F2. `add` 의 default layout drift — starter 와 다른 위치

**현재 동작**:
```
oh-my-ontology add domain auth --title="Authentication" --vault=docs/ontology
# 결과: docs/ontology/auth.md  (root, NOT domains/)

oh-my-ontology add capability auth/jwt-issue --title="JWT issue" --domain=auth
# 결과: docs/ontology/auth/jwt-issue.md  (auth 폴더, NOT capabilities/)
```

**기대치 (starter 와 일관)**:
```
docs/ontology/
├── domains/auth.md          ← 새 add (kind 폴더)
├── domains/example.md       ← starter
├── capabilities/auth/jwt-issue.md  ← 새 add (capabilities/ 안)
└── capabilities/example.md  ← starter
```

**현재 사용자가 의도대로 가려면**: `--auto-prefix` flag 매번 명시.

**Fix 방향**:
- `--auto-prefix` **default on**. 명시 opt-out (`--no-auto-prefix` 또는 `--raw-slug`) 가능.
- import 명령도 같은 default 변경 (consistency).
- contract 변경이지만 starter 와 정합성 회복이 더 큰 가치.

**Impact**: validate 는 통과하지만 vault layout 가 starter 와 어긋남 → 사용자가 *왜 내 노드는 다른 위치?* cognitive 부담. publish 후에도 그대로.

---

## ⚙️ Setup friction (publish 가 plan 이라 자연 해결)

### F3. `pnpm link --global` 이 `pnpm setup` prereq

```
ERR_PNPM_NO_GLOBAL_BIN_DIR  Unable to find the global bin directory
Run "pnpm setup" to create it automatically...
```

- 외부 사용자가 pnpm 처음 쓰는 환경이면 막힘 — *"PNPM_HOME / global-bin-dir 설정"* 추가 step
- `npm link` 는 default 글로벌 bin 가져 OK
- publish 후엔 link 명령 자체 빠짐 — 이 친구션 사라짐

**Action**: defer. publish 가 plan.

---

### F4. `npx -y oh-my-ontology-mcp` 가 publish 전 404

```
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/oh-my-ontology-mcp - Not found
```

- init 이 만든 `.mcp.json` 의 `command: 'npx', args: ['-y', 'oh-my-ontology-mcp']` 가 publish 전엔 fail
- publish 후 자동 작동

**Action**: defer. publish 가 plan.

---

## 측정 통과 사항

- `oh-my-ontology init` — 0.04s, 5 starter nodes + `.mcp.json` 정상
- `list / validate / add` — 모두 sub-second, 콘솔 에러 0
- mcp `verify.mjs` — sandbox vault (7 nodes) 14 tools 등록 OK
- vault `validate` — slug-path 정합성 통과 (F2 의 layout drift 와 무관)

## Fix priority

| Friction | Fix 가치 | 시간 | 우선순위 |
|---|---|---|---|
| F1 (cwd .mcp.json) | 큼 — publish 후에도 그대로 | 30분 | **immediate** |
| F2 (auto-prefix default) | 큼 — starter 일관성 | 30-60분 (contract 변경) | **immediate** |
| F3 (pnpm setup) | 0 (publish 후 사라짐) | — | defer |
| F4 (npx 404) | 0 (publish 후 사라짐) | — | defer |

## 기록되지 않은 — *진짜 외부 사용자 입장의 한계*

내가 시뮬했지만 *진짜 외부 사용자* 가 아닌 점:
- 도메인 이미 알고 있음 (코드 내가 만듦)
- AI agent 흐름 이미 익숙 — *처음 mcp 등록* 부담 측정 어려움
- `--auto-prefix` flag 같은 cli 디테일 이미 알고 있음 — 진짜 외부 사용자라면 더 막힐 가능성

진짜 측정은 *publish 후 외부 1-2 명 user* 가 보고하는 게 정확. 이 sandbox 시뮬은 *fix 가치 있는 친구션 발견* 의 lower bound.

---

## Perf 측정 — vault scale (R11 #31 baseline 갱신, 2026-05-06)

`scripts/perf-vault.mjs` (R11 #31) 으로 walk + read + parseFrontmatter latency 측정. 사용자 codebase 가 *큰 vault* (수백~수천 노드) 도달 시 acceptable 한지.

| N (노드 수) | walk (ms) | read (ms) | parse (ms) | total (ms) | ms/file |
|---|---|---|---|---|---|
| 100 | 0.38 | 1.43 | 0.62 | **2.43** | 0.024 |
| 500 | 0.83 | 7.29 | 1.40 | **9.53** | 0.019 |
| 1,000 | 0.98 | 13.37 | 2.40 | **16.75** | 0.017 |
| 2,000 | 2.35 | 28.00 | 2.93 | **33.27** | 0.017 |

**결과**: linear scaling, **2000 노드까지 33 ms** 안에 모든 vault parse. ms/file 가 N 증가에 따라 *감소* (warm-up + JIT) — 큰 vault 에 *비례적으로 더 효율적*. perf 친구션 0.

**의미**:
- AI agent 의 `list_concepts` / `find_orphans` / `query_concepts` 같은 *full-scan* 도구가 큰 vault 에서도 sub-second
- 사용자 codebase 가 *수천 .md* 도달해도 vault scaffold/탐색 부담 0
- 현재 dogfood (25 노드) 는 *상한 0.5%*. 향후 커져도 안전

**README "Verifiable promises" 추가 후보**: "Vault scale: 2,000 .md files walked + parsed in 33 ms (linear, ~17 µs/file)."
