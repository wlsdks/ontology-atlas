import {expect,test,type Page} from '@playwright/test';
import {installDesktopRailRuntime} from './desktop-rail-arrival-harness';
const widths=[[320,740],[390,844],[600,900],[768,1024],[834,1112],[1024,768],[1440,900],[1512,900],[1920,1080],[2560,1440],[844,390]];
async function openProject(page:Page,locale='en',reduced=true){
 await installDesktopRailRuntime(page);await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
 await page.goto(`/${locale}/?guides=off&e2e=1`);await page.getByTestId('first-run-open').click();await expect(page.getByTestId('companion-trigger')).toBeVisible();
}
async function home(page:Page){await page.getByTestId('companion-trigger').click();const dialog=page.getByTestId('companion-journal');await expect(dialog.getByTestId('companion-world')).toBeVisible();const receipt=dialog.getByRole('button',{name:/Continue the adventure|모험 이어가기/});if(await receipt.isVisible())await receipt.click();return dialog;}
async function study(page:Page,locale='en'){const dialog=page.getByTestId('companion-journal');await expect(dialog.getByTestId('companion-overlay')).toBeHidden();await expect(dialog.getByTestId('companion-world')).toBeFocused();await page.keyboard.press('i');await dialog.getByRole('button',{name:locale==='en'?/^Knowledge cards/:/^지식 카드/}).click();await dialog.getByRole('button',{name:locale==='en'?'Read knowledge cards':'지식 카드 읽기',exact:true}).click();}
async function xp(page:Page){return Number((await page.getByTestId('companion-xp').innerText()).split(' ')[0]);}

test('project records grant starting power; reading, reflection and editing preserve exact rewards',async({page})=>{
 await openProject(page);let dialog=await home(page);const baseline=await xp(page);expect(baseline).toBeGreaterThan(100);await expect(dialog.getByTestId('companion-growth-sigil')).toContainText('19');
 await page.keyboard.press('j');await expect(dialog.getByTestId('companion-project-book')).toContainText('Ontology concepts');await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
 await study(page);await expect(dialog.getByTestId('companion-concept-preview')).toBeVisible();expect(await xp(page)).toBe(baseline+5);
 await dialog.getByRole('radio',{name:'Reflect',exact:true}).click();await dialog.getByRole('textbox').fill('Who owns cancellation after shipping?');
 await dialog.getByRole('button',{name:'Keep discovery',exact:true}).click();expect(await xp(page)).toBe(baseline+20);
 await dialog.getByRole('textbox').fill('Returns take over after shipping.');await dialog.getByRole('button',{name:'Update discovery',exact:true}).click();expect(await xp(page)).toBe(baseline+20);
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');dialog=await home(page);expect(await xp(page)).toBe(baseline+20);
 await page.keyboard.press('j');await dialog.getByRole('radio',{name:'Reading log',exact:true}).click();await dialog.getByRole('radio',{name:'History',exact:true}).click();await expect(dialog.getByTestId('companion-growth-history')).toContainText('Returns take over');
 await dialog.getByRole('button',{name:'See details on the map',exact:true}).click();await expect(dialog).toBeHidden();await expect(page).toHaveURL(/mode=focus/);
});

