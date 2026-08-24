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

  // 화면에 실제로 그려진 진행 줄을 매 tick 마다 훑는다 — 이벤트가 도착해서
  // **렌더까지 됐을 때만** 여기 쌓인다.
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
     * ⚠️ **2026-08-21: 설정 시트를 거치지 않는다** (원장 90). 실행기 목록이
     * 「에이전트」 목적지로 나가면서 시트에는 그 칸이 없다 — 종전 드라이버는
     * `app-settings-nav-runtimes` 를 계속 찾다가 아무것도 못 하고 끝났다
     * (실측: `progressStages` 가 빈 채로 통과했다. 검사가 조용히 무력해진 것이고,
     * 그 자체가 이 이관이 남긴 잔재였다).
     *
     * 이제 목적지에서 곧바로 재고, 거기가 아니면 그 사실을 말한다 —
     * `ONTOLOGY_ATLAS_VERIFY_ROUTE=/ko/agents/` 로 띄우면 된다.
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
      // Node 가 먼저다 — 그게 없으면 CLI 설치도 못 돈다.
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
     * **닫았다 다시 연다** — 이 결함은 그 동작으로만 재현된다 (2026-08-20).
     * 시트가 언마운트되면 진행 상태가 사라지고, 완료(`done`)는 단발이라
     * 그 사이에 지나가면 영영 못 본다. Rust 가 마지막 상태를 들고 있다가
     * 마운트 때 돌려주는지를 여기서 실제로 잰다.
     */
    result.step = "watching-progress";
    result.reason = "sampling the progress row";
    again(500);
  };

  step(0);
})()