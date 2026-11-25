import type { LoadGroup, LoadRead, LoadTool, MacLoad, SessionLoad, WorktreeLoad } from '../tauri-work-status';

/** Tool groups a room's panel lists before `load.moreGroups`. */
export const LOAD_GROUPS_SHOWN = 5;
/** A stage room's wall facts carry `load.fact` from this much memory (a guess the spec names) ... */
export const LOAD_FACT_MEMORY_BYTES = 1_000_000_000;
/** ... or this many cores busy. */
export const LOAD_FACT_CORES = 1;
/** CPU or GPU use at or over this percent counts as full (a guess the spec names). */
export const FULL_PERCENT = 90;
/** Samples in a row at full before the header warns: 30 s at one sample in five seconds. */
export const FULL_SAMPLES = 6;
/** Samples in a row at macOS's warning or critical memory level before the header warns. */
export const MEMORY_PRESSURE_SAMPLES = 2;
/** Samples in a row below the line before a warning stops. */
export const CALM_SAMPLES = 6;
/** Rooms outlined when the person presses the memory or CPU words. */
export const POINTED_ROOMS = 3;

/** The order groups take when two hold the same memory and CPU: the closed list's own order. */
const TOOL_ORDER: readonly LoadTool[] = ['agent', 'node', 'rust', 'java', 'gradleDaemon', 'xcode', 'python', 'git', 'other'];

const byWeight = (a: LoadGroup, b: LoadGroup) =>
  b.memoryBytes - a.memoryBytes || (b.cpuCores ?? 0) - (a.cpuCores ?? 0) || TOOL_ORDER.indexOf(a.tool) - TOOL_ORDER.indexOf(b.tool);

/** What a room's panel says of its load: its totals, the five heaviest groups, and how many more. */
export interface RoomLoad {
  memoryBytes: number;
  /** `null` on the first sample after load was off or hidden: `panel.reading`. */
  cpuCores: number | null;
  groups: LoadGroup[];
  moreGroups: number;
  agentsElsewhere: WorktreeLoad['agentsElsewhere'];
}

/** `null`: no process of the room's is under an agent program, so `load.none`. O(groups log groups). */
export function roomLoadOf(load: WorktreeLoad | undefined): RoomLoad | null {
  if (!load || (load.groups.length === 0 && load.agentsElsewhere.length === 0)) return null;
  const groups = [...load.groups].sort(byWeight);
  return {
    memoryBytes: load.memoryBytes,
    cpuCores: load.cpuCores,
    groups: groups.slice(0, LOAD_GROUPS_SHOWN),
    moreGroups: Math.max(0, groups.length - LOAD_GROUPS_SHOWN),
    agentsElsewhere: load.agentsElsewhere,
  };
}

/** Program groups a session block names beside its figures, heaviest first. */
export const SESSION_TOOLS_SHOWN = 2;

/** What a session block says of its own command tree. */
export interface SessionLoadFacts {
  memoryBytes: number;
  cpuCores: number | null;
  /** The heaviest groups besides the agent program itself, which every session has. */
  tools: LoadGroup[];
}

/** `null`: Atlas knows no pid for the session, or no process was credited to it. O(groups log groups). */
export function sessionLoadOf(read: LoadRead | null, pid: number | null): SessionLoadFacts | null {
  const load: SessionLoad | undefined = read && pid !== null ? read.sessions[String(pid)] : undefined;
  if (!load) return null;
  return {
    memoryBytes: load.memoryBytes,
    cpuCores: load.cpuCores,
    tools: load.groups.filter(group => group.tool !== 'agent').sort(byWeight).slice(0, SESSION_TOOLS_SHOWN),
  };
}

/** Whether a stage room's wall facts carry `load.fact`. */
export function showsLoadFact(load: WorktreeLoad | undefined): boolean {
  return load !== undefined && (load.memoryBytes >= LOAD_FACT_MEMORY_BYTES || (load.cpuCores ?? 0) >= LOAD_FACT_CORES);
}

/** The groups running outside every room, heaviest first: `load.outside`. */
export function outsideGroupsOf(read: LoadRead): LoadGroup[] {
  return [...read.outside].sort(byWeight);
}

/** The rooms using the most memory or CPU, heaviest first, for the header's memory and CPU words. */
export function heaviestRooms(read: LoadRead, by: 'memory' | 'cpu', count: number = POINTED_ROOMS): string[] {
  const weight = (load: WorktreeLoad) => (by === 'memory' ? load.memoryBytes : load.cpuCores ?? 0);
  return Object.entries(read.worktrees)
    .filter(([, load]) => weight(load) > 0)
    .sort(([keyA, a], [keyB, b]) => weight(b) - weight(a) || keyA.localeCompare(keyB))
    .slice(0, count)
    .map(([key]) => key);
}

/** One header warning's run of samples. */
export interface PressureRun {
  warning: boolean;
  over: number;
  under: number;
}

/** The header's memory, CPU and GPU warnings: `header.memory`, `.cpu`, `.gpu`. */
export interface LoadPressure {
  memory: PressureRun;
  cpu: PressureRun;
  gpu: PressureRun;
}

const CALM: PressureRun = { warning: false, over: 0, under: 0 };
export const NO_PRESSURE: LoadPressure = { memory: CALM, cpu: CALM, gpu: CALM };

function nextRun(run: PressureRun, over: boolean, samplesToWarn: number): PressureRun {
  if (over) {
    const overCount = run.over + 1;
    return { warning: run.warning || overCount >= samplesToWarn, over: overCount, under: 0 };
  }
  const underCount = run.under + 1;
  return { warning: run.warning && underCount < CALM_SAMPLES, over: 0, under: underCount };
}

/** Whether the whole Mac's CPU is full; a missing figure is not. Multiplied, not divided, so 90 % of the cores is exactly full. */
function cpuFull(mac: MacLoad): boolean {
  return mac.cpuCores !== null && mac.coreCount > 0 && mac.cpuCores * 100 >= FULL_PERCENT * mac.coreCount;
}

/**
 * The header's warnings after one sample. Memory warns on macOS's own level at warning or critical
 * for two samples; CPU or GPU at 90 % or more for six. Each stops after six samples below. A
 * missing figure counts as below, and a failed sample clears every warning: Atlas says less.
 */
export function nextPressure(previous: LoadPressure, read: LoadRead): LoadPressure {
  const mac = read.status === 'read' ? read.mac : null;
  if (!mac) return NO_PRESSURE;
  return {
    memory: nextRun(previous.memory, mac.pressure !== 'normal', MEMORY_PRESSURE_SAMPLES),
    cpu: nextRun(previous.cpu, cpuFull(mac), FULL_SAMPLES),
    gpu: nextRun(previous.gpu, mac.gpuPercent !== null && mac.gpuPercent >= FULL_PERCENT, FULL_SAMPLES),
  };
}
