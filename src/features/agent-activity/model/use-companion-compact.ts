'use client';
import {useSyncExternalStore} from 'react';
const query='(max-height: 650px)';
const subscribe=(listener:()=>void)=>{const media=window.matchMedia(query);media.addEventListener('change',listener);return()=>media.removeEventListener('change',listener);};
const snapshot=()=>window.matchMedia(query).matches;
const server=()=>false;
export function useCompanionCompact(){return useSyncExternalStore(subscribe,snapshot,server);}
