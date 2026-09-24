'use client';
import {useTranslations} from 'next-intl';
import {CONSTRUCTION_WEIGHTS,constructionXp,type ConstructionCounts} from '../model/companion-construction';
import styles from './companion-immersive.module.css';
export function CompanionProjectBook({counts,current,study,adventure}:{counts:ConstructionCounts;current:ConstructionCounts;study:number;adventure:number}){
 const t=useTranslations('companion.project');
 return <div className={styles.projectBook} data-testid="companion-project-book">
  <p className="text-title font-[var(--font-weight-strong)]">{t('total',{xp:constructionXp(counts)})}</p>
  <dl>{(Object.keys(CONSTRUCTION_WEIGHTS) as (keyof ConstructionCounts)[]).map(key=><div key={key}><dt>{t(`category.${key}`)}</dt><dd>{current[key]} · {t('record',{count:counts[key]})} <strong className="font-[var(--font-weight-strong)]">{counts[key]*CONSTRUCTION_WEIGHTS[key]} XP</strong></dd></div>)}</dl>
  <p className="text-label">{t('other',{study,adventure})}</p>
  <p className="text-label text-[color:var(--color-text-secondary)]">{t('how')}</p>
 </div>;
}
