import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../messages/en/grayArea.json';
import korean from '../../../../messages/ko/grayArea.json';
import { GrayAreaInspector } from './GrayAreaInspector';
import type { GrayAreaSnapshot } from '@/shared/lib/tauri-gray-area';
import { parseInvestigationPacket } from '../model/investigation-record';

const runtime = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: runtime.invoke }));
vi.mock('@/i18n/navigation', () => ({ Link: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}/> }));
beforeEach(() => { runtime.invoke.mockReset(); });
afterEach(cleanup);

const selection = {projectSlug:'project',uids:['node'],label:'Node',key:'node'};
const access = {code:'source-root-not-granted',sourcePath:'/fixture/source',bindingDigest:`sha256:${'a'.repeat(64)}`};
const preview = {projectSlug:'project',sourcePath:access.sourcePath,sourceId:'source',bindingDigest:access.bindingDigest,maxFiles:2000};
function inspector(locale = 'en', key = 'node') {
  return <NextIntlClientProvider locale={locale} messages={{grayArea:locale === 'ko' ? korean : messages}}>
    <GrayAreaInspector open vaultPath="/fixture/vault" selection={{...selection,key}} onClose={()=>{}} onFocus={()=>{}} onPrepare={()=>{}}/>
  </NextIntlClientProvider>;
}
it.each(['en','ko'])('offers the actual bound path and native recovery in %s', async locale => {
  runtime.invoke.mockRejectedValue(access);
  render(inspector(locale));
  const copy = locale === 'ko' ? korean : messages;
  expect(await screen.findByRole('button', {name:copy.selectSourceFolder}, {timeout:500})).toBeVisible();
  expect(screen.getByText(copy.sourceAccessHint.replace('{path}',access.sourcePath))).toBeVisible();
  expect(runtime.invoke.mock.calls.every(([command])=>command === 'preview_gray_area_scope')).toBe(true);
});
it.each(['vault-root-not-granted','binding_invalid','binding_ambiguous','unsafe_path','unsupported_platform'])('keeps %s out of source recovery', async error => {
  runtime.invoke.mockRejectedValue(error);
  render(inspector());
  await screen.findByTestId('gray-area-unavailable');
  expect(screen.queryByRole('button',{name:messages.selectSourceFolder})).toBeNull();
});
it.each([null,'failure','mismatch'])('keeps %s refused without scanning', async result => {
  runtime.invoke.mockImplementation((command:string,args?:{selectedSourcePath?:string})=> {
    if(command==='pick_source_directory')return result==='failure'?Promise.reject('picker_failed'):Promise.resolve(result==='mismatch'?'/fixture/other':null);
    return Promise.reject(args?.selectedSourcePath?'source_selection_mismatch':access);
  });
  render(inspector());
  const button = await screen.findByRole('button',{name:messages.selectSourceFolder});
  fireEvent.click(button);
  await waitFor(()=>expect(runtime.invoke).toHaveBeenCalledWith('pick_source_directory',{dialogTitle:messages.sourcePickerTitle}));
  await waitFor(()=>expect(button).not.toBeDisabled());
  if(result)expect(screen.getByText(result==='failure'?messages.sourceSelectionFailed:messages.sourceSelectionMismatch)).toBeVisible();
  expect(button).toHaveFocus();
  expect(runtime.invoke.mock.calls.some(([command])=>command==='read_gray_area_evidence')).toBe(false);
});
it('pins recovery identity and waits for the separate inspection action', async()=> {
  runtime.invoke.mockImplementation((command:string,args?:{selectedSourcePath?:string})=> {
    if(command==='pick_source_directory')return Promise.resolve(access.sourcePath);
    if(command==='read_gray_area_evidence')return new Promise(()=>{});
    return args?.selectedSourcePath?Promise.resolve(preview):Promise.reject(access);
  });
  render(inspector());
  fireEvent.click(await screen.findByRole('button',{name:messages.selectSourceFolder}));
  const inspect=await screen.findByRole('button',{name:messages.inspectFolder});
  expect(screen.getByTestId('gray-area-scope-preview')).toHaveFocus();
  expect(runtime.invoke).toHaveBeenCalledWith('preview_gray_area_scope',{vaultPath:'/fixture/vault',projectSlug:'project',selectedSourcePath:access.sourcePath,expectedBindingDigest:access.bindingDigest});
  expect(runtime.invoke.mock.calls.some(([command])=>command==='read_gray_area_evidence')).toBe(false);
  fireEvent.click(inspect);
  expect(runtime.invoke).toHaveBeenCalledWith('read_gray_area_evidence',expect.objectContaining({expectedBindingDigest:access.bindingDigest,selectedUids:['node']}));
});
it('discards a picker completion after the selected scope changes', async()=> {
  let picked:(value:string)=>void=()=>{};
  runtime.invoke.mockImplementation((command:string)=>command==='pick_source_directory'?new Promise(resolve=>{picked=resolve;}):Promise.reject(access));
  const view=render(inspector());
  fireEvent.click(await screen.findByRole('button',{name:messages.selectSourceFolder}));
  view.rerender(inspector('en','other-node'));
  await waitFor(()=>expect(screen.getByRole('button',{name:messages.selectSourceFolder})).not.toBeDisabled());
  view.rerender(inspector('en','node'));
  picked(access.sourcePath);
  await waitFor(()=>expect(screen.getByRole('button',{name:messages.selectSourceFolder})).not.toBeDisabled());
  expect(runtime.invoke.mock.calls.some(([command,args])=>command==='preview_gray_area_scope'&&args.selectedSourcePath)).toBe(false);
});
it.each(['binding_changed','binding_identity_changed','source_unavailable','unsafe_path'])('keeps a new %s refusal separate from picker recovery', async error=> {
  runtime.invoke.mockImplementation((command:string,args?:{selectedSourcePath?:string})=> {
    if(command==='pick_source_directory')return Promise.resolve(access.sourcePath);
    return Promise.reject(args?.selectedSourcePath?error:access);
  });
  render(inspector());
  fireEvent.click(await screen.findByRole('button',{name:messages.selectSourceFolder}));
  await screen.findByTestId('gray-area-unavailable');
  expect(screen.queryByRole('button',{name:messages.selectSourceFolder})).toBeNull();
  expect(runtime.invoke.mock.calls.some(([command])=>command==='read_gray_area_evidence')).toBe(false);
});

