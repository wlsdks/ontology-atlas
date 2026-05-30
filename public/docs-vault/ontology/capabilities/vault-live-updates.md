---
slug: capabilities/vault-live-updates
kind: capability
title: Vault Live Updates (5s polling + diff toast + graph pulse)
domain: vault-local-first
elements: [src/entities/docs-vault/lib/build-local-manifest.ts, src/features/docs-vault-local/lib/diff-manifest.ts, src/features/docs-vault-local/model/use-local-vault.ts, src/features/docs-vault-local/model/VaultDiffToaster.tsx, src/widgets/topology-map-sigma/lib/coord-preservation.ts, src/widgets/topology-map-sigma/lib/graph-build.ts, src/widgets/topology-map-sigma/lib/reducer-entrance.ts]
relates: [capabilities/builder-vault-write, capabilities/mcp-conflict-guard, capabilities/topology-sigma-render, domains/vault-local-first]
---

# Vault Live Updates (5s polling + diff toast + graph pulse)

R14 (#155-#158, 2026-05-04 ~ 2026-05-05) 에 도입된 *web 즉시 반영* 능력. 사용자 명시 *"웹에서나 잘 반영되면 좋겠는데? 그걸 강화하는건 어때"* 의 4 단계 답. IDE / AI agent / CLI 어느 surface 가 vault `.md` 만지면 웹 탭이 *focus 안 해도* ~5s 안에 반영.

## 4 단계 흐름

| Step | What | Where 인지 |
|---|---|---|
| #155 polling | 5s 간격 fingerprint check + visible-only 자동 reload | 백그라운드 |
| #156 graph diff pulse | 새 노드 amber sine 5s | `/topology` 그래프 |
| grow-in entrance | 라이브 등장 노드 size 0→full ease-out (`reducer-entrance.ts`) | `/topology` 그래프 |
| #157 added toast | `Added: <slug>` info toast | 모든 페이지 |
| #158 modified toast | `Edited: <slug>` success toast (mtime 변화) | 모든 페이지 |

## 핵심 결정

- **5초 간격** — 사람의 인지 갱신 속도 (≈"몇 초 안에 반영") 와 fingerprint 비용 (큰 vault 도 수십 ms) 의 sweet spot. 10s 면 답답, 1s 면 과한 cpu.
- **visibility-aware** — 탭 hidden 일 때 `clearInterval` 로 polling dispose (배터리 / cpu 절약). visible 복귀 시 재시작.
- **첫 mount baseline** — `prevMapRef.current === null` 일 때는 baseline 만 저장, toast 띄우지 않음 (false-positive 차단).
- **mtime null skip** — static manifest (build-time, mtime 없음) 와 비교는 의미 없으니 modified 판정 skip.
- **removed 무시** — 사용자 명시 `delete_concept` 명령은 자체 toast. polling 결과로 또 띄우면 noise.
- **grow-in entrance** — 라이브로 새로 등장한 노드는 size 0 근처에서 full 까지 ease-out 으로 *자라난다* (wedge 심장: "온톨로지가 토폴로지로 자라나는 게 보인다"). position 은 worker layout, size 만 `reducer-entrance.ts` 가 변조. 전역 가드(`now < enteringUntilRef`)로 평상시 hot-path 비용 0, 첫 로드는 seed 로 일괄 애니메이션 안 함, `prefers-reduced-motion` 은 즉시 full.
- **좌표 보존** — 라이브 변경으로 graph 가 rebuild 돼도 기존 노드는 *제자리* 를 유지하고 새 노드만 settle 위치로 들어온다(`coord-preservation.ts`). `useLayoutEffect` 가 paint 전에 직전 build 좌표를 복원 → renderer/worker 가 그 좌표로 seed → 전체 reflow 없이 "여기 새 노드가 돋아났다" 가 또렷. (charter perf north-star "증분/좌표 보존"; worker-layout-controller 가 현재 좌표로 seed 하므로 보존 좌표가 그대로 출발점.)
- **증분 재빌드 (changed-file-only)** — 변경마다 전체 vault 를 재독하던 `load` 가, 같은 vault 의 직전 빌드가 있으면 `rebuildLocalManifestIncremental`(`build-local-manifest.ts`)로 **변경된 `.md` 파일만 본문 재독·재파싱**하고 나머지는 직전 entry(doc + link context)를 재사용한다. mtime 동일 ⇒ 내용 동일 가정 — fingerprint skip 과 같은 가정. 트리·역참조·태그 집계는 in-memory 라 저렴(iter 1: derive ~6ms)해 매번 전체 수행 — 그래서 전체 빌드와 *동치*다(`aggregateBuild` 1개를 두 경로가 공유; `build-local-manifest.incremental.test.ts` 가 add/change/remove/no-op/rename 으로 byte-동치 보증, generatedAt 제외). 효과: 큰 vault 에서 에이전트가 파일 하나 고칠 때의 본문 재독 I/O 를 N→1 로. 첫 로드 / 다른 vault / 증분 throw 시엔 전체 빌드로 안전 폴백. (charter B 실시간 성능 north-star — "변경 파일/노드만 patch, 전체 재스캔 회피")

## diff helper 분리

`lib/diff-manifest.ts` 의 `diffVaultManifest(prev, current)` 는 React 외 dependency 없는 pure helper. 9 단위 case 로 added / modified / mtime 단조성 / null guard / overflow 분기 회귀 차단.

## 참조 PR

- #155 polling 5s
- #156 graph diff pulse
- #157 added toast (Set → Map<slug, mtime|null> 확장)
- #158 modified toast (mtime 비교)
