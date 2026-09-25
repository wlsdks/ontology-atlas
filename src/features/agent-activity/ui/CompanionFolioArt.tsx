import {withBasePath} from '@/shared/lib/base-path';
import styles from './companion-immersive.module.css';

const CELLS={camp:[0,0],cache:[50,0],elite:[100,0],quest:[0,100],forge:[50,100],study:[100,100]} as const;
/** One decoded original atlas supplies quiet illustrations; labels and controls stay real DOM. */
export function CompanionFolioArt({kind,className=''}:{kind:keyof typeof CELLS;className?:string}){
 const [x,y]=CELLS[kind];
 return <span className={`${styles.folioArt} ${className}`} aria-hidden="true"><span style={{backgroundImage:`url(${withBasePath('/brand/companion-folio-scenes.webp')})`,backgroundPosition:`${x}% ${y}%`}}/></span>;
}
