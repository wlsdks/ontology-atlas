import type { HarnessScanProgress } from '@/entities/agent-files';
import { MOTION_EASE } from '@/shared/motion/tokens';

import {
  ARRIVE,
  LIFTS,
  LIFT_DOWN_MS,
  LIFT_PAD,
  LIFT_UP_MS,
  PANE1_SCROLL,
  POINTER_IN,
  POINTER_OUT,
  PRESSES,
  SCAN_MS,
  SCAN_OUT,
  SCRIM_ALPHA,
  SCRIM_MS,
  WINDOW,
  cosine,
  liftRest,
  liftScale,
  travelWindow,
  type Box,
  type PressTarget,
} from './harness-scene';

/**
 * Plays the harness film on the real Harness › Setup screen. Every change is caused by a press on
 * the screen's own control (`element.click()`); the director only reads rects around the press and
 * animates what moved, with Web Animations on transform and opacity. Every animation is paused and
 * placed by film time on each frame, so a seek, a pause or a capture sees exactly the frame the
 * clock names.
 */

export interface DirectorHost {
  root: HTMLElement;
  layer: HTMLElement;
  pointer: HTMLElement;
  ring: HTMLElement;
  scrim: HTMLElement;
  progress: readonly HarnessScanProgress[];
  setProgress(progress: HarnessScanProgress | null): void;
  remount(): void;
  commit(update: () => void): void;
  scale(): number;
}

export interface Director {
  at(T: number): void;
  seek(T: number): void;
  dispose(): void;
}

const EASE = `cubic-bezier(${MOTION_EASE.join(',')})`;
/** A fade of 140ms on the entry curve would change by more than 0.2 in one 60fps frame. */
const FADE_OUT_EASE = 'linear';
const CROSS_OUT = 140;
const CROSS_IN = 200;
const CROSS_RISE = 6;
const MOVE = 320;
const RETURN_DELAY = MOVE;
const RING_MS = 320;
const DIP_MS = 90;
const POINTER_FADE = 120;
/** No element on screen moves more than this between two 60fps frames. */
const FRAME_STEP_MAX = 22;
const EASE_PEAK = 2.3;

interface Track {
  start: number;
  dur: number;
  anim?: Animation;
  step?: (k: number) => void;
  end?: () => void;
}

interface Segment {
  t0: number;
  t1: number;
  from: Point;
  to: Point;
}

type Point = { x: number; y: number };

const pick = <T extends Element>(root: ParentNode, selector: string) => root.querySelector<T>(selector);

/** Clones a node for the film's layer: no ids or test ids, so the page's queries never find it twice. */
function filmClone(source: HTMLElement): HTMLElement {
  const copy = source.cloneNode(true) as HTMLElement;
  for (const htmlElement of [copy, ...copy.querySelectorAll<HTMLElement>('[id],[data-testid]')]) {
    htmlElement.removeAttribute('id');
    htmlElement.removeAttribute('data-testid');
  }
  copy.dataset.filmNode = 'clone';
  return copy;
}

