import { expect, test } from "@playwright/test";
import { waitForFiniteAnimations } from './visual-ready';

import {
  HARNESS_SOURCE_ROOT,
  installHarnessRuntime,
  installProfilelessHarnessRuntime,
  mountHarnessVault,
} from "./harness-tab-fixture";

const AXE_PATH = require.resolve('axe-core/axe.min.js');
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const MIN_AXE_RULES_PASSED = 15;

async function auditGuidanceSurface(page: import('@playwright/test').Page, testId: string, role: 'dialog') {
  const surface = page.getByTestId(testId);
  await expect(surface).toBeVisible();
  await expect(surface).toHaveRole(role);
  await waitForFiniteAnimations(page);
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE_PATH });
  const result = await page.evaluate(async (tags) => {
    type Run = { violations: Array<{ id: string; nodes: unknown[] }>; passes: unknown[] };
    const run = await (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<Run> } }).axe.run(document, {
      runOnly: { type: 'tag', values: tags },
      resultTypes: ['violations', 'passes'],
    });
    return { rulesPassed: run.passes.length, violations: run.violations.map((violation) => ({ id: violation.id, count: violation.nodes.length })) };
  }, WCAG_TAGS);
  expect(result.rulesPassed, `${testId} axe collection was empty`).toBeGreaterThanOrEqual(MIN_AXE_RULES_PASSED);
  expect(result.violations, `${testId} introduced WCAG violations`).toEqual([]);
}

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
  if (sample.width === 390 && sample.zoom) console.info('GUIDANCE_MOBILE_200_METRICS', JSON.stringify({ ...sample, before }));
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

/**
 * **The Harness tab, read on a repository that actually has a harness.**
 *
 * The fixture's source tree carries the four shapes this view exists to expose: a nested
 * `AGENTS.md` that Codex merges and Claude Code never auto-loads, a declared skill pair whose two
 * copies differ, a hook script the config names and the disk does not have, and a Codex hook config
 * that repeats one script across three matchers. Each assertion below is about one of those.
 */
