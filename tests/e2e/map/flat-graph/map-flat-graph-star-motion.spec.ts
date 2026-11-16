import { expect, test, type Page } from "@playwright/test";

import { canvasBox, elementsByContainer, openDogfoodFlat, readDial, settleSelection } from "./domain-star";

/** The fastest any mark of an opening star may change its radius, in px per ms (2 px per 60 Hz frame). */
const RADIUS_PX_PER_MS = 0.12;
/** The largest zoom step per 60 Hz frame, as a share of the zoom. */
const ZOOM_STEP_PER_FRAME = 0.08;
/** The largest radius step any mark takes in one drawn frame, however long the frame took, in px. */
const RADIUS_STEP_PX = 3.4;
/** The largest change of a name's drawn ink per 60 Hz frame. */
const NAME_INK_STEP_PER_FRAME = 0.2;
const FRAME_MS = 1000 / 60;
/** The press shows on the map by this animation frame after it. */
const FIRST_FRAME = 3;
const OVERLAP_PX = 0.5;
/** A retarget lands this far into an opening. */
const RETARGET_AFTER_MS = 150;

/** A mark: id, centre, radius, and whether it is an element dot grown past its resting radius (a disc reads false). */
type SampledMark = [string, number, number, number, boolean, boolean];
/** A name: id, role, glyph box, ink, whether it draws on a backing, and the side of its mark it stands on. */
type SampledName = [string, string, number, number, number, number, number, boolean, number];
type Sample = { t: number; zoom: number; w: number; h: number; marks: SampledMark[]; names: SampledName[] };

/**
 * The resting overview with the dock closed, read on seven opens of the commit before the opened
 * star named every member: these title and caption rows on every open, and between the fewest and
 * the most capability names. The overview admits names per zoom step from the steps its entry
 * passed through, so two neighbours may trade places between opens; the count may not change.
 */
const OVERVIEW_TITLES: readonly string[] = [
  "domain domain:agent-access",
  "domain domain:code-evidence",
  "domain domain:human-workbench",
  "domain domain:meaning-layer",
  "project project:ontology-atlas",
  "units domain:agent-access",
  "units domain:code-evidence",
  "units domain:human-workbench",
  "units domain:meaning-layer",
  "units project:ontology-atlas",
];
const OVERVIEW_CAPABILITY_NAMES: Record<string, { fewest: number; most: number }> = {
  "1410x840": { fewest: 16, most: 17 },
  "1280x800": { fewest: 17, most: 17 },
};

/** A domain's census and reach rows share one slot under its name, so their cross-fade is no crossing. */
const CAPTION_ROLES = new Set(["units", "status"]);
/** A name whose ink falls is on its way out and may be crossed, if it is gone within this many frames of starting to fall. */
const LEAVING_FRAMES = 10;

interface Motion {
  radiusPxPerMs: number;
  worst: string;
  radiusStepPx: number;
  inkStep: number;
  worstInk: string;
  /** Names of the watched star drawn once the motion settles, and how many of them draw on a backing. */
  restNames: number;
  backedNames: number;
  zoomStep: number;
  overlapFrames: number;
  overlapPairs: string[];
  /** Frames with a name over another name or over a capability or domain disc not its own. */
  nameFrames: number;
  namePairs: string[];
  /** Frames with a name off its backing over an element dot grown past its resting radius. */
  dotFrames: number;
  dotPairs: string[];
  /** Names that fell while crossed and were not gone within `LEAVING_FRAMES`, or rose again before they were. */
  lingering: string[];
  /** Crossings already drawn in the last frame before the press, the resting overview's own, skipped until they part. */
  standing: string[];
  firstFrameMs: number;
  /** The animation frame after the press that first changed the map. */
  firstFrame: number;
  /** The longest of the first three frame intervals after the press, and the median interval, in ms. */
  pressFrameMs: number;
  medianFrameMs: number;
  totalMs: number;
  zoomReversals: number;
  radiusReversals: string[];
}

