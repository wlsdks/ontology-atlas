import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const observerSource = await readFile(new URL('../src-tauri/src/webview_verify/map_entry_observer.js', import.meta.url), 'utf8');

function createHarness({ href = 'tauri://localhost/ko/', unsupported = false, childFrame = false, webviewLabel = 'main' } = {}) {
  let now = 0;
  let clusters = [];
  let surfaces = [];
  let centerHit = null;
  let documentAnimations = [];
  let nextTimer = 0;
  let mutationCallback;
  let intersectionCallback;
  const intervals = new Map();
  const timeouts = new Map();
  const rafs = new Map();
  const media = new Map();
  const documentListeners = new Map();
  const cleanup = { mutations: 0, intersections: 0, longTasks: 0, cancelledFrames: 0 };

  class FakeNode {
    constructor({ attrs = {}, children = [], rect = { x: 0, y: 0, width: 20, height: 20 }, parent = null } = {}) {
      this.attrs = attrs;
      this.children = children;
      this.rect = { ...rect, right: rect.x + rect.width, bottom: rect.y + rect.height, left: rect.x, top: rect.y };
      this.parent = parent;
      for (const child of children) child.parent = this;
      this.animations = [];
      this.isConnected = true;
      this.inert = false;
      this.tagName = (attrs.tag ?? 'div').toUpperCase();
    }
    getAttribute(name) { return this.attrs[name] ?? null; }
    hasAttribute(name) { return name in this.attrs; }
    matches(selector) {
      if (selector === '.map-wait-orbit') return this.attrs.class === 'map-wait-orbit';
      if (selector === '[data-app-shell-pane]') return 'data-app-shell-pane' in this.attrs;
      if (selector === '[data-map-engine]') return 'data-map-engine' in this.attrs;
      if (selector === 'canvas[data-testid="ontology-map-canvas"]') return this.attrs.tag === 'canvas' && this.attrs['data-testid'] === 'ontology-map-canvas';
      const testId = selector.match(/data-testid="([^"]+)"/)?.[1];
      return testId ? this.attrs['data-testid'] === testId : false;
    }
    querySelectorAll(selector) {
      const all = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (child.matches(selector)) all.push(child);
          visit(child);
        }
      };
      visit(this);
      return all;
    }
    querySelector(selector) {
      if (selector === 'circle') return this.children.find((child) => child.attrs.tag === 'circle') ?? null;
      return null;
    }
    closest(selector) {
      const find = (node) => node ? (node.matches(selector) ? node : find(node.parent)) : null;
      return find(this);
    }
    contains(candidate) { return candidate === this || this.children.some((child) => child.contains(candidate)); }
    getBoundingClientRect() { return this.rect; }
    getAnimations() { return this.animations; }
  }

  class FakeCircle extends FakeNode {
    constructor(matrix) {
      super({ attrs: { tag: 'circle' } });
      this.matrix = matrix;
      this.cx = { baseVal: { value: 3 } };
      this.cy = { baseVal: { value: 4 } };
    }
    getScreenCTM() { return this.matrix; }
  }
  if (unsupported) FakeNode.prototype.getAnimations = undefined;

  class FakeDOMPoint {
    constructor(x, y) { this.x = x; this.y = y; }
    matrixTransform(matrix) {
      return new FakeDOMPoint(matrix.a * this.x + matrix.c * this.y + matrix.e, matrix.b * this.x + matrix.d * this.y + matrix.f);
    }
  }

  const html = new FakeNode({ attrs: { tag: 'html' } });
  html.classList = { values: new Set(), contains(value) { return this.values.has(value); } };
  const allKnownNodes = () => {
    const found = new Set();
    const addTree = (node) => { if (!node || found.has(node)) return; found.add(node); for (const child of node.children) addTree(child); };
    for (const surface of surfaces) addTree(surface);
    for (const cluster of clusters) {
      let root = cluster;
      while (root.parent) root = root.parent;
      addTree(root);
    }
    return [...found];
  };
  const document = {
    readyState: 'loading', hidden: false, visibilityState: 'visible',
    documentElement: html,
    querySelectorAll(selector) { return allKnownNodes().filter((node) => node.matches(selector)); },
    getAnimations: unsupported ? undefined : () => documentAnimations,
    elementFromPoint() { return centerHit; },
    addEventListener(name, callback) { documentListeners.set(name, callback); },
    removeEventListener(name) { documentListeners.delete(name); },
  };
  const window = {};
  window.window = window;
  window.self = window;
  window.top = childFrame ? {} : window;
  window.__TAURI_INTERNALS__ = { metadata: { currentWebview: { label: webviewLabel } } };
  let parsedLocation = null;
  try { parsedLocation = new URL(href); } catch {}

  const context = {
    window, self: window, document,
    location: {
      href,
      protocol: parsedLocation?.protocol ?? '',
      hostname: parsedLocation?.hostname ?? '',
      port: parsedLocation?.port ?? '',
      pathname: parsedLocation?.pathname ?? '',
      origin: 'null',
    },
    URL,
    performance: { now: () => now, timeOrigin: 1_000 },
    Date: { now: () => 2_000 },
    Element: FakeNode,
    DOMPoint: unsupported ? undefined : FakeDOMPoint,
    innerWidth: 1440, innerHeight: 900,
    getComputedStyle: (node) => node.style ?? {
      animationName: 'mapWaitOrbit', animationDuration: '3.84s', animationDelay: '0s',
      animationPlayState: 'running', animationIterationCount: 'infinite', transform: 'matrix(1, 0, 0, 1, 0, 0)',
      transformOrigin: '10px 10px', opacity: '1', display: 'block', visibility: 'visible',
    },
    matchMedia: unsupported ? undefined : (query) => {
      if (!media.has(query)) media.set(query, { matches: query.includes('no-preference'), addEventListener() {}, removeEventListener() {} });
      return media.get(query);
    },
    MutationObserver: class {
      constructor(callback) { mutationCallback = callback; }
      observe() {}
      disconnect() { cleanup.mutations += 1; }
    },
    IntersectionObserver: unsupported ? undefined : class {
      constructor(callback) { intersectionCallback = callback; }
      observe() {}
      disconnect() { cleanup.intersections += 1; }
    },
    PerformanceObserver: class { static supportedEntryTypes = []; disconnect() { cleanup.longTasks += 1; } },
    TextEncoder,
    setInterval(callback) { const id = ++nextTimer; intervals.set(id, callback); return id; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(callback) { const id = ++nextTimer; timeouts.set(id, callback); return id; },
    clearTimeout(id) { timeouts.delete(id); },
    requestAnimationFrame(callback) { const id = ++nextTimer; rafs.set(id, callback); return id; },
    cancelAnimationFrame(id) { rafs.delete(id); cleanup.cancelledFrames += 1; },
    console,
  };
  window.cancelAnimationFrame = context.cancelAnimationFrame;
  vm.createContext(context);
  const result = vm.runInContext(observerSource, context);

  const makeScene = ({ entry = true, overlay = false, matrix = { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 }, currentTime = 0 } = {}) => {
    const circle = new FakeCircle(matrix);
    const orbit = new FakeNode({ attrs: { class: 'map-wait-orbit' }, children: [circle] });
    orbit.animations = unsupported ? undefined : [{ currentTime, startTime: 0, playState: 'running', playbackRate: 1 }];
    if (unsupported) orbit.getAnimations = undefined;
    const cluster = new FakeNode({ attrs: { 'data-testid': 'map-wait-cluster', 'data-map-wait-motion': 'running' }, children: [orbit] });
    let root = cluster;
    if (entry) root = new FakeNode({ attrs: { 'data-testid': 'map-entry-fallback' }, children: [root] });
    if (overlay) root = new FakeNode({ attrs: { 'data-testid': 'map-navigation-wait' }, children: [root] });
    return { root, cluster, orbit, circle };
  };
  const makeSurface = ({ attrs, rect, style, children = [] }) => {
    const node = new FakeNode({ attrs, rect, children });
    node.style = { display: 'block', visibility: 'visible', opacity: '1', ...style };
    if (attrs.tag === 'canvas') {
      node.attrs.width ??= '1200';
      node.attrs.height ??= '800';
    }
    return node;
  };

  return {
    result, window, document, location: context.location, cleanup, media, makeScene, makeSurface,
    setClusters(value) { clusters = value; },
    setSurfaces(value) { surfaces = value; },
    setCenterHit(value) { centerHit = value; },
    setDocumentAnimations(value) { documentAnimations = value; },
    setRouteCrossfade(value) {
      if (value) html.classList.values.add('route-crossfade');
      else html.classList.values.delete('route-crossfade');
    },
    tick(ms = 100) { now += ms; for (const callback of [...intervals.values()]) callback(); },
    frame(ms = 16) { now += ms; const callbacks = [...rafs.values()]; rafs.clear(); for (const callback of callbacks) callback(now); },
    mutate() { mutationCallback?.([]); },
    intersect(target, isIntersecting = true) { intersectionCallback?.([{ target, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 }]); },
    deadline() { now += 45_000; for (const callback of [...timeouts.values()]) callback(); },
  };
}

