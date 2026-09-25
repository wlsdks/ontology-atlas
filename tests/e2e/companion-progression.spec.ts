import {expect,test,type Page} from '@playwright/test';
import {installDesktopRailRuntime,DESKTOP_VAULT_ROOT} from './desktop-rail-arrival-harness';
import type {AcpWorkReceipt} from '@/shared/lib/acp-work-receipt';
import {FIXTURE_VAULT} from './fixture-vault';
import {waitForBoxStill} from './settle';

const completed=():AcpWorkReceipt=>({v:1,id:'quest-session:write-1',at:'2026-09-25T00:00:00Z',updatedAt:'2026-09-25T00:00:01Z',agent:'codex-acp',request:'Propose a useful body improvement',tool:'patch_concept',decision:'allowed',result:'completed',items:[{target:'capabilities/cart-pricing',operation:'update',relation:null,fields:['body']}],origin:{vaultId:DESKTOP_VAULT_ROOT,sessionGeneration:1,sessionId:'quest-session',userEventId:'human-request',requestId:1,toolCallId:'write-1'},writerCorrelation:{status:'verified',server:'atlas-vault',tool:'patch_concept',toolCall:'structured-mcp',approval:'structured-mcp',terminal:'completed'}});
async function boot(page:Page,receipts:AcpWorkReceipt[]=[],locale='en',files:Record<string,string>={}){
 await installDesktopRailRuntime(page,{...files,'.ontology-atlas/acp-work.jsonl':receipts.map(value=>JSON.stringify(value)).join('\n')});await page.emulateMedia({reducedMotion:'reduce'});await page.goto(`/${locale}/?guides=off&e2e=1`);await page.getByTestId('first-run-open').click();await page.getByTestId('companion-trigger').click();
 const dialog=page.getByTestId('companion-journal');await expect(dialog.getByTestId('companion-world')).toBeVisible();const receipt=dialog.getByRole('button',{name:/Continue the adventure|모험 이어가기/});if(await receipt.isVisible())await receipt.click();await expect(dialog.getByTestId('companion-world')).toBeFocused();return dialog;
}
const state=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key=>key.startsWith('ontology-atlas:companion-game:v1:'))!)!));
async function openQuests(page:Page){await page.keyboard.press('l');await expect(page.getByTestId('companion-quests')).toBeVisible();await expect(page.getByTestId('companion-overlay')).toHaveAttribute('data-surface-state','entered');}
async function partner(page:Page){await openQuests(page);await page.getByTestId('companion-quests').getByRole('button',{name:'Next page',exact:true}).click();await page.getByRole('button',{name:'Working together',exact:true}).click();}

async function panelGeometry(page:Page){
 await waitForBoxStill(page.getByTestId('companion-content'));
 return page.getByTestId('companion-content').evaluate(el=>{
  const bounds=el.getBoundingClientRect();const outside:string[]=[];const misses:string[]=[];const sizes:{label:string;width:number;height:number}[]=[];
  for(const button of el.querySelectorAll('button')){
   const r=button.getBoundingClientRect();if(!r.width||!r.height)continue;const label=button.getAttribute('aria-label')||button.textContent||'button';sizes.push({label,width:r.width,height:r.height});
   if(r.left<bounds.left-1||r.right>bounds.right+1||r.top<bounds.top-1||r.bottom>bounds.bottom+1)outside.push(label);
   if(button.disabled)continue;
   for(const [x,y] of [[r.x+r.width/2,r.y+r.height/2],[r.left+2,r.y+r.height/2],[r.right-2,r.y+r.height/2],[r.x+r.width/2,r.top+2],[r.x+r.width/2,r.bottom-2]])if(!button.contains(document.elementFromPoint(x,y)))misses.push(JSON.stringify({label,x,y,hit:document.elementFromPoint(x,y)?.outerHTML.slice(0,600),bounds:bounds.toJSON(),button:r.toJSON(),panel:el.parentElement?.getBoundingClientRect().toJSON(),menu:document.querySelector('[aria-label="Game menu"]')?.getBoundingClientRect().toJSON()}));
  }
  return {x:el.scrollWidth-el.clientWidth,y:el.scrollHeight-el.clientHeight,outside,misses,sizes};
 });
}

