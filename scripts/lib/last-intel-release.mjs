/** v1.5.0 is the last release with an Intel macOS build (decision `apple-silicon-only-macos`). */
export const LAST_INTEL_VERSION = [1, 5, 0];

export function isAfterLastIntel(version) {
  const parts = String(version).split(/[.-]/).slice(0, 3).map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (parts[index] !== LAST_INTEL_VERSION[index]) return !(parts[index] < LAST_INTEL_VERSION[index]);
  }
  return false;
}
