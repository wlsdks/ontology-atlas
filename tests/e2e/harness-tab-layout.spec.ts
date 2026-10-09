import { expect, test } from "@playwright/test";

import { installHarnessRuntime, mountHarnessVault } from "./harness-tab-fixture";
import { waitForBoxStill } from "./settle";

async function measureGuidanceGeometry(
  page: import('@playwright/test').Page,
  sample: { domains: 8 | 10; locale: 'ko' | 'en'; zoom: boolean; width: number; height: number },
) {
  await page.setViewportSize({ width: sample.width, height: sample.height });
  await page.goto(`/${sample.locale}/ontology/insights/?tab=harness&guides=off`);
  if (sample.zoom) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const overview = page.getByTestId('harness-coverage-overview');
  await expect(overview).toBeVisible();
  const domains = overview.locator('[data-testid^="harness-domain-"]');
  await expect(domains).toHaveCount(sample.domains);
  const field = overview.locator('[data-domain-count]');
  // The field refits a frame after the type size changes; measure the fit it lands on.
  await waitForBoxStill(field);
  const before = await field.evaluate((fieldElement) => {
    const fieldRect = (fieldElement as HTMLElement).getBoundingClientRect();
    const main = fieldElement.closest<HTMLElement>('main')!;
    const overview = fieldElement.closest<HTMLElement>('[data-testid="harness-coverage-overview"]')!;
    const rectOf = (element: Element | null) => {
      const rect = element?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
    };
    const bottomBarCandidate = document.querySelector<HTMLElement>('[data-tabbar="primary"]')?.getBoundingClientRect();
    const bottomBar = bottomBarCandidate && bottomBarCandidate.width > 0 && bottomBarCandidate.height > 0 ? bottomBarCandidate : null;
    const chain: Array<{ label: string; capacity: number; overflowY: string }> = [];
    for (let element: HTMLElement | null = fieldElement as HTMLElement; element; element = element.parentElement) {
      chain.push({
        label: element === fieldElement ? 'field' : element.matches('[data-testid="app-shell-body-slot"]') ? 'body-slot' : element.tagName.toLowerCase(),
        capacity: element.scrollHeight - element.clientHeight,
        overflowY: getComputedStyle(element).overflowY,
      });
      if (element === document.body) break;
    }
    return {
      chain,
      fieldCapacity: (fieldElement as HTMLElement).scrollHeight - (fieldElement as HTMLElement).clientHeight,
      fieldClientHeight: (fieldElement as HTMLElement).clientHeight,
      fieldBounds: { left: fieldRect.left, right: fieldRect.right, top: fieldRect.top, bottom: fieldRect.bottom },
      usableBottom: bottomBar?.top ?? innerHeight,
      mobileMetrics: {
        main: { rect: rectOf(main), paddingTop: getComputedStyle(main).paddingTop, paddingBottom: getComputedStyle(main).paddingBottom },
        settingsRow: rectOf(main.previousElementSibling),
        pageHeader: rectOf(main.querySelector(':scope > header')),
        subjectTabs: rectOf(main.querySelector('[data-testid="insights-core-switch"]')?.parentElement?.parentElement ?? null),
        overview: rectOf(overview),
        overviewHeader: rectOf(overview.querySelector('[data-guidance-overview-header]')),
        fieldStyle: {
          padding: getComputedStyle(fieldElement).padding,
          minHeight: getComputedStyle(fieldElement).minHeight,
          rowGap: getComputedStyle(fieldElement).rowGap,
        },
        paintedNav: bottomBar ? { top: bottomBar.top, bottom: bottomBar.bottom, height: bottomBar.height } : null,
      },
      documentCapacity: document.documentElement.scrollHeight - innerHeight,
      horizontalCapacity: document.documentElement.scrollWidth - innerWidth,
      pageScroll: { x: scrollX, y: scrollY },
    };
  });
  expect(before.fieldClientHeight).toBeGreaterThan(0);
  expect(before.chain.slice(1).filter((entry) => entry.overflowY === 'auto' || entry.overflowY === 'scroll').every((entry) => entry.capacity <= 1), JSON.stringify(before.chain)).toBe(true);
  expect(before.documentCapacity).toBeLessThanOrEqual(1);
  expect(before.horizontalCapacity).toBeLessThanOrEqual(1);
  expect(before.fieldBounds.top).toBeGreaterThanOrEqual(0);
  expect(before.fieldBounds.bottom).toBeLessThanOrEqual(before.usableBottom + 1);
  expect(before.mobileMetrics.overviewHeader?.top).toBeGreaterThanOrEqual(before.fieldBounds.top);
  expect(before.mobileMetrics.overviewHeader?.left).toBeGreaterThanOrEqual(before.fieldBounds.left);
  expect(before.mobileMetrics.overviewHeader?.right).toBeLessThanOrEqual(before.fieldBounds.right);
  await field.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const result = await page.evaluate(() => {
    const fieldElement = document.querySelector<HTMLElement>('[data-domain-count]')!;
    const domainElements = [...document.querySelectorAll<HTMLElement>('[data-testid^="harness-domain-"]')];
    const intersects = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
    const geometry = domainElements.map((domain) => {
      const title = domain.querySelector<HTMLElement>('[data-domain-heading]')!;
      const titleRange = document.createRange();
      titleRange.selectNodeContents(title);
      const titleBox = title.getBoundingClientRect();
      // The purpose line is clamped; its hidden lines still report range rects below the box.
      const rangeRect = titleRange.getBoundingClientRect();
      const titleRect = new DOMRect(rangeRect.left, rangeRect.top, rangeRect.width, Math.min(rangeRect.bottom, titleBox.bottom) - rangeRect.top);
      const roles = [...domain.querySelectorAll<HTMLElement>('[data-role]')].map((role) => {
        const rect = role.getBoundingClientRect();
        return { role: role.dataset.role, height: rect.height, intersectsTitle: intersects(rect, titleRect) };
      });
      const ports = [...domain.querySelectorAll<SVGPathElement>('[data-role-connection]')].map((port) => {
        const roleName = port.dataset.roleConnection!;
        const role = domain.querySelector<HTMLElement>(`[data-role="${roleName}"]`)!;
        const roleRect = role.getBoundingClientRect();
        const matrix = port.getScreenCTM()!;
        const point = (length: number) => {
          const local = port.getPointAtLength(length);
          return new DOMPoint(local.x, local.y).matrixTransform(matrix);
        };
        const length = port.getTotalLength();
        const start = point(0);
        const end = point(length);
        const told = roleName === 'told';
        const headingPoint = told ? end : start;
        const controlPoint = told ? start : end;
        return {
          intersectsTitle: Array.from({ length: 25 }, (_, index) => point(length * index / 24)).some((sample) => sample.x > titleRect.left && sample.x < titleRect.right && sample.y > titleRect.top && sample.y < titleRect.bottom),
          centerDrift: Math.abs(controlPoint.x - (roleRect.left + roleRect.right) / 2),
          endpointDrift: Math.abs(controlPoint.y - (told ? roleRect.bottom : roleRect.top)),
          headingCenterDrift: Math.abs(headingPoint.x - (titleBox.left + titleBox.right) / 2),
          headingEndpointDrift: Math.abs(headingPoint.y - (told ? titleBox.top : titleBox.bottom)),
        };
      });
      return { roles, ports };
    });
    return {
      fieldScrollTop: fieldElement.scrollTop,
      geometry,
      documentCapacity: document.documentElement.scrollHeight - innerHeight,
      horizontalCapacity: document.documentElement.scrollWidth - innerWidth,
      pageScroll: { x: scrollX, y: scrollY },
    };
  });
  if (before.fieldCapacity > 0) expect(result.fieldScrollTop).toBeGreaterThan(0);
  else expect(result.fieldScrollTop).toBe(0);
  expect(result.geometry.every((domain) => domain.roles.length === 3 && domain.roles.every((role) => !role.intersectsTitle))).toBe(true);
  expect(result.geometry.every((domain) => domain.ports.every((port) => !port.intersectsTitle && port.centerDrift <= 1 && port.endpointDrift <= 1 && port.headingCenterDrift <= 1 && port.headingEndpointDrift <= 1))).toBe(true);
  const fieldStyle = await field.evaluate((element) => {
    const style = getComputedStyle(element);
    return { paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, borderTopWidth: style.borderTopWidth, borderBottomWidth: style.borderBottomWidth };
  });
  const requiredFieldHeight = Math.max(...result.geometry.flatMap((domain) => domain.roles.map((role) => role.height)))
    + Number.parseFloat(fieldStyle.paddingTop) + Number.parseFloat(fieldStyle.paddingBottom)
    + Number.parseFloat(fieldStyle.borderTopWidth) + Number.parseFloat(fieldStyle.borderBottomWidth);
  expect(before.fieldClientHeight).toBeGreaterThanOrEqual(requiredFieldHeight);
  const lastRoles = overview.locator('[data-testid^="harness-domain-"]').last().locator('[data-role]');
  await expect(lastRoles).toHaveCount(3);
  const roleHits: Array<{ role: string | undefined; insideField: boolean; hit: boolean; pageScrollUnchanged: boolean; fieldBoundsUnchanged: boolean }> = [];
  for (const role of await lastRoles.all()) {
    roleHits.push(await role.evaluate((element) => {
      const fieldElement = element.closest<HTMLElement>('[data-domain-count]')!;
      const roleRect = element.getBoundingClientRect();
      const fieldRect = fieldElement.getBoundingClientRect();
      const pageScrollBefore = { x: scrollX, y: scrollY };
      fieldElement.scrollTop += (roleRect.top + roleRect.bottom) / 2 - (fieldRect.top + fieldRect.bottom) / 2;
      const settledRect = element.getBoundingClientRect();
      const settledFieldRect = fieldElement.getBoundingClientRect();
      return {
        role: element.dataset.role,
        insideField: settledRect.top >= settledFieldRect.top && settledRect.bottom <= settledFieldRect.bottom,
        hit: element.contains(document.elementFromPoint(settledRect.left + settledRect.width / 2, settledRect.top + settledRect.height / 2)),
        pageScrollUnchanged: scrollX === pageScrollBefore.x && scrollY === pageScrollBefore.y,
        fieldBoundsUnchanged: settledFieldRect.top === fieldRect.top && settledFieldRect.bottom === fieldRect.bottom,
      };
    }));
  }
  expect(roleHits.every((role) => role.insideField && role.hit && role.pageScrollUnchanged && role.fieldBoundsUnchanged), JSON.stringify(roleHits)).toBe(true);
  expect(result.documentCapacity).toBeLessThanOrEqual(1);
  expect(result.horizontalCapacity).toBeLessThanOrEqual(1);
  expect(result.pageScroll).toEqual(before.pageScroll);
  return { ...sample, before, result, roleHits };
}

