import {withBasePath} from '@/shared/lib/base-path';
import type {Species} from '../model/companion-catalog';
import {CREATURE_FRAMES} from '../model/companion-creature-frames';
import styles from './companion-immersive.module.css';
export function CompanionCreature({species,large=false,hidden=false}:{species:Species;large?:boolean;hidden?:boolean}){
 if(species.region==='grove'){
  if(species.index>=15){const guardian=['oak','stag','stump'][species.index-15];return <span aria-hidden="true" className={styles.creature} data-large={large} data-unknown={hidden} data-species={species.id} data-grove-v2="true" data-grove-guardian="true"><span className={styles.guardianCreature} style={{backgroundImage:`url(${withBasePath('/brand/companion-grove-'+guardian+'.webp')})`}}/></span>;}
  const sheet=['frontline','midline','guardians'][Math.floor(species.index/6)];const cell=species.index%6;
  return <span aria-hidden="true" className={styles.creature} data-large={large} data-unknown={hidden} data-species={species.id} data-grove-v2="true"><span className={styles.groveCreature} style={{backgroundImage:`url(${withBasePath('/brand/companion-grove-'+sheet+'.webp')})`,backgroundPosition:`${cell%3*50}% ${Math.floor(cell/3)*100}%`}}/></span>;
 }
 const [x,y,w,h]=CREATURE_FRAMES[species.region][species.index];const reference=Math.max(w,h)*1.12;
 return <span aria-hidden="true" className={styles.creature} data-large={large} data-unknown={hidden} data-species={species.id}><span style={{position:'absolute',left:`${50-w/reference*50}%`,bottom:'4%',width:`${w/reference*100}%`,height:`${h/reference*100}%`,backgroundImage:`url(${withBasePath('/brand/companion-'+species.region+'-monsters.webp')})`,backgroundSize:`${1774/w*100}% ${887/h*100}%`,backgroundPosition:`${x/(1774-w)*100}% ${y/(887-h)*100}%`,backgroundRepeat:'no-repeat'}}/></span>;
}
