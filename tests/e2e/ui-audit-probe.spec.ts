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
  expect(findings.overlap).toEqual([]);
  expect(selectors("target")).toEqual(["body > div.stage > button#tiny"]);
  expect(findings["off-ramp"].map((f: { selector: string; property: string }) => `${f.selector} ${f.property}`)).toEqual([
    "body > p#offramp font-size",
  ]);
  expect(selectors("contrast")).toEqual(["body > p#faint"]);
  expect(findings.regularity).toHaveLength(1);
  expect(findings.regularity[0].heights).toEqual([30, 50, 30]);
  expect(selectors("scroll-end")).toEqual(["body > div#tight.box"]);
});
