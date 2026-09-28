import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { waitForAnimationsDone, waitForMapStill } from '../settle';
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
  const composer=page.getByRole('textbox',{name:'Write what you want done'});await expect(composer).toContainText('Retry dispatch');
  await page.getByTestId('acp-chat-seated-detail').click();
  const detail=page.getByTestId('acp-chat-seated-detail-text');await expect(detail).toContainText('grayAreaInvestigation:v1');
  await expect(detail).toContainText('Passes the request to the local write-policy decision.');
  writeFileSync('/tmp/atlas-gray-area-proof/investigation-packet.txt',(await composer.innerText())+'\n\n'+(await detail.innerText()));
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

test('the inspector, candidate detail, scope and source open with nonempty WCAG coverage',async({page})=>{
  await page.setViewportSize({width:1512,height:949});await install(page);await open(page);
  const receipts: unknown[]=[];
  const audit=async(state:string)=>{
    await waitForAnimationsDone(page.getByTestId('gray-area-inspector'));
    await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
    const result=await page.evaluate(async()=>{
      const axe=(window as unknown as {axe:{run:(root:Document,options:unknown)=>Promise<{passes:unknown[];violations:unknown[]}>}}).axe;
      const result=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});
      return {rulesPassed:result.passes.length,violations:result.violations};
    });
    receipts.push({state,...result});
    expect(result.rulesPassed,state).toBeGreaterThanOrEqual(15);
    expect(result.violations,state).toEqual([]);
  };
  await audit('folder preview');
  await page.getByRole('button',{name:'Inspect this folder',exact:true}).click();
  await expect(page.getByTestId('gray-area-missing-link').getByText('Observed',{exact:true})).toBeVisible();
  await audit('candidate detail');
  await page.getByRole('button',{name:'Scope, limits and permissions',exact:true}).click();
  await expect(page.getByRole('list',{name:'Implementation folders inspected'})).toBeVisible();
  await audit('scope disclosure');
  await page.getByRole('button',{name:/src\/retry\/index.ts:1/}).first().click();
  await expect(page.getByRole('region',{name:'Captured source',exact:true})).toBeFocused();
  await audit('source excerpt');
  writeFileSync('/tmp/atlas-gray-area-proof/open-surfaces-axe.json',JSON.stringify(receipts,null,2));
});

test('a comparison from the saved Hex view draws both elements on the flat recorded path',async({page})=>{
  await page.setViewportSize({width:1512,height:949});await install(page);
  await page.goto('/en/topology/?p=elements/retry-dispatch&view=hex&e2e=1&guides=off');
  await expect(page.getByTestId('hex-board-map')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('atlas.appearance.hex-board'))).toBe('on');
  await inspect(page);
  await page.getByRole('button',{name:'Compare concepts on map',exact:true}).click();
  await expect(page.getByTestId('topology-view-3d')).toHaveAttribute('data-map-view','flat');
  await expect(page.getByTestId('hex-board-map')).toHaveCount(0);
  const map=page.getByTestId('ontology-map');
  await expect(map).toHaveAttribute('data-map-lens','path');
  await expect(map).toHaveAttribute('data-path-node-count','3');
  await expect(map).toHaveAttribute('data-path-edge-count','2');
  await waitForMapStill(page);
  const endpoints=await page.evaluate(()=>{
    const probe=window.__atlasMap!;const camera=probe.camera()!;
    return probe.nodes().filter(n=>n.label==='Retry dispatch'||n.label==='Write policy').map(n=>({
      id:n.id,label:n.label,hidden:n.hidden,visible:!n.hidden&&(n.alpha??1)>0.05&&n.x-n.radius>=0&&n.x+n.radius<=camera.width&&n.y-n.radius>=0&&n.y+n.radius<=camera.height,
    }));
  });
  expect(endpoints).toHaveLength(2);expect(endpoints.every(n=>n.visible)).toBe(true);
  await expect(page.getByTestId('gray-area-inspector')).toBeVisible();
  await expect(page.getByTestId('gray-area-missing-link')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>({view:new URLSearchParams(location.search).get('view'),saved:localStorage.getItem('atlas.appearance.hex-board')}))).toEqual({view:null,saved:'off'});
  writeFileSync('/tmp/atlas-gray-area-proof/hex-comparison.json',JSON.stringify(endpoints,null,2));
  await page.screenshot({path:'/tmp/atlas-gray-area-proof/hex-comparison.png'});
});

test('a prepared pair draft leads with its localized topic, retains folded evidence and retires its topic when cleared',async({page})=>{
  await page.setViewportSize({width:1512,height:949});await install(page,{runtimeIds:['claude-acp','codex-acp']});await page.goto('/ko/topology/?p=elements/retry-dispatch&guides=off');
  await page.getByTestId('map-detail-panel-more-menu-trigger').click();await page.getByTestId('map-detail-panel-action-gray-area').click();
  await page.getByRole('button',{name:'이 폴더에서 검사',exact:true}).click();
  await page.getByRole('button',{name:'지도에서 두 개념 보기',exact:true}).click();
  await page.getByRole('button',{name:'수정 가능한 대화 초안',exact:true}).first().click();
  const dock=page.getByTestId('analysis-workbench');const heading=dock.getByRole('heading',{level:2});
  await expect(heading).toContainText('재시도 전달');await expect(heading).toContainText('쓰기 권한 규칙');
  const composer=page.getByRole('textbox',{name:'무엇을 시킬지 적어요',exact:true});
  await expect(composer).toContainText('재시도 전달');await expect(composer).toContainText('쓰기 권한 규칙');
  await expect(composer).not.toContainText('grayAreaInvestigation:v1');
  await expect(page.getByTestId('acp-chat-suggestions')).toHaveCount(0);await expect(page.getByTestId('acp-starting-suggestions')).toHaveCount(0);
  await waitForAnimationsDone(dock);await page.screenshot({path:'/tmp/atlas-gray-area-proof/prepared-pair-ko-initial.png'});
  await page.getByTestId('acp-chat-seated-detail').click();
  const detail=page.getByTestId('acp-chat-seated-detail-text');await expect(detail).toContainText('grayAreaInvestigation:v1');await expect(detail).toContainText('bodyDigest');await expect(detail).toContainText('requestedMode');
  await page.screenshot({path:'/tmp/atlas-gray-area-proof/prepared-pair-ko.png'});
  await composer.fill('제가 고친 조사 질문이에요');
  await page.getByTestId('acp-chat-runtime').click();await page.getByRole('option',{name:'Codex',exact:true}).click();
  await expect(composer).toHaveText('제가 고친 조사 질문이에요');await expect(heading).toContainText('재시도 전달');
  await dock.getByRole('tab',{name:'의미',exact:true}).click();await expect(heading).not.toContainText('재시도 전달');
  await dock.getByRole('tab',{name:'대화',exact:true}).click();await expect(heading).toContainText('재시도 전달');
  await composer.fill('');await expect(heading).not.toContainText('재시도 전달');
  await page.getByTestId('acp-chat-runtime').click();await page.getByRole('option',{name:'Claude Agent',exact:true}).click();
  await expect(composer).toHaveText('');await expect(heading).not.toContainText('재시도 전달');
  await composer.fill('다른 질문을 준비해요');await expect(heading).not.toContainText('재시도 전달');
  const state=await page.evaluate(()=> (window as unknown as {__atlasLibraryWorkHarness:{snapshot:()=>{calls:{method:string}[];writes:unknown[]}}}).__atlasLibraryWorkHarness.snapshot());
  expect(state.calls.filter(c=>c.method==='session/prompt')).toHaveLength(0);expect(state.writes).toHaveLength(0);
});
