'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { BACK_FEET, LOBBY_H, createLobby, type Lobby } from '@/shared/ui/marks/moru/life/lobby-canvas';
import styles from './rooms.module.css';

/** The band over the floor that names it. */
export const LOBBY_PLAQUE_H = 24;

/**
 * The building's ground floor, where Moru live between jobs: a few of the crew at a time come in from an
 * edge through its doorways, play and go out again (`src/shared/ui/marks/moru/life/`). Nothing here stands for a
 * worktree: it lies under every room, named like a floor. The clock runs only while the lobby is on screen in a visible window and motion
 * is allowed; otherwise the lobby holds still.
 */
export function MoruLobby({ width, resting, reduced }: { width: number; resting: number; reduced: boolean }) {
  const t = useTranslations('workStatus');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fixturesRef = useRef<HTMLCanvasElement>(null);
  const lobbyRef = useRef<Lobby | null>(null);
  const allowedRef = useRef<() => boolean>(() => false);
  const initial = useRef({ width, resting });
  const reducedRef = useRef(reduced);

  useEffect(() => {
    const canvas = canvasRef.current, fixtures = fixturesRef.current;
    if (!canvas || !fixtures) return;
    let gone = false, onScreen = false;
    allowedRef.current = () => onScreen && !document.hidden && !reducedRef.current;
    const sync = () => lobbyRef.current?.sync(allowedRef.current());
    const observer = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); });
    observer.observe(canvas);
    document.addEventListener('visibilitychange', sync);
    void createLobby(canvas, fixtures, { ...initial.current, rand: Math.random, basePath: withBasePath('') }).then(lobby => {
      if (gone || !lobby) { lobby?.destroy(); return; }
      lobbyRef.current = lobby;
      canvas.dataset.lobbyReady = 'true';
      (canvas as HTMLCanvasElement & { lobby?: Lobby }).lobby = lobby;
      sync();
    });
    return () => {
      gone = true;
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      lobbyRef.current?.destroy();
      lobbyRef.current = null;
    };
  }, []);

  useEffect(() => {
    reducedRef.current = reduced;
    lobbyRef.current?.sync(allowedRef.current());
  }, [reduced]);
  useEffect(() => { lobbyRef.current?.resize(width); }, [width]);
  useEffect(() => { lobbyRef.current?.setCrew(resting); }, [resting]);

  return (
    <div className={styles.lobby} data-testid="work-lobby" style={{ ['--lane-back' as string]: `${BACK_FEET}px`, ['--plaque' as string]: `${LOBBY_PLAQUE_H}px` }}>
      <div className={cn(styles.floorHeadingName, styles.lobbyPlaque, 'text-body leading-body font-[var(--font-weight-emphasis)]')} data-testid="work-lobby-name">
        <i aria-hidden className={styles.stairs} />
        {t('lobby.name')}
      </div>
      <i aria-hidden className={styles.lobbyFloor} />
      <canvas ref={fixturesRef} aria-hidden className={styles.lobbyCanvas} width={width} height={LOBBY_H} />
      <canvas ref={canvasRef} aria-hidden className={styles.lobbyCanvas} data-testid="work-lobby-canvas" width={width} height={LOBBY_H} />
    </div>
  );
}
