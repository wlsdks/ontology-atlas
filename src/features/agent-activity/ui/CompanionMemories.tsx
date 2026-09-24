'use client';
import {useEffect,useRef,useState} from 'react';
import {BookOpen,Leaf,RotateCcw,Star,Trash2} from 'lucide-react';
import {useLocale,useTranslations} from 'next-intl';
import {useLocalVault} from '@/entities/vault-session';
import {Button,IconButton,Textarea} from '@/shared/ui';
import {SegmentedControl} from '@/shared/ui/segmented-control';
import {ICON_SIZE} from '@/shared/ui/icon-size';
import {useCompanionJournal} from '../model/use-companion-journal';
import {KEEPSAKES,MEMORY_KINDS,MEMORY_LIMIT,type Keepsake,type MemoryKind} from '../model/companion-journal';
import {CompanionPager} from './CompanionPager';
import styles from './companion-home.module.css';
import {useCompanionCompact} from '../model/use-companion-compact';
const OBJECTS={book:BookOpen,plant:Leaf,star:Star};
export type MemoryDraft={kind:MemoryKind;keepsake:Keepsake;note:string};
/** Original storage remains intact; a page is a view, never an eviction policy. */
export function CompanionMemories({draft,onDraft}:{draft:MemoryDraft;onDraft:(draft:MemoryDraft)=>void}){
 const compact=useCompanionCompact();
 const t=useTranslations('companion');const locale=useLocale();const vault=useLocalVault();const store=useCompanionJournal();
 const memories=store.journal.memories;const [view,setView]=useState<'write'|'saved'>(memories.length?'saved':'write');
 const [writeStep,setWriteStep]=useState(0);const [reading,setReading]=useState<{id:string|null;offset:number}>({id:null,offset:0});const [error,setError]=useState(false);const [saved,setSaved]=useState(false);
 const [confirmation,setConfirmation]=useState<'reset'|string|null>(null);
 const noteRef=useRef<HTMLTextAreaElement>(null);const writeRef=useRef<HTMLButtonElement>(null);const focusAfterMutation=useRef(false);const cancelRef=useRef<HTMLButtonElement>(null);const removeRef=useRef<HTMLButtonElement>(null);const resetRef=useRef<HTMLButtonElement>(null);const restoreRef=useRef<'reset'|'remove'|null>(null);
 useEffect(()=>{if(confirmation)cancelRef.current?.focus();else if(restoreRef.current){(restoreRef.current==='reset'?resetRef:removeRef).current?.focus();restoreRef.current=null;}else if(focusAfterMutation.current){(view==='write'?noteRef:memories.length?removeRef:writeRef).current?.focus();focusAfterMutation.current=false;}},[confirmation,view,memories.length]);
 const chunk=compact?80:120;
 const pages=memories.flatMap(entry=>{const chars=Array.from(entry.note);return Array.from({length:Math.ceil(chars.length/chunk)},(_,i)=>({entry,offset:i*chunk,text:chars.slice(i*chunk,(i+1)*chunk).join('')}));});
 const index=Math.max(0,pages.findIndex(item=>item.entry.id===reading.id&&reading.offset>=item.offset&&reading.offset<item.offset+chunk));
 const selected=pages[index];const entry=selected?.entry;
 const save=()=>{if(!draft.note.trim())return;const ok=store.save({id:crypto.randomUUID(),kind:draft.kind,keepsake:draft.keepsake,note:draft.note.trim(),folder:(vault.status==='loaded'?vault.handle?.name??'':'').slice(0,160),createdAt:Date.now()});setError(!ok);setSaved(ok);if(ok){onDraft({...draft,note:''});noteRef.current?.focus();}};
 const cancel=()=>{restoreRef.current=confirmation==='reset'?'reset':'remove';setConfirmation(null);};
 const confirm=()=>{const ok=confirmation==='reset'?store.reset():store.remove(confirmation!);setError(!ok);if(ok){focusAfterMutation.current=true;setConfirmation(null);setReading({id:null,offset:0});setSaved(false);}};
 const ObjectIcon=entry?OBJECTS[entry.keepsake]:BookOpen;
 return <section className={styles.fixedPanel} aria-label={t('memories')} data-testid="companion-memory-panel" data-compact={compact}>
  <SegmentedControl ariaLabel={t('memorySections')} value={view} onChange={setView} options={[{value:'write',label:t('writeTab')},{value:'saved',label:t('savedTab',{count:memories.length})}]}/>
  {confirmation?<div className={styles.centerPage}><p className="text-body">{t(confirmation==='reset'?'resetPrompt':'removePrompt')}</p><div className="flex flex-wrap gap-2"><Button className="atlas-touch-floor atlas-touch-floor-wide" ref={cancelRef} variant="ghost" onClick={cancel}>{t('cancel')}</Button><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="danger" onClick={confirm}>{t(confirmation==='reset'?'resetConfirm':'removeConfirm')}</Button></div></div>:view==='write'?<div className={styles.panelPage}>
   <p className={`${styles.optionalCopy} text-label text-[color:var(--color-text-secondary)]`}>{t('personal')}</p>
   <form onSubmit={event=>{event.preventDefault();if(compact&&writeStep<2){setWriteStep(value=>value+1);return;}save();}} className={`${styles.noteForm} ${compact?styles.compactMemoryForm:''}`} data-testid="companion-memory-form">
    {!compact||writeStep===1?<SegmentedControl ariaLabel={t('kindLabel')} value={draft.kind} onChange={kind=>{onDraft({...draft,kind});setSaved(false);}} options={MEMORY_KINDS.map(value=>({value,label:t(`kind.${value}`)}))} variant="chips"/>:null}
    {!compact||writeStep===0?<Textarea ref={noteRef} label={t('noteLabel')} placeholder={t('placeholder')} value={draft.note} maxLength={240} rows={compact?1:2} style={{resize:'none'}} onChange={event=>{onDraft({...draft,note:event.target.value});setSaved(false);}}/>:null}
    {!compact||writeStep===2?<SegmentedControl ariaLabel={t('keepsakeLabel')} value={draft.keepsake} onChange={keepsake=>onDraft({...draft,keepsake})} variant="chips" options={KEEPSAKES.map(value=>({value,label:t(`object.${value}`)}))}/>:null}
    <div className="flex flex-wrap items-center justify-end gap-2">
     {compact&&writeStep>0?<Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" onClick={()=>setWriteStep(value=>value-1)}>{t('pages.previous')}</Button>:null}
     {compact&&writeStep<2?<Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" disabled={!draft.note.trim()} onClick={()=>setWriteStep(value=>value+1)}>{t('pages.next')}</Button>:<Button className="atlas-touch-floor atlas-touch-floor-wide" type="submit" variant="primary" disabled={!draft.note.trim()||store.unreadable||memories.length>=MEMORY_LIMIT}>{t('save')}</Button>}
    </div>
    {!compact||error||store.unreadable||saved?<p role={error||store.unreadable?'alert':'status'} className="text-label text-[color:var(--color-text-secondary)]">{t(store.unreadable?'unreadable':error?'saveFailed':saved?'saved':memories.length>=MEMORY_LIMIT?'full':'storage')}</p>:null}
   </form>
   {store.unreadable?<Button className="atlas-touch-floor atlas-touch-floor-wide" ref={resetRef} variant="ghost" onClick={()=>setConfirmation('reset')}>{t('reset')}</Button>:null}
  </div>:<div className={`${styles.panelPage} ${compact?styles.compactMemoryRead:''}`}>
   {entry?<>
    <div className="flex items-center gap-3 pr-2"><ObjectIcon data-keepsake={entry.keepsake} size={ICON_SIZE.md}/><h3 className="min-w-0 flex-1 truncate text-body font-[var(--font-weight-emphasis)]">{t(`kind.${entry.kind}`)}</h3><IconButton className="atlas-touch-floor atlas-touch-floor-wide" ref={removeRef} label={t('remove',{note:entry.note})} onClick={()=>setConfirmation(entry.id)}><Trash2 size={ICON_SIZE.sm}/></IconButton><IconButton className="atlas-touch-floor atlas-touch-floor-wide" ref={resetRef} label={t('reset')} onClick={()=>setConfirmation('reset')}><RotateCcw size={ICON_SIZE.sm}/></IconButton></div>
    <div className={styles.pageBody} data-testid="companion-memories"><p className="whitespace-pre-wrap break-words text-body">{selected.text}</p><p className="mt-2 truncate text-label text-[color:var(--color-text-secondary)]" title={entry.folder}>{new Date(entry.createdAt).toLocaleDateString(locale)}{entry.folder?` · ${entry.folder}`:''}</p></div>
    <CompanionPager index={index} count={pages.length} onChange={value=>setReading({id:pages[value].entry.id,offset:pages[value].offset})} label={t('memories')}/>
   </>:<><p className="text-body">{t('emptyHome')}</p><Button className="atlas-touch-floor atlas-touch-floor-wide" ref={writeRef} variant="outline" onClick={()=>setView('write')}>{t('writeTab')}</Button></>}
   {error?<p role="alert" className="text-label">{t('saveFailed')}</p>:null}
  </div>}
 </section>;
}
