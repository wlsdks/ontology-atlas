'use client';

import { isTauriVaultRuntime, pickTauriSourceDirectory } from '@/shared/lib/tauri-vault-fs';
import { cn } from '@/shared/lib/cn';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { copyText } from '@/shared/lib/copy-text';
import { useHeldValue } from '@/shared/lib/use-presence';
import { Link } from '@/i18n/navigation';
import { checkGrayAreaEvidence, grayAreaSourceAccessRequired, readGrayAreaEvidence, previewGrayAreaScope, type GrayAreaScopePreview, type GrayAreaSnapshot, type GrayAreaWitness } from '@/shared/lib/tauri-gray-area';
import { Button, Chip, CloseButton, Disclosure, RowButton, Surface, controlClass } from '@/shared/ui';
import { ArrowRight, Check, ChevronDown, Copy, FileSearch, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { grayAreaCandidatePage, formatRecordedPath, type GrayAreaCandidate } from '../model/candidates';
import { buildGrayAreaInvestigation } from '../model/investigation';
import { useInvestigationHistory } from '../model/investigation/use-investigation-history';
import { InvestigationResult } from './investigation/InvestigationResult';
import styles from './GrayAreaInspector.module.css';

export interface GrayAreaSelection { projectSlug: string; projectUid?:string; uids: string[]; label: string; key: string }
interface Props {
  open: boolean;
  vaultPath: string | null;
  vaultHandle?:FileSystemDirectoryHandle|null;
  selection: GrayAreaSelection;
  onClose: () => void;
  onFocus: (candidate: GrayAreaCandidate) => void;
  onPrepare: (packet: string, candidate: GrayAreaCandidate, snapshot?:GrayAreaSnapshot, sourceRoot?:string) => void;
  onNarrowScope?:()=>void;
  onPrepareImprovement?:(request:string,candidate:GrayAreaCandidate,snapshot:GrayAreaSnapshot,sourceRoot:string)=>void;
  onAnalyze?: (packet:string,candidate:GrayAreaCandidate,snapshot:GrayAreaSnapshot,sourceRoot:string)=>void;
  runtimeLabel?:string;
  canAnalyze?:boolean;
  busyConversation?:boolean;
  onInspection?:(snapshot:GrayAreaSnapshot,count:number)=>void;
  previousResultAt?:string;
  onExited?: () => void;
}

export function GrayAreaInspector({ open, vaultPath, vaultHandle, selection, onClose, onFocus, onPrepare, onNarrowScope, onPrepareImprovement, onAnalyze, runtimeLabel, canAnalyze, busyConversation, onInspection, previousResultAt, onExited }: Props) {
  const t = useTranslations('grayArea');
  const nativeRuntime = isTauriVaultRuntime();
  const [attempt, setAttempt] = useState(0);
  const [preview,setPreview] = useState<{key:string;value:GrayAreaScopePreview|null;error:unknown}|null>(null);
  const [sourceSelection,setSourceSelection] = useState<{key:string;busy:boolean;error:'sourceSelectionFailed'|'sourceSelectionMismatch'|null}|null>(null);
  const sourcePickerRef = useRef<HTMLButtonElement>(null);
  const [scanKey,setScanKey] = useState<string|null>(null);
  const [result, setResult] = useState<{ key: string; snapshot: GrayAreaSnapshot | null; error: string | null } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const mountResults = useCallback((node:HTMLDivElement|null)=>{
    if(!node)return;
    node.focus({preventScroll:true});
    if(bodyRef.current)bodyRef.current.scrollTop=0;
  },[]);
  const sequence = useRef(0);
  const escapeFirstRef = useRef<(()=>boolean)|null>(null);
  const requestKey = JSON.stringify([vaultPath,selection.key,attempt]);
  useEffect(() => {
    if (!open) return;
    sequence.current+=1;
    closeRef.current?.focus();
    let cancelled = false;
    const read = async () => {
      try {
        const value = vaultPath ? await previewGrayAreaScope(vaultPath,selection.projectSlug) : null;
        if (!cancelled) {
          setSourceSelection(null);
          setPreview({key:requestKey,value,error:null});
        }
      } catch (error) {
        if (!cancelled) {
          setSourceSelection(null);
          setPreview({key:requestKey,value:null,error});
        }
      }
    };
    void read();
    return () => { cancelled = true; sequence.current+=1; };
  }, [open, requestKey, vaultPath, selection]);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault(); event.stopPropagation(); if(!escapeFirstRef.current?.())onClose();
    };
    document.addEventListener('keydown',key,true);
    return () => document.removeEventListener('keydown',key,true);
  }, [open,onClose]);
  const current = result?.key === requestKey ? result : null;
  const proposal = preview?.key===requestKey?preview:null;
  const sourceAccess = grayAreaSourceAccessRequired(proposal?.error);
  const scopeUnavailable=['scope_limit','scope_invalid'].some(code=>String(current?.error??proposal?.error).includes(code));
  const sourceSelectionState = sourceSelection?.key===requestKey?sourceSelection:null;
  useEffect(()=>{
    if(sourceSelectionState&&!sourceSelectionState.busy)sourcePickerRef.current?.focus();
  },[sourceSelectionState]);
  const selectSource = async()=>{
    if(!vaultPath||!sourceAccess||sourceSelectionState?.busy)return;
    const ticket=sequence.current;
    setSourceSelection({key:requestKey,busy:true,error:null});
    let repreviewing=false;
    try{
      const selectedSourcePath=await pickTauriSourceDirectory(t('sourcePickerTitle'));
      if(ticket!==sequence.current||!selectedSourcePath)return;
      if(!selectedSourcePath)throw new Error('picker_failed');
      repreviewing=true;
      const value=await previewGrayAreaScope(vaultPath,selection.projectSlug,{selectedSourcePath,expectedBindingDigest:sourceAccess.bindingDigest});
      if(ticket===sequence.current)setPreview({key:requestKey,value,error:null});
    }catch(error){
      if(ticket!==sequence.current)return;
      if(repreviewing&&error!=='source_selection_mismatch')setPreview({key:requestKey,value:null,error});
      else setSourceSelection({key:requestKey,busy:false,error:error==='source_selection_mismatch'?'sourceSelectionMismatch':'sourceSelectionFailed'});
    }finally{
      if(ticket===sequence.current){
        setSourceSelection(current=>current?.key===requestKey?{...current,busy:false}:current);
      }
    }
  };
  const start = async()=>{
    if(!vaultPath||!proposal?.value)return;
    const ticket=sequence.current;
    setScanKey(requestKey);
    try{const snapshot=await readGrayAreaEvidence(vaultPath,selection.projectSlug,selection.uids,proposal.value.bindingDigest);if(ticket===sequence.current)setResult({key:requestKey,snapshot,error:null});}
    catch(error){if(ticket===sequence.current)setResult({key:requestKey,snapshot:null,error:String(error)});}
  };
  return <Surface open={open} onExited={onExited} as="aside" role="region" aria-labelledby="gray-area-title" origin="top right"
    data-testid="gray-area-inspector" data-topology-camera-obstacle="side-panel"
    className={`${styles.inspector} pointer-events-auto fixed inset-x-3 bottom-[var(--map-panel-bottom-reserve)] z-40 flex max-h-[var(--map-inspector-max-height)] flex-col overflow-hidden rounded-panel border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] shadow-[var(--shadow-elevation-dock-side)] lg:inset-x-auto lg:right-[var(--topology-node-popover-right-inset)] lg:top-[var(--topology-node-popover-top)] lg:w-[var(--map-panel-width)]`}>
    <header className="flex shrink-0 items-start gap-3 border-b border-[color:var(--color-divider)] p-[var(--card-pad)]">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><p className="text-caption text-[color:var(--color-text-secondary)]">{t('eyebrow')}</p><p className="break-words text-body text-[color:var(--color-text-secondary)]">{selection.label}</p></div>
        <h2 id="gray-area-title" className="mt-1 text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{t('title')}</h2>
      </div>
      <CloseButton ref={closeRef} label={t('close')} onClick={onClose} />
    </header>
    <div ref={bodyRef} data-testid="gray-area-body" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-[var(--card-pad)]">
      {previousResultAt?<p className="mb-3 text-caption text-[color:var(--color-text-secondary)]">{t('continuation.previousResult',{time:previousResultAt})}</p>:null}
      {sourceAccess ? <div className="space-y-3 text-body" data-testid="gray-area-source-access">
        <p role="status">{t('sourceAccessRequired')}</p>
        <p className="break-words text-[color:var(--color-text-secondary)]">{t('sourceAccessHint',{path:sourceAccess.sourcePath})}</p>
        {sourceSelectionState?.error ? <p role="status">{t(sourceSelectionState.error)}</p>:null}
        <Button ref={sourcePickerRef} className="max-w-full" disabled={sourceSelectionState?.busy} aria-busy={sourceSelectionState?.busy} onClick={()=>void selectSource()}><span className="min-w-0 whitespace-normal">{t('selectSourceFolder')}</span></Button>
      </div> : proposal?.value && scanKey!==requestKey ? <div className="space-y-4" data-testid="gray-area-scope-preview" ref={mountResults} tabIndex={-1}><p className="text-body">{t('preview')}</p><p className="break-all rounded-card border border-[color:var(--color-divider)] p-3 font-mono text-caption">{proposal.value.sourcePath}</p><p className="text-caption text-[color:var(--color-text-secondary)]">{t('previewLimit',{limit:proposal.value.maxFiles})}</p><Button className="max-w-full" onClick={()=>void start()}><span className="min-w-0 whitespace-normal">{t('inspectFolder')}</span></Button></div> : !current && (!proposal || scanKey===requestKey) ? <div role="status" className="space-y-3 text-body text-[color:var(--color-text-secondary)]"><FileSearch size={ICON_SIZE.lg}/><p>{t('reading')}</p><p className="text-caption">{t('localOnly')}</p></div> : current?.snapshot && vaultPath ?
        <Findings onReady={mountResults} enabled={open} escapeFirstRef={escapeFirstRef} key={current.snapshot.snapshotId} snapshot={current.snapshot} sourceRoot={proposal?.value?.sourcePath} vaultPath={vaultPath} vaultHandle={vaultHandle} onFocus={onFocus} onPrepare={onPrepare} onPrepareImprovement={onPrepareImprovement} onAnalyze={onAnalyze} runtimeLabel={runtimeLabel} canAnalyze={canAnalyze} busyConversation={busyConversation} projectUid={selection.projectUid} onInspection={onInspection} onRefresh={() => setAttempt(n=>n+1)}/> :
        <div className="space-y-3 text-body text-[color:var(--color-text-secondary)]" data-testid={current?.error||proposal?.error ? 'gray-area-unavailable' : nativeRuntime ? 'gray-area-local-folder-required' : 'gray-area-web-limit'}>
          <p>{scopeUnavailable?t('continuation.narrowScope'):current?.error||proposal?.error ? String(current?.error??proposal?.error).includes('unsupported_platform')?t('platformLimit'):t('unavailable') : nativeRuntime ? t('localFolderRequired') : t('webLimit')}</p>
          {!scopeUnavailable?<p className="text-caption">{current?.error||proposal?.error ? t('connectHint') : t('webStillWorks')}</p>:null}
          {scopeUnavailable?<Button variant="outline" onClick={()=>onNarrowScope?onNarrowScope():onClose()}>{t('continuation.chooseScopeAction')}</Button>:current?.error||proposal?.error ? <Button variant="outline" onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={14}/>{t('retry')}</Button> : !nativeRuntime ? <Link href="/download" data-testid="gray-area-get-app" className={cn(controlClass({shape:'link',tone:'accent'}),'text-body')}>{t('getApp')}</Link> : null}
        </div>}
    </div>
  </Surface>;
}

