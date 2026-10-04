import { expect, test } from '@playwright/test';
import { installLibraryWorkHarness } from './library-work-harness';
import { waitForAnimationsDone } from './settle';

const axePath = require.resolve('axe-core/axe.min.js');
test('opens a source disclosure before transfer and keeps its controls reachable', async ({ page }, testInfo) => {
  await installLibraryWorkHarness(page, { localResponses: [] });
  await page.addInitScript(() => {
    const w = window as unknown as { __TAURI_INTERNALS__?: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> } };
    let internals = w.__TAURI_INTERNALS__;
    const wrap = (value: NonNullable<typeof internals>) => {
      const original = value.invoke;
      value.invoke = (command, args) => {
        if (command === 'pick_source_directory') return Promise.resolve('/fixture/read-only-code');
        if (command === 'preview_local_construction_source') return Promise.resolve({ sourcePath: '/fixture/read-only-code', destinationPath: args?.destinationPath, fingerprint: 'sha256:fixture', files: [{path:'input.ts',bytes:20}], limited:false, excluded:['.git','private.env'] });
        return original(command, args);
      };
      return value;
    };
    if (internals) internals = wrap(internals);
    Object.defineProperty(w, '__TAURI_INTERNALS__', { configurable:true, get:()=>internals, set:value=>{internals=wrap(value);} });
  });
  await page.goto('/en/docs/');
  await page.getByRole('button', {name:/^Open my folder/}).first().click();
  await page.getByTestId('topology-vault-agent-toggle').click();
  await page.getByTestId('construction-action').click();
  const preview = page.getByTestId('construction-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('/fixture/read-only-code');
  await expect(preview).toContainText('fixture-local');
  await expect(page.getByTestId('construction-run')).toBeEnabled();
  await waitForAnimationsDone(preview);
  for (const width of [1512,390]) {
    await page.setViewportSize({width,height:949});
    await expect.poll(()=>preview.evaluate(element=>{const r=element.getBoundingClientRect();return Math.max(-r.left,r.right-innerWidth);})).toBeLessThanOrEqual(1);
    await page.getByTestId('construction-run').scrollIntoViewIfNeeded();
    await expect.poll(()=>page.getByTestId('construction-run').evaluate(element=>{const r=element.getBoundingClientRect();return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`source-preview-${width}.png`)});
  }
  await page.addScriptTag({path:axePath});
  const results = await page.evaluate(async()=> (window as unknown as {axe:{run:(selector:string,options:unknown)=>Promise<{passes:unknown[];violations:unknown[]}>}}).axe.run('body',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
  expect(results.passes.length).toBeGreaterThanOrEqual(15);
  expect(results.violations).toEqual([]);
  const snapshot = await page.evaluate(()=> (window as unknown as {__atlasLibraryWorkHarness:{snapshot:()=>{calls:{command?:string;method?:string}[];writes:unknown[]}}}).__atlasLibraryWorkHarness.snapshot());
  expect(snapshot.writes).toHaveLength(0);
  expect(snapshot.calls.filter(call=>call.command==='llm_chat'||call.method==='session/prompt')).toHaveLength(0);
});
