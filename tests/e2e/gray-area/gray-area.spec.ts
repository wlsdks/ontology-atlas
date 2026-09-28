import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { waitForAnimationsDone } from '../settle';
import { installGrayAreaHarness as install, openGrayAreaPreview as open, inspectGrayArea as inspect, waitForGrayAreaTop } from './harness';

test.beforeEach(()=>{mkdirSync('/tmp/atlas-gray-area-proof',{recursive:true});});

test('reviews the exact folder before any scan and shows bounded actual source with preserved path focus',async({page})=>{
  await page.setViewportSize({width:1512,height:949});await install(page);await open(page);
  expect(await page.evaluate(()=> (window as unknown as {__gray:{calls:{command:string}[]}}).__gray.calls.filter(c=>c.command==='read_gray_area_evidence').length)).toBe(0);
  await page.getByRole('button',{name:'Inspect this folder',exact:true}).click();
  const panel=page.getByTestId('gray-area-inspector');await expect(page.getByTestId('gray-area-missing-link')).toBeVisible();
  await waitForGrayAreaTop(page);
  await page.screenshot({path:'/tmp/atlas-gray-area-proof/static-inspector-initial-1512.png'});
  await page.setViewportSize({width:390,height:949});
  await waitForGrayAreaTop(page);
  await page.screenshot({path:'/tmp/atlas-gray-area-proof/static-inspector-initial-390.png'});
  await page.setViewportSize({width:1512,height:949});
  await page.getByRole('button',{name:/src\/retry\/index.ts:1/}).first().click();
  await expect(page.getByTestId('gray-area-source-witness')).toContainText('canWrite(request)');
  await expect(page.getByTestId('gray-area-source-witness')).toContainText('SHA256');
  await expect(page.getByRole('region',{name:'Captured source',exact:true})).toBeFocused();
  await expect.poll(()=>page.getByRole('button',{name:'Close source excerpt'}).evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  await page.getByRole('button',{name:'Close source excerpt'}).click();
  await expect(page.getByRole('button',{name:/src\/retry\/index.ts:1/}).first()).toBeFocused();
  await page.getByRole('button',{name:'Compare concepts on map'}).first().click();
  await expect(panel).toBeVisible();await expect(page.getByTestId('gray-area-missing-link')).toBeVisible();
  await waitForAnimationsDone(panel);
  mkdirSync('/tmp/atlas-gray-area-proof',{recursive:true});await page.screenshot({path:'/tmp/atlas-gray-area-proof/static-inspector-1512.png'});
  for(const width of [390,768,1040]){
    await page.setViewportSize({width,height:949});
    await expect.poll(()=>panel.evaluate(e=>{const r=e.getBoundingClientRect();return Math.max(-r.left,r.right-innerWidth,-r.top,r.bottom-innerHeight);})).toBeLessThanOrEqual(1);
    await page.screenshot({path:`/tmp/atlas-gray-area-proof/static-inspector-${width}.png`});
  }
  await page.getByRole('button',{name:'Scope, limits and permissions',exact:true}).click();
  await expect(page.getByRole('list',{name:'Implementation folders inspected'}).getByRole('listitem')).toHaveText(['src/research','src/retry']);
});

test('prepares an editable investigation without sending a provider turn or writing',async({page})=>{
  await install(page);await inspect(page);
  await page.getByRole('button',{name:'Prepare editable draft',exact:true}).first().click();
  const composer=page.getByRole('textbox',{name:'Write what you want done'});await expect(composer).toContainText('grayAreaInvestigation:v1');
  await expect(composer).toContainText('Passes the request to the local write-policy decision.');
  writeFileSync('/tmp/atlas-gray-area-proof/investigation-packet.txt',await composer.innerText());
  const state=await page.evaluate(()=> (window as unknown as {__atlasLibraryWorkHarness:{snapshot:()=>{calls:{method:string}[];writes:unknown[]}}}).__atlasLibraryWorkHarness.snapshot());
  expect(state.calls.filter(c=>c.method==='session/prompt')).toHaveLength(0);expect(state.writes).toHaveLength(0);
});

test('a changed evidence version blocks source opening and copying; session folding is reversible',async({page})=>{
  await install(page);await inspect(page);
  await page.getByRole('button',{name:'Fold for this inspection',exact:true}).first().click();
  await expect(page.getByTestId('gray-area-missing-link')).toHaveCount(0);
  await page.getByRole('button',{name:/Restore 1 folded/}).click();
  await expect(page.getByTestId('gray-area-missing-link')).toBeVisible();
  await page.evaluate(()=>{(window as unknown as {__gray:{current:boolean}}).__gray.current=false;});
  await page.getByRole('button',{name:'Copy investigation',exact:true}).first().click();
  await expect(page.getByTestId('gray-area-inspector')).toContainText('source, meaning or folder binding changed');
  await expect(page.getByRole('button',{name:'Copy investigation',exact:true}).first()).toBeDisabled();
  await expect(page.getByTestId('gray-area-source-witness')).toHaveCount(0);
});