function expectFit(geometry:Awaited<ReturnType<typeof panelGeometry>>){
 expect(geometry.x).toBeLessThanOrEqual(1);expect(geometry.y).toBeLessThanOrEqual(1);expect(geometry.outside).toEqual([]);expect(geometry.misses).toEqual([]);expect(geometry.sizes.length).toBeGreaterThan(0);
}

test('ordinary work unlocks all forge tiers without ACP and enhancement spends exact materials',async({page})=>{
 const dialog=await boot(page);await openQuests(page);const board=dialog.getByTestId('companion-quests');
 for(const name of ['First roots','Linked ideas','Source trail','Growing atlas','Connected world']){await board.getByRole('button',{name,exact:true}).click();await board.getByRole('button',{name:'Claim reward',exact:true}).click();}
 await board.getByRole('button',{name:'Next page',exact:true}).click();await board.getByRole('button',{name:'First reading',exact:true}).click();await board.getByRole('button',{name:'Go to knowledge cards',exact:true}).click();await expect(dialog.getByTestId('companion-concept-preview')).toBeVisible();await page.keyboard.press('l');await expect(board.getByRole('heading',{name:'First reading',exact:true})).toBeVisible();await board.getByRole('button',{name:'Claim reward',exact:true}).click();await expect(board).toHaveAttribute('data-claimed','6');await expect(board).toContainText('Forge up to +20');
 await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('ontology-atlas:companion-game:v1:'))!;const game=JSON.parse(localStorage.getItem(key)!);game.gold=10000;game.upgrades.sword=5;localStorage.setItem(key,JSON.stringify(game));window.dispatchEvent(new StorageEvent('storage'));});
 await page.keyboard.press('i');const before=await state(page);await dialog.getByRole('button',{name:'Enhance · 395 G + 1 relic',exact:true}).click();const after=await state(page);expect(after.upgrades.sword).toBe(6);expect(after.relics).toBe(before.relics-1);expect(after.gold).toBe(before.gold-395);await expect(dialog.getByRole('heading',{name:'Starlight blade +6',exact:true})).toBeVisible();
});

test('only correlated ACP body-save evidence makes its optional quest claimable',async({page})=>{
 const dialog=await boot(page,[completed(),completed()]);await partner(page);await expect(dialog.getByTestId('companion-quest-progress')).toContainText('1 / 1');await expect(dialog.getByTestId('companion-quest-evidence')).toContainText('Completed writes');await dialog.getByRole('button',{name:'Claim reward',exact:true}).click();expect((await state(page)).relics).toBe(2);await expect(dialog.getByRole('button',{name:'Claimed',exact:true})).toBeDisabled();await expect(dialog.getByRole('button',{name:/Current source:/})).toBeVisible();
});

for(const variant of ['pending','failed','rejected','foreign','legacy','approval-only','missing-target'] as const)test(`ACP ${variant} evidence cannot grant quest rewards`,async({page})=>{
 const receipt=completed();
 if(variant==='pending'||variant==='failed'){receipt.result=variant;receipt.writerCorrelation!.terminal=variant;}
 if(variant==='rejected'){receipt.decision='rejected';receipt.result='not-run';receipt.writerCorrelation!.terminal='not-observed';}
 if(variant==='foreign')receipt.origin!.vaultId='/another/vault';
 if(variant==='legacy'){delete receipt.origin;delete receipt.writerCorrelation;}
 if(variant==='approval-only')receipt.items[0].fields=['frontmatter'];
 if(variant==='missing-target')receipt.items[0].target='capabilities/no-such-target';
 const dialog=await boot(page,[receipt]);await partner(page);await expect(dialog.getByRole('button',{name:'Claim reward',exact:true})).toBeDisabled();await expect(dialog.getByTestId('companion-quest-progress')).toContainText('0 / 1');expect((await state(page)).relics).toBe(0);
});

