import { expect, test } from '@playwright/test';
import planning from '../../../messages/ko/planning.json';
import { installDesktopRailRuntime } from '../desktop-rail-arrival-harness';
import { crc32, deflateSync } from 'node:zlib';

test('refresh keeps current images visible until revalidated bytes are ready', async ({ page }) => {
  const chunk = (name: string, data: Buffer) => {
    const label = Buffer.from(name);
    const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([label, data])));
    return Buffer.concat([size, label, data, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  const png = (red: number, green: number) => Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, red, green, 0, 255]))), chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
  await installDesktopRailRuntime(page);
  await page.addInitScript(({ red, green }) => {
    type State = { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }; image: string; hold: boolean; fail: boolean; failScan: boolean; release?: () => void; holdOpen: boolean; releaseOpen?: () => void; opens: number; reads: number; finished: number; tick?: () => void };
    const win = window as unknown as State;
    const original = win.__TAURI_INTERNALS__.invoke;
    const originalSetInterval = window.setInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 10_000 && typeof handler === 'function') win.tick = () => handler(...args);
      return originalSetInterval(handler, timeout, ...args);
    }) as typeof window.setInterval;
    win.image = red; win.hold = false; win.fail = false; win.failScan = false; win.holdOpen = false; win.reads = 0; win.finished = 0; win.opens = 0;
    const bytes = () => Array.from(Uint8Array.from(atob(win.image), c => c.charCodeAt(0)));
    win.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      if (cmd === 'planning_supported') return true;
      if (cmd === 'planning_pick_folder') return { generation: 1, folder: 'docs', path: '/tmp/docs' };
      if (cmd === 'planning_scan' && win.failScan) throw new Error('unavailable');
      if (cmd === 'planning_scan') return { files: ['plan.md', 'image.png'].map((path) => ({ path, size: 1, modified_seconds: 1 })), skipped: 0, partial: false, visited: 2, limit_reached: false, depth_limited: false, unknown_remainder: false, omitted: { excluded: 0, linked: 0, symlink: 0, unsupported: 0, unreadable: 0 } };
      if (cmd === 'planning_open_document') {
        if (args?.path === 'image.png') {
          win.opens++;
          if (win.holdOpen) await new Promise<void>((resolve) => { win.releaseOpen = resolve; });
        }
        const contents = args?.path === 'image.png' ? bytes() : Array.from(new TextEncoder().encode('![design](image.png)'));
        return [...new TextEncoder().encode('a'.repeat(32)), ...contents];
      }
      if (cmd === 'planning_read_file') {
        win.reads++;
        const value = bytes();
        if (win.hold) await new Promise<void>((resolve) => { win.release = resolve; });
        win.finished++;
        if (win.fail) throw new Error('unavailable');
        return value;
      }
      return original(cmd, args);
    };
    Object.assign(win, { red, green });
  }, { red: png(255, 0), green: png(0, 255) });
  await page.goto('/ko/planning/');
  await page.getByRole('button', { name: '폴더 선택' }).click();
  await page.getByRole('button', { name: 'plan.md' }).click();
  const image = page.getByAltText('design');
  await expect(image).toBeVisible();
  const originalViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 600, height: 900 });
  const body = await page.getByTestId('app-shell-body-slot').boundingBox();
  const navigation = await page.locator('[data-tabbar="primary"]').boundingBox();
  expect(body!.y + body!.height).toBeLessThanOrEqual(navigation!.y + 1);
  const history = page.getByRole('button', { name: planning.openHistory });
  await history.scrollIntoViewIfNeeded();
  const historyBox = await history.boundingBox();
  expect(historyBox!.y + historyBox!.height).toBeLessThanOrEqual(navigation!.y + 1);
  await page.setViewportSize(originalViewport);
  const visualStatus = (await page.getByText(planning.imageChecked).elementHandle())!;
  const alert = page.locator('[data-planning-image-alert]');
  await expect(alert).toHaveAttribute('role', 'status');
  await expect(alert).toHaveText('');
  await page.evaluate(() => {
    const win = window as unknown as { imageAlertUpdates: string[] };
    const node = document.querySelector('[data-planning-image-alert]')!;
    win.imageAlertUpdates = [];
    new MutationObserver(() => win.imageAlertUpdates.push(node.textContent ?? '')).observe(node, { childList: true, characterData: true, subtree: true });
  });
  const attention = planning.imageAttention.replace('{image}', 'design');
  const recovered = planning.imageRecovered.replace('{image}', 'design');
  const first = await image.getAttribute('src');
  expect(first).toMatch(/^blob:/);
  await page.evaluate(() => { const win = window as unknown as { hold: boolean; release?: () => void }; win.hold = true; delete win.release; window.dispatchEvent(new Event('focus')); });
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { release?: () => void }).release))).toBe(true);
  expect(await image.getAttribute('src')).toBe(first);
  await expect(page.getByText(planning.imageChecking)).toBeVisible();
  expect(await page.getByText(planning.imageChecking).evaluate((node, original) => node === original, visualStatus)).toBe(true);
  await page.evaluate(() => { const win = window as unknown as { hold: boolean; release: () => void }; win.hold = false; win.release(); });
  await expect.poll(() => page.evaluate(() => (window as unknown as { reads: number }).reads)).toBe(2);
  await expect(image).toHaveAttribute('src', first!);
  await page.evaluate(() => { const win = window as unknown as { hold: boolean; release?: () => void; image: string; green: string }; win.image = win.green; win.hold = true; delete win.release; window.dispatchEvent(new Event('focus')); });
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { release?: () => void }).release))).toBe(true);
  expect(await image.getAttribute('src')).toBe(first);
  await expect(page.getByText(planning.imageChecking)).toBeVisible();
  await page.evaluate(() => { const win = window as unknown as { hold: boolean; release: () => void }; win.hold = false; win.release(); });
  await expect.poll(() => image.getAttribute('src')).not.toBe(first);
  await expect.poll(() => image.evaluate((node) => {
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(node as HTMLImageElement, 0, 0);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  })).toEqual([0, 255, 0, 255]);
  const greenUrl = await image.getAttribute('src');
  await page.evaluate(() => { const win = window as unknown as { hold: boolean; release?: () => void; image: string; red: string }; win.image = win.red; win.hold = true; delete win.release; window.dispatchEvent(new Event('focus')); });
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { release?: () => void }).release))).toBe(true);
  await page.evaluate(() => { const win = window as unknown as { hold: boolean; image: string; green: string }; win.hold = false; win.image = win.green; window.dispatchEvent(new Event('focus')); });
  await page.evaluate(async () => {
    const win = window as unknown as { tick: () => void };
    for (let i = 0; i < 20; i++) { win.tick(); await new Promise((resolve) => setTimeout(resolve, 5)); }
  });
  expect(await page.evaluate(() => (window as unknown as { reads: number }).reads)).toBe(4);
  await expect(page.getByText(planning.imageChecking)).toBeVisible();
  await expect(image).toHaveAttribute('src', greenUrl!);
  await page.evaluate(() => (window as unknown as { release: () => void }).release());
  await expect.poll(() => page.evaluate(() => (window as unknown as { reads: number }).reads)).toBe(5);
  await expect.poll(() => page.evaluate(() => (window as unknown as { finished: number }).finished)).toBe(5);
  await expect(image).toHaveAttribute('src', greenUrl!);
  await expect(page.getByText(planning.imageChecked)).toHaveClass(/sr-only/);
  await expect(page.getByText(planning.imageChecked)).toHaveAttribute('aria-live', 'off');
  expect(await page.evaluate(() => (window as unknown as { imageAlertUpdates: string[] }).imageAlertUpdates)).toEqual([]);
  await page.evaluate(() => { const win = window as unknown as { failScan: boolean }; win.failScan = true; window.dispatchEvent(new Event('focus')); });
  await expect(page.getByText(planning.imageUnconfirmed)).toBeVisible();
  await expect(page.locator('[data-planning-folder-alert]')).toHaveText(planning.folderUnavailable);
  await expect(alert).toHaveText('');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(image).toHaveAttribute('src', greenUrl!);
  await page.evaluate(() => { const win = window as unknown as { failScan: boolean }; win.failScan = false; window.dispatchEvent(new Event('focus')); });
  await expect(page.getByText(planning.imageChecked)).toHaveClass(/sr-only/);
  await expect(page.getByText(planning.imageChecked)).toHaveAttribute('aria-live', 'off');
  await expect(page.locator('[data-planning-folder-recovery]')).toHaveText(planning.folderRecovered);
  await expect(alert).toHaveText('');
  expect(await page.evaluate(() => (window as unknown as { imageAlertUpdates: string[] }).imageAlertUpdates)).toEqual([]);
  await page.evaluate(() => { const win = window as unknown as { fail: boolean; hold: boolean; release?: () => void }; win.fail = true; win.hold = true; delete win.release; window.dispatchEvent(new Event('focus')); });
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { release?: () => void }).release))).toBe(true);
  await expect(image).toHaveAttribute('src', greenUrl!);
  await expect(page.getByText(planning.imageChecking)).toBeVisible();
  await page.evaluate(() => { const win = window as unknown as { hold: boolean; release: () => void }; win.hold = false; win.release(); });
  await expect(image).toHaveCount(0);
  await expect(page.getByText(planning.imageBlocked.replace('{image}', 'design').replace('{reason}', planning.imageUnavailable))).toBeVisible();
  await expect(alert).toHaveText(attention);
  expect(await page.getByText(planning.imageBlocked.replace('{image}', 'design').replace('{reason}', planning.imageUnavailable)).evaluate((node, original) => node === original, visualStatus)).toBe(true);
  await page.evaluate(() => { (window as unknown as { fail: boolean }).fail = false; window.dispatchEvent(new Event('focus')); });
  await expect(image).toBeVisible();
  expect(await page.getByText(planning.imageChecked).evaluate((node, original) => node === original, visualStatus)).toBe(true);
  await expect(alert).toHaveText(recovered);
  expect(await page.evaluate(() => (window as unknown as { imageAlertUpdates: string[] }).imageAlertUpdates)).toEqual([attention, recovered]);
  const readsBefore = await page.evaluate(() => (window as unknown as { reads: number }).reads);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => page.evaluate(() => (window as unknown as { reads: number }).reads)).toBe(readsBefore + 1);
  await expect(page.getByText(planning.imageChecked)).toHaveClass(/sr-only/);
  expect(await page.evaluate(() => (window as unknown as { imageAlertUpdates: string[] }).imageAlertUpdates)).toEqual([attention, recovered]);
  await page.evaluate(() => { const win = window as unknown as { hold: boolean; release?: () => void; image: string; red: string }; win.image = win.red; win.hold = true; delete win.release; window.dispatchEvent(new Event('focus')); });
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { release?: () => void }).release))).toBe(true);
  await page.evaluate(() => { const win = window as unknown as { image: string; green: string }; win.image = win.green; });
  await page.getByRole('button', { name: 'image.png' }).click();
  await page.evaluate(() => { const win = window as unknown as { hold: boolean; release: () => void }; win.hold = false; win.release(); });
  const standalone = page.getByAltText('image.png');
  await expect(standalone).toBeVisible();
  const standaloneFirst = await standalone.getAttribute('src');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => page.evaluate(() => (window as unknown as { opens: number }).opens)).toBe(2);
  await expect(standalone).toHaveAttribute('src', standaloneFirst!);
  await page.evaluate(() => { const win = window as unknown as { holdOpen: boolean; releaseOpen?: () => void; image: string; red: string }; win.image = win.red; win.holdOpen = true; delete win.releaseOpen; window.dispatchEvent(new Event('focus')); });
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { releaseOpen?: () => void }).releaseOpen))).toBe(true);
  expect(await standalone.getAttribute('src')).toBe(standaloneFirst);
  await expect(page.getByText(planning.imageChecking)).toBeVisible();
  await page.evaluate(() => { const win = window as unknown as { holdOpen: boolean; releaseOpen: () => void }; win.holdOpen = false; win.releaseOpen(); });
  await expect.poll(() => standalone.getAttribute('src')).not.toBe(standaloneFirst);
  await expect.poll(() => standalone.evaluate((node) => {
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(node as HTMLImageElement, 0, 0);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  })).toEqual([255, 0, 0, 255]);
});

