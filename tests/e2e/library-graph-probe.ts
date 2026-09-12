/**
 * The Library canvas's inspection window, declared once.
 *
 * `use-library-graph-engine.ts` mounts `window.__atlasLibraryGraph` when the route carries
 * `e2e`, and two specs read it. While each declared the shape for itself, adding a getter
 * for one of them made the other's declaration a different type for the same global, which
 * TypeScript rejects outright — so the shape lives here and both import it.
 */

export interface LibraryGraphProbeNode {
  id: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  radius: number;
}

export interface LibraryGraphProbeEdge {
  source: string;
  target: string;
  relation: string;
  certainty: string;
}

/** One name the last frame actually placed, in canvas CSS pixels. */
export interface LibraryGraphProbeLabel {
  nodeId: string;
  kind: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontPx: number;
}

/** Where the open card stands, in the canvas's own CSS pixels, with the mark it hangs from. */
export interface LibraryGraphProbeCard {
  nodeId: string;
  left: number;
  top: number;
  side: "right" | "left" | "below" | "above";
  width: number;
  maxHeight: number;
  mark: { x: number; y: number; radius: number };
}

export interface LibraryGraphProbe {
  nodes: () => LibraryGraphProbeNode[];
  edges: () => LibraryGraphProbeEdge[];
  labels: () => LibraryGraphProbeLabel[];
  interaction: () => { kind: "idle" | "node" | "pan"; nodeId: string | null };
  view: () => { scale: number; x: number; y: number; width: number; height: number };
  alpha: () => number;
  card: () => LibraryGraphProbeCard | null;
  flow: () => { edges: string[]; stale: string[]; pulsing: boolean };
  paint: () => {
    last: number;
    mean: number;
    worst: number;
    frames: number;
    reset: () => void;
  };
}

declare global {
  interface Window {
    __atlasLibraryGraph?: LibraryGraphProbe;
  }
}
