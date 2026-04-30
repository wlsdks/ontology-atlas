# Phase 3 — 토폴로지 3000+ 노드 스케일링

**상태**: 로드맵. Phase 1·2는 main에 통합됨. Phase 3는 다음 세션에서 착수.

## 1. 현재 지표

Phase 1(React.memo + d3-force-reuse + onlyRenderVisibleElements) + Phase 2(zoom-based LOD) + **Phase 3 A1 (Web Worker sim)** 적용 후:

| N 노드 | mount | idle FPS | **drag FPS** | 판정 |
| --- | --- | --- | --- | --- |
| 500 | 2.0s | 93 | **34** | 양호 |
| 1000 | 4.3s | 34 | **16** | 쓸만 |
| 2000 | 10.1s | 10 | **10** | 경계 |
| 3000 | 17.1s | 3 | **8** | **실사용 불가** |

Worker 이전 전(Phase 2 최종) 대비 변화:
- N=500: 27→34 (+26%), 메인 스레드 여유가 실제 입력 반응성에 기여.
- N=1000~3000: 오차 범위. **React/SVG 재조정이 실질 병목**임이 측정으로 확증.
  d3-force가 main thread를 점유하던 상황이 아니라 렌더 파이프라인이 상한.

목표: **N=3000에서 drag FPS ≥ 30**, mount ≤ 5s. A1만으로는 미도달.
A2(Cluster aggregation)로 동시 표시 노드 수를 구조적으로 낮춰야 목표 접근 가능.

벤치 스크립트: `tests/e2e/stress-perf.spec.ts`
재현 경로: `/dev/stress-topology/?n=N` + `window.__synthProjects` 주입 (`NEXT_PUBLIC_ENABLE_STRESS_TEST=1` 필요)

## 2. 리서치 결론 요약

레퍼런스 조사(Obsidian Forum, React Flow 공식 perf 가이드, Cytoscape WebGL preview, d3-force-reuse BSD-3 등)에서 **SVG 재조정이 진짜 병목**이라는 일관된 근거. 물리는 부차적. Phase 1·2의 4× 개선은 React reconciliation 감축에서 거의 나왔음.

남은 병목 근거:
- SVG path(edge)들이 React Flow 내부에서 reconcile.
- Transform 업데이트 시 DOM node 전체 paint 트리거.
- 1000+ 시 style recalc 누적.

## 3. 경로 선택

### 경로 A — 점진 개선 (Web Worker + Cluster aggregation)

**기대**: 3000에서 drag 20–30fps. 기존 아키텍처 유지. 2주 수준 작업.

#### A1. Web Worker로 d3-force 이전
- 파일: `src/widgets/topology-canvas/lib/sim-worker.ts` (new)
- 메시지 프로토콜:
  ```ts
  type MainToWorker =
    | { type: 'init'; nodes: SimNodeInit[]; links: SimLink[]; bounds: CategoryBounds }
    | { type: 'start-drag'; id: string; x: number; y: number }
    | { type: 'update-drag'; id: string; x: number; y: number }
    | { type: 'end-drag'; id: string }
    | { type: 'reheat'; alpha: number };

  type WorkerToMain =
    | { type: 'tick'; positions: Float32Array /* [id-index, x, y, ...] */ }
    | { type: 'settled' };
  ```
- Transferable `Float32Array`로 zero-copy 위치 전송.
- 메인 스레드는 순수 렌더만 담당 → drag 중 main thread가 물리로 막히지 않음.
- 라이선스 클린(d3-force ISC + d3-force-reuse BSD-3 모두 번들).
- Next.js 16 Turbopack은 `new Worker(new URL('./sim-worker.ts', import.meta.url))` 지원.

참고 코드 (레퍼런스, 복사 전 라이선스 확인):
- Observable — d3 force-directed web worker (ISC 호환 패턴)
- markuslerner/d3-webworker-pixijs (MIT)
- zakjan/b370057 gist (BSD-3)