test('folder failures announce once for all images and individual image failures remain specific', async ({ page }) => {
  await installDesktopRailRuntime(page);
  await page.addInitScript(() => {
    type State = { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }; failScan: boolean; failedImage: string; scans: number; folderUpdates: string[]; recoveryUpdates: string[]; imageUpdates: string[][] };
    const win = window as unknown as State;
    const original = win.__TAURI_INTERNALS__.invoke;
    win.failScan = false; win.failedImage = ''; win.scans = 0;
    win.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      if (cmd === 'planning_supported') return true;
      if (cmd === 'planning_pick_folder') return { generation: 1, folder: 'docs', path: '/tmp/docs' };
      if (cmd === 'planning_scan') {
        win.scans++;
        if (win.failScan) throw new Error('folder unavailable');
        return { files: [{ path: 'plan.md', size: 1, modified_seconds: 1 }], skipped: 0, partial: false, visited: 1, limit_reached: false, depth_limited: false, unknown_remainder: false, omitted: { excluded: 0, linked: 0, symlink: 0, unsupported: 0, unreadable: 0 } };
      }
      if (cmd === 'planning_open_document') return Array.from(new TextEncoder().encode('a'.repeat(32) + '![one](1.png) ![two](2.png) ![three](3.png)'));
      if (cmd === 'planning_read_file') {
        if (args?.path === win.failedImage) throw new Error('image unavailable');
        return Array.from(Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aN4AAAAASUVORK5CYII='), c => c.charCodeAt(0)));
      }
      return original(cmd, args);
    };
  });
  await page.goto('/ko/planning/');
  await page.getByRole('button', { name: '폴더 선택' }).click();
  await page.getByRole('button', { name: 'plan.md' }).click();
  await expect(page.getByAltText('one')).toBeVisible();
  await expect(page.getByAltText('two')).toBeVisible();
  await expect(page.getByAltText('three')).toBeVisible();
  const folder = page.locator('[data-planning-folder-alert]');
  const folderRecovery = page.locator('[data-planning-folder-recovery]');
  const imageAlerts = page.locator('[data-planning-image-alert]');
  await expect(imageAlerts).toHaveCount(3);
  await page.evaluate(() => {
    const win = window as unknown as { folderUpdates: string[]; recoveryUpdates: string[]; imageUpdates: string[][] };
    win.folderUpdates = []; win.recoveryUpdates = []; win.imageUpdates = [[], [], []];
    const watch = (selector: string, updates: string[]) => {
      const node = document.querySelector(selector)!;
      new MutationObserver(() => updates.push(node.textContent ?? '')).observe(node, { childList: true, characterData: true, subtree: true });
    };
    watch('[data-planning-folder-alert]', win.folderUpdates);
    watch('[data-planning-folder-recovery]', win.recoveryUpdates);
    document.querySelectorAll('[data-planning-image-alert]').forEach((node, index) => new MutationObserver(() => win.imageUpdates[index].push(node.textContent ?? '')).observe(node, { childList: true, characterData: true, subtree: true }));
  });
  await page.evaluate(() => { const win = window as unknown as { failScan: boolean }; win.failScan = true; window.dispatchEvent(new Event('focus')); });
  await expect(folder).toHaveText(planning.folderUnavailable);
  await expect(page.getByText(planning.imageUnconfirmed)).toHaveCount(3);
  const scans = await page.evaluate(() => (window as unknown as { scans: number }).scans);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => page.evaluate(() => (window as unknown as { scans: number }).scans)).toBe(scans + 1);
  await expect(page.getByText(planning.imageUnconfirmed)).toHaveCount(3);
  expect(await page.evaluate(() => (window as unknown as { folderUpdates: string[] }).folderUpdates)).toEqual([planning.folderUnavailable]);
  expect(await page.evaluate(() => (window as unknown as { imageUpdates: string[][] }).imageUpdates)).toEqual([[], [], []]);
  await page.evaluate(() => { const win = window as unknown as { failScan: boolean }; win.failScan = false; window.dispatchEvent(new Event('focus')); });
  await expect(folderRecovery).toHaveText(planning.folderRecovered);
  await expect(page.getByText(planning.imageChecked)).toHaveCount(3);
  expect(await page.evaluate(() => (window as unknown as { recoveryUpdates: string[] }).recoveryUpdates)).toEqual([planning.folderRecovered]);
  expect(await page.evaluate(() => (window as unknown as { imageUpdates: string[][] }).imageUpdates)).toEqual([[], [], []]);
  await page.evaluate(() => { const win = window as unknown as { failedImage: string }; win.failedImage = '2.png'; window.dispatchEvent(new Event('focus')); });
  await expect(page.getByText(planning.imageBlocked.replace('{image}', 'two').replace('{reason}', planning.imageUnavailable))).toBeVisible();
  const attention = planning.imageAttention.replace('{image}', 'two');
  await expect(imageAlerts.nth(1)).toHaveText(attention);
  expect(await page.evaluate(() => (window as unknown as { imageUpdates: string[][] }).imageUpdates)).toEqual([[], [attention], []]);
  await page.evaluate(() => { const win = window as unknown as { failedImage: string }; win.failedImage = ''; window.dispatchEvent(new Event('focus')); });
  const recovered = planning.imageRecovered.replace('{image}', 'two');
  await expect(imageAlerts.nth(1)).toHaveText(recovered);
  expect(await page.evaluate(() => (window as unknown as { imageUpdates: string[][] }).imageUpdates)).toEqual([[], [attention, recovered], []]);
  expect(await page.evaluate(() => (window as unknown as { recoveryUpdates: string[] }).recoveryUpdates)).toEqual([planning.folderRecovered]);
});

