import { describe, expect, it, vi } from "vitest";

import { notifyPreferenceChange, subscribeToPreferenceChange } from "./preference-change-event";

describe("preference change event", () => {
  it("announces a same-tab write under the stored event name", () => {
    const heard = vi.fn();
    window.addEventListener("ontology-atlas:appearance-preference-change", heard);
    notifyPreferenceChange();
    window.removeEventListener("ontology-atlas:appearance-preference-change", heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("wakes a subscriber on a same-tab write and on another tab's storage event, then stops", () => {
    const changed = vi.fn();
    const stop = subscribeToPreferenceChange(changed);
    notifyPreferenceChange();
    window.dispatchEvent(new StorageEvent("storage", { key: "atlas.library.guide-seen" }));
    expect(changed).toHaveBeenCalledTimes(2);
    stop();
    notifyPreferenceChange();
    window.dispatchEvent(new StorageEvent("storage"));
    expect(changed).toHaveBeenCalledTimes(2);
  });
});
