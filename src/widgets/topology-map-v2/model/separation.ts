/**
 * B7 — 노드 최소 분리 완화 (순수, 결정론).
 *
 * Guardian 실증: 클릭→다이브→리빌 여정의 결과 화면에서 리빌된 element 가
 * 프로젝트 육각형 각인과 정면 충돌했다. de-pileup 레이아웃은 링으로
 * 겹침을 피하지만, force sim + 드래그 견인이 자식을 부모 위로 밀 수 있다
 * ("우연히 닿는 픽셀 방치" — design.md AI-느낌 목록).
 *
 * 호출 시점은 caller 규약: **sim 활성(드래그/릴리즈 정착) 프레임에만**.
 * 호밍(자동 정렬·첫 지도 연출) 중에는 돌리지 않는다 — 연출의 의도적
 * 모임 상태를 흩뜨리지 않기 위해서이고, 호밍의 목적지(home)는 이미
 * 비겹침 레이아웃이다.
 */

export interface SeparationNode {
  id: string;
  x: number;
  y: number;
  /** 월드 반지름 (radiusForKind). */
  r: number;
}

export interface SeparationOptions {
  /** `--topology-v2-node-min-separation-ratio` — (rA+rB)×ratio 미만이면 밀어냄. */
  ratio: number;
  /** 완화 반복 횟수 (Guardian 처방 2). */
  iterations: number;
  /** 움직이면 안 되는 노드 (핀 드래그 중인 노드). */
  pinnedId?: string | null;
  /**
   * **이번 프레임에 실제로 움직인 노드들** (드래그 노드 + tug 이웃).
   *
   * 주면 «둘 다 정지» 인 쌍을 건너뛴다 — 정지-정지는 지난 프레임에 이미
   * 안 겹쳤으므로 이번에 새로 겹칠 수 없다. 밀린 정지 노드는 다음 반복의
   * 활성 집합에 합류하므로(연쇄 전파) A→B→C 밀림도 그대로 풀린다.
   *
   * 생략하면 전 노드가 활성 — **그 기본값이 2026-07-31 렉의 문법적 뿌리다**
   * (프레임당 900만 회 거리 계산, 그중 99.99%가 «둘 다 정지» 였다).
   * 호출부가 이미 이 집합을 갖고 있었는데(`dragAffectedSetRef`) 힘 시뮬만
   * 그걸 받고 겹침 해소는 안 받고 있었다.
   */
  activeIds?: ReadonlySet<string> | null;
}

