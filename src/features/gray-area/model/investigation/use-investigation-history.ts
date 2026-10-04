'use client';

import { useEffect, useMemo, useState } from 'react';
import { readAnalysisHistory, type AnalysisRun } from '@/entities/analysis-record';

export function useInvestigationHistory(handle:FileSystemDirectoryHandle|null|undefined) {
  // Previous React state may survive on an alternate fiber. Keep only an opaque
  // scope token there, so historical UI state cannot retain an earlier folder.
  const scope=useMemo(()=>handle?Symbol('investigation-history'):null,[handle]);
  const [state,setState]=useState<{scope:symbol;runs:AnalysisRun[];limited:boolean;unavailable:boolean}|null>(null);
  useEffect(()=>{
    if(!handle||!scope)return;
    let closed=false;
    let sequence=0;
    const load=async()=>{
      const ticket=++sequence;
      try {
        const page=await readAnalysisHistory(handle,{limit:30});
        if(!closed&&ticket===sequence)setState({scope,runs:page.records.filter((record):record is AnalysisRun=>record.recordType==='run'),limited:page.nextCursor!==null,unavailable:page.problems.length>0});
      } catch {if(!closed&&ticket===sequence)setState({scope,runs:[],limited:false,unavailable:true});}
    };
    void load();window.addEventListener('atlas-analysis-records-changed',load);
    return()=>{closed=true;window.removeEventListener('atlas-analysis-records-changed',load);};
  },[handle,scope]);
  return handle&&state?.scope===scope?state:null;
}