test('blocked images show distinct safe names without repeated announcements or remote requests', async ({ page }) => {
  await installDesktopRailRuntime(page);
  await page.addInitScript(() => {
    type State = { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }; scans: number; reads: number; blockedUpdates: string[][] };
    const win = window as unknown as State;
    const original = win.__TAURI_INTERNALS__.invoke;
    win.scans = 0; win.reads = 0;
    const markdown = '![Outside](../../escape.png) ![Remote](https://NAME:PASSWORD@example.com/PRIVATE_RESOURCE.png?token=TOPSECRET#frag) ![Unsupported](assets/wireframe.webp) ![](https://NAME:PASSWORD@example.com/PRIVATE_FIRST.png?token=TOPSECRET) ![](https://NAME:PASSWORD@example.com/PRIVATE_SECOND.png?token=TOPSECRET) ![](../../local.png?token=TOPSECRET)';
    win.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      if (cmd === 'planning_supported') return true;
      if (cmd === 'planning_pick_folder') return { generation: 1, folder: 'docs', path: '/tmp/docs' };
      if (cmd === 'planning_scan') { win.scans++; return { files: [{ path: 'plan.md', size: 1, modified_seconds: 1 }], skipped: 0, partial: false, visited: 1, limit_reached: false, depth_limited: false, unknown_remainder: false, omitted: { excluded: 0, linked: 0, symlink: 0, unsupported: 0, unreadable: 0 } }; }
      if (cmd === 'planning_open_document') return Array.from(new TextEncoder().encode('a'.repeat(32) + markdown));
      if (cmd === 'planning_read_file') { win.reads++; throw new Error('unexpected read'); }
      return original(cmd, args);
    };
  });
  const remoteRequests: string[] = [];
  page.on('request', (request) => { if (new URL(request.url()).hostname === 'example.com') remoteRequests.push(request.url()); });
  await page.route('https://example.com/**', (route) => route.abort());
  await page.goto('/ko/planning/');
  await page.getByRole('button', { name: '폴더 선택' }).click();
  await page.getByRole('button', { name: 'plan.md' }).click();
  const states = page.locator('[data-planning-image-state]');
  const alerts = page.locator('[data-planning-image-alert]');
  await expect(states).toHaveCount(6);
  await expect(alerts).toHaveCount(6);
  const blocked = (image: string, reason: string) => planning.imageBlocked.replace('{image}', image).replace('{reason}', reason);
  await expect(states.nth(0)).toHaveText(blocked('Outside', planning.imageUnavailable));
  await expect(states.nth(1)).toHaveText(blocked('Remote', planning.imageUnavailable));
  await expect(states.nth(2)).toHaveText(blocked('Unsupported', planning.unsupported));
  const labels = await states.allTextContents();
  expect(labels[3]).toMatch(/^이미지 1:\d+: /);
  expect(labels[4]).toMatch(/^이미지 1:\d+: /);
  expect(labels[3]).not.toBe(labels[4]);
  expect(labels[5]).toBe(blocked('local.png', planning.imageUnavailable));
  await expect.poll(() => alerts.allTextContents()).toEqual(labels);
  expect(JSON.stringify(labels)).not.toMatch(/PASSWORD|PRIVATE_|TOPSECRET|example\.com/);
  expect(remoteRequests).toEqual([]);
  await expect(page.locator('main img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { reads: number }).reads)).toBe(0);
  const first = (await alerts.nth(0).elementHandle())!;
  await page.evaluate(() => {
    const win = window as unknown as { blockedUpdates: string[][] };
    win.blockedUpdates = Array.from({ length: 6 }, () => []);
    document.querySelectorAll('[data-planning-image-alert]').forEach((node, index) => new MutationObserver(() => win.blockedUpdates[index].push(node.textContent ?? '')).observe(node, { childList: true, characterData: true, subtree: true }));
  });
  const scans = await page.evaluate(() => (window as unknown as { scans: number }).scans);
  await page.evaluate(() => { for (let i = 0; i < 4; i++) window.dispatchEvent(new Event('focus')); });
  await expect.poll(() => page.evaluate(() => (window as unknown as { scans: number }).scans)).toBeGreaterThan(scans);
  await expect(page.getByRole('button', { name: planning.openMap })).toBeEnabled();
  await expect.poll(() => alerts.allTextContents()).toEqual(labels);
  expect(await alerts.nth(0).evaluate((node, original) => node === original, first)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { blockedUpdates: string[][] }).blockedUpdates)).toEqual([[], [], [], [], [], []]);
  expect(remoteRequests).toEqual([]);
});

