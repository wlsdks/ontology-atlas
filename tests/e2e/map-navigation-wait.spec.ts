import { expect, test } from '@playwright/test';
import { installDesktopRailRuntime, mountDesktopVault } from './desktop-rail-arrival-harness';

test('Map announces preparation before leaving the current pane and reveals a drawn canvas', async ({ page }) => {
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page);
  await page.getByTestId('app-nav-rail-item-agents').click();
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const events: { type: string; pathname: string; inert: boolean; canvas: boolean }[] = [];
    (window as unknown as { mapWaitEvents: typeof events }).mapWaitEvents = events;
    let waiting = false;
    const observer = new MutationObserver(() => {
      const active = !!document.querySelector('[data-testid="map-navigation-wait"]:not([inert])');
      if (active === waiting) return;
      waiting = active;
      events.push({ type: active ? 'pending' : 'released', pathname: location.pathname,
        inert: document.querySelector('[data-app-shell-pane]')?.hasAttribute('inert') ?? false,
        canvas: !!document.querySelector('canvas[data-surface-role="map-canvas"]'),
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['inert'] });
  });
  await page.getByTestId('app-nav-rail-item-map').click();
  await expect(page).toHaveURL(/\/topology\//);
  await expect(page.getByTestId('map-navigation-wait')).toHaveCount(0);
  await expect(page.locator('[data-app-shell-pane]')).not.toHaveAttribute('inert');
  const events = await page.evaluate(() => (window as unknown as { mapWaitEvents: { type: string; pathname: string; inert: boolean; canvas: boolean }[] }).mapWaitEvents);
  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({ type: 'pending', inert: true });
  expect(events[0].pathname).toContain('/agents/');
  expect(events[1]).toMatchObject({ type: 'released', inert: false, canvas: true });

  await page.getByTestId('app-nav-rail-item-agents').click();
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
  await page.keyboard.press('g');
  await page.keyboard.press('m');
  await expect(page.getByTestId('map-navigation-wait')).toHaveCount(0);
  await expect(page.locator('canvas[data-surface-role="map-canvas"]')).toBeFocused();
});

test('leaving during map preparation does not strand an overlay', async ({ page }) => {
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page);
  await page.getByTestId('app-nav-rail-item-agents').click();
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
  // Dispatch the second real navigation in the same task, before the two-frame
  // preparation boundary. The queued map push must not run afterwards.
  await page.evaluate(() => {
    (document.querySelector('[data-testid="app-nav-rail-item-map"]') as HTMLElement).click();
    (document.querySelector('[data-testid="app-nav-rail-item-architecture"]') as HTMLElement).click();
  });
  await expect(page).toHaveURL(/\/architecture\//);
  await expect(page.getByTestId('map-navigation-wait')).toHaveCount(0);
  await expect(page.locator('[data-app-shell-pane]')).not.toHaveAttribute('inert');
});

test('reduced motion keeps the waiting scene readable and still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page);
  await page.getByTestId('app-nav-rail-item-agents').click();
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
  // Defer the queued destination work, not the CSS or the feedback commit.
  // This makes the pending state inspectable without adding a product delay.
  await page.evaluate(() => {
    (window as unknown as { restoreFrame: typeof requestAnimationFrame }).restoreFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
  });
  await page.getByTestId('app-nav-rail-item-map').click();
  const pending = page.getByTestId('map-navigation-wait');
  await expect(pending).toBeVisible();
  await expect(pending.getByRole('status')).toContainText('map');
  expect(await pending.getByRole('status').evaluate(el => el.closest('[aria-busy="true"]') === null)).toBe(true);
  await expect(pending.getByTestId('map-wait-cluster')).toHaveAttribute('data-map-wait-motion', 'still');
  const motion = await pending.locator('.map-wait-cluster, .map-wait-halo, .map-wait-point, .map-wait-orbit').evaluateAll(elements => elements.map(el => ({
    animation: getComputedStyle(el).animationName,
    transform: getComputedStyle(el).transform,
  })));
  expect(motion.length).toBeGreaterThan(0);
  expect(motion.every(item => item.animation === 'none' && item.transform === 'none')).toBe(true);
  await page.evaluate(() => {
    window.requestAnimationFrame = (window as unknown as { restoreFrame: typeof requestAnimationFrame }).restoreFrame;
  });
  await pending.getByRole('button', { name: 'Return to previous screen' }).click();
  await expect(pending).toHaveCount(0);
  await expect(page).toHaveURL(/\/agents\//);
});

