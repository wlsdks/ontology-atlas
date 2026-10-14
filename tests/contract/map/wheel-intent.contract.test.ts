import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/**
 * A map inside a scrolling document must not swallow the page wheel: `preventDefault()` must come
 * after the page-scroll early return. The defect is the order of two statements, which no single
 * lint selector can express.
 */
describe('wheel intent — 스크롤하는 문서 안의 지도', () => {
  const handlers = read('src/widgets/ontology-map/ui/input/topology-pointer-zoom.ts');

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
    const widget = read('src/widgets/ontology-map/ui/OntologyMap.tsx');
    // `none` swallows vertical swipes too, so the page does not move at all on a phone.
    expect(widget).toMatch(/wheelIntent === "page-scroll" \? "pan-y" : "none"/);
  });

  it('워크벤치는 기본값으로 현행 동작을 유지한다', () => {
    expect(handlers).toMatch(/wheelIntent = "zoom"/);
    const widget = read('src/widgets/ontology-map/ui/OntologyMap.tsx');
    expect(widget).toMatch(/wheelIntent = "zoom"/);
  });

  it('워크벤치는 page-scroll 을 넘기지 않는다', () => {
    // The workbench (HomePage) does not pass it — doing so would kill map zoom.
    const home = read('src/views/home/ui/HomePage.tsx');
    expect(home).not.toMatch(/wheelIntent/);
  });
});