test('mocked native Planning keeps the selected document across explicit evidence navigation and refresh', async ({ page }) => {
  await installDesktopRailRuntime(page);
  await page.addInitScript(() => {
    const win = window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }; planningText: string; planningIdentity: string };
    const original = win.__TAURI_INTERNALS__.invoke;
    win.planningText = '# Checkout plan\n\n![design](../images/mock.png)\n\nOriginal decision';
    win.planningIdentity = 'a'.repeat(32);
    win.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      if (cmd === 'planning_supported') return true;
      if (cmd === 'planning_pick_folder') return { generation: 1, folder: 'docs', path: '/tmp/project/docs' };
      if (cmd === 'planning_scan') {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { files: [{ path: 'plans/checkout.md', size: 40, modified_seconds: 1 }, { path: 'images/mock.png', size: 68, modified_seconds: 1 }], skipped: 0, partial: false, visited: 2, limit_reached: false, depth_limited: false, unknown_remainder: false, omitted: { excluded: 0, linked: 0, symlink: 0, unsupported: 0, unreadable: 0 } };
      }
      if (cmd === 'planning_read_file') {
        if (args?.path === 'plans/checkout.md') return Array.from(new TextEncoder().encode(win.planningText));
        if (args?.path === 'images/mock.png') return Array.from(Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aN4AAAAASUVORK5CYII='), c => c.charCodeAt(0)));
        throw new Error('outside mock');
      }
      if (cmd === 'planning_open_document') {
        if (args?.expectedIdentity && args.expectedIdentity !== win.planningIdentity) throw 'file-changed';
        return Array.from(new TextEncoder().encode(win.planningIdentity + win.planningText));
      }
      return original(cmd, args);
    };
  });
  await page.goto('/ko/planning/');
  await expect(page.getByText(/선택 폴더를 연 이후의 교체는 확인합니다/)).toBeHidden();
  await page.getByRole('button', { name: '읽기·이력 범위' }).click();
  await expect(page.getByText(/선택 폴더를 연 이후의 교체는 확인합니다/)).toBeVisible();
  await page.getByRole('button', { name: '읽기·이력 범위' }).click();
  await page.getByRole('button', { name: '폴더 선택' }).click();
  await page.getByRole('button', { name: 'plans/checkout.md' }).click();
  const details = page.getByRole('button', { name: '읽기·이력 범위' });
  await expect(page.getByText(/선택 폴더를 연 이후의 교체는 확인합니다/)).toBeHidden();
  await details.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/선택 폴더를 연 이후의 교체는 확인합니다/)).toBeVisible();
  await expect(page.getByText(planning.historyLimit)).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/선택 폴더를 연 이후의 교체는 확인합니다/)).toBeHidden();
  await expect(page.getByText(planning.historyBrief)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Checkout plan' })).toBeVisible();
  await expect(page.getByAltText('design')).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => page.getByAltText('design').evaluate((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth === 1)).toBe(true);
  for (const width of [320, 600, 768, 834, 1024, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const detailsBox = await details.boundingBox();
    expect(detailsBox?.height).toBeGreaterThanOrEqual(width <= 768 ? 44 : 40);
    expect(detailsBox?.width).toBeGreaterThanOrEqual(40);
    await expect(page.getByRole('heading', { name: 'Checkout plan' })).toBeVisible();
    if (width === 1440) expect((await page.locator('section').filter({ has: page.getByText('경로: plans/checkout.md') }).boundingBox())?.y).toBeLessThan(260);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  if (process.env.PLANNING_CAPTURE_DIR) {
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: `${process.env.PLANNING_CAPTURE_DIR}/planning-mocked-${width}.png` });
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  await page.evaluate(() => { (window as unknown as { planningText: string }).planningText = '# Checkout plan\n\nUpdated decision'; window.dispatchEvent(new Event('focus')); });
  await expect(page.getByText(/폴더를 다시 확인하고 있습니다/)).toBeVisible();
  await expect(page.getByText('Updated decision')).toBeVisible();
  await page.getByRole('button', { name: planning.openHistory }).click();
  await expect(page.getByRole('button', { name: '기획으로 돌아가기' })).toBeVisible();
  await page.getByRole('button', { name: '기획으로 돌아가기' }).click();
  await expect(page.getByText('Updated decision')).toBeVisible();
  await expect(page.getByRole('button', { name: planning.openHistory })).toBeFocused();
  await page.getByRole('button', { name: '온톨로지 맵 열기' }).click();
  await expect(page.getByRole('button', { name: '기획으로 돌아가기' })).toBeVisible();
  await page.getByRole('button', { name: '기획으로 돌아가기' }).click();
  await expect(page.getByText('Updated decision')).toBeVisible();
  await expect(page.getByRole('button', { name: '온톨로지 맵 열기' })).toBeFocused();
});

