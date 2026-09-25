'use client';
import type {ReactNode} from 'react';
import {motion} from 'framer-motion';
import {MOTION} from '@/shared/motion';
import styles from './companion-immersive.module.css';

/** Reduced motion retains an inline opacity-only receipt instead of the traveling effect. */
export function CompanionConfirmation({children}:{children:ReactNode}){
 return <motion.span role="status" data-testid="companion-confirmation" className={styles.confirmationText} initial={{opacity:0}} animate={{opacity:1}} transition={MOTION.fast}>{children}</motion.span>;
}
