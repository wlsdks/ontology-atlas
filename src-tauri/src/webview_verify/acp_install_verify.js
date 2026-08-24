(() => {
  const result = {
    attempted: true,
    step: "start",
    reason: "scheduled",
    sheetOpen: false,
    sectionOpen: false,
    scanClicked: false,
    doctorRendered: false,
    installClicked: "",
    progressStages: [],
    progressBarWidths: [],
    lastPercentText: "",

    attempts: 0
  };
  window.__ontologyAtlasAcpInstallVerify = result;

  const MAX_ATTEMPTS = 220;
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

  // Sweep the progress row actually drawn on screen on every tick — an entry
  // accumulates here only when an event has arrived **and made it to render**.
  const sample = () => {
    const row = document.querySelector('[data-testid="agent-doctor-progress"]');
    if (!row) return;
    const stage = row.getAttribute("data-stage") || "";
    if (stage && result.progressStages[result.progressStages.length - 1] !== stage) {
      result.progressStages.push(stage);
    }
    const bar = row.querySelector('[data-testid="agent-doctor-progress-bar"] > *');
    if (bar) {
      const width = bar.style.width || "";
      if (width && result.progressBarWidths[result.progressBarWidths.length - 1] !== width) {
        result.progressBarWidths.push(width);
      }
      result.lastPercentText = width;
    }
  };

  const step = (attempt) => {
    result.attempts = attempt;
    sample();
    const again = (delay) => window.setTimeout(() => step(attempt + 1), delay || 250);
    if (attempt >= MAX_ATTEMPTS) {
      result.reason = "gave up at " + result.step + ": " + result.reason;
      return;
    }

    /*
     * ⚠️ **2026-08-21: do not go through the settings sheet** (ledger 90). The
     * runtime list moved out to the "Agents" destination and the sheet no longer
     * has that slot — the previous driver kept looking for
     * `app-settings-nav-runtimes`, accomplished nothing, and ended
     * (measured: it passed with `progressStages` empty. The check had gone
     * quietly inert, and that itself was residue this migration left behind).
     *
     * Now we measure right at the destination, and if we are not there we say
     * so — launch with `ONTOLOGY_ATLAS_VERIFY_ROUTE=/ko/agents/`.
     */
    result.sheetOpen = !!find("app-settings-popover");

    if (!find("app-settings-runtimes")) {
      result.step = "reach-agents-destination";
      result.reason = "not on the Agents destination (run with ONTOLOGY_ATLAS_VERIFY_ROUTE=/ko/agents/)";
      again(400);
      return;
    }
    result.sectionOpen = true;

    if (!result.scanClicked) {
      const scan = find("agent-doctor-scan");
      if (!scan) { result.step = "find-scan"; result.reason = "no doctor scan control"; again(400); return; }
      result.step = "scan";
      result.scanClicked = true;
      scan.click();
      again(900);
      return;
    }

    if (!document.querySelector('[data-testid="agent-doctor"]')) {
      result.reason = "doctor has not reported yet";
      again(500);
      return;
    }
    result.doctorRendered = true;

    if (!result.installClicked) {
      // Node comes first — without it the CLI install cannot run either.
      const node = find("agent-doctor-install-node");
      const cli = find("agent-doctor-install");
      const target = node || cli;
      if (!target) {
        result.step = "nothing-to-install";
        result.reason = "this environment has nothing blocked that the app can install";
        return;
      }
      result.step = "install";
      result.installClicked = node ? "node" : "cli";
      target.click();
      again(500);
      return;
    }

    /*
     * **Close it and open it again** — this defect reproduces only through that
     * motion (2026-08-20). When the sheet unmounts, the progress state
     * disappears, and completion (`done`) is a one-shot, so if it passes in
     * that gap it is never seen. Here we actually measure whether Rust holds
     * the last state and hands it back on mount.
     */
    result.step = "watching-progress";
    result.reason = "sampling the progress row";
    again(500);
  };

  step(0);
})()