test('file names lead the list while relative paths disambiguate and remain searchable', async ({ page }) => {
  await installDesktopRailRuntime(page);
  await page.addInitScript(() => {
    const win = window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } };
    const original = win.__TAURI_INTERNALS__.invoke;
    const paths = ['alpha/checkout.md', 'beta/deep/checkout.md', 'readme.md'];
    win.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      if (cmd === 'planning_supported') return true;
      if (cmd === 'planning_pick_folder') return { generation: 1, folder: 'docs', path: '/tmp/docs' };
      if (cmd === 'planning_scan') return { files: paths.map((path) => ({ path, size: 1, modified_seconds: 1 })), skipped: 0, partial: false, visited: 3, limit_reached: false, depth_limited: false, unknown_remainder: false, omitted: { excluded: 0, linked: 0, symlink: 0, unsupported: 0, unreadable: 0 } };
      if (cmd === 'planning_open_document') return Array.from(new TextEncoder().encode('a'.repeat(32) + '# ' + args?.path));
      return original(cmd, args);
    };
  });
  await page.goto('/ko/planning/');
  await page.getByRole('button', { name: '폴더 선택' }).click();
  const list = page.getByRole('region', { name: planning.findFile });
  const alpha = list.getByRole('button', { name: 'alpha/checkout.md', exact: true });
  const beta = list.getByRole('button', { name: 'beta/deep/checkout.md', exact: true });
  await expect(alpha).toBeVisible();
  await expect(beta).toBeVisible();
  expect(await alpha.innerText()).toBe('checkout.md\nalpha');
  expect(await beta.innerText()).toBe('checkout.md\nbeta/deep');
  const search = page.getByRole('textbox', { name: planning.findFile });
  await search.fill('checkout.md');
  await expect(list.getByRole('button')).toHaveCount(2);
  await search.fill('beta/deep');
  await expect(list.getByRole('button')).toHaveCount(1);
  await beta.focus();
  await page.keyboard.press('Enter');
  await expect(beta).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('heading', { name: 'beta/deep/checkout.md' })).toBeVisible();
  await search.clear();
  await expect(list.getByRole('button')).toHaveCount(3);
  await expect(beta).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('button', { name: planning.openHistory })).toBeVisible();
  await expect(page.getByText(planning.historyBrief)).toBeVisible();
});

