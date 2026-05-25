---
slug: capabilities/vault-live-updates
kind: capability
title: Vault Live Updates (5s polling + diff toast + graph pulse)
domain: vault-local-first
elements:
  - src/features/docs-vault-local/lib/diff-manifest.ts
  - src/features/docs-vault-local/model/use-local-vault.ts
  - src/features/docs-vault-local/model/VaultDiffToaster.tsx
  - src/widgets/topology-map-sigma/lib/graph-build.ts
relates:
  - capabilities/builder-vault-write
  - capabilities/mcp-conflict-guard
  - capabilities/topology-sigma-render
  - domains/vault-local-first
---

# Vault Live Updates (5s polling + diff toast + graph pulse)

R14 (#155-#158, 2026-05-04 ~ 2026-05-05) 에 도입된 *web 즉시 반영* 능력. 사용자 명시 *"웹에서나 잘 반영되면 좋겠는데? 그걸 강화하는건 어때"* 의 4 단계 답. IDE / AI agent / CLI 어느 surface 가 vault `.md` 만지면 웹 탭이 *focus 안 해도* ~5s 안에 반영.

## 4 단계 흐름

| Step | What | Where 인지 |
|---|---|---|
| #155 polling | 5s 간격 fingerprint check + visible-only 자동 reload | 백그라운드 |
| #156 graph diff pulse | 새 노드 amber sine 5s | `/topology` 그래프 |
| #157 added toast | `Added: <slug>` info toast | 모든 페이지 |
| #158 modified toast | `Edited: <slug>` success toast (mtime 변화) | 모든 페이지 |

## 핵심 결정

- **5초 간격** — 사람의 인지 갱신 속도 (≈"몇 초 안에 반영") 와 fingerprint 비용 (큰 vault 도 수십 ms) 의 sweet spot. 10s 면 답답, 1s 면 과한 cpu.
- **visibility-aware** — 탭 hidden 일 때 `clearInterval` 로 polling dispose (배터리 / cpu 절약). visible 복귀 시 재시작.
- **첫 mount baseline** — `prevMapRef.current === null` 일 때는 baseline 만 저장, toast 띄우지 않음 (false-positive 차단).
- **mtime null skip** — static manifest (build-time, mtime 없음) 와 비교는 의미 없으니 modified 판정 skip.
- **removed 무시** — 사용자 명시 `delete_concept` 명령은 자체 toast. polling 결과로 또 띄우면 noise.

## diff helper 분리

`lib/diff-manifest.ts` 의 `diffVaultManifest(prev, current)` 는 React 외 dependency 없는 pure helper. 9 단위 case 로 added / modified / mtime 단조성 / null guard / overflow 분기 회귀 차단.

## 참조 PR

- #155 polling 5s
- #156 graph diff pulse
- #157 added toast (Set → Map<slug, mtime|null> 확장)
- #158 modified toast (mtime 비교)