/** Samples the drawn marks in `ids` on every animation frame until `stopSampling`. */
async function startSampling(page: Page, ids: readonly string[]): Promise<void> {
  await page.evaluate((watched) => {
    const w = window as unknown as { __starSamples: Sample[]; __starSampling: boolean; __starPressAt: number | null };
    const keep = new Set(watched);
    w.__starSamples = [];
    w.__starSampling = true;
    w.__starPressAt = null;
    addEventListener("pointerdown", () => { w.__starPressAt ??= performance.now(); }, { capture: true, once: true });
    addEventListener("keydown", () => { w.__starPressAt ??= performance.now(); }, { capture: true, once: true });
    const tick = (t: number) => {
      type Box = { minX: number; maxX: number; minY: number; maxY: number };
      type Text = { id: string; role: string; box: Box; alpha: number; backed: boolean; side: number };
      const d = window.__atlasMap!.dial!() as { zoomRatio: number; discs: { id: string | null; x: number; y: number; r: number }[]; glyphs: { id: string | null; x: number; y: number; r: number; grown: boolean }[]; texts: Text[]; fadingTexts: Text[] };
      const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='ontology-map-canvas']")!;
      w.__starSamples.push({
        t, zoom: d.zoomRatio, w: canvas.clientWidth, h: canvas.clientHeight,
        marks: [
          ...d.discs.filter((m) => m.id !== null && keep.has(m.id)).map((m): SampledMark => [m.id!, m.x, m.y, m.r, false, true]),
          ...d.glyphs.filter((m) => m.id !== null && keep.has(m.id)).map((m): SampledMark => [m.id!, m.x, m.y, m.r, m.grown, false]),
        ],
        // A name no longer admitted is still painted while its ink runs out, so it is read like any other.
        names: [...d.texts, ...d.fadingTexts].filter((n) => keep.has(n.id)).map((n): SampledName => [n.id, n.role, n.box.minX, n.box.maxX, n.box.minY, n.box.maxY, n.alpha, n.backed, n.side]),
      });
      if (w.__starSampling) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, ids);
}

async function stopSampling(page: Page): Promise<{ samples: Sample[]; pressAt: number }> {
  await settleSelection(page);
  return page.evaluate(() => new Promise<{ samples: Sample[]; pressAt: number }>((resolve) => {
    const w = window as unknown as { __starSamples: Sample[]; __starSampling: boolean; __starPressAt: number | null };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      w.__starSampling = false;
      resolve({ samples: w.__starSamples, pressAt: w.__starPressAt ?? Number.NaN });
    }));
  }));
}

/**
 * Every frame-to-frame figure the limits read, normalised by the measured frame time. A backed name
 * (one held in place with no side clear of the marks) draws on the canvas ground, so it is checked
 * against other names, not against marks.
 */
/** One crossing in a frame: its pair, whether it is an unbacked name on a grown dot, and which of its names are falling. */
type Crossing = { pair: string; dot: boolean; falling: string[] };

/**
 * Every name of `group` drawn over another name, over a disc not its own, or off its backing over a
 * grown element dot, in `now`. A domain's census and reach rows share one slot, so their cross-fade
 * is no crossing. A name whose ink is lower than in `prev` is falling.
 */
