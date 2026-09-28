/**
 * The real vault as a lit three.js object, placed by the map's own cone (`buildDomeModel`).
 * It keeps the 2D engine's contracts the gates measure: the typing echo, one edge fact on hover,
 * the `litCount()`/`nodesOnScreen()` probes under `?e2e=1`, the shared frame loop, and one still
 * frame under reduced motion. Per frame O(N + D) over slug-keyed Maps and instanced meshes, plus
 * an O(E) line rebuild while the echo is still lighting dots.
 * Bloom is additive sprites: `UnrealBloomPass` does not work on a transparent canvas.
 */

import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

import { buildDomeModel, type DomeInputNode, type DomeViewKind } from '@/widgets/ontology-map';

import { registerGatewayFrameClient } from './gateway-frame-loop';
import { echoCount, echoOrder } from './hero-echo';

export interface AtlasNode {
  s: string;
  k: DomeViewKind;
  l?: string;
}
export interface AtlasEdge {
  a: string;
  b: string;
  y: 'contains' | 'depends';
}
export interface AtlasData {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
}

export interface AtlasOptions {
  tokenEl?: Element;
  reducedMotion?: boolean;
  onHover?: (slug: string | null) => void;
  /** Canvas fractions, or below the split a fixed height above the bottom edge. */
  anchor?: { x: number; y: number } | { x: number; bottomPx: number };
  dim?: number;
  /** In object radii. */
  distance?: number;
  /** On-screen width in CSS pixels; the camera distance follows the canvas height to keep it. */
  fitPx?: number;
  /** Radians; below the split the object is seen from higher up so its ink stays out of the type. */
  pitch?: number;
}

export interface AtlasHandle {
  dispose: () => void;
  setTyping: (typed: number, total: number) => void;
  litCount: () => number;
  nodesOnScreen: () => { s: string; k: DomeViewKind; x: number; y: number }[];
}

const PERIOD_MS = 64_000;
const ECHO_TAU_MS = 110;
const TILT_TAU_MS = 220;

const RADIUS: Record<DomeViewKind, number> = { project: 0.07, domain: 0.046, capability: 0.024, element: 0.012 };

