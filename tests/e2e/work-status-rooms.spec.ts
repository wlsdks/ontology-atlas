import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { waitForAnimationsDone } from "./settle";

/**
 * Work status in the app, with the native reads stubbed: the rooms a person sees for a
 * repository's worktrees, the shelf's list, a merge reaching the shelf, and the empty building.
 */

const NOW_S = Math.floor(Date.now() / 1000);
const CLAUDE = { pid: 101, start: NOW_S - 3 * 3600 };
const CLAUDE_LATER = { pid: 102, start: NOW_S - 2 * 3600 };

type Row = Record<string, unknown>;

function row(branch: string, patch: Row = {}): Row {
  const id = branch.replace(/[^a-z0-9]+/gi, "-");
  return {
    id, path: `/Users/probe/repo/.claude/worktrees/${id}`, branch, head: "abc1234", mainCheckout: false, missing: false,
    standing: "ahead", ahead: 2, lastCommitAt: NOW_S - 600, lastCommitAuthor: "stark", lock: null, acpPid: null, agentProcesses: [],
    ...patch,
  };
}

const main = row("main", { id: "main", path: "/Users/probe/repo", mainCheckout: true, standing: "base", ahead: 0 });
const lock = (session: typeof CLAUDE) => ({
  state: "live", tool: "claudeCode", agentId: `a${session.pid}`, pid: session.pid, sessionStartedAt: session.start, lockedAt: (NOW_S - 1800) * 1000,
});
const working = (branch: string, session: typeof CLAUDE) =>
  row(branch, { lock: lock(session), agentProcesses: [{ pid: session.pid, tool: "claudeCode", startedAt: session.start }] });

const SIX = [
  main,
  working("feat/library-stage", CLAUDE),
  working("feat/work-status-rooms", CLAUDE_LATER),
  row("feat/map-light", { agentProcesses: [{ pid: 301, tool: "codex", startedAt: NOW_S - 3600 }] }),
  row("feat/harness-tab", { lock: { ...lock(CLAUDE), state: "stale", pid: 999 } }),
  row("fix/old-topic", { lastCommitAt: NOW_S - 9 * 86400 }),
  row("fix/rail-tooltip", { standing: "merged", ahead: 0 }),
];

type Activity = Record<string, { commits: { hash: string; subject: string; at: number }[] | null; uncommitted: number; latestFile: string | null; onBase: boolean; files: { path: string; changedAt: number | null }[] }>;

async function openWorkStatus(page: Page, rows: Row[], activity: Activity = {}) {
  await seedFirstRunSeen(page);
  await page.addInitScript(({ initial, reads }: { initial: Row[]; reads: Activity }) => {
    const state = { rows: initial, version: 1, activity: reads, activityVersion: 1, sessionStatus: "read", sessionAsks: 0, sessionForgets: 0 };
    const target = window as unknown as Record<string, unknown>;
    // How the session-list read went, and how often the page asked for it or told Rust to forget it.
    target.__workStatusSessionRead = (status: string) => { state.sessionStatus = status; };
    target.__workStatusSessionCalls = () => ({ asks: state.sessionAsks, forgets: state.sessionForgets });
    target.__workStatusRows = (next: Row[]) => { state.rows = next; state.version += 1; };
    // Rows held back until `when` says so. While they wait every tick reads anew, so the page keeps its one-second watch.
    let held: { rows: Row[]; when: () => boolean } | null = null;
    let waits = 0;
    target.__workStatusRowsWhen = (rows: Row[], when: () => boolean) => { held = { rows, when }; };
    target.__workStatusActivity = (next: Activity) => { state.activity = next; state.activityVersion += 1; };
    // What each Claude Code session says of itself, as the session-list read returns it.
    let sessions: unknown[] = [];
    target.__workStatusSessions = (next: unknown[]) => { sessions = next; };
    target.isTauri = true;
    target.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
    target.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      invoke(command: string, args: { worktreeId?: string } = {}) {
        const answer = (value: unknown) => new Promise(resolve => setTimeout(() => resolve(value), 60));
        if (command === "pick_source_directory") return answer("/Users/probe/repo");
        if (command === "work_status_fingerprint") {
          if (held?.when()) {
            state.rows = held.rows;
            state.version += 1;
            held = null;
          } else if (held) waits += 1;
          return answer(`v${state.version}.${waits}`);
        }
        if (command === "work_status_agent_sessions") {
          state.sessionAsks += 1;
          return answer({ status: state.sessionStatus, rows: structuredClone(sessions) });
        }
        if (command === "work_status_set_agent_sessions_read") {
          if (!(args as { on?: boolean }).on) state.sessionForgets += 1;
          return answer(null);
        }
        if (command === "work_status_activity_stamps") {
          return answer(Object.fromEntries(Object.keys(state.activity).map((id) => [id, `s${state.activityVersion}`])));
        }
        if (command === "work_status_activity") {
          const read = state.activity[args.worktreeId ?? ""];
          return answer(read ? { stamp: `s${state.activityVersion}`, ...structuredClone(read) } : null);
        }
        if (command === "work_status_read") {
          return answer({ status: "ready", root: "/Users/probe/repo", repository: "repo", host: "github.com", baseBranch: "main", worktrees: structuredClone(state.rows) });
        }
        return Promise.reject(new Error(`unstubbed native command: ${command}`));
      },
    };
  }, { initial: rows, reads: activity });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/en/work-status/");
  await page.getByTestId("work-status-choose").click();
}

/** Commit subjects are anyone's text: one past the monitor's width, Korean, and an emoji. */
const LONG_SUBJECT = `feat(work-status): ${"show what each worktree is doing, in words a person reads at a glance, ".repeat(3)}`.slice(0, 200);
const ACTIVITY: Activity = {
  "feat-library-stage": {
    commits: [
      { hash: "a1b2c3d", subject: LONG_SUBJECT, at: NOW_S - 120 },
      { hash: "b2c3d4e", subject: "fix(library): 첫 화면 문구를 짧게 🚀", at: NOW_S - 900 },
      { hash: "f6a7b8c", subject: "test(library): the first screen's copy", at: NOW_S - 3600 },
    ],
    uncommitted: 3,
    latestFile: "src/views/library/LibraryPage.tsx",
    onBase: false,
    files: [
      // A minute and a half back, so the bezel reads in minutes however long ago this file was loaded.
      { path: "src/views/library/LibraryPage.tsx", changedAt: NOW_S - 90 },
      { path: "src/features/library/model/use-library-model.ts", changedAt: NOW_S - 600 },
      { path: "messages/ko/library.json", changedAt: NOW_S - 7200 },
    ],
  },
  "feat-work-status-rooms": { commits: [], uncommitted: 12, latestFile: "src\\widgets\\work-tracks\\ui\\LargeRoom.tsx", onBase: false, files: [{ path: "src/widgets/work-tracks/ui/LargeRoom.tsx", changedAt: NOW_S - 30 }] },
  "feat-map-light": { commits: [{ hash: "c3d4e5f", subject: "design(map): 빛 레이어를 부드럽게 ✨", at: NOW_S - 300 }], uncommitted: 0, latestFile: null, onBase: false, files: [] },
  "fix-rail-copy": { commits: [{ hash: "d4e5f60", subject: "fix: 레일 툴팁 문구 🧭", at: NOW_S - 600 }], uncommitted: 0, latestFile: null, onBase: false, files: [] },
};