function crossingsOf(now: Sample, prev: Sample | null, group: ReadonlySet<string>): Crossing[] {
  const marks = now.marks.filter(([id]) => group.has(id));
  const names = now.names.filter(([id]) => group.has(id));
  const fallingKey = ([id, role, , , , , alpha, , side]: SampledName): string | null => {
    const inkWas = prev?.names.find(([pid, prole, , , , , , , pside]) => pid === id && prole === role && pside === side)?.[6];
    return inkWas !== undefined && alpha < inkWas ? `${role} ${id} ${side}` : null;
  };
  const out: Crossing[] = [];
  for (let a = 0; a < names.length; a += 1) {
    const [ia, ra, minX, maxX, minY, maxY, , backed] = names[a]!;
    const fallingA = fallingKey(names[a]!);
    for (const [im, x, y, r, grown, disc] of marks) {
      if (im === ia || (!disc && (!grown || backed))) continue;
      const gap = Math.hypot(Math.max(minX - x, 0, x - maxX), Math.max(minY - y, 0, y - maxY));
      if (gap < r - OVERLAP_PX) out.push({ pair: `${ra} ${ia} on ${im}`, dot: !disc, falling: fallingA ? [fallingA] : [] });
    }
    for (let b = a + 1; b < names.length; b += 1) {
      const [ib, rb, bMinX, bMaxX, bMinY, bMaxY] = names[b]!;
      if (ib === ia && CAPTION_ROLES.has(ra) && CAPTION_ROLES.has(rb)) continue;
      if (Math.min(maxX, bMaxX) > Math.max(minX, bMinX) && Math.min(maxY, bMaxY) > Math.max(minY, bMinY)) {
        const fallingB = fallingKey(names[b]!);
        out.push({ pair: [`${ra} ${ia}`, `${rb} ${ib}`].sort().join(" on "), dot: false, falling: [fallingA, fallingB].filter((k): k is string => k !== null) });
      }
    }
  }
  return out;
}