test.describe("하네스 탭", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await installHarnessRuntime(page);
  });

  test('Guidance connection paths attach controls to the domain heading at both ends', async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto('/en/ontology/insights/?tab=harness&guides=off');
    const overview = page.getByTestId('harness-coverage-overview');
    await expect(overview).toBeVisible();
    const gaps = await overview.locator('[data-testid^="harness-domain-"]').evaluateAll((domains) => domains.flatMap((domain) => {
      const heading = domain.querySelector<HTMLElement>('[data-domain-heading]')!.getBoundingClientRect();
      const textRects: DOMRect[] = [];
      const walker = document.createTreeWalker(domain, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        // Only painted lines: a clamped purpose keeps rects for the lines it hides below its box.
        const box = node.parentElement!.getBoundingClientRect();
        textRects.push(...[...range.getClientRects()].filter((rect) => rect.top < box.bottom - 0.5));
      }
      return [...domain.querySelectorAll<SVGPathElement>('[data-role-connection]')].map((connection) => {
        const role = domain.querySelector<HTMLElement>(`[data-role="${connection.dataset.roleConnection}"]`)!;
        const roleRect = role.getBoundingClientRect();
        const matrix = connection.getScreenCTM()!;
        const point = (length: number) => {
          const local = connection.getPointAtLength(length);
          return new DOMPoint(local.x, local.y).matrixTransform(matrix);
        };
        const start = point(0);
        const end = point(connection.getTotalLength());
        const told = connection.dataset.roleConnection === 'told';
        const headingPoint = told ? end : start;
        const controlPoint = told ? start : end;
        const intersectsText = Array.from({ length: 25 }, (_, index) => point(connection.getTotalLength() * index / 24)).some((sample) =>
          textRects.some((rect) => sample.x > rect.left && sample.x < rect.right && sample.y > rect.top && sample.y < rect.bottom));
        return {
          role: connection.dataset.roleConnection,
          headingCenterDrift: Math.abs(headingPoint.x - (heading.left + heading.right) / 2),
          headingBoundaryDrift: Math.abs(headingPoint.y - (told ? heading.top : heading.bottom)),
          controlCenterDrift: Math.abs(controlPoint.x - (roleRect.left + roleRect.right) / 2),
          controlBoundaryDrift: Math.abs(controlPoint.y - (told ? roleRect.bottom : roleRect.top)),
          intersectsText,
        };
      });
    }));
    console.info('GUIDANCE_CONNECTION_ATTACHMENT', JSON.stringify(gaps));
    expect(gaps.every((gap) => gap.headingCenterDrift <= 1 && gap.headingBoundaryDrift <= 1 && gap.controlCenterDrift <= 1 && gap.controlBoundaryDrift <= 1 && !gap.intersectsText), JSON.stringify(gaps)).toBe(true);
  });

  test('Guidance anchored evidence closes when its field anchor leaves view without stealing outside focus', async ({ page }) => {
    await mountHarnessVault(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/en/ontology/insights/?tab=harness&guides=off');
    const overview = page.getByTestId('harness-coverage-overview');
    await expect(overview).toBeVisible();
    const field = overview.locator('[data-domain-count]');
    const trigger = overview.locator('[data-role][data-state="filled"]').first();
    await trigger.click();
    const popup = page.getByTestId('harness-role-popup');
    await expect(popup).toBeVisible();
    const safePopupTop = await popup.evaluate((element) => element.getBoundingClientRect().top);
    expect(safePopupTop).toBeGreaterThanOrEqual(0);

    const evidenceBody = popup.getByTestId('harness-role-evidence').locator(':scope > div').last();
    await evidenceBody.evaluate((element) => { element.scrollTop = Math.min(8, element.scrollHeight - element.clientHeight); });
    await expect(popup).toBeVisible();
    await expect(popup).not.toHaveAttribute('inert');

    await field.evaluate((element) => { element.scrollTop += 4; });
    await expect(popup).toBeVisible();
    await expect(popup).not.toHaveAttribute('inert');

    const outside = page.getByTestId('insights-core-harness');
    await outside.focus();
    const pageScrollBefore = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    await field.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(popup).toHaveAttribute('inert');
    expect(await popup.evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
    await expect(popup).toHaveCount(0);
    await expect(outside).toBeFocused();
    expect(await field.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(pageScrollBefore);

    await field.evaluate((element) => { element.scrollTop = 0; });
    await trigger.click();
    await expect(popup).toBeFocused();
    await field.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(popup).toHaveCount(0);
    await expect(field).toBeFocused();
  });

  test('Guidance expansions keep full source identity and distinct labels across domain, separate, and outside presenters', async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto('/en/ontology/insights/?tab=harness&guides=off');
    const overview = page.getByTestId('harness-coverage-overview');
    await expect(overview).toBeVisible();
    const assertExpandedIdentity = async (row: import('@playwright/test').Locator) => {
      const sourceId = await row.getAttribute('data-evidence-source');
      const button = row.getByRole('button');
      await button.click();
      const detail = page.locator(`#${await button.getAttribute('aria-controls')}`);
      await expect(detail).toHaveAttribute('data-state', 'open');
      await expect(detail.getByText(sourceId!, { exact: true })).toBeVisible();
      const identity = await detail.evaluate((element) => ({ text: element.textContent, fits: element.scrollWidth <= element.clientWidth + 1 || getComputedStyle(element).overflowWrap === 'anywhere' }));
      expect(identity.text).toContain(sourceId);
      expect(identity.fits).toBe(true);
      expect(identity.text).toMatch(/Source label/);
      return sourceId;
    };

    await overview.locator('[data-role="told"][data-state="filled"]').first().click();
    const domainId = await assertExpandedIdentity(page.locator('[data-evidence-kind="scoped"]').first());
    await page.getByTestId('harness-role-popup').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('harness-role-popup')).toHaveCount(0);

    await page.locator('[data-guidance-evidence-action="separate:gated"]').click();
    const separateId = await assertExpandedIdentity(page.locator('[data-evidence-kind="global"]').first());
    await page.getByTestId('harness-role-popup').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('harness-role-popup')).toHaveCount(0);

    await page.locator('[data-guidance-evidence-action="outside"]').click();
    const outsideRows = page.locator('[data-evidence-kind="outside"]');
    expect(await outsideRows.count(), 'fixture must expose an actual outside declaration').toBeGreaterThan(0);
    const outsideId = await assertExpandedIdentity(outsideRows.first());
    expect(new Set([domainId, separateId, outsideId]).size).toBe(3);
  });

  test('Guidance Findings body is a genuine keyboard scroll stop with fixed heading and stable outer field', async ({ page }) => {
    await mountHarnessVault(page);
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.goto('/en/ontology/insights/?tab=harness&guides=off');
    const trigger = page.locator('[data-guidance-evidence-action="findings"]');
    const count = Number((await trigger.textContent())?.match(/\d+/)?.[0]);
    expect(count).toBeGreaterThan(0);
    await trigger.focus();
    await page.keyboard.press('Enter');
    const popup = page.getByTestId('harness-role-popup');
    await expect(popup).toBeFocused();
    const close = popup.getByRole('button', { name: 'Close' });
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Tab');
    const body = page.getByTestId('harness-collection-scroll-body');
    await expect(body).toBeFocused();
    expect(await body.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
    await waitForFiniteAnimations(page);
    await expect(page.getByTestId('harness-findings-list').locator('li')).toHaveCount(count);
    const stable = await page.evaluate(() => ({
      header: document.querySelector<HTMLElement>('[data-testid="harness-collection-evidence"] > div')!.getBoundingClientRect().toJSON(),
      fieldScroll: document.querySelector<HTMLElement>('[data-domain-count]')!.scrollTop,
      page: { x: scrollX, y: scrollY },
    }));
    await page.keyboard.press('PageDown');
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const advanced = await body.evaluate((element) => element.scrollTop);
    await page.keyboard.press('PageUp');
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeLessThan(advanced);
    await page.keyboard.press('End');
    const last = page.getByTestId('harness-findings-list').locator('li').last();
    await expect.poll(() => last.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const bodyRect = element.closest('[data-testid="harness-collection-scroll-body"]')!.getBoundingClientRect();
      return rect.top >= bodyRect.top && rect.bottom <= bodyRect.bottom;
    })).toBe(true);
    expect(await page.evaluate(() => ({
      header: document.querySelector<HTMLElement>('[data-testid="harness-collection-evidence"] > div')!.getBoundingClientRect().toJSON(),
      fieldScroll: document.querySelector<HTMLElement>('[data-domain-count]')!.scrollTop,
      page: { x: scrollX, y: scrollY },
    }))).toEqual(stable);
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`Guidance narrow Role body joins the dialog keyboard order with ${reducedMotion} motion`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: 1512, height: 949 }, reducedMotion });
      const rolePage = await context.newPage();
      try {
        await installHarnessRuntime(rolePage);
        await mountHarnessVault(rolePage);
        await rolePage.setViewportSize({ width: 390, height: 600 });
        await rolePage.goto('/en/ontology/insights/?tab=harness&guides=off');
        const trigger = rolePage.locator('[data-role="told"][data-state="filled"]').first();
        await trigger.focus();
        await rolePage.keyboard.press('Enter');
        const dialog = rolePage.getByTestId('harness-role-dialog');
        await expect(dialog).toBeVisible();
        const body = rolePage.getByTestId('harness-role-scroll-body');
        for (let index = 0; index < 3 && !(await body.evaluate((element) => element === document.activeElement)); index += 1) await rolePage.keyboard.press('Tab');
        await expect(body).toBeFocused();
        expect(await body.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
        await rolePage.keyboard.press('Tab');
        expect(await body.evaluate((element) => element.contains(document.activeElement))).toBe(true);
        await rolePage.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
      } finally {
        await context.close();
      }
    });
  }

  test('Guidance desktop Role body scrolls from the genuine keyboard stop', async ({ page }) => {
    await mountHarnessVault(page);
    await page.setViewportSize({ width: 1024, height: 420 });
    await page.goto('/en/ontology/insights/?tab=harness&guides=off');
    const trigger = page.locator('[data-role="told"][data-state="filled"]').first();
    await trigger.focus();
    await page.keyboard.press('Enter');
    const popup = page.getByTestId('harness-role-popup');
    await expect(popup).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(popup.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Tab');
    const body = page.getByTestId('harness-role-scroll-body');
    await expect(body).toBeFocused();
    expect(await body.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
    await page.keyboard.press('PageDown');
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  for (const domains of [8, 10] as const) {
    for (const locale of ['ko', 'en'] as const) {
      for (const zoom of [false, true] as const) {
        for (const viewport of [
          { width: 1512, height: 949 },
          { width: 1440, height: 900 },
          { width: 1024, height: 768 },
          { width: 390, height: 844 },
        ] as const) {
          test(`Guidance geometry ledger ${domains} ${locale} ${zoom ? '200%' : 'normal'} ${viewport.width}x${viewport.height}`, async ({ browser, page }) => {
            if (domains === 8) {
              await mountHarnessVault(page);
              const entry = await measureGuidanceGeometry(page, { domains, locale, zoom, ...viewport });
              console.info('GUIDANCE_32_STATE', JSON.stringify(entry));
              return;
            }
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

  for (const sample of [{ width: 1512, height: 949, narrow: false }, { width: 390, height: 844, narrow: true }] as const) {
    test(`Guidance reduced-motion presenter preserves facts and focus at ${sample.width}px`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: 1512, height: 949 }, reducedMotion: 'reduce' });
      const reducedPage = await context.newPage();
      try {
        await installHarnessRuntime(reducedPage);
        await mountHarnessVault(reducedPage);
        await reducedPage.setViewportSize({ width: sample.width, height: sample.height });
        await reducedPage.goto('/en/ontology/insights/?tab=harness&guides=off');
        expect(await reducedPage.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
        const overview = reducedPage.getByTestId('harness-coverage-overview');
        await expect(overview).toBeVisible();
        const diagramFacts = await overview.locator('[data-testid^="harness-domain-"]').evaluateAll((domains) => domains.map((domain) => ({ name: domain.getAttribute('aria-label'), roles: [...domain.querySelectorAll<HTMLElement>('[data-role]')].map((role) => ({ role: role.dataset.role, count: role.textContent?.match(/\d+/)?.[0] })) })));
        const textMode = reducedPage.getByTestId('guidance-mode-text');
        await textMode.focus();
        await textMode.click();
        await expect(textMode).toBeFocused();
        const textRows = overview.locator('[data-testid^="harness-text-domain-"]');
        await expect(textRows).toHaveCount(8);
        expect(await textRows.evaluateAll((rows) => rows.map((row) => ({ name: row.querySelector('h4')?.textContent, roles: [...row.querySelectorAll<HTMLElement>('[data-role]')].map((role) => ({ role: role.dataset.role, count: role.textContent?.match(/\d+/)?.[0] })) })))).toEqual(diagramFacts);
        const trigger = textRows.first().locator('[data-role][data-state="filled"]').first();
        await trigger.click();
        const surface = sample.narrow ? reducedPage.getByTestId('harness-role-dialog') : reducedPage.getByTestId('harness-role-popup');
        await expect(surface).toBeVisible();
        await expect(reducedPage.getByTestId('harness-role-evidence')).toHaveAttribute('data-domain');
        const globalToggle = reducedPage.getByTestId('harness-global-evidence-toggle');
        await globalToggle.click();
        const firstGlobal = reducedPage.locator('[data-evidence-kind="global"]').first();
        if (await firstGlobal.count()) {
          await firstGlobal.getByRole('button').click();
          await expect(firstGlobal.locator('.ai-row-disclosure')).toHaveAttribute('data-state', 'open');
        }
        if (sample.narrow) {
          await surface.getByRole('button', { name: 'Close' }).click();
          await expect(surface).toHaveCount(0);
          await expect(trigger).toBeFocused();
        } else {
          await reducedPage.setViewportSize({ width: 1512, height: 650 });
          const field = overview.locator('[data-domain-count]');
          // A condition wait, not one read: the field refits to the new window a frame after the
          // resize, and the single read measured the old fit — red on every local run and green in
          // CI only on retry (2026-09-24), which `.claude/rules/testing.md` says is not a gate.
          await expect.poll(() => field.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
          await field.evaluate((element) => { element.scrollTop = element.scrollHeight; });
          await expect(surface).toHaveCount(0);
          await expect(field).toBeFocused();
        }
      } finally {
        await context.close();
      }
    });
  }

  for (const locale of ['ko', 'en'] as const) {
    for (const viewport of [
      { width: 2560, height: 949 },
      { width: 834, height: 900 },
      { width: 600, height: 844 },
      { width: 320, height: 844 },
    ] as const) {
      test(`Guidance missing normal-width ledger ${locale} ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await mountHarnessVault(page);
        const entry = await measureGuidanceGeometry(page, { domains: 8, locale, zoom: false, ...viewport });
        console.info('GUIDANCE_MISSING_WIDTH', JSON.stringify(entry));
      });
    }
  }

  for (const domains of [8, 10] as const) {
    for (const locale of ['ko', 'en'] as const) {
      for (const zoom of [false, true] as const) {
        for (const viewport of [{ width: 1512, height: 949 }, { width: 1024, height: 768 }, { width: 390, height: 844 }] as const) {
          test(`Guidance Text ledger ${domains} ${locale} ${zoom ? '200%' : 'normal'} ${viewport.width}x${viewport.height}`, async ({ browser, page }) => {
            if (domains === 8) {
              await mountHarnessVault(page);
              console.info('GUIDANCE_TEXT_STATE', JSON.stringify(await measureGuidanceText(page, { domains, locale, zoom, ...viewport })));
              return;
            }
            const context = await browser.newContext({ viewport: { width: 1512, height: 949 } });
            const textPage = await context.newPage();
            try {
              await installHarnessRuntime(textPage, { includeOverflowDomains: true });
              await mountHarnessVault(textPage);
              console.info('GUIDANCE_TEXT_STATE', JSON.stringify(await measureGuidanceText(textPage, { domains, locale, zoom, ...viewport })));
            } finally {
              await context.close();
            }
          });
        }
      }
    }
  }

  test("목적지 이름과 한 줄 설명이 하네스를 말한다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("하네스");
    // Exactly one page headline: the identity travels into the blueprint's own header.
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    /*
     * The explainer stands on the document views. In the blueprint the line directly under the
     * title already names the profile and what the view compares, and 20px there is a third of a
     * layer row — the difference between the ladder tightening its seven rows and hiding the
     * seventh (measured 2026-09-13).
     */
    await page.locator("#harness-tab-guides").click();
    await expect(
      page.getByText("에이전트가 이 저장소에서 어떻게 일하도록 되어 있는지"),
    ).toBeVisible();
    // The rail label moved with the tab; the route did not.
    await expect(page.getByTestId("app-nav-rail")).toContainText("하네스");
    expect(new URL(page.url()).pathname).toBe("/ko/architecture/");
  });

  test('Analysis guidance evidence is one portalled anchored dialog with a narrow modal equivalent', async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto('/ko/ontology/insights/?tab=harness&guides=off');
    const overview = page.getByTestId('harness-coverage-overview');
    await expect(overview).toBeVisible();
    const trigger = overview.locator('[data-role]').first();
    await trigger.focus();
    await trigger.click();
    const popup = page.getByTestId('harness-role-popup');
    await expect(popup).toBeVisible();
    await expect(popup).toBeFocused();
    expect(await popup.evaluate((node) => ({
      parent: node.parentElement === document.body,
      insideOverview: !!node.closest('[data-testid="harness-coverage-overview"]'),
      kind: node.getAttribute('data-transient-surface'),
      modal: node.getAttribute('aria-modal'),
    }))).toEqual({ parent: true, insideOverview: false, kind: 'anchored', modal: 'false' });
    const globalExplanation = popup.getByTestId('harness-global-evidence-explanation');
    const globalAction = popup.getByTestId('harness-global-evidence-toggle');
    expect(await globalExplanation.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await globalAction.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      const control = element.getBoundingClientRect();
      return text.left >= control.left - 1 && text.right <= control.right + 1 && text.top >= control.top - 1 && text.bottom <= control.bottom + 1;
    })).toBe(true);
    await auditGuidanceSurface(page, 'harness-role-popup', 'dialog');
    await page.keyboard.press('Escape');
    await expect(popup).toHaveAttribute('inert');
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    await trigger.click();
    await expect(page.getByTestId('harness-role-dialog')).toBeVisible();
    await expect(page.getByTestId('harness-role-popup')).toHaveCount(0);
    await auditGuidanceSurface(page, 'harness-role-dialog', 'dialog');
  });

  test('measured Guidance keeps balanced tracks, readable ports, and pane-bounded evidence across affected bands', async ({ page }) => {
    await mountHarnessVault(page);
    const measurements: unknown[] = [];
    const cases = [
      { locale: 'ko', width: 1512, height: 949, columns: 4, zoom: false },
      { locale: 'en', width: 1440, height: 900, columns: 4, zoom: false },
      { locale: 'en', width: 1920, height: 1080, columns: 4, zoom: false },
      { locale: 'ko', width: 1024, height: 800, columns: 2, zoom: false },
      { locale: 'en', width: 768, height: 900, columns: 2, zoom: false },
      { locale: 'ko', width: 390, height: 844, columns: 1, zoom: false },
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
      const surface = sample.width <= 767 ? page.getByTestId('harness-role-dialog') : page.getByTestId('harness-role-popup');
      await expect(surface).toBeVisible();
      const evidence = page.getByTestId('harness-role-evidence');
      expect(Number(await evidence.getAttribute('data-scoped-count'))).toBe(scopedCount);
      await expect(evidence.locator('[data-evidence-kind="scoped"]')).toHaveCount(scopedCount);
      const globalCount = Number(await evidence.locator('[data-global-count]').getAttribute('data-global-count'));
      await evidence.getByTestId('harness-global-evidence-toggle').click();
      await expect(evidence.locator('[data-evidence-kind="global"]')).toHaveCount(globalCount);

      let popupBounds: unknown = null;
      if (sample.width > 767) {
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
      } else {
        await surface.getByRole('button', { name: sample.locale === 'ko' ? '닫기' : 'Close' }).click();
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

  for (const sample of [
    { locale: 'ko', zoom: false },
    { locale: 'en', zoom: false },
    { locale: 'ko', zoom: true },
    { locale: 'en', zoom: true },
  ] as const) {
    test(`measured Guidance keeps ten ${sample.locale} domains reachable inside its own scroller${sample.zoom ? ' at 200% text' : ''}`, async ({ browser }) => {
      const overflowContext = await browser.newContext({ viewport: { width: 1512, height: 949 } });
      const overflowPage = await overflowContext.newPage();
      try {
        await installHarnessRuntime(overflowPage, { includeOverflowDomains: true });
        await mountHarnessVault(overflowPage);
        await overflowPage.goto(`/${sample.locale}/ontology/insights/?tab=harness&guides=off`);
        if (sample.zoom) await overflowPage.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        const overview = overflowPage.getByTestId('harness-coverage-overview');
        await expect(overview).toBeVisible();
        await expect(overview.locator('[data-testid^="harness-domain-"]')).toHaveCount(10);
        const field = overview.locator('[data-domain-count]');
        const before = await field.evaluate((fieldElement) => {
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
            documentCapacity: document.documentElement.scrollHeight - innerHeight,
            pageScroll: { x: scrollX, y: scrollY },
          };
        });
        expect(before.chain.slice(1).filter((entry) => entry.overflowY === 'auto' || entry.overflowY === 'scroll').every((entry) => entry.capacity <= 1)).toBe(true);
        expect(before.documentCapacity).toBeLessThanOrEqual(1);
        await field.evaluate((element) => { element.scrollTop = element.scrollHeight; });
        const last = overview.locator('[data-testid^="harness-domain-"]').last();
        await expect.poll(() => last.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const fieldBox = element.closest('[data-domain-count]')!.getBoundingClientRect();
          return box.top >= fieldBox.top && box.bottom <= fieldBox.bottom;
        })).toBe(true);
        const after = await overflowPage.evaluate(() => {
          const fieldElement = document.querySelector<HTMLElement>('[data-domain-count]')!;
          const lastDomain = [...document.querySelectorAll<HTMLElement>('[data-testid^="harness-domain-"]')].at(-1)!;
          const roles = [...lastDomain.querySelectorAll<HTMLElement>('[data-role]')].map((role) => {
            const rect = role.getBoundingClientRect();
            return {
              role: role.dataset.role,
              hit: role.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)),
            };
          });
          return {
            fieldScrollTop: fieldElement.scrollTop,
            roles,
            documentCapacity: document.documentElement.scrollHeight - innerHeight,
            pageScroll: { x: scrollX, y: scrollY },
            overflowX: document.documentElement.scrollWidth - innerWidth,
          };
        });
        if (before.fieldCapacity > 0) expect(after.fieldScrollTop).toBeGreaterThan(0);
        else expect(after.fieldScrollTop).toBe(0);
        expect(after.roles).toHaveLength(3);
        expect(after.roles.every((role) => role.hit), `last-domain roles were not hit-testable: ${JSON.stringify(after.roles)}`).toBe(true);
        expect(after.documentCapacity).toBeLessThanOrEqual(1);
        expect(after.pageScroll).toEqual(before.pageScroll);
        expect(after.overflowX).toBe(0);
        console.info('GUIDANCE_TEN_DOMAIN_SCROLL', JSON.stringify({ ...sample, before, after }));
      } finally {
        await overflowContext.close();
      }
    });
  }

  test('Brief restores its normal scrolling contract after measured Guidance', async ({ page }) => {
    await mountHarnessVault(page);
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/en/ontology/insights/?tab=brief&guides=off');
    await expect(page.getByTestId('brief-tab')).toBeVisible();
    const main = page.locator('main[data-insights-surface="maintenance-board"]');
    const swapHost = page.locator('[data-insights-panel]').locator('..');
    const briefBefore = await main.evaluate((element) => ({ overflowY: getComputedStyle(element).overflowY, className: element.className }));
    expect(briefBefore.className).toContain('min-h-full');
    expect(briefBefore.className).not.toContain('overflow-hidden');

    await page.getByTestId('insights-core-harness').click();
    await expect(page.getByTestId('harness-coverage-overview')).toBeVisible();
    await waitForFiniteAnimations(page);
    expect(await main.getAttribute('class')).toContain('overflow-hidden');

    await page.getByTestId('insights-core-brief').click();
    await expect(page.getByTestId('brief-tab')).toBeVisible();
    await waitForFiniteAnimations(page);
    await expect.poll(() => swapHost.evaluate((element) => ({ height: (element as HTMLElement).style.height, transition: (element as HTMLElement).style.transition }))).toEqual({ height: '', transition: '' });
    const briefAfter = await main.evaluate((element) => ({ overflowY: getComputedStyle(element).overflowY, className: element.className }));
    expect(briefAfter).toEqual(briefBefore);
    expect(await page.locator('[data-insights-panel="brief"]').getAttribute('class')).not.toContain('overflow-hidden');
    console.info('GUIDANCE_BRIEF_SCROLL_RESTORE', JSON.stringify({ briefBefore, briefAfter }));
  });

  test('measured Guidance role controls keep the coarse-pointer touch floor', async ({ browser }) => {
    const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const touchPage = await touchContext.newPage();
    try {
      await installHarnessRuntime(touchPage);
      await touchPage.goto('/ko/?guides=off');
      await touchPage.waitForLoadState('networkidle');
      await touchPage.getByTestId('first-run-open').click();
      /* At 390 the gateway already draws the primary tab bar, so it proves nothing about the
         folder: wait for the gateway itself to leave before navigating away from it. */
      await expect(touchPage.getByTestId('first-run-open')).toHaveCount(0, { timeout: 60_000 });
      await expect(touchPage.locator('[data-tabbar="primary"]')).toBeVisible();
      await touchPage.goto('/ko/ontology/insights/?tab=harness&guides=off');
      const touchOverview = touchPage.getByTestId('harness-coverage-overview');
      await expect(touchOverview).toBeVisible();
      expect(await touchPage.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      const touchFloor = await touchOverview.locator('[data-role]').evaluateAll((roles) => roles.map((role) => {
        const rect = role.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }));
      expect(touchFloor.every((role) => role.width >= 44 && role.height >= 44)).toBe(true);
      console.info('GUIDANCE_COARSE_POINTER', JSON.stringify({ minWidth: Math.min(...touchFloor.map((role) => role.width)), minHeight: Math.min(...touchFloor.map((role) => role.height)) }));
    } finally {
      await touchContext.close();
    }
  });

  test("기본 보기는 하네스 구조이고, 세그먼트가 보기를 주소에 적는다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/");
    await expect(page.getByTestId("harness-anatomy")).toBeVisible({ timeout: 30_000 });

    await page.locator("#harness-tab-guides").click();
    await expect(page).toHaveURL(/\?view=guides$/);
    await page.locator("#harness-tab-coverage").click();
    await expect(page).toHaveURL(/\?view=coverage$/);
    await expect(page.getByTestId("harness-coverage")).toBeVisible();

    /*
     * The address is rewritten in place, not pushed — switching view inside one destination is not
     * a place a person navigated to, and pushing would make Back walk the segmented control instead
     * of leaving the screen (the grammar `/mcp` already uses for its tabs). What the URL owes is a
     * refresh and a shared link landing on the same view.
     */
    await page.reload();
    await expect(page.getByTestId("harness-coverage")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\?view=coverage$/);
  });

  test('diagram keyboard traversal keeps each focused part above mobile navigation', async ({page}) => {
    await mountHarnessVault(page);
    await page.setViewportSize({width:390,height:844});
    await page.goto('/ko/architecture/?view=structure&guides=off');
    const nodes=page.locator('[data-testid^="harness-diagram-node-"]');
    await expect(nodes).toHaveCount(13);
    await nodes.first().focus();
    for(const node of await nodes.all()){
      /* The loop card's own hint button sits between the told and gated bands in reading order;
         it is a real stop, so the walk steps over it rather than pretending it is not there. */
      for (let guard = 0; guard < 2 && !(await node.evaluate((el) => el === document.activeElement)); guard += 1) {
        await page.keyboard.press('Tab');
      }
      await expect(node).toBeFocused();
      await expect.poll(()=>node.evaluate(el=>{
        const box=el.getBoundingClientRect();const bar=document.querySelector('[data-tabbar="primary"]')?.getBoundingClientRect();
        return box.top>=0 && box.bottom<=(bar?.top??innerHeight) && el.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));
      })).toBe(true);
      await page.keyboard.press('Tab');
    }
  });

  test('mobile diagram reveals selected file evidence beside its keyboard-activated row', async ({page}) => {
    await mountHarnessVault(page);
    await page.setViewportSize({width:390,height:844});
    await page.goto('/ko/architecture/?view=structure&guides=off');
    const row=page.getByTestId('harness-diagram-node-scoped');
    await row.focus();
    await page.keyboard.press('Enter');
    const evidence=page.getByTestId('harness-anatomy-slot-scoped');
    await expect(evidence).toBeVisible();
    await expect(row).toHaveAttribute('aria-expanded','true');
    await expect.poll(()=>page.evaluate(({rowId,evidenceId})=>{
      const row=document.querySelector(`[data-testid="${rowId}"]`)!.getBoundingClientRect();
      const evidence=document.querySelector(`[data-testid="${evidenceId}"]`)!.getBoundingClientRect();
      const bar=document.querySelector('[data-tabbar="primary"]')!.getBoundingClientRect();
      const button=document.querySelector(`[data-testid="${rowId}"]`)!;
      const rowHit=button.contains(document.elementFromPoint(row.left+row.width/2,row.top+row.height/2));
      return rowHit && row.bottom<=evidence.top && evidence.top<bar.top;
    },{rowId:'harness-diagram-node-scoped',evidenceId:'harness-anatomy-slot-scoped'})).toBe(true);
  });

  test('reduced motion keeps the selected evidence fade without travel', async ({page}) => {
    await page.emulateMedia({reducedMotion:'reduce'});
    await mountHarnessVault(page);
    await page.setViewportSize({width:390,height:844});
    await page.goto('/ko/architecture/?view=structure&guides=off');
    await page.getByTestId('harness-diagram-node-scoped').click();
    const evidence=page.getByTestId('harness-anatomy-slot-scoped');
    await expect(evidence).toBeVisible();
    const motion=await evidence.evaluate(el=>{
      const detail=el.closest('ul')!.parentElement!;
      const style=getComputedStyle(detail);
      return {name:style.animationName,duration:style.animationDuration,transform:style.transform};
    });
    expect(motion.name).toContain('detailFade');
    expect(motion.duration).toBe('0.12s');
    expect(motion.transform).toBe('none');
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
    await page.setViewportSize({ width: 1440, height: 650 });
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

  test("은퇴한 sensors 주소는 그 질문에 답하는 보기로 간다", async ({ page }) => {
    /*
     * The sensors view named this exact question — which checks cover each domain's paths, and
     * where nobody is watching — and said it was not built. It is built now, so that address opens
     * the answer. The shell-wide `?focus=main` that every left-rail link carries names no view, so
     * it opens the destination's own arrival screen — the harness structure, since 2026-09-19.
     */
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=sensors");
    await expect(page.getByTestId("harness-coverage")).toBeVisible({ timeout: 30_000 });

    await page.goto("/ko/architecture/?focus=main");
    await expect(page.getByTestId("harness-anatomy")).toBeVisible({ timeout: 30_000 });

    /* A blueprint deep link keeps working with no `?view=` on it: `?role=` and `?stage=` exist on
       no other view, so an address carrying one names the blueprint by itself. Every link written
       while the blueprint was the default would otherwise land on a screen with no roles. */
    await page.goto("/ko/architecture/?role=widgets");
    await expect(page.getByTestId("architecture-flow-panel")).toBeVisible({ timeout: 30_000 });
  });

  test("설명 말풍선은 그 아래 본문에 덮이지 않는다", async ({ page }) => {
    /*
     * ⚠️ **A panel that is on screen is not yet a panel that can be read.** The lead sentence's
     * `InfoHint` hangs out of `harness-sentence`, and the results block is the *next sibling*, so
     * every mark it draws — the guides heading, the file table, the matrix — painted on top of the
     * open panel and the two texts read as one smear (owner, 2026-09-14, installed app). The
     * panel's own `z-30` could never fix it: it orders the panel inside its own element, never
     * against the element that follows it.
     *
     * The geometry gate at 390 could not see this: a panel fully inside the window is exactly what
     * an occluded panel also is. So this measures **what a person's eye lands on** —
     * `elementFromPoint` over the panel's own text — which is the only question a tooltip has.
     */
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    await expect(page.getByTestId("harness-guides")).toBeVisible({ timeout: 30_000 });

    const hint = page.getByRole("button", { name: "검사를 세는 방법" });
    await hint.focus();
    const panelId = (await hint.getAttribute("aria-describedby"))!;
    const panel = page.locator(`#${panelId.replace(/:/g, "\\:")}`);
    await expect(panel).toBeVisible();

    /* Nine probes down the panel's own column, because the overlap was partial: the first lines
       cleared the heading and the ones below did not. One point in the middle is a coin toss. */
    const covered = await page.evaluate((id) => {
      const el = document.getElementById(id)!;
      const box = el.getBoundingClientRect();
      const hits: string[] = [];
      /* A panel shown by focus lets the pointer through (`InfoHint`, 2026-09-25), and
         `elementFromPoint` skips what the pointer skips. Paint order is the question here,
         so the probe makes the panel hit-testable for the length of the reading. */
      const previous = el.style.pointerEvents;
      el.style.pointerEvents = "auto";
      for (let i = 1; i <= 9; i += 1) {
        const y = box.top + (box.height * i) / 10;
        const at = document.elementFromPoint(box.left + box.width / 2, y);
        if (!at || !el.contains(at)) {
          hits.push(`${i}/10 → ${at ? `${at.tagName}.${at.className}`.slice(0, 60) : "null"}`);
        }
      }
      el.style.pointerEvents = previous;
      return hits;
    }, panelId);
    expect(covered, `설명 말풍선이 아래 본문에 덮였다: ${covered.join(" | ")}`).toEqual([]);
  });

  test("구조 보기가 저장소가 알려주는 것·막는 것·지켜보는 것을 부속별로 세고, 도구가 가진 자리는 숫자로 세지 않는다", async ({ page }) => {
    /*
     * The tab is named Harness and its first screen used to be the product's layer ladder. The
     * owner named the mismatch on 2026-09-19: that ladder is architecture, which a harness
     * regulates, not a part of the harness. This is what took its place, and the assertions are
     * about the two readings it must never allow — a grade, and a zero where the answer is simply
     * not in the checkout.
     */
    /*
     * ⚠️ The console is part of this assertion. An `InfoHint` placed inside a `<p>` renders a
     * `div` in a paragraph, which React reports as a hydration error and the dev overlay counts
     * silently in the corner — the screen looked perfectly correct while doing it (2026-09-20).
     */
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await mountHarnessVault(page);
    await page.goto("/ko/architecture/");
    const anatomy = page.getByTestId("harness-anatomy");
    await expect(anatomy).toBeVisible({ timeout: 30_000 });

    // Same three words as the coverage matrix: one destination, one vocabulary.
    await expect(page.getByTestId("harness-anatomy-band-tells")).toContainText("말해둔 것");
    await expect(page.getByTestId("harness-anatomy-band-gates")).toContainText("막는 것");
    await expect(page.getByTestId("harness-anatomy-band-watches")).toContainText("지켜보는 것");

    await expect(page.getByTestId('harness-structure-diagram')).toBeVisible();
    await page.getByTestId('harness-diagram-node-always').click();
    await expect(page.getByTestId('harness-anatomy-slot-always')).toContainText('.claude/rules/forbidden.md');
    await page.getByTestId('harness-view-text').click();
    await expect(page.getByTestId('harness-structure-diagram')).toHaveCount(0);

    // A rule with no `paths:` is read every time; one with `paths:` joins only for its folder.
    await expect(page.getByTestId("harness-anatomy-slot-always")).toContainText(
      ".claude/rules/forbidden.md",
    );
    await expect(page.getByTestId("harness-anatomy-slot-scoped")).toContainText(
      ".claude/rules/cart.md",
    );
    // Nested AGENTS.md files attach by path, which is the whole reason they exist.
    await expect(page.getByTestId("harness-anatomy-slot-scoped")).toContainText("src/AGENTS.md");

    // A hook that can refuse is not the same fact as a hook that only records, and the fixture's
    // Claude and Codex copies of one guard are one name: the script's own.
    await expect(page.getByTestId("harness-anatomy-slot-toolGates")).toContainText(
      "block-unsafe-git.sh",
    );
    await expect(page.getByTestId("harness-anatomy-count-toolGates")).toHaveText("훅 1개");
    await expect(page.getByTestId("harness-anatomy-slot-permissions")).toContainText(
      "허용 1 · 물어봄 0 · 금지 2",
    );

    // The pipeline phase has its own row, so a repository guarded only by CI is not drawn as
    // having nothing watching it. This fixture has no workflows, which the row states.
    await expect(page.getByTestId("harness-anatomy-count-pipeline")).toHaveText("아직 없음");

    // An empty part is visible *and addable*: the conventional address, copyable, never advice.
    const emptyTools = page.getByTestId("harness-anatomy-slot-tools");
    await expect(emptyTools).toContainText("이런 것이 사는 자리");
    await expect(emptyTools).toContainText(".mcp.json");
    // And a part that is there is not told where it could have been.
    await expect(page.getByTestId("harness-anatomy-slot-always")).not.toContainText(
      "이런 것이 사는 자리",
    );

    // Nothing here is a mark out of ten, and an absent part says so in words.
    await expect(page.getByTestId("harness-anatomy-count-tools")).toHaveText("아직 없음");
    const loop = page.getByTestId("harness-anatomy-slot-loop");
    await expect(loop).toHaveAttribute("data-status", "tool-owned");
    await expect(loop).not.toContainText("아직 없음");
    await expect(anatomy).not.toContainText("%");

    // The half the rows cannot do: handing the reading to an agent without retyping it.
    await expect(page.getByTestId("harness-anatomy-brief")).toBeVisible();

    // The chain: a turn inside a governed folder pays the always-read set plus that folder's file,
    // which is the mechanic the tool documents and a flat per-repository number cannot express.
    await expect(page.getByTestId("harness-anatomy-slot-scoped")).toContainText("가장 깊은 사슬");

    // ⚠️ The fixture's config names `block-npm-publish.sh` and the disk does not have it. Every
    // count on this screen stays healthy while that guard is absent, so the absence is said out
    // loud — the one warning this view draws.
    await expect(page.getByTestId("harness-anatomy-silent")).toContainText("block-npm-publish.sh");

    // What the repository keeps out of sight is a gate, not a guide, and it keeps each product's
    // own file name.
    const blind = page.getByTestId("harness-anatomy-slot-blind");
    await expect(blind).toContainText(".cursorignore");
    await expect(blind).toContainText(".geminiignore");
    await expect(page.getByTestId("harness-anatomy-count-blind")).toHaveText("파일 2개");
    // And it is not counted among the documents the repository speaks through — read on the
    // coverage view, because the census sentence and these bands count by different rules and
    // this view does not print both.
    await expect(page.getByTestId("harness-sentence")).toHaveCount(0);

    // What every turn costs, beside the count that cannot say it.
    await expect(page.getByTestId("harness-anatomy-slot-always")).toContainText("매 턴 읽는 분량");

    expect(consoleErrors, "the structure view logged to the console").toEqual([]);

    // And the ladder is one press away, under its own name.
    await page.getByRole("tab", { name: "아키텍처" }).click();
    await expect(page.getByTestId("architecture-flow-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\?view=architecture$/);
  });

  test("커버리지 표가 영역마다 말해둔 것·막는 것·지켜보는 것을 말하고, 빈 칸은 문장으로 말한다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=coverage");
    const matrix = page.getByTestId("harness-coverage");
    await expect(matrix).toBeVisible({ timeout: 30_000 });

    // Each column gets a card: the count of areas it has no answer for, over a denominator the
    // reader can see. This replaced a headline sentence that could only ever speak for Watched.
    const watchedCard = page.locator('[data-testid="harness-coverage-column-card"][data-census-row="watched"]');
    await expect(watchedCard).toContainText("어떤 검사도 부르지 않는 도메인");

    // ⚠️ The card's number is not a derived statistic — it is the count of empty marks in the
    // column below it, so a reader can settle it by counting. If the two ever disagree the screen
    // is worse than the undecodable bar this replaced, so the agreement is the assertion.
    const declaredGap = await watchedCard.locator("[data-harness-column-gap]").getAttribute("data-harness-column-gap");
    const emptyMarks = await page.locator('[data-harness-cell="watched"][data-harness-cell-empty="true"]').count();
    expect(Number(declaredGap)).toBe(emptyMarks);

    // The always-loaded lanes are counted on the card of the column they qualify and open beneath
    // it. As a separate section below the table they were three flat runs of monospace names — the
    // disease that had just been removed from the table — furthest from the cells they explain.
    await expect(page.getByTestId("harness-coverage-everywhere")).toHaveCount(0);
    await watchedCard.getByTestId("harness-everywhere-toggle").click();
    const everywhere = page.getByTestId("harness-coverage-everywhere");
    await expect(everywhere).toContainText("lint");

    // ⚠️ Nine of this repository's hook names exist in both .claude/hooks/ and .codex/hooks/ as
    // real mirrored files, and the first build printed the bare name twice — which reads as a
    // rendering fault rather than as the mirror it is. Each name appears once now, and the tools
    // that read it carry the distinction the repetition destroyed.
    const toldCard = page.locator('[data-testid="harness-coverage-column-card"][data-census-row="told"]');
    await toldCard.getByTestId("harness-everywhere-toggle").click();
    const told = page.getByTestId("harness-coverage-everywhere");
    await expect(told).toContainText("forbidden");
    expect((await told.textContent())!.match(/forbidden/g)!).toHaveLength(1);

    // Every row carries the vault's purpose sentence, which is the whole reason the rows are areas
    // rather than folders: without it an empty cell can only say "a file is absent".
    const front = page.locator('[data-harness-area="domains/shop-front"]');
    const api = page.locator('[data-harness-area="domains/shop-api"]');
    await expect(front).toContainText("What a shopper touches");
    await expect(api).toContainText("The order service every storefront screen reads");

    // The shop front is watched by a check that names its path; the API is watched by nothing, and
    // the gap is a mark rather than a sentence so it can be compared down the column at a glance.
    await expect(front.locator('[data-harness-cell="watched"]')).toHaveAttribute(
      "data-harness-cell-empty",
      "false",
    );
    await expect(api.locator('[data-harness-cell="watched"]')).toHaveAttribute(
      "data-harness-cell-empty",
      "true",
    );

    // The names are one press away, beside the cell — never a full-screen detail.
    await front.locator('[data-harness-cell="watched"]').click();
    await expect(page.getByTestId("harness-coverage-detail")).toContainText("test:cart");

    // The empty cell opens the vault's own record of what the area is for — the sentence a
    // file-only scanner cannot write — beside the paths nothing names.
    await api.locator('[data-harness-cell="watched"]').click();
    const detail = page.getByTestId("harness-coverage-detail");
    await expect(detail).toContainText("The order service every storefront screen reads");
    await expect(detail).toContainText("api/orders");

    // No score, no grade, no percentage: the thing every competitor ships and this may not.
    expect(await matrix.textContent()).not.toMatch(/%|점수|등급|성숙도/);
  });

  test("390 에서도 설명 말풍선이 화면 안에 있고, 빈 칸이 비어 보이지 않고, 마지막 잉크가 하단 탭에 가리지 않는다", async ({ page }) => {
    /*
     * ⚠️ **This is the width where the round-two shape can break, and nothing measured it.**
     * `scroll-end-gap.spec.ts`'s folder-open pass runs at two ≥lg viewports and stubs the browser
     * picker, so on this route it would measure the "a browser cannot read this" card rather than
     * the matrix — a gate with the wrong subject. The runtime lives here, so the measurement does
     * too (design-responsive, 2026-09-13).
     *
     * Three things, each a real defect that was found by measuring rather than by looking:
     *
     * 1. The column definitions live in an `InfoHint` on each card, and the reach block's three
     *    states in one on its heading. Those panels are 288px wide and hang from a 24px button, so
     *    at 390 the lead's ran **84.9%** off the left edge and the first card's **68.6%**, and a
     *    per-tile version in the reach strip landed at x **−89.97** while its neighbour cleared the
     *    window by under a pixel. So this measures *clearance*, not survival: a panel that fits by
     *    0.6px is a coincidence one translation away from a defect nobody re-measures.
     * 2. Below `sm` the "None" word steps aside, because in English it overran the 39px cell by
     *    11.5px and stole the next column's press. Leaving the slot **empty** there is the table
     *    convention for "no data" beside siblings that all carry a digit.
     * 3. The bottom tab bar is fixed at this width, and the reserve was measured once with the
     *    provenance disclosure open and once shut because it came to −1px in one of those states.
     */
    await mountHarnessVault(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ko/architecture/?view=coverage");
    await expect(page.getByTestId("harness-coverage")).toBeVisible({ timeout: 30_000 });

    // ① Every hint panel clears both window edges by a real margin — not by a rounding error.
    //    8px is the panel's own `mt-2` offset from its trigger: nothing on this screen sits closer
    //    to the window edge than a floating surface sits to the thing that opened it.
    const HINT_EDGE_CLEARANCE = 8;
    const hints = page.locator("[aria-describedby]");
    const hintCount = await hints.count();
    /* Five at this width: the lead sentence, the three column cards, the reach heading. A smaller
       number means a subject vanished and the measurement lost it, which is not a pass. */
    expect(hintCount, "설명 버튼이 모자란다 — 측정 실패이지 통과가 아니다").toBeGreaterThanOrEqual(5);
    const boxes: string[] = [];
    for (let i = 0; i < hintCount; i += 1) {
      const hint = hints.nth(i);
      await hint.scrollIntoViewIfNeeded();
      await hint.focus();
      const panel = page.locator(`#${(await hint.getAttribute("aria-describedby"))!.replace(/:/g, "\\:")}`);
      const box = (await panel.boundingBox())!;
      boxes.push(`${i}: x=${box.x.toFixed(1)} right=${(box.x + box.width).toFixed(1)}`);
      expect(box.x, `${i}번 설명 말풍선이 왼쪽 창가에 너무 붙었다 [${boxes.join(" | ")}]`).toBeGreaterThanOrEqual(
        HINT_EDGE_CLEARANCE,
      );
      expect(
        box.x + box.width,
        `${i}번 설명 말풍선이 오른쪽 창가에 너무 붙었다 [${boxes.join(" | ")}]`,
      ).toBeLessThanOrEqual(390 - HINT_EDGE_CLEARANCE);
    }
    console.log("hint panels at 390:", boxes.join(" | "));

    // ② An empty cell prints its zero where the word cannot fit.
    const emptyCell = page.locator('[data-harness-cell][data-harness-cell-empty="true"]').first();
    await expect(emptyCell).toHaveText(/\d/);

    // ③ The page never scrolls sideways, and the last ink clears the fixed bottom tabs.
    async function clearanceBelowLastInk() {
      return page.evaluate(async () => {
      const scroller = document.querySelector('[role="tabpanel"]') as HTMLElement;
      scroller.scrollTo({ top: scroller.scrollHeight });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const tabs = document.querySelector('[data-tabbar="primary"]');
      const tabsTop = tabs ? tabs.getBoundingClientRect().top : window.innerHeight;
      let lowest = 0;
      let lowestWhat = "";
      for (const el of scroller.querySelectorAll("*")) {
        if (!el.textContent?.trim()) continue;
        /*
         * ⚠️ A closed `<details>` keeps its children's boxes in Chromium — the subtree is skipped
         * with `content-visibility`, not `display: none` — so measuring every descendant reported
         * the collapsed provenance rules as the page's last ink, 18.4px "below" the fold. Only ink
         * a reader can actually see counts.
         */
        const fold = el.closest("details");
        if (fold && !fold.open && el.closest("summary") === null) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.bottom > lowest) {
          lowest = r.bottom;
          lowestWhat = `${el.tagName}.${el.className.toString().slice(0, 60)}|${el.textContent.trim().slice(0, 30)}`;
        }
      }
      return {
        sideways: document.documentElement.scrollWidth - window.innerWidth,
        gap: +(tabsTop - lowest).toFixed(1),
        tabsFound: !!tabs,
        tabsTop: +tabsTop.toFixed(1),
        lowest: +lowest.toFixed(1),
        lowestWhat: lowestWhat,
        scrollTop: scroller.scrollTop,
        maxScroll: scroller.scrollHeight - scroller.clientHeight,
      };
      });
    }

    /* Both fold states, because the reserve was written after it measured 5px closed and −1px open
       on this very screen — one state passing is not the reserve working. */
    const closed = await clearanceBelowLastInk();
    expect(closed.sideways, "가로 스크롤이 생겼다").toBeLessThanOrEqual(0);
    expect(closed.tabsFound, "하단 탭을 못 찾았다 — 계측 실패이지 통과가 아니다").toBe(true);
    expect(
      closed.gap,
      `접힌 상태에서 마지막 잉크가 하단 탭에 붙었다 (${closed.lowestWhat})`,
    ).toBeGreaterThan(0);

    await page.getByTestId("harness-coverage-provenance").click();
    const open = await clearanceBelowLastInk();
    expect(open.sideways, "펼친 뒤 가로 스크롤이 생겼다").toBeLessThanOrEqual(0);
    expect(
      open.gap,
      `펼친 상태에서 마지막 잉크가 하단 탭에 붙었다 (${open.lowestWhat})`,
    ).toBeGreaterThan(0);

    /*
     * ④ The same five panels at 768, where the column cards are 216px and the reach strip is
     *    3-up: the left / centre / right anchors are load bearing there, and a wrong one shows up
     *    as a negative x rather than as a near miss.
     */
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/ko/architecture/?view=coverage");
    await expect(page.getByTestId("harness-coverage")).toBeVisible({ timeout: 30_000 });
    const wide = page.locator("[aria-describedby]");
    const wideCount = await wide.count();
    expect(wideCount, "768 에서 설명 버튼이 모자란다").toBeGreaterThanOrEqual(5);
    for (let i = 0; i < wideCount; i += 1) {
      const hint = wide.nth(i);
      await hint.scrollIntoViewIfNeeded();
      await hint.focus();
      const panel = page.locator(`#${(await hint.getAttribute("aria-describedby"))!.replace(/:/g, "\\:")}`);
      const box = (await panel.boundingBox())!;
      expect(box.x, `768: ${i}번 설명 말풍선이 왼쪽으로 나갔다`).toBeGreaterThanOrEqual(HINT_EDGE_CLEARANCE);
      expect(box.x + box.width, `768: ${i}번 설명 말풍선이 오른쪽으로 나갔다`).toBeLessThanOrEqual(
        768 - HINT_EDGE_CLEARANCE,
      );
    }
  });

  test("문서가 지침인지, 지침이 이름을 댄 것인지, 아무도 안 부르는 것인지 셋으로 나뉜다", async ({ page }) => {
    /*
     * The harness's most common silent failure: a document that exists and no guide points at. The
     * fixture source tree carries one of each under its own `docs/` folder — one that the fixture's
     * AGENTS.md names by path, and one that nothing names.
     */
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=coverage");
    const reach = page.getByTestId("harness-reach");
    await expect(reach).toBeVisible({ timeout: 30_000 });
    await expect(reach.locator('[data-census-row="guides"]')).toContainText("지침");
    await expect(reach.locator('[data-census-row="named"]')).toContainText("1");
    /* Three: the fixture's unnamed document, plus both agent briefs. A brief is addressed by name
       rather than by path, so it lands here for a reason that is fine — which is exactly why the
       folders are printed beside the count instead of the rows being filtered. */
    await expect(reach.locator('[data-census-row="unnamed"]')).toContainText("3");

    // The breakdown of where the unnamed documents are opens on a press. Spilled permanently, the
    // most important number on the screen was the one followed by the most text on the screen.
    await expect(page.getByTestId("harness-reach-breakdown")).toHaveCount(0);
    await page.getByTestId("harness-reach-breakdown-toggle").click();
    await expect(page.getByTestId("harness-reach-breakdown")).toContainText("docs");
  });

  test("세는 방법은 문장이 아니라 접힌 자리에 있다", async ({ page }) => {
    /*
     * Every honesty rule this page depends on used to stand at body size in the reading flow, where
     * the most carefully reasoned part of the screen was the heaviest to read. The claim is
     * unchanged; it costs nothing until a reader asks for it.
     */
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=coverage");
    await expect(page.getByTestId("harness-coverage")).toBeVisible({ timeout: 30_000 });
    const rule = page.getByText("어떤 파일이 선언한 경로가", { exact: false });
    await expect(rule).toBeHidden();
    await page.getByTestId("harness-coverage-provenance").click();
    await expect(rule).toBeVisible();
  });

  test("지침 표가 도구별로 어느 파일을 읽는지 보여준다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    const table = page.getByTestId("harness-guides");
    await expect(table).toBeVisible({ timeout: 30_000 });

    // The walker question: which file does Codex read that Claude Code does not?
    const nested = page.getByTestId("harness-guide-row-nested-agents-md");
    await expect(nested).toContainText("Codex");
    await expect(nested).not.toContainText("Claude Code");
    await expect(page.getByTestId("harness-guide-row-claude-md")).toContainText("Claude Code");

    // Every tool claim carries the document it came from.
    await expect(nested.getByRole("link", { name: /출처/ }).first()).toHaveAttribute(
      "href",
      /^https:\/\//,
    );
    await expect(page.getByText(`읽은 곳 ${HARNESS_SOURCE_ROOT}`)).toBeVisible();
  });

  test("어긋난 짝을 세고, 차이 보기가 두 파일을 나란히 연다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    const drift = page.getByTestId("harness-drift");
    await expect(drift).toBeVisible({ timeout: 30_000 });
    await expect(drift).toContainText("내용 차이");
    await expect(page.getByTestId("harness-guides")).toContainText("참고용 2쌍 비교");

    await drift.getByText("차이 보기").first().click();
    const diff = page.getByTestId("harness-drift-diff");
    await expect(diff).toBeVisible();
    await expect(diff).toContainText(".claude/skills/po-pass/SKILL.md");
    await expect(diff).toContainText(".agents/skills/po-pass/SKILL.md");
    await expect(diff).toContainText("Diverged line.");
  });

  test("훅은 연결됨과 없음을 구별하고, Codex 는 초록 대신 승인 필요를 단다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    await expect(page.getByTestId("harness-guides")).toBeVisible({ timeout: 30_000 });

    // The script on disk is wired; the one only the config knows about is missing, and a missing
    // guard produces no error at all — which is exactly why it has to be on the screen.
    await expect(page.locator('[data-harness-hook-status="wired"]').first()).toBeVisible();
    await expect(page.locator('[data-harness-hook-status="missing"]').first()).toBeVisible();

    await expect(page.getByTestId("harness-hook-approval-gate")).toContainText(
      "도구 안에서 승인 필요",
    );
  });

  test("문장은 잰 숫자 둘만 말한다", async ({ page }) => {
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    const sentence = page.getByTestId("harness-sentence");
    await expect(sentence).toBeVisible({ timeout: 30_000 });
    await expect(sentence).toContainText("문서");
    await expect(sentence).toContainText("검사");
    /* ⚠️ The fixture holds two exclusion files (`.cursorignore`, `.geminiignore`), and this number
       must not move for them: a file that says what an agent may not see is the opposite of a
       document the repository speaks through. The outside-mapping fixture adds one valid Claude
       guide; the exact total is eleven. The structure view proves the rows; this proves the
       census the exclusions are kept out of. */
    await expect(sentence).toContainText("문서 11개");
    /* The two numbers here are file counts. The coverage claim has its own denominator and its own
       kind of statement, so it is not folded in beside them. */
    await expect(sentence.locator("p").first()).not.toContainText("영역");
  });

  test("아키텍처 보기는 카드 폭을 쓰고, 일곱 문장이 끝까지 나온다", async ({ page }) => {
    /*
     * Inspection 122, S8. Before this slice the ladder held its 280/72/240 faces whatever the
     * card's width, so at 1512 the drawn band was 592px inside a 1448px card (41 %), sat 124px
     * left of its centre, and all seven role sentences ended in an ellipsis while 856px of the
     * card stood empty. The owner's standing priority is a finished sentence over box symmetry.
     */
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=architecture");
    await expect(page.getByTestId("architecture-graph-box-views")).toBeVisible({ timeout: 30_000 });

    const measured = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="architecture-flow-panel"]');
      const boxes = [...document.querySelectorAll("[data-graph-box]")].map((box) =>
        box.getBoundingClientRect(),
      );
      const cardRect = card!.getBoundingClientRect();
      const left = Math.min(...boxes.map((b) => b.left));
      const right = Math.max(...boxes.map((b) => b.right));
      const sentences = [
        ...document.querySelectorAll('[data-testid^="architecture-box-line-"]'),
      ].map((node) => node.textContent ?? "");
      return {
        cardWidth: Math.round(cardRect.width),
        bandWidth: Math.round(right - left),
        offCentre: Math.round((left + right) / 2 - (cardRect.left + cardRect.right) / 2),
        truncated: sentences.filter((line) => line.trimEnd().endsWith("…")).length,
        roles: boxes.length,
      };
    });

    expect(measured.roles).toBe(7);
    expect(measured.truncated, "role sentences are cut again").toBe(0);
    // The band used 41 % of the card; more than half of it is the floor this fix has to keep.
    expect(measured.bandWidth / measured.cardWidth).toBeGreaterThan(0.5);
    expect(Math.abs(measured.offCentre), "the drawing slid off the card's centre").toBeLessThanOrEqual(8);
    // And the "not inspected yet" fact is stated once for the column, not once per role.
    await expect(page.getByTestId("architecture-observation-column-note")).toHaveCount(1);
  });

  test("다른 보기로 가는 길은 어떤 화면에서도 사라지지 않는다", async ({ page }) => {
    /*
     * The tab set must never be a property of the panel it switches. With no architecture profile
     * the blueprint returns its empty state early; a tab set rendered inside it vanished, and the
     * other two views had no path from the screen a person lands on (design-interaction, 2026-09-13).
     */
    await page.setViewportSize({ width: 1512, height: 949 });
    await installProfilelessHarnessRuntime(page);
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=architecture");
    await expect(page.getByRole("tablist")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("tab")).toHaveCount(4);
    // And the tab the open panel names actually exists, so `aria-labelledby` does not dangle.
    const labelledBy = await page
      .locator('[role="tabpanel"]')
      .first()
      .getAttribute("aria-labelledby");
    await expect(page.locator(`#${labelledBy}`)).toHaveCount(1);

    await page.getByRole("tab", { name: "지침" }).click();
    await expect(page.getByTestId("harness-guides")).toBeVisible({ timeout: 30_000 });
  });

  test("키보드로 보기를 옮겨도 초점이 탭에 남는다", async ({ page }) => {
    /*
     * One `TabBar` instance, not one per branch: the two-instance build unmounted the focused tab
     * on activation and the browser reset focus to `<body>`, from where no key did anything.
     */
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=guides");
    await page.getByRole("tab", { name: "지침" }).focus();
    for (const key of ["ArrowRight", "ArrowRight", "Home", "End"]) {
      await page.keyboard.press(key);
      const state = await page.evaluate(() => ({
        role: document.activeElement?.getAttribute("role"),
        selected: document.activeElement?.getAttribute("aria-selected"),
      }));
      expect(state.role, `focus left the tab set after ${key}`).toBe("tab");
      expect(state.selected, `focus landed on an unselected tab after ${key}`).toBe("true");
    }
  });
});
