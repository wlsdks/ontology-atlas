/* Fixed, read-only native map-entry diagnostic. No product state is modified. */
(() => {
  'use strict';

  const GLOBAL = '__ontologyAtlasMapEntryDiagnostic';
  const VERSION = 1;
  const SAMPLE_CAP = 300;
  const EVENT_CAP = 160;
  const GAP_CAP = 300;
  const LONG_TASK_CAP = 120;
  const BYTE_CAP = 200_000;
  const SAMPLE_INTERVAL_MS = 100;
  const DEADLINE_MS = 45_000;
  const POST_ENTRY_RETENTION_MS = 5_000;
  const VIEW_TRANSITION_ANIMATION_CAP = 12;
  const SURFACE_SELECTORS = [
    '[data-testid="map-entry-fallback"]',
    '[data-testid="map-navigation-wait"]',
    '[data-testid="vault-route-identity-pending"]',
    '[data-app-shell-pane]',
    '[data-map-engine]',
    'canvas[data-testid="ontology-map-canvas"]',
  ];
  let trustedUrl = false;
  try {
    const url = new URL(location.href);
    trustedUrl = url.protocol === 'tauri:'
      && url.hostname === 'localhost'
      && url.port === ''
      && url.username === ''
      && url.password === '';
  } catch {
    trustedUrl = false;
  }
  const trusted = trustedUrl
    && window.top === window.self
    && window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label === 'main';
  if (!trusted) return 'origin-rejected';
  if (window[GLOBAL]?.version === VERSION) return 'already-installed';

  const installedAt = performance.now();
  const identities = new WeakMap();
  const firstSeen = new WeakMap();
  const intersections = new WeakMap();
  const observedClusters = new WeakSet();
  let nextIdentity = 0;
  let stopped = false;
  let timer = null;
  let watchdog = null;
  let raf = 0;
  let lastFrame = null;
  let lastSample = null;
  let mutationPending = false;
  let previousNodeIds = new Set();
  let longTasks = null;

  const report = {
    version: VERSION,
    documentId: `${performance.timeOrigin}:${Date.now()}:${installedAt}`,
    installedAt,
    wallTime: Date.now(),
    timeOrigin: performance.timeOrigin,
    readyStateAtInstall: document.readyState,
    pathAtInstall: location.pathname,
    sawEntry: false,
    firstEntryAt: null,
    entrySpans: [],
    sawOverlay: false,
    stoppedAt: null,
    stopReason: null,
    samples: [],
    events: [],
    frameGaps: [],
    longTasks: [],
    errors: [],
    support: {
      matchMedia: typeof matchMedia === 'function',
      intersectionObserver: typeof IntersectionObserver === 'function',
      getAnimations: typeof Element !== 'undefined' && typeof Element.prototype.getAnimations === 'function',
      documentAnimations: typeof document.getAnimations === 'function',
      domPoint: typeof DOMPoint === 'function',
      longTask: false,
    },
    truncated: { samples: 0, events: 0, frameGaps: 0, longTasks: 0, errors: 0, entrySpans: 0, bytes: false },
  };

  const append = (key, value, cap) => {
    const list = report[key];
    if (list.length >= cap) {
      report.truncated[key] += 1;
      return;
    }
    list.push(value);
  };
  const event = (kind, detail = null) => append('events', { at: performance.now(), kind, detail }, EVENT_CAP);
  const appendSample = (value) => {
    if (report.samples.length >= SAMPLE_CAP) {
      report.samples.splice(1, 1);
      report.truncated.samples += 1;
    }
    report.samples.push(value);
  };
  const error = (stage, value) => append('errors', { at: performance.now(), stage, message: String(value).slice(0, 500) }, EVENT_CAP);
  const identity = (node) => {
    if (!identities.has(node)) {
      identities.set(node, ++nextIdentity);
      firstSeen.set(node, performance.now());
    }
    return identities.get(node);
  };
  const safeMedia = (query) => {
    try { return typeof matchMedia === 'function' ? matchMedia(query) : null; } catch (cause) { error('match-media', cause); return null; }
  };
  const reduced = safeMedia('(prefers-reduced-motion: reduce)');
  const noPreference = safeMedia('(prefers-reduced-motion: no-preference)');
  let activeEntrySpan = null;
  let latestEntryRemovedAt = null;
  let quietTicks = 0;

  let intersection = null;
  if (report.support.intersectionObserver) {
    try {
      intersection = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          intersections.set(entry.target, { at: performance.now(), isIntersecting: entry.isIntersecting, ratio: entry.intersectionRatio });
        }
      });
    } catch (cause) { error('intersection-observer', cause); }
  }

  const animationState = (orbit) => {
    if (typeof orbit.getAnimations !== 'function') return null;
    try {
      return orbit.getAnimations().map((animation) => ({
        currentTime: typeof animation.currentTime === 'number' ? animation.currentTime : null,
        startTime: typeof animation.startTime === 'number' ? animation.startTime : null,
        playState: animation.playState ?? null,
        playbackRate: typeof animation.playbackRate === 'number' ? animation.playbackRate : null,
      }));
    } catch (cause) { error('get-animations', cause); return null; }
  };

  const circleGeometry = (circle) => {
    if (!circle || typeof circle.getScreenCTM !== 'function') return { matrix: null, point: null };
    try {
      const matrix = circle.getScreenCTM();
      if (!matrix) return { matrix: null, point: null };
      const raw = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
      if (typeof DOMPoint !== 'function') return { matrix: raw, point: null };
      const point = new DOMPoint(circle.cx.baseVal.value, circle.cy.baseVal.value).matrixTransform(matrix);
      return { matrix: raw, point: { x: point.x, y: point.y } };
    } catch (cause) { error('screen-ctm', cause); return { matrix: null, point: null }; }
  };

  const rectState = (element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
  };

  const presentationContext = () => {
    let transitionAnimations = null;
    let transitionAnimationCount = null;
    let transitionAnimationsTruncated = 0;
    if (typeof document.getAnimations === 'function') {
      try {
        const matches = document.getAnimations().filter((animation) => {
          const pseudo = animation.effect?.pseudoElement;
          return typeof pseudo === 'string' && pseudo.startsWith('::view-transition');
        });
        transitionAnimationCount = matches.length;
        transitionAnimationsTruncated = Math.max(0, matches.length - VIEW_TRANSITION_ANIMATION_CAP);
        transitionAnimations = matches.slice(0, VIEW_TRANSITION_ANIMATION_CAP).map((animation) => {
          const timing = animation.effect?.getComputedTiming?.() ?? null;
          return {
            pseudoElement: animation.effect?.pseudoElement ?? null,
            animationName: typeof animation.animationName === 'string' ? animation.animationName : null,
            playState: animation.playState ?? null,
            currentTime: typeof animation.currentTime === 'number' ? animation.currentTime : null,
            startTime: typeof animation.startTime === 'number' ? animation.startTime : null,
            timing: timing ? {
              phase: timing.phase ?? null,
              progress: typeof timing.progress === 'number' ? timing.progress : null,
              duration: typeof timing.duration === 'number' ? timing.duration : null,
            } : null,
          };
        });
      } catch (cause) { error('document-animations', cause); }
    }

    const surfaces = SURFACE_SELECTORS.map((selector) => {
      const matches = [...document.querySelectorAll(selector)];
      const element = matches[0] ?? null;
      if (!element) return { selector, count: 0, first: null };
      const css = getComputedStyle(element);
      const first = {
        id: identity(element),
        connected: element.isConnected,
        rect: rectState(element),
        css: { display: css.display, visibility: css.visibility, opacity: css.opacity },
        inert: element.inert === true || element.hasAttribute?.('inert') === true,
      };
      if (selector === 'canvas[data-testid="ontology-map-canvas"]') {
        const owner = element.closest('[data-map-engine]');
        first.canvas = {
          width: element.getAttribute('width'),
          height: element.getAttribute('height'),
          mapEngine: owner?.getAttribute('data-map-engine') ?? null,
        };
      }
      return { selector, count: matches.length, first };
    });

    const firstFor = (selector) => surfaces.find((surface) => surface.selector === selector)?.first;
    const paneElement = document.querySelectorAll('[data-app-shell-pane]')[0] ?? null;
    const paneRect = firstFor('[data-app-shell-pane]')?.rect ?? null;
    const center = paneRect
      ? { x: paneRect.x + paneRect.width / 2, y: paneRect.y + paneRect.height / 2 }
      : { x: innerWidth / 2, y: innerHeight / 2 };
    const hit = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(center.x, center.y) : null;
    const entry = document.querySelectorAll('[data-testid="map-entry-fallback"]')[0] ?? null;
    const overlay = document.querySelectorAll('[data-testid="map-navigation-wait"]')[0] ?? null;
    const mapOwner = document.querySelectorAll('[data-map-engine]')[0] ?? null;
    const canvas = document.querySelectorAll('canvas[data-testid="ontology-map-canvas"]')[0] ?? null;
    const tag = hit?.tagName?.toUpperCase?.() ?? null;
    return {
      routeCrossfade: document.documentElement?.classList.contains('route-crossfade') ?? false,
      viewTransitionAnimations: {
        supported: typeof document.getAnimations === 'function',
        count: transitionAnimationCount,
        entries: transitionAnimations,
        truncated: transitionAnimationsTruncated,
      },
      surfaces,
      centerHit: {
        tag: tag === 'HTML' || tag === 'BODY' || tag === 'CANVAS' ? tag : (tag ? 'other' : 'none'),
        insideKnownPane: Boolean(hit && paneElement?.contains(hit)),
        insideKnownLoader: Boolean(hit && (entry?.contains(hit) || overlay?.contains(hit))),
        insideKnownMap: Boolean(hit && (mapOwner?.contains(hit) || canvas?.contains(hit))),
      },
      renderTiming: { lastRafAt: lastFrame },
    };
  };

  const stop = (reason) => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) clearInterval(timer);
    if (watchdog !== null) clearTimeout(watchdog);
    if (raf) window.cancelAnimationFrame(raf);
    mutationObserver.disconnect();
    intersection?.disconnect();
    longTasks?.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    reduced?.removeEventListener?.('change', onMedia);
    noPreference?.removeEventListener?.('change', onMedia);
    report.stoppedAt = performance.now();
    report.stopReason = reason;
    event('stopped', reason);
  };

  const sample = (reason) => {
    if (stopped) return;
    const started = performance.now();
    try {
      const clusters = [...document.querySelectorAll('[data-testid="map-wait-cluster"]')];
      const nodeIds = new Set();
      const entryRoots = new Map();
      const clusterSamples = clusters.map((cluster) => {
        const clusterId = identity(cluster);
        nodeIds.add(`cluster:${clusterId}`);
        if (intersection && !observedClusters.has(cluster)) {
          observedClusters.add(cluster);
          intersection.observe(cluster);
        }
        const entryRoot = cluster.closest('[data-testid="map-entry-fallback"]');
        const entry = Boolean(entryRoot);
        const overlay = Boolean(cluster.closest('[data-testid="map-navigation-wait"]'));
        if (entry && !report.sawEntry) {
          report.sawEntry = true;
          report.firstEntryAt = started;
        }
        if (entryRoot) entryRoots.set(identity(entryRoot), clusterId);
        if (overlay) report.sawOverlay = true;
        const rect = cluster.getBoundingClientRect();
        const orbits = [...cluster.querySelectorAll('.map-wait-orbit')].map((orbit) => {
          const orbitId = identity(orbit);
          nodeIds.add(`orbit:${orbitId}`);
          const css = getComputedStyle(orbit);
          const circle = orbit.querySelector('circle');
          const circleId = circle ? identity(circle) : null;
          if (circleId !== null) nodeIds.add(`circle:${circleId}`);
          return {
            id: orbitId,
            firstSeenAt: firstSeen.get(orbit),
            circleId,
            css: {
              animationName: css.animationName,
              animationDuration: css.animationDuration,
              animationDelay: css.animationDelay,
              animationPlayState: css.animationPlayState,
              animationIterationCount: css.animationIterationCount,
              transform: css.transform,
              transformOrigin: css.transformOrigin,
              opacity: css.opacity,
            },
            animations: animationState(orbit),
            geometry: circleGeometry(circle),
          };
        });
        return {
          id: clusterId,
          firstSeenAt: firstSeen.get(cluster),
          entry,
          overlay,
          motion: cluster.getAttribute('data-map-wait-motion'),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
          viewportIntersecting: rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight,
          intersection: intersections.get(cluster) ?? null,
          orbits,
        };
      });
      for (const oldId of previousNodeIds) if (!nodeIds.has(oldId)) event('node-removed', oldId);
      for (const newId of nodeIds) if (!previousNodeIds.has(newId)) event('node-inserted', newId);
      previousNodeIds = nodeIds;
      const entryRootIds = [...entryRoots.keys()];
      if (entryRootIds.length > 0 && activeEntrySpan === null) {
        const span = {
          id: report.entrySpans.length + report.truncated.entrySpans + 1,
          rootIds: entryRootIds,
          firstClusterIds: [...entryRoots.values()],
          insertedAt: started,
          removedAt: null,
        };
        if (report.entrySpans.length < 24) report.entrySpans.push(span);
        else report.truncated.entrySpans += 1;
        activeEntrySpan = span;
        event('entry-inserted', { spanId: span.id, rootIds: span.rootIds, clusterIds: span.firstClusterIds });
      } else if (entryRootIds.length > 0 && activeEntrySpan) {
        activeEntrySpan.rootIds = [...new Set([...activeEntrySpan.rootIds, ...entryRootIds])];
      }
      if (entryRootIds.length === 0 && activeEntrySpan !== null) {
        activeEntrySpan.removedAt = started;
        latestEntryRemovedAt = started;
        event('entry-removed', { spanId: activeEntrySpan.id, removedAt: started });
        activeEntrySpan = null;
      }

      quietTicks = clusterSamples.length === 0 ? quietTicks + 1 : 0;
      const inPostRemovalWindow = latestEntryRemovedAt !== null && started - latestEntryRemovedAt <= POST_ENTRY_RETENTION_MS;
      const retainSample = reason !== 'timer' || clusterSamples.length > 0 || inPostRemovalWindow || quietTicks % 5 === 0;
      if (retainSample) appendSample({
        at: started,
        reason,
        gapMs: lastSample === null ? null : started - lastSample,
        path: location.pathname,
        readyState: document.readyState,
        hidden: document.hidden,
        visibilityState: document.visibilityState,
        reducedMotion: reduced ? reduced.matches : null,
        noPreference: noPreference ? noPreference.matches : null,
        clusters: clusterSamples,
        presentationContext: presentationContext(),
        readCostMs: performance.now() - started,
      });
      lastSample = started;
    } catch (cause) { error('sample', cause); }
  };

  const onVisibility = () => { event('visibility', document.visibilityState); sample('visibility'); };
  const onMedia = () => { event('media', { reduced: reduced?.matches ?? null, noPreference: noPreference?.matches ?? null }); sample('media'); };
  document.addEventListener('visibilitychange', onVisibility);
  reduced?.addEventListener?.('change', onMedia);
  noPreference?.addEventListener?.('change', onMedia);

  const mutationObserver = new MutationObserver(() => { mutationPending = true; });
  mutationObserver.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-map-wait-motion'] });
  timer = setInterval(() => { sample(mutationPending ? 'mutation+timer' : 'timer'); mutationPending = false; }, SAMPLE_INTERVAL_MS);

  const frame = (at) => {
    if (stopped) return;
    if (lastFrame !== null && at - lastFrame > 34) append('frameGaps', { at, gapMs: at - lastFrame }, GAP_CAP);
    lastFrame = at;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  try {
    if (typeof PerformanceObserver === 'function' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      longTasks = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) append('longTasks', { at: entry.startTime, durationMs: entry.duration }, LONG_TASK_CAP);
      });
      longTasks.observe({ type: 'longtask', buffered: true });
      report.support.longTask = true;
    }
  } catch (cause) { error('long-task-observer', cause); }

  const boundedReport = () => {
    const result = JSON.parse(JSON.stringify(report));
    const byteLength = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
    let encodedBytes = byteLength(result);
    while (encodedBytes > BYTE_CAP && result.samples.length > 1) {
      result.samples.splice(1, 1);
      result.truncated.samples += 1;
      result.truncated.bytes = true;
      encodedBytes = byteLength(result);
    }
    if (encodedBytes > BYTE_CAP) {
      result.errors = [{ stage: 'byte-cap', message: 'report exceeded byte cap after sample truncation' }];
      result.events = result.events.slice(-20);
      result.frameGaps = result.frameGaps.slice(-20);
      result.longTasks = result.longTasks.slice(-20);
      result.truncated.bytes = true;
    }
    result.encodedBytes = byteLength(result);
    return result;
  };

  window[GLOBAL] = {
    version: VERSION,
    read() {
      if (!stopped) return {
        collectorStatus: 'collecting', version: VERSION, documentId: report.documentId,
        installedAt: report.installedAt, readyStateAtInstall: report.readyStateAtInstall,
        sawEntry: report.sawEntry, sawOverlay: report.sawOverlay,
      };
      return { collectorStatus: 'complete', report: boundedReport() };
    },
  };
  sample('installed');
  watchdog = setTimeout(() => { sample('deadline'); stop(report.sawEntry ? 'deadline-after-entry' : 'deadline-no-entry'); }, DEADLINE_MS);
  return 'installed';
})();