test('world hotkeys, skill allocation, inventory, combat and away rewards form a playable loop',async({page})=>{
 await openProject(page);let dialog=await home(page);await page.keyboard.press('k');await dialog.getByRole('button',{name:'Learn · 1 point',exact:true}).click();await expect(dialog.getByRole('button',{name:'Focused blade 1/5',exact:true})).toBeVisible();
 await page.keyboard.press('i');await expect(dialog.getByRole('region',{name:'Traveler’s inventory',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(dialog.getByTestId('companion-overlay')).toBeHidden();await expect(dialog.getByTestId('companion-world')).toBeFocused();
 const player=dialog.getByTestId('companion-player');const before=await player.boundingBox();await page.keyboard.down('d');await expect.poll(async()=>(await player.boundingBox())!.x).toBeGreaterThan(before!.x+15);await page.keyboard.up('d');
 await page.keyboard.press('m');await dialog.getByRole('button',{name:'Depart',exact:true}).click();await expect(dialog.getByTestId('companion-world')).toHaveAttribute('data-mode','expedition');
 await page.keyboard.press('q');await expect.poll(async()=>Number(await dialog.getByTestId('companion-growth').getAttribute('data-wins'))).toBeGreaterThan(0);
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
 await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('ontology-atlas:companion-game:v1:'))!;const value=JSON.parse(localStorage.getItem(key)!);value.lastAt-=120000;localStorage.setItem(key,JSON.stringify(value));});
 await page.getByTestId('companion-trigger').click();dialog=page.getByTestId('companion-journal');await expect(dialog.getByText(/While away: \d+ victories/)).toBeVisible();await dialog.getByRole('button',{name:'Continue the adventure',exact:true}).click();
 await page.keyboard.press('m');await dialog.getByRole('button',{name:'Return to camp',exact:true}).click();await expect(dialog.getByTestId('companion-world')).toHaveAttribute('data-mode','camp');
 await page.keyboard.press('i');const gold=Number(await dialog.getByTestId('companion-growth').getAttribute('data-gold'));await dialog.getByRole('button',{name:'Upgrade · 20 G',exact:true}).click();await expect(dialog.getByTestId('companion-growth')).toHaveAttribute('data-gold',String(gold-20));await expect(dialog.getByRole('heading',{name:'Starlight blade +1',exact:true})).toBeVisible();
});

test('typing never triggers game hotkeys and failures retain discovery drafts',async({page})=>{
 await openProject(page);let dialog=await home(page);await study(page);await dialog.getByRole('radio',{name:'Reflect',exact:true}).click();const baseline=await xp(page);const field=dialog.getByRole('textbox');await field.pressSequentially('i k m j e wasd');await expect(field).toHaveValue('i k m j e wasd');await expect(dialog.getByRole('region',{name:'The study desk',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');dialog=await home(page);await study(page);await dialog.getByRole('radio',{name:'Reflect',exact:true}).click();await expect(field).toHaveValue('i k m j e wasd');
 await page.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('ontology-atlas:companion-growth:'))throw Error('full');return set.call(this,key,value);};});await dialog.getByRole('button',{name:'Keep discovery',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();await expect(field).toHaveValue('i k m j e wasd');expect(await xp(page)).toBe(baseline);
});

for(const locale of ['en','ko'])test(`every in-world panel fits without scrolling or clipped controls across viewport bands (${locale})`,async({page})=>{
  await openProject(page,locale);const dialog=await home(page);
  for(const [width,height] of widths){await page.setViewportSize({width,height});
   for(const key of ['i','k','m','n','j','e','?']){
    if(key==='e')await study(page,locale);else await page.keyboard.press(key==='?'?'Shift+Slash':key);const panel=dialog.getByTestId('companion-content');await expect(panel).toBeVisible();await expect(dialog.getByTestId('companion-overlay')).toHaveAttribute('data-surface-state','entered');
    const geometry=await panel.evaluate(el=>{const b=el.getBoundingClientRect();return {overflowX:el.scrollWidth-el.clientWidth,overflowY:el.scrollHeight-el.clientHeight,outside:Array.from(el.querySelectorAll('button,input,textarea')).filter(item=>{const q=item.getBoundingClientRect();return q.width>0&&q.height>0&&(q.top<b.top-1||q.bottom>b.bottom+1||q.left<b.left-1||q.right>b.right+1);}).map(item=>item.getAttribute('aria-label')||item.textContent)};});
    console.log('WORLD_PANEL',JSON.stringify({locale,width,height,key,...geometry}));expect(geometry.overflowX).toBeLessThanOrEqual(1);expect(geometry.overflowY).toBeLessThanOrEqual(1);expect(geometry.outside).toEqual([]);await page.keyboard.press('Escape');await expect(dialog.getByTestId('companion-overlay')).toBeHidden();
   }
  }await page.keyboard.press('Escape');
});

test('every open companion panel has a nonempty clean accessibility scan',async({page})=>{
 await openProject(page);const dialog=await home(page);await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 for(const key of ['i','k','m','n','j','e','Shift+Slash','b']){
  if(key==='b'){await page.keyboard.press('m');await dialog.getByRole('button',{name:'Depart',exact:true}).click();}if(key==='e')await study(page);else await page.keyboard.press(key);await expect(dialog.getByTestId('companion-content')).toBeVisible();
  await expect.poll(()=>dialog.getByTestId('companion-overlay').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations!==Infinity&&a.playState==='running').length)).toBe(0);
  const result=await page.evaluate(async()=>{const run=await (window as unknown as {axe:{run:(context:Element,options:unknown)=>Promise<{passes:unknown[];violations:Array<{id:string;nodes:unknown[]}>}>}}).axe.run(document.querySelector('[data-testid="companion-journal"]')!,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});return {passes:run.passes.length,violations:run.violations};});
  console.log('GAME_AXE',key,result.passes,JSON.stringify(result.violations));expect(result.passes).toBeGreaterThan(0);expect(result.violations).toEqual([]);await page.keyboard.press('Escape');
 }
});