test('installs before body exists and captures later entry, changing animation/CTM, replacement and removal', () => {
  const harness = createHarness();
  assert.equal(harness.result, 'installed');
  const initial = harness.window.__ontologyAtlasMapEntryDiagnostic.read();
  assert.equal(initial.readyStateAtInstall, 'loading');
  assert.equal(initial.sawEntry, false);

  const first = harness.makeScene({ currentTime: 10 });
  harness.setClusters([first.cluster]);
  harness.mutate();
  harness.tick();
  harness.intersect(first.cluster);
  first.orbit.animations[0].currentTime = 80;
  first.circle.matrix.e = 40;
  first.cluster.attrs['data-map-wait-motion'] = 'paused';
  harness.tick();

  const replacement = harness.makeScene({ currentTime: 5, matrix: { a: 1, b: 0, c: 0, d: 1, e: 70, f: 20 } });
  harness.setClusters([]);
  harness.mutate();
  harness.tick();
  harness.setClusters([replacement.cluster]);
  harness.mutate();
  harness.tick();
  harness.setClusters([]);
  harness.mutate();
  harness.tick();
  assert.equal(harness.window.__ontologyAtlasMapEntryDiagnostic.read().collectorStatus, 'collecting');
  harness.deadline();

  const complete = harness.window.__ontologyAtlasMapEntryDiagnostic.read();
  assert.equal(complete.collectorStatus, 'complete');
  assert.equal(complete.report.sawEntry, true);
  assert.equal(complete.report.stopReason, 'deadline-after-entry');
  assert.equal(complete.report.entrySpans.length, 2);
  assert.ok(complete.report.entrySpans.every((span) => typeof span.removedAt === 'number'));
  assert.ok(complete.report.events.some((event) => event.kind === 'node-removed'));
  const samples = complete.report.samples.flatMap((sample) => sample.clusters).flatMap((cluster) => cluster.orbits);
  assert.ok(samples.some((orbit) => orbit.animations[0].currentTime === 80));
  assert.ok(samples.some((orbit) => orbit.geometry.matrix[4] === 70));
  assert.ok(new Set(samples.map((orbit) => orbit.id)).size >= 2);
  assert.ok(harness.cleanup.mutations > 0 && harness.cleanup.intersections > 0 && harness.cleanup.cancelledFrames > 0);
});