function motionOf({ samples, pressAt }: { samples: Sample[]; pressAt: number }, groups: readonly ReadonlySet<string>[]): Motion {
  let radiusPxPerMs = 0;
  let worst = "";
  let radiusStepPx = 0;
  let inkStep = 0;
  let worstInk = "";
  let zoomStep = 0;
  let overlapFrames = 0;
  const overlapPairs = new Set<string>();
  let nameFrames = 0;
  const namePairs = new Set<string>();
  let dotFrames = 0;
  const dotPairs = new Set<string>();
  let firstChange = Number.NaN;
  let lastChange = Number.NaN;
  let zoomSign = 0;
  let zoomReversals = 0;
  const radiusSign = new Map<string, number>();
  const radiusReversals = new Set<string>();
  const lingering = new Set<string>();
  /** Per name on its way out: the frame its ink started to fall, and whether a crossing was let pass for it. */
  const leaving = new Map<string, { since: number; crossed: boolean }>();
  const prePress = samples.filter((s) => s.t < pressAt);
  const standing = new Set(prePress.length > 0 ? groups.flatMap((group) => crossingsOf(prePress.at(-1)!, null, group).map((c) => c.pair)) : []);
  const standingSeen = [...standing];
  for (let i = 0; i < samples.length; i += 1) {
    const now = samples[i]!;
    const prev = i > 0 ? samples[i - 1]! : null;
    const at = `${Math.round(now.t - pressAt)} ms, zoom ${now.zoom.toFixed(2)}`;
    const stillStanding = new Set<string>();
    const present = new Set<string>();
    for (const group of groups) {
      const marks = now.marks.filter(([id]) => group.has(id));
      let pairs = 0;
      for (let a = 0; a < marks.length; a += 1) {
        for (let b = a + 1; b < marks.length; b += 1) {
          const [ia, xa, ya, ra] = marks[a]!;
          const [ib, xb, yb, rb] = marks[b]!;
          if (Math.hypot(xa - xb, ya - yb) < ra + rb - OVERLAP_PX) {
            pairs += 1;
            overlapPairs.add(`${ia} x ${ib} (${Math.hypot(xa - xb, ya - yb).toFixed(1)} < ${ra.toFixed(1)} + ${rb.toFixed(1)} at ${Math.round(now.t - pressAt)} ms, zoom ${now.zoom.toFixed(2)})`);
          }
        }
      }
      if (pairs > 0) overlapFrames += 1;
      // Names are judged from the last frame before the press on: what stood before it is the overview's.
      if (i < prePress.length - 1) continue;
      for (const [id, role, , , , , alpha, , side] of now.names) {
        if (!group.has(id)) continue;
        const key = `${role} ${id} ${side}`;
        present.add(key);
        const inkWas = prev?.names.find(([pid, prole, , , , , , , pside]) => pid === id && prole === role && pside === side)?.[6];
        const out = leaving.get(key);
        if (inkWas !== undefined && alpha < inkWas) {
          if (!out) leaving.set(key, { since: i, crossed: false });
          else if (out.crossed && i - out.since >= LEAVING_FRAMES) {
            lingering.add(`${key} still at ink ${alpha.toFixed(2)} ${i - out.since} frames after it started to leave, at ${at}`);
            leaving.delete(key);
          }
        } else if (out) {
          if (out.crossed && alpha > 0) lingering.add(`${key} rose again before it was gone, at ${at}`);
          leaving.delete(key);
        }
      }
      let crossings = 0;
      let onDots = 0;
      for (const c of crossingsOf(now, prev, group)) {
        if (standing.has(c.pair)) {
          stillStanding.add(c.pair);
          continue;
        }
        if (c.falling.length > 0) {
          for (const key of c.falling) {
            const out = leaving.get(key);
            if (out) out.crossed = true;
          }
          continue;
        }
        if (c.dot) {
          onDots += 1;
          dotPairs.add(`${c.pair} at ${at}`);
        } else {
          crossings += 1;
          namePairs.add(`${c.pair} at ${at}`);
        }
      }
      if (onDots > 0) dotFrames += 1;
      if (crossings > 0) nameFrames += 1;
    }
    if (i >= prePress.length - 1) for (const pair of standing) if (!stillStanding.has(pair)) standing.delete(pair);
    for (const key of leaving.keys()) if (!present.has(key)) leaving.delete(key);
    if (i === 0) continue;
    const before = samples[i - 1]!;
    const dt = now.t - before.t;
    if (!(dt > 0)) continue;
    let changed = Math.abs(now.zoom - before.zoom) > 1e-6;
    const step = Math.exp(Math.abs(Math.log(now.zoom / before.zoom)) * (FRAME_MS / dt)) - 1;
    zoomStep = Math.max(zoomStep, step);
    if (Math.abs(now.zoom - before.zoom) > 1e-6) {
      const sign = Math.sign(now.zoom - before.zoom);
      if (zoomSign !== 0 && sign !== zoomSign) zoomReversals += 1;
      zoomSign = sign;
    }
    const was = new Map(before.marks.map(([id, , , r]) => [id, r]));
    for (const [id, , , r] of now.marks) {
      const prior = was.get(id);
      if (prior === undefined || Math.abs(r - prior) < 1e-3) continue;
      changed = true;
      const speed = Math.abs(r - prior) / dt;
      if (speed > radiusPxPerMs) {
        radiusPxPerMs = speed;
        worst = `${id} ${prior.toFixed(2)} -> ${r.toFixed(2)} px in ${dt.toFixed(1)} ms at ${Math.round(now.t - pressAt)} ms`;
      }
      radiusStepPx = Math.max(radiusStepPx, Math.abs(r - prior));
      const sign = Math.sign(r - prior);
      const seen = radiusSign.get(id) ?? 0;
      if (seen !== 0 && sign !== seen && Math.abs(r - prior) > 0.05) radiusReversals.add(id);
      radiusSign.set(id, sign);
    }
    // A name that was not drawn the frame before arrives from no ink, unless it comes in over the canvas edge.
    // A name that changes side fades out where it stood and in where it goes, so each side is its own name here.
    const inkWas = new Map(before.names.map(([id, role, , , , , alpha, , side]) => [`${role} ${id} ${side}`, alpha]));
    for (const [id, role, minX, maxX, minY, maxY, alpha, , side] of now.names) {
      const prior = inkWas.get(`${role} ${id} ${side}`) ?? (minX > 0 && minY > 0 && maxX < now.w && maxY < now.h ? 0 : alpha);
      const step = Math.abs(alpha - prior) * (FRAME_MS / Math.max(dt, FRAME_MS));
      if (step > inkStep) {
        inkStep = step;
        worstInk = `${role} ${id} ${prior.toFixed(2)} -> ${alpha.toFixed(2)} in ${dt.toFixed(1)} ms at ${Math.round(now.t - pressAt)} ms`;
      }
    }
    if (changed) {
      if (Number.isNaN(firstChange)) firstChange = now.t;
      lastChange = now.t;
    }
  }
  const gaps = samples.slice(1).map((s, i) => [s.t, s.t - samples[i]!.t] as const);
  const afterPress = gaps.filter(([t]) => t > pressAt).slice(0, 3).map(([, gap]) => gap);
  const sorted = gaps.map(([, gap]) => gap).sort((a, b) => a - b);
  const rest = samples.at(-1)?.names.filter(([id]) => groups.some((g) => g.has(id))) ?? [];
  return {
    pressFrameMs: Math.max(0, ...afterPress), medianFrameMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
    restNames: rest.length, backedNames: rest.filter(([, , , , , , , backed]) => backed).length,
    radiusPxPerMs, worst, radiusStepPx, inkStep, worstInk, zoomStep, overlapFrames, overlapPairs: [...overlapPairs].slice(0, 6), nameFrames, namePairs: [...namePairs].slice(0, 6), dotFrames, dotPairs: [...dotPairs].slice(0, 6), lingering: [...lingering].slice(0, 6), standing: standingSeen,
    firstFrameMs: firstChange - pressAt, firstFrame: samples.filter((s) => s.t > pressAt && s.t <= firstChange).length, totalMs: lastChange - pressAt, zoomReversals, radiusReversals: [...radiusReversals].slice(0, 6),
  };
}

