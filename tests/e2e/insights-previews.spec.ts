import { expect, test } from '@playwright/test';

for (const subject of [
  { tab: 'library', panel: 'library-tab', destination: '/en/library/' },
  { tab: 'harness', panel: 'harness-tab', destination: '/en/architecture/?view=guides' },
]) {
  test(`${subject.tab} examples reveal setup by keyboard and keep the next step reversible`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/en/ontology/insights/?tab=${subject.tab}&guides=off`);
    const panel = page.getByTestId(subject.panel);
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Example · not data from your folder', { exact: true })).toBeVisible();
    const stages = panel.locator('button[aria-expanded][aria-controls]');
    await expect(stages).toHaveCount(3);
    const selected = stages.nth(1);
    await selected.focus();
    await selected.press('Enter');
    await expect(selected).toHaveAttribute('aria-expanded', 'true');
    const controlledId = await selected.getAttribute('aria-controls');
    const explanation = page.locator(`[id="${controlledId}"]`);
    const next = panel.getByTestId('preview-primary-action');
    await expect(next).toHaveAttribute('href', subject.destination);
    await expect(next).toBeVisible();

    await selected.press('Enter');
    await expect(selected).toHaveAttribute('aria-expanded', 'false');
    await expect(explanation).toHaveAttribute('inert', '');
    await expect(selected).toBeFocused();
    await expect(explanation).toHaveJSProperty('clientHeight', 0);
    await expect(next).toBeVisible();

    await selected.press('Space');
    await expect(selected).toHaveAttribute('aria-expanded', 'true');
    await expect(next).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(next).toBeFocused();
    const nav = page.locator('[data-tabbar="primary"]');
    await expect(nav).toBeVisible();
    await expect.poll(async () => {
      const [linkBox, navBox] = await Promise.all([next.boundingBox(), nav.boundingBox()]);
      if (!linkBox || !navBox) return false;
      return linkBox.y + linkBox.height <= navBox.y;
    }).toBe(true);
    await page.keyboard.press('Enter');
    await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(subject.destination);
    await expect(page.getByRole('main')).toBeVisible();
  });
}

test('wiki source quote stays singular and readable through the narrow reflow boundary', async ({ page }) => {
  for (const { locale, quote } of [
    { locale: 'en', quote: '“After cancellation, access continues until the next billing date.”' },
    { locale: 'ko', quote: '“구독을 취소해도 다음 결제일까지는 이용할 수 있다.”' },
  ]) for (const { width, rootFontPx } of [
    { width: 390, rootFontPx: 16 },
    { width: 512, rootFontPx: 16 },
    { width: 640, rootFontPx: 16 },
    { width: 640, rootFontPx: 32 },
    { width: 767, rootFontPx: 16 },
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${locale}/ontology/insights/?tab=library&guides=off`);
    if (rootFontPx !== 16) await page.addStyleTag({ content: `html { font-size: ${rootFontPx}px !important; }` });
    const panel = page.getByTestId('library-tab');
    const quotedText = panel.getByText(quote, { exact: true });
    await expect(quotedText).toHaveCount(1);
    await expect(quotedText).toBeVisible();
    await expect.poll(() => panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect.poll(() => panel.evaluate((root) => {
      const source = root.querySelector<HTMLElement>('[data-relationship-item="source"]');
      const pageItem = root.querySelector<HTMLElement>('[data-relationship-item="page"]');
      const port = source?.querySelector<HTMLElement>('[data-relationship-port]');
      const button = source?.querySelector<HTMLElement>('button');
      if (!source || !pageItem || !port || !button) return false;
      const buttonRect = button.getBoundingClientRect();
      const pageRect = pageItem.getBoundingClientRect();
      const walker = document.createTreeWalker(port, NodeFilter.SHOW_TEXT);
      const textRects: DOMRect[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        textRects.push(...range.getClientRects());
      }
      const contained = textRects.every((rect) => rect.left >= buttonRect.left && rect.right <= buttonRect.right && rect.top >= buttonRect.top && rect.bottom <= buttonRect.bottom);
      const missesPage = textRects.every((rect) => rect.right <= pageRect.left || rect.left >= pageRect.right || rect.bottom <= pageRect.top || rect.top >= pageRect.bottom);
      return textRects.length > 0 && contained && missesPage;
    })).toBe(true);
  }
});