test('no entry and overlay-only remain explicit non-reproductions at the deadline', () => {
  const empty = createHarness();
  empty.deadline();
  const emptyReport = empty.window.__ontologyAtlasMapEntryDiagnostic.read().report;
  assert.equal(emptyReport.sawEntry, false);
  assert.equal(emptyReport.stopReason, 'deadline-no-entry');

  const overlay = createHarness();
  const scene = overlay.makeScene({ entry: false, overlay: true });
  overlay.setClusters([scene.cluster]);
  overlay.tick();
  overlay.deadline();
  const overlayReport = overlay.window.__ontologyAtlasMapEntryDiagnostic.read().report;
  assert.equal(overlayReport.sawEntry, false);
  assert.equal(overlayReport.sawOverlay, true);
  assert.equal(overlayReport.stopReason, 'deadline-no-entry');
});

test('unsupported APIs are null or false rather than invented zeros', () => {
  const harness = createHarness({ unsupported: true });
  const scene = harness.makeScene();
  harness.setClusters([scene.cluster]);
  harness.tick();
  harness.setClusters([]);
  harness.tick();
  harness.deadline();
  const report = harness.window.__ontologyAtlasMapEntryDiagnostic.read().report;
  const orbit = report.samples.find((sample) => sample.clusters.length)?.clusters[0].orbits[0];
  assert.equal(report.support.matchMedia, false);
  assert.equal(report.support.intersectionObserver, false);
  assert.equal(report.support.getAnimations, false);
  assert.equal(report.support.documentAnimations, false);
  assert.equal(report.support.domPoint, false);
  assert.equal(orbit.animations, null);
  assert.equal(orbit.geometry.point, null);
  assert.deepEqual(Array.from(orbit.geometry.matrix), [1, 0, 0, 1, 10, 20]);
});