test('a roguelike expedition offers a persistent choice, a dodge, and independent auto retry',async({page})=>{
 await openProject(page);const dialog=await home(page);await page.keyboard.press('m');await dialog.getByRole('button',{name:'Auto retry on',exact:true}).click();await expect(dialog.getByRole('button',{name:'Auto retry off',exact:true})).toHaveAttribute('aria-pressed','false');await dialog.getByRole('button',{name:'Depart',exact:true}).click();
 await page.keyboard.press('b');const choices=dialog.getByTestId('companion-content').getByRole('button',{name:/^Choose /});await expect(choices).toHaveCount(3);await choices.first().click();await expect(dialog.getByTestId('companion-overlay')).toBeHidden();
 const state=()=>page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('ontology-atlas:companion-game:v1:'))!;return JSON.parse(localStorage.getItem(key)!);});expect((await state()).run.drafted).toBe(1);
 await page.keyboard.press('b');await expect(dialog.getByText(/Blessings chosen 1\/5/)).toBeVisible();await page.keyboard.press('Escape');await page.keyboard.press('m');await dialog.getByRole('button',{name:'Return to camp',exact:true}).click();await page.keyboard.press('m');await dialog.getByRole('button',{name:'Depart',exact:true}).click();expect((await state()).run.drafted).toBe(0);expect((await state()).run.repeat).toBe(false);
 await page.keyboard.press('Space');await expect(dialog.getByRole('button',{name:'Dodge attack (Space)',exact:true})).toBeDisabled();
});

test('battle framing and blessing choices fit narrow and short game screens',async({page})=>{
 await openProject(page);const dialog=await home(page);await page.keyboard.press('m');await dialog.getByRole('button',{name:'Depart',exact:true}).click();
 for(const [width,height] of [[390,844],[320,740],[844,390],[1512,900]]){
  await page.setViewportSize({width,height});await expect.poll(async()=>{const world=await dialog.getByTestId('companion-world').boundingBox();const enemy=await dialog.getByTestId('companion-enemy').boundingBox();return Math.max(world!.x-enemy!.x,enemy!.x+enemy!.width-world!.x-world!.width);}).toBeLessThanOrEqual(1);await page.keyboard.press('b');const content=dialog.getByTestId('companion-content');await expect(content).toBeVisible();await expect(dialog.getByTestId('companion-content').getByRole('button',{name:/^Choose /})).toHaveCount(3);
  const overflow=await content.evaluate(el=>[el.scrollWidth-el.clientWidth,el.scrollHeight-el.clientHeight]);console.log('BLESSING_FIT',width,height,overflow);expect(overflow.every(value=>value<=1)).toBe(true);await page.keyboard.press('Escape');await expect(dialog.getByTestId('companion-overlay')).toBeHidden();
 }
});

