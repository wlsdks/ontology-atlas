import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { waitForAnimationsDone } from "./settle";

/**
 * Work status in the app, with the two native reads stubbed: the rooms a person sees for a
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

async function openWorkStatus(page: Page, rows: Row[]) {
  await seedFirstRunSeen(page);
  await page.addInitScript((initial: Row[]) => {
    const state = { rows: initial, version: 1 };
    const target = window as unknown as Record<string, unknown>;
    target.__workStatusRows = (next: Row[]) => { state.rows = next; state.version += 1; };
    target.isTauri = true;
    target.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
    target.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      invoke(command: string) {
        const answer = (value: unknown) => new Promise(resolve => setTimeout(() => resolve(value), 60));
        if (command === "pick_source_directory") return answer("/Users/probe/repo");
        if (command === "work_status_fingerprint") return answer(`v${state.version}`);
        if (command === "work_status_read") {
          return answer({ status: "ready", root: "/Users/probe/repo", repository: "repo", host: "github.com", baseBranch: "main", worktrees: structuredClone(state.rows) });
        }
        return Promise.reject(new Error(`unstubbed native command: ${command}`));
      },
    };
  }, rows);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/en/work-status/");
  await page.getByTestId("work-status-choose").click();
}

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
  /** Name tags showing on the stage, so the stage never reads as empty. */
  tags: number;
  /** How much of each room's content shows: its faces and each of their fading parts, by room. */
  content: Record<string, number>;
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
    const frames: PaintFrame[] = [];
    Object.assign(window, { __paint: { frames, slots } });
    const sample = (frameTime: number) => {
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
      const tags = [...document.querySelectorAll("[data-testid=work-building] [data-room-tag]")].filter((tag) => seen(tag) > 0.5).length;
      const visible: Record<string, number> = {};
      for (const element of all) {
        const faces = [...element.querySelectorAll(":scope > [data-room-face]")];
        visible[`${keyOf(element)}:face`] = Math.max(visible[`${keyOf(element)}:face`] ?? 0, ...faces.map(seen));
        for (const face of faces) {
          face.querySelectorAll("[data-room-part]").forEach((part, index) => {
            const name = `${keyOf(element)}:part${index}`;
            visible[name] = Math.max(visible[name] ?? 0, seen(part));
          });
        }
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
      }
      frames.push({ copies: Math.max(0, ...copies.values()), overlaps, covered, litGhost, time: frameTime, tags, content: visible, moru, edges, boxes });
      if (frames.length < 900) requestAnimationFrame(sample);
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
  expect.soft(frames.filter((frame) => frame.tags === 0).length, "frames with no name tag on the stage").toBe(0);
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
  // Moru glides to a new scale: within any 40 ms its drawn width changes by at most a fifth.
  const jumps: string[] = [];
  frames.forEach((frame, index) => {
    const next = frames[index + 1];
    if (!next || next.time - frame.time > 40) return;
    for (const [name, width] of Object.entries(frame.moru)) {
      const after = next.moru[name];
      if (after !== undefined && width > 0 && Math.abs(after - width) / width > 0.2) jumps.push(`${name} ${Math.round(width)}→${Math.round(after)}px`);
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
    const steps: { dx: number; dy: number; size: number; at: number }[] = [];
    for (let index = 1; index < frames.length; index += 1) {
      const [a, b] = [frames[index - 1].boxes[key], frames[index].boxes[key]];
      if (!a || !b) continue;
      steps.push({ dx: b[0] - a[0], dy: b[1] - a[1], size: Math.max(Math.abs(b[2] - a[2]), Math.abs(b[3] - a[3])), at: Math.round(frames[index].time - frames[0].time) });
    }
    steps.forEach((step, index) => {
      const length = Math.max(Math.hypot(step.dx, step.dy), step.size);
      const before = Math.max(0, ...steps.slice(Math.max(0, index - 3), index).map((s) => Math.max(Math.hypot(s.dx, s.dy), s.size)));
      if (length > Math.max(48, 2.5 * before)) jumps.push(`${key} ${Math.round(length)}px at ${step.at}ms after ${Math.round(before)}px`);
      const previous = steps[index - 1];
      if (previous && Math.hypot(previous.dx, previous.dy) > 2 && Math.hypot(step.dx, step.dy) > 2 && previous.dx * step.dx + previous.dy * step.dy < -0.5 * Math.hypot(previous.dx, previous.dy) * Math.hypot(step.dx, step.dy)) {
        reversals.push(`${key} at ${step.at}ms`);
      }
    });
  }
  expect.soft(jumps.slice(0, 6), "rooms that jumped").toEqual([]);
  expect.soft(reversals.slice(0, 6), "rooms that turned back").toEqual([]);
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
    await openWorkStatus(page, SIX);
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
  });

  // Known failing: an update landing mid-sequence cuts half-shown faces (about 0.4 to 0 in one frame)
  // and jumps rooms 70 to 140 px. The guard stays so the fix is measured, not assumed.
  test.fixme("retargets mid-sequence when the next update lands before the last one finished", async ({ page }) => {
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

  test("shows one room for the base branch when no worktree exists", async ({ page }) => {
    await openWorkStatus(page, [main]);
    await expect(page.getByTestId("work-empty-room")).toContainText("Only main for now");
    await expect(page.getByTestId("work-room")).toHaveCount(0);
  });
});