async function measureGuidanceText(
  page: import('@playwright/test').Page,
  sample: { domains: 8 | 10; locale: 'ko' | 'en'; zoom: boolean; width: number; height: number },
) {
  await page.setViewportSize({ width: sample.width, height: sample.height });
  await page.goto(`/${sample.locale}/ontology/insights/?tab=harness&guides=off`);
  if (sample.zoom) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const overview = page.getByTestId('harness-coverage-overview');
  await expect(overview).toBeVisible();
  await waitForBoxStill(overview.locator('[data-domain-count]'));
  const diagramFacts = await overview.locator('[data-testid^="harness-domain-"]').evaluateAll((domains) => domains.map((domain) => ({
    name: domain.getAttribute('aria-label'),
    roles: [...domain.querySelectorAll<HTMLElement>('[data-role]')].map((role) => ({ role: role.dataset.role, count: role.textContent?.match(/\d+/)?.[0] })),
  })));
  await page.getByTestId('guidance-mode-text').click();
  const rows = overview.locator('[data-testid^="harness-text-domain-"]');
  await expect(rows).toHaveCount(sample.domains);
  const textFacts = await rows.evaluateAll((items) => items.map((item) => ({
    name: item.querySelector('h4')?.textContent,
    roles: [...item.querySelectorAll<HTMLElement>('[data-role]')].map((role) => ({ role: role.dataset.role, count: role.textContent?.match(/\d+/)?.[0] })),
  })));
  expect(textFacts).toEqual(diagramFacts);
  const field = overview.locator('[data-domain-count]');
  const before = await field.evaluate((element) => ({
    fieldCapacity: element.scrollHeight - element.clientHeight,
    fieldRect: (() => { const rect = element.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom }; })(),
    usableBottom: (() => { const rect = document.querySelector<HTMLElement>('[data-tabbar="primary"]')?.getBoundingClientRect(); return rect && rect.width > 0 && rect.height > 0 ? rect.top : innerHeight; })(),
    outerCapacities: (() => { const values: number[] = []; for (let parent = element.parentElement; parent; parent = parent.parentElement) { const style = getComputedStyle(parent); if (style.overflowY === 'auto' || style.overflowY === 'scroll') values.push(parent.scrollHeight - parent.clientHeight); if (parent === document.body) break; } return values; })(),
    documentCapacity: document.documentElement.scrollHeight - innerHeight,
    horizontalCapacity: document.documentElement.scrollWidth - innerWidth,
    page: { x: scrollX, y: scrollY },
  }));
  await field.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const last = rows.last();
  const lastMetrics = await last.evaluate((element) => {
    const row = element.getBoundingClientRect();
    const fieldRect = element.closest('[data-domain-count]')!.getBoundingClientRect();
    return { rowHeight: row.height, fieldHeight: fieldRect.height };
  });
  if (lastMetrics.rowHeight <= lastMetrics.fieldHeight) {
    await expect.poll(() => last.evaluate((element) => {
      const row = element.getBoundingClientRect();
      const fieldRect = element.closest('[data-domain-count]')!.getBoundingClientRect();
      return row.top >= fieldRect.top && row.bottom <= fieldRect.bottom;
    })).toBe(true);
  }
  const heading = last.locator('h4');
  for (const text of [heading, last.locator('p').first()]) {
    const lineCount = await text.evaluate((element) => { const range = document.createRange(); range.selectNodeContents(element); return range.getClientRects().length; });
    for (let line = 0; line < lineCount; line += 1) {
      expect(await text.evaluate((element, lineIndex) => {
        const fieldElement = element.closest<HTMLElement>('[data-domain-count]')!;
        const range = document.createRange(); range.selectNodeContents(element);
        let rect = range.getClientRects()[lineIndex]!;
        const fieldRect = fieldElement.getBoundingClientRect();
        const pageBefore = { x: scrollX, y: scrollY };
        fieldElement.scrollTop += (rect.top + rect.bottom) / 2 - (fieldRect.top + fieldRect.bottom) / 2;
        const refreshed = document.createRange(); refreshed.selectNodeContents(element);
        rect = refreshed.getClientRects()[lineIndex]!;
        const settledField = fieldElement.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.top >= settledField.top && rect.bottom <= settledField.bottom && style.textOverflow !== 'ellipsis' && style.overflow !== 'hidden' && scrollX === pageBefore.x && scrollY === pageBefore.y && settledField.top === fieldRect.top && settledField.bottom === fieldRect.bottom;
      }, line)).toBe(true);
    }
  }
  for (const role of await last.locator('[data-role]').all()) {
    const roleReach = await role.evaluate((element) => {
      const fieldElement = element.closest<HTMLElement>('[data-domain-count]')!;
      const roleRect = element.getBoundingClientRect();
      const fieldRect = fieldElement.getBoundingClientRect();
      const pageBefore = { x: scrollX, y: scrollY };
      fieldElement.scrollTop += (roleRect.top + roleRect.bottom) / 2 - (fieldRect.top + fieldRect.bottom) / 2;
      const settled = element.getBoundingClientRect();
      const settledField = fieldElement.getBoundingClientRect();
      return { inside: settled.top >= settledField.top && settled.bottom <= settledField.bottom, hit: element.contains(document.elementFromPoint(settled.left + settled.width / 2, settled.top + settled.height / 2)), fieldStable: settledField.top === fieldRect.top && settledField.bottom === fieldRect.bottom, pageStable: scrollX === pageBefore.x && scrollY === pageBefore.y };
    });
    expect(roleReach).toEqual({ inside: true, hit: true, fieldStable: true, pageStable: true });
  }
  const after = await page.evaluate(() => ({ documentCapacity: document.documentElement.scrollHeight - innerHeight, horizontalCapacity: document.documentElement.scrollWidth - innerWidth, page: { x: scrollX, y: scrollY } }));
  expect(before.documentCapacity).toBeLessThanOrEqual(1);
  expect(before.outerCapacities.every((capacity) => capacity <= 1)).toBe(true);
  expect(before.fieldRect.bottom).toBeLessThanOrEqual(before.usableBottom + 1);
  expect(after.documentCapacity).toBeLessThanOrEqual(1);
  expect(after.horizontalCapacity).toBeLessThanOrEqual(1);
  expect(after.page).toEqual(before.page);
  return { ...sample, fieldCapacity: before.fieldCapacity, members: textFacts.length, lastMetrics };
}
test.describe("Harness tab layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await installHarnessRuntime(page);
  });

  /* The eight-domain field is measured across its bands by the balanced-tracks test below; the
     ledger stresses the ten-domain overflow at the desk width and the app's minimum window. */
  for (const domains of [10] as const) {
    for (const locale of ['ko', 'en'] as const) {
      for (const zoom of [false, true] as const) {
        for (const viewport of [
          { width: 1512, height: 949 },
          { width: 1040, height: 720 },
        ] as const) {
          test(`Guidance geometry ledger ${domains} ${locale} ${zoom ? '200%' : 'normal'} ${viewport.width}x${viewport.height}`, async ({ browser }) => {
            const context = await browser.newContext({ viewport: { width: 1512, height: 949 } });
            const overflowPage = await context.newPage();
            try {
              await installHarnessRuntime(overflowPage, { includeOverflowDomains: true });
              await mountHarnessVault(overflowPage);
              const entry = await measureGuidanceGeometry(overflowPage, { domains, locale, zoom, ...viewport });
              console.info('GUIDANCE_32_STATE', JSON.stringify(entry));
            } finally {
              await context.close();
            }
          });
        }
      }
    }
  }

  test('Guidance missing normal-width ledger ko 2560x949', async ({ page }) => {
    await mountHarnessVault(page);
    const entry = await measureGuidanceGeometry(page, { domains: 8, locale: 'ko', zoom: false, width: 2560, height: 949 });
    console.info('GUIDANCE_MISSING_WIDTH', JSON.stringify(entry));
  });

  /* Ten domains overflow the field, which is the state the text mode has to page through: at the
     owner's desk width in normal type and at the app's minimum window with doubled text. */
  for (const locale of ['ko', 'en'] as const) {
    for (const sample of [
      { zoom: false, width: 1512, height: 949 },
      { zoom: true, width: 1040, height: 720 },
    ] as const) {
      test(`Guidance Text ledger 10 ${locale} ${sample.zoom ? '200%' : 'normal'} ${sample.width}x${sample.height}`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: 1512, height: 949 } });
        const textPage = await context.newPage();
        try {
          await installHarnessRuntime(textPage, { includeOverflowDomains: true });
          await mountHarnessVault(textPage);
          console.info('GUIDANCE_TEXT_STATE', JSON.stringify(await measureGuidanceText(textPage, { domains: 10, locale, ...sample })));
        } finally {
          await context.close();
        }
      });
    }
  }

  test('measured Guidance keeps balanced tracks, readable ports, and pane-bounded evidence across affected bands', async ({ page }) => {
    await mountHarnessVault(page);
    const measurements: unknown[] = [];
    const cases = [
      { locale: 'ko', width: 1512, height: 949, columns: 4, zoom: false },
      { locale: 'en', width: 1920, height: 1080, columns: 4, zoom: false },
      { locale: 'ko', width: 1040, height: 720, columns: 2, zoom: false },
      { locale: 'ko', width: 1512, height: 949, columns: 4, zoom: true },
      { locale: 'en', width: 1512, height: 949, columns: 4, zoom: true },
    ] as const;

    for (const sample of cases) {
      await page.setViewportSize({ width: sample.width, height: sample.height });
      await page.goto(`/${sample.locale}/ontology/insights/?tab=harness&guides=off`);
      if (sample.zoom) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      const overview = page.getByTestId('harness-coverage-overview');
      await expect(overview).toBeVisible();
      const field = overview.locator('[data-domain-count]');
      const vertical = await field.evaluate((fieldElement) => {
        const chain: Array<{ label: string; clientHeight: number; scrollHeight: number; capacity: number; overflowY: string; rect: { top: number; bottom: number; height: number } }> = [];
        for (let element: HTMLElement | null = fieldElement as HTMLElement; element; element = element.parentElement) {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          chain.push({
            label: element === fieldElement ? 'field' : element.matches('[data-testid="app-shell-body-slot"]') ? 'body-slot' : element.tagName.toLowerCase() + (element.id ? `#${element.id}` : '') + (element.getAttribute('data-insights-panel') ? `[insights=${element.getAttribute('data-insights-panel')}]` : ''),
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
            capacity: element.scrollHeight - element.clientHeight,
            overflowY: style.overflowY,
            rect: { top: rect.top, bottom: rect.bottom, height: rect.height },
          });
          if (element === document.body) break;
        }
        const fieldRect = (fieldElement as HTMLElement).getBoundingClientRect();
        const bottomBarCandidate = document.querySelector<HTMLElement>('[data-tabbar="primary"]')?.getBoundingClientRect();
        const bottomBar = bottomBarCandidate && bottomBarCandidate.width > 0 && bottomBarCandidate.height > 0 ? bottomBarCandidate : null;
        return {
          chain,
          documentCapacity: document.documentElement.scrollHeight - innerHeight,
          fieldBottom: fieldRect.bottom,
          usableBottom: bottomBar?.top ?? innerHeight,
          mobileBottomReserve: getComputedStyle(document.documentElement).getPropertyValue('--topology-mobile-bottom-tab-reserve').trim(),
          outerScrollable: chain.slice(1).filter((entry) => entry.overflowY === 'auto' || entry.overflowY === 'scroll'),
        };
      });
      console.info('GUIDANCE_VERTICAL_CHAIN', JSON.stringify({ locale: sample.locale, width: sample.width, zoom: sample.zoom, ...vertical }));
      expect(vertical.outerScrollable.every((entry) => entry.capacity <= 1), `outer scroll owners retained capacity: ${JSON.stringify(vertical.outerScrollable)}`).toBe(true);
      expect(vertical.documentCapacity, `document retained ${vertical.documentCapacity}px vertical capacity`).toBeLessThanOrEqual(1);
      expect(vertical.fieldBottom, 'field crossed the usable pane or fixed bottom navigation').toBeLessThanOrEqual(vertical.usableBottom + 1);
      const observedColumns = await overview.locator('[data-guidance-domain-grid]').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length);
      expect(observedColumns).toBe(sample.columns);

      const geometry = await overview.locator('[data-testid^="harness-domain-"]').evaluateAll((domains) => domains.map((domain) => {
        const title = domain.querySelector<HTMLElement>('[data-domain-heading]')!;
        const titleRange = document.createRange();
        titleRange.selectNodeContents(title);
        const titleBox = title.getBoundingClientRect();
        // The purpose line is clamped; its hidden lines still report range rects below the box.
        const rangeRect = titleRange.getBoundingClientRect();
        const titleRect = new DOMRect(rangeRect.left, rangeRect.top, rangeRect.width, Math.min(rangeRect.bottom, titleBox.bottom) - rangeRect.top);
        const domainRect = domain.getBoundingClientRect();
        const domainStyle = getComputedStyle(domain);
        const intersects = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
        return {
          top: Math.round(domain.getBoundingClientRect().top),
          domain: { clientHeight: (domain as HTMLElement).clientHeight, scrollHeight: (domain as HTMLElement).scrollHeight, rect: { top: domainRect.top, bottom: domainRect.bottom, height: domainRect.height }, rows: domainStyle.gridTemplateRows, alignContent: domainStyle.alignContent },
          title: { range: { left: titleRect.left, right: titleRect.right, top: titleRect.top, bottom: titleRect.bottom, height: titleRect.height }, box: { left: titleBox.left, right: titleBox.right, top: titleBox.top, bottom: titleBox.bottom, height: titleBox.height } },
          roles: [...domain.querySelectorAll<HTMLElement>('[data-role]')].map((role) => {
            const rect = role.getBoundingClientRect();
            return { role: role.dataset.role, rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, width: rect.width, height: rect.height, intersectsTitle: intersects(rect, titleRect) };
          }),
          ports: [...domain.querySelectorAll<SVGPathElement>('[data-role-connection]')].map((port) => {
            const roleName = port.dataset.roleConnection!;
            const role = domain.querySelector<HTMLElement>(`[data-role="${roleName}"]`)!;
            const roleRect = role.getBoundingClientRect();
            const matrix = port.getScreenCTM()!;
            const point = (length: number) => {
              const local = port.getPointAtLength(length);
              return new DOMPoint(local.x, local.y).matrixTransform(matrix);
            };
            const length = port.getTotalLength();
            const start = point(0);
            const end = point(length);
            const told = roleName === 'told';
            const headingPoint = told ? end : start;
            const controlPoint = told ? start : end;
            return {
              intersectsTitle: Array.from({ length: 25 }, (_, index) => point(length * index / 24)).some((sample) => sample.x > titleRect.left && sample.x < titleRect.right && sample.y > titleRect.top && sample.y < titleRect.bottom),
              centerDrift: Math.abs(controlPoint.x - (roleRect.left + roleRect.right) / 2),
              endpointDrift: Math.abs(controlPoint.y - (told ? roleRect.bottom : roleRect.top)),
              headingCenterDrift: Math.abs(headingPoint.x - (titleBox.left + titleBox.right) / 2),
              headingEndpointDrift: Math.abs(headingPoint.y - (told ? titleBox.top : titleBox.bottom)),
            };
          }),
        };
      }));
      expect(geometry).toHaveLength(8);
      const roleFailures = geometry.flatMap((domain, index) => domain.roles.filter((role) => role.width < 24 || role.height < 24 || role.intersectsTitle).map((role) => ({ domain: index, ...role })));
      if (roleFailures.length > 0) {
        const fieldMetrics = await field.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, rows: getComputedStyle(element).gridTemplateRows, autoRows: getComputedStyle(element).gridAutoRows, alignContent: getComputedStyle(element).alignContent }));
        console.info('GUIDANCE_ROLE_GEOMETRY_RED', JSON.stringify({ locale: sample.locale, width: sample.width, zoom: sample.zoom, fieldMetrics, failingDomains: [...new Set(roleFailures.map((failure) => failure.domain))].map((index) => geometry[index]), roleFailures }));
      }
      expect(geometry.every((domain) => domain.roles.length === 3 && domain.roles.every((role) => role.width >= 24 && role.height >= 24 && !role.intersectsTitle))).toBe(true);
      const maxPortCenterDrift = Math.max(0, ...geometry.flatMap((domain) => domain.ports.map((port) => port.centerDrift)));
      const maxPortEndpointDrift = Math.max(0, ...geometry.flatMap((domain) => domain.ports.map((port) => port.endpointDrift)));
      const maxHeadingCenterDrift = Math.max(0, ...geometry.flatMap((domain) => domain.ports.map((port) => port.headingCenterDrift)));
      const maxHeadingEndpointDrift = Math.max(0, ...geometry.flatMap((domain) => domain.ports.map((port) => port.headingEndpointDrift)));
      console.info('GUIDANCE_PORT_ALIGNMENT', JSON.stringify({ locale: sample.locale, width: sample.width, zoom: sample.zoom, maxPortCenterDrift, maxPortEndpointDrift, maxHeadingCenterDrift, maxHeadingEndpointDrift }));
      expect(geometry.every((domain) => domain.ports.every((port) => !port.intersectsTitle && port.centerDrift <= 1 && port.endpointDrift <= 1 && port.headingCenterDrift <= 1 && port.headingEndpointDrift <= 1)), `ports drifted: control ${maxPortCenterDrift}/${maxPortEndpointDrift}px · heading ${maxHeadingCenterDrift}/${maxHeadingEndpointDrift}px`).toBe(true);
      const rowPopulation = [...geometry.reduce((rows, domain) => rows.set(domain.top, (rows.get(domain.top) ?? 0) + 1), new Map<number, number>()).values()];
      expect(rowPopulation).toEqual(Array.from({ length: 8 / sample.columns }, () => sample.columns));

      const trigger = overview.locator('[data-role][data-state="filled"]').first();
      const scopedCount = Number(await trigger.locator('span').last().textContent());
      await trigger.click();
      const surface = page.getByTestId('harness-role-popup');
      await expect(surface).toBeVisible();
      const evidence = page.getByTestId('harness-role-evidence');
      expect(Number(await evidence.getAttribute('data-scoped-count'))).toBe(scopedCount);
      await expect(evidence.locator('[data-evidence-kind="scoped"]')).toHaveCount(scopedCount);
      const globalCount = Number(await evidence.locator('[data-global-count]').getAttribute('data-global-count'));
      await evidence.getByTestId('harness-global-evidence-toggle').click();
      await expect(evidence.locator('[data-evidence-kind="global"]')).toHaveCount(globalCount);

      let popupBounds: unknown = null;
      {
        const bounds = await page.evaluate(() => {
          const popup = document.querySelector<HTMLElement>('[data-testid="harness-role-popup"]')!.getBoundingClientRect();
          const triggerRect = document.querySelector<HTMLElement>('[data-role][aria-expanded="true"]')!.getBoundingClientRect();
          const rail = document.querySelector<HTMLElement>('[data-testid="app-nav-rail"]')?.getBoundingClientRect();
          const intersects = Math.min(popup.right, triggerRect.right) > Math.max(popup.left, triggerRect.left) && Math.min(popup.bottom, triggerRect.bottom) > Math.max(popup.top, triggerRect.top);
          return { left: popup.left, right: popup.right, top: popup.top, bottom: popup.bottom, railRight: rail?.right ?? 0, width: innerWidth, height: innerHeight, intersects };
        });
        expect(bounds.left).toBeGreaterThanOrEqual(bounds.railRight);
        expect(bounds.right).toBeLessThanOrEqual(bounds.width);
        expect(bounds.top).toBeGreaterThanOrEqual(0);
        expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);
        expect(bounds.intersects).toBe(false);
        popupBounds = bounds;
        await page.keyboard.press('Escape');
        await expect(surface).toHaveCount(0);
      }
      measurements.push({
        ...sample,
        observedColumns,
        domains: geometry.length,
        minRoleWidth: Math.min(...geometry.flatMap((domain) => domain.roles.map((role) => role.width))),
        minRoleHeight: Math.min(...geometry.flatMap((domain) => domain.roles.map((role) => role.height))),
        popupBounds,
        scopedCount,
        globalCount,
      });
    }

    console.info('GUIDANCE_GEOMETRY_MATRIX', JSON.stringify(measurements));
  });

  test('structure fits a desktop viewport and confines long evidence to its work area', async ({ page }) => {
    await mountHarnessVault(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/ko/architecture/?view=structure&guides=off');
    const work = page.getByTestId('harness-structure-scroll');
    await expect(page.getByTestId('harness-structure-diagram')).toBeVisible();
    await expect.poll(() => work.evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);

    const panel = page.locator('#harness-tabpanel-structure');
    const panelTop = await panel.evaluate(el => el.getBoundingClientRect().top);
    await page.setViewportSize({ width: 1040, height: 720 });
    await page.getByTestId('harness-diagram-node-always').click();
    await expect(page.getByTestId('harness-anatomy-slot-always')).toBeVisible();
    await expect.poll(() => work.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
    await work.evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
    await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBe(0);
    expect(await panel.evaluate(el => el.getBoundingClientRect().top)).toBe(panelTop);
    await expect(page.getByTestId('harness-view-diagram')).toBeInViewport();
    await expect(page.getByTestId('harness-view-text')).toBeInViewport();
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY, overflow: document.documentElement.scrollWidth - innerWidth }))).toEqual({ x: 0, y: 0, overflow: 0 });
  });
});
