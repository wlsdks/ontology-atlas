import { resolveNodeDocument, type KnowledgeGraphNode } from '@/entities/knowledge-graph';
import type { VaultDoc } from '@/entities/docs-vault';
import { GrayAreaInspector, latestScopedInvestigation, useInvestigationHistory, type GrayAreaCandidate, type GrayAreaSelection } from '@/features/gray-area';
import { focusMapCanvasWhenReady } from '@/shared/lib/focus-map-canvas';
import { armMapLayoutMorph } from '@/shared/lib/map-layout-morph-store';
import { useLatestRef } from '@/shared/lib/use-latest-ref';
import { checkGrayAreaEvidence, type GrayAreaSnapshot } from '@/shared/lib/tauri-gray-area';
import type { InvestigationSendGuard } from '@/features/acp-session';
import { useTranslations } from 'next-intl';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { selectTopologyPathRouteState, type HomeRouteState } from '../url-state';
import { applyMapView } from '../use-map-view-sync';

interface Options {
  docs: VaultDoc[];
  nodes: KnowledgeGraphNode[];
  selectedSlug: string | null;
  memberSlugs: ReadonlySet<string> | null;
  vaultPath: string | null;
  vaultHandle?:FileSystemDirectoryHandle|null;
  vaultLoaded?: boolean;
  locale: string;
  routeState: HomeRouteState;
  setRouteState: (updater: Partial<HomeRouteState> | ((current:HomeRouteState)=>HomeRouteState))=>void;
  onOpen:()=>void;
  onPrepare:(packet:string,contextLabel:string,basis?:{snapshot:GrayAreaSnapshot;projectUid:string;sourceRoot:string})=>void;
  onChooseScope?:()=>void;
  onEmptyVault?:()=>void;
  onConnectVault?:()=>void;
  runtime?:{id:string;label:string}|null;
  busy?:boolean;
  onAnalyze?:(text:string,snapshot:GrayAreaSnapshot,projectUid:string,guard:InvestigationSendGuard,sourceRoot:string,label:string)=>void;
}
function routeKey(route:HomeRouteState){return JSON.stringify([route.selectedSlug,route.pathSourceSlug,route.pathTargetSlug]);}
export function useTopologyGrayArea({docs,nodes,selectedSlug,memberSlugs,vaultPath,vaultHandle,vaultLoaded=true,locale,routeState,setRouteState,onOpen,onPrepare,onChooseScope,onEmptyVault,onConnectVault,runtime,busy,onAnalyze}:Options){
  const t=useTranslations('grayArea');
  const idBySlug=useMemo(()=>new Map(nodes.flatMap(n=>{const slug=resolveNodeDocument(n).ownSlug;return slug?[[slug,n.id] as const]:[];})),[nodes]);
  const memberIdentities=useMemo(()=>{
    if(!memberSlugs)return null;
    const identities=new Map<string,string>();
    for(const doc of docs){
      if(typeof doc.frontmatter.uid!=='string')continue;
      identities.set(doc.slug,doc.frontmatter.uid);
      const id=idBySlug.get(doc.slug);if(id)identities.set(id,doc.frontmatter.uid);
    }
    return [...new Set([...memberSlugs].map(slug=>identities.get(slug)??`unresolved:${slug}`))].sort();
  },[docs,idBySlug,memberSlugs]);
  const scopeKey=JSON.stringify([routeState.constellationIntent,memberIdentities]);
  const manifestKey=docs.map(d=>`${d.slug}:${d.mtime??d.updatedAt}`).join('|');
  const selected=useMemo(()=>{
    const slugs=memberSlugs?.size?memberSlugs:new Set(selectedSlug?[selectedSlug]:[]);
    const projects=docs.filter(d=>d.frontmatter.kind==='project');
    const matches=docs.filter(d=>(slugs.has(d.slug)||slugs.has(idBySlug.get(d.slug)??''))&&typeof d.frontmatter.uid==='string');
    if(!slugs.size&&projects.length===1&&typeof projects[0].frontmatter.uid==='string')matches.push(projects[0]);
    if(!matches.length)return null;
    const domains=new Set(matches.map(d=>d.frontmatter.kind==='domain'?d.slug:d.frontmatter.domain).filter((s):s is string=>typeof s==='string'));
    const eligible=projects.filter(p=>matches.some(d=>d.slug===p.slug)||[...(Array.isArray(p.frontmatter.domains)?p.frontmatter.domains:[])].some(d=>domains.has(String(d))));
    const project=eligible.length===1?eligible[0]:projects.length===1?projects[0]:null;
    if(!project)return null;
    const uids=matches.map(d=>String(d.frontmatter.uid)).sort();
    const label=matches.length===1?String(matches[0].frontmatter[`display_${locale}`]??matches[0].title):t('selectionCount',{count:matches.length});
    return {projectSlug:project.slug,projectUid:typeof project.frontmatter.uid==='string'?project.frontmatter.uid:undefined,uids,label,key:JSON.stringify([vaultPath,project.slug,uids])} satisfies GrayAreaSelection;
  },[docs,idBySlug,memberSlugs,selectedSlug,vaultPath,locale,t]);
  const [active,setActive]=useState<GrayAreaSelection|null>(null);
  const [open,setOpen]=useState(false);
  const trigger=useRef<HTMLElement|null>(null);
  const inspectionEpoch=useRef(0);
  const currentVault=useLatestRef(vaultPath);
  const expectedFocus=useRef<string|null>(null);
  const priorRoute=useRef(routeKey(routeState));
  const priorVault=useRef(vaultPath);
  const priorScope=useRef(scopeKey);
  useLayoutEffect(()=>{
    const next=routeKey(routeState);
    if(priorVault.current!==vaultPath || priorScope.current!==scopeKey || (priorRoute.current!==next&&expectedFocus.current!==next)){inspectionEpoch.current+=1;setOpen(false);}
    priorVault.current=vaultPath;priorScope.current=scopeKey;priorRoute.current=next;expectedFocus.current=null;
  },[routeState,vaultPath,scopeKey]);
  const close=useCallback(()=>{inspectionEpoch.current+=1;setOpen(false);},[]);
  const launch=useCallback(()=>{
    if(!selected)return;
    trigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    inspectionEpoch.current+=1;
    setActive({...selected,key:JSON.stringify([selected.key,inspectionEpoch.current])});setOpen(true);onOpen();
  },[selected,onOpen]);
  const focus=useCallback((candidate:GrayAreaCandidate)=>{
    armMapLayoutMorph();
    applyMapView(null);
    setRouteState(current=>{
      const path=candidate.kind==='missing-link'&&candidate.relatedSlug?[candidate.slug,candidate.relatedSlug]:candidate.path;
      const flat={...current,mapView:null};
      const next=path.length>1?selectTopologyPathRouteState(flat,{sourceSlug:idBySlug.get(path[0])??path[0],targetSlug:idBySlug.get(path.at(-1)!)??path.at(-1)!}):{...flat,selectedSlug:idBySlug.get(path[0]??candidate.slug)??candidate.slug,analysisMode:'overview' as const,pathSourceSlug:null,pathTargetSlug:null};
      expectedFocus.current=routeKey(next);return next;
    });
  },[idBySlug,setRouteState]);
  const selection=useMemo(()=>active?{...active,key:JSON.stringify([active.key,manifestKey])}:null,[active,manifestKey]);
  const [inspectionStatus,setInspectionStatus]=useState<{key:string;time:string;count:number}|null>(null);
  const receiveInspection=useCallback((snapshot:GrayAreaSnapshot,count:number)=>{
    const key=JSON.stringify([vaultPath,snapshot.basis.projectSlug,[...snapshot.basis.selectedUids].sort()]);
    setInspectionStatus(current=>current?.key===key&&current.time===snapshot.measuredAt&&current.count===count?current:{key,time:snapshot.measuredAt,count});
  },[vaultPath]);
  const observed=selected&&inspectionStatus?.key===selected.key?inspectionStatus:null;
  const history=useInvestigationHistory(vaultLoaded?vaultHandle:null);
  const previous=selected?.projectUid&&history?latestScopedInvestigation(history.runs,{projectUid:selected.projectUid,projectSlug:selected.projectSlug,uids:selected.uids}):null;
  const subject=!vaultLoaded?t('continuation.localFolderAction'):selected?.label??t(docs.length?'continuation.chooseScopeAction':'continuation.emptyVaultAction');
  const description=!vaultLoaded?t('localFolderRequired'):previous?t('continuation.previousResult',{time:previous.createdAt}):observed?`${t('continuation.knownSuggestions',{count:observed.count})} · ${observed.time}`:t(selected?'continuation.notInspected':docs.length?'continuation.chooseScope':'continuation.emptyVault');
  const openContinuation=!vaultLoaded?()=>onConnectVault?.():selected?launch:docs.length?()=>onChooseScope?.():()=>onEmptyVault?.();
  return {
    open,
    action:selected?{label:t('entry'),onOpen:launch}:undefined,
    continuationAction:{label:t('continuation.entry'),subject,description,countLabel:previous?t('continuation.previousResultAction'):observed?t('continuation.questionCount',{count:observed.count}):undefined,onOpen:openContinuation},
    inspector:selection?<GrayAreaInspector open={open} vaultPath={vaultPath} vaultHandle={vaultHandle} selection={selection} onClose={close} onFocus={focus} onNarrowScope={()=>{close();onChooseScope?.();}}
    runtimeLabel={runtime?.label} canAnalyze={Boolean(runtime&&onAnalyze&&!busy)} busyConversation={busy}
    onInspection={receiveInspection} previousResultAt={previous?.createdAt}
    onAnalyze={runtime&&onAnalyze&&selection.projectUid?(text,candidate,snapshot,sourceRoot)=>{
      if(!vaultPath||busy)return;
      const epoch=inspectionEpoch.current;
      const guard:InvestigationSendGuard={runtimeId:runtime.id,revalidate:async()=>{
        if(inspectionEpoch.current!==epoch||currentVault.current!==vaultPath)return false;
        const fresh=await checkGrayAreaEvidence(vaultPath,snapshot);
        return fresh&&inspectionEpoch.current===epoch&&currentVault.current===vaultPath;
      }};
      const label=[candidate.slug,candidate.relatedSlug].filter(Boolean).map(slug=>{
        const doc=docs.find(item=>item.slug===slug);return String(doc?.frontmatter[`display_${locale}`]??doc?.title??slug);
      }).join(' · ');
      setOpen(false);onAnalyze(text,snapshot,selection.projectUid!,guard,sourceRoot,label);
    }:undefined} onPrepare={(packet,candidate,snapshot,sourceRoot)=>{
      const subject=[candidate.slug,candidate.relatedSlug].filter((slug):slug is string=>Boolean(slug)).map(slug=>{
        const doc=docs.find(d=>d.slug===slug);return String(doc?.frontmatter[`display_${locale}`]??doc?.title??slug);
      }).join(' · ');
      const question=t(candidate.kind==='missing-link'?'readImport':candidate.kind==='changed-source'?'readDrift':'readGap');
      const basis=snapshot&&sourceRoot&&selection.projectUid?{snapshot,projectUid:selection.projectUid,sourceRoot}:undefined;
      setOpen(false);onPrepare(`${t('draftLead',{subject,question})}\n\nScope:\n\n${packet}`,t('draftContext',{subject}),basis);
    }} onPrepareImprovement={(request,candidate,snapshot,sourceRoot)=>{
      if(!selection.projectUid||!sourceRoot)return;
      const subject=[candidate.slug,candidate.relatedSlug].filter(Boolean).map(slug=>{
        const doc=docs.find(item=>item.slug===slug);return String(doc?.frontmatter[`display_${locale}`]??doc?.title??slug);
      }).join(' · ');
      setOpen(false);onPrepare(request,t('draftContext',{subject}),{snapshot,projectUid:selection.projectUid,sourceRoot});
    }} onExited={()=>{if(trigger.current?.isConnected)trigger.current.focus();else {const entry=document.querySelector<HTMLElement>('[data-testid="map-detail-panel-more-menu-trigger"]');if(entry)entry.focus();else focusMapCanvasWhenReady();}}}/>:null,
  };
}
