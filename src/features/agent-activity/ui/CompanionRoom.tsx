import { BookOpen, Leaf, Sparkles, Star } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import styles from './companion-home.module.css';
import { CompanionSprite } from './CompanionSprite';

/** Each furnishing corresponds to an earned stage, never a quality verdict. */
export function CompanionRoom({ stage, large = false }: { stage: number; large?: boolean }) {
  return <span className={`${styles.room} ${large ? styles.grownRoom : ''}`} aria-hidden="true" data-companion-room data-stage={stage}>
    <span className={styles.window}><span /><span /><span /><span /></span>
    <span className={styles.floor} />
    <span className={styles.resident}><CompanionSprite pose="idle" /></span>
    <span className={styles.shelf}>
      {stage >= 2 ? <BookOpen size={large ? ICON_SIZE.lg : ICON_SIZE.sm} /> : null}
      {stage >= 3 ? <Leaf size={large ? ICON_SIZE.lg : ICON_SIZE.sm} /> : null}
      {stage >= 4 ? <Star size={large ? ICON_SIZE.lg : ICON_SIZE.sm} /> : null}
    </span>
    {stage >= 5 ? <span className={styles.desk}><Sparkles size={ICON_SIZE.sm} /></span> : null}
  </span>;
}
