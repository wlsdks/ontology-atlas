import {withBasePath} from '@/shared/lib/base-path';
import styles from './companion-immersive.module.css';
export function CompanionItem({index,large=false}:{index:number;large?:boolean}){
 return <span aria-hidden="true" className={`${styles.itemArt} ${large?styles.itemArtLarge:''}`} style={{backgroundImage:`url(${withBasePath('/brand/companion-items.webp')})`,backgroundPosition:`${index%3*50}% ${Math.floor(index/3)*50}%`}}/>;
}
