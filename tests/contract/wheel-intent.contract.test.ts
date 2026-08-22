import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/**
 * **A map inside a scrolling document must not swallow the page's wheel.**
 *
 * A P0 caught by the motion seat's measurement on 2026-07-28: the canvas on
 * `/download` covers **62.1%** of the viewport, and the wheel handler called
 * `preventDefault()` unconditionally, ahead of every guard. The listener is
 * attached with `{ passive: false }`, so **the first thing a visitor landing on
 * the page does — scroll — did nothing except zoom the map.** The entire sales
 * argument (thesis, the human/agent columns, verification) sits below the fold and
 * was unreachable. With `touch-action: none` it was worse on a phone.
 *
 * The cause is not a bug but **a premise leaking**: in the workbench the map is
 * the whole screen and there is no page to scroll, so that line is correct there.
 * The decision leaked to a surface where its premise does not hold — the failure
 * pattern this repository already named on the studio width gate.
 *
 * **Why a contract test (a layer lint cannot see).** The defect is not **the
 * presence of one line** but **the order of two** — is `preventDefault()` before
 * the early return. `no-restricted-syntax` cannot ask "is this call after that
 * guard" with a single selector. And no literal survives into the render output,
 * so it is outside the reach of value checks (exactly the layer this repository
 * classifies as "the value is right and nothing catches it").
 */
describe('wheel intent — 스크롤하는 문서 안의 지도', () => {
  const handlers = read('src/widgets/topology-map-v2/ui/topology-pointer-handlers.ts');

  it('page-scroll 의도에서는 preventDefault 보다 먼저 빠져나간다', () => {
    const start = handlers.indexOf('const handleWheel');
    expect(start).toBeGreaterThan(-1);
    const body = handlers.slice(start, start + 900);

    const bail = body.indexOf('wheelIntent === "page-scroll"');
    const prevent = body.indexOf('e.preventDefault()');

    expect(bail).toBeGreaterThan(-1);
    expect(prevent).toBeGreaterThan(-1);
    // The order is the whole contract. Invert it and the trap returns.
    expect(bail).toBeLessThan(prevent);
  });

  it('명시적 핀치는 여전히 줌이다 — 평 휠만 페이지에 양보한다', () => {
    const start = handlers.indexOf('const handleWheel');
    const body = handlers.slice(start, start + 900);
    // Dropping `!e.ctrlKey` kills zoom entirely on the gateway (the opposite regression).
    expect(body).toMatch(/wheelIntent === "page-scroll" && !e\.ctrlKey/);
  });

  it('세로 스와이프도 같은 계약을 탄다 — touch-action 이 의도를 따라간다', () => {
    const widget = read('src/widgets/topology-map-v2/ui/TopologyMapV2.tsx');
    // `none` swallows vertical swipes too, so the page does not move at all on a phone.
    expect(widget).toMatch(/wheelIntent === "page-scroll" \? "pan-y" : "none"/);
  });

  it('워크벤치는 기본값으로 현행 동작을 유지한다', () => {
    expect(handlers).toMatch(/wheelIntent = "zoom"/);
    const widget = read('src/widgets/topology-map-v2/ui/TopologyMapV2.tsx');
    expect(widget).toMatch(/wheelIntent = "zoom"/);
  });

  it('관문만 page-scroll 을 옵트인한다', () => {
    const stage = read('src/views/download/ui/StageMap.tsx');
    expect(stage).toMatch(/wheelIntent="page-scroll"/);

    // The workbench (HomePage) does not pass it — doing so would kill map zoom.
    const home = read('src/views/home/ui/HomePage.tsx');
    expect(home).not.toMatch(/wheelIntent/);
  });
});
