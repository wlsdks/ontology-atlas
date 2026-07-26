---
slug: capabilities/vault-live-updates
kind: capability
title: Vault Live Updates (OS watch + adaptive polling + shared changeset)
display_ko: 폴더가 바뀌면 바로 반영
display_en: Live Folder Updates
domain: vault-local-first
elements: [elements/ontology-description-helper, src/entities/docs-vault/lib/build-local-manifest.ts, src/features/docs-vault-local/lib/diff-manifest.ts, src/features/docs-vault-local/model/use-local-vault.ts, src/features/docs-vault-local/model/VaultDiffToaster.tsx, src/widgets/topology-map-v2]
relates: [capabilities/mcp-conflict-guard, capabilities/studio-vault-write]
dependencies: [capabilities/topology-canvas-render]
---

# Vault Live Updates

IDE, AI agent, CLI가 vault `.md`를 바꾸면 Atlas가 현재 로컬-first 환경에
맞는 신호로 manifest를 갱신하고, 사람이 변경 사실과 변경 위치를 확인하게
하는 능력이다. Tauri 설치 앱은 OS file-watch를 우선하고, 브라우저의 File
System Access API 경로는 adaptive polling을 사용한다.

## 현재 흐름

| 환경/단계 | 현재 계약 | 표면 |
|---|---|---|
| 설치 앱 | Rust watcher의 `vault-changed` event → refresh | background |
| 웹 | visible일 때 fingerprint poll: quiet 5s, 변경 뒤 15s 동안 1.5s burst | background |
| 공통 reload | 변경 파일만 재독하는 incremental manifest; 실패/첫 로드 시 full fallback | data layer |
| 알림 | added/modified diff toast, self-write 중복 억제 | 앱 전역 |
| 의미 변경 | persisted session baseline과 현재 graph의 changeset | Topology, INDEX, 기록, activity |
| 시각 강조 | touched node를 topology-v2 fresh overlay로 표시; reduced motion이면 breathe 없음 | canvas |

## 핵심 결정

- **설치 앱은 event-first** — `TauriVaultWatchBridge`가 OS watch를 구독한다.
  권한/bridge 실패 시 web polling이 안전 fallback으로 남는다.
- **웹은 adaptive cadence** — 조용할 때 5초, 변경 감지 뒤 15초 동안 1.5초.
  FS Access API에는 directory-change event가 없으므로 backend 없는 현재 ceiling이다.
- **visibility-aware** — 탭이 hidden이면 poller를 정지하고 visible 복귀 시
  재시작한다. generation token이 in-flight poll의 이중 loop 재등록을 막는다.
- **첫 mount baseline** — `prevMapRef.current === null` 일 때는 baseline 만 저장, toast 띄우지 않음 (false-positive 차단).
- **mtime null skip** — static manifest (build-time, mtime 없음) 와 비교는 의미 없으니 modified 판정 skip.
- **removed 무시** — 사용자 명시 `delete_concept` 명령은 자체 toast. polling 결과로 또 띄우면 noise.
- **fresh는 TTL이 아니라 shared changeset** — local vault 최초 snapshot을
  복원/auto-mark하고 `computeOntologyChangeset`의 touched node를 지도,
  INDEX, 리뷰 링크, Git workbench, activity count가 함께 쓴다. 오래된
  Sigma의 5초 drag-aware cleanup 계약은 현재 renderer에 없다.
- **reduced motion** — fresh overlay의 breathe만 끄고 변경 사실은 stroke
  channel과 목록/카운트에서 유지한다.
- **증분 재빌드 (changed-file-only)** — 변경마다 전체 vault 를 재독하던 `load` 가, 같은 vault 의 직전 빌드가 있으면 `rebuildLocalManifestIncremental`(`build-local-manifest.ts`)로 **변경된 `.md` 파일만 본문 재독·재파싱**하고 나머지는 직전 entry(doc + link context)를 재사용한다. mtime 동일 ⇒ 내용 동일 가정 — fingerprint skip 과 같은 가정. 트리·역참조·태그 집계는 in-memory 라 저렴(iter 1: derive ~6ms)해 매번 전체 수행 — 그래서 전체 빌드와 *동치*다(`aggregateBuild` 1개를 두 경로가 공유; `build-local-manifest.incremental.test.ts` 가 add/change/remove/no-op/rename 으로 byte-동치 보증, generatedAt 제외). 효과: 큰 vault 에서 에이전트가 파일 하나 고칠 때의 본문 재독 I/O 를 N→1 로. 첫 로드 / 다른 vault / 증분 throw 시엔 전체 빌드로 안전 폴백. (charter B 실시간 성능 north-star — "변경 파일/노드만 patch, 전체 재스캔 회피")

## diff helper 분리

`lib/diff-manifest.ts` 의 `diffVaultManifest(prev, current)` 는 React 외 dependency 없는 pure helper. 9 단위 case 로 added / modified / mtime 단조성 / null guard / overflow 분기 회귀 차단.

## 역사

- #155 fixed polling 5s (후에 adaptive polling + Tauri watch로 대체)
- #156 graph diff pulse
- #157 added toast (Set → Map<slug, mtime|null> 확장)
- #158 modified toast (mtime 비교)

## 2026-07-26 freshness review

The shared open path tests whether `showDirectoryPicker` is callable and treats
cross-realm, polyfill, and Tauri-style picker cancellation as a normal return
to the prior state. A cancelled open therefore emits neither a false danger
state nor a misleading vault-change notification. The later adaptive cadence
and Tauri watcher described above supersede the original fixed five-second
refresh claim.
