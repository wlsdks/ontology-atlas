import { expect, test } from "@playwright/test";

import { FREEZE_CSS, auditPage } from "../../scripts/lib/ui-audit-probe.mjs";

const FIXTURE = `<!doctype html><html><head><style>
  :root { --text-body: 14px; --leading-body: 20px; --radius-card: 8px; }
  body { margin: 0; font-size: 14px; line-height: 20px; color: #000; background: #fff; }
  button { font: inherit; border: 0; padding: 0; width: 48px; height: 48px; background: #eee; display: inline-block; vertical-align: top; }
  #tiny { width: 20px; height: 20px; }
  .stage { position: relative; height: 56px; }
  #cover { position: absolute; left: 0; top: 0; width: 60px; height: 56px; background: #ddd; }
  #wide { width: 500px; height: 8px; background: #ccc; }
  #fits { width: 300px; height: 8px; background: #ccc; }
  #offramp { font-size: 13px; margin: 0; }
  #onramp { margin: 0; }
  #faint { margin: 0; color: #999; background: #aaa; }
  .row { display: flex; align-items: flex-start; gap: 4px; }
  .card, .even { width: 40px; background: #f4f4f4; }
  .even { height: 30px; }
  .box { height: 60px; overflow-y: auto; }
  .box > div { height: 200px; background: #fafafa; }
  #roomy { padding-bottom: 16px; }
  .lap, .map { position: relative; }
  #lap-b, #tool { position: absolute; top: 0; }
  #lap-b { left: 30px; }
  #tool { left: 0; }
  .map canvas { display: block; width: 300px; height: 80px; }
</style></head><body>
  <div id="wide"></div>
  <div id="fits"></div>
  <div class="stage"><button id="covered" aria-label="covered"></button><div id="cover"></div></div>
  <div class="stage"><button id="free" aria-label="free"></button><button id="tiny" aria-label="tiny"></button></div>
  <p id="offramp">Off the ramp</p>
  <p id="onramp">On the ramp</p>
  <p id="faint">Faint text</p>
  <div class="row"><div class="card" style="height:30px"></div><div class="card" style="height:50px"></div><div class="card" style="height:30px"></div></div>
  <div class="row"><div class="even"></div><div class="even"></div><div class="even"></div></div>
  <div class="box" id="tight"><div></div></div>
  <div class="box" id="roomy"><div></div></div>
  <div class="lap"><button id="lap-a" aria-label="a"></button><button id="lap-b" aria-label="b"></button></div>
  <div class="map"><canvas tabindex="0" width="300" height="80"></canvas><button id="tool" aria-label="tool"></button></div>
</body></html>`;

const RAMP_NAMES = { text: ["--text-body"], leading: ["--leading-body"], radius: ["--radius-card"], shadow: [] };

test("ui-audit probe finds each planted defect and none of its clean counterparts", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.setContent(FIXTURE);
  await page.addStyleTag({ content: FREEZE_CSS });
  const { findings } = await auditPage(page, { width: 390, rampNames: RAMP_NAMES });
  const selectors = (check: keyof typeof findings) => findings[check].map((f: { selector: string }) => f.selector);

  expect(selectors("overflow")).toEqual(["document", "body > div#wide"]);
  expect(selectors("occluded")).toEqual(["body > div.stage > button#covered"]);
  expect(selectors("overlap")).toEqual(["body > div.lap > button#lap-a"]);
  expect(selectors("target")).toEqual(["body > div.stage > button#tiny"]);
  expect(findings["off-ramp"].map((f: { selector: string; property: string }) => `${f.selector} ${f.property}`)).toEqual([
    "body > p#offramp font-size",
  ]);
  expect(selectors("contrast")).toEqual(["body > p#faint"]);
  expect(findings.regularity).toHaveLength(1);
  expect(findings.regularity[0].heights).toEqual([30, 50, 30]);
  expect(selectors("scroll-end")).toEqual(["body > div#tight.box"]);
});