test('combat cues expose the dodge window, stop behind panels, and respect reduced motion',async({page})=>{
 await openProject(page,'en',false);const dialog=await home(page);await page.keyboard.press('m');await dialog.getByRole('button',{name:'Depart',exact:true}).click();
 const world=dialog.getByTestId('companion-world');await expect(world.getByTestId('companion-battle-stage')).toHaveCSS('background-image',/companion-battle-stage\.webp/);
 await page.clock.pauseAt(new Date());
 await page.evaluate(()=>{const key=Object.keys(localStorage).find(value=>value.startsWith('ontology-atlas:companion-game:v1:'))!;const game=JSON.parse(localStorage.getItem(key)!);game.phase='attack';game.attackId++;game.guard=0;game.dodgeCooldown=0;game.run.lastOutcome='defeat';game.lastAt=Date.now();localStorage.setItem(key,JSON.stringify(game));window.dispatchEvent(new StorageEvent('storage'));});
 await expect(world.getByTestId('companion-dodge-telegraph')).toBeVisible();await expect(world.getByTestId('companion-attack-bolt')).toHaveCount(1);
 await expect(dialog.getByTestId('companion-run-outcome')).toHaveCount(0);
 await page.keyboard.press('m');await expect(world).toHaveAttribute('data-playing','false');await page.keyboard.press('Escape');await expect(world).toHaveAttribute('data-playing','true');
 await page.emulateMedia({reducedMotion:'reduce'});await expect(world.getByTestId('companion-attack-bolt')).toHaveCount(0);await expect(world.getByTestId('companion-dodge-telegraph')).toHaveCSS('animation-name','none');
 await page.keyboard.press('Space');await expect(world.getByTestId('companion-dodge-telegraph')).toHaveCount(0);
});

test('opening an expedition panel holds the saved battle until it closes',async({page})=>{
 await page.clock.install({time:new Date('2026-09-26T00:00:00Z')});
 await openProject(page);const dialog=await home(page);
 await page.keyboard.press('m');await dialog.getByRole('button',{name:'Depart',exact:true}).click();
 const state=()=>page.evaluate(()=>{const key=Object.keys(localStorage).find(value=>value.startsWith('ontology-atlas:companion-game:v1:'))!;return JSON.parse(localStorage.getItem(key)!);});
 await page.keyboard.press('i');await expect(dialog.getByText('Battle paused')).toBeVisible();
 const frozen=await state();await page.clock.runFor(10000);
 expect(await state()).toMatchObject({turn:frozen.turn,hp:frozen.hp,enemyHp:frozen.enemyHp,gold:frozen.gold});
 await page.keyboard.press('Escape');await expect(dialog.getByTestId('companion-overlay')).toBeHidden();
 expect((await state()).turn).toBe(frozen.turn);
 // Surface exit can finish partway through the next scheduled tick. The hook
 // test covers the exact fractional turn; this rendered path proves resumption.
 await page.clock.runFor(3000);const resumed=await state();
 expect(resumed.turn).toBeGreaterThan(frozen.turn);
 expect(resumed.turn).toBeLessThanOrEqual(frozen.turn+3);
});

