import {expect,test,type Page} from '@playwright/test';
async function start(page:Page){
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>{(window as unknown as {isTauri:boolean}).isTauri=true;(window as unknown as {__TAURI_INTERNALS__:unknown}).__TAURI_INTERNALS__={transformCallback:()=>0,invoke:async()=>{throw Error('No host operations in personal journal fixture');}};});
 await page.goto('/en/?shell=desktop&guides=off');
}
async function notes(page:Page){await page.getByTestId('companion-home').click();const dialog=page.getByTestId('companion-journal');await expect(dialog.getByTestId('companion-world')).toBeVisible();await page.keyboard.press('j');await dialog.getByRole('radio',{name:'Shared memories',exact:true}).click();return dialog;}

test('personal memories retain their old storage, keepsakes, cancellation, and explicit reset',async({page})=>{
 await start(page);let dialog=await notes(page);
 await dialog.getByRole('radio',{name:'Still unsure',exact:true}).click();await dialog.getByRole('textbox').fill('The relation still needs evidence.');await dialog.getByRole('radio',{name:'Plant',exact:true}).click();
 const before=await dialog.getByRole('textbox').boundingBox();await dialog.getByRole('button',{name:'Keep memory',exact:true}).click();const after=await dialog.getByRole('textbox').boundingBox();expect(Math.abs(after!.y-before!.y)).toBeLessThanOrEqual(1);await expect(dialog.getByRole('textbox')).toBeFocused();
 await dialog.getByRole('radio',{name:'Saved 1',exact:true}).click();await expect(dialog.getByTestId('companion-memories')).toContainText('The relation still needs evidence.');await expect(dialog.locator('[data-keepsake="plant"]')).toHaveCount(1);
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');await expect(page.getByTestId('companion-home')).toBeFocused();await page.reload();dialog=await notes(page);await expect(dialog.getByTestId('companion-memories')).toContainText('The relation still needs evidence.');
 const remove=dialog.getByRole('button',{name:'Remove memory: The relation still needs evidence.',exact:true});await remove.click();await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(remove).toBeFocused();
 await dialog.getByRole('button',{name:'Reset memories',exact:true}).click();await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog.getByRole('button',{name:'Reset memories',exact:true})).toBeFocused();
 await dialog.getByRole('button',{name:'Reset memories',exact:true}).click();await dialog.getByRole('button',{name:'Clear all memories',exact:true}).click();await expect(dialog.getByTestId('companion-memories')).toHaveCount(0);
});

test('keyboard entry, writing, paging and removal preserve visible focus',async({page})=>{
 await start(page);const trigger=page.getByTestId('companion-home');await trigger.focus();await page.keyboard.press('Enter');const dialog=page.getByTestId('companion-journal');await expect(dialog.getByTestId('companion-world')).toBeVisible();
 const tabTo=async(target:ReturnType<typeof page.getByRole>)=>{for(let i=0;i<40;i++){if(await target.evaluate(el=>el===document.activeElement))return;await page.keyboard.press('Tab');}await expect(target).toBeFocused();};
 await page.keyboard.press('j');await tabTo(dialog.getByRole('radio',{name:'Project',exact:true}));await page.keyboard.press('ArrowLeft');await expect(dialog.getByRole('radio',{name:'Shared memories',exact:true})).toBeChecked();
 await tabTo(dialog.getByRole('textbox'));await page.keyboard.insertText('Keyboard-only memory.');await tabTo(dialog.getByRole('button',{name:'Keep memory',exact:true}));await page.keyboard.press('Enter');await expect(dialog.getByRole('textbox')).toBeFocused();
 await tabTo(dialog.getByRole('radio',{name:'Write',exact:true}));await page.keyboard.press('ArrowRight');await tabTo(dialog.getByRole('button',{name:'Remove memory: Keyboard-only memory.',exact:true}));await page.keyboard.press('Enter');
 await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();await page.keyboard.press('Tab');await page.keyboard.press('Enter');await expect(dialog.getByTestId('companion-memories')).toHaveCount(0);await expect(dialog.getByRole('button',{name:'Write',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
});

test('rotation and failed storage preserve the draft, with no outer scrolling',async({page})=>{
 await page.setViewportSize({width:390,height:844});await start(page);const dialog=await notes(page);await dialog.getByRole('radio',{name:'Still unsure',exact:true}).click();await dialog.getByRole('textbox').fill('A question to keep.');
 await page.setViewportSize({width:844,height:390});await expect(dialog.getByRole('textbox')).toHaveValue('A question to keep.');expect(await dialog.getByTestId('companion-content').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
 await page.setViewportSize({width:390,height:844});await expect(dialog.getByRole('radio',{name:'Still unsure',exact:true})).toBeChecked();
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='ontology-atlas:companion-journal:v1')throw new DOMException('full','QuotaExceededError');return original.call(this,key,value);};});
 await dialog.getByRole('button',{name:'Keep memory',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();await expect(dialog.getByRole('textbox')).toHaveValue('A question to keep.');
});

test('a populated journal pages all long content on coarse screens without hiding a control',async({browser})=>{
 const context=await browser.newContext({hasTouch:true,viewport:{width:390,height:844},reducedMotion:'reduce'});const page=await context.newPage();await page.addInitScript(()=>localStorage.setItem('ontology-atlas:companion-journal:v1',JSON.stringify({version:1,memories:Array.from({length:5},(_,i)=>({id:String(i),kind:'uncertain',keepsake:'star',note:'A long reflection. '.repeat(12),folder:'Atlas',createdAt:1}))})));await start(page);const dialog=await notes(page);
 for(const [width,height] of [[320,740],[390,844],[844,390],[1920,1080]]){
  await page.setViewportSize({width,height});await expect.poll(()=>dialog.evaluate(el=>{const r=el.getBoundingClientRect();return Math.max(Math.abs(r.x+r.width/2-innerWidth/2),Math.abs(r.y+r.height/2-innerHeight/2));})).toBeLessThanOrEqual(1);await expect(dialog.getByTestId('companion-memory-panel')).toHaveAttribute('data-compact',String(height<=650));const screen=dialog.getByTestId('companion-content');console.log('TOUCH_PAGE',JSON.stringify(await screen.evaluate(el=>{const r=el.getBoundingClientRect();return {width:innerWidth,height:innerHeight,w:el.clientWidth,h:el.clientHeight,sw:el.scrollWidth,sh:el.scrollHeight,wide:Array.from(el.querySelectorAll('*')).filter(item=>item.getBoundingClientRect().right>r.right+1).map(item=>({tag:item.tagName,text:item.textContent?.slice(0,40),right:item.getBoundingClientRect().right-r.right}))};})));expect(await screen.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);expect(await screen.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  const targets=await dialog.locator('button:visible:enabled').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect(),a=getComputedStyle(el,'::after');const expanded=a.content!=='none'&&a.position==='absolute';return{height:Math.max(r.height,expanded?parseFloat(a.height)||0:0),width:Math.max(r.width,expanded?parseFloat(a.width)||0:0)};}));for(const target of targets){expect(target.height).toBeGreaterThanOrEqual(44);expect(target.width).toBeGreaterThanOrEqual(44);}
 }
 await context.close();
});
