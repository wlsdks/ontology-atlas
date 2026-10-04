import { describe, expect, it } from 'vitest';
import type { AnalysisCaptureContext } from '@/features/acp-session';
import { buildGrayAreaCandidates, buildGrayAreaInvestigation } from '@/features/gray-area';
import type { GrayAreaSnapshot } from '@/shared/lib/tauri-gray-area';
import type { VaultDoc } from '@/entities/docs-vault';
import { investigationCaptureContext } from './investigation-context';

const hash=`sha256:${'a'.repeat(64)}`;
const projectUid='11111111-1111-4111-8111-111111111111';
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const statement='src/a.ts has not been read.';
const snapshot:GrayAreaSnapshot={contract:'grayAreaEvidence:v1',snapshotId:hash,measuredAt:'2026-10-04T00:00:00.000Z',
  basis:{projectSlug:'project',selectedUids:[uid],sourceId:'source',sourceFingerprint:hash,graphDigest:hash,bodyDigest:hash,bindingDigest:hash},
  nodes:[{uid,slug:'elements/a',title:'A',kind:'element',path:'src/a.ts',body:`## Uncertainty\n- ${statement}`,bodyDigest:hash}],
  edges:[],imports:[],drift:[],recordedReads:[{slug:'elements/a',kind:'unread-file',statement,paths:['src/a.ts'],ranges:[]}],witnesses:[],
  coverage:{filesScanned:1,maxFiles:2000,importsAvailable:true,importsLimited:false,unresolvedImports:0,unsupported:[],readsLimited:false,recordedReadsTotal:1,limits:[]}};
const doc:VaultDoc={slug:'project',path:'project.md',title:'Project',frontmatter:{kind:'project',uid:projectUid},tags:[],headings:[],excerpt:'',wordCount:1,updatedAt:'2026-10-04',linksOut:[]};
const base:AnalysisCaptureContext={mode:'meaning',surface:'map',handle:null,writable:false,fileHandles:new Map(),
  scope:{projectSlug:'project',projectUid,targetSlugs:[],profileSlug:null},graph:{nodes:[],edges:[]},sourceFingerprint:null,profileHash:null};
const text=buildGrayAreaInvestigation(snapshot,buildGrayAreaCandidates(snapshot)[0],{projectUid,explicit:true});
const basis={vaultPath:'/vault',text,snapshot,projectUid};

describe('capture context for an app-composed investigation',()=>{
  it('binds exact targets and source to the native question without changing generic capture',()=>{
    const context=investigationCaptureContext(base,basis,'/vault',[doc]);
    expect(context?.scope.targetSlugs).toEqual(['elements/a']);expect(context?.scope.projectUid).toBe(projectUid);
    expect(context?.sourceFingerprint).toBe(hash);expect(base.scope.targetSlugs).toEqual([]);expect(base.sourceFingerprint).toBeNull();
  });
  it('refuses another vault, project identity or user-edited request',()=>{
    expect(investigationCaptureContext(base,basis,'/other',[doc])).toBeNull();
    expect(investigationCaptureContext(base,basis,'/vault',[{...doc,frontmatter:{kind:'project',uid}}])).toBeNull();
    expect(investigationCaptureContext(base,{...basis,text:text+'\nEdited'},'/vault',[doc])).toBeNull();
  });
  it('refuses a request whose snapshot was replaced while keeping its text',()=>{
    expect(investigationCaptureContext(base,{...basis,snapshot:{...snapshot,basis:{...snapshot.basis,sourceFingerprint:'changed'}}},'/vault',[doc])).toBeNull();
  });
});
