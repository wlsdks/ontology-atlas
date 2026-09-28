/**
 * **The Library's constellation, lit** — the object `constellation-model.ts` describes,
 * drawn in WebGL behind the Library's own copy.
 *
 * This file owns materials, the camera, the frame and nothing else. Where the marks go is
 * the model's question and is answered without a GPU; what colour and how bright is this
 * file's, and it reads every value from the design system rather than inventing one.
 *
 * ## The motion, and the one it must not be
 *
 * ⚠️ **The Library already reversed an ambient wriggle once.** On 2026-09-08 the owner
 * killed the 2D graph's 0.28px/7.2s drift — *"why does it wriggle whenever I put the mouse
 * on the graph? it is hard to look at"* — and the rule that survived is that motion on
 * that canvas is only ever the answer to something a person did. That canvas is a picture
 * a person is **reading**; this one is a backdrop behind a title and a button, which is
 * the one place where a slow ambient turn is the point rather than an irritation. The two
 * are kept apart by three things:
 *
 *   - it is **slow** — a full turn takes minutes, not seconds, so nothing crosses the eye
 *     while a sentence is being read;
 *   - it **sleeps** — `ambientSleepFactor` decelerates it to a full stop 30s after the
 *     last input, the same contract the map keeps, so a screen left open costs nothing;
 *   - it **stops dead under reduced motion** — one still frame of the same object, drawn
 *     once, with no loop registered at all.
 *
 * Pointer parallax is deliberately tiny (±0.06 rad) and answers only a hand inside the
 * object's own box. The object should feel like it has depth when a hand moves over it,
 * not follow the cursor across the screen — a backdrop that leans while somebody reaches
 * for the button is the same wriggle under another name.
 *
 * ## Why instanced solids rather than points
 *
 * The owner asked for *geometric shapes*, and a sprite field cannot occlude. Real cubes
 * and spheres pass in front of each other, which is what makes the object read as having
 * a near and a far side — the same reason the download hero draws lit solids rather than
 * the 2D engine's dots. Two `InstancedMesh`es and one `LineSegments` is three draw calls
 * whatever the folder's size, so the cost is flat.
 */

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
  /** Redraw with a different folder — the empty state's object becoming the person's. */
  setModel: (model: ConstellationModel) => void;
  dispose: () => void;
}