test('clicking a creature spends one ready wave and shows its remaining cooldown',async({page})=>{
 await openProject(page,'en',false);const dialog=await home(page);await page.keyboard.press('m');await dialog.getByRole('button',{name:'Depart',exact:true}).click();
 await page.clock.pauseAt(new Date());
 await page.evaluate(()=>{const key=Object.keys(localStorage).find(value=>value.startsWith('ontology-atlas:companion-game:v1:'))!;const game=JSON.parse(localStorage.getItem(key)!);game.phase='approach';game.cooldown=0;game.difficulty=10;game.enemyHp=60;game.lastAt=Date.now();localStorage.setItem(key,JSON.stringify(game));window.dispatchEvent(new StorageEvent('storage'));});
 const enemy=dialog.getByTestId('companion-enemy');await expect(enemy).toHaveAttribute('data-targetable','true');
 const before=await page.evaluate(()=>{const key=Object.keys(localStorage).find(value=>value.startsWith('ontology-atlas:companion-game:v1:'))!;return JSON.parse(localStorage.getItem(key)!).attackId;});
 await enemy.click();await expect.poll(()=>page.evaluate(()=>{const key=Object.keys(localStorage).find(value=>value.startsWith('ontology-atlas:companion-game:v1:'))!;return JSON.parse(localStorage.getItem(key)!).attackId;})).toBe(before+1);
 const count=dialog.getByTestId('companion-wave-cooldown');await expect(count).toBeVisible();const first=await count.innerText();expect(Number(first)).toBeGreaterThan(0);
 await expect(enemy).toHaveAttribute('data-targetable','false');
 await enemy.click();await expect.poll(()=>page.evaluate(()=>{const key=Object.keys(localStorage).find(value=>value.startsWith('ontology-atlas:companion-game:v1:'))!;return JSON.parse(localStorage.getItem(key)!).attackId;})).toBe(before+1);
});

test('a failed game save removes the ready pointer attack affordance',async({page})=>{
 await openProject(page,'en',false);const dialog=await home(page);await page.keyboard.press('m');await dialog.getByRole('button',{name:'Depart',exact:true}).click();await page.clock.pauseAt(new Date());
 const enemy=dialog.getByTestId('companion-enemy');await expect(enemy).toHaveAttribute('data-targetable','true');
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('ontology-atlas:companion-game:v1:'))throw Error('full');return original.call(this,key,value);};});
 await enemy.click();await expect(dialog.getByRole('alert')).toBeVisible();await expect(enemy).toHaveAttribute('data-targetable','false');
 await expect(dialog.getByRole('button',{name:'Knowledge wave ×3',exact:true})).toBeDisabled();
});

test('Space visibly moves the fox as soon as the dodge is armed',async({page})=>{
 await openProject(page,'en',false);const dialog=await home(page);await page.keyboard.press('m');await dialog.getByRole('button',{name:'Depart',exact:true}).click();await page.clock.pauseAt(new Date());
 await page.evaluate(()=>{const key=Object.keys(localStorage).find(value=>value.startsWith('ontology-atlas:companion-game:v1:'))!;const game=JSON.parse(localStorage.getItem(key)!);game.phase='attack';game.guard=0;game.dodgeCooldown=0;game.attackId++;game.lastAt=Date.now();localStorage.setItem(key,JSON.stringify(game));window.dispatchEvent(new StorageEvent('storage'));});
 const world=dialog.getByTestId('companion-world');await expect(world.getByTestId('companion-dodge-telegraph')).toBeVisible();await world.focus();await page.keyboard.press('Space');
 await expect(world.getByTestId('companion-dodge-telegraph')).toHaveCount(0);
 await expect.poll(()=>dialog.getByTestId('companion-player').evaluate(element=>getComputedStyle(element).animationName)).toMatch(/heroEvade$/);
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{const key=Object.keys(localStorage).find(value=>value.startsWith('ontology-atlas:companion-game:v1:'))!;const game=JSON.parse(localStorage.getItem(key)!);game.guard=0;game.dodgeCooldown=0;game.lastAt=Date.now();localStorage.setItem(key,JSON.stringify(game));window.dispatchEvent(new StorageEvent('storage'));});
 await expect(world.getByTestId('companion-dodge-telegraph')).toBeVisible();await world.focus();await page.keyboard.press('Space');
 await expect(world.getByTestId('companion-dodge-telegraph')).toHaveCount(0);await expect.poll(()=>dialog.getByTestId('companion-player').evaluate(element=>getComputedStyle(element).animationName)).toBe('none');
});

