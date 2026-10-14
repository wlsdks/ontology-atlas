import { expect, test } from '@playwright/test';

/** The app's wide-screen UI zoom must not resample native mascot pixels. */
for (const width of [1440, 2560]) {
  test(`native waiting art keeps its size inside and outside UI zoom at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/en/guide/');
    await expect(page.getByTestId('gateway-doc-title')).toBeVisible();
    const sizes = await page.evaluate(async () => {
      // Exercise the actual exported stylesheet. The standalone case deliberately
      // shares the root scale token without having an ancestor that applies zoom.
      const fixture = document.createElement('div');
      fixture.style.cssText = 'position:fixed;inset:0;z-index:200;';
      const measurements = [];
      for (const zoomed of [false, true]) {
        const host = document.createElement('div');
        if (zoomed) host.className = 'topology-ui-scale';
        const waiting = document.createElement('span');
        waiting.className = 'atlas-waiting-mark inline-block size-16';
        waiting.dataset.waitingMotion = 'still';
        const micro = document.createElement('img');
        micro.className = 'atlas-inline-waiting-mark size-4 max-w-none';
        micro.width = 16;
        micro.height = 16;
        micro.src = '/brand/mascot-micro.png';
        host.append(waiting, micro);
        fixture.append(host);
        document.body.append(fixture);
        await micro.decode();
        const waitRect = waiting.getBoundingClientRect();
        const microRect = micro.getBoundingClientRect();
        measurements.push({
          zoomed,
          hostZoom: Number(getComputedStyle(host).zoom),
          waitSize: [waitRect.width, waitRect.height],
          microSize: [microRect.width, microRect.height],
          microNativeSize: [micro.naturalWidth, micro.naturalHeight],
        });
      }
      fixture.remove();
      return measurements;
    });
    for (const sample of sizes) {
      expect(sample.waitSize).toEqual([64, 64]);
      expect(sample.microSize).toEqual([16, 16]);
      expect(sample.microNativeSize).toEqual([16, 16]);
    }
    expect(sizes[0].hostZoom).toBe(1);
    if (width === 2560) expect(sizes[1].hostZoom).toBeGreaterThan(1);
    else expect(sizes[1].hostZoom).toBe(1);
  });
}
