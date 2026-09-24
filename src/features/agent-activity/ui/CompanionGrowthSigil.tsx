import {useTranslations} from 'next-intl';
import type {ConstructionCounts} from '../model/companion-construction';
import {CompanionItem} from './CompanionItem';
import styles from './companion-immersive.module.css';
const MARKS=[{key:'concepts',icon:2,x:70,y:75},{key:'relations',icon:7,x:140,y:28},{key:'wiki',icon:4,x:210,y:75},{key:'implementation',icon:8,x:140,y:120}] as const;
/** A visible camp keepsake of recorded growth; never a diagram of accepted meaning. */
export function CompanionGrowthSigil({counts}:{counts:ConstructionCounts}){
 const t=useTranslations('companion.project');
 return <div className={styles.growthSigil} aria-label={t('sigil')} data-testid="companion-growth-sigil">
  <svg viewBox="0 0 280 160" aria-hidden="true"><path d="M70 75L140 28L210 75L140 120Z" fill="none" stroke="var(--color-indigo-accent)" strokeWidth="2" strokeDasharray="3 6"/><ellipse cx="140" cy="80" rx="125" ry="66" fill="none" stroke="var(--color-border-strong)" strokeWidth="3"/></svg>
  {MARKS.map(mark=><div key={mark.key} className={styles.growthMark} data-lit={counts[mark.key]>0} style={{left:mark.x,top:mark.y}}><CompanionItem index={mark.icon}/><span>{t(`category.${mark.key}`)} {counts[mark.key]}</span></div>)}
 </div>;
}