function cssVar(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function haloTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // White alpha only: the sprite material tints it with the accent token.
  // eslint-disable-next-line no-restricted-syntax -- canvas gradient stop; a CSS variable cannot reach a texture
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  // eslint-disable-next-line no-restricted-syntax -- canvas gradient stop
  grad.addColorStop(0.35, 'rgba(255,255,255,0.28)');
  // eslint-disable-next-line no-restricted-syntax -- canvas gradient stop
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function mountHeroAtlas(canvas: HTMLCanvasElement, data: AtlasData, opts: AtlasOptions = {}): AtlasHandle | null {
  let renderer: THREE.WebGLRenderer;
  try {
    // Keep the drawing buffer, or `download-gateway-grid.spec.ts` reads a blank copy of the frame.
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
  } catch {
    return null;
  }
  const rootEl = opts.tokenEl ?? document.documentElement;
  const reduced =
    opts.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const accent = new THREE.Color(cssVar(rootEl, '--color-indigo-brand', '#5e6ad2'));
  const accentBright = new THREE.Color(cssVar(rootEl, '--color-indigo-accent', '#7170ff'));
  const ink = new THREE.Color(cssVar(rootEl, '--color-text-primary', '#f7f8f8'));
  const inkSoft = new THREE.Color(cssVar(rootEl, '--color-text-tertiary', '#8a8b93'));
  const inkDim = new THREE.Color(cssVar(rootEl, '--color-text-quaternary', '#61626c'));

  renderer.setClearColor(0x000000, 0);
  // 1.5 hides sphere edge steps on Retina; 2 doubles fill cost for nothing visible through fog.
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const parentOf = new Map<string, string>();
  for (const e of data.edges) if (e.y === 'contains') parentOf.set(e.b, e.a);
  const domeNodes: DomeInputNode[] = data.nodes.map((n) => ({ id: n.s, kind: n.k, x: 0, y: 0, parentId: parentOf.get(n.s) ?? null }));
  const model = buildDomeModel(domeNodes, { arrangement: 'ownership' });
  let maxR = 1e-6;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of model.coords.values()) {
    maxR = Math.max(maxR, Math.hypot(c.px, c.pz));
    minY = Math.min(minY, c.py);
    maxY = Math.max(maxY, c.py);
  }
  const midY = (minY + maxY) / 2;
  const pos = new Map<string, THREE.Vector3>();
  for (const n of data.nodes) {
    const c = model.coords.get(n.s);
    if (!c) continue;
    pos.set(n.s, new THREE.Vector3(c.px / maxR, (c.py - midY) / maxR, c.pz / maxR));
  }
  const nodes = data.nodes.filter((n) => pos.has(n.s));
  const bySlug = new Map(nodes.map((n) => [n.s, n] as const));

  const order = echoOrder(nodes.map((n) => ({ s: n.s, k: n.k, px: pos.get(n.s)!.x, pz: pos.get(n.s)!.z })));
  const rank = new Map(order.map((s, i) => [s, i] as const));
  const vis = new Map<string, number>(nodes.map((n) => [n.s, 0] as const));
  let litTarget = 0;
  let echoing = true;

  const scene = new THREE.Scene();
  const ground = new THREE.Color(cssVar(rootEl, '--gateway-fx-deep', '#050506'));
  // Fog follows the camera distance: the back edge loses about half its ink, never all.
  let camDistance = opts.distance ?? 3.4;
  scene.fog = new THREE.Fog(ground, camDistance - 0.2, camDistance + 2.4);
  const fog = scene.fog;
  const group = new THREE.Group();
  scene.add(group);
  scene.add(new THREE.HemisphereLight(0xdfe1ff, 0x0b0b10, 1.1));
  const key = new THREE.PointLight(0xffffff, 6, 0, 2);
  key.position.set(2.2, 2.6, 2.4);
  scene.add(key);
  const rim = new THREE.PointLight(accentBright.getHex(), 5, 0, 2);
  rim.position.set(-2.4, -0.4, -1.8);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);

  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const materials: Record<DomeViewKind, THREE.MeshStandardMaterial> = {
    project: new THREE.MeshStandardMaterial({ color: accent, emissive: accentBright, emissiveIntensity: 1.3, roughness: 0.28, metalness: 0.15 }),
    domain: new THREE.MeshStandardMaterial({ color: ink, emissive: accentBright, emissiveIntensity: 0.34, roughness: 0.38, metalness: 0.12 }),
    capability: new THREE.MeshStandardMaterial({ color: inkSoft, emissive: accent, emissiveIntensity: 0.06, roughness: 0.55, metalness: 0.05 }),
    element: new THREE.MeshStandardMaterial({ color: inkDim, roughness: 0.7, metalness: 0 }),
  };
  const byKind: Record<DomeViewKind, AtlasNode[]> = { project: [], domain: [], capability: [], element: [] };
  for (const n of nodes) byKind[n.k].push(n);
  const meshes: Partial<Record<DomeViewKind, THREE.InstancedMesh>> = {};
  const dummy = new THREE.Object3D();
  for (const k of Object.keys(byKind) as DomeViewKind[]) {
    const list = byKind[k];
    if (list.length === 0) continue;
    const mesh = new THREE.InstancedMesh(sphere, materials[k], list.length);
    mesh.userData.kind = k;
    group.add(mesh);
    meshes[k] = mesh;
  }

  const halo = haloTexture();
  const haloSprites: { s: string; sprite: THREE.Sprite; base: number }[] = [];
  for (const n of [...byKind.project, ...byKind.domain]) {
    const mat = new THREE.SpriteMaterial({ map: halo, color: n.k === 'project' ? accentBright : accent, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    const sprite = new THREE.Sprite(mat);
    const base = RADIUS[n.k] * (n.k === 'project' ? 9 : 5.5);
    sprite.scale.set(base, base, 1);
    sprite.position.copy(pos.get(n.s)!);
    group.add(sprite);
    haloSprites.push({ s: n.s, sprite, base });
  }

  // An accent pool under the object, so the tree stands in its own light.
  const floorMat = new THREE.SpriteMaterial({ map: halo, color: accent, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  const floor = new THREE.Sprite(floorMat);
  floor.scale.set(3.2, 1.1, 1);
  floor.position.set(0, minY === Infinity ? -0.6 : (minY - midY) / maxR - 0.08, 0);
  group.add(floor);

  // Each depends arc is drawn twice, wide and faint under thin and bright: a glow without post-processing.
  const lineRes = new THREE.Vector2(1, 1);
  const containsMat = new LineMaterial({ color: inkSoft.getHex(), linewidth: 1.1, transparent: true, opacity: 0.42, depthWrite: false });
  const spineMat = new LineMaterial({ color: ink.getHex(), linewidth: 1.8, transparent: true, opacity: 0.55, depthWrite: false });
  const dependsMat = new LineMaterial({ color: accentBright.getHex(), linewidth: 1.5, transparent: true, opacity: 0.9, depthWrite: false });
  const dependsGlowMat = new LineMaterial({ color: accent.getHex(), linewidth: 7, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const m of [containsMat, spineMat, dependsMat, dependsGlowMat]) m.resolution = lineRes;
  let containsLine: LineSegments2 | null = null;
  let spineLine: LineSegments2 | null = null;
  let dependsLine: LineSegments2 | null = null;
  let dependsGlow: LineSegments2 | null = null;

  const containsEdges = data.edges.filter((e) => e.y === 'contains' && pos.has(e.a) && pos.has(e.b));
  const dependsEdges = data.edges.filter((e) => e.y === 'depends' && pos.has(e.a) && pos.has(e.b));
  const ARC_STEPS = 18;
  const arcPoint = (e: AtlasEdge, u: number, out: THREE.Vector3): THREE.Vector3 => {
    const A = pos.get(e.a)!;
    const B = pos.get(e.b)!;
    const v = 1 - u;
    const mx = (A.x + B.x) / 2;
    const mz = (A.z + B.z) / 2;
    const my = Math.max(A.y, B.y) + 0.22;
    return out.set(v * v * A.x + 2 * v * u * mx + u * u * B.x, v * v * A.y + 2 * v * u * my + u * u * B.y, v * v * A.z + 2 * v * u * mz + u * u * B.z);
  };
  let builtLit = -1;
  const rebuildLines = (): void => {
    const lit = (s: string): boolean => (vis.get(s) ?? 0) > 0.02;
    const spine: number[] = [];
    const rest: number[] = [];
    for (const e of containsEdges) {
      if (!lit(e.a) || !lit(e.b)) continue;
      const A = pos.get(e.a)!;
      const B = pos.get(e.b)!;
      const target = bySlug.get(e.a)!.k === 'project' || bySlug.get(e.b)!.k === 'project' ? spine : rest;
      target.push(A.x, A.y, A.z, B.x, B.y, B.z);
    }
    const dep: number[] = [];
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    for (const e of dependsEdges) {
      if (!lit(e.a) || !lit(e.b)) continue;
      for (let i = 0; i < ARC_STEPS; i += 1) {
        arcPoint(e, i / ARC_STEPS, p0);
        arcPoint(e, (i + 1) / ARC_STEPS, p1);
        dep.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      }
    }
    const swap = (old: LineSegments2 | null, points: number[], mat: LineMaterial): LineSegments2 | null => {
      if (old) {
        group.remove(old);
        old.geometry.dispose();
      }
      if (points.length === 0) return null;
      const geom = new LineSegmentsGeometry();
      geom.setPositions(points);
      const line = new LineSegments2(geom, mat);
      group.add(line);
      return line;
    };
    containsLine = swap(containsLine, rest, containsMat);
    spineLine = swap(spineLine, spine, spineMat);
    dependsGlow = swap(dependsGlow, dep, dependsGlowMat);
    dependsLine = swap(dependsLine, dep, dependsMat);
  };

  const beadGeom = new THREE.SphereGeometry(0.011, 10, 8);
  const beadMat = new THREE.MeshBasicMaterial({ color: accentBright, transparent: true, opacity: 0.95 });
  const beads = new THREE.InstancedMesh(beadGeom, beadMat, Math.max(1, dependsEdges.length));
  beads.count = 0;
  group.add(beads);

  let W = 1;
  let H = 1;
  let tiltYaw = 0;
  let tiltYawT = 0;
  let tiltPitch = 0;
  let tiltPitchT = 0;
  let pointer: { x: number; y: number } | null = null;
  let hover: string | null = null;
  let disposed = false;
  let clock = 0;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const resize = (): void => {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    if (opts.fitPx) {
      // A unit radius projects to (H/2)/(d·tan(fov/2)) pixels; solved for d at `fitPx`.
      camDistance = H / (opts.fitPx * Math.tan((camera.fov * Math.PI) / 360));
      fog.near = camDistance - 0.2;
      fog.far = camDistance + 2.4;
    }
    const ax = opts.anchor?.x ?? 0.5;
    const ay = opts.anchor && 'bottomPx' in opts.anchor ? 1 - opts.anchor.bottomPx / H : (opts.anchor?.y ?? 0.5);
    // The view offset moves the projection centre to the anchor without moving the scene.
    camera.setViewOffset(W, H, (0.5 - ax) * W, (0.5 - ay) * H, W, H);
    camera.updateProjectionMatrix();
    lineRes.set(W, H);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const setCamera = (yaw: number, pitch: number): void => {
    const d = camDistance;
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
    camera.lookAt(0, -0.02, 0);
  };

  const lastScreen = new Map<string, { x: number; y: number }>();
  const projectAll = (): void => {
    lastScreen.clear();
    const v = new THREE.Vector3();
    for (const n of nodes) {
      v.copy(pos.get(n.s)!).applyMatrix4(group.matrixWorld).project(camera);
      lastScreen.set(n.s, { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H });
    }
  };

  const hitAt = (x: number, y: number): string | null => {
    ndc.set((x / W) * 2 - 1, -(y / H) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    let best: { d: number; s: string } | null = null;
    for (const k of Object.keys(meshes) as DomeViewKind[]) {
      const mesh = meshes[k];
      if (!mesh) continue;
      const hits = raycaster.intersectObject(mesh, false);
      for (const h of hits) {
        if (h.instanceId === undefined) continue;
        const n = byKind[k][h.instanceId];
        if (!n || (vis.get(n.s) ?? 0) < 0.5) continue;
        if (!best || h.distance < best.d) best = { d: h.distance, s: n.s };
      }
    }
    return best?.s ?? null;
  };

  const frame = (dtMs: number): void => {
    if (disposed) return;
    const dim = opts.dim ?? 1;
    let changed = false;
    const k = 1 - Math.exp(-dtMs / ECHO_TAU_MS);
    for (const n of nodes) {
      const target = (rank.get(n.s) ?? 0) < litTarget ? 1 : 0;
      const prev = vis.get(n.s) ?? 0;
      const next = reduced ? target : prev + (target - prev) * k;
      if (Math.abs(next - prev) > 1e-4) changed = true;
      vis.set(n.s, next);
    }
    if (echoing && (changed || builtLit !== litTarget)) {
      rebuildLines();
      builtLit = litTarget;
    }
    if (!changed && !reduced && litTarget >= nodes.length) echoing = false;

    for (const kind of Object.keys(meshes) as DomeViewKind[]) {
      const mesh = meshes[kind]!;
      const list = byKind[kind];
      for (let i = 0; i < list.length; i += 1) {
        const n = list[i];
        const v = vis.get(n.s) ?? 0;
        const p = pos.get(n.s)!;
        const swell = v <= 0.001 ? 0 : RADIUS[kind] * (0.55 + 0.45 * v) * (n.s === hover ? 1.35 : 1);
        dummy.position.copy(p);
        dummy.scale.setScalar(swell);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const h of haloSprites) {
      const v = vis.get(h.s) ?? 0;
      const mat = h.sprite.material as THREE.SpriteMaterial;
      mat.opacity = (bySlug.get(h.s)!.k === 'project' ? 0.55 : 0.28) * v * dim * (h.s === hover ? 1.4 : 1);
      const s = h.base * (0.7 + 0.3 * v);
      h.sprite.scale.set(s, s, 1);
    }
    containsMat.opacity = 0.42 * dim;
    spineMat.opacity = 0.55 * dim;
    dependsMat.opacity = 0.9 * dim;
    dependsGlowMat.opacity = 0.16 * dim;
    let litShare = 0;
    for (const v of vis.values()) litShare += v;
    floorMat.opacity = 0.28 * dim * (nodes.length ? litShare / nodes.length : 0);
    group.position.y = reduced ? 0 : Math.sin((clock / 14_000) * Math.PI * 2) * 0.02;

    if (!reduced) {
      clock += dtMs;
      let count = 0;
      const bead = new THREE.Vector3();
      dependsEdges.forEach((e, i) => {
        if ((vis.get(e.a) ?? 0) < 0.5 || (vis.get(e.b) ?? 0) < 0.5) return;
        arcPoint(e, (clock / 2600 + (i * 0.137) % 1) % 1, bead);
        dummy.position.copy(bead);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        beads.setMatrixAt(count, dummy.matrix);
        count += 1;
      });
      beads.count = count;
      beads.instanceMatrix.needsUpdate = true;
    }

    const kt = 1 - Math.exp(-dtMs / TILT_TAU_MS);
    tiltYaw += (tiltYawT - tiltYaw) * kt;
    tiltPitch += (tiltPitchT - tiltPitch) * kt;
    const yaw = (reduced ? 0.6 : (clock / PERIOD_MS) * Math.PI * 2) + 0.6 + tiltYaw;
    setCamera(yaw, (opts.pitch ?? 0.5) + tiltPitch);
    group.updateMatrixWorld(true);
    projectAll();
    if (pointer && !reduced) {
      const best = hitAt(pointer.x, pointer.y);
      if (best !== hover) {
        hover = best;
        canvas.style.cursor = best ? 'pointer' : '';
        opts.onHover?.(best);
      }
    }
    renderer.render(scene, camera);
  };

  let unregister: (() => void) | null = null;
  if (reduced) {
    frame(16);
  } else {
    unregister = registerGatewayFrameClient(({ dtMs, factor }) => {
      if (disposed) return;
      frame(dtMs * Math.max(0.05, factor));
    });
  }

  const onMove = (e: PointerEvent): void => {
    const r = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    tiltYawT = ((pointer.x / Math.max(1, r.width)) - 0.5) * 0.35;
    tiltPitchT = ((pointer.y / Math.max(1, r.height)) - 0.5) * -0.18;
    if (reduced) {
      const best = hitAt(pointer.x, pointer.y);
      if (best !== hover) {
        hover = best;
        canvas.style.cursor = best ? 'pointer' : '';
        opts.onHover?.(best);
        frame(16);
      }
    }
  };
  const onLeave = (): void => {
    pointer = null;
    tiltYawT = 0;
    tiltPitchT = 0;
    if (hover !== null) {
      hover = null;
      canvas.style.cursor = '';
      opts.onHover?.(null);
      if (reduced) frame(16);
    }
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);

  return {
    setTyping: (typed, total) => {
      litTarget = echoCount(typed, total, nodes.length);
      echoing = true;
      if (reduced) frame(16);
    },
    litCount: () => Math.min(litTarget, nodes.length),
    nodesOnScreen: () => nodes.map((n) => ({ s: n.s, k: n.k, x: lastScreen.get(n.s)?.x ?? 0, y: lastScreen.get(n.s)?.y ?? 0 })),
    dispose: () => {
      disposed = true;
      unregister?.();
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      sphere.dispose();
      beadGeom.dispose();
      halo.dispose();
      for (const m of Object.values(materials)) m.dispose();
      for (const h of haloSprites) (h.sprite.material as THREE.Material).dispose();
      for (const m of [containsMat, spineMat, dependsMat, dependsGlowMat, beadMat, floorMat]) m.dispose();
      for (const l of [containsLine, spineLine, dependsLine, dependsGlow]) l?.geometry.dispose();
      renderer.dispose();
    },
  };
}
