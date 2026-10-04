import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installGrayAreaHarness } from './harness';
import { waitForAnimationsDone } from '../settle';

const proof=process.env.ATLAS_PANEL_PROOF_DIR??join(tmpdir(),'atlas-analysis-panel-layout-proof');
for(const [width,height] of [[600,900],[768,1024],[834,1112],[1024,768],[1440,900],[1920,1080],[2560,1440]]){
  test(`the investigation panel clears its map toolbar and keeps one reading scroll at ${width}px`,async({page})=>{
    mkdirSync(proof,{recursive:true});
    await page.setViewportSize({width,height});await page.emulateMedia({reducedMotion:'reduce'});
    await installGrayAreaHarness(page);
    await page.evaluate(()=>{
      const w=window as unknown as {__TAURI_INTERNALS__:{invoke:(command:string,args?:unknown)=>Promise<unknown>}};
      const invoke=w.__TAURI_INTERNALS__.invoke;
      w.__TAURI_INTERNALS__.invoke=async(command,args)=>{
        const value=await invoke(command,args);
        if(command!=='read_gray_area_evidence')return value;
        const snapshot=structuredClone(value) as {witnesses:{text:string}[]};
        for(const witness of snapshot.witnesses)witness.text=Array.from({length:120},(_,i)=>`const observed${i} = 'bounded source evidence';`).join('\n');
        return snapshot;
      };
    });
    await page.getByTestId('map-detail-panel-close').click();
    await page.getByTestId('map-analysis-status-entry').click();
    await page.getByRole('button',{name:'Inspect this folder',exact:true}).click();
    const panel=page.getByTestId('gray-area-inspector');
    await expect(page.getByTestId('gray-area-missing-link')).toBeVisible();
    await page.screenshot({path:`${proof}/initial-${width}.png`});
    await page.getByRole('button',{name:/src\/retry\/index.ts:1/}).first().click();
    await waitForAnimationsDone(page.getByTestId('gray-area-source-witness'));
    const sourceClose=page.getByRole('button',{name:'Close source excerpt',exact:true});
    expect.soft(await sourceClose.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
    await page.getByRole('button',{name:'View the exact analysis request',exact:true}).click();
    await waitForAnimationsDone(panel);
    const report=await panel.evaluate(element=>{
      const r=element.getBoundingClientRect();
      const toolbar=document.querySelector('[data-testid="topology-top-toolbar"]')!.getBoundingClientRect();
      const scrolls=[...element.querySelectorAll<HTMLElement>('*')].filter(el=>{
        const c=getComputedStyle(el);
        return /auto|scroll/.test(c.overflowY)&&el.clientHeight>0&&el.scrollHeight>el.clientHeight+1;
      }).map(el=>el.dataset.testid??el.tagName);
      const close=element.querySelector<HTMLElement>('header button')!;const cr=close.getBoundingClientRect();
      return {panel:{top:r.top,bottom:r.bottom},toolbar:{top:toolbar.top,bottom:toolbar.bottom},scrolls,closeReceivesPointer:close.contains(document.elementFromPoint(cr.x+cr.width/2,cr.y+cr.height/2))};
    });
    mkdirSync(proof,{recursive:true});
    writeFileSync(`${proof}/geometry-${width}.json`,JSON.stringify(report,null,2));
    await page.screenshot({path:`${proof}/panel-${width}.png`});
    expect(report.closeReceivesPointer).toBe(true);
    expect.soft(report.panel.top).toBeGreaterThan(report.toolbar.bottom);
    expect.soft(report.scrolls).toEqual(['gray-area-body']);
    const body=page.getByTestId('gray-area-body');const box=(await body.boundingBox())!;
    const before=await body.evaluate(el=>el.scrollTop);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,180);
    await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeGreaterThan(before);
    await panel.getByRole('button',{name:'Fold for this inspection',exact:true}).scrollIntoViewIfNeeded();
    await expect.poll(()=>page.getByTestId('gray-area-body').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  });
}