test('assistance shows the request, can be cancelled, and stays honest when no ACP receiver is ready',async({page})=>{
 const dialog=await boot(page);await partner(page);await dialog.getByRole('button',{name:'Prepare ACP assistance',exact:true}).click();await expect(dialog.getByText('Send this request to the agent',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Go back',exact:true}).click();await expect(dialog.getByTestId('companion-quests')).toBeVisible();expect((await state(page)).relics).toBe(0);
 await dialog.getByRole('button',{name:'Prepare ACP assistance',exact:true}).click();await dialog.getByRole('button',{name:'Send this request to ACP',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Nothing was sent');await expect(dialog.getByRole('button',{name:'Check agent connection',exact:true})).toBeVisible();
});

test('the forge unlock route leads to an available ordinary quest after declining ACP',async({page})=>{
 const dialog=await boot(page);await partner(page);await dialog.getByRole('button',{name:'Prepare ACP assistance',exact:true}).click();await dialog.getByRole('button',{name:'Go back',exact:true}).click();
 await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('ontology-atlas:companion-game:v1:'))!;const game=JSON.parse(localStorage.getItem(key)!);game.upgrades.sword=5;localStorage.setItem(key,JSON.stringify(game));window.dispatchEvent(new StorageEvent('storage'));});
 await page.keyboard.press('i');await dialog.getByRole('button',{name:'Unlock tiers through quests',exact:true}).click();await expect(dialog.getByTestId('companion-quests').getByRole('heading',{name:'First roots',exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'Claim reward',exact:true})).toBeEnabled();
});

test('a saved source stays inside the game, pages beyond its excerpt, and returns to its quest',async({page})=>{
 const path='capabilities/cart-pricing.md';const body=FIXTURE_VAULT[path]+'\n\n'+('A boundary must have supporting evidence. '.repeat(6))+'\n\nUnique final source witness.';
 const dialog=await boot(page,[],'en',{[path]:body});await openQuests(page);const before=await state(page);await dialog.getByRole('button',{name:/Current source:/}).click();const reader=dialog.getByTestId('companion-source');await expect(reader).toBeVisible();await expect(reader).toBeFocused();
 const next=reader.getByRole('button',{name:'Next page',exact:true});while(await next.isEnabled())await next.click();await expect(reader.getByTestId('companion-source-body')).toContainText('Unique final source witness.');expect((await state(page)).questClaims).toEqual(before.questClaims);
 await page.keyboard.press('Escape');await expect(reader).toBeHidden();await expect(dialog.getByTestId('companion-quests').getByRole('heading',{name:'First roots',exact:true})).toBeVisible();await expect(dialog.getByTestId('companion-overlay')).toBeFocused();
 await dialog.getByRole('button',{name:/Current source:/}).click();await reader.getByRole('button',{name:'Open in project (leaves game)',exact:true}).click();await expect(dialog).toBeHidden();await expect(page).toHaveURL(/p=capabilities%2Fcart-pricing/);
});

test('reduced motion keeps a visible opacity-only claim and forge receipt',async({page})=>{
 const dialog=await boot(page);await openQuests(page);await dialog.getByRole('button',{name:'Claim reward',exact:true}).click();const receipt=dialog.getByTestId('companion-confirmation');await expect(receipt).toContainText('Relics ×1 collected');await expect(receipt).toBeVisible();expect(await receipt.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
 await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('ontology-atlas:companion-game:v1:'))!;const game=JSON.parse(localStorage.getItem(key)!);game.gold=100;localStorage.setItem(key,JSON.stringify(game));window.dispatchEvent(new StorageEvent('storage'));});await page.keyboard.press('i');await dialog.getByRole('button',{name:'Upgrade · 20 G',exact:true}).click();await expect(receipt).toContainText('Enhanced · +1');await expect(receipt).toBeVisible();expect(await receipt.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
});

for(const locale of ['en','ko'])test(`saved source paging remains reachable at narrow, short and enlarged text (${locale})`,async({page})=>{
 const path='capabilities/cart-pricing.md';const dialog=await boot(page,[],locale,{[path]:FIXTURE_VAULT[path]+'\n\n'+('사업 책임과 근거 Business responsibility and evidence.\n'.repeat(8))});await openQuests(page);await dialog.getByRole('button',{name:/Current source:|현재 자료:/}).click();const source=dialog.getByTestId('companion-source');await expect(source.getByRole('button',{name:/Next page|다음 페이지/})).toBeVisible();
 for(const [width,height,font] of [[320,740,'100%'],[390,844,'100%'],[844,390,'100%'],[1512,900,'200%']] as const){await page.setViewportSize({width,height});await page.evaluate(value=>document.documentElement.style.fontSize=value,font);const geometry=await panelGeometry(page);console.log('SOURCE_FIT',locale,width,height,font,JSON.stringify(geometry));expectFit(geometry);}
});