test("clipped scroll controls use their painted region while real overlays still fail", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 0; }
    button { position: absolute; width: 60px; height: 44px; padding: 0; border: 0; }
    .clip { position: relative; width: 80px; height: 80px; overflow: auto; margin-bottom: 20px; scrollbar-width: none; }
    .clip::-webkit-scrollbar { display: none; }
    .plane { position: relative; width: 200px; height: 200px; }
    #partial-x, #blocked-part { left: 60px; top: 0; }
    #hidden-x { left: 140px; top: 0; }
    #partial-y { left: 0; top: 60px; height: 60px; width: 44px; }
    #hidden-y { left: 0; top: 140px; }
    #outside { left: 100px; top: 0; }
    .overlay-case { position: relative; }
    #sibling-cover { position: absolute; left: 60px; top: 0; width: 20px; height: 44px; background: red; }
    #bottom { position: fixed; bottom: 0; left: 200px; margin: 0; }
    #fixed-covered { left: 0; top: 60px; }
    #fixed-cover { position: fixed; bottom: 0; left: 200px; width: 80px; height: 24px; background: red; }
  </style></head><body>
    <div class="clip" id="clip-x"><div class="plane"><button id="partial-x"></button><button id="hidden-x"></button></div></div>
    <button id="outside"></button>
    <div class="clip" id="clip-y"><div class="plane"><button id="partial-y"></button><button id="hidden-y"></button></div></div>
    <div class="overlay-case"><div class="clip"><div class="plane"><button id="blocked-part"></button></div></div><div id="sibling-cover"></div></div>
    <div class="clip" id="bottom"><div class="plane"><button id="fixed-covered"></button></div></div><div id="fixed-cover"></div>
  </body></html>`);
  const { findings } = await auditPage(page, { width: 390, rampNames: RAMP_NAMES });
  const occluded = findings.occluded.map((item: { selector: string }) => item.selector);
  expect(occluded).toHaveLength(2);
  expect(occluded.some((name: string) => name.includes('#blocked-part'))).toBe(true);
  expect(occluded.some((name: string) => name.includes('#fixed-covered'))).toBe(true);
  expect(JSON.stringify(findings)).not.toMatch(/#hidden-[xy]/);
  expect(findings.overlap).toHaveLength(0);
  expect(findings.target).toHaveLength(0);
  await page.evaluate(() => {
    document.getElementById('clip-x')!.scrollLeft = 30;
    document.getElementById('clip-y')!.scrollTop = 30;
  });
  expect(await page.locator('#clip-x').evaluate(element => element.scrollLeft)).toBe(30);
  expect(await page.locator('#clip-y').evaluate(element => element.scrollTop)).toBe(30);
  const scrolled = await auditPage(page, { width: 390, rampNames: RAMP_NAMES });
  expect(scrolled.findings.occluded).toEqual(findings.occluded);
  expect(scrolled.findings.overlap).toHaveLength(0);
  await page.locator('#partial-x').evaluate(element => { element.style.height = '32px'; });
  const small = await auditPage(page, { width: 390, rampNames: RAMP_NAMES });
  expect(small.findings.target).toHaveLength(1);
  expect(small.findings.target[0]).toMatchObject({ intrinsicSize: '60x32', availableSize: '50x32', clipped: true });
});

test("positioned controls that escape an overflow ancestor remain audited against real covers", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 0; position: relative; }
    button { width: 48px; height: 48px; padding: 0; border: 0; }
    .clip { width: 40px; height: 40px; overflow: hidden; }
    .absolute { position: absolute; top: 20px; }
    .fixed { position: fixed; top: 100px; }
    .free { left: 100px; } .covered { left: 200px; }
    .descendant { position: absolute; top: 200px; }
    .cover { position: absolute; left: 200px; width: 48px; height: 48px; background: red; z-index: 2; }
    #fixed-cover { position: fixed; top: 100px; }
    #bounded { position: absolute; top: 300px; transform: translateX(0); }
    #bounded-fixed { position: fixed; left: 100px; top: 0; }
  </style></head><body>
    <div class="clip">
      <button id="free-absolute" class="absolute free"></button><button id="covered-absolute" class="absolute covered"></button>
      <button id="free-fixed" class="fixed free"></button><button id="covered-fixed" class="fixed covered"></button>
      <div class="descendant free"><button id="free-descendant"></button></div>
      <div class="descendant covered"><button id="covered-descendant"></button></div>
    </div>
    <div class="cover" style="top:20px"></div><div class="cover" id="fixed-cover"></div><div class="cover" style="top:200px"></div>
    <div class="clip" id="bounded"><button id="bounded-fixed"></button></div>
  </body></html>`);
  const { findings } = await auditPage(page, { width: 390, rampNames: RAMP_NAMES });
  expect(findings.occluded).toHaveLength(3);
  for (const id of ['covered-absolute', 'covered-fixed', 'covered-descendant']) {
    expect(findings.occluded.some((item: { selector: string }) => item.selector.includes(`#${id}`))).toBe(true);
  }
  expect(JSON.stringify(findings)).not.toMatch(/#free-|#bounded-fixed/);
});