test('the game panels retain their controls with doubled text at a desktop viewport',async({page})=>{
 await page.setViewportSize({width:1512,height:900});await openProject(page);const dialog=await home(page);await page.evaluate(()=>document.documentElement.style.fontSize='200%');
 for(const key of ['i','k','m','n','j','e','Shift+Slash','b']){if(key==='b'){await page.keyboard.press('m');await dialog.getByRole('button',{name:'Depart',exact:true}).click();}if(key==='e')await study(page);else await page.keyboard.press(key);const content=dialog.getByTestId('companion-content');await expect(content).toBeVisible();const sizes=await content.evaluate(el=>({x:el.scrollWidth-el.clientWidth,y:el.scrollHeight-el.clientHeight}));console.log('DOUBLE_TEXT',key,sizes);expect(sizes.x).toBeLessThanOrEqual(1);expect(sizes.y).toBeLessThanOrEqual(1);await page.keyboard.press('Escape');}
});

test('panel focus, reset cancellation and native Space activation remain inside the current task',async({page})=>{
 await openProject(page);const dialog=await home(page);const panel=dialog.getByTestId('companion-overlay');
 for(let i=0;i<2;i++){await page.keyboard.press('i');await expect(panel).toBeFocused();await page.keyboard.press('Escape');await expect(panel).toBeHidden();await expect(dialog.getByTestId('companion-world')).toBeFocused();}
 await page.keyboard.press('Shift+Slash');const reset=dialog.getByRole('button',{name:'Reset growth for this project',exact:true});await reset.click();await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(reset).toBeFocused();await page.keyboard.press('Escape');
 await page.keyboard.press('m');await dialog.getByRole('button',{name:'Depart',exact:true}).click();await dialog.getByRole('button',{name:'Traveler’s inventory (I)',exact:true}).focus();await page.keyboard.press('Space');await expect(panel).toHaveAttribute('aria-label','Traveler’s inventory');await expect(panel).toBeFocused();
});

test('completed and defeated expeditions show distinct persistent outcomes',async({page})=>{
 await openProject(page);const dialog=await home(page);
 for(const outcome of ['clear','defeat']){await page.evaluate(outcome=>{const key=Object.keys(localStorage).find(key=>key.startsWith('ontology-atlas:companion-game:v1:'))!;const game=JSON.parse(localStorage.getItem(key)!);game.run.lastOutcome=outcome;localStorage.setItem(key,JSON.stringify(game));window.dispatchEvent(new StorageEvent('storage'));},outcome);await expect(dialog.getByTestId('companion-run-outcome')).toHaveAttribute('data-outcome',outcome);await expect(dialog.getByTestId('companion-run-outcome')).toBeVisible();}
});

test('coarse game controls have nonoverlapping 44px hit areas at centres and edges',async({browser})=>{
 const context=await browser.newContext({hasTouch:true,viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();await openProject(page);const dialog=await home(page);
 // The dev-only Next badge occupies the bottom-right hit area at 320px. It is
 // absent from static export; measure the game controls without that test overlay.
 await page.evaluate(()=>document.querySelector('nextjs-portal')?.remove());
 expect(await page.evaluate(()=>matchMedia('(any-pointer: coarse)').matches)).toBe(true);
 for(const [width,height] of [[320,740],[390,844],[844,390],[1440,900]]){
  await page.setViewportSize({width,height});
  for(const key of ['i','k','m','n','j','e','Shift+Slash']){
   if(key==='e')await study(page);else await page.keyboard.press(key);await expect(dialog.getByTestId('companion-content')).toBeVisible();await expect.poll(()=>dialog.getByTestId('companion-overlay').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations!==Infinity&&a.playState==='running').length)).toBe(0);
   const result=await dialog.evaluate(el=>Array.from(el.querySelectorAll('button')).filter(button=>!button.closest('[data-testid="companion-world"],[inert]')).flatMap(button=>{const r=button.getBoundingClientRect();if(!r.width||!r.height)return[];const points=[[r.x+r.width/2,r.y+r.height/2],[r.left+2,r.y+r.height/2],[r.right-2,r.y+r.height/2],[r.x+r.width/2,r.top+2],[r.x+r.width/2,r.bottom-2]];const misses=button.disabled?[]:points.filter(([x,y])=>!button.contains(document.elementFromPoint(x,y))).map(([x,y])=>({x,y,hit:document.elementFromPoint(x,y)?.outerHTML.slice(0,280),rect:{x:r.x,y:r.y,width:r.width,height:r.height}}));return [{label:button.getAttribute('aria-label')||button.textContent,width:r.width,height:r.height,misses}];}));
   console.log('COARSE_HITS',width,height,key,JSON.stringify(result));expect(result.length).toBeGreaterThan(5);for(const control of result){expect(control.width,control.label??'control').toBeGreaterThanOrEqual(44);expect(control.height,control.label??'control').toBeGreaterThanOrEqual(44);expect(control.misses,control.label??'control').toEqual([]);}await page.keyboard.press('Escape');
  }
 }
 await context.close();
});