test('late inventory from a previous folder never replaces the new selection', async ({ page }) => {
  await installDesktopRailRuntime(page);
  await page.addInitScript(() => {
    const win = window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }; oldScanFinished: boolean };
    const original = win.__TAURI_INTERNALS__.invoke;
    let next = 0;
    win.oldScanFinished = false;
    win.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      if (cmd === 'planning_supported') return true;
      if (cmd === 'planning_pick_folder') { next++; return { generation: next, folder: `folder-${next}`, path: `/tmp/folder-${next}` }; }
      if (cmd === 'planning_scan') {
        const old = args?.generation === 1;
        if (old) { await new Promise((resolve) => setTimeout(resolve, 400)); win.oldScanFinished = true; }
        return { files: [{ path: old ? 'old.md' : 'new.md', size: 1, modified_seconds: 1 }], skipped: 0, partial: false, visited: 2, limit_reached: false, depth_limited: false, unknown_remainder: false, omitted: { excluded: 0, linked: 0, symlink: 0, unsupported: 0, unreadable: 0 } };
      }
      return original(cmd, args);
    };
  });
  await page.goto('/ko/planning/');
  await page.getByRole('button', { name: '폴더 선택' }).click();
  await expect(page.getByText('폴더: /tmp/folder-1')).toBeVisible();
  await page.getByRole('button', { name: '폴더 선택' }).click();
  await expect(page.getByRole('button', { name: 'new.md' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { oldScanFinished: boolean }).oldScanFinished)).toBe(true);
  await expect(page.getByText('폴더: /tmp/folder-2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'old.md' })).toHaveCount(0);
});

test('standalone images use the exact selected filename and decode locally', async ({ page }) => {
  await installDesktopRailRuntime(page);
  await page.addInitScript(() => {
    const win = window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }; opened: string[] };
    const original = win.__TAURI_INTERNALS__.invoke;
    const paths = ['design).png', 'design%20.png', '한글 공백.png'];
    win.opened = [];
    win.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      if (cmd === 'planning_supported') return true;
      if (cmd === 'planning_pick_folder') return { generation: 1, folder: 'docs', path: '/tmp/docs' };
      if (cmd === 'planning_scan') return { files: paths.map((path) => ({ path, size: 68, modified_seconds: 1 })), skipped: 0, partial: false, visited: 3, limit_reached: false, depth_limited: false, unknown_remainder: false, omitted: { excluded: 0, linked: 0, symlink: 0, unsupported: 0, unreadable: 0 } };
      if (cmd === 'planning_open_document' && paths.includes(String(args?.path))) {
        win.opened.push(String(args?.path));
        const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aN4AAAAASUVORK5CYII='), c => c.charCodeAt(0));
        return [...new TextEncoder().encode('a'.repeat(32)), ...png];
      }
      return original(cmd, args);
    };
  });
  await page.goto('/ko/planning/');
  await page.getByRole('button', { name: '폴더 선택' }).click();
  for (const path of ['design).png', 'design%20.png', '한글 공백.png']) {
    await page.getByRole('button', { name: path }).click();
    await expect.poll(() => page.getByAltText(path).evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(1);
  }
  expect(await page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual(['design).png', 'design%20.png', '한글 공백.png']);
});