function Findings({ snapshot,sourceRoot,vaultPath,vaultHandle,onFocus,onPrepare,onPrepareImprovement,onAnalyze,runtimeLabel,canAnalyze,busyConversation,projectUid,onInspection,onRefresh,escapeFirstRef,enabled,onReady }: { snapshot:GrayAreaSnapshot;sourceRoot?:string; vaultPath:string;vaultHandle?:FileSystemDirectoryHandle|null; onFocus:Props['onFocus']; onPrepare:Props['onPrepare'];onPrepareImprovement?:Props['onPrepareImprovement']; onAnalyze?:Props['onAnalyze']; runtimeLabel?:string;canAnalyze?:boolean;busyConversation?:boolean;projectUid?:string;onInspection?:Props['onInspection']; onRefresh:()=>void; escapeFirstRef:MutableRefObject<(()=>boolean)|null>;enabled:boolean;onReady:(node:HTMLDivElement|null)=>void }) {
  const t = useTranslations('grayArea');
  const history=useInvestigationHistory(vaultHandle);
  const [dismissed,setDismissed] = useState<Set<string>>(()=>new Set());
  const page = grayAreaCandidatePage(snapshot,dismissed);
  useEffect(()=>{onInspection?.(snapshot,page.total);},[onInspection,snapshot,page.total]);
  const candidates = page.candidates;
  const visible = candidates;
  const [expanded,setExpanded] = useState<string|null>(candidates[0]?.id ?? null);
  const [witness,setWitness] = useState<{candidateId:string;source:GrayAreaWitness}|null>(null);
  const sourceReturn=useRef<HTMLElement|null>(null);
  const [scopeOpen,setScopeOpen]=useState(false);
  useEffect(()=>{escapeFirstRef.current=witness?()=>{setWitness(null);return true;}:null;return()=>{escapeFirstRef.current=null;};},[escapeFirstRef,witness]);
  const [stale,setStale] = useState(false);
  const [busy,setBusy] = useState(false);
  const actionBusy=useRef(false);
  const [notice,setNotice] = useState<string|null>(null);
  const live = useRef(true);
  useEffect(()=>{live.current=enabled;return()=>{live.current=false;};},[enabled]);
  const guarded = async (action:()=>void|Promise<void>) => {
    if (stale || actionBusy.current) return;
    actionBusy.current=true;
    setBusy(true); setNotice(null);
    try {
      const current = await checkGrayAreaEvidence(vaultPath,snapshot);
      if (!live.current) return;
      if (!current) {setStale(true);setWitness(null);return;}
      await action();
    } catch { if(live.current){setStale(true);setWitness(null);} }
    finally {actionBusy.current=false;if(live.current)setBusy(false);}
  };
  const label = (slug:string|null) => snapshot.nodes.find(n=>n.slug===slug)?.title ?? slug ?? '';
  return <div ref={onReady} tabIndex={-1} role="group" aria-label={t('title')} className="space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]">
    <p className="text-body leading-body text-[color:var(--color-text-secondary)]">{t('boundary')}</p>
    {sourceRoot?<p className="break-all font-mono text-caption text-[color:var(--color-text-secondary)]">{sourceRoot}</p>:null}
    {stale ? <div ref={onReady} tabIndex={-1} role="status" className="space-y-3 rounded-card border border-[color:var(--color-divider)] p-[var(--card-pad)] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]"><p className="text-body">{t('stale')}</p><Button onClick={onRefresh} variant="outline">{t('refresh')}</Button></div> : null}
    {visible.length===0 ? <div role="status" className="space-y-2 py-4"><h3 className="text-body font-[var(--font-weight-strong)]">{dismissed.size ? t('foldedAll') : t('empty')}</h3><p className="text-caption text-[color:var(--color-text-secondary)]">{t('emptyLimit')}</p></div> : null}
    {visible.map(candidate=>{
      const active=expanded===candidate.id;
      const request=projectUid?buildGrayAreaInvestigation(snapshot,candidate,{projectUid,explicit:true}):null;
      const detailsId=`gray-area-${encodeURIComponent(candidate.id)}`;
      return <article key={candidate.id} data-testid={`gray-area-${candidate.kind}`} className="overflow-hidden rounded-card border border-[color:var(--color-divider)]">
        <RowButton size="md" tone="strong" hoverSurface="lift" aria-expanded={active} aria-controls={detailsId} onClick={()=>setExpanded(active?null:candidate.id)}>
          <span className="min-w-0 flex-1 text-left"><span className="block whitespace-normal break-words text-body-lg font-[var(--font-weight-strong)]">{label(candidate.slug)}{candidate.relatedSlug ? ` · ${label(candidate.relatedSlug)}` : ''}</span><span className="mt-1 block whitespace-normal text-caption text-[color:var(--color-text-secondary)]">{t(`kind.${candidate.kind}`)}</span></span><ChevronDown size={16} className="shrink-0"/>
        </RowButton>
        <Surface open={active} id={detailsId} motion="overlay" className="space-y-3 border-t border-[color:var(--color-divider)] p-3">
          <dl className="space-y-2">
            <Fact label={t('observed')} value={candidate.kind==='recorded-gap'?candidate.statement:candidate.kind==='missing-link'?t('importFact'):t('driftFact')} detail={candidate.kind==='missing-link'?candidate.statement:undefined}/>
            <Fact compact label={t('relevance')} value={t('pathRelevance',{path:formatRecordedPath(snapshot,candidate.path,label)})}/>
            <Fact unknown label={t('unknown')} value={t(candidate.currency==='recorded-unverified'?'recordedUnknown':candidate.kind==='missing-link'?'importUnknown':'driftUnknown')}/>
            <Fact compact label={t('nextRead')} value={t(candidate.kind==='recorded-gap'?'readGap':candidate.kind==='missing-link'?'readImport':'readDrift')}/>
          </dl>
          <div className="space-y-2">
            <p className="text-caption text-[color:var(--color-text-secondary)]">{t('source')}</p>
            {candidate.sourcePaths.length ? candidate.sourcePaths.map(path=>{
              const source=snapshot.witnesses.find(w=>w.path===path && w.status==='read');
              return source ? <RowButton key={path} className={styles.sourceRow} tone="secondary" hoverSurface="lift" size="sm" onClick={event=>{sourceReturn.current=event.currentTarget;void guarded(()=>setWitness({candidateId:candidate.id,source}));}} disabled={stale||busy}><FileSearch size={14} className="shrink-0"/><span className="min-w-0 flex-1 break-all text-left font-mono text-body leading-body">{path}:{source.actualRange?.startLine}–{source.actualRange?.endLine}</span><ArrowRight size={14} aria-hidden className="shrink-0"/></RowButton> : <p key={path} className="break-all text-body leading-body text-[color:var(--color-text-tertiary)]">{path} · {t('notCaptured')}</p>;
            }) : <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">{t('noExactPath')}</p>}
          </div>
          <SourceExcerpt source={witness?.candidateId===candidate.id?witness.source:null} measuredAt={snapshot.measuredAt} onClose={()=>setWitness(null)} onExited={()=>{if(sourceReturn.current?.isConnected)sourceReturn.current.focus();}}/>
          {projectUid&&history?<InvestigationResult runs={history.runs} snapshot={snapshot} candidate={candidate} projectUid={projectUid} disabled={stale||busy||Boolean(busyConversation)||!onPrepareImprovement||!sourceRoot} onPrepare={(request,row)=>void guarded(()=>onPrepareImprovement?.(request,row,snapshot,sourceRoot!))}/>:null}
          <div className="space-y-2" data-testid="gray-area-next-analysis">
            <p className="text-caption text-[color:var(--color-text-secondary)]">{busyConversation?t('continuation.busy'):runtimeLabel?t('continuation.transfer',{runtime:runtimeLabel}):t('continuation.agentUnavailable')}</p>
            {runtimeLabel?<p className="text-caption text-[color:var(--color-text-tertiary)]">{t('continuation.modelUnknown')}</p>:null}
            {request?<Disclosure summary={t('continuation.requestDetails')}><pre data-testid="gray-area-exact-request" className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words font-mono text-caption">{request}</pre></Disclosure>:null}
            <Button disabled={stale||busy||!canAnalyze||!onAnalyze||!request||!sourceRoot} onClick={()=>void guarded(()=>onAnalyze?.(request!,candidate,snapshot,sourceRoot!))}>{t('continuation.analyze')}</Button>
            <p className="text-caption text-[color:var(--color-text-secondary)]">{t('continuation.packetLimits')}</p>
          </div>
          <div className="space-y-2"><RowButton size="md" tone="accentOnTint" hoverSurface="lift" disabled={stale||busy} onClick={()=>void guarded(()=>onFocus(candidate))}><span className="min-w-0 flex-1 break-words">{t(candidate.kind==='missing-link'?'compareConcepts':'showPath')}</span><ArrowRight size={14} className="shrink-0"/></RowButton><div className="flex flex-wrap items-center gap-2"><Chip size="sm" className="min-w-0 max-w-full" tone="secondary" hoverSurface="lift" disabled={stale||busy} onClick={()=>void guarded(async()=>{const copied=await copyText(buildGrayAreaInvestigation(snapshot,candidate));setNotice(t(copied?'copied':'copyFailed'));})}><Copy size={14} className="shrink-0"/><span className="min-w-0 whitespace-normal break-words">{t('copy')}</span></Chip>
          <Chip size="sm" className="min-w-0 max-w-full" tone="secondary" hoverSurface="lift" disabled={stale||busy} onClick={()=>void guarded(()=>onPrepare(buildGrayAreaInvestigation(snapshot,candidate),candidate,snapshot,sourceRoot))}><span className="min-w-0 whitespace-normal break-words">{t('prepare')}</span></Chip></div></div>
          <p className="text-body leading-body text-[color:var(--color-text-secondary)]">{t('draftOnly')}</p>
          <div className="border-t border-[color:var(--color-divider)] pt-2"><button type="button" className={controlClass({shape:'link',size:'sm',tone:'secondary',hoverInk:'strong'})} onClick={()=>{const next=new Set([...dismissed,candidate.id]);setDismissed(next);setExpanded(grayAreaCandidatePage(snapshot,next).candidates[0]?.id??null);setWitness(null);}}>{t('dismiss')}</button></div>
        </Surface>
      </article>;
    })}
    {notice ? <p role="status" className="flex items-center gap-2 text-caption"><Check size={14}/>{notice}</p> : null}
    {busy ? <p role="status" className="text-caption">{t('checking')}</p> : null}
    {dismissed.size ? <RowButton tone="secondary" hoverSurface="lift" onClick={()=>setDismissed(new Set())}>{t('restore',{count:dismissed.size})}</RowButton> : null}
    <footer className="space-y-2 border-t border-[color:var(--color-divider)] pt-3 text-caption text-[color:var(--color-text-secondary)]">
      {history?.limited||history?.unavailable?<p role="status">{t('continuation.historyLimited')}</p>:null}
      <p>{t('candidateCoverage',{total:page.total,omitted:page.omitted})}</p>
      <RowButton tone="secondary" hoverSurface="lift" aria-expanded={scopeOpen} onClick={()=>setScopeOpen(!scopeOpen)}><span className="min-w-0 flex-1 break-words">{t('scopeDetails')}</span><ChevronDown size={14} className="shrink-0"/></RowButton>
      <Surface open={scopeOpen} motion="overlay" className="space-y-2">
        <p>{snapshot.coverage.importsAvailable?t('coverage',{count:snapshot.coverage.filesScanned,limit:snapshot.coverage.maxFiles}):t('scanUnavailable')}</p>
        {snapshot.basis.sourceRoots?.length ? <div className="space-y-1">
          <p id="gray-area-source-folders-label">{t('sourceFolders')}</p>
          <ul aria-labelledby="gray-area-source-folders-label" className="space-y-1">
            {snapshot.basis.sourceRoots.map(folder=><li key={folder} className="break-all font-mono">{folder&&folder!=='.'?folder:t('sourceFolderRoot')}</li>)}
          </ul>
        </div> : <p>{t('sourceFoldersUnknown')}</p>}
        {snapshot.coverage.importsLimited||snapshot.coverage.readsLimited ? <p>{t('limited')}</p>:null}
        <p>{t('scopeBoundary')}</p><p>{t('coverageUnknown')}</p><p>{t('sessionOnly')}</p><p>{t('prepareBoundary')}</p>
      </Surface>
    </footer>
  </div>;
}
function Fact({label,value,detail,compact=false,unknown=false}:{label:string;value:string;detail?:string;compact?:boolean;unknown?:boolean}) { return <div className={cn(styles.fact,compact&&styles.compactFact,unknown&&styles.unknown)}><dt className="text-caption text-[color:var(--color-text-tertiary)]">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-body leading-body text-[color:var(--color-text-secondary)]">{value}{detail ? <code className={styles.observedPath}>{detail}</code>:null}</dd></div>; }

function SourceExcerpt({source,measuredAt,onClose,onExited}:{source:GrayAreaWitness|null;measuredAt:string;onClose:()=>void;onExited:()=>void}) {
  const t=useTranslations('grayArea');const shown=useHeldValue(source,source?.path??'');
  const mountSource=useCallback((node:HTMLDivElement|null)=>{if(node&&source){node.focus();node.scrollIntoView({block:'nearest'});}},[source]);
  return <Surface open={Boolean(source)} onExited={onExited} motion="overlay" className="space-y-2 rounded-card border border-[color:var(--color-divider)] p-3" data-testid="gray-area-source-witness">
    <div tabIndex={-1} ref={mountSource} role="region" aria-label={t('source')} className="space-y-2 rounded-chip outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]">
      <div className="flex items-start gap-2"><p className="min-w-0 flex-1 break-all text-body leading-body font-mono">{shown?.path}:{shown?.actualRange?.startLine}–{shown?.actualRange?.endLine}</p><CloseButton label={t('closeSource')} onClick={onClose} /></div>
      <p className="text-caption text-[color:var(--color-text-secondary)]">{t('capturedSource',{time:measuredAt})}</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-body leading-body font-mono">{shown?.text}</pre><p className="break-all font-mono text-caption text-[color:var(--color-text-tertiary)]">SHA256 {shown?.fullFileSha256}</p>
    </div>
  </Surface>;
}