function report(name: string, m: Motion): string {
  return `[star-motion] ${name}: radius ${m.radiusPxPerMs.toFixed(3)} px/ms (${m.worst}), radius step ${m.radiusStepPx.toFixed(2)} px, name ink step ${m.inkStep.toFixed(3)} (${m.worstInk}), zoom step ${(m.zoomStep * 100).toFixed(1)} % per frame, `
    + `${m.overlapFrames} frames with overlaps ${m.overlapPairs.join(", ")}, ${m.nameFrames} frames with names on names or discs ${m.namePairs.join(", ")}, ${m.dotFrames} frames with unbacked names on grown dots ${m.dotPairs.join(", ")}, names that lingered while crossed ${m.lingering.join(", ") || "none"}, crossings standing before the press ${m.standing.join(", ") || "none"}, first frame ${m.firstFrameMs.toFixed(0)} ms (frame ${m.firstFrame}; press frames up to ${m.pressFrameMs.toFixed(1)} ms against a median ${m.medianFrameMs.toFixed(1)} ms), total ${m.totalMs.toFixed(0)} ms, `
    + `zoom reversals ${m.zoomReversals}, radius reversals ${m.radiusReversals.join(", ") || "none"}, names at rest ${m.restNames} (${m.backedNames} backed)`;
}

