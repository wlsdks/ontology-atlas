/**
 * The real vault as a lit three.js object, placed by the map's own cone (`layoutCone`).
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

import { type ConeInputNode, type ConeKind, layoutCone } from '@/widgets/ontology-map';

import { registerGatedFrameClient } from './gateway-frame-loop';
import { echoCount, echoOrder } from './hero-echo';
import type { HeroBox } from './hero-bounds';
import { chainWalker, HERO_CHAIN, HERO_TURN_MS, heroChains, type ChainFrame, type HeroChain } from './hero-chain';

export interface AtlasNode {
  s: string;
  k: ConeKind;
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
  canvasClassName?: string;
  tokenEl?: Element;
  reducedMotion?: boolean;
  onHover?: (slug: string | null) => void;
  onChain?: (slug: string | null) => void;
  /** Canvas fractions, or below the split a fixed height above the bottom edge. */
  anchor?: { x: number; y: number } | { x: number; bottomPx: number };
  dim?: number;
  /** In object radii. */
  distance?: number;
  /** On-screen width in CSS pixels; the camera distance follows the canvas height to keep it. */
  fitPx?: number;
  /** Radians; below the split the object is seen from higher up so its ink stays out of the type. */
  pitch?: number;
  bounds?: () => HeroBox | null;
  watch?: (refit: () => void) => () => void;
}

export interface AtlasHandle {
  dispose: () => void;
  setTyping: (typed: number, total: number) => void;
  litCount: () => number;
  nodesOnScreen: () => { s: string; k: ConeKind; x: number; y: number }[];
  activeChain: () => { nodes: { s: string; x: number; y: number }[] } | null;
}

const PERIOD_MS = HERO_TURN_MS.atlas;
const BOX_PAD_PX = 4;
const ECHO_TAU_MS = 110;
const TILT_TAU_MS = 220;

const RADIUS: Record<ConeKind, number> = { project: 0.07, domain: 0.046, capability: 0.024, element: 0.012 };

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

interface RendererLease {
  renderer: THREE.WebGLRenderer;
  release: () => void;
}

/** A kept drawing buffer costs a copy per frame; only `?e2e=1` reads the pixels back. */
export function rendererOptions(search: string): THREE.WebGLRendererParameters {
  return {
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
    preserveDrawingBuffer: new URLSearchParams(search).get('e2e') === '1',
  };
}

function createRenderer(): THREE.WebGLRenderer | null {
  try {
    return new THREE.WebGLRenderer(rendererOptions(window.location.search));
  } catch {
    return null;
  }
}

let sessionRenderer: THREE.WebGLRenderer | null = null;
let sessionRendererLent = false;

function borrowRenderer(): RendererLease | null {
  if (sessionRendererLent) return null;
  if (sessionRenderer?.getContext().isContextLost()) {
    sessionRenderer.dispose();
    sessionRenderer = null;
  }
  sessionRenderer ??= createRenderer();
  const renderer = sessionRenderer;
  if (!renderer) return null;
  sessionRendererLent = true;
  return {
    renderer,
    release: () => {
      renderer.setSize(1, 1, false);
      sessionRendererLent = false;
    },
  };
}