export function createHarnessDirector(host: DirectorHost): Director {
  const { root, layer, pointer, ring, scrim } = host;
  let tracks: Track[] = [];
  let segments: Segment[] = [];
  let presses: number[] = [];
  let pointerHome: Point | null = null;
  let last = -1;
  let next = 0;

  const frameOf = () => {
    const box = root.getBoundingClientRect();
    return { box, k: box.width / WINDOW.w || 1 };
  };
  const local = (domElement: Element): Box => {
    const { box, k } = frameOf();
    const r = domElement.getBoundingClientRect();
    return { x: (r.left - box.left) / k, y: (r.top - box.top) / k, w: r.width / k, h: r.height / k };
  };
  const sceneElements = {
    scan: () => pick<HTMLElement>(root, '[data-film-scan]'),
    setup: () => pick<HTMLElement>(root, '[data-testid="harness-setup"]'),
    problem: () => pick<HTMLElement>(root, '[data-testid="harness-problems"]'),
    pane1: () => pick<HTMLElement>(root, '[data-testid="harness-categories"]'),
    pane2: () => pick<HTMLElement>(root, '[data-testid="harness-items"]'),
    pane3: () => pick<HTMLElement>(root, '[data-testid="harness-detail-pane"]'),
  };
  const lead = () => sceneElements.setup()?.firstElementChild as HTMLElement | null;
  const grid = () => sceneElements.pane1()?.parentElement ?? null;

  function target(name: PressTarget): HTMLElement | null {
    const radios = [...root.querySelectorAll<HTMLElement>('[data-testid="harness-tool-filter"] [role="radio"]')];
    switch (name) {
      case 'skills':
      case 'subagents':
        return sceneElements.pane1()?.querySelector<HTMLElement>(`[data-harness-group="${name}"]`) ?? null;
      case 'codex':
        return radios.find((radio) => radio.textContent?.trim() === 'Codex') ?? null;
      case 'all':
        return radios[0] ?? null;
      case 'problem':
        return pick<HTMLElement>(root, '[data-harness-problem]');
      case 'reviewer':
        return pick<HTMLElement>(sceneElements.pane2() ?? root, '[data-harness-item="file:.claude/agents/reviewer.md"]');
    }
  }

  const categoryOf = (pane1: HTMLElement) => pane1.querySelector('[aria-selected="true"]')?.getAttribute('data-option-key') ?? '';

  function aim(node: HTMLElement): Point {
    const r = local(node);
    return { x: r.x + Math.min(r.w / 2, 72), y: r.y + r.h / 2 };
  }

  function animate(node: Element, keyframes: Keyframe[], start: number, dur: number, easing: string, end?: () => void): Track {
    const anim = node.animate(keyframes, { duration: dur, easing, fill: 'both' });
    anim.pause();
    anim.currentTime = 0;
    const track: Track = { start, dur, anim, end: end ?? (() => anim.cancel()) };
    tracks.push(track);
    return track;
  }

  function stepper(start: number, dur: number, step: (k: number) => void, end?: () => void): void {
    tracks.push({ start, dur, step, end });
  }

  function place(T: number) {
    const live: Track[] = [];
    for (const track of tracks) {
      const t = Math.min(Math.max(T - track.start, 0), track.dur);
      if (track.anim) track.anim.currentTime = t;
      track.step?.(track.dur > 0 ? t / track.dur : 1);
      if (T >= track.start + track.dur) track.end?.();
      else live.push(track);
    }
    tracks = live;
  }

  function settle() {
    const ends = tracks.map((track) => track.start + track.dur);
    if (ends.length) place(Math.max(...ends));
  }

  function pointerAt(T: number): { p: Point; alpha: number; scale: number } {
    let p = pointerHome ?? { x: WINDOW.w / 2, y: WINDOW.h / 2 };
    for (const segment of segments) {
      if (T < segment.t0) break;
      const k = cosine((T - segment.t0) / Math.max(1, segment.t1 - segment.t0));
      p = { x: segment.from.x + (segment.to.x - segment.from.x) * k, y: segment.from.y + (segment.to.y - segment.from.y) * k };
    }
    const fadeIn = Math.min(1, Math.max(0, (T - POINTER_IN[0]) / POINTER_FADE));
    const fadeOut = 1 - Math.min(1, Math.max(0, (T - POINTER_OUT[0]) / (POINTER_OUT[1] - POINTER_OUT[0])));
    let scale = 1;
    for (const at of presses) {
      if (T >= at && T < at + DIP_MS) scale = 1 - 0.1 * Math.sin((Math.PI * (T - at)) / DIP_MS);
    }
    return { p, alpha: pointerHome ? fadeIn * fadeOut : 0, scale };
  }

  function drawPointer(T: number) {
    const { p, alpha, scale } = pointerAt(T);
    pointer.style.opacity = String(alpha);
    /* The arrow's tip sits 1.5px into its 18px box. */
    pointer.style.transform = `translate(${p.x - 1.5}px, ${p.y - 1.5}px) scale(${scale})`;
  }

  function aimAt(i: number, from: Point, earliest: number) {
    const node = target(PRESSES[i]!.target);
    if (!node) return;
    const to = aim(node);
    const px = Math.hypot(to.x - from.x, to.y - from.y);
    const [t0, t1] = travelWindow(i, px, earliest);
    /* Cosine travel peaks at pi/2 of its mean speed; keep that under the frame step on screen. */
    const floor = (Math.PI / 2) * ((px * host.scale()) / FRAME_STEP_MAX) * (1000 / 60);
    segments.push({ t0: Math.min(t0, t1 - floor), t1, from, to });
  }

  /**
   * `swap` is a pane whose subject changed: the old copy fades out over the new, which rises in.
   * Otherwise the pane keeps its subject and only counts or the selection changed, so the new pane
   * stands at once and the old copy dissolves off it: no text dims and comes back.
   */
  function crossFade(old: HTMLElement, fresh: HTMLElement, box: Box, scrollTop: number, T: number, swap = true) {
    const copy = filmClone(old);
    Object.assign(copy.style, {
      position: 'absolute',
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.w}px`,
      height: `${box.h}px`,
      margin: '0',
      zIndex: '1',
      background: swap ? 'var(--color-canvas)' : 'transparent',
    });
    layer.append(copy);
    copy.scrollTop = scrollTop;
    animate(copy, [{ opacity: 1 }, { opacity: 0 }], T, CROSS_OUT, FADE_OUT_EASE, () => copy.remove());
    if (!swap) return;
    for (const child of fresh.children) {
      animate(child, [{ opacity: 0, transform: `translateY(${CROSS_RISE}px)` }, { opacity: 1, transform: 'none' }], T, CROSS_IN, EASE);
    }
  }

  function fadeOutClone(node: HTMLElement, box: Box, T: number) {
    const copy = filmClone(node);
    Object.assign(copy.style, { position: 'absolute', left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, margin: '0', zIndex: '1' });
    layer.append(copy);
    animate(copy, [{ opacity: 1 }, { opacity: 0 }], T, CROSS_OUT, FADE_OUT_EASE, () => copy.remove());
  }

  function press(name: PressTarget, T: number) {
    settle();
    const node = target(name);
    if (!node) return;
    const pane1 = sceneElements.pane1();
    const pane2 = sceneElements.pane2();
    const pane3 = sceneElements.pane3();
    const gridNode = grid();
    const problem = sceneElements.problem();
    if (!pane1 || !pane2 || !pane3 || !gridNode) return;

    const ringBox = local(node);
    const before = {
      grid: local(gridNode),
      problem: problem ? { node: problem, box: local(problem) } : null,
      pane1: { box: local(pane1), sign: pane1.textContent + (pane1.querySelector('[aria-selected="true"]')?.getAttribute('data-option-key') ?? ''), scroll: pane1.scrollTop },
      pane2: { box: local(pane2), subject: categoryOf(pane1), scroll: pane2.scrollTop },
      pane3: { box: local(pane3), subject: pane3.querySelector('[data-harness-item]')?.getAttribute('data-harness-item') ?? '', scroll: pane3.scrollTop },
      rows: new Map([...pane2.querySelectorAll<HTMLElement>('[data-option-key]')].map((row) => [row.dataset.optionKey!, { node: row, box: local(row) }])),
    };
    /*
     * Pane 1 keeps its rows under a filter, but a session size can leave and the rows below it close
     * up: every box is moved from where it was inside its parent, so nothing jumps.
     */
    const tree1 = new Map(
      [...pane1.querySelectorAll<HTMLElement>('*')].map((item) => [
        item,
        { box: local(item), opacity: getComputedStyle(item).opacity },
      ]),
    );
    const old1 = filmClone(pane1);
    const old2 = filmClone(pane2);
    const old3 = filmClone(pane3);

    host.commit(() => node.click());
    presses.push(T);

    const radius = getComputedStyle(node).borderRadius;
    Object.assign(ring.style, {
      left: `${ringBox.x - 3}px`,
      top: `${ringBox.y - 3}px`,
      width: `${ringBox.w + 6}px`,
      height: `${ringBox.h + 6}px`,
      borderRadius: radius ? `calc(${radius} + 3px)` : '8px',
    });
    stepper(T, RING_MS, (k) => {
      ring.style.opacity = String(Math.sin(Math.PI * k));
    }, () => {
      ring.style.opacity = '0';
    });

    const after = {
      grid: local(gridNode),
      problem: sceneElements.problem(),
      pane1: pane1.textContent + (pane1.querySelector('[aria-selected="true"]')?.getAttribute('data-option-key') ?? ''),
      pane2: categoryOf(pane1),
      pane3: pane3.querySelector('[data-harness-item]')?.getAttribute('data-harness-item') ?? '',
    };

    /* The problem row leaving or returning moves the pane grid; it returns once the grid has moved. */
    const dy = before.grid.y - after.grid.y;
    if (Math.abs(dy) > 0.5) animate(gridNode, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], T, MOVE, EASE);
    if (before.problem && !after.problem) fadeOutClone(before.problem.node, before.problem.box, T);
    if (!before.problem && after.problem) {
      animate(after.problem, [{ opacity: 0 }, { opacity: 1 }], T + RETURN_DELAY, CROSS_IN, EASE);
    }

    const shift = { x: before.grid.x - after.grid.x, y: dy };
    const moved = (box: Box) => ({ ...box, x: box.x - shift.x, y: box.y - shift.y });
    if (after.pane1 !== before.pane1.sign) {
      crossFade(old1, pane1, moved(before.pane1.box), before.pane1.scroll, T, false);
      const paneNow = local(pane1);
      for (const [item, was] of tree1) {
        if (!item.isConnected) continue;
        let parent = item.parentElement;
        while (parent && parent !== pane1 && !tree1.has(parent)) parent = parent.parentElement;
        const then = parent && parent !== pane1 ? tree1.get(parent)!.box : before.pane1.box;
        const now = parent && parent !== pane1 ? local(parent) : paneNow;
        const box = local(item);
        const ry = was.box.y - then.y - (box.y - now.y);
        if (Math.abs(ry) > 0.5) animate(item, [{ transform: `translateY(${ry}px)` }, { transform: 'none' }], T, MOVE, EASE);
        const opacity = getComputedStyle(item).opacity;
        if (opacity !== was.opacity) animate(item, [{ opacity: was.opacity }, { opacity }], T, MOVE, EASE);
      }
    }
    if (after.pane3 !== before.pane3.subject) crossFade(old3, pane3, moved(before.pane3.box), before.pane3.scroll, T);
    if (after.pane2 !== before.pane2.subject) {
      crossFade(old2, pane2, moved(before.pane2.box), before.pane2.scroll, T);
    } else {
      const paneNow = local(pane2);
      const paneThen = before.pane2.box;
      const seen = new Set<string>();
      for (const row of pane2.querySelectorAll<HTMLElement>('[data-option-key]')) {
        const key = row.dataset.optionKey!;
        seen.add(key);
        const was = before.rows.get(key);
        if (!was) {
          animate(row, [{ opacity: 0 }, { opacity: 1 }], T + CROSS_OUT, CROSS_IN, EASE);
          continue;
        }
        const now = local(row);
        const ry = was.box.y - paneThen.y - (now.y - paneNow.y);
        if (Math.abs(ry) > 0.5) animate(row, [{ transform: `translateY(${ry}px)` }, { transform: 'none' }], T, MOVE, EASE);
      }
      for (const [key, was] of before.rows) if (!seen.has(key)) fadeOutClone(was.node, moved(was.box), T);
    }
  }

  function paced(ms: number, travel: number): number {
    return Math.max(ms, Math.ceil((EASE_PEAK * travel * host.scale() * (1000 / 60)) / FRAME_STEP_MAX));
  }

  function lift(sources: HTMLElement[], container: HTMLElement, tone: 'amber' | 'indigo', up: number, down: number, latest: number) {
    const boxes = sources.map(local);
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const box: Box = {
      x,
      y,
      w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
      h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
    };
    const z = liftScale(host.scale(), box.w, box.h);
    const rest = liftRest(box, z);
    const card = document.createElement('div');
    card.dataset.filmNode = 'card';
    Object.assign(card.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${box.w + 2 * LIFT_PAD}px`,
      height: `${box.h + 2 * LIFT_PAD}px`,
      transformOrigin: '0 0',
      zIndex: '5',
    });
    const chrome = document.createElement('div');
    Object.assign(chrome.style, {
      position: 'absolute',
      inset: '0',
      background: 'var(--color-panel)',
      border: `${1 / z}px solid var(${tone === 'amber' ? '--color-amber-source-a35' : '--color-indigo-pale-a28'})`,
      borderRadius: `${12 / z}px`,
    });
    chrome.className = 'shadow-[var(--shadow-elevation-2)]';
    const content = document.createElement('div');
    content.className = container.className;
    Object.assign(content.style, { position: 'absolute', left: `${LIFT_PAD}px`, top: `${LIFT_PAD}px`, width: `${box.w}px`, padding: '0', border: '0' });
    for (const source of sources) {
      const copy = filmClone(source);
      delete copy.dataset.filmNode;
      content.append(copy);
    }
    card.append(chrome, content);
    layer.append(card);
    for (const source of sources) source.style.visibility = 'hidden';

    const from = `translate(${box.x - LIFT_PAD}px, ${box.y - LIFT_PAD}px) scale(1)`;
    const to = `translate(${rest.x}px, ${rest.y}px) scale(${z})`;
    const travel = Math.max(
      Math.abs(rest.x - (box.x - LIFT_PAD)),
      Math.abs(rest.y - (box.y - LIFT_PAD)),
      Math.abs(rest.x + rest.w - (box.x + box.w + LIFT_PAD)),
      Math.abs(rest.y + rest.h - (box.y + box.h + LIFT_PAD)),
    );
    const upMs = paced(LIFT_UP_MS, travel);
    const downMs = paced(LIFT_DOWN_MS, travel);
    card.style.transform = from;
    animate(card, [{ transform: from }, { transform: to }], up, upMs, EASE, () => {
      card.getAnimations().forEach((a) => a.cancel());
      card.style.transform = to;
    });
    animate(chrome, [{ opacity: 0 }, { opacity: 1 }], up, SCRIM_MS, EASE, () => {
      chrome.getAnimations().forEach((a) => a.cancel());
    });
    animate(scrim, [{ opacity: 0 }, { opacity: SCRIM_ALPHA }], up, SCRIM_MS, EASE, () => {
      scrim.getAnimations().forEach((a) => a.cancel());
      scrim.style.opacity = String(SCRIM_ALPHA);
    });

    cues.push({
      at: Math.max(up + upMs, Math.min(down, latest - downMs)),
      run: (T) => {
        settle();
        animate(card, [{ transform: to }, { transform: from }], T, downMs, EASE, () => {
          card.remove();
          for (const source of sources) source.style.visibility = '';
        });
        animate(chrome, [{ opacity: 1 }, { opacity: 0 }], T, downMs, FADE_OUT_EASE);
        animate(scrim, [{ opacity: SCRIM_ALPHA }, { opacity: 0 }], T + downMs - SCRIM_MS, SCRIM_MS, FADE_OUT_EASE, () => {
          scrim.getAnimations().forEach((a) => a.cancel());
          scrim.style.opacity = '0';
        });
      },
    });
    cues.sort((a, b) => a.at - b.at);
  }

  interface Cue {
    at: number;
    run: (T: number) => void;
  }
  let cues: Cue[] = [];

  function buildCues(): Cue[] {
    const list: Cue[] = [];
    const events = host.progress;
    events.forEach((event, i) => {
      list.push({ at: (i * SCAN_MS) / Math.max(1, events.length), run: () => host.setProgress(event) });
    });
    list.push({
      at: 0,
      run: () => {
        const fadeRise = (node: Element | null | undefined, start: number, dur: number, rise: number) => {
          if (node) animate(node, [{ opacity: 0, transform: `translateY(${rise}px)` }, { opacity: 1, transform: 'none' }], start, dur, EASE);
        };
        fadeRise(lead(), ARRIVE.lead, ARRIVE.fade, 0);
        fadeRise(sceneElements.problem(), ARRIVE.lead, ARRIVE.fade, 0);
        const gridNode = grid();
        /* Linear and a little longer than the panes' own rise, so the two fades together stay gentle. */
        if (gridNode) animate(gridNode, [{ opacity: 0 }, { opacity: 1 }], ARRIVE.lead, ARRIVE.rise, 'linear');
        [sceneElements.pane1(), sceneElements.pane2(), sceneElements.pane3()].forEach((pane, i) => fadeRise(pane, ARRIVE.panes[i]!, ARRIVE.rise, 12));
      },
    });
    list.push({
      at: SCAN_OUT[0],
      run: (T) => {
        const scan = sceneElements.scan();
        if (!scan) return;
        animate(scan, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px)' }], T, SCAN_OUT[1] - SCAN_OUT[0], FADE_OUT_EASE, () => {
          scan.style.visibility = 'hidden';
        });
      },
    });
    list.push({
      at: PANE1_SCROLL[0],
      run: (T) => {
        const pane = sceneElements.pane1();
        const row = pane?.querySelector('[data-harness-group="blockingHooks"]');
        if (!pane || !row) return;
        const from = pane.scrollTop;
        const paneBox = local(pane);
        const rowBox = local(row);
        const to = Math.min(pane.scrollHeight - pane.clientHeight, Math.max(0, from + rowBox.y + rowBox.h - (paneBox.y + paneBox.h - 16)));
        stepper(T, PANE1_SCROLL[1] - PANE1_SCROLL[0], (k) => {
          pane.scrollTop = from + (to - from) * cosine(k);
        });
      },
    });
    list.push({
      at: POINTER_IN[0],
      run: () => {
        const node = target(PRESSES[0]!.target);
        if (!node) return;
        const to = aim(node);
        pointerHome = { x: to.x + 72, y: to.y + 96 };
        aimAt(0, pointerHome, POINTER_IN[0]);
      },
    });
    PRESSES.forEach(({ at, target: name }, i) => {
      list.push({
        at,
        run: (T) => {
          press(name, T);
          const node = target(name);
          if (i + 1 < PRESSES.length && node) aimAt(i + 1, segments[segments.length - 1]?.to ?? aim(node), T + 300);
        },
      });
    });
    LIFTS.forEach(({ at, drop, tone }, n) => {
      /* A lift is down before the next press, and the last one before the loop's rest. */
      const latest = n === 0 ? PRESSES.find((entry) => entry.at > drop)!.at - 50 : POINTER_OUT[1];
      list.push({
        at,
        run: (T) => {
          settle();
          if (tone === 'amber') {
            const detail = pick<HTMLElement>(root, '[data-testid="harness-item-detail"]');
            const head = detail?.firstElementChild as HTMLElement | null;
            const facts = detail?.querySelector<HTMLElement>(':scope > dl');
            if (detail?.parentElement && head && facts) lift([head, facts], detail.parentElement, tone, T, drop, latest);
          } else {
            const diff = pick<HTMLElement>(root, '[data-testid="harness-drift-diff"]');
            const container = diff?.closest<HTMLElement>('[data-harness-item]')?.parentElement;
            if (diff && container) lift([diff], container, tone, T, drop, latest);
          }
        },
      });
    });
    return list.sort((a, b) => a.at - b.at);
  }

  function reset() {
    for (const track of tracks) track.anim?.cancel();
    tracks = [];
    segments = [];
    presses = [];
    pointerHome = null;
    for (const node of [...layer.querySelectorAll('[data-film-node="clone"], [data-film-node="card"]')]) node.remove();
    scrim.style.opacity = '0';
    ring.style.opacity = '0';
    host.remount();
    cues = buildCues();
    next = 0;
    last = -1;
  }

  function run(T: number) {
    while (next < cues.length && cues[next]!.at <= T) {
      const cue = cues[next]!;
      next += 1;
      place(cue.at);
      cue.run(cue.at);
    }
    place(T);
    drawPointer(T);
    last = T;
  }

  let started = false;

  return {
    at(T) {
      if (!started || T < last - 1) reset();
      started = true;
      run(T);
    },
    seek(T) {
      started = true;
      reset();
      run(T);
    },
    dispose() {
      for (const track of tracks) track.anim?.cancel();
      tracks = [];
    },
  };
}