test('Q restarts a finished attack animation within the same simulation turn',async({page})=>{
 await page.clock.install({time:new Date('2026-09-24T00:00:00Z')});await openProject(page,'en',false);const dialog=await home(page);await page.clock.pauseAt(new Date('2026-09-24T00:01:00Z'));
 await page.keyboard.press('m');await dialog.getByRole('button',{name:'Depart',exact:true}).click();
 await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('ontology-atlas:companion-game:v1:'))!;const game=JSON.parse(localStorage.getItem(key)!);Object.assign(game,{phase:'attack',encounter:14,enemyHp:100,attackId:17,turn:3,cooldown:0,lastAt:Date.now()});localStorage.setItem(key,JSON.stringify(game));window.dispatchEvent(new StorageEvent('storage'));});
 await page.emulateMedia({reducedMotion:'no-preference'});const sprite=dialog.getByTestId('companion-player').locator('[data-frame]');await expect(sprite).toHaveAttribute('data-playing','true');const first=await sprite.getAttribute('data-frame');
 // Finish the 450ms strike without advancing the 1500ms combat turn.
 await page.clock.runFor(600);await expect(sprite).not.toHaveAttribute('data-frame',first!);await page.keyboard.press('q');await expect(sprite).toHaveAttribute('data-frame',first!);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key=>key.startsWith('ontology-atlas:companion-game:v1:'))!)!));expect(saved.attackId).toBe(18);expect(saved.turn).toBe(3);expect(saved.phase).toBe('attack');
});

test('a blessing-adjusted wave announces the same multiplier that it displays',async({page})=>{
 await openProject(page);const dialog=await home(page);await page.keyboard.press('m');await dialog.getByRole('button',{name:'Depart',exact:true}).click();await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('ontology-atlas:companion-game:v1:'))!;const game=JSON.parse(localStorage.getItem(key)!);game.run.boons.echo=1;game.run.drafted=1;localStorage.setItem(key,JSON.stringify(game));window.dispatchEvent(new StorageEvent('storage'));});const wave=dialog.getByRole('button',{name:'Knowledge wave ×3.75',exact:true});await expect(wave).toBeVisible();await expect(wave).toContainText('×3.75');
});

test('changing motion preference updates the open game without a reload',async({page})=>{
 await openProject(page,'en',false);const dialog=await home(page);const world=dialog.getByTestId('companion-world');
 await expect(world).toHaveAttribute('data-playing','true');await page.emulateMedia({reducedMotion:'reduce'});await expect(world).toHaveAttribute('data-playing','false');
 await page.emulateMedia({reducedMotion:'no-preference'});await expect(world).toHaveAttribute('data-playing','true');
});

