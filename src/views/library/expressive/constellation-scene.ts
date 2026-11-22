/** Draws the object `constellation-model.ts` describes in WebGL; owns materials, camera and frame. */

import * as THREE from "three";

import { ambientSleepFactor, isAmbientAsleep } from "@/widgets/ontology-map";

import {
  assemblyDurationMs,
  assemblyStep,
  LINK_ASSEMBLY,
  PAGE_ASSEMBLY,
  SOURCE_ASSEMBLY,
} from "./assembly";
import type { ConstellationMark, ConstellationModel } from "./constellation-model";

export interface ConstellationHandle {
  /** Redraw with a different folder; the arrival assembles the new shape. */
  setModel: (model: ConstellationModel) => void;
  dispose: () => void;
}

export interface ConstellationOptions {
  /** Element the design tokens are read from. Defaults to the document root. */
  tokenEl?: Element;
  /** Overrides the media query; the host already knows the answer. */
  reducedMotion?: boolean;
  /** Overall brightness, 0–1; a backdrop under a working screen takes it down. */
  dim?: number;
  /**
   * Camera distance in object radii; larger draws the object smaller. Size, not `dim`, decides
   * whether the object reads as the ground: a pane-sized sphere is a subject however dim it is.
   */
  distance?: number;
}

/** One CSS custom property as a colour, with a literal fallback if the token is absent. */
function cssColor(el: Element, name: string, fallback: string): THREE.Color {
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  try {
    return new THREE.Color(raw || fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

/** Radians per millisecond — one full turn in four minutes. */
const TURN_RATE = (Math.PI * 2) / 240_000;

/**
 * Time for the pointer tilt to cover 63% of its remaining distance. A fixed per-frame fraction is
 * a monitor setting, not a duration; 269 reproduces the 60Hz feel (`-16.67 / ln(0.94)`).
 */
const PARALLAX_TAU_MS = 269;

/** How far the tilt travels toward its target in `dtMs` of real time, 0-1; any split of the same time leaves the same remainder. */
export function parallaxFollow(dtMs: number): number {
  return 1 - Math.exp(-Math.max(0, dtMs) / PARALLAX_TAU_MS);
}

/** A page sphere's scale from its `weight` (documents it was written from); the build and every assembling frame share it. */
export function pageScaleFor(weight: number): number {
  return 0.85 + weight * 0.75;
}

export function mountLibraryConstellation(
  canvas: HTMLCanvasElement,
  initial: ConstellationModel,
  options: ConstellationOptions = {},
): ConstellationHandle | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
  } catch {
    // No WebGL: the host keeps its flat panel.
    return null;
  }

  const tokenEl = options.tokenEl ?? document.documentElement;
  const reduced =
    (options.reducedMotion ??
      (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches)) ||
    typeof IntersectionObserver === "undefined";
  const dim = options.dim ?? 1;

  // Lighting and fog multiply a token's contrast down, so the cube also gets emissive.
  const inkSource = cssColor(tokenEl, "--color-text-secondary", "#d2d0c9");
  const inkPage = cssColor(tokenEl, "--color-text-primary", "#f3f2ee");
  const accent = cssColor(tokenEl, "--color-indigo-accent", "#8fb0ea");
  const line = cssColor(tokenEl, "--color-indigo-brand", "#e9e7e0");

  renderer.setClearColor(0x000000, 0);
  // 1.5 is where an edge stops showing steps on a Retina display; 2 doubles the fill cost.
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  // Fog gives the object a far side; without it the sphere reads as a flat ring of marks.
  const fog = new THREE.Fog(0x05070c, 2.2, 6.2);
  scene.fog = fog;
  scene.add(new THREE.AmbientLight(0xffffff, 1.25 * dim));
  const key = new THREE.DirectionalLight(0xffffff, 1.8 * dim);
  key.position.set(2, 3, 2.5);
  scene.add(key);

  // Orthographic: perspective would divide the weight-scaled size by depth and reorder the weight encoding.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 24);
  const camDistance = options.distance ?? 2.95;
  const halfHeight = Math.tan((42 * Math.PI) / 180 / 2) * camDistance;

  const sourceGeom = new THREE.BoxGeometry(0.062, 0.062, 0.062);
  const pageGeom = new THREE.IcosahedronGeometry(0.046, 2);
  const sourceMat = new THREE.MeshStandardMaterial({
    color: inkSource,
    roughness: 0.38,
    metalness: 0.1,
    // Without the emissive floor a tumbling cube's shaded faces are not a visible mark.
    emissive: inkSource,
    emissiveIntensity: 0.22 * dim,
    transparent: true,
    opacity: 1,
  });
  const pageMat = new THREE.MeshStandardMaterial({
    color: inkPage,
    roughness: 0.28,
    metalness: 0.2,
    emissive: accent,
    emissiveIntensity: 0.85 * dim,
    transparent: true,
    opacity: 1,
  });
  const lineMat = new THREE.LineBasicMaterial({
    color: line,
    transparent: true,
    opacity: 0.75 * dim,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  let sources: THREE.InstancedMesh | null = null;
  let pages: THREE.InstancedMesh | null = null;
  let links: THREE.LineSegments | null = null;
  /** Null once everything has landed. */
  let assembling: {
    model: ConstellationModel;
    pageMarks: ConstellationMark[];
    sourceMarks: ConstellationMark[];
    startedAt: number;
    durationMs: number;
  } | null = null;
  const group = new THREE.Group();
  // The model works in a unit radius; a little wider than tall keeps the marks clear of the copy panel.
  group.scale.set(1.12, 1.12, 1.12);
  scene.add(group);

  const dummy = new THREE.Object3D();

  const clearBuilt = (): void => {
    for (const object of [sources, pages, links]) {
      if (!object) continue;
      group.remove(object);
      object.geometry.dispose?.();
    }
    sources = null;
    pages = null;
    links = null;
  };

  const build = (model: ConstellationModel): void => {
    clearBuilt();
    const pageMarks = model.marks.filter((mark) => mark.kind === "page");
    const sourceMarks = model.marks.filter((mark) => mark.kind === "source");
    // `build` writes the resting matrices; the assembly overwrites them each frame and ends on them exactly.
    assembling = {
      model,
      pageMarks,
      sourceMarks,
      startedAt: performance.now(),
      durationMs: reduced
        ? 0
        : assemblyDurationMs({
            sources: sourceMarks.length,
            pages: pageMarks.length,
            links: model.links.length,
          }),
    };

    if (sourceMarks.length > 0) {
      sources = new THREE.InstancedMesh(sourceGeom, sourceMat, sourceMarks.length);
      sourceMarks.forEach((mark, index) => {
        dummy.position.set(mark.x, mark.y, mark.z);
        // A fixed tumble per index keeps every mount identical; a square-on cube reads as a pixel.
        dummy.rotation.set(index * 0.7, index * 1.1, index * 0.3);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        sources!.setMatrixAt(index, dummy.matrix);
      });
      sources.instanceMatrix.needsUpdate = true;
      group.add(sources);
    }

    if (pageMarks.length > 0) {
      pages = new THREE.InstancedMesh(pageGeom, pageMat, pageMarks.length);
      pageMarks.forEach((mark, index) => {
        dummy.position.set(mark.x, mark.y, mark.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(pageScaleFor(mark.weight));
        dummy.updateMatrix();
        pages!.setMatrixAt(index, dummy.matrix);
      });
      pages.instanceMatrix.needsUpdate = true;
      group.add(pages);
    }

    if (model.links.length > 0) {
      const positions = new Float32Array(model.links.length * 6);
      model.links.forEach(([pageIndex, sourceIndex], index) => {
        const a = model.marks[pageIndex];
        const b = model.marks[sourceIndex];
        if (!a || !b) return;
        positions.set([a.x, a.y, a.z, b.x, b.y, b.z], index * 6);
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      links = new THREE.LineSegments(geometry, lineMat);
      group.add(links);
    }
  };

  build(initial);

  /** A mark's distance from the object's centre, which is also how far it has to travel. */
  const radiusOf = (mark: ConstellationMark): number =>
    Math.sqrt(mark.x * mark.x + mark.y * mark.y + mark.z * mark.z);

  /**
   * Re-places every instance for the current moment of the arrival; false once nothing is left
   * travelling. The final call writes the resting matrices exactly, so the settled object and the
   * reduced-motion still frame are the same picture.
   */
  const placeAssembling = (now: number): boolean => {
    if (!assembling) return false;
    // A zero-length assembly is already finished: reading the clock would place every mark at launch distance.
    const elapsed =
      assembling.durationMs <= 0 ? Number.POSITIVE_INFINITY : now - assembling.startedAt;
    const { sourceMarks, pageMarks, model } = assembling;

    if (sources) {
      sourceMarks.forEach((mark, index) => {
        // The mark's own radius sets its travel time: an outer-shell document must not arrive quicker.
        const step = assemblyStep(elapsed, index, SOURCE_ASSEMBLY, radiusOf(mark));
        dummy.position.set(mark.x * step.distance, mark.y * step.distance, mark.z * step.distance);
        dummy.rotation.set(index * 0.7 + step.spin, index * 1.1 + step.spin, index * 0.3);
        dummy.scale.setScalar(step.presence);
        dummy.updateMatrix();
        sources!.setMatrixAt(index, dummy.matrix);
      });
      sources.instanceMatrix.needsUpdate = true;
    }

    if (pages) {
      pageMarks.forEach((mark, index) => {
        const step = assemblyStep(elapsed, index, PAGE_ASSEMBLY, radiusOf(mark));
        dummy.position.set(mark.x * step.distance, mark.y * step.distance, mark.z * step.distance);
        dummy.rotation.set(step.spin, step.spin, 0);
        dummy.scale.setScalar(pageScaleFor(mark.weight) * step.presence);
        dummy.updateMatrix();
        pages!.setMatrixAt(index, dummy.matrix);
      });
      pages.instanceMatrix.needsUpdate = true;
    }

    if (links) {
      // A citation draws itself on from its page toward its source, the direction the fact runs.
      const position = links.geometry.getAttribute("position") as THREE.BufferAttribute;
      model.links.forEach(([pageIndex, sourceIndex], index) => {
        const a = model.marks[pageIndex];
        const b = model.marks[sourceIndex];
        if (!a || !b) return;
        const step = assemblyStep(elapsed, index, LINK_ASSEMBLY);
        position.setXYZ(index * 2, a.x, a.y, a.z);
        position.setXYZ(
          index * 2 + 1,
          a.x + (b.x - a.x) * step.progress,
          a.y + (b.y - a.y) * step.progress,
          a.z + (b.z - a.z) * step.progress,
        );
      });
      position.needsUpdate = true;
    }

    if (elapsed >= assembling.durationMs) {
      assembling = null;
      return false;
    }
    return true;
  };

  let width = 1;
  let height = 1;
  const resize = (): void => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    renderer.setSize(width, height, false);
    const halfWidth = halfHeight * (width / height);
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(() => {
    if (disposed) return;
    resize();
    if (!reduced) wake();
    else draw();
  });
  observer.observe(canvas);
  resize();

  let yaw = 0.6;
  let tiltYaw = 0;
  let tiltPitch = 0;
  let tiltYawTarget = 0;
  let tiltPitchTarget = 0;
  let disposed = false;

  const draw = (): void => {
    const pitch = 0.28 + tiltPitch;
    const angle = yaw + tiltYaw;
    camera.position.set(
      Math.sin(angle) * Math.cos(pitch) * camDistance,
      Math.sin(pitch) * camDistance,
      Math.cos(angle) * Math.cos(pitch) * camDistance,
    );
    camera.lookAt(0, 0, 0);
    fog.near = camDistance - 1.2;
    fog.far = camDistance + 2.6;
    renderer.render(scene, camera);
  };

  let raf: number | null = null;
  let inViewport = false;
  let suspendedAt: number | null = performance.now();
  let viewport: IntersectionObserver | null = null;
  let lastInput = performance.now();
  let previous = performance.now();

  const loop = (now: number): void => {
    raf = null;
    if (disposed) return;
    if (document.hidden || !inViewport) { park(); return; }
    const dt = Math.min(64, now - previous);
    previous = now;
    // The arrival outranks the sleep: `ambientSleepFactor` counts from the last input, which an assembling object has not had.
    const wasAssembling = assembling !== null;
    placeAssembling(now);
    const factor = ambientSleepFactor(now, lastInput);
    // The final assembly frame paints before sleep releases the frame.
    if (
      !wasAssembling &&
      isAmbientAsleep(factor) &&
      Math.abs(tiltYaw - tiltYawTarget) < 1e-4 &&
      Math.abs(tiltPitch - tiltPitchTarget) < 1e-4
    ) {
      park();
      return;
    }
    yaw += dt * TURN_RATE * factor;
    const follow = parallaxFollow(dt);
    tiltYaw += (tiltYawTarget - tiltYaw) * follow;
    tiltPitch += (tiltPitchTarget - tiltPitch) * follow;
    draw();
    raf = requestAnimationFrame(loop);
  };

  function park(): void {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    suspendedAt ??= performance.now();
  }
  function wake(): void {
    if (disposed || reduced || document.hidden || !inViewport) return;
    const now = performance.now();
    lastInput = now;
    if (raf !== null) return;
    if (assembling && suspendedAt !== null) {
      assembling.startedAt += now - Math.max(suspendedAt, assembling.startedAt);
    }
    suspendedAt = null;
    previous = now;
    raf = requestAnimationFrame(loop);
  }
  const onVisibility = (): void => {
    if (document.hidden) park();
    else wake();
  };

  const onPointerMove = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    tiltYawTarget = (event.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
    tiltPitchTarget = -((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 0.4;
    tiltYawTarget *= 0.12;
    tiltPitchTarget *= 0.12;
    wake();
  };

  // Leaving the object's box returns it to square instead of freezing at the last tilt.
  const onPointerLeave = (): void => {
    tiltYawTarget = 0;
    tiltPitchTarget = 0;
    wake();
  };

  // The object's own box, never `window`, or the backdrop leans as the cursor crosses the screen; the parent is the target because the vignette takes events.
  const pointerHost: HTMLElement = canvas.parentElement ?? canvas;

  if (reduced) {
    // `durationMs` is 0 under reduced motion, so this call lands every mark home: one still frame.
    placeAssembling(performance.now());
    draw();
  } else {
    pointerHost.addEventListener("pointermove", onPointerMove, { passive: true });
    pointerHost.addEventListener("pointerleave", onPointerLeave, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    viewport = new IntersectionObserver((entries) => {
      const entry = entries.at(-1);
      if (!entry) return;
      inViewport = entry.isIntersecting;
      if (inViewport) wake();
      else park();
    });
    viewport.observe(canvas);
  }

  return {
    setModel: (model: ConstellationModel) => {
      if (disposed) return;
      build(model);
      if (reduced) {
        placeAssembling(performance.now());
        draw();
      } else {
        wake();
      }
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      park();
      viewport?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      pointerHost.removeEventListener("pointermove", onPointerMove);
      pointerHost.removeEventListener("pointerleave", onPointerLeave);
      observer.disconnect();
      clearBuilt();
      sourceGeom.dispose();
      pageGeom.dispose();
      sourceMat.dispose();
      pageMat.dispose();
      lineMat.dispose();
      renderer.dispose();
    },
  };
}