test('constant CTM is reported as constant without assigning a cause', () => {
  const harness = createHarness();
  const scene = harness.makeScene();
  harness.setClusters([scene.cluster]);
  harness.tick();
  harness.tick();
  harness.setClusters([]);
  harness.tick();
  harness.deadline();
  const matrices = harness.window.__ontologyAtlasMapEntryDiagnostic.read().report.samples
    .flatMap((sample) => sample.clusters).flatMap((cluster) => cluster.orbits).map((orbit) => orbit.geometry.matrix);
  assert.ok(matrices.length >= 2);
  assert.deepEqual(matrices[0], matrices[1]);
  assert.equal('rootCause' in harness.window.__ontologyAtlasMapEntryDiagnostic.read().report, false);
});

test('retains fixed presentation evidence for five seconds after DOM removal while timers continue across a long rAF gap', () => {
  const harness = createHarness();
  const scene = harness.makeScene();
  const canvas = harness.makeSurface({ attrs: { tag: 'canvas', 'data-testid': 'ontology-map-canvas', width: '1200', height: '800' } });
  const map = harness.makeSurface({ attrs: { 'data-map-engine': 'canvas-2d' }, children: [canvas] });
  const pane = harness.makeSurface({ attrs: { 'data-app-shell-pane': '' }, rect: { x: 100, y: 50, width: 1000, height: 800 } });
  harness.setSurfaces([pane, map]);
  harness.setRouteCrossfade(true);
  harness.setDocumentAnimations(Array.from({ length: 14 }, (_, index) => ({
    animationName: `transition-${index}`,
    currentTime: index * 10,
    startTime: 5,
    playState: 'running',
    effect: {
      pseudoElement: `::view-transition-${index}`,
      getComputedTiming: () => ({ phase: 'active', progress: index / 14, duration: 180 }),
    },
  })));
  harness.setCenterHit(harness.document.documentElement);
  harness.frame(16);
  harness.setClusters([scene.cluster]);
  harness.tick();
  harness.setClusters([]);
  harness.tick();
  const removedAt = 216;

  harness.setCenterHit(pane);
  for (let index = 0; index < 10; index += 1) harness.tick();
  harness.frame(480);
  harness.setCenterHit(canvas);
  harness.setDocumentAnimations([]);
  harness.tick();
  for (let index = 0; index < 38; index += 1) harness.tick();
  harness.deadline();

  const report = harness.window.__ontologyAtlasMapEntryDiagnostic.read().report;
  const postRemoval = report.samples.filter((sample) => sample.at > removedAt && sample.at <= removedAt + 5_000);
  assert.ok(postRemoval.length >= 45, '100ms timer evidence must survive for the five-second post-removal window');
  assert.ok(postRemoval.every((sample) => sample.clusters.length === 0));
  const gap = report.frameGaps.find((entry) => entry.gapMs === 1_680);
  assert.ok(gap);
  assert.ok(gap.at - gap.gapMs <= report.entrySpans[0].removedAt && gap.at >= report.entrySpans[0].insertedAt);

  const transition = report.samples.find((sample) => sample.presentationContext.viewTransitionAnimations.count === 14)?.presentationContext;
  assert.equal(transition.routeCrossfade, true);
  assert.equal(transition.viewTransitionAnimations.entries.length, 12);
  assert.equal(transition.viewTransitionAnimations.truncated, 2);
  assert.equal(transition.viewTransitionAnimations.entries[0].pseudoElement, '::view-transition-0');
  assert.equal(transition.viewTransitionAnimations.entries[0].timing.duration, 180);
  assert.ok(report.samples.some((sample) => sample.presentationContext.viewTransitionAnimations.count === 0));
  assert.ok(report.samples.some((sample) => sample.presentationContext.centerHit.tag === 'HTML'));
  assert.ok(report.samples.some((sample) => sample.presentationContext.centerHit.tag === 'other' && sample.presentationContext.centerHit.insideKnownPane));
  assert.ok(report.samples.some((sample) => sample.presentationContext.centerHit.tag === 'CANVAS' && sample.presentationContext.centerHit.insideKnownMap));
  const canvasState = transition.surfaces.find((surface) => surface.selector === 'canvas[data-testid="ontology-map-canvas"]');
  assert.equal(canvasState.first.canvas.width, '1200');
  assert.equal(canvasState.first.canvas.height, '800');
  assert.equal(canvasState.first.canvas.mapEngine, 'canvas-2d');
  assert.ok(report.samples.some((sample) => sample.presentationContext.renderTiming.lastRafAt === gap.at));
});

