import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  useAgentActivityStatusEnabled,
  useAgentNotificationsEnabled,
  useMutedAgentNotificationKinds,
  writeAgentActivityStatus,
  writeAgentNotificationsEnabled,
  writeMutedAgentNotificationKinds,
} from "./agent-activity-preferences";
import {
  useCanvasBackground,
  useFrameMeter,
  useGlyphSet,
  writeCanvasBackground,
  writeFrameMeter,
  writeGlyphSet,
} from "./canvas-appearance-preferences";
import { DEFAULT_EXPAND, useExpand, writeExpand } from "./expand-preferences";
import { useSessionListReadEnabled, writeSessionListRead } from "./work-status-preferences";
import { DEFAULT_FOOTPRINT, useFootprint, writeFootprint } from "./footprint-preferences";
import {
  useLibraryGuideSeen,
  useLibraryIndexSegment,
  useWikiWriteMode,
  writeLibraryGuideSeen,
  writeLibraryIndexSegment,
  writeWikiWriteMode,
} from "./library-preferences";
import {
  useMapDragSpeed,
  useMapZoomSpeed,
  writeMapDragSpeed,
  writeMapZoomSpeed,
} from "./map-navigation-speed-preferences";
import {
  useHexBoard,
  useHexRelief,
  useMapView,
  useView3d,
  writeHexRelief,
  writeMapView,
} from "./map-view-preferences";

interface StoredPreference {
  /** The product's name for the preference, shown when a row fails. */
  name: string;
  /** The exact localStorage key; renaming it silently drops every saved choice. */
  key: string;
  /** What the preference reads back as when nothing is stored. */
  defaultValue: unknown;
  /** A non-default raw value a person may already have saved under `key`. */
  savedRaw: string;
  /** What the preference reads back as once `savedRaw` is stored. */
  savedValue: unknown;
  read: () => unknown;
  /** Stores a value through the writer; absent for a key that is only read. */
  write?: () => void;
  /** The raw string `write` must leave under `key`. */
  writtenRaw?: string;
}

const readHook =
  <Value>(use: () => Value) =>
  () =>
    renderHook(use).result.current;

const readMutedKinds = () => [...renderHook(() => useMutedAgentNotificationKinds()).result.current];