test('normal motion moves every painted orbit and the travel detector rejects a paused control', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page);
  await page.getByTestId('app-nav-rail-item-agents').click();
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();

  await page.evaluate(() => {
    const diagnosticWindow = window as typeof window & {
      mapWaitRestoreFrame?: typeof requestAnimationFrame;
    };
    diagnosticWindow.mapWaitRestoreFrame = window.requestAnimationFrame;
    // Hold only the queued destination progression. CSS animations keep their own clock.
    window.requestAnimationFrame = () => 0;
  });

  const pending = page.getByTestId('map-navigation-wait');
  try {
    await page.getByTestId('app-nav-rail-item-map').click();
    await expect(pending).toBeVisible();
    await expect(pending.getByRole('status')).toContainText('map');
    await expect(pending.getByRole('button', { name: 'Return to previous screen' })).toBeVisible();
    await expect(pending.getByTestId('map-wait-cluster')).toHaveAttribute('data-map-wait-motion', 'running');

    await page.evaluate(() => {
      const diagnosticWindow = window as typeof window & {
        mapWaitRestoreFrame?: typeof requestAnimationFrame;
      };
      if (!diagnosticWindow.mapWaitRestoreFrame) throw new Error('native requestAnimationFrame was not retained');
      window.requestAnimationFrame = diagnosticWindow.mapWaitRestoreFrame;
    });

    const inventory = pending.locator('.map-wait-orbit');
    await expect(inventory).toHaveCount(3);

    const measureTravel = async (measurementMs: number) => {
      const samples: Array<{
        timelineTime: number;
        orbits: Array<{
        x: number;
        y: number;
        matrix: string;
        animationName: string;
        animationDuration: string;
        animationPlayState: string;
        webAnimationCurrentTime: number | null;
        webAnimationPlayState: string | null;
        paintedRadius: number;
        }>;
      }> = [];
      let started: number | null = null;
      await expect.poll(async () => {
        const sample = await pending.evaluate(root => {
          const orbits = Array.from(root.querySelectorAll<SVGGElement>('.map-wait-orbit'));
          if (orbits.length === 0) throw new Error('orbit inventory is empty');
          return {
            timelineTime: Number(document.timeline.currentTime ?? performance.now()),
            orbits: orbits.map(orbit => {
            const circle = orbit.querySelector<SVGCircleElement>('circle[r="5"]');
            if (!circle) throw new Error('painted orbit circle is missing');
            const matrix = circle.getScreenCTM();
            if (!matrix) throw new Error('painted orbit has no screen CTM');
            const point = new DOMPoint(circle.cx.baseVal.value, circle.cy.baseVal.value).matrixTransform(matrix);
            const computed = getComputedStyle(orbit);
            const animation = orbit.getAnimations()[0];
            const bounds = circle.getBoundingClientRect();
            return {
              x: point.x,
              y: point.y,
              matrix: computed.transform,
              animationName: computed.animationName,
              animationDuration: computed.animationDuration,
              animationPlayState: computed.animationPlayState,
              webAnimationCurrentTime: typeof animation?.currentTime === 'number' ? animation.currentTime : null,
              webAnimationPlayState: animation?.playState ?? null,
              paintedRadius: Math.max(bounds.width, bounds.height) / 2,
            };
            }),
          };
        });
        samples.push(sample);
        started ??= sample.timelineTime;
        return sample.timelineTime - started;
      }).toBeGreaterThanOrEqual(measurementMs);
      return samples[0].orbits.map((first, index) => {
        const displacement = Math.max(...samples.map(sample =>
          Math.hypot(sample.orbits[index].x - first.x, sample.orbits[index].y - first.y)));
        // A visible mark travelling by at least half its own painted radius is distinguishable
        // from subpixel matrix noise without claiming a frame-rate or product-speed budget.
        const threshold = Math.max(0.5, first.paintedRadius * 0.5);
        return { first, last: samples.at(-1)?.orbits[index], displacement, threshold, samples: samples.length };
      });
    };

    const running = await measureTravel(900);
    expect(running).toHaveLength(3);
    expect(running.every(item => item.first.animationName.includes('orbit'))).toBe(true);
    expect(running.every(item => item.first.animationPlayState === 'running')).toBe(true);
    expect(running.every(item => item.displacement > item.threshold)).toBe(true);

    await inventory.evaluateAll(orbits => {
      for (const orbit of orbits as HTMLElement[]) orbit.style.animationPlayState = 'paused';
    });
    const paused = await measureTravel(120);
    expect(paused).toHaveLength(3);
    expect(paused.every(item => item.displacement > item.threshold)).toBe(false);

    await inventory.evaluateAll(orbits => {
      for (const orbit of orbits as HTMLElement[]) orbit.style.removeProperty('animation-play-state');
    });
    const restored = await measureTravel(900);
    expect(restored).toHaveLength(3);
    expect(restored.every(item => item.first.animationPlayState === 'running')).toBe(true);
    expect(restored.every(item => item.displacement > item.threshold)).toBe(true);
    console.info('MAP_WAIT_NORMAL_MOTION', JSON.stringify({ running, paused, restored }));
  } finally {
    await page.evaluate(() => {
      const diagnosticWindow = window as typeof window & {
        mapWaitRestoreFrame?: typeof requestAnimationFrame;
      };
      if (diagnosticWindow.mapWaitRestoreFrame) {
        window.requestAnimationFrame = diagnosticWindow.mapWaitRestoreFrame;
        delete diagnosticWindow.mapWaitRestoreFrame;
      }
      document.querySelectorAll<HTMLElement>('.map-wait-orbit').forEach(orbit => {
        orbit.style.removeProperty('animation-play-state');
      });
    });
    if (await pending.count()) {
      await pending.getByRole('button', { name: 'Return to previous screen' }).click();
      await expect(pending).toHaveCount(0);
    }
  }
});

