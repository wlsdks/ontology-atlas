export interface ReportedPlan {
  total:number;
  done:number;
  replanned:boolean;
}

export function readReportedPlan(previous:ReportedPlan|null,entries:unknown):ReportedPlan|null {
  if(!Array.isArray(entries)||entries.length===0||entries.length>100)return null;
  let done=0;
  for(const entry of entries) {
    if(!entry||typeof entry!=='object'||Array.isArray(entry))return null;
    const row=entry as Record<string,unknown>;
    if(typeof row.content!=='string'||!row.content.trim()||row.content.length>2000
      ||!['high','medium','low'].includes(String(row.priority))
      ||!['pending','in_progress','completed'].includes(String(row.status)))return null;
    if(row.status==='completed')done+=1;
  }
  return {total:entries.length,done,replanned:Boolean(previous&&(previous.replanned||previous.total!==entries.length))};
}
