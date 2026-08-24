(() => {
  const baseUrl = __ATLAS_AI_BASE_URL__;
  const result = {
    attempted: true,
    reason: "scheduled",
    step: "start",
    baseUrl,
    bridgeMissing: false,
    sheetOpen: false,
    aiViewOpen: false,
    localRowFound: false,
    verifyClicked: false,
    modelListOpened: false,
    modelOptionCount: 0,
    models: [],
    selectedModel: "",
    connectedText: "",
    verifiedText: "",
    failureText: "",
    attempts: 0
  };
  window.__ontologyAtlasAiSettingsVerify = result;

  const MAX_ATTEMPTS = 90;
  const CLICK_COOLDOWN = 8;
  const lastClick = {};

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
  const clickOnce = (key, el, attempt) => {
    const previous = lastClick[key];
    if (previous !== undefined && attempt - previous < CLICK_COOLDOWN) return false;
    lastClick[key] = attempt;
    el.click();
    return true;
  };
  const setInputValue = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    );
    if (setter && setter.set) setter.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const step = (attempt) => {
    result.attempts = attempt;
    const again = (delay) => window.setTimeout(() => step(attempt + 1), delay || 250);
    if (attempt >= MAX_ATTEMPTS) {
      result.reason = "gave up at " + result.step + ": " + result.reason;
      return;
    }

    const popover = find("app-settings-popover");
    if (!popover) {
      result.step = "open-settings-sheet";
      const trigger = find("app-settings-trigger");
      if (!trigger) {
        result.reason = "no visible settings trigger on this route";
        again();
        return;
      }
      clickOnce("settings-trigger", trigger, attempt);
      result.reason = "waiting for the settings sheet";
      again(220);
      return;
    }
    result.sheetOpen = true;

    // 2026-08-02 — the drill-in corridor is gone. "Agents in the app" is one
    // LNB row, and its content stands directly in the right pane
    // (`app-settings-pane-ai`). The former two steps (section → summary row →
    // subview) became one.
    const aiView = find("app-settings-pane-ai");
    if (!aiView) {
      result.step = "open-ai-connection-view";
      const navAi = find("app-settings-nav-ai");
      if (navAi) {
        clickOnce("nav-ai", navAi, attempt);
        result.reason = "waiting for the AI connection section";
        again(220);
        return;
      }
      result.reason = "settings sheet has no AI connection entry";
      again();
      return;
    }
    result.aiViewOpen = true;

    if (document.querySelector('[data-testid="ai-connection-web-degraded"]')) {
      result.bridgeMissing = true;
      result.step = "ai-connection-view";
      result.reason = "AI connection rendered its web-degraded card";
      return;
    }

    const localRow = document.querySelector('[data-testid="ai-provider-local"]');
    if (!localRow) {
      result.step = "find-local-provider-row";
      result.reason = "AI connection view has no local/address row";
      again();
      return;
    }
    result.localRowFound = true;

    const urlInput = find("ai-local-url");
    if (!urlInput) {
      result.step = "expand-local-row";
      const register = find("ai-register-local");
      if (!register) {
        result.reason = "local row has neither a base URL field nor a connect control";
        again();
        return;
      }
      clickOnce("register-local", register, attempt);
      result.reason = "waiting for the base URL field";
      again(220);
      return;
    }

    if (!result.verifyClicked) {
      result.step = "type-base-url";
      if (urlInput.value !== baseUrl) {
        setInputValue(urlInput, baseUrl);
        result.reason = "typed the base URL";
        again(160);
        return;
      }
      const verifyButton = find("ai-verify-local");
      if (!verifyButton) {
        result.reason = "no visible connection check control";
        again();
        return;
      }
      if (verifyButton.disabled) {
        result.reason = "connection check is disabled (no vault path?)";
        again();
        return;
      }
      result.step = "press-connection-check";
      result.verifyClicked = true;
      verifyButton.click();
      result.reason = "waiting for the connection verdict";
      again(400);
      return;
    }

    const failure = find("ai-local-failure");
    if (failure) {
      result.step = "connection-verdict";
      result.failureText = (failure.textContent || "").trim();
      result.reason = "connection check failed";
      return;
    }
    const verified = find("ai-local-verified");
    if (!verified) {
      result.step = "await-connection-verdict";
      result.reason = "connection check has not answered yet";
      again(400);
      return;
    }
    result.verifiedText = (verified.textContent || "").trim();

    const modelTrigger = find("ai-local-model");
    if (!modelTrigger) {
      result.step = "await-model-list";
      result.reason = "verdict was ok but no model list appeared";
      again(300);
      return;
    }
    const listbox = document.querySelector('[data-testid="ai-local-model-listbox"]');
    if (!listbox) {
      result.step = "open-model-list";
      clickOnce("model-trigger", modelTrigger, attempt);
      result.reason = "waiting for the model list to open";
      again(220);
      return;
    }
    const options = Array.from(listbox.querySelectorAll('[role="option"]'));
    result.modelListOpened = true;
    result.modelOptionCount = options.length;
    result.models = options.map((option) => (option.textContent || "").trim()).slice(0, 24);
    if (options.length === 0) {
      result.step = "pick-model";
      result.reason = "model list opened with zero options";
      return;
    }

    // Is the list **actually on screen.** Measured 2026-08-02: the seven
    // models the runner supplied were all correct to aria (activedescendant
    // walked all seven), yet only one was visible on screen — because an
    // ancestor two levels up had `overflow: hidden` and clipped the 264px list
    // to 39px (14.8% visible). That state passes every role/aria/text marker.
    // Which is why what this probe measures is **clipping and clickability**.
    const listRect = listbox.getBoundingClientRect();
    let clipTop = listRect.top;
    let clipBottom = listRect.bottom;
    for (let node = listbox.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = window.getComputedStyle(node);
      if (style.overflow === "visible" && style.overflowY === "visible") continue;
      const rect = node.getBoundingClientRect();
      clipTop = Math.max(clipTop, rect.top);
      clipBottom = Math.min(clipBottom, rect.bottom);
    }
    clipTop = Math.max(clipTop, 0);
    clipBottom = Math.min(clipBottom, window.innerHeight);
    result.modelListHeight = Math.round(listRect.height);
    result.modelListVisibleHeight = Math.round(Math.max(0, clipBottom - clipTop));
    // Did the list overflow **inside itself** — a different fact from ancestor
    // clipping. If the cap rule (`select-growth.ts`) holds, this must be false
    // while the item count is below the row cap: a scrollbar when everything
    // is already visible makes "there is more" a lie.
    result.modelListOverflowing = listbox.scrollHeight > listbox.clientHeight + 1;
    result.modelListCappedBy = listbox.getAttribute("data-capped-by") || "";
    // Count only the options inside the list's own scroll window — a long
    // list scrolling within itself is not a defect; "something that claims to
    // be visible cannot be clicked" is the defect.
    const inView = options.filter((option) => {
      const rect = option.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      return centerY >= listRect.top && centerY <= listRect.bottom;
    });
    result.modelOptionsInView = inView.length;
    result.modelOptionsHittable = inView.filter((option) => {
      const rect = option.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return Boolean(hit) && (hit === option || option.contains(hit));
    }).length;

    result.step = "pick-model";
    result.selectedModel = result.models[0];
    options[0].click();
    window.setTimeout(() => {
      const connected = document.querySelector('[data-testid="ai-local-connected"]');
      result.connectedText = connected ? (connected.textContent || "").trim() : "";
      result.reason = connected ? "done" : "model chosen but the connected row never appeared";
    }, 600);
  };

  step(0);
})()