function expectSmooth(name: string, m: Motion, opening: boolean): void {
  const said = report(name, m);
  console.log(said);
  expect.soft(m.radiusPxPerMs, `${name}: no radius changes faster than the limit: ${said}`).toBeLessThanOrEqual(RADIUS_PX_PER_MS);
  expect.soft(m.radiusStepPx, `${name}: no radius steps further in one frame than the limit: ${said}`).toBeLessThanOrEqual(RADIUS_STEP_PX);
  expect.soft(m.inkStep, `${name}: no name's ink changes faster than the limit: ${said}`).toBeLessThan(NAME_INK_STEP_PER_FRAME);
  expect.soft(m.zoomStep, `${name}: no zoom step past the limit: ${said}`).toBeLessThanOrEqual(ZOOM_STEP_PER_FRAME);
  expect.soft(m.overlapFrames, `${name}: no frame draws two marks of the star over each other: ${said}`).toBe(0);
  expect.soft(m.nameFrames, `${name}: no frame draws a name whose ink rises or holds over another name or over a disc not its own: ${said}`).toBe(0);
  expect.soft(m.dotFrames, `${name}: no frame draws a name whose ink rises or holds off its backing over an element dot grown past its resting radius: ${said}`).toBe(0);
  expect.soft(m.lingering, `${name}: a name crossed while its ink falls is gone within ${LEAVING_FRAMES} frames of starting to fall: ${said}`).toEqual([]);
  expect.soft(m.firstFrame, `${name}: the press shows at once: ${said}`).toBeLessThanOrEqual(FIRST_FRAME);
  if (opening) {
    expect.soft(m.restNames, `${name}: the opened star keeps names at rest: ${said}`).toBeGreaterThan(0);
    expect.soft(m.zoomReversals, `${name}: the zoom never turns back while the star opens: ${said}`).toBe(0);
    expect.soft(m.radiusReversals, `${name}: no radius turns back while the star opens: ${said}`).toEqual([]);
  }
}

async function press(page: Page, id: string): Promise<void> {
  const at = [...(await readDial(page)).discs].find((d) => d.id === id);
  expect(at, `${id} is drawn to press`).toBeDefined();
  const box = await canvasBox(page);
  await page.mouse.click(box.x + at!.x, box.y + at!.y);
}

/**
 * Presses the first of `ids` drawn in view, reading where it is drawn and pressing it in the same
 * animation frame: the camera is moving, and a press a frame later would land beside the mark.
 */
async function pressWhileMoving(page: Page, ids: readonly string[]): Promise<string> {
  const pressed = await page.evaluate((wanted) => new Promise<string | null>((resolve) => {
    requestAnimationFrame(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='ontology-map-canvas']")!;
      const rect = canvas.getBoundingClientRect();
      const { discs } = window.__atlasMap!.dial!() as { discs: { id: string | null; x: number; y: number }[] };
      const target = wanted
        .map((id) => discs.find((d) => d.id === id && d.x > 0 && d.y > 0 && d.x < rect.width && d.y < rect.height))
        .find((d) => d !== undefined);
      if (!target) return resolve(null);
      const at = { clientX: rect.left + target.x, clientY: rect.top + target.y, pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true, button: 0 };
      canvas.dispatchEvent(new PointerEvent("pointerdown", { ...at, buttons: 1 }));
      canvas.dispatchEvent(new PointerEvent("pointerup", { ...at, buttons: 0 }));
      resolve(target.id);
    });
  }), ids);
  expect(pressed, `one of ${ids.join(", ")} is drawn in view to press`).not.toBeNull();
  return pressed!;
}

async function selected(page: Page, id: string | null): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe(id);
}