test('the next path applies at the floor boundary while current-floor effects remain fixed',async({page})=>{
 const dialog=await boot(page);await page.keyboard.press('m');await dialog.getByRole('button',{name:'Depart',exact:true}).click();await dialog.getByTestId('companion-journey-progress').click();const journey=dialog.getByTestId('companion-journey');await expect(journey).toBeVisible();await journey.getByRole('radio',{name:/Supply trail/}).click();expect((await state(page)).run.plan).toBe('cache');
 await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('ontology-atlas:companion-game:v1:'))!;const game=JSON.parse(localStorage.getItem(key)!);Object.assign(game,{encounter:2,phase:'loot',enemyHp:0,lastAt:Date.now()-1500});localStorage.setItem(key,JSON.stringify(game));window.dispatchEvent(new StorageEvent('storage'));});
 await expect(dialog.getByTestId('companion-current-path')).toContainText('Supply trail');await journey.getByRole('radio',{name:/Elite hunt/}).click();await expect(dialog.getByTestId('companion-current-path')).toContainText('Supply trail');await expect(dialog.getByTestId('companion-path-timing')).toContainText('Floor 3: Elite hunt');await dialog.getByRole('button',{name:'Return to camp',exact:true}).click();await expect(dialog.getByTestId('companion-world')).toHaveAttribute('data-mode','camp');
});

for(const locale of ['en','ko'])for(const band of ['small','desktop'])test(`quests, assistance, forge and active journey fit the viewport matrix (${locale}, ${band})`,async({page})=>{
 const dialog=await boot(page,[],locale);const next=locale==='en'?'Next page':'다음 페이지';
 for(const [width,height] of (band==='small'?[[320,740],[390,844],[600,900],[844,390]]:[[768,1024],[834,1112],[1024,768],[1440,900],[1920,1080],[2560,1440]])){
  await page.setViewportSize({width,height});await page.keyboard.press('l');const board=dialog.getByTestId('companion-quests');await expect(board).toBeVisible();const previous=board.getByRole('button',{name:locale==='en'?'Previous page':'이전 페이지',exact:true});while(await previous.isEnabled())await previous.click();
  for(const view of ['quest','assist','assist-unavailable','forge','journey']){
   if(view==='assist'){
    if(height<650){for(let i=0;i<9;i++)await board.getByRole('button',{name:next,exact:true}).click();}else{await board.getByRole('button',{name:next,exact:true}).click();await board.getByRole('button',{name:locale==='en'?'Working together':'동료와 함께',exact:true}).click();}
    await board.getByRole('button',{name:locale==='en'?'Prepare ACP assistance':'ACP 도움 요청 준비',exact:true}).click();
   }
   if(view==='assist-unavailable')await board.getByRole('button',{name:locale==='en'?'Send this request to ACP':'이 요청을 ACP에 보내기',exact:true}).click();
   if(view==='forge')await page.keyboard.press('i');
   if(view==='journey'){await page.keyboard.press('m');await dialog.getByRole('button',{name:locale==='en'?'Depart':'출정하기',exact:true}).click();await page.keyboard.press('m');}
   const content=dialog.getByTestId('companion-content');await expect(content).toBeVisible();await expect(dialog.getByTestId('companion-overlay')).toHaveAttribute('data-surface-state','entered');const geometry=await panelGeometry(page);console.log('PROGRESSION_FIT',locale,width,height,view,JSON.stringify(geometry));expectFit(geometry);
  }
  await dialog.getByRole('button',{name:locale==='en'?'Return to camp':'거점으로',exact:true}).click();
  await expect(dialog.getByTestId('companion-overlay')).toBeHidden();
 }
});

test('an explicit quest request reaches an available ACP workbench without changing approval authority',async({page})=>{
 const runtime={id:'claude-acp',label:'Claude Agent',verified:true,isolated:true,icon:null,brandInk:null,description:'',website:null,license:null,launchKind:'npx',cliPath:'/fixture/cli',adapterPath:null,adapterPackage:null,state:'ready'};
 await installDesktopRailRuntime(page,{}, {fast:[runtime],probed:[runtime]});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/en/?guides=off&e2e=1');await page.getByTestId('first-run-open').click();await page.getByTestId('companion-trigger').click();const dialog=page.getByTestId('companion-journal');await dialog.getByRole('button',{name:'Continue the adventure',exact:true}).click();await expect(dialog.getByTestId('companion-world')).toBeFocused();
 await partner(page);await dialog.getByRole('button',{name:'Prepare ACP assistance',exact:true}).click();await expect(dialog.getByText(/Any actual write must follow the existing approval process/)).toBeVisible();await dialog.getByRole('button',{name:'Send this request to ACP',exact:true}).click();await expect(dialog).toBeHidden();await expect(page.getByTestId('acp-chat-panel')).toBeVisible();await expect(page.getByTestId('acp-chat-panel')).toHaveAttribute('aria-label',/Claude Agent/);
 // This fixture stops at session creation; it cannot contact a provider or approve a write.
 expect(await page.evaluate(()=>(window as unknown as {__nativeCalls:{command:string}[]}).__nativeCalls.some(call=>call.command==='acp_send'))).toBe(false);
 expect((await state(page)).questClaims.partner).toBeUndefined();
});

