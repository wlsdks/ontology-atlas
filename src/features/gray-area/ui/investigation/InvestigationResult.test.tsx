import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import type { AnalysisRun } from '@/entities/analysis-record';
import type { GrayAreaSnapshot } from '@/shared/lib/tauri-gray-area';
import messages from '../../../../../messages/en/grayArea.json';
import { buildGrayAreaCandidates } from '../../model/candidates';
import { buildGrayAreaInvestigation } from '../../model/investigation';
import { InvestigationResult } from './InvestigationResult';

afterEach(cleanup);
const hash=`sha256:${'a'.repeat(64)}`;
const projectUid='11111111-1111-4111-8111-111111111111';
function snapshot(name='a'):GrayAreaSnapshot {
  const uid=name==='a'?'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const slug=`elements/${name}`;const statement=`src/${name}.ts has not been read.`;
  return {contract:'grayAreaEvidence:v1',snapshotId:hash,measuredAt:'2026-10-04T00:00:00.000Z',
    basis:{projectSlug:'project',selectedUids:[uid],sourceId:'source',sourceFingerprint:hash,graphDigest:hash,bodyDigest:hash,bindingDigest:hash},
    nodes:[{uid,slug,title:name,kind:'element',path:`src/${name}.ts`,body:`## Uncertainty\n- ${statement}`,bodyDigest:hash}],
    edges:[],imports:[],drift:[],recordedReads:[{slug,kind:'unread-file',statement,paths:[`src/${name}.ts`],ranges:[]}],witnesses:[],
    coverage:{filesScanned:1,maxFiles:2000,importsAvailable:true,importsLimited:false,unresolvedImports:0,unsupported:[],readsLimited:false,recordedReadsTotal:1,limits:[]}};
}
function run(s:GrayAreaSnapshot):AnalysisRun {
  return {schema:'atlas-analysis/v1',recordType:'run',id:'95f4ba81-41f7-483b-a617-2a4be815be32',createdAt:'2026-10-04T00:00:00.000Z',mode:'meaning',
    scope:{projectSlug:'project',projectUid,targetSlugs:s.nodes.map(n=>n.slug),profileSlug:null},
    request:{id:'request',text:buildGrayAreaInvestigation(s,buildGrayAreaCandidates(s)[0],{projectUid,explicit:true}),parentRunId:null},
    origin:{surface:'map',runtimeId:'measured-agent',sessionId:'session',userEventId:'request',answerEventId:'answer',startedAt:'2026-10-04T00:00:00.000Z',stopReason:'end_turn',outcome:'completed'},
    basis:{graphHash:hash,sourceFingerprint:hash,profileHash:null,documents:[]},evidence:[],observations:[],profileSnapshot:null,toolReads:[],sourceAccess:'unproven',findings:[],qualification:{status:'unverified',reasons:[]},answer:'A plausible answer with a wrong semantic claim.'};
}
function card(s:GrayAreaSnapshot,runs:AnalysisRun[],prepare=vi.fn()) {
  return <NextIntlClientProvider locale="en" messages={{grayArea:messages}}><InvestigationResult runs={runs} snapshot={s} candidate={buildGrayAreaCandidates(s)[0]} projectUid={projectUid} disabled={false} onPrepare={prepare}/></NextIntlClientProvider>;
}
it('restores A after B without crediting B or promoting a plausible answer into accepted meaning',()=>{
  const a=snapshot(),b=snapshot('b'),record=run(a);const prepare=vi.fn();
  const view=render(card(a,[record],prepare));
  expect(screen.getByText(messages.continuation.result)).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:messages.continuation.openResult}));
  expect(screen.getByText(record.answer)).toBeVisible();expect(prepare).not.toHaveBeenCalled();
  view.rerender(card(b,[record],prepare));expect(screen.queryByTestId('gray-area-matching-result')).toBeNull();
  view.rerender(card(a,[record],prepare));expect(screen.getByText(messages.continuation.result)).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:messages.continuation.prepareImprovement}));
  expect(prepare).toHaveBeenCalledOnce();expect(prepare.mock.calls[0][0]).toContain('not write approval');
  expect(record.qualification.status).toBe('unverified');
});
it('keeps stale or incomplete provenance readable while disabling improvement',()=>{
  const a=snapshot();const record=run(a);const stale={...a,basis:{...a.basis,sourceFingerprint:'changed'}};
  const view=render(card(stale,[record]));
  expect(screen.getByRole('button',{name:messages.continuation.prepareImprovement})).toBeDisabled();
  view.rerender(card(a,[{...record,origin:{...record.origin,sessionId:null}}]));
  expect(screen.getByText(messages.continuation.matchUnknown)).toBeVisible();
  expect(screen.getByRole('button',{name:messages.continuation.prepareImprovement})).toBeDisabled();
});
it('does not credit a cancelled turn as a finished investigation',()=>{
  const a=snapshot();const record=run(a);record.origin.outcome='cancelled';
  render(card(a,[record]));expect(screen.getByText(messages.continuation.partial)).toBeVisible();
  expect(screen.getByRole('button',{name:messages.continuation.prepareImprovement})).toBeDisabled();
});