test('return waits for delayed images and never restores a replaced document', async ({ page }) => {
  await installDesktopRailRuntime(page);
  await page.addInitScript(() => {
    const win = window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }; deferImage: boolean; releaseImage?: (fail: boolean) => void; identity: string };
    const original = win.__TAURI_INTERNALS__.invoke;
    win.deferImage = false; win.identity = 'a'.repeat(32);
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aN4AAAAASUVORK5CYII='), c => c.charCodeAt(0));
    win.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      if (cmd === 'planning_supported') return true;
      if (cmd === 'planning_pick_folder') return { generation: 1, folder: 'docs', path: '/tmp/docs' };
      if (cmd === 'planning_scan') return { files: [{ path: 'plan.md', size: 1, modified_seconds: 1 }, { path: 'image.png', size: 68, modified_seconds: 1 }], skipped: 0, partial: false, visited: 2, limit_reached: false, depth_limited: false, unknown_remainder: false, omitted: { excluded: 0, linked: 0, symlink: 0, unsupported: 0, unreadable: 0 } };
      if (cmd === 'planning_open_document') {
        if (args?.expectedIdentity && args.expectedIdentity !== win.identity) throw 'file-changed';
        const text = '# Plan\n\n![delayed](image.png)\n\n' + Array.from({ length: 100 }, (_, n) => `Paragraph ${n}`).join('\n\n');
        return Array.from(new TextEncoder().encode(win.identity + text));
      }
      if (cmd === 'planning_read_file') {
        if (!win.deferImage) return Array.from(png);
        return new Promise((resolve, reject) => { win.releaseImage = (fail) => fail ? reject('unavailable') : resolve(Array.from(png)); });
      }
      return original(cmd, args);
    };
  });
  await page.goto('/ko/planning/');
  await page.addStyleTag({ content: 'img[alt="delayed"] { height: 600px; width: 1px; }' });
  await page.getByRole('button', { name: '폴더 선택' }).click();
  await page.getByRole('button', { name: 'plan.md' }).click();
  await expect(page.getByAltText('delayed')).toBeVisible();
  const reader = page.locator('section').filter({ has: page.getByText('경로: plan.md') });
  await reader.evaluate((node) => { node.scrollTop = node.scrollHeight; node.dispatchEvent(new Event('scroll')); });
  const saved = await reader.evaluate((node) => node.scrollTop);
  expect(saved).toBeGreaterThan(600);
  await page.getByRole('button', { name: planning.openHistory }).click();
  await page.evaluate(() => { (window as unknown as { deferImage: boolean }).deferImage = true; });
  await page.getByRole('button', { name: '기획으로 돌아가기' }).click();
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { releaseImage?: unknown }).releaseImage))).toBe(true);
  expect(await reader.evaluate((node) => node.scrollTop)).toBeLessThan(saved);
  await page.evaluate(() => (window as unknown as { releaseImage: (fail: boolean) => void }).releaseImage(false));
  await expect.poll(() => reader.evaluate((node) => node.scrollTop)).toBeGreaterThan(saved - 2);
  await page.getByRole('button', { name: '온톨로지 맵 열기' }).click();
  await page.evaluate(() => { delete (window as unknown as { releaseImage?: unknown }).releaseImage; });
  await page.getByRole('button', { name: '기획으로 돌아가기' }).click();
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { releaseImage?: unknown }).releaseImage))).toBe(true);
  await page.evaluate(() => (window as unknown as { releaseImage: (fail: boolean) => void }).releaseImage(true));
  await expect.poll(() => reader.evaluate((node) => Math.abs(node.scrollHeight - node.clientHeight - node.scrollTop))).toBeLessThan(2);
  await page.getByRole('button', { name: '온톨로지 맵 열기' }).click();
  await page.evaluate(() => { delete (window as unknown as { releaseImage?: unknown }).releaseImage; });
  await page.getByRole('button', { name: '기획으로 돌아가기' }).click();
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { releaseImage?: unknown }).releaseImage))).toBe(true);
  await reader.evaluate((node) => { node.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 })); node.scrollTop = 40; node.dispatchEvent(new Event('scroll')); });
  await page.evaluate(() => (window as unknown as { releaseImage: (fail: boolean) => void }).releaseImage(false));
  await expect(page.getByAltText('delayed')).toBeVisible();
  expect(await reader.evaluate((node) => node.scrollTop)).toBe(40);
  await page.getByRole('button', { name: '온톨로지 맵 열기' }).click();
  await page.evaluate(() => { (window as unknown as { identity: string }).identity = 'b'.repeat(32); });
  await page.getByRole('button', { name: '기획으로 돌아가기' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '파일이 변경' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plan' })).toHaveCount(0);
  expect(await reader.evaluate((node) => node.scrollTop)).toBe(0);
});

test('late first document cannot disturb the newer document or its refresh', async ({ page }) => {
  await installDesktopRailRuntime(page);
  await page.addInitScript(() => {
    const win = window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }; releaseOld?: () => void; oldFinished: boolean; requests: number[] };
    const original = win.__TAURI_INTERNALS__.invoke;
    let newest = 0;
    let witness = '';
    win.oldFinished = false; win.requests = [];
    win.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      if (cmd === 'planning_supported') return true;
      if (cmd === 'planning_pick_folder') return { generation: 1, folder: 'docs', path: '/tmp/docs' };
      if (cmd === 'planning_scan') return { files: ['a.md', 'b.md'].map((path) => ({ path, size: 1, modified_seconds: 1 })), skipped: 0, partial: false, visited: 2, limit_reached: false, depth_limited: false, unknown_remainder: false, omitted: { excluded: 0, linked: 0, symlink: 0, unsupported: 0, unreadable: 0 } };
      if (cmd === 'planning_open_document') {
        const request = Number(args?.request);
        win.requests.push(request);
        if (request <= newest) throw 'selection-obsolete';
        newest = request;
        const path = String(args?.path);
        if (path === 'a.md') await new Promise<void>((resolve) => { win.releaseOld = resolve; });
        if (path === 'a.md') win.oldFinished = true;
        if (request !== newest) throw 'selection-obsolete';
        const token = path === 'b.md' ? 'b'.repeat(32) : 'a'.repeat(32);
        if (args?.expectedIdentity && (args.expectedIdentity !== witness || witness !== token)) throw 'file-changed';
        witness = token;
        return Array.from(new TextEncoder().encode(token + (path === 'b.md' ? '# Newer B' : '# Older A')));
      }
      return original(cmd, args);
    };
  });
  await page.goto('/ko/planning/');
  await page.getByRole('button', { name: '폴더 선택' }).click();
  await page.getByRole('button', { name: 'a.md' }).click();
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { releaseOld?: unknown }).releaseOld))).toBe(true);
  await page.getByRole('button', { name: 'b.md' }).click();
  await expect(page.getByRole('heading', { name: 'Newer B' })).toBeVisible();
  await page.evaluate(() => (window as unknown as { releaseOld: () => void }).releaseOld());
  await expect.poll(() => page.evaluate(() => (window as unknown as { oldFinished: boolean }).oldFinished)).toBe(true);
  await page.getByRole('button', { name: '폴더 새로고침' }).click();
  await expect(page.getByRole('heading', { name: 'Newer B' })).toBeVisible();
  await expect(page.getByText(/읽는 동안 파일이 변경/)).toHaveCount(0);
  const requests = await page.evaluate(() => (window as unknown as { requests: number[] }).requests);
  expect(requests).toHaveLength(3);
  expect(requests[0]).toBeLessThan(requests[1]);
  expect(requests[1]).toBeLessThan(requests[2]);
});

