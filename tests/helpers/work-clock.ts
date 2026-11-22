/**
 * Starts a clock for work that has no countable step, and returns a reading of the milliseconds
 * spent since. The reading is the smaller of the wall clock, which other processes inflate, and
 * this process's CPU time, which collector threads inflate: the work itself is at most both.
 */
export function startWorkClock(): () => number {
  const wallStarted = performance.now();
  const cpuStarted = process.cpuUsage();
  return () => {
    const cpu = process.cpuUsage(cpuStarted);
    return Math.min(performance.now() - wallStarted, (cpu.user + cpu.system) / 1000);
  };
}
