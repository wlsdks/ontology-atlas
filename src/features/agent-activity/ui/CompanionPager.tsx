import {ChevronLeft,ChevronRight} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {IconButton} from '@/shared/ui';
import {ICON_SIZE} from '@/shared/ui/icon-size';
export function CompanionPager({index,count,onChange,label,disabled=false}:{index:number;count:number;onChange:(index:number)=>void;label:string;disabled?:boolean}){
 const t=useTranslations('companion.pages');
 return <nav className="flex shrink-0 items-center justify-center gap-3" aria-label={label}>
  <IconButton className="atlas-touch-floor atlas-touch-floor-wide" label={t('previous')} disabled={disabled||index<=0} onClick={()=>onChange(index-1)}><ChevronLeft size={ICON_SIZE.sm}/></IconButton>
  <span className="text-label text-[color:var(--color-text-secondary)]" aria-live="polite">{t('position',{current:count?index+1:0,total:count})}</span>
  <IconButton className="atlas-touch-floor atlas-touch-floor-wide" label={t('next')} disabled={disabled||index>=count-1} onClick={()=>onChange(index+1)}><ChevronRight size={ICON_SIZE.sm}/></IconButton>
 </nav>;
}