test('resuming a delayed folder check coalesces and a stalled check can be retried', async ({ page }) => {
  await installDesktopRailRuntime(page);
  await page.addInitScript(() => {
    type State = { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }; hidden: boolean; hold: boolean; release?: () => void; scans: number; text: string };
    const win = window as unknown as State;
    const original = win.__TAURI_INTERNALS__.invoke;
    const timeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => timeout(handler, delay === 8_000 ? 30 : delay, ...args)) as typeof window.setTimeout;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => win.hidden ? 'hidden' : 'visible' });
    win.hidden = false; win.hold = false; win.scans = 0; win.text = '# First';
    win.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      if (cmd === 'planning_supported') return true;
      if (cmd === 'planning_pick_folder') return { generation: 1, folder: 'docs', path: '/tmp/docs' };
      if (cmd === 'planning_scan') {
        win.scans++;
        if (win.hold) await new Promise<void>((resolve) => { win.release = resolve; });
        return { files: [{ path: 'plan.md', size: 1, modified_seconds: 1 }], skipped: 0, partial: false, visited: 1, limit_reached: false, depth_limited: false, unknown_remainder: false, omitted: { excluded: 0, linked: 0, symlink: 0, unsupported: 0, unreadable: 0 } };
      }
      if (cmd === 'planning_open_document') return Array.from(new TextEncoder().encode('a'.repeat(32) + win.text));
      return original(cmd, args);
    };
  });
  await page.goto('/ko/planning/');
  await page.getByRole('button', { name: '폴더 선택' }).click();
  await page.getByRole('button', { name: 'plan.md' }).click();
  await expect(page.getByRole('heading', { name: 'First' })).toBeVisible();
  const start = await page.evaluate(() => (window as unknown as { scans: number }).scans);
  await page.evaluate(() => { const win = window as unknown as { hold: boolean; release?: () => void }; win.hold = true; delete win.release; window.dispatchEvent(new Event('focus')); });
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { release?: () => void }).release))).toBe(true);
  await page.evaluate(() => { const win = window as unknown as { hidden: boolean; text: string }; win.hidden = true; document.dispatchEvent(new Event('visibilitychange')); win.text = '# Resumed'; win.hidden = false; document.dispatchEvent(new Event('visibilitychange')); for (let i = 0; i < 10; i++) window.dispatchEvent(new Event('focus')); });
  await expect(page.getByText(planning.checkingSlow)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { scans: number }).scans)).toBe(start + 1);
  await page.evaluate(() => { const win = window as unknown as { hold: boolean; release: () => void }; win.hold = false; win.release(); });
  await expect(page.getByRole('heading', { name: 'Resumed' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { scans: number }).scans)).toBe(start + 2);
  await page.evaluate(() => { const win = window as unknown as { hold: boolean; release?: () => void }; win.hold = true; delete win.release; window.dispatchEvent(new Event('focus')); });
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { release?: () => void }).release))).toBe(true);
  await expect(page.getByText(planning.checkingSlow)).toBeVisible();
  await page.evaluate(() => { const win = window as unknown as { hold: boolean; text: string }; win.hold = false; win.text = '# Recovered'; });
  await page.getByRole('button', { name: '폴더 새로고침' }).click();
  await expect(page.getByRole('heading', { name: 'Recovered' })).toBeVisible();
  const recovered = await page.evaluate(() => (window as unknown as { scans: number }).scans);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => page.evaluate(() => (window as unknown as { scans: number }).scans)).toBe(recovered + 1);
  await page.evaluate(() => (window as unknown as { release: () => void }).release());
  await expect(page.getByRole('heading', { name: 'Recovered' })).toBeVisible();
});

test('highly compressed images stop at the unique pixel budget', async ({ page }) => {
  const chunk = (name: string, data: Buffer) => {
    const label = Buffer.from(name);
    const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc32(Buffer.concat([label, data])));
    return Buffer.concat([size, label, data, sum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(2048, 0); header.writeUInt32BE(2048, 4); header[8] = 8; header[9] = 6;
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc((2048 * 4 + 1) * 2048))), chunk('IEND', Buffer.alloc(0))]);
  expect(png.length).toBeLessThan(100_000);
  await installDesktopRailRuntime(page);
  await page.addInitScript((image) => {
    const win = window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } };
    const original = win.__TAURI_INTERNALS__.invoke;
    win.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      if (cmd === 'planning_supported') return true;
      if (cmd === 'planning_pick_folder') return { generation: 1, folder: 'docs', path: '/tmp/docs' };
      if (cmd === 'planning_scan') return { files: [{ path: 'plan.md', size: 1, modified_seconds: 1 }], skipped: 0, partial: false, visited: 1, limit_reached: false, depth_limited: false, unknown_remainder: false, omitted: { excluded: 0, linked: 0, symlink: 0, unsupported: 0, unreadable: 0 } };
      if (cmd === 'planning_open_document') return Array.from(new TextEncoder().encode('a'.repeat(32) + '![a](1.png) ![repeat](1.png) ![b](2.png) ![c](3.png) ![d](4.png) ![over](5.png)'));
      if (cmd === 'planning_read_file' && /^(?:[1-5])\.png$/.test(String(args?.path))) return Array.from(Uint8Array.from(atob(image), c => c.charCodeAt(0)));
      return original(cmd, args);
    };
  }, png.toString('base64'));
  await page.goto('/ko/planning/');
  await page.getByRole('button', { name: '폴더 선택' }).click();
  await page.getByRole('button', { name: 'plan.md' }).click();
  await expect(page.getByText('문서 미리보기의 이미지 제한을 초과했습니다.')).toBeVisible();
  await expect.poll(() => page.getByAltText('a', { exact: true }).evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(2048);
  expect(await page.getByAltText('a', { exact: true }).getAttribute('src')).toEqual(await page.getByAltText('repeat').getAttribute('src'));
  await expect(page.getByAltText('over')).toHaveCount(0);
});