test('walking keeps all eight boot-contact frames on the floor and stops when input stops',async({page})=>{
 await openProject(page,'en',false);const dialog=await home(page);const player=dialog.getByTestId('companion-player');
 const contacts=player.evaluate(el=>new Promise<Array<{frame:string;gap:number}>>(resolve=>{
  const seen=new Map<string,number>();
  const sample=()=>{const sprite=el.querySelector<HTMLElement>('[data-pose="walk"][data-frame]');const pixels=sprite?.firstElementChild;const shadow=el.querySelector('[data-testid="companion-contact-shadow"]');if(!pixels||!shadow||!sprite)return;const p=pixels.getBoundingClientRect(),s=shadow.getBoundingClientRect();seen.set(sprite.dataset.frame!,p.bottom-s.top-s.height/2);if(seen.size===8){observer.disconnect();resolve([...seen].map(([frame,gap])=>({frame,gap})));}};
  const observer=new MutationObserver(sample);observer.observe(el,{subtree:true,childList:true,attributes:true,attributeFilter:['data-frame']});sample();
 }));
 await dialog.getByTestId('companion-world').focus();await page.keyboard.down('d');const samples=await contacts;await page.keyboard.up('d');console.log('BOOT_CONTACT',JSON.stringify(samples));expect(samples).toHaveLength(8);for(const sample of samples)expect(Math.abs(sample.gap)).toBeLessThanOrEqual(1);
 await expect(player).toHaveAttribute('data-pose','idle');
});

test('camp has one contextual E and the portal opens 36 routes with project-only locks and discovery',async({page})=>{
 await openProject(page);const dialog=await home(page);
 await expect(dialog.locator('kbd').filter({hasText:/^E$/})).toHaveCount(1);
 await dialog.getByTestId('companion-world').focus();await page.keyboard.down('a');await expect(dialog.getByTestId('companion-world')).toHaveAttribute('data-near','');await page.keyboard.up('a');await page.keyboard.press('e');await expect(dialog.getByTestId('companion-overlay')).toBeHidden();
 await dialog.getByTestId('companion-world').getByRole('button',{name:'Adventure portal',exact:true}).click();
 const map=dialog.getByTestId('companion-adventure-map');await expect(map).toBeVisible();await expect(map).toContainText('36 destinations');
 const routes=new Set<string>();for(let region=0;region<6;region++){
  const tiles=map.getByRole('button').filter({has:page.locator('[class*="routeTitle"]')});await expect(tiles).toHaveCount(6);
  for(const title of await tiles.evaluateAll(elements=>elements.map(el=>el.getAttribute('aria-label')!)))routes.add(title);
  if(region<5)await map.getByRole('button',{name:'Next page',exact:true}).click();
 }
 expect(routes.size).toBe(36);await expect(map.getByRole('button',{name:'Depart',exact:true})).toBeDisabled();await expect(map.getByTestId('companion-map-lock')).toContainText('Project + reading');
 // Combat XP is deliberately insufficient to unlock a region.
 await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('ontology-atlas:companion-game:v1:'))!;const game=JSON.parse(localStorage.getItem(key)!);game.xp=100000;localStorage.setItem(key,JSON.stringify(game));window.dispatchEvent(new StorageEvent('storage'));});
 await expect(map.getByRole('button',{name:'Depart',exact:true})).toBeDisabled();
 for(let region=5;region>0;region--)await map.getByRole('button',{name:'Previous page',exact:true}).click();
 await map.getByRole('button',{name:'Luminous Glade',exact:true}).click();await expect(map.getByTestId('companion-map-effect')).toContainText('+3 G');
 await map.getByRole('button',{name:'Depart',exact:true}).click();await expect(dialog.getByTestId('companion-world')).toHaveAttribute('data-mode','expedition');await expect(dialog.locator('[data-map]')).toHaveAttribute('data-map','adventure:grove:2');
 await page.keyboard.press('n');await expect(dialog.getByTestId('companion-overlay')).toHaveAttribute('aria-label','Creature field guide');await expect(dialog.getByTestId('companion-content')).toContainText(/Discovered [1-9]/);await page.keyboard.press('Escape');
 await page.keyboard.press('m');await dialog.getByRole('button',{name:'Return to camp',exact:true}).click();await expect(dialog.getByTestId('companion-world')).toHaveAttribute('data-mode','camp');
});