#### A2. Zoom-based Cluster Aggregation
- `zoom < 0.35`에서 카테고리별 aggregate 노드 하나만 렌더.
- 개별 프로젝트 노드는 `display:none` (sim은 유지, sim 비용만 존재).
- aggregate 노드 정보: 카테고리명 + 프로젝트 개수 + 허브 수.
- 클릭하면 해당 카테고리 중심으로 zoom-in (1.0).
- 구현 위치: TopologyCanvas의 `flowNodes` 계산에 lodBand 분기.

#### A3. 엣지 LOD (선택)
- 같은 zoom < 0.35에서 허브↔허브 엣지만 렌더. 나머지 비허브 엣지는 제외.
- flowEdges에 filter 추가.

### 경로 B — 아키텍처 교체 (react-force-graph)

**기대**: 10K+ 노드까지 스무스. 큰 리스크.

- 패키지: `react-force-graph` (MIT) — PIXI.js + d3-force 내장.
- 리스크: React Flow의 Handle / minimap / edge markers / custom node 스타일이 react-force-graph에서는 다르게 구현돼야 함. 드로어·선택·허브 강조 등 기존 UI 대부분 재구성 필요.
- 대안: `@nivo/network` (MIT), `cytoscape.js` WebGL preview (MIT).

**착수 전 반드시**:
1. Phase 1·2 + 경로 A1·A2까지 해 보고 여전히 부족한 경우에만.
2. 기존 UX(드로어, 허브 배지, featured path, focus mode)가 교체 라이브러리에서 구현 가능한지 확인.
3. 마이그레이션 중 기존 React Flow 코드를 병행 유지할지 결정.

## 4. 단계별 착수 순서

1. **A1 Web Worker** 먼저. 측정이 가장 예측 가능하고 회귀 위험 낮음.
2. A1 적용 후 3000 drag FPS 재측정.
3. 부족하면 **A2 Cluster aggregation** 추가.
4. A1+A2로 30fps 못 맞추면 **경로 B** 검토.

## 5. 완료 기준

- `pnpm exec playwright test tests/e2e/stress-perf.spec.ts`에서
  - N=3000 mount < 5s
  - N=3000 drag FPS ≥ 30
- Firestore 실 데이터로 로그인 후 홈 진입·노드 드래그 체감 "버벅임 없음"
- 기존 회귀 spec 40+ 모두 통과

## 6. 피해야 할 것

- **emulator 없는 환경에서 기존 `public-topology.spec.ts` 15건 실패는 현재로선 알려진 상태**. A1·A2 작업이 이 실패 수를 늘리지 않기만 하면 된다.
- 드래그 중 sim 정지(alpha=0) 같은 단기 해결책은 UX를 바꿔(주변 노드 반응 사라짐) 장기적으로 비용이 더 크다. A1 Web Worker로 근본 해결이 원칙.

## 7. 라이선스 메모

현재 프로젝트는 **내부 사용 + 공개 포트폴리오** 성격. Phase 3에 편입할 외부 코드는 아래 라이선스만 허용:

- MIT · Apache-2.0 · BSD-2/3-Clause · ISC
- AGPL·GPL·SSPL·상용 라이선스 **금지**
- 리버스 엔지니어링된 closed-source 구현(Obsidian 그래프 뷰 등) **금지**. 아이디어·UI 패턴 참고는 가능.

---

참고 문헌(2026-04 시점 공개 자료):

- React Flow — Performance: https://reactflow.dev/learn/advanced-use/performance
- D3 force — https://d3js.org/d3-force/simulation
- d3-force-reuse — https://github.com/twosixlabs/d3-force-reuse (BSD-3)
- Cytoscape.js WebGL preview — https://blog.js.cytoscape.org/2025/01/13/webgl-preview/ (MIT)
- Sigma.js — https://www.sigmajs.org/ (MIT)
- react-force-graph — https://github.com/vasturiano/react-force-graph (MIT)
