import { expect, test, type Page } from '@playwright/test';

const widths = [[320,740],[390,844],[600,900],[768,1024],[834,1112],[1024,768],[1440,900],[1920,1080],[2560,1440]];

// The production export deliberately ignores ?shell=desktop. Only shell identity is
// stubbed here; installed-app proof exercises the real host separately.
async function seedEmptyDesktop(page: Page) {
  if (!process.env.PLAYWRIGHT_STATIC) return;
  await page.addInitScript(() => {
    (window as unknown as {isTauri:boolean}).isTauri = true;
    (window as unknown as {__TAURI_INTERNALS__:unknown}).__TAURI_INTERNALS__ = {
      transformCallback: () => 0,
      invoke: async (command: string) => { throw new Error(`No host operation in companion fixture: ${command}`); },
    };
  });
}

test('a personal uncertainty survives reopening; saving and reset preserve keyboard access', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await seedEmptyDesktop(page);
  await page.goto('/en/?shell=desktop&guides=off');
  await page.getByTestId('companion-home').click();
  const journal = page.getByTestId('companion-journal');
  await journal.getByRole('radio',{name:'Still unsure',exact:true}).click();
  await journal.getByRole('textbox').fill('The relation still needs evidence.');
  await journal.getByRole('radio',{name:'Plant',exact:true}).click();
  const editorBefore = await journal.getByRole('textbox').boundingBox();
  await journal.getByRole('button',{name:'Keep memory',exact:true}).click();
  const editorAfter = await journal.getByRole('textbox').boundingBox();
  expect(Math.abs(editorAfter!.y-editorBefore!.y), 'saving must not move the composer').toBeLessThanOrEqual(1);
  await expect(journal.getByRole('textbox')).toBeFocused();
  await expect(journal.getByTestId('companion-memories')).toContainText('Still unsure');
  await expect(journal.locator('[data-keepsake="plant"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('companion-home')).toBeFocused();
  await page.reload();
  await expect(page.getByTestId('companion-home')).toContainText('The relation still needs evidence.');
  await page.getByTestId('companion-home').click();
  await journal.getByRole('button',{name:'Remove memory: The relation still needs evidence.',exact:true}).click();
  await expect(journal.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
  await journal.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(journal.getByRole('button',{name:'Remove memory: The relation still needs evidence.',exact:true})).toBeFocused();
  await expect(journal.getByTestId('companion-memories')).toContainText('The relation still needs evidence.');
  await journal.getByRole('button',{name:'Reset memories',exact:true}).click();
  await expect(journal.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
  await journal.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(journal.getByRole('button',{name:'Reset memories',exact:true})).toBeFocused();
  await expect(journal.getByTestId('companion-memories')).toContainText('The relation still needs evidence.');
  await journal.getByRole('button',{name:'Reset memories',exact:true}).click();
  await journal.getByRole('button',{name:'Clear all memories',exact:true}).click();
  await expect(journal.getByTestId('companion-memories')).toHaveCount(0);
  await expect(journal.getByRole('textbox')).toBeFocused();
});

test('keyboard entry, per-memory cancellation, and deletion remain explicit', async ({page}) => {
  await seedEmptyDesktop(page);
  await page.goto('/en/?shell=desktop&guides=off');
  const home = page.getByTestId('companion-home');
  const journal = page.getByTestId('companion-journal');
  const tabTo = async (target: ReturnType<typeof page.getByRole>) => {
    for(let i=0;i<30;i++) {
      if(await target.evaluate(el=>el===document.activeElement)) return;
      await page.keyboard.press('Tab');
    }
    await expect(target).toBeFocused();
  };
  await tabTo(home);
  await page.keyboard.press('Enter');
  await tabTo(journal.getByRole('textbox'));
  await page.keyboard.insertText('Keyboard-only memory.');
  await tabTo(journal.getByRole('button',{name:'Keep memory',exact:true}));
  await page.keyboard.press('Enter');
  await expect(journal.getByRole('textbox')).toBeFocused();
  await tabTo(journal.getByRole('button',{name:'Remove memory: Keyboard-only memory.',exact:true}));
  await page.keyboard.press('Enter');
  await expect(journal.getByTestId('companion-memories')).toContainText('Keyboard-only memory.');
  await tabTo(journal.getByRole('button',{name:'Remove this memory',exact:true}));
  await page.keyboard.press('Enter');
  await expect(journal.getByTestId('companion-memories')).toHaveCount(0);
  await expect(journal.getByRole('textbox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(home).toBeFocused();
});

test('coarse targets and doubled text preserve access without horizontal overflow', async ({browser}) => {
  const context = await browser.newContext({hasTouch:true,viewport:{width:390,height:844},reducedMotion:'reduce'});
  const page = await context.newPage();
  await seedEmptyDesktop(page);
  await page.goto('/en/?shell=desktop&guides=off');
  await page.getByTestId('companion-home').click();
  const journal=page.getByTestId('companion-journal');
  const targets=await journal.locator('button').evaluateAll(els=>els.map(el=>{
    const r=el.getBoundingClientRect(); const after=getComputedStyle(el,'::after');
    const expanded=after.content !== 'none' && after.position === 'absolute';
    return {label:el.textContent||el.getAttribute('aria-label'),height:Math.max(r.height,expanded ? parseFloat(after.height)||0 : 0),width:Math.max(r.width,expanded ? parseFloat(after.width)||0 : 0)};
  }));
  console.log(JSON.stringify({coarseTargets:targets}));
  for(const target of targets) {expect(target.height).toBeGreaterThanOrEqual(44);expect(target.width).toBeGreaterThanOrEqual(44);}
  await page.addStyleTag({content:'html { font-size: 200% !important; }'});
  await expect(journal).toHaveCSS('opacity','1');
  console.log(JSON.stringify(await journal.evaluate(el=>({overflow:el.scrollWidth-el.clientWidth, wide:Array.from(el.querySelectorAll('*')).filter(child=>child.getBoundingClientRect().right>el.getBoundingClientRect().right).map(child=>({tag:child.tagName,class:child.className,text:child.textContent?.slice(0,30),right:child.getBoundingClientRect().right}))}))));
  expect(await journal.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  await journal.getByRole('textbox').fill('Readable at doubled text.');
  await journal.getByRole('button',{name:'Keep memory',exact:true}).click();
  await expect(journal.getByTestId('companion-memories')).toContainText('Readable at doubled text.');
  await context.close();
});

test('home and a populated journal fit every band in both languages', async ({page}) => {
  await seedEmptyDesktop(page);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(() => {
    localStorage.setItem('ontology-atlas:companion-journal:v1', JSON.stringify({version:1,memories:Array.from({length:5},(_,i)=>({id:String(i),kind:'uncertain',keepsake:'star',note:'Evidence remains uncertain. 아직 확인하지 못한 관계의 이유를 간직합니다.',folder:'Atlas',createdAt:1}))}));
  });
  for (const locale of ['en','ko']) for(const [width,height] of widths) {
    await page.setViewportSize({width,height});
    await page.goto(`/${locale}/?shell=desktop&guides=off`);
    const home = page.getByTestId('companion-home');
    await expect(home).toBeVisible();
    await home.click();
    const journal = page.getByTestId('companion-journal');
    await expect(journal).toBeVisible();
    await expect(journal).toHaveCSS("opacity", "1");
    await page.evaluate(()=>document.fonts.ready);
    const geometry = await journal.evaluate((element)=>{
      const r=element.getBoundingClientRect();
      const controls=Array.from(element.querySelectorAll('button,input,textarea')).filter(el=>!(el as HTMLButtonElement).disabled);
      return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,overflow:element.scrollWidth-element.clientWidth,
        closeReachable: controls.slice(0,1).every(el=> {const b=el.getBoundingClientRect();return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));})};
    });
    expect(geometry.x).toBeGreaterThanOrEqual(0); expect(geometry.y).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(width);expect(geometry.bottom).toBeLessThanOrEqual(height);
    expect(geometry.overflow).toBeLessThanOrEqual(1);expect(geometry.closeReachable).toBe(true);
    console.log(JSON.stringify({locale,width,height,...geometry}));
    if(width===390) {
      await page.addScriptTag({path: require.resolve('axe-core/axe.min.js')});
      const result = await page.evaluate(() => (window as unknown as {axe:{run:(context:string)=>Promise<{violations:unknown[]}>}}).axe.run('[data-testid="companion-journal"]'));
      expect(result.violations).toEqual([]);
    }
    const memories=journal.getByTestId('companion-memories');
    const end=await memories.evaluate(el=> {el.scrollTop=el.scrollHeight;const r=el.getBoundingClientRect();const last=el.lastElementChild!.getBoundingClientRect();return r.bottom-last.bottom;});
    expect(end).toBeGreaterThanOrEqual(-1);
    const reset=journal.getByRole('button',{name:locale==='en'?'Reset memories':'추억 초기화',exact:true});
    await reset.scrollIntoViewIfNeeded();
    const hit=await reset.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
    expect(hit).toBe(true);
    console.log(JSON.stringify({locale,width,lastMemoryClearance:end,resetReachable:hit}));
    await page.keyboard.press('Escape');
  }
});

test('workbench companion is reachable beside work status and yields to its journal',async({page})=>{
  for(const [width,height] of widths){
    await page.setViewportSize({width,height});
    await page.goto('/en/topology/?guides=off&index=collapsed');
    const trigger=page.getByTestId('companion-trigger');
    await expect(trigger).toBeVisible();
    const reachable=await trigger.evaluate(el=> {const b=el.getBoundingClientRect();return {right:b.right,width:innerWidth,hit:el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))};});
    expect(reachable.right).toBeLessThanOrEqual(reachable.width);expect(reachable.hit).toBe(true);
    await trigger.click();
    await expect(page.getByTestId('companion-journal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
});


test('rotation keeps a draft and a failed write never pretends to save it',async({page})=>{
  await seedEmptyDesktop(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/en/?shell=desktop&guides=off');
  await page.getByTestId('companion-home').click();
  const journal=page.getByTestId('companion-journal');
  await journal.getByRole('radio',{name:'Still unsure',exact:true}).click();
  await journal.getByRole('textbox').fill('This question is still open.');
  await page.setViewportSize({width:844,height:390});
  await expect(journal.getByRole('textbox')).toHaveValue('This question is still open.');
  await expect(journal.getByRole('radio',{name:'Still unsure',exact:true})).toBeChecked();
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(key==='ontology-atlas:companion-journal:v1') throw new DOMException('Fixture storage full','QuotaExceededError');
      return original.call(this,key,value);
    };
  });
  await journal.getByRole('button',{name:'Keep memory',exact:true}).click();
  await expect(journal.getByRole('alert')).toHaveText('Could not save. Your draft is still here.');
  await expect(journal.getByRole('textbox')).toHaveValue('This question is still open.');
  await expect(journal.getByTestId('companion-memories')).toHaveCount(0);
});
