import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useInvestigationHistory } from './use-investigation-history';

const archive=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/entities/analysis-record',()=>({readAnalysisHistory:archive.read}));
afterEach(()=>{cleanup();archive.read.mockReset();});
const a={name:'A'} as FileSystemDirectoryHandle;
const b={name:'B'} as FileSystemDirectoryHandle;
const empty={records:[],problems:[],totalFiles:0,scanned:0,nextCursor:null};

it('reads history once for the inspection and ignores an older read after a newer archive event',async()=>{
  let old!: (page:typeof empty)=>void;
  archive.read.mockImplementationOnce(()=>new Promise(resolve=>{old=resolve;})).mockResolvedValueOnce({...empty,nextCursor:'more'});
  const hook=renderHook(()=>useInvestigationHistory(a));
  expect(archive.read).toHaveBeenCalledExactlyOnceWith(a,{limit:30});
  act(()=>window.dispatchEvent(new Event('atlas-analysis-records-changed')));
  await waitFor(()=>expect(hook.result.current?.limited).toBe(true));
  await act(async()=>{old(empty);});
  expect(hook.result.current?.limited).toBe(true);
});
it('does not carry A into B or infer absence when history cannot be read',async()=>{
  let old!: (page:typeof empty)=>void;
  archive.read.mockImplementationOnce(()=>new Promise(resolve=>{old=resolve;})).mockRejectedValueOnce(new Error('unreadable'));
  const hook=renderHook(({handle})=>useInvestigationHistory(handle),{initialProps:{handle:a}});
  hook.rerender({handle:b});
  await waitFor(()=>expect(hook.result.current?.unavailable).toBe(true));
  await act(async()=>{old(empty);});
  expect(hook.result.current?.runs).toEqual([]);expect(hook.result.current?.unavailable).toBe(true);
});
