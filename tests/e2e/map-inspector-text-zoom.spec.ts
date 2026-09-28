import { expect, test } from "@playwright/test";
import { installGrayAreaHarness } from "./gray-area/harness";
import { waitForBoxStill } from "./settle";

test.use({launchOptions:{args:['--blink-settings=defaultFontSize=32,defaultFixedFontSize=26']}});
test('200 percent text keeps full-detail pointer entry above the visible navigation', async ({page}) => {
  await page.setViewportSize({width:1024,height:900});
  await page.emulateMedia({reducedMotion:'reduce'});
  await installGrayAreaHarness(page);
  await page.goto('/ko/topology/?guides=off&p=elements/retry-dispatch');
  const entry=page.getByTestId('map-detail-panel-open-full-detail');
  await expect(entry).toBeVisible();
  await entry.scrollIntoViewIfNeeded();
  await waitForBoxStill(entry);
  expect(await entry.evaluate(el=>{
    const r=el.getBoundingClientRect();
    const target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return target===el||el.contains(target);
  })).toBe(true);
  await entry.click();
  await expect(page.getByTestId('full-detail-a1')).toBeVisible();
});
