import { expect, test } from '@playwright/test';
import { seedFirstRunSeen } from './first-run-seed';
import { stubDirectoryPicker } from './vault-picker-stub';

test('the visible analysis entry receives pointer clicks and opens the selected scope without model work',async({page})=>{
  await page.setViewportSize({width:1512,height:900});
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page,{
    'project.md':'---\nkind: project\nslug: project\nuid: 11111111-1111-4111-8111-111111111111\ntitle: Test project\ndomains: [domains/input]\n---\nA bounded test project.\n',
    'domains/input.md':'---\nkind: domain\nslug: domains/input\nuid: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\ntitle: Input\n---\nInput handling.\n',
  });
  await page.goto('/en/topology/?guides=off');
  const entry=page.getByTestId('map-analysis-status-entry');
  await expect(entry).toBeVisible();
  const receivesPointer=await entry.evaluate(element=>{
    const box=element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));
  });
  expect(receivesPointer,'the painted analysis action must receive clicks instead of passing them to the canvas').toBe(true);
  await entry.click();
  await expect(page.getByTestId('vault-switch-rail-tile')).toBeVisible();
  await expect(entry).toContainText('Test project');
  await entry.click();
  await expect(page.getByTestId('gray-area-inspector')).toBeVisible();
  await expect(page.getByTestId('gray-area-web-limit')).toBeVisible();
  await expect(page.getByTestId('acp-chat-panel')).toHaveCount(0);
});
