import type { DialTokens } from "../types";

export function flowHeadSize(tokens: Pick<DialTokens, "flowHeadBasePx" | "flowHeadGain">, w0: number, w1: number, branch = false): number {
  const size = tokens.flowHeadBasePx + tokens.flowHeadGain * Math.max(w0, w1);
  return branch ? Math.max(8, size) : size;
}