export function mountHeroAtlas(host: HTMLElement, data: AtlasData, opts: AtlasOptions = {}): AtlasHandle | null {
  const lease = borrowRenderer();
  if (!lease) return null;
  const { renderer } = lease;
  const canvas = renderer.domElement;
  canvas.className = opts.canvasClassName ?? '';
  host.appendChild(canvas);
  const rootEl = opts.tokenEl ?? document.documentElement;
  const reduced =
    opts.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const accent = new THREE.Color(cssVar(rootEl, '--color-indigo-brand', '#5e6ad2'));
  const accentBright = new THREE.Color(cssVar(rootEl, '--color-indigo-accent', '#7170ff'));
  const ink = new THREE.Color(cssVar(rootEl, '--color-text-primary', '#f7f8f8'));
  const inkSoft = new THREE.Color(cssVar(rootEl, '--color-text-tertiary', '#9a9fa8'));
  const inkDim = new THREE.Color(cssVar(rootEl, '--color-text-quaternary', '#82828a'));

  renderer.setClearColor(0x000000, 0);
  // 1.5 hides sphere edge steps on Retina; 2 doubles fill cost for nothing visible through fog.
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const parentOf = new Map<string, string>();
  for (const e of data.edges) if (e.y === 'contains') parentOf.set(e.b, e.a);
  const domeNodes: ConeInputNode[] = data.nodes.map((n) => ({ id: n.s, kind: n.k, x: 0, y: 0, parentId: parentOf.get(n.s) ?? null }));
  const coords = layoutCone(domeNodes).coords;
  let maxR = 1e-6;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of coords.values()) {
    maxR = Math.max(maxR, Math.hypot(c.px, c.pz));
    minY = Math.min(minY, c.py);
    maxY = Math.max(maxY, c.py);
  }
  const midY = (minY + maxY) / 2;
  const pos = new Map<string, THREE.Vector3>();
  for (const n of data.nodes) {
    const c = coords.get(n.s);
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
  const materials: Record<ConeKind, THREE.MeshStandardMaterial> = {
    project: new THREE.MeshStandardMaterial({ color: accent, emissive: accentBright, emissiveIntensity: 1.3, roughness: 0.28, metalness: 0.15 }),
    domain: new THREE.MeshStandardMaterial({ color: ink, emissive: accentBright, emissiveIntensity: 0.34, roughness: 0.38, metalness: 0.12 }),
    capability: new THREE.MeshStandardMaterial({ color: inkSoft, emissive: accent, emissiveIntensity: 0.06, roughness: 0.55, metalness: 0.05 }),
    element: new THREE.MeshStandardMaterial({ color: inkDim, roughness: 0.7, metalness: 0 }),
  };
  const byKind: Record<ConeKind, AtlasNode[]> = { project: [], domain: [], capability: [], element: [] };
  for (const n of nodes) byKind[n.k].push(n);
  const meshes: Partial<Record<ConeKind, THREE.InstancedMesh>> = {};
  const dummy = new THREE.Object3D();
  for (const k of Object.keys(byKind) as ConeKind[]) {
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

  const inkRadius = Object.fromEntries(
    (Object.keys(RADIUS) as ConeKind[]).map((k) => [k, Math.max(RADIUS[k] * HERO_CHAIN.swell, k === 'project' ? RADIUS[k] * 1.6 : 0)]),
  ) as Record<ConeKind, number>;

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

  const overArcs = { transparent: true, depthTest: false, depthWrite: false } as const;
  const beadMat = new THREE.SpriteMaterial({ map: halo, color: ink, blending: THREE.AdditiveBlending, opacity: 1, ...overArcs });
  const bead = new THREE.Sprite(beadMat);
  bead.scale.set(0.09, 0.09, 1);
  bead.renderOrder = 3;
  bead.visible = false;
  group.add(bead);
  const chainMat = new LineMaterial({ color: ink.getHex(), linewidth: 2.4, opacity: 0, ...overArcs });
  chainMat.resolution = lineRes;
  const chainGeom = new LineSegmentsGeometry();
  const chainLine = new LineSegments2(chainGeom, chainMat);
  chainLine.renderOrder = 2;
  chainLine.visible = false;
  group.add(chainLine);
  const chainHalos = [0, 1, 2].map(() => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: ink, blending: THREE.AdditiveBlending, opacity: 0, ...overArcs }));
    sprite.renderOrder = 2;
    sprite.visible = false;
    group.add(sprite);
    return sprite;
  });
  const chainPos = new Float32Array(12);
  chainGeom.setPositions(chainPos);
  const chainBuffer = (chainGeom.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute).data;
  chainLine.frustumCulled = false;
  const hopMs = parseFloat(cssVar(rootEl, '--map-light-hop-max-ms', '')) || HERO_CHAIN.hopMs;
  const walker = chainWalker(heroChains(nodes, data.edges), hopMs, reduced);
  let echoDoneAt: number | null = null;
  const chainLit: [number, number, number] = [0, 0, 0];
  let chainOn = false;
  let chainInked = -1;
  let inkedChain: HeroChain | null = null;
  const litOf = (slug: string): number => {
    const chain = walker.chain();
    const i = chainOn && chain ? chain.indexOf(slug) : -1;
    return i < 0 ? 0 : chainLit[i]!;
  };
  let captioned: string | null = null;
  const caption = (slug: string | null): void => {
    if (slug === captioned) return;
    captioned = slug;
    opts.onChain?.(slug);
  };

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

  const extent = (): { left: number; right: number; up: number; down: number } => {
    const probe = new THREE.PerspectiveCamera(camera.fov, W / H, 0.05, 50);
    const pitch = opts.pitch ?? 0.5;
    const v = new THREE.Vector3();
    const side = new THREE.Vector3();
    const reach = { left: 0, right: 0, up: 0, down: 0 };
    for (let k = 0; k < 12; k += 1) {
      const yaw = (k / 12) * Math.PI * 2;
      probe.position.set(Math.sin(yaw) * Math.cos(pitch) * camDistance, Math.sin(pitch) * camDistance, Math.cos(yaw) * Math.cos(pitch) * camDistance);
      probe.lookAt(0, -0.02, 0);
      probe.updateMatrixWorld();
      for (const n of nodes) {
        const r = inkRadius[n.k];
        for (const axis of [0, 1] as const) {
          side.setFromMatrixColumn(probe.matrixWorld, axis).multiplyScalar(r);
          for (const sign of [-1, 1]) {
            v.copy(pos.get(n.s)!).addScaledVector(side, sign).project(probe);
            reach.left = Math.max(reach.left, (-v.x * W) / 2);
            reach.right = Math.max(reach.right, (v.x * W) / 2);
            reach.up = Math.max(reach.up, (v.y * H) / 2);
            reach.down = Math.max(reach.down, (-v.y * H) / 2);
          }
        }
      }
    }
    return reach;
  };

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
    let ax = opts.anchor?.x ?? 0.5;
    let ay = opts.anchor && 'bottomPx' in opts.anchor ? 1 - opts.anchor.bottomPx / H : (opts.anchor?.y ?? 0.5);
    const box = opts.bounds?.() ?? null;
    if (box) {
      let reach = extent();
      for (let k = 0; k < 3; k += 1) {
        const over = Math.max(
          (reach.up + reach.down + BOX_PAD_PX * 2) / Math.max(1, box.bottom - box.top),
          (reach.left + reach.right + BOX_PAD_PX * 2) / Math.max(1, box.right - box.left),
        );
        if (over <= 1.005) break;
        camDistance *= over;
        fog.near = camDistance - 0.2;
        fog.far = camDistance + 2.4;
        reach = extent();
      }
      ax = Math.min(Math.max(ax * W, box.left + reach.left + BOX_PAD_PX), box.right - reach.right - BOX_PAD_PX) / W;
      ay = Math.min(Math.max(ay * H, box.top + reach.up + BOX_PAD_PX), box.bottom - reach.down - BOX_PAD_PX) / H;
    }
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

  const depthOf = (slug: string): number => camera.position.distanceTo(pos.get(slug)!);

  const drawChain = (walk: Readonly<ChainFrame> | null, dim: number): void => {
    const chain = walker.chain();
    chainOn = walk !== null && chain !== null && walk.alpha > 0;
    for (let i = 0; i < 3; i += 1) chainLit[i] = chainOn ? walk!.lit[i]! * walk!.alpha : 0;
    caption(chainOn && walk!.caption >= 0 ? chain![walk!.caption]! : null);
    chainLine.visible = chainOn && walk!.inked > 0;
    bead.visible = chainOn && walk!.pulseHop >= 0;
    for (let i = 0; i < 3; i += 1) {
      const sprite = chainHalos[i]!;
      sprite.visible = chainOn && walk!.lit[i]! > 0;
      if (!sprite.visible) continue;
      sprite.position.copy(pos.get(chain![i]!)!);
      const size = Math.max(RADIUS[bySlug.get(chain![i]!)!.k] * 7, 0.14);
      sprite.scale.set(size, size, 1);
      (sprite.material as THREE.SpriteMaterial).opacity = 0.7 * walk!.lit[i]! * walk!.alpha * dim;
    }
    if (!chainOn) return;
    const a = pos.get(chain![0]!)!;
    const b = pos.get(chain![1]!)!;
    const c = pos.get(chain![2]!)!;
    chainMat.opacity = 0.95 * walk!.alpha * dim;
    if (walk!.inked > 0 && (walk!.inked !== chainInked || chain !== inkedChain)) {
      chainInked = walk!.inked;
      inkedChain = chain;
      const k0 = Math.min(1, walk!.inked);
      const k1 = Math.max(0, walk!.inked - 1);
      chainPos[0] = a.x;
      chainPos[1] = a.y;
      chainPos[2] = a.z;
      chainPos[3] = a.x + (b.x - a.x) * k0;
      chainPos[4] = a.y + (b.y - a.y) * k0;
      chainPos[5] = a.z + (b.z - a.z) * k0;
      chainPos[6] = b.x;
      chainPos[7] = b.y;
      chainPos[8] = b.z;
      chainPos[9] = b.x + (c.x - b.x) * k1;
      chainPos[10] = b.y + (c.y - b.y) * k1;
      chainPos[11] = b.z + (c.z - b.z) * k1;
      chainBuffer.needsUpdate = true;
    }
    if (walk!.pulseHop >= 0) {
      bead.position.lerpVectors(walk!.pulseHop === 0 ? a : b, walk!.pulseHop === 0 ? b : c, walk!.pulseU);
    }
  };

  const lastScreen = new Map(nodes.map((n): [string, { x: number; y: number }] => [n.s, { x: 0, y: 0 }]));
  const screenV = new THREE.Vector3();
  const projectAll = (): void => {
    for (const n of nodes) {
      screenV.copy(pos.get(n.s)!).applyMatrix4(group.matrixWorld).project(camera);
      const at = lastScreen.get(n.s)!;
      at.x = ((screenV.x + 1) / 2) * W;
      at.y = ((1 - screenV.y) / 2) * H;
    }
  };

  const hitAt = (x: number, y: number): string | null => {
    ndc.set((x / W) * 2 - 1, -(y / H) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    let best: { d: number; s: string } | null = null;
    for (const k of Object.keys(meshes) as ConeKind[]) {
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
    if (!reduced) clock += dtMs;
    const kt = 1 - Math.exp(-dtMs / TILT_TAU_MS);
    tiltYaw += (tiltYawT - tiltYaw) * kt;
    tiltPitch += (tiltPitchT - tiltPitch) * kt;
    const yaw = (reduced ? 0.6 : (clock / PERIOD_MS) * Math.PI * 2) + 0.6 + tiltYaw;
    setCamera(yaw, (opts.pitch ?? 0.5) + tiltPitch);
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
    const walk = walker.frame(echoDoneAt === null ? null : clock - echoDoneAt, depthOf);

    for (const kind of Object.keys(meshes) as ConeKind[]) {
      const mesh = meshes[kind]!;
      const list = byKind[kind];
      for (let i = 0; i < list.length; i += 1) {
        const n = list[i];
        const v = vis.get(n.s) ?? 0;
        const p = pos.get(n.s)!;
        const lift = n.s === hover ? HERO_CHAIN.swell : 1 + (HERO_CHAIN.swell - 1) * litOf(n.s);
        const swell = v <= 0.001 ? 0 : RADIUS[kind] * (0.55 + 0.45 * v) * lift;
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

    drawChain(walk, dim);

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
  /** Reduced motion paints once per frame at most, so the mount and the typed headline share one still. */
  let stillPending = 0;
  const drawStill = (): void => {
    if (stillPending) return;
    stillPending = requestAnimationFrame(() => {
      stillPending = 0;
      if (!disposed) frame(16);
    });
  };
  if (reduced) {
    drawStill();
  } else {
    unregister = registerGatedFrameClient(host, ({ dtMs, factor }) => {
      if (disposed) return;
      frame(dtMs * Math.max(0.05, factor));
    });
  }
  const unwatch = opts.watch?.(() => {
    resize();
    if (reduced) drawStill();
  });

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
      const next = echoCount(typed, total, nodes.length);
      const changed = next !== litTarget;
      litTarget = next;
      echoing = true;
      if (echoDoneAt === null && nodes.length > 0 && next >= nodes.length) echoDoneAt = reduced ? clock : clock + ECHO_TAU_MS * 3;
      // Reduced motion draws only when the lit count moved, so a still page paints once.
      if (reduced && changed) drawStill();
    },
    litCount: () => Math.min(litTarget, nodes.length),
    activeChain: () =>
      chainOn && walker.chain()
        ? { nodes: walker.chain()!.map((s) => ({ s, x: lastScreen.get(s)?.x ?? 0, y: lastScreen.get(s)?.y ?? 0 })) }
        : null,
    nodesOnScreen: () => nodes.map((n) => ({ s: n.s, k: n.k, x: lastScreen.get(n.s)?.x ?? 0, y: lastScreen.get(n.s)?.y ?? 0 })),
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(stillPending);
      unregister?.();
      ro.disconnect();
      unwatch?.();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      sphere.dispose();
      chainGeom.dispose();
      for (const sprite of chainHalos) (sprite.material as THREE.Material).dispose();
      halo.dispose();
      for (const m of Object.values(materials)) m.dispose();
      for (const h of haloSprites) (h.sprite.material as THREE.Material).dispose();
      for (const m of [containsMat, spineMat, dependsMat, dependsGlowMat, beadMat, floorMat, chainMat]) m.dispose();
      for (const l of [containsLine, spineLine, dependsLine, dependsGlow]) l?.geometry.dispose();
      canvas.style.cursor = '';
      canvas.remove();
      lease.release();
    },
  };
}
