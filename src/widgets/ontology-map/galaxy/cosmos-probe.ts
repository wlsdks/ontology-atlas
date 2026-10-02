import { ARRIVAL_MS } from "./cosmos-arrival";
import { posedPoint, worldToScreen } from "./cosmos-camera";
import type { CosmosEngine } from "./cosmos-engine";
import { cosmosLayoutRuns } from "./layout/cosmos-layout-cache";

type ProbeWindow = { __atlasCosmos?: unknown };

export function writeProbeFrame(canvas: HTMLCanvasElement, engine: CosmosEngine): void {
  const { camera } = engine.rig;
  const arrivalT = engine.arrival ? Math.min(1, engine.arrivalClock / ARRIVAL_MS) : 1;
  canvas.dataset.frame = JSON.stringify({ arrived: !engine.arrival, arrivalT, offset: [camera.x, camera.y], scale: camera.scale });
}

export function installCosmosProbe(engine: CosmosEngine): () => void {
  const { rig } = engine;
  const screenOf = (x: number, y: number) => worldToScreen(rig.camera, rig.room, x, y);
  const probe = {
    camera: () => ({ ...rig.camera, width: engine.width, height: engine.height, overviewScale: rig.overviewScale, zoomRatio: rig.camera.scale / rig.overviewScale }),
    room: () => ({ ...rig.room }),
    awake: () => engine.raf !== 0,
    frames: () => engine.frames,
    frameLog: () => engine.frameLog.slice(),
    stats: () => engine.lastStats && { ...engine.lastStats, labels: engine.lastStats.labels.map((l) => ({ ...l })) },
    layout: () => {
      const layout = engine.layout;
      if (!layout) return null;
      const galaxies = layout.galaxies.map((g, i) => {
        const s = screenOf(engine.poses[i]?.x ?? g.x, engine.poses[i]?.y ?? g.y);
        return { id: g.id, label: g.label, shape: g.shape, arms: g.arms, members: g.members, clusters: g.clusters.length, sx: s.x, sy: s.y, rho: g.radius * rig.camera.scale };
      });
      return { timings: { ...layout.timings }, galaxies, filaments: layout.filaments.length, concepts: layout.points.size };
    },
    layoutRuns: () => cosmosLayoutRuns(),
    marks: () => engine.marks(),
    armPaint: (on: boolean) => {
      engine.paintLog = on ? [] : null;
      engine.requestFrame();
    },
    painted: () => (engine.paintLog ? engine.paintLog.slice() : []),
    selection: () => ({ nodeId: engine.selectedId }),
    interaction: () => ({ kind: rig.interaction() }),
    arrival: () => ({ mode: engine.arrivalMode, active: engine.arrival !== null, clockMs: engine.arrivalClock, totalMs: ARRIVAL_MS }),
    haze: () => ({ factor: engine.haze.factor, tau: engine.haze.tau, awake: engine.hazeAwake }),
    cacheBytes: () => engine.cache.bytes(),
    dropBitmaps: () => {
      engine.cache.clear();
      engine.requestFrame();
    },
    hit: (x: number, y: number) => engine.hit(x, y),
    point: (id: string) => {
      const p = engine.layout && posedPoint(engine.layout, engine.poses, id);
      return p ? screenOf(p.x, p.y) : null;
    },
    flyTo: (id: string) => engine.flyToGalaxy(engine.layout?.galaxies.findIndex((g) => g.id === id) ?? -1),
    overview: () => engine.overview(),
  };
  const w = window as unknown as ProbeWindow;
  w.__atlasCosmos = probe;
  return () => {
    if (w.__atlasCosmos === probe) delete w.__atlasCosmos;
  };
}
