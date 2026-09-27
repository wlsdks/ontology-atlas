'use client';

import { copyText } from '@/shared/lib/copy-text';
import { useHeldValue } from '@/shared/lib/use-presence';
import { Link } from '@/i18n/navigation';
import { checkGrayAreaEvidence, readGrayAreaEvidence, previewGrayAreaScope, type GrayAreaScopePreview, type GrayAreaSnapshot, type GrayAreaWitness } from '@/shared/lib/tauri-gray-area';
import { Button, IconButton, RowButton, Surface } from '@/shared/ui';
import { ArrowRight, Check, ChevronDown, Copy, FileSearch, RefreshCw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { grayAreaCandidatePage, formatRecordedPath, type GrayAreaCandidate } from '../model/candidates';
import { buildGrayAreaInvestigation } from '../model/investigation';
import styles from './GrayAreaInspector.module.css';

export interface GrayAreaSelection { projectSlug: string; uids: string[]; label: string; key: string }
interface Props {
  open: boolean;
  vaultPath: string | null;
  selection: GrayAreaSelection;
  onClose: () => void;
  onFocus: (candidate: GrayAreaCandidate) => void;
  onPrepare: (packet: string) => void;
  onExited?: () => void;
}

export function GrayAreaInspector({ open, vaultPath, selection, onClose, onFocus, onPrepare, onExited }: Props) {
  const t = useTranslations('grayArea');
  const [attempt, setAttempt] = useState(0);
  const [preview,setPreview] = useState<{key:string;value:GrayAreaScopePreview|null;error:string|null}|null>(null);
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
        if (!cancelled) setPreview({key:requestKey,value,error:null});
      } catch (error) {
        if (!cancelled) setPreview({key:requestKey,value:null,error:String(error)});
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
        <p className="text-caption text-[color:var(--color-text-secondary)]">{t('eyebrow')}</p>
        <h2 id="gray-area-title" className="mt-1 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{t('title')}</h2>
        <p className="mt-2 break-words text-body text-[color:var(--color-text-secondary)]">{selection.label}</p>
      </div>
      <IconButton ref={closeRef} label={t('close')} onClick={onClose} size="sm"><X size={16}/></IconButton>
    </header>
    <div ref={bodyRef} data-testid="gray-area-body" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-[var(--card-pad)]">
      {proposal?.value && scanKey!==requestKey ? <div className="space-y-4" data-testid="gray-area-scope-preview"><p className="text-body">{t('preview')}</p><p className="break-all rounded-card border border-[color:var(--color-divider)] p-3 font-mono text-caption">{proposal.value.sourcePath}</p><p className="text-caption text-[color:var(--color-text-secondary)]">{t('previewLimit',{limit:proposal.value.maxFiles})}</p><Button className="max-w-full" onClick={()=>void start()}><span className="min-w-0 whitespace-normal">{t('inspectFolder')}</span></Button></div> : !current && (!proposal || scanKey===requestKey) ? <div role="status" className="space-y-3 text-body text-[color:var(--color-text-secondary)]"><FileSearch size={20}/><p>{t('reading')}</p><p className="text-caption">{t('localOnly')}</p></div> : current?.snapshot && vaultPath ?
        <Findings onReady={mountResults} enabled={open} escapeFirstRef={escapeFirstRef} key={current.snapshot.snapshotId} snapshot={current.snapshot} vaultPath={vaultPath} onFocus={onFocus} onPrepare={onPrepare} onRefresh={() => setAttempt(n=>n+1)}/> :
        <div className="space-y-3 text-body text-[color:var(--color-text-secondary)]" data-testid={current?.error||proposal?.error ? 'gray-area-unavailable' : 'gray-area-web-limit'}>
          <p>{current?.error||proposal?.error ? String(current?.error??proposal?.error).includes('unsupported_platform')?t('platformLimit'):t('unavailable') : t('webLimit')}</p>
          <p className="text-caption">{current?.error||proposal?.error ? t('connectHint') : t('webStillWorks')}</p>
          {current?.error||proposal?.error ? <Button variant="outline" onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={14}/>{t('retry')}</Button> : <Link href="/download" data-testid="gray-area-get-app" className="inline-flex text-body underline underline-offset-4">{t('getApp')}</Link>}
        </div>}
    </div>
  </Surface>;
}

function Findings({ snapshot,vaultPath,onFocus,onPrepare,onRefresh,escapeFirstRef,enabled,onReady }: { snapshot:GrayAreaSnapshot; vaultPath:string; onFocus:Props['onFocus']; onPrepare:Props['onPrepare']; onRefresh:()=>void; escapeFirstRef:MutableRefObject<(()=>boolean)|null>;enabled:boolean;onReady:(node:HTMLDivElement|null)=>void }) {
  const t = useTranslations('grayArea');
  const [dismissed,setDismissed] = useState<Set<string>>(()=>new Set());
  const page = grayAreaCandidatePage(snapshot,dismissed);
  const candidates = page.candidates;
  const visible = candidates;
  const [expanded,setExpanded] = useState<string|null>(candidates[0]?.id ?? null);
  const [witness,setWitness] = useState<{candidateId:string;source:GrayAreaWitness}|null>(null);
  const sourceReturn=useRef<HTMLElement|null>(null);
  const [scopeOpen,setScopeOpen]=useState(false);
  useEffect(()=>{escapeFirstRef.current=witness?()=>{setWitness(null);return true;}:null;return()=>{escapeFirstRef.current=null;};},[escapeFirstRef,witness]);
  const [stale,setStale] = useState(false);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState<string|null>(null);
  const live = useRef(true);
  useEffect(()=>{live.current=enabled;return()=>{live.current=false;};},[enabled]);
  const guarded = async (action:()=>void|Promise<void>) => {
    if (stale || busy) return;
    setBusy(true); setNotice(null);
    try {
      const current = await checkGrayAreaEvidence(vaultPath,snapshot);
      if (!live.current) return;
      if (!current) {setStale(true);setWitness(null);return;}
      await action();
    } catch { if(live.current){setStale(true);setWitness(null);} }
    finally {if(live.current)setBusy(false);}
  };
  const label = (slug:string|null) => snapshot.nodes.find(n=>n.slug===slug)?.title ?? slug ?? '';
  return <div ref={onReady} tabIndex={-1} role="group" aria-label={t('title')} className="space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]">
    <p className="text-caption text-[color:var(--color-text-secondary)]">{t('boundary')}</p>
    {stale ? <div role="status" className="space-y-3 rounded-card border border-[color:var(--color-divider)] p-3"><p className="text-body">{t('stale')}</p><Button onClick={onRefresh} variant="outline">{t('refresh')}</Button></div> : null}
    {visible.length===0 ? <div role="status" className="space-y-2 py-4"><h3 className="text-body font-[var(--font-weight-strong)]">{dismissed.size ? t('foldedAll') : t('empty')}</h3><p className="text-caption text-[color:var(--color-text-secondary)]">{t('emptyLimit')}</p></div> : null}
    {visible.map(candidate=>{
      const active=expanded===candidate.id;
      return <article key={candidate.id} data-testid={`gray-area-${candidate.kind}`} className="overflow-hidden rounded-card border border-[color:var(--color-divider)]">
        <RowButton tone="strong" hoverSurface="lift" aria-expanded={active} aria-controls={`gray-area-${candidate.kind}-${candidate.slug.replaceAll('/','-')}`} onClick={()=>setExpanded(active?null:candidate.id)}>
          <span className="min-w-0 flex-1 text-left"><span className="block text-caption text-[color:var(--color-text-secondary)]">{t(`kind.${candidate.kind}`)}</span><span className="mt-1 block whitespace-normal break-words text-body font-[var(--font-weight-strong)]">{label(candidate.slug)}{candidate.relatedSlug ? ` · ${label(candidate.relatedSlug)}` : ''}</span></span><ChevronDown size={16} className="shrink-0"/>
        </RowButton>
        <Surface open={active} id={`gray-area-${candidate.kind}-${candidate.slug.replaceAll('/','-')}`} motion="overlay" className="space-y-3 border-t border-[color:var(--color-divider)] p-3">
          <dl className="space-y-3">
            <Fact label={t('observed')} value={candidate.kind==='recorded-gap'?candidate.statement:candidate.kind==='missing-link'?`${t('importFact')}\n${candidate.statement}`:t('driftFact')}/>
            <Fact label={t('relevance')} value={t('pathRelevance',{path:formatRecordedPath(snapshot,candidate.path,label)})}/>
            <Fact label={t('unknown')} value={t(candidate.currency==='recorded-unverified'?'recordedUnknown':candidate.kind==='missing-link'?'importUnknown':'driftUnknown')}/>
            <Fact label={t('nextRead')} value={t(candidate.kind==='recorded-gap'?'readGap':candidate.kind==='missing-link'?'readImport':'readDrift')}/>
          </dl>
          <div className="space-y-2">
            <p className="text-caption text-[color:var(--color-text-secondary)]">{t('source')}</p>
            {candidate.sourcePaths.length ? candidate.sourcePaths.map(path=>{
              const source=snapshot.witnesses.find(w=>w.path===path && w.status==='read');
              return source ? <RowButton key={path} tone="secondary" hoverSurface="lift" size="sm" onClick={event=>{sourceReturn.current=event.currentTarget;void guarded(()=>setWitness({candidateId:candidate.id,source}));}} disabled={stale||busy}><FileSearch size={14} className="shrink-0"/><span className="min-w-0 break-all text-left font-mono text-caption">{path}:{source.actualRange?.startLine}–{source.actualRange?.endLine}</span></RowButton> : <p key={path} className="break-all text-caption text-[color:var(--color-text-tertiary)]">{path} · {t('notCaptured')}</p>;
            }) : <p className="text-caption text-[color:var(--color-text-tertiary)]">{t('noExactPath')}</p>}
          </div>
          <SourceExcerpt source={witness?.candidateId===candidate.id?witness.source:null} measuredAt={snapshot.measuredAt} onClose={()=>setWitness(null)} onExited={()=>{if(sourceReturn.current?.isConnected)sourceReturn.current.focus();}}/>
          <div className="space-y-2"><RowButton tone="accentOnTint" hoverSurface="lift" disabled={stale||busy} onClick={()=>void guarded(()=>onFocus(candidate))}><span className="min-w-0 flex-1 break-words">{t(candidate.kind==='missing-link'?'compareConcepts':'showPath')}</span><ArrowRight size={14} className="shrink-0"/></RowButton><RowButton tone="secondary" hoverSurface="lift" disabled={stale||busy} onClick={()=>void guarded(async()=>{const copied=await copyText(buildGrayAreaInvestigation(snapshot,candidate));setNotice(t(copied?'copied':'copyFailed'));})}><Copy size={14} className="shrink-0"/><span className="min-w-0 break-words">{t('copy')}</span></RowButton></div>
          <RowButton tone="secondary" hoverSurface="lift" disabled={stale||busy} onClick={()=>void guarded(()=>onPrepare(buildGrayAreaInvestigation(snapshot,candidate)))}>{t('prepare')}</RowButton>
          <p className="text-caption text-[color:var(--color-text-tertiary)]">{t('draftOnly')}</p>
          <RowButton tone="secondary" hoverSurface="lift" onClick={()=>{const next=new Set([...dismissed,candidate.id]);setDismissed(next);setExpanded(grayAreaCandidatePage(snapshot,next).candidates[0]?.id??null);setWitness(null);}}>{t('dismiss')}</RowButton>
        </Surface>
      </article>;
    })}
    {notice ? <p role="status" className="flex items-center gap-2 text-caption"><Check size={14}/>{notice}</p> : null}
    {busy ? <p role="status" className="text-caption">{t('checking')}</p> : null}
    {dismissed.size ? <RowButton tone="secondary" hoverSurface="lift" onClick={()=>setDismissed(new Set())}>{t('restore',{count:dismissed.size})}</RowButton> : null}
    <footer className="space-y-2 border-t border-[color:var(--color-divider)] pt-3 text-caption text-[color:var(--color-text-secondary)]">
      <p>{t('candidateCoverage',{total:page.total,omitted:page.omitted})}</p>
      <RowButton tone="secondary" hoverSurface="lift" aria-expanded={scopeOpen} onClick={()=>setScopeOpen(!scopeOpen)}><span className="min-w-0 flex-1 break-words">{t('scopeDetails')}</span><ChevronDown size={14} className="shrink-0"/></RowButton>
      <Surface open={scopeOpen} motion="overlay" className="space-y-2">
        <p>{snapshot.coverage.importsAvailable?t('coverage',{count:snapshot.coverage.filesScanned,limit:snapshot.coverage.maxFiles}):t('scanUnavailable')}</p>
        {snapshot.coverage.importsLimited||snapshot.coverage.readsLimited ? <p>{t('limited')}</p>:null}
        <p>{t('scopeBoundary')}</p><p>{t('coverageUnknown')}</p><p>{t('sessionOnly')}</p><p>{t('prepareBoundary')}</p>
      </Surface>
    </footer>
  </div>;
}
function Fact({label,value}:{label:string;value:string}) { return <div><dt className="text-caption text-[color:var(--color-text-tertiary)]">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-body leading-[var(--leading-body)] text-[color:var(--color-text-secondary)]">{value}</dd></div>; }

function SourceExcerpt({source,measuredAt,onClose,onExited}:{source:GrayAreaWitness|null;measuredAt:string;onClose:()=>void;onExited:()=>void}) {
  const t=useTranslations('grayArea');const shown=useHeldValue(source,source?.path??'');
  const mountSource=useCallback((node:HTMLDivElement|null)=>{if(node&&source){node.focus();node.scrollIntoView({block:'nearest'});}},[source]);
  return <Surface open={Boolean(source)} onExited={onExited} motion="overlay" className="space-y-2 rounded-card border border-[color:var(--color-divider)] p-3" data-testid="gray-area-source-witness">
    <div tabIndex={-1} ref={mountSource} role="region" aria-label={t('source')} className="space-y-2 rounded-chip outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]">
      <div className="flex items-start gap-2"><p className="min-w-0 flex-1 break-all text-caption font-mono">{shown?.path}:{shown?.actualRange?.startLine}–{shown?.actualRange?.endLine}</p><IconButton size="sm" label={t('closeSource')} onClick={onClose}><X size={14}/></IconButton></div>
      <p className="text-caption text-[color:var(--color-text-secondary)]">{t('capturedSource',{time:measuredAt})}</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-caption font-mono">{shown?.text}</pre><p className="break-all font-mono text-caption text-[color:var(--color-text-tertiary)]">SHA256 {shown?.fullFileSha256}</p>
    </div>
  </Surface>;
}
