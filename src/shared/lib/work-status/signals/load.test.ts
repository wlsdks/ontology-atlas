import { describe, expect, it } from 'vitest';
import type { LoadGroup, LoadRead, MacLoad, WorktreeLoad } from '../tauri-work-status';
import {
  CALM_SAMPLES,
  FULL_SAMPLES,
  LOAD_FACT_MEMORY_BYTES,
  LOAD_GROUPS_SHOWN,
  NO_PRESSURE,
  heaviestRooms,
  nextPressure,
  outsideGroupsOf,
  roomLoadOf,
  showsLoadFact,
  type LoadPressure,
} from './load';

const MIB = 1024 * 1024;

const group = (tool: LoadGroup['tool'], memoryMiB: number, cpuCores: number | null = 0.1): LoadGroup => ({ tool, count: 1, memoryBytes: memoryMiB * MIB, cpuCores });
const worktree = (groups: LoadGroup[], agentsElsewhere: WorktreeLoad['agentsElsewhere'] = []): WorktreeLoad => ({
  memoryBytes: groups.reduce((sum, each) => sum + each.memoryBytes, 0),
  cpuCores: groups.reduce((sum, each) => sum + (each.cpuCores ?? 0), 0),
  groups,
  agentsElsewhere,
});
const mac = (patch: Partial<MacLoad> = {}): MacLoad => ({
  memoryUsedBytes: 20_000 * MIB, memoryTotalBytes: 65_536 * MIB, pressure: 'normal', cpuCores: 2, coreCount: 18, gpuPercent: 31, ...patch,
});
const sample = (patch: Partial<MacLoad> = {}, worktrees: Record<string, WorktreeLoad> = {}): LoadRead => ({ status: 'read', worktrees, outside: [], mac: mac(patch) });
const FAILED: LoadRead = { status: 'failed', worktrees: {}, outside: [], mac: null };

const after = (samples: LoadRead[], from: LoadPressure = NO_PRESSURE) => samples.reduce(nextPressure, from);
const repeat = (count: number, read: LoadRead) => Array.from({ length: count }, () => read);

describe('roomLoadOf', () => {
  it('lists the five heaviest tool groups and counts the rest', () => {
    const tools: LoadGroup['tool'][] = ['agent', 'node', 'rust', 'java', 'xcode', 'python', 'git'];
    const load = roomLoadOf(worktree(tools.map((tool, index) => group(tool, 100 * (index + 1)))));
    expect(load?.groups.map(each => each.tool)).toEqual(['git', 'python', 'xcode', 'java', 'rust']);
    expect(load?.groups).toHaveLength(LOAD_GROUPS_SHOWN);
    expect(load?.moreGroups).toBe(2);
  });

  it('says there is no load for a room with nothing running, and keeps a room whose agent counts elsewhere', () => {
    expect(roomLoadOf(undefined)).toBeNull();
    expect(roomLoadOf(worktree([]))).toBeNull();
    expect(roomLoadOf(worktree([group('node', 50)], [{ pid: 41, worktreeId: 'main' }]))?.agentsElsewhere).toEqual([{ pid: 41, worktreeId: 'main' }]);
  });

  it('carries no CPU figure on the first sample, so the panel says it is reading', () => {
    expect(roomLoadOf({ ...worktree([group('node', 50, null)]), cpuCores: null })?.cpuCores).toBeNull();
  });
});

describe('showsLoadFact', () => {
  it('puts load on the wall facts from a gigabyte or one core', () => {
    expect(showsLoadFact(undefined)).toBe(false);
    expect(showsLoadFact({ ...worktree([]), memoryBytes: LOAD_FACT_MEMORY_BYTES - 1, cpuCores: 0.9 })).toBe(false);
    expect(showsLoadFact({ ...worktree([]), memoryBytes: LOAD_FACT_MEMORY_BYTES, cpuCores: 0 })).toBe(true);
    expect(showsLoadFact({ ...worktree([]), memoryBytes: 0, cpuCores: 1 })).toBe(true);
  });
});

describe('heaviestRooms and outside groups', () => {
  it('points to the three rooms using the most memory, or the most CPU', () => {
    const read = sample({}, {
      a: worktree([group('node', 100, 3)]), b: worktree([group('node', 400, 0.2)]), c: worktree([group('node', 300, 1)]),
      d: worktree([group('node', 200, 2)]), idle: worktree([group('git', 0, 0)]),
    });
    expect(heaviestRooms(read, 'memory')).toEqual(['b', 'c', 'd']);
    expect(heaviestRooms(read, 'cpu')).toEqual(['a', 'd', 'c']);
  });

  it('lists work outside every room heaviest first', () => {
    const read: LoadRead = { ...sample(), outside: [group('java', 100), group('gradleDaemon', 900)] };
    expect(outsideGroupsOf(read).map(each => each.tool)).toEqual(['gradleDaemon', 'java']);
  });
});

describe('nextPressure', () => {
  const fullCpu = sample({ cpuCores: 9, coreCount: 10 });
  const calm = sample();

  it('warns of full CPU only after six samples in a row at or over 90 percent', () => {
    expect(after(repeat(FULL_SAMPLES - 1, fullCpu)).cpu.warning).toBe(false);
    expect(after([...repeat(FULL_SAMPLES - 1, fullCpu), calm, fullCpu]).cpu.warning).toBe(false);
    expect(after(repeat(FULL_SAMPLES, fullCpu)).cpu.warning).toBe(true);
  });

  it('keeps a warning until six samples in a row fall below', () => {
    const warned = after(repeat(FULL_SAMPLES, fullCpu));
    expect(after(repeat(CALM_SAMPLES - 1, calm), warned).cpu.warning).toBe(true);
    expect(after(repeat(CALM_SAMPLES, calm), warned).cpu.warning).toBe(false);
  });

  it('warns of memory on macOS level warning or critical for two samples', () => {
    expect(after([sample({ pressure: 'warning' })]).memory.warning).toBe(false);
    expect(after([sample({ pressure: 'warning' }), sample({ pressure: 'critical' })]).memory.warning).toBe(true);
  });

  it('warns of a full GPU, and says nothing of a GPU the Mac does not report', () => {
    expect(after(repeat(FULL_SAMPLES, sample({ gpuPercent: 95 }))).gpu.warning).toBe(true);
    expect(after(repeat(FULL_SAMPLES * 2, sample({ gpuPercent: null }))).gpu.warning).toBe(false);
  });

  it('counts a missing CPU figure as below the line', () => {
    expect(after(repeat(FULL_SAMPLES, sample({ cpuCores: null }))).cpu.warning).toBe(false);
  });

  it('clears every header warning on a failed sample', () => {
    const warned = after([...repeat(FULL_SAMPLES, sample({ cpuCores: 18, gpuPercent: 99, pressure: 'critical' }))]);
    expect([warned.memory.warning, warned.cpu.warning, warned.gpu.warning]).toEqual([true, true, true]);
    expect(nextPressure(warned, FAILED)).toEqual(NO_PRESSURE);
  });
});