const room = (page: Page, branch: string) => page.getByTestId("work-room").filter({ hasText: branch });

/** Three running rooms fill one stage row; four worktrees no session holds wait as mini rooms. */
const SWAP = [
  main,
  working("feat/library-stage", CLAUDE),
  working("feat/work-status-rooms", CLAUDE_LATER),
  row("feat/map-light", { agentProcesses: [{ pid: 301, tool: "codex", startedAt: NOW_S - 3600 }] }),
  ...["feat/idle-one", "feat/idle-two", "fix/idle-three", "fix/idle-four"].map((branch) => row(branch)),
];

const setRows = (page: Page, next: Row[]) =>
  page.evaluate((rows) => (window as unknown as { __workStatusRows: (rows: unknown[]) => void }).__workStatusRows(rows), next);

interface PaintFrame {
  /** The most visible copies any one room had: its faces, and a copy on its way out. */
  copies: number;
  /** Pairs of rooms showing content whose boxes overlap. */
  overlaps: number;
  /** For each stage room drawn before the change: whether its box's centre is covered by some room. */
  covered: boolean[];
  litGhost: boolean;
  /** The frame's own time, the clock its animations run on, in milliseconds. */
  time: number;
  /** Room names showing on the stage, so it never reads as empty: a name tag, or the branch plaque a room carries while it travels as its wall. */
  tags: number;
  /** How much of each room's content shows: its faces and each of their fading parts, by room. */
  content: Record<string, number>;
  /** Per room: how much of its Moru or name tag shows inside its plate, the better of them. */
  held: Record<string, number>;
  /** Parts drawn past their room's plate while they show. */
  spills: string[];
  /** How wide each room's showing Moru is drawn, so a scale change can be checked for a jump. */
  moru: Record<string, number>;
  /** The thickest and thinnest hue edge any room draws: it stays 3 px however its wall scales. */
  edges: [number, number];
  /** Where each room's plate is drawn: x, y, width and height. */
  boxes: Record<string, [number, number, number, number]>;
}

/**
 * Samples every frame from now on. A room is drawn by its plate; its content is any face with
 * opacity. Before the change it notes the stage boxes, so a slot one room hands to another can be
 * checked for a frame of bare background.
 */
