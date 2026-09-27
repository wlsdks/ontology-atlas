import { resolveNodeDocument, type KnowledgeGraphNode } from '@/entities/knowledge-graph';
import type { VaultDoc } from '@/entities/docs-vault';
import { GrayAreaInspector, type GrayAreaCandidate, type GrayAreaSelection } from '@/features/gray-area';
import { focusMapCanvasWhenReady } from '@/shared/lib/focus-map-canvas';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { selectTopologyPathRouteState, type HomeRouteState } from '../url-state';

interface Options {
  docs: VaultDoc[];
  nodes: KnowledgeGraphNode[];
  selectedSlug: string | null;
  memberSlugs: ReadonlySet<string> | null;
  vaultPath: string | null;
  locale: string;
  routeState: HomeRouteState;
  setRouteState: (updater: Partial<HomeRouteState> | ((current:HomeRouteState)=>HomeRouteState))=>void;
  onOpen:()=>void;
  onPrepare:(packet:string)=>void;
}
function routeKey(route:HomeRouteState){return JSON.stringify([route.selectedSlug,route.pathSourceSlug,route.pathTargetSlug]);}
export function useTopologyGrayArea({docs,nodes,selectedSlug,memberSlugs,vaultPath,locale,routeState,setRouteState,onOpen,onPrepare}:Options){
  const t=useTranslations('grayArea');
  const idBySlug=useMemo(()=>new Map(nodes.flatMap(n=>{const slug=resolveNodeDocument(n).ownSlug;return slug?[[slug,n.id] as const]:[];})),[nodes]);
  const manifestKey=docs.map(d=>`${d.slug}:${d.mtime??d.updatedAt}`).join('|');
  const selected=useMemo(()=>{
    const slugs=memberSlugs?.size?memberSlugs:new Set(selectedSlug?[selectedSlug]:[]);
    const matches=docs.filter(d=>(slugs.has(d.slug)||slugs.has(idBySlug.get(d.slug)??''))&&typeof d.frontmatter.uid==='string');
    if(!matches.length)return null;
    const projects=docs.filter(d=>d.frontmatter.kind==='project');
    const domains=new Set(matches.map(d=>d.frontmatter.kind==='domain'?d.slug:d.frontmatter.domain).filter((s):s is string=>typeof s==='string'));
    const eligible=projects.filter(p=>matches.some(d=>d.slug===p.slug)||[...(Array.isArray(p.frontmatter.domains)?p.frontmatter.domains:[])].some(d=>domains.has(String(d))));
    const project=eligible.length===1?eligible[0]:projects.length===1?projects[0]:null;
    if(!project)return null;
    const uids=matches.map(d=>String(d.frontmatter.uid)).sort();
    const label=matches.length===1?String(matches[0].frontmatter[`display_${locale}`]??matches[0].title):t('selectionCount',{count:matches.length});
    return {projectSlug:project.slug,uids,label,key:JSON.stringify([vaultPath,project.slug,uids])} satisfies GrayAreaSelection;
  },[docs,idBySlug,memberSlugs,selectedSlug,vaultPath,locale,t]);
  const [active,setActive]=useState<GrayAreaSelection|null>(null);
  const [open,setOpen]=useState(false);
  const trigger=useRef<HTMLElement|null>(null);
  const inspectionEpoch=useRef(0);
  const expectedFocus=useRef<string|null>(null);
  const priorRoute=useRef(routeKey(routeState));
  const priorVault=useRef(vaultPath);
  useEffect(()=>{
    const next=routeKey(routeState);
    if(priorVault.current!==vaultPath || (priorRoute.current!==next&&expectedFocus.current!==next))setOpen(false);
    priorVault.current=vaultPath;priorRoute.current=next;expectedFocus.current=null;
  },[routeState,vaultPath]);
  const close=useCallback(()=>setOpen(false),[]);
  const launch=useCallback(()=>{
    if(!selected)return;
    trigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    inspectionEpoch.current+=1;
    setActive({...selected,key:JSON.stringify([selected.key,inspectionEpoch.current])});setOpen(true);onOpen();
  },[selected,onOpen]);
  const focus=useCallback((candidate:GrayAreaCandidate)=>{
    setRouteState(current=>{
      const path=candidate.kind==='missing-link'&&candidate.relatedSlug?[candidate.slug,candidate.relatedSlug]:candidate.path;
      const next=path.length>1?selectTopologyPathRouteState(current,{sourceSlug:idBySlug.get(path[0])??path[0],targetSlug:idBySlug.get(path.at(-1)!)??path.at(-1)!}):{...current,selectedSlug:idBySlug.get(path[0]??candidate.slug)??candidate.slug,analysisMode:'overview' as const,pathSourceSlug:null,pathTargetSlug:null};
      expectedFocus.current=routeKey(next);return next;
    });
  },[idBySlug,setRouteState]);
  const selection=useMemo(()=>active?{...active,key:JSON.stringify([active.key,manifestKey])}:null,[active,manifestKey]);
  return {
    open,
    action:selected?{label:t('entry'),onOpen:launch}:undefined,
    inspector:selection?<GrayAreaInspector open={open} vaultPath={vaultPath} selection={selection} onClose={close} onFocus={focus} onPrepare={packet=>{setOpen(false);onPrepare(packet);}} onExited={()=>{if(trigger.current?.isConnected)trigger.current.focus();else {const entry=document.querySelector<HTMLElement>('[data-testid="map-detail-panel-more-menu-trigger"]');if(entry)entry.focus();else focusMapCanvasWhenReady();}}}/>:null,
  };
}