test('example title and illustration border share fast hover focus and selected feedback', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en/ontology/insights/?tab=library&guides=off');
  const button = page.getByTestId('library-tab').locator('[data-relationship-item="source"] button');
  const title = button.locator('.text-title').first();
  const port = button.locator('[data-relationship-port]');
  const read = async () => ({
    title: await title.evaluate((element) => getComputedStyle(element).color),
    border: await port.evaluate((element) => getComputedStyle(element).borderColor),
  });
  const rest = await read();
  await button.hover();
  await expect.poll(async () => title.evaluate((element) => element.getAnimations().length)).toBeGreaterThan(0);
  const midpoint = await button.evaluate((element) => {
    const titleElement = element.querySelector<HTMLElement>('.text-title');
    const portElement = element.querySelector<HTMLElement>('[data-relationship-port]');
    if (!titleElement || !portElement) throw new Error('feedback targets unavailable');
    [...titleElement.getAnimations(), ...portElement.getAnimations()].forEach((animation) => {
      const timing = animation.effect?.getComputedTiming();
      if (typeof timing?.duration === 'number') animation.currentTime = timing.duration / 2;
    });
    return { title: getComputedStyle(titleElement).color, border: getComputedStyle(portElement).borderColor };
  });
  expect(midpoint.title).not.toBe(rest.title);
  expect(midpoint.border).not.toBe(rest.border);
  await expect.poll(() => button.evaluate((element) => [...element.querySelectorAll<HTMLElement>('.text-title, [data-relationship-port]')]
    .flatMap((target) => target.getAnimations()).every((animation) => animation.playState === 'finished'))).toBe(true);
  const hoverFinal = await read();

  await button.focus();
  await expect.poll(read).toEqual(hoverFinal);
  await button.press('Enter');
  await page.mouse.move(0, 0);
  await expect.poll(read).toEqual(hoverFinal);
  await expect(button).toHaveAttribute('aria-expanded', 'true');
});