test('pointer combat actions keep keyboard control in the game',async({page})=>{
 const dialog=await boot(page);await page.keyboard.press('m');await dialog.getByRole('button',{name:'Depart',exact:true}).click();await dialog.getByRole('button',{name:'Knowledge wave ×3',exact:true}).click();await expect(dialog.getByTestId('companion-world')).toBeFocused();await page.keyboard.press('i');await expect(dialog.getByTestId('companion-forge')).toBeVisible();
});

for(const mode of ['coarse','double-text'] as const)test(`quest and forge controls remain reachable with ${mode}`,async({browser})=>{
 const context=await browser.newContext({hasTouch:mode==='coarse',viewport:{width:1512,height:900}});const page=await context.newPage();const dialog=await boot(page);
 if(mode==='double-text')await page.evaluate(()=>document.documentElement.style.fontSize='200%');
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 for(const [width,height] of (mode==='coarse'?[[320,740],[390,844],[844,390],[1512,900]]:[[1512,900]])){
  await page.setViewportSize({width,height});
  for(const view of ['quests','forge','journey']){
   if(view==='quests')await openQuests(page);
   if(view==='forge')await page.keyboard.press('i');
   if(view==='journey'){await page.keyboard.press('m');await dialog.getByRole('button',{name:'Depart',exact:true}).click();await page.keyboard.press('m');}
   await expect(dialog.getByTestId('companion-overlay')).toHaveAttribute('data-surface-state','entered');const geometry=await panelGeometry(page);console.log('PROGRESSION_INPUT',mode,width,height,view,JSON.stringify(geometry));expectFit(geometry);
   if(mode==='coarse')for(const button of geometry.sizes){expect(button.width,button.label).toBeGreaterThanOrEqual(44);expect(button.height,button.label).toBeGreaterThanOrEqual(44);}
   await expect.poll(()=>dialog.evaluate(el=>el.getAnimations({subtree:true}).filter(animation=>animation.effect?.getComputedTiming().iterations!==Infinity&&animation.playState==='running').length)).toBe(0);
   const axe=await page.evaluate(async()=>{const result=await (window as unknown as {axe:{run:(element:Element,options:unknown)=>Promise<{passes:unknown[];violations:unknown[]}>}}).axe.run(document.querySelector('[data-testid="companion-journal"]')!,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});return {passes:result.passes.length,violations:result.violations};});expect(axe.passes).toBeGreaterThan(0);expect(axe.violations).toEqual([]);
  }
  await dialog.getByRole('button',{name:'Return to camp',exact:true}).click();await expect(dialog.getByTestId('companion-overlay')).toBeHidden();
 }
 await context.close();
});

