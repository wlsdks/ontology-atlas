(() => {
  const result = {
    attempted: true,
    step: "start",
    reason: "scheduled",
    sheetOpen: false,
    sectionOpen: false,
    versionText: "",
    checkClicked: false,
    resultPhase: "",
    resultText: "",
    attempts: 0
  };
  window.__ontologyAtlasAppUpdateVerify = result;

  const MAX_ATTEMPTS = 80;
  const visible = (el) => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || "1") > 0.01 &&
      rect.width > 0 &&
      rect.height > 0;
  };
  const find = (testId) =>
    Array.from(document.querySelectorAll('[data-testid="' + testId + '"]')).find(visible) || null;

  const step = (attempt) => {
    result.attempts = attempt;
    const again = (delay) => window.setTimeout(() => step(attempt + 1), delay || 250);
    if (attempt >= MAX_ATTEMPTS) {
      result.reason = "gave up at " + result.step + ": " + result.reason;
      return;
    }

    if (!find("app-settings-popover")) {
      result.step = "open-settings-sheet";
      const trigger = find("app-settings-trigger");
      if (!trigger) {
        result.reason = "no visible settings trigger on this route";
        again();
        return;
      }
      trigger.click();
      result.reason = "waiting for the settings sheet";
      again(220);
      return;
    }
    result.sheetOpen = true;

    const section = find("app-settings-update");
    if (!section) {
      result.step = "open-app-section";
      const nav = find("app-settings-nav-update");
      if (!nav) {
        result.reason = "settings sheet has no app/update entry";
        again();
        return;
      }
      nav.click();
      result.reason = "waiting for the app section";
      again(220);
      return;
    }
    result.sectionOpen = true;
    // The build currently running — this line shows whether `getVersion()` actually answered.
    result.versionText = find("app-settings-update-version")?.innerText || "";

    if (!result.checkClicked) {
      const button = find("app-settings-update-check");
      if (!button) {
        result.step = "find-check-button";
        result.reason = "app section has no check control";
        again();
        return;
      }
      result.step = "check";
      result.checkClicked = true;
      button.click();
      result.reason = "waiting for the check to settle";
      again(500);
      return;
    }

    const outcome = find("app-settings-update-result");
    if (!outcome) {
      result.reason = "check has not reported yet";
      again(500);
      return;
    }
    result.resultPhase = outcome.getAttribute("data-phase") || "";
    result.resultText = outcome.innerText || "";
    result.step = "done";
    result.reason = "reported";
  };

  step(0);
})()