async function startPaintSampler(page: Page) {
  await page.evaluate(() => {
    const rooms = () => [...document.querySelectorAll<HTMLElement>("[data-testid=work-building] [data-room-key], [data-testid=work-building] [data-ghost-key]")];
    const keyOf = (element: HTMLElement) => element.dataset.roomKey ?? element.dataset.ghostKey ?? "";
    const plateOf = (element: HTMLElement) => element.querySelector(":scope > [data-room-plate]")!.getBoundingClientRect();
    const shown = (element: HTMLElement) => Number(getComputedStyle(element).opacity);
    const content = (element: HTMLElement) =>
      [...element.querySelectorAll<HTMLElement>(":scope > [data-room-face]")].map((face) => Number(getComputedStyle(face).opacity) * shown(element));
    const slots = rooms().filter((element) => element.dataset.roomSize === "large").map((element) => {
      const box = plateOf(element);
      return { key: keyOf(element), x: box.x + box.width / 2, y: box.y + box.height / 2, box: [box.x, box.y, box.width, box.height] };
    });
    const SAMPLED_MS = 15_000;
    const frames: PaintFrame[] = [];
    Object.assign(window, { __paint: { frames, slots } });
    let lastTime = Number.NaN;
    let firstTime = Number.NaN;
    const sample = () => {
      // The clock the rooms' animations read, so a frame is timed by what it shows. A callback that
      // comes before that clock moves on shows the last frame again, and is not a frame.
      const frameTime = Number(document.timeline.currentTime);
      if (frameTime === lastTime) {
        requestAnimationFrame(sample);
        return;
      }
      lastTime = frameTime;
      if (Number.isNaN(firstTime)) firstTime = frameTime;
      const all = rooms();
      const copies = new Map<string, number>();
      for (const element of all) copies.set(keyOf(element), (copies.get(keyOf(element)) ?? 0) + content(element).filter((value) => value > 0.05).length);
      const showing = all.filter((element) => content(element).some((value) => value > 0.05)).map(plateOf);
      let overlaps = 0;
      for (let i = 0; i < showing.length; i += 1) {
        for (let j = i + 1; j < showing.length; j += 1) {
          const a = showing[i], b = showing[j];
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > 2 && h > 2) overlaps += 1;
        }
      }
      const covered = slots.map((slot) => all.some((element) => {
        if (shown(element) < 0.5) return false;
        const box = plateOf(element);
        return slot.x >= box.left && slot.x <= box.right && slot.y >= box.top && slot.y <= box.bottom;
      }));
      const litGhost = all.some((element) => element.dataset.ghostKey !== undefined && element.querySelector("[data-dark]")?.getAttribute("data-dark") === "false");
      const building = document.querySelector("[data-testid=work-building]");
      const seen = (element: Element) => {
        let value = 1;
        for (let node: Element | null = element; node && node !== building; node = node.parentElement) value *= Number(getComputedStyle(node).opacity);
        return value;
      };
      // A part may hold content that fades on its own inside it (`data-room-fade`): the wall facts.
      const shows = (part: Element) => {
        const inner = part.querySelector("[data-room-fade]");
        return seen(part) * (inner ? Number(getComputedStyle(inner).opacity) : 1);
      };
      const tags = [...document.querySelectorAll("[data-testid=work-building] :is([data-room-tag], [data-room-plaque])")].filter((tag) => seen(tag) > 0.5).length;
      const visible: Record<string, number> = {};
      for (const element of all) {
        const faces = [...element.querySelectorAll(":scope > [data-room-face]")];
        visible[`${keyOf(element)}:face`] = Math.max(visible[`${keyOf(element)}:face`] ?? 0, ...faces.map(seen));
        for (const face of faces) {
          face.querySelectorAll("[data-room-part]").forEach((part, index) => {
            const name = `${keyOf(element)}:part${index}`;
            visible[name] = Math.max(visible[name] ?? 0, shows(part));
          });
        }
      }
      const held: Record<string, number> = {};
      const spills: string[] = [];
      for (const element of all) {
        const plate = plateOf(element);
        const inside = (rect: DOMRect) => {
          const w = Math.min(rect.right, plate.right) - Math.max(rect.left, plate.left);
          const h = Math.min(rect.bottom, plate.bottom) - Math.max(rect.top, plate.top);
          return rect.width * rect.height > 0 ? (Math.max(0, w) * Math.max(0, h)) / (rect.width * rect.height) : 0;
        };
        held[keyOf(element)] = Math.max(0, ...[...element.querySelectorAll<HTMLElement>(":scope > [data-room-face] :is([data-room-moru], [data-room-tag])")].map((figure) => seen(figure) * inside(figure.getBoundingClientRect())));
        element.querySelectorAll<HTMLElement>(":scope > [data-room-face] [data-room-part]").forEach((part) => {
          const rect = part.getBoundingClientRect();
          if (shows(part) > 0.05 && rect.width > 0 && (rect.right > plate.right + 2 || rect.bottom > plate.bottom + 2 || rect.left < plate.left - 2 || rect.top < plate.top - 2)) spills.push(keyOf(element));
        });
      }
      const moru: Record<string, number> = {};
      for (const element of all) {
        // The room's Moru as drawn: from its most visible face, so a swap of faces at a new scale counts.
        const face = [...element.querySelectorAll<HTMLElement>(":scope > [data-room-face]")].sort((a, b) => seen(b) - seen(a))[0];
        face?.querySelectorAll("[data-room-moru]").forEach((figure, index) => {
          if (seen(figure) > 0.5) moru[`${keyOf(element)}:${index}`] = figure.getBoundingClientRect().width;
        });
      }
      const thickness = all.flatMap((element) => [...element.querySelectorAll(":scope > [data-room-edge]")].map((edge) => edge.getBoundingClientRect().height));
      const edges: [number, number] = [Math.max(3, ...thickness), Math.min(3, ...thickness)];
      const boxes: Record<string, [number, number, number, number]> = {};
      for (const element of all) {
        if (element.dataset.roomKey === undefined) continue;
        const plate = plateOf(element);
        boxes[keyOf(element)] = [plate.x, plate.y, plate.width, plate.height];
        // The cart is drawn as a box too, so its crates riding into the hatch are held to the same glide.
        const face = [...element.querySelectorAll(":scope > [data-room-face]")].sort((a, b) => seen(b) - seen(a))[0];
        const cart = face?.querySelector("[data-testid=work-room-cart]");
        if (cart && seen(cart) > 0.5) {
          const box = cart.getBoundingClientRect();
          boxes[`cart:${keyOf(element)}`] = [box.x, box.y, box.width, box.height];
        }
      }
      frames.push({ copies: Math.max(0, ...copies.values()), overlaps, covered, litGhost, time: frameTime, tags, content: visible, held, spills, moru, edges, boxes });
      // By time, not by frames: a fixed frame count ends a 120 Hz display's sampling in half the time of a 60 Hz one.
      if (frameTime - firstTime < SAMPLED_MS) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

/** Every frame since the sampler started: one copy per room, no overlapping content, no bare handed-over slot. */
async function expectCleanPaint(page: Page, { slots: handed = 0 } = {}) {
  const { frames, handedOver } = await page.evaluate(() => {
    const paint = (window as unknown as { __paint: { frames: PaintFrame[]; slots: { key: string; box: number[] }[] } }).__paint;
    const now = [...document.querySelectorAll<HTMLElement>("[data-testid=work-building] [data-room-key][data-room-size=large]")].map((element) => {
      const box = element.querySelector(":scope > [data-room-plate]")!.getBoundingClientRect();
      return { key: element.dataset.roomKey!, box: [box.x, box.y, box.width, box.height] };
    });
    const present = new Set([...document.querySelectorAll<HTMLElement>("[data-room-key]")].map((element) => element.dataset.roomKey));
    // A slot is handed over when another room stands in the same box now and its old room is still here.
    const handedOver = paint.slots.flatMap((slot, index) =>
      present.has(slot.key) && now.some((other) => other.key !== slot.key && other.box.every((value, axis) => Math.abs(value - slot.box[axis]) < 2)) ? [index] : []);
    return { frames: paint.frames, handedOver };
  });
  expect(frames.length).toBeGreaterThan(60);
  expect(handedOver).toHaveLength(handed);
  expect.soft(frames.filter((frame) => frame.copies > 1).length, "frames with two copies of one room").toBe(0);
  expect.soft(frames.filter((frame) => frame.overlaps > 0).length, "frames where rooms overlap").toBe(0);
  expect.soft(frames.filter((frame) => handedOver.some((index) => !frame.covered[index])).length, "frames with a bare slot").toBe(0);
  expect.soft(frames.filter((frame) => frame.litGhost).length, "frames where a leaving room is lit").toBe(0);
  expect.soft(frames.filter((frame) => frame.tags === 0).length, "frames with no room name on the stage").toBe(0);
  // A room's Moru and name tag leave by fading, never from one frame to the next.
  const pops = frames.slice(1).flatMap((frame, index) => Object.entries(frames[index].held)
    .filter(([key, before]) => frame.time - frames[index].time <= 40 && before > 0.5 && key in frame.held && frame.held[key] < 0.1)
    .map(([key]) => `${key} at ${Math.round(frame.time - frames[0].time)}ms`));
  expect.soft(pops.slice(0, 4), "rooms whose content vanished in one frame").toEqual([]);
  expect.soft([...new Set(frames.flatMap((frame) => frame.spills))], "rooms drawing parts past their plate").toEqual([]);
  // Content fades, never cuts: within any 40 ms, one frame of a 25 fps recording, it loses at most 0.35.
  const cuts: string[] = [];
  frames.forEach((frame, index) => {
    for (let later = index + 1; later < frames.length && frames[later].time - frame.time <= 40; later += 1) {
      for (const [name, value] of Object.entries(frame.content)) {
        const drop = value - (frames[later].content[name] ?? 0);
        if (drop > 0.35) cuts.push(`${name} ${value.toFixed(2)}→${(frames[later].content[name] ?? 0).toFixed(2)} at ${Math.round(frame.time - frames[0].time)}ms`);
      }
    }
  });
  expect.soft([...new Set(cuts)].slice(0, 6), "content that cut instead of fading").toEqual([]);
  // Moru glides to a new scale: within any 40 ms its drawn width changes by at most a fifth. A frame
  // that came late and repeated the one before is timed from that one, so it is not read as a jump.
  const jumps: string[] = [];
  frames.forEach((frame, index) => {
    const next = frames[index + 1];
    if (!next) return;
    for (const [name, width] of Object.entries(frame.moru)) {
      const after = next.moru[name];
      if (after === undefined || width <= 0 || after === width) continue;
      const repeated = frames[index - 1]?.moru[name] === width && frames[index - 2]?.moru[name] !== width;
      const from = repeated ? frames[index - 1].time : frame.time;
      if (next.time - from <= 40 && Math.abs(after - width) / width > 0.2) jumps.push(`${name} ${Math.round(width)}→${Math.round(after)}px`);
    }
  });
  expect.soft([...new Set(jumps)].slice(0, 6), "Moru that jumped to a new scale").toEqual([]);
  expect.soft(frames.filter((frame) => frame.edges[0] > 3.5 || frame.edges[1] < 2.5).length, "frames where a hue edge scaled with its wall").toBe(0);
}

/**
 * Every room glides: no frame moves a room far more than the frames before it did (a jump, or a
 * restart from where it began), and no room turns back on its path while it moves.
 */
async function expectSmoothMotion(page: Page) {
  const frames = await page.evaluate(() => (window as unknown as { __paint: { frames: PaintFrame[] } }).__paint.frames);
  const jumps: string[] = [];
  const reversals: string[] = [];
  const keys = new Set(frames.flatMap((frame) => Object.keys(frame.boxes)));
  for (const key of keys) {
    // Speeds, in px per ms, so a dropped frame is a longer step at the same speed, not a jump.
    const steps: { dx: number; dy: number; size: number; at: number; dt: number }[] = [];
    for (let index = 1; index < frames.length; index += 1) {
      const [a, b] = [frames[index - 1].boxes[key], frames[index].boxes[key]];
      if (!a || !b) continue;
      const dt = Math.max(1, frames[index].time - frames[index - 1].time);
      steps.push({ dx: b[0] - a[0], dy: b[1] - a[1], size: Math.max(Math.abs(b[2] - a[2]), Math.abs(b[3] - a[3])), at: Math.round(frames[index].time - frames[0].time), dt });
    }
    const speed = (step: (typeof steps)[number]) => Math.max(Math.hypot(step.dx, step.dy), step.size) / step.dt;
    steps.forEach((step, index) => {
      const before = Math.max(0, ...steps.slice(Math.max(0, index - 3), index).map(speed));
      const after = steps[index + 1] ? speed(steps[index + 1]) : 0;
      // A jump is a one-step spike: over 3 px/ms (50 px a frame) and 2.5 times both the steps before and the
      // step after. An ease that keeps its speed into the next frame is acceleration, not a cut.
      if (speed(step) > Math.max(3, 2.5 * before, 2.5 * after)) jumps.push(`${key} ${speed(step).toFixed(1)}px/ms at ${step.at}ms after ${before.toFixed(1)}px/ms`);
      const previous = steps[index - 1];
      if (previous && Math.hypot(previous.dx, previous.dy) > 2 && Math.hypot(step.dx, step.dy) > 2 && previous.dx * step.dx + previous.dy * step.dy < -0.5 * Math.hypot(previous.dx, previous.dy) * Math.hypot(step.dx, step.dy)) {
        reversals.push(`${key} at ${step.at}ms`);
      }
    });
  }
  expect.soft(jumps.slice(0, 6), "rooms that jumped").toEqual([]);
  expect.soft(reversals.slice(0, 6), "rooms that turned back").toEqual([]);
  expect.soft(movesOf(frames).flatMap(spikesIn).slice(0, 6), "steps far faster than the rest of their move").toEqual([]);
  expect.soft(stopsBetween(movesOf(frames)).slice(0, 6), "moves that stopped and set off again").toEqual([]);
  expect.soft(movesOf(frames).flatMap(dipsIn).slice(0, 6), "moves that all but stopped midway").toEqual([]);
}

interface Step { speed: number; at: number; px: number }
interface Move { key: string; steps: Step[] }

/**
 * Each room's and cart's moves: runs of frames in which it travels, in px per ms, so a dropped frame
 * is no spike. One still frame inside a run is a late frame that repeated the last one, not a stop:
 * its time goes to the next step. Two still frames end the run.
 */
function movesOf(frames: PaintFrame[]): Move[] {
  const moves: Move[] = [];
  for (const key of new Set(frames.flatMap((frame) => Object.keys(frame.boxes)))) {
    let run: Step[] = [];
    let still = 0;
    let carried = 0;
    for (let index = 1; index <= frames.length; index += 1) {
      const [a, b] = [frames[index - 1]?.boxes[key], frames[index]?.boxes[key]];
      const px = a && b ? Math.max(...a.map((value, side) => Math.abs((b[side] ?? value) - value)), Math.hypot(b[0] - a[0], b[1] - a[1])) : 0;
      const dt = index < frames.length ? Math.max(1, frames[index].time - frames[index - 1].time) : 1;
      if (px / dt > 0.02) {
        if (still > 1 && run.length > 0) {
          moves.push({ key, steps: run });
          run = [];
        }
        run.push({ speed: px / (dt + (still === 1 ? carried : 0)), at: Math.round(frames[index].time - frames[0].time), px });
        still = 0;
        carried = 0;
      } else {
        still += 1;
        carried += dt;
      }
    }
    if (run.length > 0) moves.push({ key, steps: run });
  }
  return moves;
}

/**
 * A step more than three times the median step of its own move and twice the mean of the steps either
 * side of it: a jump inside a glide. A smooth peak, like the middle of a long ease, stands level with
 * its neighbours and is no jump; a late frame is timed by its own interval, so it is none either.
 */
function spikesIn({ key, steps }: Move): string[] {
  if (steps.length < 5) return [];
  const median = [...steps].map((step) => step.speed).sort((a, b) => a - b)[Math.floor(steps.length / 2)];
  return steps.flatMap((step, index) => {
    const near = [steps[index - 1], steps[index + 1]].filter((other): other is Step => other !== undefined);
    const around = near.reduce((sum, other) => sum + other.speed, 0) / near.length;
    return step.speed > 3 * median && step.speed > 2 * around && step.speed > 0.5 ? [`${key} ${step.speed.toFixed(2)}px/ms at ${step.at}ms, median ${median.toFixed(2)}`] : [];
  });
}

/**
 * A step slower than 15% of its move's peak between the first and the last step that reach half of
 * it: a move that all but stops midway, which reads as two moves. Paces are read over neighbours,
 * as for spikes, so one uneven frame is no dip.
 */
function dipsIn(move: Move): string[] {
  if (move.steps.length < 5) return [];
  const paces = pacesOf(move.steps);
  const peak = Math.max(...paces);
  const [first, last] = [paces.findIndex((pace) => pace >= peak / 2), paces.findLastIndex((pace) => pace >= peak / 2)];
  return move.steps.flatMap((step, index) => index > first && index < last && paces[index] < 0.15 * peak ? [`${move.key} ${paces[index].toFixed(2)}px/ms at ${step.at}ms, peak ${peak.toFixed(2)}`] : []);
}

/** Each step's pace over it and its neighbours. */
function pacesOf(steps: Step[]): number[] {
  const dt = (step: Step) => step.px / step.speed;
  return steps.map((_, index) => {
    const near = steps.slice(Math.max(0, index - 1), index + 2);
    return near.reduce((sum, step) => sum + step.px, 0) / near.reduce((sum, step) => sum + dt(step), 0);
  });
}

/** A move that comes to rest and sets off again within 400 ms: two motions where one curve was meant. */
function stopsBetween(moves: Move[]): string[] {
  const travelled = (move: Move) => move.steps.reduce((sum, step) => sum + step.px, 0);
  const stops: string[] = [];
  for (const move of moves) {
    for (const next of moves) {
      if (next === move || next.key !== move.key) continue;
      const gap = next.steps[0].at - move.steps.at(-1)!.at;
      if (gap > 0 && gap <= 400 && travelled(move) > 8 && travelled(next) > 8) stops.push(`${move.key} stopped at ${move.steps.at(-1)!.at}ms and set off at ${next.steps[0].at}ms`);
    }
  }
  return stops;
}

test.describe("work status rooms", () => {
  // The rooms run clean: no console error or warning in any test.
  const noise: string[] = [];
  test.beforeEach(({ page }) => {
    noise.length = 0;
    page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") noise.push(`${message.type()}: ${message.text()}`); });
    page.on("pageerror", (error) => noise.push(`pageerror: ${error.message}`));
  });
  test.afterEach(() => {
    expect(noise.filter((text) => !/was preloaded using link preload but not used/.test(text)), "console errors and warnings").toEqual([]);
  });

  test("puts work on the stage, keeps a left lock as a mini and counts the rest on the shelf", async ({ page }) => {
    await openWorkStatus(page, SIX);

    await expect(page.getByTestId("work-room")).toHaveCount(4);
    for (const branch of ["feat/library-stage", "feat/work-status-rooms", "feat/map-light"]) {
      await expect(room(page, branch)).toHaveAttribute("data-room-size", "large");
    }
    await expect(room(page, "feat/harness-tab")).toHaveAttribute("data-room-size", "mini");
    await expect(room(page, "feat/harness-tab")).toHaveAttribute("data-room-state", "lockLeft");
    await page.getByTestId("work-status-alert-cleanup").click();
    await expect(room(page, "feat/harness-tab")).toHaveAttribute("data-flash", "true");
    await expect(room(page, "feat/library-stage")).not.toHaveAttribute("data-flash", "true");
    await expect(room(page, "feat/library-stage")).toContainText("Claude Code 1");
    await expect(room(page, "feat/work-status-rooms")).toContainText("Claude Code 2");
    await expect(page.getByTestId("work-building").locator("details, summary")).toHaveCount(0);

    await page.getByTestId("work-shelf-untouched").click();
    const list = page.getByTestId("work-shelf-list");
    await expect(list).toContainText("fix/old-topic");
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
  });

  test("moves a merged worktree to the shelf and keeps the other session's name", async ({ page }) => {
    await openWorkStatus(page, SIX);
    await expect(page.getByTestId("work-shelf-merged")).toContainText("1");

    await page.evaluate((next) => (window as unknown as { __workStatusRows: (rows: unknown[]) => void }).__workStatusRows(next), [
      ...SIX.filter((entry) => entry.branch !== "feat/library-stage"),
      row("feat/library-stage", { standing: "merged", ahead: 0 }),
    ]);

    await expect(room(page, "feat/library-stage")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId("work-shelf-merged")).toContainText("2");
    await expect(room(page, "feat/work-status-rooms")).toContainText("Claude Code 2");
  });

  test("keeps one painted copy of each room, apart from the others, while a merge and a rise move them", async ({ page }) => {
    // A full cart, so the crates riding into the hatch are a row long enough to show a jump.
    await openWorkStatus(page, SIX.map((entry) => entry.branch === "feat/library-stage" ? { ...entry, ahead: 7 } : entry));
    await expect(room(page, "feat/library-stage")).toHaveAttribute("data-room-size", "large");
    await startPaintSampler(page);
    await setRows(page, [
      ...SIX.filter((entry) => entry.branch !== "feat/library-stage" && entry.branch !== "feat/harness-tab"),
      row("feat/library-stage", { standing: "merged", ahead: 0 }),
      working("feat/harness-tab", CLAUDE),
    ]);
    await expect(room(page, "feat/library-stage")).toHaveCount(0, { timeout: 10_000 });
    await expect(room(page, "feat/harness-tab")).toHaveAttribute("data-room-size", "large");
    await waitForAnimationsDone(page.getByTestId("work-building"));
    await expectCleanPaint(page);
    await expectSmoothMotion(page);
  });

  test("rides a merged room's full cart into the hatch in one glide", async ({ page }) => {
    const full = SIX.map((entry) => entry.branch === "feat/library-stage" ? { ...entry, ahead: 7 } : entry);
    await openWorkStatus(page, full);
    await expect(room(page, "feat/library-stage")).toHaveAttribute("data-room-size", "large");
    await startPaintSampler(page);
    await setRows(page, full.map((entry) => entry.branch === "feat/library-stage" ? row("feat/library-stage", { standing: "merged", ahead: 0 }) : entry));
    await expect(room(page, "feat/library-stage").locator("[data-arrived=true]")).toHaveCount(1);
    await expect(room(page, "feat/library-stage").getByTestId("work-room-cart")).toHaveAttribute("data-crates", "7");
    // measurement window: the crate ride, the hatch turning green and Moru's cheer are sampled frame by frame before the room leaves.
    await page.waitForTimeout(2500);
    await expectSmoothMotion(page);
  });

  test("hands a stage slot from a room that stops to one that starts without a bare frame", async ({ page }) => {
    await openWorkStatus(page, SWAP);
    await expect(room(page, "feat/library-stage")).toHaveAttribute("data-room-size", "large");
    await expect(room(page, "feat/idle-one")).toHaveAttribute("data-room-size", "mini");
    await startPaintSampler(page);
    await setRows(page, SWAP.map((entry) =>
      entry.branch === "feat/library-stage" ? row("feat/library-stage")
        : entry.branch === "feat/idle-one" ? working("feat/idle-one", CLAUDE) : entry));
    await expect(room(page, "feat/idle-one")).toHaveAttribute("data-room-size", "large", { timeout: 10_000 });
    await expect(room(page, "feat/library-stage")).toHaveAttribute("data-room-size", "mini");
    await waitForAnimationsDone(page.getByTestId("work-building"));
    await expectCleanPaint(page, { slots: 1 });
    await expectSmoothMotion(page);
  });

  test("retargets mid-sequence when the next update lands before the last one finished", async ({ page }) => {
    await openWorkStatus(page, SWAP);
    await expect(room(page, "feat/library-stage")).toHaveAttribute("data-room-size", "large");
    await startPaintSampler(page);
    const first = SWAP.map((entry) =>
      entry.branch === "feat/library-stage" ? row("feat/library-stage")
        : entry.branch === "feat/idle-one" ? working("feat/idle-one", CLAUDE) : entry);
    await setRows(page, first);
    // Git says something new 150 ms into the sequence; the page reads it on its next tick, mid-sequence.
    await page.waitForFunction(() => document.querySelector("[data-testid=work-building]")!.getAnimations({ subtree: true }).some((a) => a.playState === "running"));
    // measurement window: the next update must land 150 ms into the running sequence, the gap the owner set.
    await page.waitForTimeout(150);
    await setRows(page, first.map((entry) => entry.branch === "feat/idle-two" ? working("feat/idle-two", CLAUDE_LATER) : entry));
    await expect(room(page, "feat/idle-two")).toHaveAttribute("data-room-size", "large", { timeout: 10_000 });
    await waitForAnimationsDone(page.getByTestId("work-building"));
    // A second rise reflows the stage, so no stage box ends up handed over whole.
    await expectCleanPaint(page);
    await expectSmoothMotion(page);
  });

  test("lets a room that stops mid-move leave from where it is drawn, its content fading", async ({ page }) => {
    await openWorkStatus(page, SWAP);
    await expect(room(page, "feat/work-status-rooms")).toHaveAttribute("data-room-size", "large");
    await startPaintSampler(page);
    const first = SWAP.map((entry) => entry.branch === "feat/idle-one" ? working("feat/idle-one", CLAUDE) : entry);
    await setRows(page, first);
    // The next update goes out once the first move has played a quarter second, so it lands mid-move.
    await page.waitForFunction(() => document.querySelector("[data-testid=work-building]")!.getAnimations({ subtree: true })
      .some((a) => a.playState === "running" && Number(a.currentTime) >= 250));
    await setRows(page, first.map((entry) => entry.branch === "feat/work-status-rooms" ? row("feat/work-status-rooms") : entry));
    await expect(room(page, "feat/work-status-rooms")).toHaveAttribute("data-room-size", "mini", { timeout: 10_000 });
    await waitForAnimationsDone(page.getByTestId("work-building"));
    await expectCleanPaint(page, { slots: 2 });
    await expectSmoothMotion(page);
  });

  test("fades the building up from the bare page instead of cutting it in", async ({ page }) => {
    await page.addInitScript(() => {
      const frames: { rooms: number; shown: number; time: number }[] = [];
      Object.assign(window, { __entry: frames });
      const sample = (time: number) => {
        const building = document.querySelector("[data-testid=work-building]");
        const rooms = building?.querySelectorAll("[data-room-key]").length ?? 0;
        let shown = 1;
        for (let node: Element | null = building; node; node = node.parentElement) shown *= Number(getComputedStyle(node).opacity);
        if (rooms > 0) frames.push({ rooms, shown, time });
        if (frames.length < 120) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await openWorkStatus(page, SIX);
    await expect(room(page, "feat/library-stage")).toBeVisible();
    await page.waitForFunction(() => (window as unknown as { __entry: unknown[] }).__entry.length >= 120);
    const frames = await page.evaluate(() => (window as unknown as { __entry: { rooms: number; shown: number; time: number }[] }).__entry);
    expect(frames.length).toBeGreaterThan(10);
    // The first frame with rooms is still mostly the page behind them, and no 40 ms raises the building by more than a third.
    expect(frames[0].shown, "the building's first frame").toBeLessThan(0.5);
    const rises = frames.flatMap((frame, index) => frames.slice(index + 1).filter((later) => later.time - frame.time <= 40 && later.shown - frame.shown > 0.35).map((later) => `${frame.shown.toFixed(2)}→${later.shown.toFixed(2)}`));
    expect(rises.slice(0, 4), "the building cut in").toEqual([]);
    expect(frames.at(-1)!.shown).toBe(1);
  });

  test("names what each worktree is doing on its screen, inside the screen, and slides a new commit in", async ({ page }) => {
    await openWorkStatus(page, [...SIX, row("fix/rail-copy")], ACTIVITY);
    const stage = room(page, "feat/library-stage").getByTestId("work-room-monitor");
    await expect(stage).toContainText(LONG_SUBJECT.slice(0, 40));
    // Under the commits: what is not committed, with the file changed last; the bezel says when the worktree last changed.
    await expect(stage).toContainText("3 files changed, not committed");
    await expect(stage).toContainText("LibraryPage.tsx");
    await expect(room(page, "feat/library-stage").locator("[data-room-tag]")).toContainText(/Working\s·\schanged \d+ minutes? ago/);
    await expect(room(page, "feat/map-light").getByTestId("work-room-monitor")).toContainText("빛 레이어를 부드럽게 ✨");
    const editing = room(page, "feat/work-status-rooms").getByTestId("work-room-monitor");
    await expect(editing).toContainText("12 files changed, not committed");
    await expect(editing).toContainText("LargeRoom.tsx");
    await expect(room(page, "fix/rail-copy")).toHaveAttribute("data-room-size", "mini");
    await expect(room(page, "fix/rail-copy")).toContainText("레일 툴팁 문구 🧭");
    await waitForAnimationsDone(page.getByTestId("work-building"));

    // Text is whole on its screen or wholly clipped away; none runs past the screen's edge.
    const spills = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-testid=work-room-monitor]")].flatMap((screen) => {
      const edge = screen.getBoundingClientRect();
      return [...screen.querySelectorAll<HTMLElement>("span, div")].filter((element) => element.childElementCount === 0 && element.textContent).flatMap((element) => {
        const box = element.getBoundingClientRect();
        const outside = box.left >= edge.right - 1 || box.top >= edge.bottom - 1;
        const inside = box.left >= edge.left - 0.5 && box.right <= edge.right + 0.5 && box.top >= edge.top - 0.5 && box.bottom <= edge.bottom + 0.5;
        return outside || inside ? [] : [`${element.textContent}`];
      });
    }));
    expect(spills, "text past a screen's edge").toEqual([]);

    // Every frame from here, each commit row's place and opacity as the page computes them.
    await page.evaluate(() => {
      const log = () => [...document.querySelectorAll("[data-testid=work-room]")].find((element) => element.textContent?.includes("feat/library-stage"))?.querySelector("[data-testid=work-room-log]");
      const trace: { time: number; rows: Record<string, { y: number; opacity: number; leaving: boolean }> }[] = [];
      Object.assign(window, { __commitTrace: trace });
      let last = Number.NaN;
      const sample = () => {
        const time = Number(document.timeline.currentTime);
        if (time !== last) {
          last = time;
          const rows: (typeof trace)[number]["rows"] = {};
          for (const element of log()?.querySelectorAll<HTMLElement>("[data-commit]") ?? []) {
            const style = getComputedStyle(element);
            rows[element.dataset.commit!] = { y: new DOMMatrix(style.transform).m42, opacity: Number(style.opacity), leaving: element.dataset.leaving !== undefined };
          }
          trace.push({ time, rows });
          // Keep a few frames from before the new commit lands, then ninety after it.
          if (!trace.some((frame) => "e5f6071" in frame.rows) && trace.length > 4) trace.shift();
        }
        if (trace.filter((frame) => "e5f6071" in frame.rows).length < 90) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.evaluate((next) => (window as unknown as { __workStatusActivity: (next: unknown) => void }).__workStatusActivity(next), {
      ...ACTIVITY,
      "feat-library-stage": { ...ACTIVITY["feat-library-stage"], commits: [{ hash: "e5f6071", subject: "fix: 새 커밋이 들어왔어요", at: NOW_S - 5 }, ...ACTIVITY["feat-library-stage"].commits!.slice(0, 2)] },
    });
    await expect(stage).toContainText("새 커밋이 들어왔어요", { timeout: 15_000 });
    await page.waitForFunction(() => (window as unknown as { __commitTrace: { rows: object }[] }).__commitTrace.filter((frame) => "e5f6071" in frame.rows).length >= 90, null, { timeout: 15_000 });
    const trace = await page.evaluate(() => (window as unknown as { __commitTrace: { time: number; rows: Record<string, { y: number; opacity: number; leaving: boolean }> }[] }).__commitTrace);
    const rowH = await stage.locator("[data-commit]").first().evaluate((element) => element.getBoundingClientRect().height);
    const series = (key: string) => trace.filter((frame) => key in frame.rows).map((frame) => ({ time: frame.time, ...frame.rows[key] }));
    const steps = (values: { time: number; y: number; opacity: number }[], field: "y" | "opacity") =>
      values.slice(1).map((value, index) => ({ change: value[field] - values[index][field], dt: value.time - values[index].time }));

    // The new commit fades in at the top and stays there.
    const fresh = series("e5f6071");
    expect(fresh[0].opacity, "the new row starts unseen").toBeLessThan(0.5);
    expect(fresh.at(-1)!.opacity).toBe(1);
    expect(fresh.every((frame) => frame.y === 0), "the new row stays at the top").toBe(true);
    expect(steps(fresh, "opacity").every(({ change }) => change >= -0.01), "the new row only brightens").toBe(true);
    // Every older row moves down only, a little each frame, never a whole row at once.
    for (const key of ["a1b2c3d", "b2c3d4e", "f6a7b8c"]) {
      const moves = steps(series(key), "y");
      expect(moves.every(({ change }) => change >= -0.5), `${key} only moves down`).toBe(true);
      expect(moves.filter(({ dt }) => dt <= 40).every(({ change }) => change <= rowH * 0.6), `${key} never jumps a row`).toBe(true);
    }
    // The row pushed past the last place fades out where it goes, then leaves.
    const gone = series("f6a7b8c").filter((frame) => frame.leaving);
    expect(gone.length, "the oldest row is drawn while it leaves").toBeGreaterThan(3);
    expect(steps(gone, "opacity").every(({ change }) => change <= 0.01), "the oldest row only fades").toBe(true);
    expect(trace.at(-1)!.rows).not.toHaveProperty("f6a7b8c");
  });

  test("rests the cast between turns after the lively stretch, and cuts a new commit in at once", async ({ page }) => {
    // The lively stretch runs fifteen seconds from the first step before the building rests.
    test.setTimeout(90_000);
    await openWorkStatus(page, SIX);
    const working = room(page, "feat/library-stage");
    await expect(working.locator("[data-moru-live]").first()).toBeVisible();
    await page.evaluate(() => {
      // When any Moru last changed what he shows (a room sprite's style), and in the
      // working room, when it was asked to play a row once and when its Moru first changed after that.
      const seen = { last: performance.now(), changes: 0, longest: 0, askedAt: 0, answeredAt: 0, rowBefore: "", answeredRow: "", roomLast: performance.now() };
      let asked: HTMLElement | null = null;
      const note = (at: number) => {
        seen.longest = Math.max(seen.longest, at - seen.last);
        seen.last = at;
        seen.changes += 1;
      };
      const inWorking = (node: Element) => node.closest("[data-testid='work-room']")?.textContent?.includes("feat/library-stage");
      new MutationObserver((records) => {
        const at = performance.now();
        for (const record of records) {
          const target = record.target as HTMLElement;
          if (!target.matches("[data-moru-live]")) continue;
          if (record.attributeName === "data-moru-once" && target.dataset.moruOnce && inWorking(target) && !asked) {
            asked = target;
            seen.askedAt = at;
            seen.rowBefore = target.style.backgroundImage;
          }
          if (record.attributeName !== "style") continue;
          note(at);
          if (!inWorking(target)) continue;
          seen.roomLast = at;
          if (target === asked && !seen.answeredAt) { seen.answeredAt = at; seen.answeredRow = target.style.backgroundImage; }
        }
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["style", "data-moru-once"] });
      (window as unknown as { __moruSeen: typeof seen }).__moruSeen = seen;
    });
    type Seen = { last: number; changes: number; longest: number; askedAt: number; answeredAt: number; rowBefore: string; answeredRow: string; roomLast: number };
    const seen = () => page.evaluate(() => {
      const value = (window as unknown as { __moruSeen: Seen }).__moruSeen;
      return { ...value, still: performance.now() - value.last, roomStill: performance.now() - value.roomLast };
    });

    // Lively first: the rooms step without a pause longer than a few beats.
    await expect.poll(async () => (await seen()).changes, { timeout: 10_000 }).toBeGreaterThan(20);
    // Then a rest: three seconds and more with no Moru anywhere changing his pose.
    await expect.poll(async () => { const now = await seen(); return Math.max(now.longest, now.still); }, { timeout: 40_000 }).toBeGreaterThanOrEqual(3000);

    // A new commit in the resting working room plays its row at once, without waiting for a turn. It
    // lands just after the cast last moved: a rest of three seconds follows a turn, so no loop is under way.
    await page.evaluate((rows) => {
      const target = window as unknown as { __moruSeen: { last: number }; __workStatusRowsWhen: (rows: unknown[], when: () => boolean) => void };
      target.__workStatusRowsWhen(rows, () => {
        const still = performance.now() - target.__moruSeen.last;
        return still >= 450 && still <= 2000;
      });
    }, SIX.map((each) => (each.branch === "feat/library-stage" ? { ...each, ahead: 3 } : each)));
    await expect.poll(async () => (await seen()).answeredAt, { timeout: 30_000 }).toBeGreaterThan(0);
    const cut = await seen();
    // His first new pose is the commit's row, not the next cell of the one he rested on.
    expect(cut.answeredRow, "the row he shows after the commit").not.toBe(cut.rowBefore);
    expect(cut.answeredAt - cut.askedAt, "ms from the commit's request to his first new pose").toBeLessThanOrEqual(400);
  });

  test("lists the files a worktree is changing beside its commits, and opens the room panel on a press", async ({ page }) => {
    await page.setViewportSize({ width: 2000, height: 1245 });
    const base = { ...main, agentProcesses: [{ pid: 77, tool: "claudeCode", startedAt: NOW_S - 3600 }] };
    const onBase = { commits: [{ hash: "0a1b2c3", subject: "chore: the base branch's own newest commit", at: NOW_S - 60 }], uncommitted: 0, latestFile: null, onBase: true, files: [] };
    await openWorkStatus(page, [base, ...SIX.slice(1)], { ...ACTIVITY, main: onBase });

    // A screen wide enough names each uncommitted file with its folder, newest first.
    const files = room(page, "feat/library-stage").getByTestId("work-room-files").locator("li");
    await expect(files).toHaveCount(3);
    const newest = files.and(page.locator("[data-place='0']"));
    await expect(newest).toContainText("LibraryPage.tsx");
    await expect(newest).toContainText("src/views/library");
    await expect(newest).toContainText(/\d+ minutes? ago/);
    // The room standing on the base branch lists that branch's own commits, and says so.
    const baseRoom = page.locator("[data-room-key='main']");
    await expect(baseRoom.getByTestId("work-room-monitor")).toContainText("Recent commits");
    await expect(baseRoom.getByTestId("work-room-monitor")).toContainText("the base branch's own newest commit");

    const press = room(page, "feat/library-stage").locator("[data-room-press]");
    await press.click();
    const panel = page.getByTestId("work-room-panel");
    await expect(panel).toBeVisible();
    await expect(press).toHaveAttribute("aria-expanded", "true");
    await expect(panel.getByTestId("work-room-panel-now")).toContainText("Claude Code 1");
    await expect(panel.getByTestId("work-room-panel-files")).toContainText("use-library-model.ts");
    await expect(panel.getByTestId("work-room-panel-path")).toContainText("feat-library-stage");
    // Another room's press hands the panel over; Escape, pressed at once, closes it and returns focus to that room.
    const other = room(page, "feat/map-light").locator("[data-room-press]");
    await other.click();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(other).toBeFocused();
    await expect(other).toHaveAttribute("aria-expanded", "false");
  });

  test("says how the session-list read goes and stops it at its switch, with the waiting room falling back", async ({ page }) => {
    await openWorkStatus(page, SIX);
    await page.evaluate(
      (rows) => (window as unknown as { __workStatusSessions: (rows: unknown[]) => void }).__workStatusSessions(rows),
      [{ worktreeId: "feat-library-stage", pid: CLAUDE.pid, state: "waitingApproval" }],
    );
    const asking = room(page, "feat/library-stage");
    const line = page.getByTestId("work-status-session-list");
    await expect(asking).toHaveAttribute("data-room-state", "waiting");
    await expect(line).toHaveText("Session list on");

    await line.click();
    const panel = page.getByTestId("work-status-session-list-panel");
    await expect(panel).toContainText("claude agents --json");
    await expect(panel.getByTestId("work-status-session-list-now")).toContainText("Read.");

    // A list that cannot be read says why, in the header and in the panel.
    const readGoes = (status: string) => page.evaluate(
      (next) => (window as unknown as { __workStatusSessionRead: (status: string) => void }).__workStatusSessionRead(next),
      status,
    );
    await readGoes("notFound");
    await expect(line).toHaveText("Session list not read");
    await expect(panel.getByTestId("work-status-session-list-now")).toContainText("was not found");
    await readGoes("read");
    await expect(line).toHaveText("Session list on");

    await panel.getByRole("radio", { name: "Off" }).click();
    await expect(line).toHaveText("Session list off");
    await expect(asking).toHaveAttribute("data-room-state", "working");
    await expect(page.getByTestId("work-status-alert-waiting")).toHaveCount(0);
    const calls = () => page.evaluate(() => (window as unknown as { __workStatusSessionCalls: () => { asks: number; forgets: number } }).__workStatusSessionCalls());
    await expect.poll(async () => (await calls()).forgets).toBe(1);

    // Escape closes the panel; the choice outlives a reload, which asks for no list at all.
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await page.reload();
    await page.getByTestId("work-status-choose").click();
    await expect(room(page, "feat/library-stage")).toHaveAttribute("data-room-state", "working");
    await expect(page.getByTestId("work-status-session-list")).toHaveText("Session list off");
    expect((await calls()).asks).toBe(0);

    await page.getByTestId("work-status-session-list").click();
    await page.getByTestId("work-status-session-list-panel").getByRole("radio", { name: "On" }).click();
    await expect(page.getByTestId("work-status-session-list")).toHaveText("Session list on");
    await expect.poll(async () => (await calls()).asks).toBeGreaterThan(0);
  });

  test("frames a room whose session waits for its person, counts it in the header and lets go when it is answered", async ({ page }) => {
    await openWorkStatus(page, SIX);
    const asking = room(page, "feat/library-stage");
    await expect(asking).toHaveAttribute("data-room-state", "working");
    await expect(page.getByTestId("work-status-alert-waiting")).toHaveCount(0);

    const say = (state: string) => page.evaluate(
      (next) => (window as unknown as { __workStatusSessions: (rows: unknown[]) => void }).__workStatusSessions(next),
      [{ worktreeId: "feat-library-stage", pid: CLAUDE.pid, state }, { worktreeId: "feat-work-status-rooms", pid: CLAUDE_LATER.pid, state: "replied" }],
    );
    await say("waitingApproval");
    await expect(asking).toHaveAttribute("data-room-state", "waiting");
    await expect(asking).toHaveAttribute("data-room-size", "large");
    await expect(asking.getByTestId("work-room-monitor")).toContainText("Waiting for your approval");
    await expect(asking.locator("[data-scene]")).toHaveAttribute("data-tone", "warning");
    await expect(asking.locator("[data-room-moru='heads-up']")).toHaveCount(1);
    // A session that has replied is quiet, not at work, and keeps its place on the stage.
    const replied = room(page, "feat/work-status-rooms");
    await expect(replied).toHaveAttribute("data-room-state", "replied");
    await expect(replied).toContainText("Finished replying");
    await expect(replied).toHaveAttribute("data-room-size", "large");

    const alert = page.getByTestId("work-status-alert-waiting");
    await expect(alert).toContainText("1 waiting for you");
    await alert.click();
    await expect(asking).toHaveAttribute("data-flash", "true");
    await expect(replied).not.toHaveAttribute("data-flash", "true");
    await asking.locator("[data-room-press]").click();
    await expect(page.getByTestId("work-room-panel-now")).toContainText("waiting for you");
    await page.keyboard.press("Escape");

    await say("working");
    await expect(asking).toHaveAttribute("data-room-state", "working");
    await expect(page.getByTestId("work-status-alert-waiting")).toHaveCount(0);
  });

  test("shows one room for the base branch when no worktree exists", async ({ page }) => {
    await openWorkStatus(page, [main]);
    await expect(page.getByTestId("work-empty-room")).toContainText("Only main for now");
    await expect(page.getByTestId("work-room")).toHaveCount(0);
  });
});