test('closed-panel quest and expedition controls do not overlap or lose their hit areas',async({browser})=>{
 const context=await browser.newContext({hasTouch:true,viewport:{width:1512,height:900}});const page=await context.newPage();const dialog=await boot(page);
 await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('ontology-atlas:companion-game:v1:'))!;const game=JSON.parse(localStorage.getItem(key)!);game.run.lastOutcome='clear';localStorage.setItem(key,JSON.stringify(game));window.dispatchEvent(new StorageEvent('storage'));});
 for(const [width,height] of [[320,740],[390,844],[844,390],[1512,900],[2560,1440]]){
  await page.setViewportSize({width,height});
  for(const mode of ['camp','expedition']){
   if(mode==='expedition'){await page.keyboard.press('m');await dialog.getByRole('button',{name:'Depart',exact:true}).click();}
   await expect(dialog.getByTestId('companion-overlay')).toBeHidden();
   const measured=await dialog.getByTestId('companion-growth').evaluate(el=>{
    const b=el.getBoundingClientRect();const controls=Array.from(el.querySelectorAll('button')).filter(button=>!button.closest('[data-testid="companion-world"],[inert]')).map(button=>({button,r:button.getBoundingClientRect()})).filter(({r})=>r.width&&r.height);
    return controls.map(({button,r},index)=>({label:button.getAttribute('aria-label')||button.textContent,width:r.width,height:r.height,outside:r.left<b.left-1||r.right>b.right+1||r.top<b.top-1||r.bottom>b.bottom+1,intercepted:!button.disabled&&[[r.x+r.width/2,r.y+r.height/2],[r.left+2,r.y+r.height/2],[r.right-2,r.y+r.height/2],[r.x+r.width/2,r.top+2],[r.x+r.width/2,r.bottom-2]].some(([x,y])=>!button.contains(document.elementFromPoint(x,y))),overlaps:controls.slice(index+1).filter(({r:other})=>Math.min(r.right,other.right)-Math.max(r.left,other.left)>1&&Math.min(r.bottom,other.bottom)-Math.max(r.top,other.top)>1).map(({button})=>button.getAttribute('aria-label')||button.textContent)}));
   });
   console.log('PROGRESSION_HUD',width,height,mode,JSON.stringify(measured));expect(measured.length).toBeGreaterThan(5);for(const control of measured){expect(control.outside,control.label??'control').toBe(false);expect(control.intercepted,control.label??'control').toBe(false);expect(control.overlaps,control.label??'control').toEqual([]);expect(control.width).toBeGreaterThanOrEqual(44);expect(control.height).toBeGreaterThanOrEqual(44);}
  }
  await page.keyboard.press('m');await dialog.getByRole('button',{name:'Return to camp',exact:true}).click();
 }
 await context.close();
});

test('closing a folio retains its content and width through the exit animation',async({page})=>{
 const dialog=await boot(page);await page.emulateMedia({reducedMotion:'no-preference'});await openQuests(page);await page.getByTestId('companion-overlay').evaluate(element=>{const width=element.getBoundingClientRect().width;const observer=new MutationObserver(()=>{if(element.getAttribute('data-surface-state')==='exiting'){(window as unknown as {folioExit:unknown}).folioExit={width:element.getBoundingClientRect().width,originalWidth:width,title:element.querySelector('h3')?.textContent,retained:Boolean(element.querySelector('[data-testid="companion-quests"]'))};observer.disconnect();}});observer.observe(element,{attributes:true,childList:true,subtree:true});});
 await page.keyboard.press('Escape');await expect.poll(()=>page.evaluate(()=>(window as unknown as {folioExit:{retained:boolean}|undefined}).folioExit?.retained)).toBe(true);const result=await page.evaluate(()=>(window as unknown as {folioExit:{width:number;originalWidth:number;title:string}}).folioExit);expect(result.width).toBeCloseTo(result.originalWidth,0);expect(result.title).toBeTruthy();await expect(dialog.getByTestId('companion-overlay')).toBeHidden();
});

for(const locale of ['en','ko'])test(`locked equipment explains every gate within the panel (${locale})`,async({page})=>{
 const dialog=await boot(page,[],locale);await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('ontology-atlas:companion-game:v1:'))!;const game=JSON.parse(localStorage.getItem(key)!);game.upgrades={sword:5,armor:5,library:5};localStorage.setItem(key,JSON.stringify(game));window.dispatchEvent(new StorageEvent('storage'));});await page.keyboard.press('i');
 for(const [width,height,font] of [[320,740,'100%'],[390,844,'100%'],[844,390,'100%'],[1512,900,'200%']] as const){await page.setViewportSize({width,height});await page.evaluate(value=>document.documentElement.style.fontSize=value,font);for(const gear of locale==='en'?['Starlight blade','Night-sky cloak','Archive spellbook']:['별빛 검','밤하늘 망토','기록의 마법서']){await dialog.getByRole('button',{name:gear+' · 1',exact:true}).click();await expect(dialog.getByRole('button',{name:/Unlock tiers through quests|의뢰로 강화 단계 열기/})).toBeVisible();const geometry=await panelGeometry(page);console.log('LOCKED_FORGE_FIT',locale,width,height,gear,JSON.stringify(geometry));expectFit(geometry);}}
});