const storedPreferences: StoredPreference[] = [
  {
    name: "canvas background",
    key: "ontology-atlas:canvas-background:v1",
    defaultValue: "dot",
    savedRaw: "web",
    savedValue: "web",
    read: readHook(useCanvasBackground),
    write: () => writeCanvasBackground("depth"),
    writtenRaw: "depth",
  },
  {
    name: "glyph set",
    key: "ontology-atlas:glyph-set:v1",
    defaultValue: "geometric",
    savedRaw: "line",
    savedValue: "line",
    read: readHook(useGlyphSet),
    write: () => writeGlyphSet("line"),
    writtenRaw: "line",
  },
  {
    name: "frame meter",
    key: "atlas.appearance.frameMeter",
    defaultValue: false,
    savedRaw: "on",
    savedValue: true,
    read: readHook(useFrameMeter),
    write: () => writeFrameMeter(true),
    writtenRaw: "on",
  },
  {
    name: "map drag speed",
    key: "atlas.appearance.map-drag-speed",
    defaultValue: 1,
    savedRaw: "1.5",
    savedValue: 1.5,
    read: readHook(useMapDragSpeed),
    write: () => writeMapDragSpeed(0.75),
    writtenRaw: "0.75",
  },
  {
    name: "map zoom speed",
    key: "atlas.appearance.map-zoom-speed",
    defaultValue: 1,
    savedRaw: "0.5",
    savedValue: 0.5,
    read: readHook(useMapZoomSpeed),
    write: () => writeMapZoomSpeed(2),
    writtenRaw: "2",
  },
  {
    name: "3D flag",
    key: "atlas.appearance.view3d",
    defaultValue: false,
    savedRaw: "on",
    savedValue: true,
    read: readHook(useView3d),
    write: () => writeMapView("3d"),
    writtenRaw: "on",
  },
  {
    name: "hex board view",
    key: "atlas.appearance.hex-board",
    defaultValue: false,
    savedRaw: "on",
    savedValue: true,
    read: readHook(useHexBoard),
    write: () => writeMapView("hex"),
    writtenRaw: "on",
  },
  {
    name: "hex board relief",
    key: "atlas.appearance.hex-relief",
    defaultValue: false,
    savedRaw: "on",
    savedValue: true,
    read: readHook(useHexRelief),
    write: () => writeHexRelief(true),
    writtenRaw: "on",
  },
  {
    name: "agent activity status",
    key: "atlas.agentActivity.status",
    defaultValue: true,
    savedRaw: "off",
    savedValue: false,
    read: readHook(useAgentActivityStatusEnabled),
    write: () => writeAgentActivityStatus(false),
    writtenRaw: "off",
  },
  {
    name: "session list read",
    key: "atlas.workStatus.sessionListRead",
    defaultValue: true,
    savedRaw: "off",
    savedValue: false,
    read: readHook(useSessionListReadEnabled),
    write: () => writeSessionListRead(false),
    writtenRaw: "off",
  },
  {
    name: "agent notifications",
    key: "atlas.agentActivity.notifications",
    defaultValue: true,
    savedRaw: "off",
    savedValue: false,
    read: readHook(useAgentNotificationsEnabled),
    write: () => writeAgentNotificationsEnabled(false),
    writtenRaw: "off",
  },
  {
    name: "muted agent notification kinds",
    key: "atlas.agentActivity.kinds",
    defaultValue: [],
    savedRaw: '["write","edit"]',
    savedValue: ["write", "edit"],
    read: readMutedKinds,
    write: () => writeMutedAgentNotificationKinds(new Set(["write", "edit"])),
    writtenRaw: '["edit","write"]',
  },
  {
    name: "footprint",
    key: "ontology-atlas:footprint:v1",
    defaultValue: DEFAULT_FOOTPRINT,
    savedRaw: '{"size":17,"gap":4,"opacity":0.95,"tone":"indigo"}',
    savedValue: { size: 17, gap: 4, opacity: 0.95, tone: "indigo" },
    read: readHook(useFootprint),
    write: () => writeFootprint(DEFAULT_FOOTPRINT),
    writtenRaw: JSON.stringify(DEFAULT_FOOTPRINT),
  },
  {
    name: "expand",
    key: "ontology-atlas:expand:v1",
    defaultValue: DEFAULT_EXPAND,
    savedRaw:
      '{"affordance":"pill","structure":"ring","batchSize":10,"labelAttempts":12,"maxOpenParents":2}',
    savedValue: {
      affordance: "pill",
      structure: "ring",
      batchSize: 10,
      labelAttempts: 12,
      maxOpenParents: 2,
    },
    read: readHook(useExpand),
    write: () => writeExpand(DEFAULT_EXPAND),
    writtenRaw: JSON.stringify(DEFAULT_EXPAND),
  },
  {
    name: "library index segment",
    key: "atlas.library.index-segment",
    defaultValue: "sources",
    savedRaw: "wiki",
    savedValue: "wiki",
    read: readHook(useLibraryIndexSegment),
    write: () => writeLibraryIndexSegment("wiki"),
    writtenRaw: "wiki",
  },
  {
    name: "wiki write mode",
    key: "library.wikiWriteMode",
    defaultValue: "auto",
    savedRaw: "ask",
    savedValue: "ask",
    read: readHook(useWikiWriteMode),
    write: () => writeWikiWriteMode("ask"),
    writtenRaw: "ask",
  },
  {
    name: "library guide seen",
    key: "atlas.library.guide-seen",
    defaultValue: false,
    savedRaw: "on",
    savedValue: true,
    read: readHook(useLibraryGuideSeen),
    write: () => writeLibraryGuideSeen(true),
    writtenRaw: "on",
  },
];

const writable = storedPreferences.filter((preference) => preference.write);

describe("stored appearance, agent activity and library preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("lists each storage key once", () => {
    const keys = storedPreferences.map((preference) => preference.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(storedPreferences)("$name reads its default when nothing is stored", (preference) => {
    expect(preference.read()).toEqual(preference.defaultValue);
  });

  it.each(storedPreferences)("$name loads a value saved under $key", (preference) => {
    window.localStorage.setItem(preference.key, preference.savedRaw);
    expect(preference.read()).toEqual(preference.savedValue);
  });

  it.each(writable)("$name writes its string to $key", (preference) => {
    preference.write?.();
    expect(window.localStorage.getItem(preference.key)).toBe(preference.writtenRaw);
  });

  it("the Neural view still reads from the coupling arrangement key", () => {
    window.localStorage.setItem("atlas.appearance.view3d", "on");
    window.localStorage.setItem("atlas.appearance.map-arrangement", "coupling");
    expect(renderHook(() => useMapView()).result.current).toBe("neural");
    window.localStorage.setItem("atlas.appearance.map-arrangement", "strata");
    expect(renderHook(() => useMapView()).result.current).toBe("3d");
  });
});