test('example animation pause is durable and independent from explanation state', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en/ontology/insights/?tab=library&guides=off');
  const panel = page.getByTestId('library-tab');
  const ambient = panel.locator('[data-relationship-ambient]');
  const pause = panel.getByRole('button', { name: 'Pause example animation' });
  await expect.poll(() => ambient.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe('running');

  await pause.focus();
  await page.keyboard.press('Enter');
  const resume = panel.getByRole('button', { name: 'Resume example animation' });
  await expect(resume).toBeFocused();
  await expect.poll(() => ambient.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe('paused');

  await panel.locator('button[aria-expanded][aria-controls]').nth(1).press('Enter');
  await expect.poll(() => ambient.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe('paused');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => ambient.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe('paused');
  await panel.scrollIntoViewIfNeeded();
  await expect.poll(() => ambient.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe('paused');

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => ambient.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe('paused');
  await resume.press('Space');
  await expect.poll(() => ambient.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe('running');
});

test('reduced motion keeps the relationship meaning while removing ambient travel', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en/ontology/insights/?tab=library&guides=off');
  const panel = page.getByTestId('library-tab');
  const ambient = panel.locator('[data-relationship-ambient]');
  await expect(ambient).toBeVisible();
  await expect.poll(() => ambient.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  await expect(panel.locator('svg[data-relationship-wires] g > path')).toHaveCount(2);
  await expect(panel.getByText('“After cancellation, access continues until the next billing date.”', { exact: true })).toBeVisible();
  await expect(panel.getByTestId('preview-primary-action')).toBeVisible();
});

for (const subject of [
  { tab: 'library', panel: 'library-tab', targetIndexes: [1, 2] },
  { tab: 'harness', panel: 'harness-tab', targetIndexes: [0, 1, 2] },
]) {
  test(`${subject.tab} relationship lines terminate at visual ports without crossing labels`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/en/ontology/insights/?tab=${subject.tab}&guides=off`);
    const panel = page.getByTestId(subject.panel);
    await expect(panel).toBeVisible();

    await expect.poll(() => panel.evaluate((root, { targetIndexes, tab }) => {
      const svg = root.querySelector<SVGSVGElement>('svg[data-relationship-wires]');
      const paths = [...(svg?.querySelectorAll('g > path:first-child') ?? [])] as SVGPathElement[];
      const items = [...root.querySelectorAll<HTMLElement>('[data-relationship-item]')];
      if (!svg || paths.length !== targetIndexes.length) return { ready: false };
      const scene = svg.parentElement;
      if (!scene) return { ready: false };

      const walker = document.createTreeWalker(scene, NodeFilter.SHOW_TEXT);
      const textRects: DOMRect[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const parent = node.parentElement;
        if (!parent || parent.closest('.sr-only')) continue;
        const style = getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        textRects.push(...[...range.getClientRects()].filter((rect) => rect.width > 1 && rect.height > 1));
      }

      const pathHitsText = (path: SVGPathElement) => {
        const matrix = path.getScreenCTM();
        if (!matrix) return true;
        const length = path.getTotalLength();
        for (let distance = 0; distance <= length; distance += 1) {
          const local = path.getPointAtLength(distance);
          const point = new DOMPoint(local.x, local.y).matrixTransform(matrix);
          if (textRects.some((rect) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom)) return true;
        }
        return false;
      };

      const endpointFailures: number[] = [];
      const collisionFailures: number[] = [];
      paths.forEach((path, pathIndex) => {
        const target = items[targetIndexes[pathIndex]];
        const port = target?.querySelector<HTMLElement>('[data-relationship-port]');
        if (!target || !port) {
          endpointFailures.push(pathIndex);
          return;
        }
        const portRect = port.getBoundingClientRect();
        const length = path.getTotalLength();
        const matrix = path.getScreenCTM();
        if (!matrix) {
          endpointFailures.push(pathIndex);
          return;
        }
        const localEndpoint = path.getPointAtLength(length);
        const endpoint = new DOMPoint(localEndpoint.x, localEndpoint.y).matrixTransform(matrix);
        if (Math.abs(endpoint.x - portRect.left) > 2 || endpoint.y < portRect.top - 2 || endpoint.y > portRect.bottom + 2) endpointFailures.push(pathIndex);
        if (pathHitsText(path)) collisionFailures.push(pathIndex);
      });

      const originalViewBox = svg.getAttribute('viewBox');
      const originalPaths = paths.map((path) => path.getAttribute('d'));
      const legacyPaths = tab === 'library'
        ? ['M150 90H450', 'M450 90H750']
        : ['M185 120H370Q410 120 410 50H530', 'M185 120H530', 'M185 120H370Q410 120 410 190H530'];
      svg.setAttribute('viewBox', '0 0 900 240');
      paths.forEach((path, index) => path.setAttribute('d', legacyPaths[index]));
      const legacyRejected = paths.some((path, pathIndex) => {
        const target = items[targetIndexes[pathIndex]]?.querySelector<HTMLElement>('[data-relationship-port]');
        const matrix = path.getScreenCTM();
        if (!target || !matrix) return true;
        const endpointLocal = path.getPointAtLength(path.getTotalLength());
        const endpoint = new DOMPoint(endpointLocal.x, endpointLocal.y).matrixTransform(matrix);
        return Math.abs(endpoint.x - target.getBoundingClientRect().left) > 2 || pathHitsText(path);
      });
      if (originalViewBox) svg.setAttribute('viewBox', originalViewBox);
      originalPaths.forEach((path, index) => paths[index].setAttribute('d', path ?? ''));

      const proofRect = textRects[0];
      const inverse = paths[0].getScreenCTM()?.inverse();
      let syntheticTextCollision = false;
      if (proofRect && inverse) {
        const center = new DOMPoint(proofRect.left + proofRect.width / 2, proofRect.top + proofRect.height / 2).matrixTransform(inverse);
        const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        probe.setAttribute('d', `M${center.x - 4} ${center.y}H${center.x + 4}`);
        svg.append(probe);
        syntheticTextCollision = pathHitsText(probe);
        probe.remove();
      }

      return { ready: true, endpointFailures, collisionFailures, legacyRejected, syntheticTextCollision };
    }, { targetIndexes: subject.targetIndexes, tab: subject.tab })).toEqual({
      ready: true,
      endpointFailures: [],
      collisionFailures: [],
      legacyRejected: true,
      syntheticTextCollision: true,
    });
  });
}
