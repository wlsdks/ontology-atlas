import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../messages/en/grayArea.json';
import korean from '../../../../messages/ko/grayArea.json';
import { GrayAreaInspector } from './GrayAreaInspector';

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
    if(command==='pick_vault_directory')return result==='failure'?Promise.reject('picker_failed'):Promise.resolve(result==='mismatch'?'/fixture/other':null);
    return Promise.reject(args?.selectedSourcePath?'source_selection_mismatch':access);
  });
  render(inspector());
  const button = await screen.findByRole('button',{name:messages.selectSourceFolder});
  fireEvent.click(button);
  await waitFor(()=>expect(runtime.invoke).toHaveBeenCalledWith('pick_vault_directory',{dialogTitle:messages.sourcePickerTitle}));
  await waitFor(()=>expect(button).not.toBeDisabled());
  if(result)expect(screen.getByText(result==='failure'?messages.sourceSelectionFailed:messages.sourceSelectionMismatch)).toBeVisible();
  expect(button).toHaveFocus();
  expect(runtime.invoke.mock.calls.some(([command])=>command==='read_gray_area_evidence')).toBe(false);
});
it('pins recovery identity and waits for the separate inspection action', async()=> {
  runtime.invoke.mockImplementation((command:string,args?:{selectedSourcePath?:string})=> {
    if(command==='pick_vault_directory')return Promise.resolve(access.sourcePath);
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
  runtime.invoke.mockImplementation((command:string)=>command==='pick_vault_directory'?new Promise(resolve=>{picked=resolve;}):Promise.reject(access));
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
    if(command==='pick_vault_directory')return Promise.resolve(access.sourcePath);
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
