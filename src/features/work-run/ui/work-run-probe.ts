import { workRuns } from '../model/work-run-store';

type ProbeWindow = { __atlasWorkRuns?: typeof workRuns };

/**
 * With `?e2e` in the address the app was opened at, the session's runs answer a browser test,
 * which plants a run whose driver is not on screen (as `light-probe.ts` does for the map's light).
 */
export function installWorkRunProbe(): () => void {
  if (!new URLSearchParams(window.location.search).has('e2e')) return () => {};
  const probeWindow = window as unknown as ProbeWindow;
  probeWindow.__atlasWorkRuns = workRuns;
  return () => {
    if (probeWindow.__atlasWorkRuns === workRuns) delete probeWindow.__atlasWorkRuns;
  };
}
