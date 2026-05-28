import type { LayoutNodeInput, LayoutLinkInput } from './layout-engine';

/** Messages the main thread posts to the layout worker. */
export type MainToWorker =
  | {
      type: 'init';
      nodes: LayoutNodeInput[];
      links: LayoutLinkInput[];
      autoStart: boolean;
      initialAlpha: number;
    }
  | { type: 'pin'; id: string; x: number; y: number }
  | { type: 'drag'; id: string; x: number; y: number }
  | { type: 'release'; id: string }
  | { type: 'tune'; repel?: number; linkDistance?: number; collideMultiplier?: number }
  | { type: 'reheat' }
  | { type: 'stop' };

/** Messages the layout worker posts back to the main thread. */
export type WorkerToMain =
  | { type: 'ids'; ids: string[] }
  | { type: 'positions'; x: Float32Array; y: Float32Array; active: boolean };
