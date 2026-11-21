// In-page probe for perf:web-open (Playwright init script) and perf:app-open (a <script> the perf
// build adds to every page). It records frame gaps, long tasks, load milestones and walk segments,
// and drives the map and Library walks with synthetic input, so both surfaces run the same walk.
// The app build replaces `__PERF_PROBE_COLLECTOR__` with the folder the harness reads reports from.
(() => {
  if (window.__perfProbe) return;
  const COLLECTOR = '__PERF_PROBE_COLLECTOR__';
  const posting = COLLECTOR.startsWith('/');
  const now = () => performance.now();
  const rawRaf = window.requestAnimationFrame.bind(window);
  const nextFrame = () => new Promise((resolve) => rawRaf(resolve));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const GAP_KEEP = 300;
  const LONG_GAP_MS = 50;

  // The map's and the Library's inspection hooks attach only under `?e2e=1`; keep it on every URL.
  const withE2e = (url) => {
    try {
      const next = new URL(url, location.href);
      if (next.origin !== location.origin || next.searchParams.has('e2e')) return url;
      next.searchParams.set('e2e', '1');
      return next.pathname + next.search + next.hash;
    } catch {
      return url;
    }
  };
  for (const method of ['pushState', 'replaceState']) {
    const inner = history[method];
    history[method] = function patched(state, title, url) {
      return inner.call(this, state, title, url === undefined || url === null ? url : withE2e(url));
    };
  }
  if (!new URLSearchParams(location.search).has('e2e')) history.replaceState(history.state, '', withE2e(location.href));

  const state = {
    page: `${performance.timeOrigin}`,
    timeOrigin: performance.timeOrigin,
    href: location.pathname,
    marks: {},
    frames: 0,
    firstFrameAt: null,
    maxGap: 0,
    maxGapAt: null,
    gaps: [],
    longtasks: [],
    loafs: [],
    segments: {},
    census: null,
    progress: null,
    progressSeen: false,
    screen: [],
    hiddenMs: 0,
    log: [],
  };
  const mark = (name, at = now()) => {
    if (state.marks[name] === undefined) state.marks[name] = Math.round(at);
  };
  const note = (text) => {
    state.log.push(`${Math.round(now())} ${text}`);
    if (state.log.length > 80) state.log.shift();
  };
  let segment = null;

  // Work inside the page's own animation-frame callbacks, as tests/e2e/map/frame-work.ts measures it.
  const frameWork = new Map();
  window.requestAnimationFrame = (callback) =>
    rawRaf((t) => {
      const start = now();
      try {
        callback(t);
      } finally {
        if (segment) frameWork.set(t, (frameWork.get(t) ?? 0) + now() - start);
      }
    });

  const keepGap = (gap) => {
    state.gaps.push(gap);
    if (state.gaps.length > GAP_KEEP * 2) {
      state.gaps.sort((a, b) => b.ms - a.ms);
      state.gaps.length = GAP_KEEP;
    }
  };
  let last = null;
  const onFrame = (t) => {
    state.frames += 1;
    if (state.firstFrameAt === null) state.firstFrameAt = t;
    if (last !== null) {
      const gap = t - last;
      if (segment) segment.intervals.push(gap);
      if (gap > state.maxGap) {
        state.maxGap = gap;
        state.maxGapAt = last;
      }
      if (gap > LONG_GAP_MS) keepGap({ at: Math.round(last), ms: Math.round(gap), segment: segment?.name ?? null });
    }
    last = t;
    if (state.frames % 15 === 0) readScreen();
    rawRaf(onFrame);
  };
  rawRaf(onFrame);
  // A hidden WebView runs no frames but still runs (throttled) timers.
  setInterval(() => {
    if (document.visibilityState === 'hidden') readScreen();
  }, 250);
  // A hidden page runs no frames, so the gap across it is not a task.
  let hiddenSince = document.visibilityState === 'hidden' ? now() : null;
  document.addEventListener('visibilitychange', () => {
    last = null;
    if (document.visibilityState === 'hidden') hiddenSince = now();
    else if (hiddenSince !== null) {
      state.hiddenMs += now() - hiddenSince;
      hiddenSince = null;
    }
  });

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.longtasks.push({ at: Math.round(entry.startTime), ms: Math.round(entry.duration), segment: segment?.name ?? null });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    state.longtasks = null;
  }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < 200) continue;
        state.loafs.push({
          at: Math.round(entry.startTime),
          ms: Math.round(entry.duration),
          scripts: (entry.scripts ?? []).slice(0, 5).map((s) => ({
            ms: Math.round(s.duration),
            fn: s.sourceFunctionName || s.invoker || '',
            url: (s.sourceURL || '').replace(/^.*\/_next\//, '_next/'),
            char: s.sourceCharPosition,
          })),
        });
        if (state.loafs.length > 60) state.loafs.shift();
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {
    state.loafs = null;
  }

  const firstPaint = () => {
    const paint = performance.getEntriesByType('paint').find((entry) => entry.name === 'first-contentful-paint');
    return paint ? paint.startTime : state.firstFrameAt;
  };

  // Load milestones from what the screen shows: the census count and the reading line. Every
  // change is kept, because a fallback census can show before the folder's own concepts do.
  let expectConcepts = null;
  function readScreen() {
    const census = document.querySelector('[data-testid="topology-index-census"]');
    const count = census ? Number.parseInt((census.textContent || '').trim(), 10) : NaN;
    const progress = document.querySelector('[data-vault-load-progress]')?.getAttribute('data-vault-load-progress') ?? null;
    const starter = Boolean(document.querySelector('[data-testid="first-run-starter"]'));
    const canvas = Boolean(document.querySelector('canvas[data-testid="ontology-map-canvas"]'));
    const next = { census: Number.isFinite(count) ? count : null, progress, starter, canvas };
    const prev = state.screen.at(-1);
    if (!prev || prev.census !== next.census || (prev.progress === null) !== (progress === null) || prev.starter !== starter || prev.canvas !== canvas) {
      state.screen.push({ at: Math.round(now()), ...next });
      if (state.screen.length > 200) state.screen.splice(1, 1);
    }
    state.census = next.census;
    state.progress = progress;
    if (progress) state.progressSeen = true;
    const opened = state.marks.picked !== undefined || posting;
    const ours = state.progressSeen || (expectConcepts !== null && next.census >= expectConcepts);
    // The census needs no frame, so it still times the load in a hidden page, where the map never mounts.
    const onLibrary = expectConcepts === 0 && location.pathname.includes('/library');
    if (opened && !starter && (onLibrary || (ours && next.census > 0))) {
      mark('censusShown');
      if (!progress) mark('censusComplete');
    }
    // A vault without concepts opens on the Library, so the Sources home's first rows are the first content shown.
    const library = expectConcepts === 0 ? sourcesHome() : null;
    if (opened && !starter && library && library.rows > 0) {
      mark('firstConcepts');
      if (!progress && !library.reading) mark('loaded');
    }
    if (opened && ours && !starter && canvas && next.census > 0) {
      mark('firstConcepts');
      if (!progress) mark('loaded');
    }
  }

  const pointer = (target, type, x, y, buttons) =>
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y,
      pointerId: 1, pointerType: 'mouse', isPrimary: true,
      button: type === 'pointermove' ? -1 : 0, buttons,
    }));

  async function inSegment(name, run) {
    segment = { name, start: now(), intervals: [] };
    frameWork.clear();
    let error = null;
    try {
      await run();
    } catch (e) {
      error = String(e && e.message ? e.message : e).slice(0, 200);
    }
    const done = segment;
    segment = null;
    const sorted = [...done.intervals].sort((a, b) => a - b);
    const work = [...frameWork.values()].filter((ms) => ms >= 0.4).sort((a, b) => a - b);
    const p95 = (list) => (list.length ? list[Math.min(list.length - 1, Math.floor(list.length * 0.95))] : null);
    state.segments[name] = {
      at: Math.round(done.start),
      ms: Math.round(now() - done.start),
      frames: sorted.length,
      intervalP95: p95(sorted),
      intervalMax: sorted.at(-1) ?? null,
      workP95: p95(work),
      workMax: work.at(-1) ?? null,
      error,
    };
    return state.segments[name];
  }

  const sweep = async (canvas, frames, buttons = 0, path = null) => {
    const r = canvas.getBoundingClientRect();
    for (let i = 0; i < frames; i += 1) {
      const a = (i / frames) * Math.PI * 2;
      const [x, y] = path ? path(i, r) : [r.left + r.width / 2 + Math.cos(a) * r.width * 0.3, r.top + r.height / 2 + Math.sin(a) * r.height * 0.3];
      pointer(canvas, 'pointermove', x, y, buttons);
      await nextFrame();
    }
  };

  async function walkMap() {
    const canvas = document.querySelector('canvas[data-testid="ontology-map-canvas"]');
    if (!canvas) throw new Error('no map canvas');
    const r = canvas.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    await inSegment('first-hover', () => sweep(canvas, 120));
    await wait(800);
    const nodes = window.__atlasMap ? window.__atlasMap.nodes().filter((n) => !n.hidden && n.x > r.width * 0.1 && n.x < r.width * 0.9 && n.y > r.height * 0.1 && n.y < r.height * 0.9) : [];
    // Background for the pan: the grid point farthest from any drawn node.
    let background = [r.left + r.width * 0.12, r.top + r.height * 0.15];
    if (nodes.length) {
      let best = -1;
      for (let gx = 0.15; gx <= 0.85; gx += 0.07) for (let gy = 0.15; gy <= 0.85; gy += 0.07) {
        const x = r.width * gx;
        const y = r.height * gy;
        let near = Infinity;
        for (const n of nodes) near = Math.min(near, Math.hypot(n.x - x, n.y - y) - n.radius);
        if (near > best) {
          best = near;
          background = [r.left + x, r.top + y];
        }
      }
    }
    await inSegment('pan', async () => {
      const [x0, y0] = background;
      pointer(canvas, 'pointerdown', x0, y0, 1);
      await sweep(canvas, 90, 1, (i) => [x0 + i * 3, y0 + i * 1.5]);
      pointer(canvas, 'pointerup', x0 + 270, y0 + 135, 0);
    });
    await wait(1200);
    await inSegment('zoom', async () => {
      for (let i = 0; i < 60; i += 1) {
        canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, deltaY: i < 30 ? -40 : 40, deltaMode: 0 }));
        await nextFrame();
      }
    });
    await wait(1200);
    const fresh = window.__atlasMap ? window.__atlasMap.nodes().filter((n) => n.draggable && !n.hidden && n.x > r.width * 0.2 && n.x < r.width * 0.8 && n.y > r.height * 0.2 && n.y < r.height * 0.8) : [];
    if (fresh.length) {
      const target = fresh.sort((a, b) => Math.hypot(a.x - r.width / 2, a.y - r.height / 2) - Math.hypot(b.x - r.width / 2, b.y - r.height / 2))[0];
      await inSegment('drag', async () => {
        const x0 = r.left + target.x;
        const y0 = r.top + target.y;
        pointer(canvas, 'pointerdown', x0, y0, 1);
        await sweep(canvas, 90, 1, (i) => [x0 + Math.sin(i / 10) * 120, y0 + i]);
        pointer(canvas, 'pointerup', x0, y0 + 90, 0);
      });
      await wait(1200);
    } else note('drag skipped: no draggable node on screen (needs the ?e2e=1 hook)');
    await inSegment('hover', () => sweep(canvas, 120));
    return state.segments;
  }

  async function until(test, capMs, label) {
    const start = now();
    while (now() - start < capMs) {
      try {
        if (test()) return true;
      } catch {}
      await wait(100);
    }
    note(`gave up waiting for ${label} after ${capMs} ms`);
    return false;
  }

  /** The Sources home as drawn: its rows in the DOM and whether the folder is still being read. */
  function sourcesHome() {
    const overview = document.querySelector('[data-testid="sources-overview"]');
    if (!overview) return null;
    return {
      rows: overview.querySelectorAll('[data-testid="sources-row"]').length,
      reading: overview.querySelector('[data-testid="sources-reading"]') !== null,
    };
  }

  async function walkLibrary({ capMs = 180000, settleMs = 10000 } = {}) {
    const link = [...document.querySelectorAll('[data-testid="app-nav-rail"] a[href]')].find((a) => /\/library\/?(\?|$)/.test(a.getAttribute('href') || ''));
    if (!link) throw new Error('no Library link in the rail');
    mark('libraryNav');
    link.click();
    const ready = await until(() => {
      const home = sourcesHome();
      return home !== null && home.rows > 0 && !home.reading;
    }, capMs, 'the Sources home');
    if (!ready) return { ready: false };
    mark('libraryReady');
    await wait(settleMs);
    mark('libraryQuiet');
    const row = document.querySelector('[data-testid="sources-overview"] [data-testid="sources-row"]');
    if (!row) {
      note('no rows on the Sources home');
      return { ready: true, rows: 0 };
    }
    const label = row.querySelector('button')?.title ?? '';
    let firstFrameMs = null;
    let pressMs = null;
    await inSegment('row-pick', async () => {
      const pressed = now();
      row.click();
      pressMs = now() - pressed;
      // A frame's timestamp is its start, so the frame that drew the picked row's panel has ended
      // when the next one starts.
      while (now() - pressed < 15000) {
        await nextFrame();
        if (document.querySelector('[data-testid="sources-panel-clear"]')) {
          await nextFrame();
          firstFrameMs = now() - pressed;
          break;
        }
      }
    });
    state.rowPick = { label, firstFrameMs, pressMs };
    return state.rowPick;
  }

  function read() {
    const fp = firstPaint();
    const after = (list) => (list ?? []).filter((entry) => fp === null || entry.at >= fp);
    const longtasks = after(state.longtasks);
    const longest = longtasks.reduce((best, entry) => (entry.ms > (best?.ms ?? 0) ? entry : best), null);
    const gaps = after(state.gaps).sort((a, b) => b.ms - a.ms);
    return {
      page: state.page,
      timeOrigin: state.timeOrigin,
      href: location.pathname + location.search,
      at: Math.round(now()),
      firstPaint: fp === null ? null : Math.round(fp),
      marks: state.marks,
      census: state.census,
      screen: state.screen,
      progress: state.progress,
      progressSeen: state.progressSeen,
      frames: state.frames,
      longestTask: state.longtasks === null ? null : longest,
      longtasksOver50: state.longtasks === null ? null : longtasks.length,
      longtasks: state.longtasks === null ? null : [...longtasks].sort((a, b) => b.ms - a.ms).slice(0, 40),
      longestGap: gaps[0] ?? null,
      gapsOver50: gaps.length,
      gaps: gaps.slice(0, 40),
      loafs: state.loafs,
      segments: state.segments,
      rowPick: state.rowPick ?? null,
      jsHeapMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      visibility: document.visibilityState,
      hiddenMs: Math.round(state.hiddenMs + (hiddenSince === null ? 0 : now() - hiddenSince)),
      log: state.log,
    };
  }

  const expect = (count) => {
    expectConcepts = count;
  };
  window.__perfProbe = { mark, read, walkMap, walkLibrary, note, expect };

  if (!posting) return;
  // In the app the probe reports through the app's own file commands into a folder the harness
  // granted, and runs the walks the harness asked for. WebKit blocks http fetches from tauri://.
  const invoke = (command, args) =>
    window.__TAURI_INTERNALS__ ? window.__TAURI_INTERNALS__.invoke(command, args) : Promise.reject(new Error('no __TAURI_INTERNALS__'));
  const pageFile = `page-${state.page.replace(/\D/g, '')}.json`;
  // The verifier prints the page title, so a report that cannot be written still says why.
  const post = () =>
    invoke('write_vault_text_file', { rootPath: COLLECTOR, relativePath: pageFile, content: JSON.stringify(read()) }).catch((e) => {
      note(`report failed: ${e}`);
      document.title = `perf-probe: ${String(e).slice(0, 160)}`;
    });
  setInterval(post, 1000);
  (async () => {
    await until(() => window.__TAURI_INTERNALS__, 10000, 'the Tauri bridge');
    let config = null;
    for (let attempt = 0; attempt < 50 && config === null; attempt += 1) {
      config = await invoke('read_vault_text_file', { rootPath: COLLECTOR, relativePath: 'config.json' }).then((file) => JSON.parse(file.text)).catch(() => null);
      if (config === null) await wait(200);
    }
    if (!config) return note('no harness config');
    expectConcepts = config.expectConcepts ?? null;
    if (config.page && config.page !== 'any' && !location.pathname.startsWith(config.page)) return;
    const hidden = () => document.visibilityState === 'hidden';
    const loaded = await until(() => state.marks.loaded !== undefined || (hidden() && state.marks.censusComplete !== undefined), config.capMs ?? 600000, 'loaded');
    if (!loaded) return post();
    await wait(config.settleMs ?? 15000);
    mark('settled');
    post();
    if (hidden()) note('walks skipped: the page is hidden (screen locked or window covered), so it runs no frames');
    for (const walk of hidden() ? [] : config.walks ?? []) {
      mark(`${walk}Start`);
      try {
        if (walk === 'map') await walkMap();
        else if (walk === 'library') await walkLibrary(config.library ?? {});
      } catch (e) {
        note(`${walk} walk failed: ${e && e.message ? e.message : e}`);
      }
      mark(`${walk}Done`);
      post();
      await wait(config.settleMs ?? 15000);
      mark(`${walk}Settled`);
      post();
    }
    mark('walksDone');
    post();
  })();
})();
