/**
 * `window.__atlasMap` 창구의 **타입 선언 정본.**
 *
 * ⚠️ **두 spec 이 각자 선언했다가 CI 가 잡았다** (2026-08-10):
 *
 * ```
 * tests/e2e/map-keyboard-walk.spec.ts(24,5): error TS2717:
 *   Subsequent property declarations must have the same type.
 *   Property '__atlasMap' must be of type 'AtlasProbe | undefined',
 *   but here has type 'AtlasMapProbe | undefined'.
 * ```
 *
 * `declare global` 로 같은 속성을 두 파일에서 선언하면 타입이 **한 글자라도** 다르면
 * 안 된다. 사본이 둘이면 어긋나는 쪽이 기본값이다(Carbon) — 여기 한 곳에 둔다.
 *
 * **로컬 `tsc` 는 이것을 놓쳤다.** 같은 명령(`pnpm exec tsc --noEmit`)인데 로컬은
 * 통과하고 CI 는 실패했다 — 증분 캐시가 이미 본 파일을 다시 검사하지 않았기 때문이다.
 * 그러니 「로컬 tsc 초록」은 이 종류의 충돌에 대해 증거가 아니다.
 *
 * 이 창구는 `?e2e=1` 이 붙은 페이지에서만 열린다(`use-topology-loop.ts`).
 */

export interface AtlasMapCamera {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
}

export interface AtlasMapNode {
  id: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  draggable: boolean;
  hidden: boolean;
  radius: number;
}

export interface AtlasMapProbe {
  camera: () => AtlasMapCamera | null;
  selection: () => { nodeId: string | null; edge: unknown };
  nodes: () => AtlasMapNode[];
  /**
   * 이번 프레임이 호버로 대접한 노드 id (없으면 null). 캔버스 위 커서와 옆
   * 패널(대화창·데이터시트) 줄 호버가 **같은 값**으로 나온다 — 프레임이 실제로
   * 쓴 값을 그대로 복사한 것이라 화면과 어긋날 수 없다.
   */
  hover: () => string | null;
}

declare global {
  interface Window {
    __atlasMap?: AtlasMapProbe;
  }
}