test('sample retention and encoded report size are bounded with explicit truncation', () => {
  const harness = createHarness();
  const scene = harness.makeScene();
  harness.setClusters([scene.cluster]);
  for (let index = 0; index < 310; index += 1) {
    scene.orbit.animations[0].currentTime = index;
    harness.tick();
  }
  harness.setClusters([]);
  harness.tick();
  harness.deadline();
  const report = harness.window.__ontologyAtlasMapEntryDiagnostic.read().report;
  assert.ok(report.samples.length <= 300);
  assert.ok(report.truncated.samples > 0);
  assert.ok(report.encodedBytes <= 200_000);
  assert.equal(report.stopReason, 'deadline-after-entry');
});

test('rejects every non-local or child-frame origin', () => {
  const local = createHarness();
  assert.equal(local.location.origin, 'null');
  assert.equal('username' in local.location, false);
  assert.equal('password' in local.location, false);
  assert.equal(local.result, 'installed');
  assert.equal(createHarness({ href: 'not a valid URL' }).result, 'origin-rejected');
  assert.equal(createHarness({ href: 'tauri://user:pass@localhost/ko/' }).result, 'origin-rejected');
  assert.equal(createHarness({ href: 'tauri://localhost:123/ko/' }).result, 'origin-rejected');
  assert.equal(createHarness({ href: 'tauri://localhost.evil.test/ko/' }).result, 'origin-rejected');
  assert.equal(createHarness({ href: 'https://localhost/ko/' }).result, 'origin-rejected');
  assert.equal(createHarness({ childFrame: true }).result, 'origin-rejected');
  assert.equal(createHarness({ webviewLabel: 'secondary' }).result, 'origin-rejected');
});

test('observer source is syntax-valid and exposes no write or generic bridge surface', () => {
  new vm.Script(observerSource);
  for (const forbidden of ['localStorage', 'sessionStorage', '.style =', '.setAttribute(', 'location.assign', 'location.replace', '__TAURI__', 'invoke(', 'textContent', 'innerHTML', 'outerHTML', 'getImageData', 'toDataURL']) {
    assert.equal(observerSource.includes(forbidden), false, forbidden);
  }
});
