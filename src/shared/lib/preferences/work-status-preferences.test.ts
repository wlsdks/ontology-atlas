import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  useFilePulseEnabled,
  useLoadReadEnabled,
  useSessionListReadEnabled,
  useSessionNamesEnabled,
  writeFilePulseRead,
  writeLoadRead,
  writeSessionListRead,
  writeSessionNamesRead,
} from "./work-status-preferences";

const switches = [
  { name: "session list", key: "atlas.workStatus.sessionListRead", use: useSessionListReadEnabled, write: writeSessionListRead },
  { name: "session names", key: "atlas.workStatus.sessionNames", use: useSessionNamesEnabled, write: writeSessionNamesRead },
  { name: "file pulse", key: "atlas.workStatus.filePulse", use: useFilePulseEnabled, write: writeFilePulseRead },
  { name: "load", key: "atlas.workStatus.loadRead", use: useLoadReadEnabled, write: writeLoadRead },
];

describe("Work status read switches", () => {
  afterEach(() => window.localStorage.clear());

  it.each(switches)("starts the $name read on when nothing is stored", ({ use }) => {
    expect(renderHook(use).result.current).toBe(true);
  });

  it.each(switches)("keeps the $name switch off across a restart and tells the open screen at once", ({ key, use, write }) => {
    const { result } = renderHook(use);
    act(() => write(false));
    expect(result.current).toBe(false);
    expect(window.localStorage.getItem(key)).toBe("off");
    // A restart reads only what storage holds.
    expect(renderHook(use).result.current).toBe(false);
    act(() => write(true));
    expect(result.current).toBe(true);
  });

  it("keeps each switch apart: turning one off leaves the others on", () => {
    act(() => writeSessionNamesRead(false));
    expect(renderHook(useSessionNamesEnabled).result.current).toBe(false);
    expect(renderHook(useFilePulseEnabled).result.current).toBe(true);
    expect(renderHook(useLoadReadEnabled).result.current).toBe(true);
    expect(renderHook(useSessionListReadEnabled).result.current).toBe(true);
  });
});