test('real map navigation records the unmodified wait lifetime, remounts, frames, and long tasks', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page);
  await page.getByTestId('app-nav-rail-item-agents').click();
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();

  await page.evaluate(() => {
    type WaitEvent = {
      type: 'appearance' | 'state' | 'removal';
      at: number;
      overlayId: number | null;
      clusterId: number | null;
      phase: string | null;
      motion: string | null;
    };
    type Diagnostic = {
      clickAt: number;
      events: WaitEvent[];
      frames: number[];
      longTasks: Array<{ startTime: number; duration: number }>;
      longTaskSupported: boolean;
      stop: () => void;
    };
    const ids = new WeakMap<Node, number>();
    let nextId = 1;
    const id = (node: Node | null) => {
      if (!node) return null;
      const known = ids.get(node);
      if (known) return known;
      ids.set(node, nextId);
      return nextId++;
    };
    const events: WaitEvent[] = [];
    let lastSignature = '';
    let lastOverlayId: number | null = null;
    const observeState = () => {
      const overlay = document.querySelector<HTMLElement>('[data-testid="map-navigation-wait"]:not([inert])');
      const cluster = overlay?.querySelector<HTMLElement>('[data-testid="map-wait-cluster"]') ?? null;
      const overlayId = id(overlay);
      const clusterId = id(cluster);
      const phase = overlay?.dataset.mapNavigationPhase ?? null;
      const motion = cluster?.dataset.mapWaitMotion ?? null;
      const signature = `${overlayId}:${clusterId}:${phase}:${motion}`;
      if (signature === lastSignature) return;
      events.push({
        type: overlay ? (lastOverlayId === null ? 'appearance' : 'state') : 'removal',
        at: performance.now(), overlayId, clusterId, phase, motion,
      });
      lastSignature = signature;
      lastOverlayId = overlayId;
    };
    const mutation = new MutationObserver(observeState);
    mutation.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['inert', 'data-map-navigation-phase', 'data-map-wait-motion'],
    });
    const frames: number[] = [];
    let recordingFrames = true;
    const frame = (timestamp: number) => {
      frames.push(timestamp);
      if (recordingFrames) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    const longTasks: Array<{ startTime: number; duration: number }> = [];
    const longTaskSupported = PerformanceObserver.supportedEntryTypes.includes('longtask');
    const longTaskObserver = longTaskSupported ? new PerformanceObserver(list => {
      for (const entry of list.getEntries()) longTasks.push({ startTime: entry.startTime, duration: entry.duration });
    }) : null;
    longTaskObserver?.observe({ type: 'longtask', buffered: true });
    const diagnostic: Diagnostic = {
      clickAt: performance.now(), events, frames, longTasks, longTaskSupported,
      stop: () => {
        observeState();
        recordingFrames = false;
        mutation.disconnect();
        longTaskObserver?.disconnect();
      },
    };
    (window as typeof window & { mapWaitRealNavigationDiagnostic?: Diagnostic }).mapWaitRealNavigationDiagnostic = diagnostic;
  });

  await page.getByTestId('app-nav-rail-item-map').click();
  await expect(page).toHaveURL(/\/topology\//);
  await expect(page.getByTestId('map-navigation-wait')).toHaveCount(0);
  await expect(page.locator('canvas[data-surface-role="map-canvas"]')).toBeVisible();

  const diagnostic = await page.evaluate(() => {
    const diagnosticWindow = window as typeof window & {
      mapWaitRealNavigationDiagnostic?: {
        clickAt: number;
        events: Array<{ type: string; at: number; overlayId: number | null; clusterId: number | null; phase: string | null; motion: string | null }>;
        frames: number[];
        longTasks: Array<{ startTime: number; duration: number }>;
        longTaskSupported: boolean;
        stop: () => void;
      };
    };
    const value = diagnosticWindow.mapWaitRealNavigationDiagnostic;
    if (!value) throw new Error('real-navigation diagnostic was not installed');
    value.stop();
    delete diagnosticWindow.mapWaitRealNavigationDiagnostic;
    return {
      clickAt: value.clickAt,
      events: value.events,
      frameIntervals: value.frames.slice(1).map((time, index) => time - value.frames[index]),
      longTasks: value.longTasks,
      longTaskSupported: value.longTaskSupported,
    };
  });

  const appearance = diagnostic.events.find(event => event.type === 'appearance');
  const removal = diagnostic.events.findLast(event => event.type === 'removal');
  expect(appearance).toBeDefined();
  expect(removal).toBeDefined();
  expect(appearance?.motion).toBe('running');
  expect(appearance?.overlayId).not.toBeNull();
  expect(appearance?.clusterId).not.toBeNull();
  expect((removal?.at ?? 0) - (appearance?.at ?? 0)).toBeGreaterThanOrEqual(0);
  expect(diagnostic.frameIntervals.length).toBeGreaterThan(0);
  console.info('MAP_WAIT_REAL_NAVIGATION', JSON.stringify({
    ...diagnostic,
    waitLifetime: (removal?.at ?? 0) - (appearance?.at ?? 0),
  }));
});