it('a native sample without a local folder offers no download and makes no source read', async () => {
  render(<NextIntlClientProvider locale="en" messages={{grayArea:messages}}>
    <GrayAreaInspector open vaultPath={null} selection={{projectSlug:'sample',uids:['sample'],label:'Sample',key:'sample'}} onClose={()=>{}} onFocus={()=>{}} onPrepare={()=>{}}/>
  </NextIntlClientProvider>);
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(screen.queryByRole('link', {name:'Get the app'})).not.toBeInTheDocument();
  expect(screen.getByTestId('gray-area-local-folder-required')).toBeVisible();
  expect(runtime.invoke).not.toHaveBeenCalled();
});

it('keeps opening and local inspection separate from one deliberate analysis with an exact packet',async()=>{
 const nodeUid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';const projectUid='11111111-1111-4111-8111-111111111111';
 const statement='src/a.ts has not been read.';
 const snapshot:GrayAreaSnapshot={contract:'grayAreaEvidence:v1',snapshotId:access.bindingDigest,measuredAt:'2026-10-04T00:00:00.000Z',
   basis:{projectSlug:'project',selectedUids:[nodeUid],sourceId:'source',sourceFingerprint:access.bindingDigest,graphDigest:access.bindingDigest,bodyDigest:access.bindingDigest,bindingDigest:access.bindingDigest},
   nodes:[{uid:nodeUid,slug:'elements/a',title:'A',kind:'element',path:'src/a.ts',body:'## Uncertainty\n- '+statement,bodyDigest:access.bindingDigest}],edges:[],imports:[],drift:[],
   recordedReads:[{slug:'elements/a',kind:'unread-file',statement,paths:['src/a.ts'],ranges:[]}],witnesses:[],
   coverage:{filesScanned:1,maxFiles:2000,importsAvailable:true,importsLimited:false,unresolvedImports:0,unsupported:[],readsLimited:false,recordedReadsTotal:1,limits:[]}};
 let release!: (value:boolean)=>void;
 runtime.invoke.mockImplementation((command:string)=>command==='preview_gray_area_scope'?Promise.resolve(preview):command==='read_gray_area_evidence'?Promise.resolve(snapshot):new Promise<boolean>(resolve=>{release=resolve;}));
 const analyze=vi.fn();
 render(<NextIntlClientProvider locale="en" messages={{grayArea:messages}}><GrayAreaInspector open vaultPath="/fixture/vault" selection={{projectSlug:'project',projectUid,uids:[nodeUid],label:'A',key:'A'}} onClose={()=>{}} onFocus={()=>{}} onPrepare={()=>{}} canAnalyze runtimeLabel="Measured agent" onAnalyze={analyze}/></NextIntlClientProvider>);
 fireEvent.click(await screen.findByRole('button',{name:messages.inspectFolder}));
 const action=await screen.findByRole('button',{name:messages.continuation.analyze});
 expect(screen.getByText(access.sourcePath)).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:messages.continuation.requestDetails}));
 const disclosed=screen.getByTestId('gray-area-exact-request').textContent;
 expect(analyze).not.toHaveBeenCalled();expect(screen.getByText(messages.continuation.transfer.replace('{runtime}','Measured agent'))).toBeVisible();
 act(()=>{action.dispatchEvent(new MouseEvent('click',{bubbles:true}));action.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
 await waitFor(()=>expect(runtime.invoke.mock.calls.filter(([command])=>command==='check_gray_area_evidence')).toHaveLength(1));
 await act(async()=>{release(true);});
 expect(analyze).toHaveBeenCalledOnce();
 expect(analyze.mock.calls[0][0]).toBe(disclosed);
 const packet=parseInvestigationPacket(analyze.mock.calls[0][0]);
 expect(packet?.projectUid).toBe(projectUid);expect(packet?.candidate.slug).toBe('elements/a');
});

it.each(['scope_limit','scope_invalid'])('offers a narrower scope after %s without retrying or model work',async error=>{
 runtime.invoke.mockImplementation((command:string)=>command==='preview_gray_area_scope'?Promise.resolve(preview):Promise.reject(error));
 const narrow=vi.fn();const analyze=vi.fn();
 render(<NextIntlClientProvider locale="en" messages={{grayArea:messages}}><GrayAreaInspector open vaultPath="/fixture/vault" selection={selection} onClose={()=>{}} onFocus={()=>{}} onPrepare={()=>{}} onNarrowScope={narrow} onAnalyze={analyze}/></NextIntlClientProvider>);
 fireEvent.click(await screen.findByRole('button',{name:messages.inspectFolder}));
 await screen.findByTestId('gray-area-unavailable');
 fireEvent.click(screen.getByRole('button',{name:messages.continuation.chooseScopeAction}));
 expect(narrow).toHaveBeenCalledOnce();expect(analyze).not.toHaveBeenCalled();
 expect(runtime.invoke.mock.calls.filter(([command])=>command==='read_gray_area_evidence')).toHaveLength(1);
});
