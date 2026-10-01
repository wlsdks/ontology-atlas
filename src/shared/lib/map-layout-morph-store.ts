export type MapLayoutView = "flat" | "galaxy" | "strata" | "coupling" | "territories" | "hex";

export type MapLayoutMarkShape = "disc" | "square" | "hex";

export interface MapLayoutMark {
  id: string;
  x: number;
  y: number;
  size: number;
  shape: MapLayoutMarkShape;
  fill: string;
  stroke: string;
  alpha: number;
}

export interface MapLayoutSnapshot {
  marks: readonly MapLayoutMark[];
  bitmap: HTMLCanvasElement | null;
  ground: string;
}

let armed = false;
let published: MapLayoutSnapshot | null = null;
let publishCount = 0;

export function armMapLayoutMorph(): void {
  armed = true;
  published = null;
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(disarmMapLayoutMorph);
}

export function isMapLayoutMorphArmed(): boolean {
  return armed;
}

export function publishMapLayoutSnapshot(snapshot: MapLayoutSnapshot): void {
  if (!armed) return;
  published = snapshot;
  publishCount += 1;
}

export function takeMapLayoutMorph(): MapLayoutSnapshot | null {
  const snapshot = published;
  armed = false;
  published = null;
  return snapshot;
}

export function disarmMapLayoutMorph(): void {
  armed = false;
  published = null;
}

export function mapLayoutPublishCount(): number {
  return publishCount;
}

export function copyCanvasAtCssSize(source: HTMLCanvasElement | null): HTMLCanvasElement | null {
  if (!source || source.width === 0 || source.height === 0) return null;
  const box = source.getBoundingClientRect();
  const dpr = source.ownerDocument.defaultView?.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(box.width || source.width / dpr));
  const height = Math.max(1, Math.round(box.height || source.height / dpr));
  const copy = source.ownerDocument.createElement("canvas");
  copy.width = width;
  copy.height = height;
  const ctx = copy.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  return copy;
}