/** 겹친 쌍을 축 방향으로 대칭(핀이면 상대만) 밀어낸다. 노드 배열을 제자리 수정. */
export function relaxNodeSeparation(nodes: SeparationNode[], options: SeparationOptions): void {
  const { ratio, iterations, pinnedId = null, activeIds = null } = options;
  const n = nodes.length;
  // 활성 집합이 있으면 인덱스 플래그로 바꿔 둔다 — 안쪽 루프에서 Set 조회를
  // 두 번 하는 것보다 배열 한 번이 싸다.
  const active = activeIds ? nodes.map((node) => activeIds.has(node.id)) : null;
  /*
   * **활성 인덱스를 오름차순으로 «들고» 다닌다** (2026-08-19, 3D 실측).
   *
   * 종전에도 «둘 다 정지» 인 쌍은 건너뛰었지만, 건너뛰려면 그 쌍을 일단
   * 방문해야 했다 — 바깥·안쪽 루프 자체는 여전히 N²/2 였다. 2D 에서는 밀도
   * 게이트가 접은 덕에 화면 노드가 100 안팎이라 이 낭비가 안 보였는데
   * (synth=2000 에서 2000개 중 화면은 101개), **3D 돔은 접지 않고 전부
   * 펼친다.** 그래서 같은 코드가 3D 에서 프레임당 200만 회를 「검사만 하고
   * 버리는」 데 썼고, 노드 드래그 p95 가 50.9ms(≈20fps)로 나왔다. 같은 조건의
   * 2D 는 3.5ms 였다.
   *
   * 비활성 i 의 안쪽 루프를 «활성인 j» 위로만 돌리면 방문 자체가 사라진다.
   * 활성 목록이 오름차순이므로 j 가 나오는 순서는 종전과 같고, 따라서
   * **처리되는 쌍의 집합도 순서도 한 자리도 달라지지 않는다** — 좌표를
   * 제자리에서 고치는 함수라 순서가 곧 결과다.
   */
  let activeIdx: number[] | null = null;
  if (active !== null) {
    activeIdx = [];
    for (let i = 0; i < n; i += 1) if (active[i]) activeIdx.push(i);
  }
  /** 오름차순 유지 삽입 — 새로 «움직인 것» 이 된 노드를 목록에 들인다. */
  const enlist = (k: number): void => {
    if (active === null || activeIdx === null || active[k]) return;
    active[k] = true;
    let lo = 0;
    let hi = activeIdx.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (activeIdx[mid] < k) lo = mid + 1;
      else hi = mid;
    }
    activeIdx.splice(lo, 0, k);
  };
  /** 첫 번째 «value 이상» 인 자리. */
  const lowerBound = (list: number[], value: number): number => {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  /** 한 쌍을 푼다. 실제로 밀었으면 true (연쇄 전파용). */
  const resolvePair = (i: number, j: number): boolean => {
    const a = nodes[i];
    const b = nodes[j];
    const minDist = (a.r + b.r) * ratio;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let dist = Math.hypot(dx, dy);
    if (dist >= minDist) return false;
    if (dist < 1e-6) {
      // 완전 동일 좌표 — 결정론적 축 선택 (id 순서 기반 수평 밀기).
      dx = 1;
      dy = 0;
      dist = 1;
    }
    const push = (minDist - dist) / dist;
    const px = dx * push;
    const py = dy * push;
    if (a.id === pinnedId) {
      b.x += px;
      b.y += py;
    } else if (b.id === pinnedId) {
      a.x -= px;
      a.y -= py;
    } else {
      a.x -= px / 2;
      a.y -= py / 2;
      b.x += px / 2;
      b.y += py / 2;
    }
    return true;
  };

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < n; i += 1) {
      // 이 노드도 정지고 상대도 전부 정지면 볼 이유가 없다. i 가 활성이면
      // 모든 j 를, 아니면 활성인 j 만 본다 — 어느 쪽이든 쌍 집합은 같다.
      // (종전과 마찬가지로 `iActive` 는 j 루프 «전» 에 한 번만 읽는다 —
      //  루프 도중 i 가 활성이 되어도 이번 패스의 열거는 바뀌지 않는다.)
      const iActive = active === null || active[i];
      if (iActive) {
        for (let j = i + 1; j < n; j += 1) {
          if (!resolvePair(i, j)) continue;
          // **연쇄 전파** — 밀린 정지 노드는 이제 «움직인 것» 이다. 다음
          // 반복에서 그가 또 누구를 미는지 봐야 A→B→C 가 풀린다. 이걸
          // 빠뜨리면 빨라지는 대신 겹침이 남는다.
          enlist(i);
          enlist(j);
        }
      } else if (activeIdx !== null) {
        // 활성인 j 만 오름차순으로. 이 경로에서 새로 활성이 되는 것은 i
        // 자신뿐이고(상대 j 는 이미 활성), i 를 지금 목록에 넣으면 아래
        // 커서가 밀린다 — 그래서 j 루프가 끝난 뒤에 넣는다. 위 주석대로
        // 이번 패스의 열거에는 영향이 없으므로 동작은 동일하다.
        let selfMoved = false;
        for (let p = lowerBound(activeIdx, i + 1); p < activeIdx.length; p += 1) {
          if (resolvePair(i, activeIdx[p])) selfMoved = true;
        }
        if (selfMoved) enlist(i);
      }
    }
  }
}
