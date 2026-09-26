import type {CSSProperties} from 'react';
import {withBasePath} from '@/shared/lib/base-path';
import type {Species} from '../model/companion-catalog';
import {CREATURE_FRAMES} from '../model/companion-creature-frames';
import styles from './companion-immersive.module.css';
const FOUNDRY_GROUND_OFFSETS=[1.8,1,1.8,9.8,10.9,9.8,2.5,0,.2,3.1,3.3,4.7,1.4,0,3.1,7.4,0,6.6];
const MARSH_GROUND_OFFSETS=[0,.2,.6,10.5,17.8,11.1,0,0,0,2,1.8,3.7,0,0,0,1.3,3.3,4.6];
export function CompanionCreature({species,large=false,hidden=false}:{species:Species;large?:boolean;hidden?:boolean}){
 if(species.region==='grove'||species.region==='foundry'||species.region==='marsh'){
  const region=species.region;
  const groundStyle=region==='foundry'?{'--foundry-ground-offset':`${FOUNDRY_GROUND_OFFSETS[species.index]}%`} as CSSProperties:region==='marsh'?{'--marsh-ground-offset':`${MARSH_GROUND_OFFSETS[species.index]}%`} as CSSProperties:undefined;
  if(species.index>=15){
   const guardian=(region==='grove'?['oak','stag','stump']:region==='foundry'?['beetle','sentinel','ram']:['toad','serpent','turtle'])[species.index-15];
   return <span aria-hidden="true" className={styles.creature} data-large={large} data-unknown={hidden} data-species={species.id} data-detailed-v2="true" data-detailed-guardian="true" data-region={region} style={groundStyle}><span className={styles.guardianCreature} style={{backgroundImage:`url(${withBasePath('/brand/companion-'+region+'-'+guardian+'.webp')})`}}/></span>;
  }
  const sheet=(region==='grove'?['frontline','midline','guardians']:['frontline','midline','upper'])[Math.floor(species.index/6)];
  const cell=species.index%6;
  return <span aria-hidden="true" className={styles.creature} data-large={large} data-unknown={hidden} data-species={species.id} data-detailed-v2="true" data-region={region} style={groundStyle}><span className={styles.sheetCreature} style={{backgroundImage:`url(${withBasePath('/brand/companion-'+region+'-'+sheet+'.webp')})`,backgroundPosition:`${cell%3*50}% ${Math.floor(cell/3)*100}%`}}/></span>;
 }
 const [x,y,w,h]=CREATURE_FRAMES[species.region][species.index];const reference=Math.max(w,h)*1.12;
 return <span aria-hidden="true" className={styles.creature} data-large={large} data-unknown={hidden} data-species={species.id}><span style={{position:'absolute',left:`${50-w/reference*50}%`,bottom:'4%',width:`${w/reference*100}%`,height:`${h/reference*100}%`,backgroundImage:`url(${withBasePath('/brand/companion-'+species.region+'-monsters.webp')})`,backgroundSize:`${1774/w*100}% ${887/h*100}%`,backgroundPosition:`${x/(1774-w)*100}% ${y/(887-h)*100}%`,backgroundRepeat:'no-repeat'}}/></span>;
}
