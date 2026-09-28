import { expect, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { installLibraryWorkHarness, type LibraryWorkRuntimeId } from '../library-work-harness';
import { waitForAnimationsDone } from '../settle';
import snapshot from './fixtures/evidence.json';

function fixtureFiles(directory:string,prefix=''):Record<string,string>{
  return Object.fromEntries(readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const path=join(directory,entry.name);const relative=prefix+entry.name;
    return entry.isDirectory()?Object.entries(fixtureFiles(path,relative+'/')):[[relative,readFileSync(path,'utf8')]];
  }));
}
export async function installGrayAreaHarness(page:Page,options:{runtimeIds?:readonly LibraryWorkRuntimeId[]}={}){
  await installLibraryWorkHarness(page,{files:fixtureFiles(join(process.cwd(),'tests/e2e/gray-area/fixtures/vault')),...options});
  await page.addInitScript(({snapshot})=>{
    const w=window as unknown as {__TAURI_INTERNALS__?:{invoke:(command:string,args?:Record<string,unknown>)=>Promise<unknown>};__gray:{current:boolean;calls:{command:string;args:unknown}[]}};
    w.__gray={current:true,calls:[]};
    let internals=w.__TAURI_INTERNALS__;
    const wrap=(value:NonNullable<typeof internals>)=>{
      const original=value.invoke;
      value.invoke=(command,args)=>{
        if(command.startsWith('preview_gray')||command.startsWith('read_gray')||command.startsWith('check_gray'))w.__gray.calls.push({command,args});
        if(command==='preview_gray_area_scope')return Promise.resolve({projectSlug:snapshot.basis.projectSlug,sourcePath:'/fixture/connected-code',sourceId:snapshot.basis.sourceId,bindingDigest:snapshot.basis.bindingDigest,maxFiles:2000});
        if(command==='read_gray_area_evidence')return Promise.resolve(snapshot);
        if(command==='check_gray_area_evidence')return Promise.resolve(w.__gray.current);
        return original(command,args);
      };return value;
    };
    if(internals)internals=wrap(internals);
    Object.defineProperty(w,'__TAURI_INTERNALS__',{configurable:true,get:()=>internals,set:value=>{internals=wrap(value);}});
  },{snapshot});
  await page.goto('/en/docs/');
  await page.getByRole('button',{name:/^Open my folder/}).first().click();
  await expect(page.getByRole('heading',{name:'Map',exact:true})).toBeVisible();
  await page.goto('/en/topology/?p=elements/retry-dispatch&guides=off');
  await expect(page.getByTestId('map-detail-panel')).toBeVisible();
}
export async function openGrayAreaPreview(page:Page){
  await page.getByTestId('map-detail-panel-more-menu-trigger').click();
  await page.getByTestId('map-detail-panel-action-gray-area').click();
  await expect(page.getByTestId('gray-area-scope-preview')).toContainText('/fixture/connected-code');
}
export async function inspectGrayArea(page:Page){await openGrayAreaPreview(page);await page.getByRole('button',{name:'Inspect this folder',exact:true}).click();await expect(page.getByTestId('gray-area-missing-link')).toBeVisible();}


export async function waitForGrayAreaTop(page:Page) {
  const panel=page.getByTestId('gray-area-inspector');await waitForAnimationsDone(panel);
  await expect.poll(()=>page.getByTestId('gray-area-body').evaluate(e=>e.scrollTop)).toBeLessThanOrEqual(1);
  await expect.poll(()=>panel.getByText('Observed',{exact:true}).first().evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})).toBe(true);
}