for (const viewport of [{ width: 1410, height: 840 }, { width: 1280, height: 800 }]) {
  for (const dock of [false, true]) {
    test(`at ${viewport.width}x${viewport.height} with the agent dock ${dock ? "open" : "closed"}, a domain's star opens, retargets and closes with every mark and the zoom moving smoothly and never overlapping`, async ({ page }) => {
      test.setTimeout(600_000);
      await openDogfoodFlat(page, viewport, dock);
      const elementsOf = await elementsByContainer(page);
      const clusters = (await readDial(page)).clusters;
      if (!dock) {
        await settleSelection(page);
        const drawn = (await readDial(page)).texts.map((t) => `${t.role} ${t.id}`);
        const { fewest, most } = OVERVIEW_CAPABILITY_NAMES[`${viewport.width}x${viewport.height}`]!;
        const capabilities = drawn.filter((n) => n.startsWith("capability "));
        expect.soft(drawn.filter((n) => !n.startsWith("capability ")).sort(), "the resting overview draws the titles and captions it drew").toEqual([...OVERVIEW_TITLES].sort());
        expect.soft(capabilities.length, `the resting overview names as many capabilities as it did: ${capabilities.join(", ")}`).toBeGreaterThanOrEqual(fewest);
        expect.soft(capabilities.length, `the resting overview names as many capabilities as it did: ${capabilities.join(", ")}`).toBeLessThanOrEqual(most);
      }
      const starOf = (domainId: string) => {
        const capabilities = clusters.find((c) => c.domainId === domainId)!.capabilityIds;
        return new Set([domainId, ...capabilities, ...[domainId, ...capabilities].flatMap((id) => elementsOf.get(id) ?? [])]);
      };
      const densest = [...clusters].sort((a, b) => starOf(b.domainId).size - starOf(a.domainId).size)[0]!.domainId;
      const domains = [...new Set([densest, "domain:meaning-layer"])];
      for (const domainId of domains) {
        const star = starOf(domainId);
        const watched = [...star];
        const tag = `${viewport.width}x${viewport.height} dock ${dock ? "open" : "closed"} ${domainId}`;
        await openDogfoodFlat(page, viewport, dock);

        await startSampling(page, watched);
        await press(page, domainId);
        await selected(page, domainId);
        expectSmooth(`${tag} domain press`, motionOf(await stopSampling(page), [star]), true);

        const member = [...(await readDial(page)).discs].filter((d) => clusters.find((c) => c.domainId === domainId)!.capabilityIds.includes(d.id)).sort((a, b) => a.r - b.r)[0]!.id;
        await startSampling(page, watched);
        await press(page, member);
        await selected(page, member);
        expectSmooth(`${tag} member press`, motionOf(await stopSampling(page), [star]), false);

        if (!dock) {
          await press(page, domainId);
          await selected(page, domainId);
          await settleSelection(page);
          await startSampling(page, watched);
          await page.getByTestId("ontology-map-canvas").focus();
          await page.keyboard.press("Escape");
          await selected(page, null);
          expectSmooth(`${tag} deselect`, motionOf(await stopSampling(page), [star]), false);
        }

        await openDogfoodFlat(page, viewport, dock);
        const other = clusters.map((c) => c.domainId).find((id) => id !== domainId)!;
        const otherStar = starOf(other);
        await startSampling(page, [...star, ...otherStar]);
        await press(page, domainId);
        // measurement window: the retarget must land while the first star is still opening.
        await page.waitForTimeout(RETARGET_AFTER_MS);
        const retarget = await pressWhileMoving(page, [other, member]);
        await selected(page, retarget);
        expectSmooth(`${tag} retarget to ${retarget}`, motionOf(await stopSampling(page), [star, otherStar]), false);
      }

      // A reader opens a star to read what is in it: at rest it names its members, the dock's narrower map at least four in five.
      for (const { domainId, capabilityIds } of clusters) {
        await openDogfoodFlat(page, viewport, dock);
        await press(page, domainId);
        await selected(page, domainId);
        await settleSelection(page);
        const texts = (await readDial(page)).texts;
        const named = capabilityIds.filter((id) => texts.some((t) => t.id === id && t.role === "capability"));
        const backed = texts.filter((t) => t.backed && capabilityIds.includes(t.id ?? "")).length;
        const said = `${viewport.width}x${viewport.height} dock ${dock ? "open" : "closed"} ${domainId}: ${named.length} of ${capabilityIds.length} members named, ${backed} backed, unnamed ${capabilityIds.filter((id) => !named.includes(id)).join(", ") || "none"}`;
        console.log(`[star-names] ${said}`);
        if (dock) expect.soft(named.length * 5, said).toBeGreaterThanOrEqual(capabilityIds.length * 4);
        else expect.soft(named.length, said).toBe(capabilityIds.length);
      }
    });
  }
}