export interface ConstellationOptions {
  /** Element the design tokens are read from. Defaults to the document root. */
  tokenEl?: Element;
  /** Overrides the media query; the host already knows the answer. */
  reducedMotion?: boolean;
  /**
   * Overall brightness, 0–1. The workbench draws the object under a working screen and
   * takes it down; the empty state has nothing to compete with and leaves it at 1.
   */
  dim?: number;
  /**
   * Camera distance in object radii — larger draws the object smaller.
   *
   * ⚠️ **Brightness alone cannot make a backdrop subordinate.** The workbench's first
   * build reused the empty state's framing at a third of the light and the object still
   * won the screen: a sphere the size of the pane is a subject however dim it is, and its
   * marks landed on the stepper's own type. Size is the axis that decides whether a thing
   * is the ground; `dim` only decides how loud the ground is.
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
 * How long the pointer tilt takes to cover 63% of its remaining distance.
 *
 * ⚠️ **A fixed per-frame fraction is a monitor setting, not a duration** (design-motion,
 * 2026-09-09). The tilt used to move 6% of the way home every frame, which is 278ms to
 * settle on a 60Hz display, 139ms on 120Hz and 556ms on 30Hz — the same gesture felt
 * different on every screen, and a dropped frame changed it mid-move. This is the time
 * constant that reproduces the old 60Hz feel exactly (`-16.67 / ln(0.94)`), now applied
 * against real elapsed time so every display gets that one answer.
 */
const PARALLAX_TAU_MS = 269;

/**
 * How far the tilt travels toward its target in `dtMs` of real time, 0-1.
 *
 * Exported because it is the whole of the fix and the only part of it that can be checked
 * without a GPU: feed it any division of the same elapsed time and the remaining distance
 * is the same number, which is exactly what the fraction it replaced could not do.
 */
export function parallaxFollow(dtMs: number): number {
  return 1 - Math.exp(-Math.max(0, dtMs) / PARALLAX_TAU_MS);
}

/**
 * How large a page's sphere is drawn, relative to the geometry — the `weight` channel.
 *
 * Weight is how many documents the page was written from, and this is the only place it
 * becomes a size. It is a lone function so that the two call sites (the first build and
 * every assembling frame) cannot drift apart, and so the channel can be checked.
 */
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
    // No WebGL is not an error worth showing anybody: the host keeps its flat panel and
    // the screen is the one that shipped before this file existed.
    return null;
  }

  const tokenEl = options.tokenEl ?? document.documentElement;
  const reduced =
    options.reducedMotion ??
    (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const dim = options.dim ?? 1;

  /*
   * ⚠️ **A token's text contrast is not its rendered contrast** (design-infoviz, 2026-09-09).
   * `--color-text-tertiary` measures 6.13:1 as type on this very screen; the same value
   * through `MeshStandardMaterial` and fog composited to **1.80:1 lit / 1.19:1 shaded** —
   * the lighting model multiplied it down about 60%, and no ramp check can see that.
   *
   * The owner settled what the cube is for on the same day: *"I want the cool thing where
   * the cubes assemble themselves."* A mark somebody is meant to watch assemble is a mark
   * they have to be able to see, so the cube takes the primary ink and the material stops
   * eating it — `--color-text-secondary` as the base, roughness down and emissive on, which
   * is what lifts the shaded faces rather than only the lit one.
   */
  const inkSource = cssColor(tokenEl, "--color-text-secondary", "#d0d6e0");
  const inkPage = cssColor(tokenEl, "--color-text-primary", "#f7f8f8");
  const accent = cssColor(tokenEl, "--color-indigo-accent", "#7170ff");
  const line = cssColor(tokenEl, "--color-indigo-brand", "#5e6ad2");

  renderer.setClearColor(0x000000, 0);
  // 1.5 is where an edge stops showing steps on a Retina display; 2 doubles the fill cost
  // for something sitting behind a panel of text.
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  /*
   * Fog is what gives the object a far side. Without it the back half draws at the same
   * brightness as the front and the sphere reads as a flat ring of marks.
   */
  const fog = new THREE.Fog(0x05070c, 2.2, 6.2);
  scene.fog = fog;
  scene.add(new THREE.AmbientLight(0xffffff, 1.25 * dim));
  const key = new THREE.DirectionalLight(0xffffff, 1.8 * dim);
  key.position.set(2, 3, 2.5);
  scene.add(key);

  /*
   * ⚠️ **Orthographic, because a perspective camera was silently destroying an encoding**
   * (design-infoviz, 2026-09-09). A page's sphere is scaled by `weight` over a 1.88x ramp,
   * but under perspective its *screen* size is that ramp divided by depth, and the marks
   * span 2.38-3.36 in depth — a 1.41x range that overlaps the signal. Measured on the
   * shipped frame, weight 0.25 drew at 12.89px while weight 0.50 drew at 10.88px, and
   * weight 1.00 and 0.75 differed by 0.5%. An ordered channel that does not preserve order
   * is not an encoding, and the turn meant it was re-ordered every second on constant data.
   *
   * Re-measured over the whole anonymous object at 440px, projecting every page mark
   * through both cameras: perspective renders **3 of 28** weight-ordered pairs backwards,
   * and draws three pages of *identical* weight at 9.05, 9.05 and 12.89px — a 1.42x spread
   * carrying no information at all. Orthographic renders **0 of 28** backwards and gives
   * one weight one size (10.38 / 12.26 / 14.14 / 16.01 for the four weights present).
   *
   * An orthographic projection has no depth term, so a sphere's size on screen is its
   * weight and nothing else, at every angle of the turn. The near and far sides are still
   * told apart, by the two channels that survive the change: fog, and the occlusion that
   * made solids worth drawing in the first place.
   *
   * The frustum is derived from the old framing rather than re-tuned, so both call sites
   * keep the size they were measured at: half-height is `tan(42deg / 2) * distance`, the
   * height a 42-degree lens covered at that distance.
   */
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 24);
  const camDistance = options.distance ?? 2.95;
  /** The frame the retired 42-degree lens covered at this distance. */
  const halfHeight = Math.tan((42 * Math.PI) / 180 / 2) * camDistance;

  const sourceGeom = new THREE.BoxGeometry(0.062, 0.062, 0.062);
  const pageGeom = new THREE.IcosahedronGeometry(0.046, 2);
  const sourceMat = new THREE.MeshStandardMaterial({
    color: inkSource,
    roughness: 0.38,
    metalness: 0.1,
    // The emissive floor is what fixes the *shaded* faces: a cube tumbling in shows its
    // dark sides for most of its travel, and at 1.19:1 those sides were not a mark at all.
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
  /** What is currently coming together, and since when. Null once everything has landed. */
  let assembling: {
    model: ConstellationModel;
    pageMarks: ConstellationMark[];
    sourceMarks: ConstellationMark[];
    startedAt: number;
    durationMs: number;
  } | null = null;
  const group = new THREE.Group();
  // The model works in a unit radius; the object reads better a little wider than tall,
  // which is also what keeps its marks out from behind a 640px panel of copy.
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
    /*
     * Held so `placeAssembling` can re-place every instance each frame while the object is
     * coming together. `build` writes the resting matrices; the assembly overwrites them
     * for as long as it runs and then writes them one last time, exactly, so a settled
     * object is bit-identical to one that never animated.
     */
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
        // A fixed tumble per index rather than a random one: the object must be identical
        // on every mount, and a cube seen square-on reads as a pixel rather than a solid.
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
        // Weight is the object's foreground: the page that gathered the most documents is
        // half again the size of one written from a single file.
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

  /**
   * Re-place every instance for the current moment of the arrival.
   *
   * Returns false once nothing is left travelling, which is the host's signal to stop
   * stepping and hand the object to the ambient turn. The final call writes the resting
   * matrices exactly — `assemblyStep` returns `distance: 1, spin: 0` past a mark's travel —
   * so the settled object and the reduced-motion still frame are the same picture.
   */
  /** A mark's distance from the object's centre, which is also how far it has to travel. */
  const radiusOf = (mark: ConstellationMark): number =>
    Math.sqrt(mark.x * mark.x + mark.y * mark.y + mark.z * mark.z);

  const placeAssembling = (now: number): boolean => {
    if (!assembling) return false;
    /*
     * ⚠️ **A zero-length assembly is "already finished", not "just started."**
     *
     * Under reduced motion `build` sets `durationMs` to 0, and reading the clock here gave
     * `elapsed ≈ 0` — which `assemblyStep` correctly reports as *before this mark's stride
     * begins*: launch distance, `presence: 0`. Every mark was then placed off-frame at zero
     * scale and the assembly cleared itself on the same call, so the reduced-motion viewer
     * got an **empty canvas** instead of the still object. Caught by the contract case that
     * pins one still frame, before it reached anybody.
     */
    const elapsed =
      assembling.durationMs <= 0 ? Number.POSITIVE_INFINITY : now - assembling.startedAt;
    const { sourceMarks, pageMarks, model } = assembling;

    if (sources) {
      sourceMarks.forEach((mark, index) => {
        // The mark's own radius sets how long it is given: an outer-shell document has
        // further to come than an inner write-up and must not arrive quicker for it.
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
      /*
       * A citation is not a thing that flies; it is what is left once both its ends have
       * landed. So each line draws itself on from its page toward its source, which is the
       * direction the fact runs.
       */
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
    // Fit the height and let the width follow the box, which is what the perspective
    // camera's vertical field of view did.
    const halfWidth = halfHeight * (width / height);
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
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

  let raf = 0;
  let lastInput = performance.now();
  let previous = performance.now();

  const loop = (now: number): void => {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(64, now - previous);
    previous = now;
    /*
     * The arrival outranks the sleep. `ambientSleepFactor` measures time since the last
     * *input*, and an object that is still coming together has had no input since it
     * started — so without this an assembly begun on a screen somebody opened and then sat
     * still in front of would freeze halfway. An object mid-arrival is not idle.
     */
    const stillAssembling = placeAssembling(now);
    const factor = ambientSleepFactor(now, lastInput);
    // Asleep and settled: nothing has changed, so nothing is drawn. rAF keeps ticking so
    // any input wakes it on the very next frame, which is the map's own conservative rule.
    if (
      !stillAssembling &&
      isAmbientAsleep(factor) &&
      Math.abs(tiltYaw - tiltYawTarget) < 1e-4 &&
      Math.abs(tiltPitch - tiltPitchTarget) < 1e-4
    ) {
      return;
    }
    yaw += dt * TURN_RATE * factor;
    // Exponential approach over elapsed time: identical at 60Hz to the fraction it
    // replaces, and now identical to itself at 30 and 120.
    const follow = parallaxFollow(dt);
    tiltYaw += (tiltYawTarget - tiltYaw) * follow;
    tiltPitch += (tiltPitchTarget - tiltPitch) * follow;
    draw();
  };

  const onPointerMove = (event: PointerEvent): void => {
    lastInput = performance.now();
    const rect = canvas.getBoundingClientRect();
    tiltYawTarget = (event.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
    tiltPitchTarget = -((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 0.4;
    tiltYawTarget *= 0.12;
    tiltPitchTarget *= 0.12;
  };

  /*
   * Leaving the object's own box returns it to square rather than freezing it at the tilt
   * the cursor left behind. A backdrop holding a lean nobody is causing is the same
   * complaint as one that moves for no reason.
   */
  const onPointerLeave = (): void => {
    lastInput = performance.now();
    tiltYawTarget = 0;
    tiltPitchTarget = 0;
  };

  /*
   * ⚠️ **Scoped to the object's own box, never `window`** (design-motion, 2026-09-09).
   * Listening on `window` meant the backdrop leaned every time the cursor crossed the
   * screen on its way to the call to action or the rail — motion in answer to something
   * that had nothing to do with the object. That is precisely the mechanism behind the
   * 2026-09-08 complaint this file's header was written against (*"why does it wriggle
   * whenever I put the mouse on the graph?"*), reintroduced one surface over.
   *
   * The parent is the target rather than the canvas itself because the vignette is laid
   * over the canvas and takes the events; the box is the same box either way.
   */
  const pointerHost: HTMLElement = canvas.parentElement ?? canvas;

  if (reduced) {
    // `durationMs` is 0 under reduced motion, so this one call lands every mark exactly
    // home and clears the assembly. One still frame of the same object, no arrival.
    placeAssembling(performance.now());
    draw();
  } else {
    pointerHost.addEventListener("pointermove", onPointerMove, { passive: true });
    pointerHost.addEventListener("pointerleave", onPointerLeave, { passive: true });
    raf = requestAnimationFrame(loop);
  }

  return {
    setModel: (model: ConstellationModel) => {
      if (disposed) return;
      // `build` re-arms the arrival, so a folder that grows assembles its new shape rather
      // than cutting to it — which is the Library's "data accumulating" animation.
      build(model);
      if (reduced) {
        placeAssembling(performance.now());
        draw();
      } else {
        lastInput = performance.now();
      }
    },
    dispose: () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
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
