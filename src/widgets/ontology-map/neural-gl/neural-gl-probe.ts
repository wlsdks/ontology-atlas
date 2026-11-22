import type { NeuralGlState } from "./neural-gl-stage";

/** A point in the map canvas's CSS pixels. */
export interface NeuralGlPoint {
  x: number;
  y: number;
}

/** `window.__atlasMapNeuralGl` under `?e2e=1`: which painter draws Neural, and what it drew. */
export interface NeuralGlProbe {
  /** The painter, or the fallback step that left Neural on canvas 2D. */
  state(): NeuralGlState;
  /** Frames the WebGL painter has drawn since the map mounted. */
  frames(): number;
  counts(): { cells: number; axons: number };
  /** RGBA (0..255) of the WebGL canvas at each point, read inside the next painted frame; null off WebGL. */
  sample(points: readonly NeuralGlPoint[]): Promise<number[][] | null>;
  lose(): void;
}

type ProbeWindow = Window & { __atlasMapNeuralGl?: NeuralGlProbe };

/** Installs the probe and returns its removal. */
export function installNeuralGlProbe(probe: NeuralGlProbe): () => void {
  const host = window as ProbeWindow;
  host.__atlasMapNeuralGl = probe;
  return () => {
    if (host.__atlasMapNeuralGl === probe) delete host.__atlasMapNeuralGl;
  };
}
