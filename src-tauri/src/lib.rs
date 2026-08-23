use notify_debouncer_full::notify::{RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

/// ACP harness — finds coding agents already installed by the user and invokes them within the app.
mod acp;
mod acp_doctor;
mod managed_node;
/// "Agent Connection" — interprets bundled MCP server paths · plans/writes config files · self-validates.
mod agent_setup;
/// Atlas Git — native layer for versioning vaults with git (invoked by the web GUI).
mod git;
/// BYOK connection check — verifies authentication using the keychain key and logs to the Bolt audit log.
mod llm;
/// LLM call audit log — implementation of "do not send if logging fails."
mod llm_audit;
mod secrets;

const WEBVIEW_VERIFY_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_WEBVIEW";
const WEBVIEW_VERIFY_ROUTE_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_ROUTE";
const WEBVIEW_VERIFY_VAULT_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_VAULT";
const WEBVIEW_VERIFY_AI_SETTINGS_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_AI_SETTINGS";
const WEBVIEW_VERIFY_AI_BASE_URL_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_AI_BASE_URL";
const WEBVIEW_VERIFY_WINDOW_SIZE_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_WINDOW_SIZE";
/// Switch to measure whether **"Check for Updates" actually triggers** in the installed app.
///
/// Per this repository's discipline, the updater only recognizes updates measured **from the installed app**
/// (`.claude/rules/testing.md`) — the browser has no self to update.
const WEBVIEW_VERIFY_APP_UPDATE_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_APP_UPDATE";
/// Switch to measure whether **installation progress actually reaches the screen** in the installed app.
///
/// Unit tests mock `listenInstallProgress` entirely, so whether Rust's
/// `app.emit` reaches React's `listen` can only be known **within the app**.
/// It is meaningful only when launched in an environment with no tools (`env -i HOME=<empty>`).
const WEBVIEW_VERIFY_ACP_INSTALL_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_ACP_INSTALL";
const MAIN_WINDOW_LABEL: &str = "main";
const WEBVIEW_VERIFY_ROUTE_ATTEMPTS: usize = 20;
const WEBVIEW_VERIFY_ROUTE_INTERVAL_MS: u64 = 400;
const WEBVIEW_VERIFY_FIXTURE_SETTLE_MS: u64 = 1200;
const WEBVIEW_VERIFY_MARKER_ATTEMPTS: usize = 12;
const WEBVIEW_VERIFY_MARKER_INTERVAL_MS: u64 = 500;

/// Type alias for the default watcher type of notify-debouncer-full — for State storage.
type VaultDebouncer = Debouncer<RecommendedWatcher, FileIdMap>;

/// live-tauri — State keeping the vault file watcher alive for the app's lifetime. start_vault_watch
/// must place the debouncer here so it does not drop and continues monitoring.
#[derive(Default)]
struct VaultWatcherState {
    debouncer: Mutex<Option<VaultDebouncer>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TauriVaultEntry {
    name: String,
    kind: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TauriTextFile {
    text: String,
    last_modified: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TauriBinaryFile {
    bytes: Vec<u8>,
    last_modified: u128,
}

fn normalize_relative_path(relative_path: &str) -> Result<PathBuf, String> {
    let mut out = PathBuf::new();
    for component in Path::new(relative_path).components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            Component::Prefix(_) | Component::RootDir | Component::ParentDir => {
                return Err("relative path must stay inside the selected vault".into());
            }
        }
    }
    Ok(out)
}

fn resolve_inside(root_path: &str, relative_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(root_path);
    let relative = normalize_relative_path(relative_path)?;
    Ok(root.join(relative))
}

fn canonical_root(root_path: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root_path).map_err(|err| err.to_string())?;
    let metadata = fs::metadata(&root).map_err(|err| err.to_string())?;
    if !metadata.is_dir() {
        return Err("vault root must be a directory".into());
    }
    Ok(root)
}

/// Is this a position where **it is not allowed** to accept as the vault root — if not, provide a stable reason code.
///
/// ## Why this check exists (2026-08-16)
///
/// When selecting `/` (Macintosh HD) in the folder picker, the app **accepted it as the vault
/// without hesitation.** Then it proposed "Map 34 documents in this folder," but those
/// 34 were Markdown files within the installed app bundle. macOS directly displayed the warning *"Another app is trying to access your data"* and stopped it; we did not block it.
///
/// During the read-only era, this was a mistake, not an incident. **The vault root becomes the agent's
/// working folder**, so the consequence of the same mistake changes from "read the wrong folder" to "the agent modified files in the wrong folder." Thus, this function is a gate that must be closed **before** attaching ACP, and later session working folder checks also use this function — if two checks exist, the looser one becomes the default.
///
/// ## What it blocks and what it does not
///
/// It blocks only **named positions**: filesystem root (paths with no parent — Windows drive roots like `C:\` are included here) · home directory **itself** · user container (`/Users`) · OS/app directories. Home **inside** (`~/notes`) is a valid vault, so it does not block it — blocking it would prevent the most common use case.
///
/// Heuristic checks like "folder is too large" are intentionally omitted. Legitimate vaults exceeding thresholds will inevitably appear, and users would encounter unexplained rejections. It judges based on name alone: "this is an app bundle."
///
/// Reason for splitting by extension: to accurately determine if it is a bundle, one must read `Info.plist`, but by then you have already looked inside. The name is visible before opening. This list contains items that macOS **executes or treats specially**.
fn is_bundle_directory(root: &Path) -> bool {
    const BUNDLE_EXTENSIONS: &[&str] = &[
        "app", "bundle", "framework", "kext", "plugin", "prefpane", "qlgenerator",
        "saver", "wdgt", "xpc", "appex", "component", "mdimporter",
    ];
    root.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .is_some_and(|e| BUNDLE_EXTENSIONS.contains(&e.as_str()))
}

fn vault_root_rejection(root: &Path) -> Option<&'static str> {
    // 부모가 없으면 파일시스템 루트다(`/`, `C:\`). 심볼릭 링크로 우회하지
    // 못하도록 호출자가 canonicalize 한 경로를 넘긴다.
    if root.parent().is_none() {
        return Some("filesystem-root");
    }

    // macOS 에서 **`.app` 은 디렉터리다** (2026-08-17). `is_dir()` 만 보면
    // 통과하고, `open <경로>` 는 폴더를 여는 게 아니라 **그 프로그램을
    // 실행한다** — 「Finder 에서 보기」가 절대 하면 안 되는 일이다.
    //
    // 볼트 루트로도 같은 이유로 막는다: 번들 안은 앱의 내부 구조이지 사람이
    // 문서를 두는 자리가 아니고, 에이전트의 작업 폴더가 되면 더욱 아니다.
    if is_bundle_directory(root) {
        return Some("bundle-directory");
    }

    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .and_then(|p| fs::canonicalize(p).ok());
    if home.as_deref() == Some(root) {
        return Some("home-directory");
    }

    #[cfg(target_os = "macos")]
    const SYSTEM_DIRS: &[&str] = &[
        "/Applications",
        "/System",
        "/Library",
        "/Users",
        "/Volumes",
        "/private",
        "/usr",
        "/bin",
        "/sbin",
        "/opt",
    ];
    #[cfg(target_os = "linux")]
    const SYSTEM_DIRS: &[&str] = &[
        "/home", "/usr", "/bin", "/sbin", "/etc", "/var", "/opt", "/boot", "/proc", "/sys", "/dev",
    ];
    #[cfg(windows)]
    const SYSTEM_DIRS: &[&str] = &[
        "C:\\Windows",
        "C:\\Program Files",
        "C:\\Program Files (x86)",
        "C:\\Users",
        "C:\\ProgramData",
    ];
    #[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
    const SYSTEM_DIRS: &[&str] = &[];

    for dir in SYSTEM_DIRS {
        // 정확히 그 디렉터리일 때만 막는다. 그 **안쪽**은 사용자가 고를 수 있는
        // 자리가 있다(예: 리눅스의 `/home/<사용자>`, macOS 의 `/Volumes/<디스크>`).
        if root == Path::new(dir) {
            return Some("system-directory");
        }
    }

    None
}

fn ensure_inside_canonical(root_path: &str, path: &Path) -> Result<PathBuf, String> {
    let root = canonical_root(root_path)?;
    let canonical_path = fs::canonicalize(path).map_err(|err| err.to_string())?;
    if !canonical_path.starts_with(&root) {
        return Err("resolved path must stay inside the selected vault".into());
    }
    Ok(canonical_path)
}

fn resolve_existing_inside(root_path: &str, relative_path: &str) -> Result<PathBuf, String> {
    let path = resolve_inside(root_path, relative_path)?;
    ensure_inside_canonical(root_path, &path)
}

#[cfg(not(unix))]
fn resolve_write_target_inside(root_path: &str, relative_path: &str) -> Result<PathBuf, String> {
    let path = resolve_inside(root_path, relative_path)?;
    if path.exists() {
        return ensure_inside_canonical(root_path, &path);
    }
    let parent = path
        .parent()
        .ok_or_else(|| "write target must have a parent directory".to_string())?;
    let root = canonical_root(root_path)?;
    let mut ancestor = parent;
    while !ancestor.exists() {
        ancestor = ancestor
            .parent()
            .ok_or_else(|| "write target must stay inside the selected vault".to_string())?;
    }
    let canonical_ancestor = fs::canonicalize(ancestor).map_err(|err| err.to_string())?;
    if !canonical_ancestor.starts_with(&root) {
        return Err("resolved path must stay inside the selected vault".into());
    }
    fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    let canonical_parent = ensure_inside_canonical(root_path, parent)?;
    let file_name = path
        .file_name()
        .ok_or_else(|| "write target must include a file name".to_string())?;
    Ok(canonical_parent.join(file_name))
}

fn js_string_literal(value: &str) -> String {
    let escaped = value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r");
    format!("\"{}\"", escaped)
}

fn is_safe_webview_verify_route(route: &str) -> bool {
    route.starts_with('/')
        && !route.starts_with("//")
        && !route.contains("://")
        && !route
            .chars()
            .any(|ch| matches!(ch, ' ' | '"' | '\'' | '<' | '>' | '\\'))
}

/// Value for the verifier to place in the [AI Connection] address field — characters breaking literals are blocked by **rejection**, not escaping. This value is used only in verification builds, but even in verification paths, do not leak injectable strings to the WebView.
fn is_safe_verify_base_url(value: &str) -> bool {
    let url = value.trim();
    (url.starts_with("http://") || url.starts_with("https://"))
        && url.len() <= 200
        && !url
            .chars()
            .any(|ch| ch.is_whitespace() || matches!(ch, '"' | '\'' | '`' | '<' | '>' | '\\'))
}

fn webview_verify_locale_root(route: &str) -> &str {
    if route.starts_with("/ko/") {
        "/ko/"
    } else {
        "/en/"
    }
}

fn parse_verify_window_size(value: &str) -> Option<(f64, f64)> {
    let (width, height) = value.split_once('x')?;
    let width = width.parse::<f64>().ok()?;
    let height = height.parse::<f64>().ok()?;
    if width.is_finite() && height.is_finite() && width >= 1.0 && height >= 1.0 {
        Some((width, height))
    } else {
        None
    }
}

fn isolate_verify_webview_storage(config: &mut tauri::Config, enabled: bool) -> usize {
    if !enabled {
        return 0;
    }
    config
        .app
        .windows
        .iter_mut()
        .filter(|window| window.create)
        .map(|window| {
            // The verifier must never inherit or delete the user's persisted
            // vault handle. Tauri maps `incognito` to WKWebView's
            // nonPersistent data store on macOS, so the bundled dogfood graph
            // becomes the deterministic fixture while normal launches keep
            // their existing IndexedDB untouched.
            window.incognito = true;
        })
        .count()
}

fn write_verify_line(line: String) {
    let mut stdout = std::io::stdout().lock();
    let _ = writeln!(stdout, "{line}");
}

fn build_webview_verify_route_reset_script(route: &str) -> String {
    let locale_root = js_string_literal(webview_verify_locale_root(route));
    let locale = js_string_literal(if route.starts_with("/ko/") {
        "ko"
    } else {
        "en"
    });
    format!(
        r#"(() => {{
  try {{
    window.localStorage.removeItem("ontology-atlas:last-route");
    window.localStorage.setItem("ontology-atlas:locale", {locale});
  }} catch (_err) {{}}
  const localeRoot = {locale_root};
  const current = location.pathname + location.search + location.hash;
  if (current !== localeRoot) {{
    location.replace(localeRoot);
  }}
}})()"#,
    )
}

fn build_webview_verify_vault_bootstrap_script(root_path: &str) -> String {
    let fixture_name = js_string_literal(
        Path::new(root_path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("ontology"),
    );
    let root_path = js_string_literal(root_path);
    format!(
        r#"(() => {{
  const rootPath = {root_path};
  const fixtureName = {fixture_name};
  const request = indexedDB.open("demo-kv", 1);
  request.onupgradeneeded = () => {{
    if (!request.result.objectStoreNames.contains("kv")) {{
      request.result.createObjectStore("kv");
    }}
  }};
  request.onerror = () => {{
    window.__ontologyAtlasVerifyFixtureVaultError =
      String(request.error || "fixture vault IndexedDB open failed");
  }};
  request.onsuccess = () => {{
    const db = request.result;
    const transaction = db.transaction("kv", "readwrite");
    const now = Date.now();
    transaction.objectStore("kv").put({{
      id: "current",
      handle: {{ name: fixtureName }},
      name: fixtureName,
      desktopRootPath: rootPath,
      createdAt: now,
      lastAccessedAt: now
    }}, "docs-vault:fs-handle:current");
    transaction.oncomplete = () => {{
      db.close();
      window.localStorage.setItem("ontology-atlas:verify-fixture-vault", rootPath);
      window.localStorage.setItem("guided-tour:v1", "skipped");
      location.reload();
    }};
    transaction.onerror = () => {{
      window.__ontologyAtlasVerifyFixtureVaultError =
        String(transaction.error || "fixture vault IndexedDB write failed");
      db.close();
    }};
  }};
}})()"#,
    )
}

/// Verification script walking the [Settings → AI Connection → Connect via Address] flow inside the WebView.
///
/// Same structure as the map-only verifiers: a single state machine leaves a result
/// object on the `window` global, and a subsequent marker collection script loads it as payload.
///
/// # Two disciplines
///
/// - **If not found, log that it was not found.** Each step logs what it waited for and stopped at (`step`/`reason`), and the judgment is made by the Node-side contract. There is only one place where the script declares "success" itself.
/// - **Clicks are toggles.** Controls like [Key Registration] or gears that close when pressed again will toggle open and closed if clicked every time in a polling loop. Therefore, click the same control only once within its cooldown.
///
/// Insert the address via substitution instead of `format!` — since the body is full of curly braces in JS, `{{`
/// escaping would make the script unreadable.
fn build_webview_verify_ai_settings_script(base_url: &str) -> String {
    AI_SETTINGS_VERIFY_SCRIPT.replace("__ATLAS_AI_BASE_URL__", &js_string_literal(base_url))
}

/// From the settings sheet → Agents → Check → (if blocked) actually click the installation offered by the app.
///
/// **What is measured is not installation success, but "does progress reach the screen"**. So
/// accumulate the step list in the result as-is — if nothing accumulates, no event arrived,
/// which is the same "quiet waiting" as before for the user.
const ACP_INSTALL_VERIFY_SCRIPT: &str = r#"(() => {
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
})()"#;

/// Open the settings sheet → go to the "App" section → actually click "Check for Updates".
///
/// **Why even click** — unit tests only prove that the button calls `checkNow`. What follows (plugin dynamic import · network round-trip · `getVersion()`) exists only within the installed app, and this repository's wiring was dead exactly in that layer.
const APP_UPDATE_VERIFY_SCRIPT: &str = r#"(() => {
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
    // 지금 도는 판 — `getVersion()` 이 실제로 답했는지가 이 줄로 보인다.
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
})()"#;

const AI_SETTINGS_VERIFY_SCRIPT: &str = r#"(() => {
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

    // 2026-08-02 — 드릴인 복도가 없어졌다. 「앱 안 에이전트」는 LNB 한 줄이고,
    // 그 내용은 오른쪽 칸(`app-settings-pane-ai`)에 바로 선다. 종전 두 걸음
    // (절 → 요약 행 → 서브뷰)이 한 걸음이 됐다.
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

    // 목록이 **화면에 실제로 있는가.** 2026-08-02 실측: 러너가 준 모델 7개가
    // aria 로는 전부 정상이었는데(activedescendant 가 7개를 훑었다) 화면에는
    // 1개만 보였다 — 두 단계 위 조상의 `overflow: hidden` 이 264px 짜리 목록을
    // 39px 로 잘랐기 때문이다(가시 14.8%). 그 상태는 role/aria/텍스트 마커를
    // 전부 통과한다. 그래서 여기서 재는 것은 **잘림과 클릭 가능성**이다.
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
    // 목록이 **자기 안에서** 넘쳤나 — 조상 잘림과는 다른 사실이다. 상한
    // 규칙(`select-growth.ts`)이 참이면 항목 수가 행 상한 아래일 때 이건
    // 거짓이어야 한다: 다 보이는데 스크롤이 있으면 「더 있다」가 거짓말이다.
    result.modelListOverflowing = listbox.scrollHeight > listbox.clientHeight + 1;
    result.modelListCappedBy = listbox.getAttribute("data-capped-by") || "";
    // 목록 자신의 스크롤 창 안에 있는 옵션만 센다 — 목록이 길어 안에서
    // 스크롤되는 것은 결함이 아니고, "보인다고 주장하는 것이 안 눌리는" 것이
    // 결함이다.
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
})()"#;

/// Verification route navigation — **expect the app's client router to follow as we swap only the address.**
/// This is not actual navigation (`location.assign`).
///
/// # ⚠️ Only some routes can be verified this way
///
/// `history.replaceState` + `popstate`/`app:urlchange` change the screen **only on surfaces that listen to soft navigation themselves**. In this repository, the map (`app:urlchange`) and workshop (self URL events) are such cases. Other standard Next routes **only change the address while the mounted component remains.**
///
/// Thus, even if `--require-webview-route` passes, **the screen may be on a different route.** 2026-07-29 measurement: requesting `/ko/download/` kept the address but showed the root (map) on screen. Reading this as "the app did not open the download page" led to fabricating causes twice — only by reproducing the same mechanism in a web browser was it revealed that **this is a tool limitation** (normal rendering works with actual navigation).
///
/// ## So what do we do
///
/// - **Require route-specific markers together.** URL matching is evidence of arrival, not presence. Adding text or `data-testid` unique to that screen via `--require-webview-content` bypasses this trap.
/// - If you need to verify a route that does not listen to soft navigation, first consider **launching that route as the start URL** before modifying this script. The app already goes to the locale root once (`build_webview_verify_route_reset_script`) before receiving `ONTOLOGY_ATLAS_VERIFY_ROUTE`, so in the current structure, the reset and destination must be the same value.
///
/// Why built this way originally: actual navigation wipes the app state after seeding the vault fixture in IndexedDB bootstrap. Changing only the address preserves that state, so this method is correct for map/workshop verification. **The error was not the method, but failing to document its limitations.**
fn build_webview_verify_route_script(route: &str) -> String {
    let route = js_string_literal(route);
    format!(
        r#"(() => {{
  const target = {route};
  const targetUrl = new URL(target, location.href);
  const current = location.pathname + location.search + location.hash;
  const next = targetUrl.pathname + targetUrl.search + targetUrl.hash;
  window.__ontologyAtlasVerifyExpectedRoute = next;
  if (!window.__ontologyAtlasVerifyRouteInterval) {{
    window.__ontologyAtlasVerifyRouteTicks = 0;
    window.__ontologyAtlasVerifyRouteInterval = window.setInterval(() => {{
      window.__ontologyAtlasVerifyRouteTicks =
        Number(window.__ontologyAtlasVerifyRouteTicks || 0) + 1;
      const expected = window.__ontologyAtlasVerifyExpectedRoute || "";
      const live = location.pathname + location.search + location.hash;
      if (expected && live !== expected) {{
        history.replaceState({{}}, "", expected);
        window.dispatchEvent(new PopStateEvent("popstate"));
        window.dispatchEvent(new Event("app:urlchange"));
      }}
      if (window.__ontologyAtlasVerifyRouteTicks >= 60) {{
        window.clearInterval(window.__ontologyAtlasVerifyRouteInterval);
        window.__ontologyAtlasVerifyRouteInterval = null;
      }}
    }}, {interval_ms});
  }}
  if (current !== next) {{
    const targetPath = targetUrl.pathname.replace(/\/$/, "");
    const currentPath = location.pathname.replace(/\/$/, "");
    if (currentPath === targetPath) {{
      history.replaceState({{}}, "", next);
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.dispatchEvent(new Event("app:urlchange"));
      return;
    }}
    const targetLink = Array.from(document.querySelectorAll("a[href]"))
      .find((link) => {{
        try {{
          const href = new URL(link.getAttribute("href") || "", location.href);
          return href.pathname.replace(/\/$/, "") === targetPath;
        }} catch (_err) {{
          return false;
        }}
      }});
    if (targetLink && typeof targetLink.click === "function") {{
      window.__ontologyAtlasVerifyRouteMisses = 0;
      targetLink.click();
      return;
    }}
    window.__ontologyAtlasVerifyRouteMisses =
      Number(window.__ontologyAtlasVerifyRouteMisses || 0) + 1;
    if (window.__ontologyAtlasVerifyRouteMisses < 14) {{
      return;
    }}
    history.replaceState({{}}, "", next);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(new Event("app:urlchange"));
  }}
}})()"#,
        interval_ms = WEBVIEW_VERIFY_ROUTE_INTERVAL_MS,
    )
}

fn resolve_directory_target_inside(
    root_path: &str,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let path = resolve_inside(root_path, relative_path)?;
    if path.exists() {
        return ensure_inside_canonical(root_path, &path);
    }
    let root = canonical_root(root_path)?;
    let mut ancestor = path
        .parent()
        .ok_or_else(|| "directory target must have a parent directory".to_string())?;
    while !ancestor.exists() {
        ancestor = ancestor
            .parent()
            .ok_or_else(|| "directory target must stay inside the selected vault".to_string())?;
    }
    let canonical_ancestor = fs::canonicalize(ancestor).map_err(|err| err.to_string())?;
    if !canonical_ancestor.starts_with(&root) {
        return Err("resolved path must stay inside the selected vault".into());
    }
    Ok(path)
}

fn metadata_mtime_ms(path: &Path) -> Result<u128, String> {
    let metadata = fs::metadata(path).map_err(|err| err.to_string())?;
    let modified = metadata.modified().map_err(|err| err.to_string())?;
    Ok(modified
        .duration_since(UNIX_EPOCH)
        .map_err(|err| err.to_string())?
        .as_millis())
}

/// Live ACP sessions. Terminate all remaining here when the app shuts down.
#[derive(Default)]
struct AcpSessions(Mutex<std::collections::HashMap<String, Arc<AcpSessionHandle>>>);

struct AcpSessionHandle {
    pid: u32,
    /// Permission boundary checked and normalized by `acp_start`. The screen cannot reselect.
    vault_root: PathBuf,
    stdin: Mutex<Box<dyn Write + Send>>,
}

impl AcpSessions {
    fn insert<W: Write + Send + 'static>(
        &self,
        session_id: String,
        pid: u32,
        vault_root: PathBuf,
        stdin: W,
    ) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|_| "session-registry-poisoned".to_string())?
            .insert(
                session_id,
                Arc::new(AcpSessionHandle {
                    pid,
                    vault_root,
                    stdin: Mutex::new(Box::new(stdin)),
                }),
            );
        Ok(())
    }

    fn vault_root(&self, session_id: &str) -> Result<PathBuf, String> {
        let map = self
            .0
            .lock()
            .map_err(|_| "session-registry-poisoned".to_string())?;
        map.get(session_id)
            .map(|handle| handle.vault_root.clone())
            .ok_or_else(|| "session-not-found".to_string())
    }

    fn send_line(&self, session_id: &str, line: &str) -> Result<(), String> {
        // 등록부 잠금과 writer 잠금을 동시에 쥐지 않는다. 자식 하나의 stdin이
        // 막혀도 다른 세션의 send/stop, 자식 종료 정리, 앱 종료 drain은 계속
        // 진행되어야 막힌 프로세스 자체를 끊을 수 있다.
        let handle = {
            let map = self
                .0
                .lock()
                .map_err(|_| "session-registry-poisoned".to_string())?;
            Arc::clone(map.get(session_id).ok_or("session-not-found")?)
        };
        let mut stdin = handle
            .stdin
            .lock()
            .map_err(|_| "session-stdin-poisoned".to_string())?;
        stdin
            .write_all(line.as_bytes())
            .and_then(|_| stdin.write_all(b"\n"))
            .and_then(|_| stdin.flush())
            .map_err(|err| format!("write-failed:{err}"))
    }

    /// 이 세션이 아직 살아 있나 — 내려받기 진행 표시 스레드가 멈출 때를 안다.
    fn contains(&self, session_id: &str) -> bool {
        self.0
            .lock()
            .map(|map| map.contains_key(session_id))
            .unwrap_or(false)
    }

    fn take_pid(&self, session_id: &str) -> Result<Option<u32>, String> {
        Ok(self
            .0
            .lock()
            .map_err(|_| "session-registry-poisoned".to_string())?
            .remove(session_id)
            .map(|handle| handle.pid))
    }

    fn remove(&self, session_id: &str) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|_| "session-registry-poisoned".to_string())?
            .remove(session_id);
        Ok(())
    }

    fn drain_pids(&self) -> Result<Vec<u32>, String> {
        Ok(self
            .0
            .lock()
            .map_err(|_| "session-registry-poisoned".to_string())?
            .drain()
            .map(|(_, handle)| handle.pid)
            .collect())
    }
}

/// 세션 이름은 늘어나기만 하는 번호로 만든다. pid 를 이름으로 쓰면 OS 가 pid 를
/// 재사용했을 때 방금 끝난 세션과 새 세션이 같은 이름을 갖는다.
static ACP_SESSION_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

/// 세션 하나에서 나온 한 줄.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AcpLineEvent {
    session_id: String,
    line: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AcpExitEvent {
    session_id: String,
    code: Option<i32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AcpNoticeEvent {
    session_id: String,
    message: String,
}

/// ACP 하네스를 띄운다. 돌려주는 것은 세션 이름 하나뿐이고, 이후의 모든 주고받기는
/// 그 이름으로 한다.
///
/// ## 이 커맨드가 지키는 것
///
/// 1. **작업 폴더는 볼트 루트 판정을 그대로 통과해야 한다.** 폴더 피커가 쓰는
///    그 함수를 여기서도 부른다 — 판정이 두 벌이 되면 한쪽만 느슨해지는 쪽이
///    기본값이 된다. 에이전트에게 `/` 를 넘기는 것은 실수가 아니라 사고다.
/// 2. **자식은 자기 프로세스 그룹을 갖는다.** 어댑터가 띄우는 손자들까지 한
///    번에 끝낼 수 있는 유일한 방법이고, 이게 없으면 앱을 꺼도 프로세스가 남는다.
/// 3. **자식 PATH 는 우리가 찾아낸 자리로 다시 만든다.** 어댑터는 진짜 CLI 를
///    이름으로 찾으므로, GUI 앱이 물려받은 빈약한 PATH 를 그대로 주면 어댑터가
///    같은 자리에서 막힌다.
#[tauri::command]
fn acp_start(
    app: AppHandle,
    sessions: State<'_, AcpSessions>,
    runtime_id: String,
    cwd: String,
) -> Result<String, String> {
    let root = fs::canonicalize(&cwd).map_err(|err| format!("cwd-unreadable:{err}"))?;
    if !root.is_dir() {
        return Err("cwd-not-a-directory".into());
    }
    if let Some(reason) = vault_root_rejection(&root) {
        return Err(format!("vault-root-rejected:{reason}"));
    }

    let (is_executable, list_dir, read_text, login_ok) = acp::real_probe();
    let probe = acp::FsProbe {
        is_executable: &is_executable,
        list_dir: &list_dir,
        read_text: &read_text,
        login_ok: &login_ok,
    };
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from);
    // Must also find what the app installed on our behalf — otherwise, even after installing,
    // the screen keeps saying "Installation required."
    let app_data_for_paths = app.path().app_data_dir().ok();
    let managed_bin = app_data_for_paths.as_deref().map(acp::managed_cli_bin_dir);
    // Include Node accepted by the app as a candidate — otherwise, even after accepting, it says "Node required."
    let managed_node_bin = app_data_for_paths
        .as_deref()
        .and_then(managed_node::managed_node_bin_dir);
    let launch = acp::resolve_launch(
        &runtime_id,
        home.as_deref(),
        std::env::var_os("PATH").as_deref(),
        &probe,
        managed_bin.as_deref(),
        managed_node_bin.as_deref(),
    )?;

    /*
     * Check cache entries **just before** launching if using npx (owner's physical machine 2026-08-19). If the first download is interrupted halfway, a half-formed entry remains, and npx tries to reuse it, dying every time with `Could not read package.json` —
     * a state that does not heal itself. If broken, **delete only that entry** so npx downloads from scratch. Judgment basis and hash derivation are in the
     * npx cache self-healing block in `acp.rs`.
     */
    let npx_preflight = acp::preflight_npx_cache(&launch, home.as_deref());

    // **Do not inherit the user's global settings** (Decision log 2026-08-16 (2)).
    // Measurement: the owner's `~/.claude/settings.json` pre-allowed `Bash(*)`·`Write(*)`, so a session inheriting that setting wrote files outside the working folder
    // without asking once. The gateway is not the protocol but this setting.
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("app-data-dir-unavailable:{err}"))?;
    // Honest to launch as None for those that **do not support isolation**. However,
    // a launcher that claims to support isolation but fails preparation is a start failure. Launching in that state
    // inherits the user's global allow list, and the screen has no promised gateway.
    // Shadow walking requires asking "is this item still valid," which needs the CLI's **absolute
    // path**. Launching by name depends on the PATH visible to children, but a GUI app's default PATH differs from the user's shell (measurement at the top of this file).
    let isolation_cli = acp::registry_agent(&runtime_id)
        .and_then(|agent| agent.cli.as_deref())
        .and_then(|name| {
            let dirs = acp::candidate_bin_dirs(
                home.as_deref(),
                std::env::var_os("PATH").as_deref(),
                &probe,
                managed_bin.as_deref(),
                managed_node_bin.as_deref(),
            );
            acp::resolve_command(name, &dirs, &probe)
        });
    let isolation = acp::prepare_runtime_isolation(
        &runtime_id,
        &app_data,
        home.as_deref(),
        isolation_cli.as_deref(),
        &launch.path_env,
    )?;

    let mut command = Command::new(&launch.program);
    command
        .args(&launch.args)
        .current_dir(&root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    acp::apply_runtime_environment(&mut command, &runtime_id, &launch.path_env);
    if let Some((env, dir)) = &isolation {
        command.env(env, dir);
    }

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    #[cfg(windows)]
    {
        // Prevent the child from opening a console window. The app itself has windows_subsystem
        // set, but the child does not inherit it.
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command
        .spawn()
        .map_err(|err| format!("spawn-failed:{err}"))?;
    let pid = child.id();
    let seq = ACP_SESSION_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let session_id = format!("acp-{seq}-{pid}");

    let stdin = child.stdin.take().ok_or("stdin-unavailable")?;
    let stdout = child.stdout.take().ok_or("stdout-unavailable")?;
    let stderr = child.stderr.take().ok_or("stderr-unavailable")?;

    spawn_acp_line_pump(app.clone(), session_id.clone(), stdout, "acp://message");
    spawn_acp_line_pump(app.clone(), session_id.clone(), stderr, "acp://stderr");

    // ⚠️ **Registration must come first** (caught in 2026-08-16 review).
    //
    // The thread below removes the child from the registry after it ends. Previously, we launched that thread first
    // and registered later, but for a **child that dies immediately** (wrong adapter · npx
    // failure), removal happens before registration. Then the dead pid remains in the registry forever, and `terminate_all_acp_sessions` kills that pid when the app shuts down —
    // at that time, that number could belong to **another program** (and sends signals to the process group).
    sessions.insert(session_id.clone(), pid, root, stdin)?;

    // The thread waiting for the child announces termination and removes it from the registry. If not removed here,
    // it continues writing to already dead sessions, and that failure appears to the user as "sent but no reply."
    {
        let app = app.clone();
        let session_id = session_id.clone();
        std::thread::spawn(move || {
            let code = child.wait().ok().and_then(|status| status.code());
            if let Some(state) = app.try_state::<AcpSessions>() {
                let _ = state.remove(&session_id);
            }
            let _ = app.emit("acp://exit", AcpExitEvent { session_id, code });
        });
    }

    /*
     * The first download (tens of MB) takes minutes, but the screen only showed "Starting" —
     * the user thought it was stuck and closed the app, which was the very trigger that created the broken cache above (2026-08-19). So we notify the screen only when the download actually starts, and measure progress **without fabricating**: total size is not fixed anywhere,
     // so percentage cannot be made honest, but the growing size of the cache entry directory
     // (how many MB so far) is measurable.
     */
    /*
     * ⚠️ Notifications must be sent **after this command returns**. The screen only subscribes to `acp://notice` after receiving the answer (session name) from `acp_start`, so emitting here would make the first notification vanish into the void. So we move everything to a thread and wait briefly before sending — if we still miss it, the progress notifications arriving every second allow the screen side to refresh the display (`use-acp-session.ts`).
     */
    let first_run_message = match &npx_preflight {
        // Include the fact of healing in the message for diagnostics — a clue if it breaks again next time.
        acp::NpxCachePreflight::HealedBrokenEntry { reason } => {
            Some(format!("npx-first-run-download:healed:{reason}"))
        }
        acp::NpxCachePreflight::FirstDownload => Some("npx-first-run-download".to_string()),
        // If deletion fails, it will fail as before — raise the reason so the screen's "Details" can
        // at least explain why.
        acp::NpxCachePreflight::HealFailed { reason, error } => {
            Some(format!("npx-cache-heal-failed:{reason}:{error}"))
        }
        acp::NpxCachePreflight::NotNpx
        | acp::NpxCachePreflight::CacheUnknown
        | acp::NpxCachePreflight::CacheReady => None,
    };
    let downloading = matches!(
        npx_preflight,
        acp::NpxCachePreflight::FirstDownload | acp::NpxCachePreflight::HealedBrokenEntry { .. }
    );
    if let Some(message) = first_run_message {
        let entry = downloading
            .then(|| acp::npx_cache_entry_for_launch(&launch, home.as_deref()))
            .flatten();
        let package = acp::npx_launch_package(&launch).map(str::to_string);
        let app = app.clone();
        let session_id = session_id.clone();
        std::thread::spawn(move || {
            // Time for the screen to attach subscription. If missed, the progress notification below covers it.
            std::thread::sleep(std::time::Duration::from_millis(250));
            let _ = app.emit(
                "acp://notice",
                AcpNoticeEvent {
                    session_id: session_id.clone(),
                    message,
                },
            );
            let (Some(entry), Some(package)) = (entry, package) else {
                return; // Only healing failure notification — no download to measure.
            };
            let started = std::time::Instant::now();
            loop {
                std::thread::sleep(std::time::Duration::from_millis(1000));
                // If the download takes longer than this, the progress indicator is not the whole problem
                // — do not leave the thread forever.
                if started.elapsed() > std::time::Duration::from_secs(20 * 60) {
                    break;
                }
                let alive = app
                    .try_state::<AcpSessions>()
                    .map(|sessions| sessions.contains(&session_id))
                    .unwrap_or(false);
                if !alive {
                    break; // The child has ended — success or failure, this marker is done.
                }
                if acp::npx_entry_health(&entry, &package) == acp::NpxEntryHealth::Usable {
                    let _ = app.emit(
                        "acp://notice",
                        AcpNoticeEvent {
                            session_id: session_id.clone(),
                            message: "npx-download-done".to_string(),
                        },
                    );
                    break;
                }
                let mb = acp::dir_size_bytes(&entry) / (1024 * 1024);
                let _ = app.emit(
                    "acp://notice",
                    AcpNoticeEvent {
                        session_id: session_id.clone(),
                        message: format!("npx-download-progress:{mb}"),
                    },
                );
            }
        });
    }

    Ok(session_id)
}

/// Stream a child's single stream to the screen line by line.
///
/// Lines exceeding the upper limit are **dropped and reported**. If we truncate them, half-JSON enters the parser,
/// causing harder-to-understand failures; killing the entire session ends the conversation for large files.
fn spawn_acp_line_pump<R: std::io::Read + Send + 'static>(
    app: AppHandle,
    session_id: String,
    stream: R,
    event: &'static str,
) {
    std::thread::spawn(move || {
        let mut reader = std::io::BufReader::new(stream);
        loop {
            match acp::read_bounded_line(&mut reader, acp::MAX_LINE_BYTES) {
                Ok(Some(bytes)) => {
                    let line = String::from_utf8_lossy(&bytes).to_string();
                    let _ = app.emit(
                        event,
                        AcpLineEvent {
                            session_id: session_id.clone(),
                            line,
                        },
                    );
                }
                Ok(None) => break,
                Err(err) => {
                    let _ = app.emit(
                        "acp://notice",
                        AcpNoticeEvent {
                            session_id: session_id.clone(),
                            message: format!("dropped-line:{err}"),
                        },
                    );
                    if err.kind() != std::io::ErrorKind::InvalidData {
                        break; // If the I/O itself is disconnected, there is nothing more to read.
                    }
                }
            }
        }
    });
}

/// Evaluate a single permission request against our policy — `allow-inside-vault` or `ask`.
///
/// **Do not reimplement the evaluation logic on the screen side.** If the two diverge, the looser one becomes
/// the default, and that one happens to be visible to the user. Moreover, this
/// evaluation must resolve symbolic links and normalize ancestors of non-existent paths, which the browser
/// side cannot do accurately from the start. More importantly, the vault root does not trust strings sent by the screen;
/// it verifies them at `acp_start` and uses only values bound to the session.
fn permission_verdict_for_session(
    sessions: &AcpSessions,
    session_id: &str,
    file_path: Option<&str>,
) -> acp::PermissionVerdict {
    sessions
        .vault_root(session_id)
        .map(|root| acp::permission_verdict(&root, file_path))
        .unwrap_or(acp::PermissionVerdict::Ask)
}

#[tauri::command]
fn acp_permission_verdict(
    sessions: State<'_, AcpSessions>,
    session_id: String,
    file_path: Option<String>,
) -> String {
    let verdict = permission_verdict_for_session(&sessions, &session_id, file_path.as_deref());
    match verdict {
        acp::PermissionVerdict::AllowInsideVault => "allow-inside-vault".to_string(),
        acp::PermissionVerdict::Ask => "ask".to_string(),
    }
}

/// 세션에 한 줄을 보낸다. 줄바꿈은 여기서 붙인다 — 호출자가 잊으면 상대는
/// 영원히 기다리고, 그 증상은 「멈췄다」로만 보인다.
#[tauri::command]
fn acp_send(
    sessions: State<'_, AcpSessions>,
    session_id: String,
    line: String,
) -> Result<(), String> {
    sessions.send_line(&session_id, &line)
}

/// End the session and everything it spawned.
#[tauri::command]
fn acp_stop(sessions: State<'_, AcpSessions>, session_id: String) -> Result<(), String> {
    let pid = sessions.take_pid(&session_id)?;
    match pid {
        Some(pid) => acp::terminate_tree(pid),
        // 이미 끝난 세션을 끝내라는 것은 실패가 아니다.
        None => Ok(()),
    }
}

/// 앱이 꺼질 때 남은 세션을 전부 끝낸다.
///
/// 이게 없으면 창을 닫아도 어댑터와 그 손자들이 계속 돈다. 사용자는 앱을 껐다고
/// 믿는데 기계는 계속 일하고 있는 상태다.
fn terminate_all_acp_sessions(app: &AppHandle) {
    let Some(state) = app.try_state::<AcpSessions>() else {
        return;
    };
    let handles = match state.drain_pids() {
        Ok(handles) => handles,
        Err(_) => return,
    };
    for pid in handles {
        let _ = acp::terminate_tree(pid);
    }
}

/// 이 기기에 실제로 있는 ACP 실행기를 판정해서 돌려준다.
///
/// **PATH 만 믿지 않는다** — Finder 로 띄운 앱은 셸 초기화를 안 거쳐서 버전
/// 관리자(nvm 등)가 심은 경로가 통째로 없다. 무엇을 뒤지는지는 `acp.rs` 에
/// 전부 적혀 있고 그 목록이 곧 검사 대상이다.
///
/// **아무것도 쓰지 않는다.** 다만 `probe_login` 이 참이면 로그인 확인을 위해
/// 그 CLI 를 짧게 띄운다(종료 코드만 본다 — 출력은 버린다).
///
/// 이 기기의 실행기 상태.
///
/// `probe_login` 이 참일 때만 **각 CLI 를 띄워 로그인 여부를 확인한다.**
/// 그것이 이 호출에서 유일하게 느린 부분이고(실측: claude 300ms · codex 45ms),
/// 나머지는 디스크를 훑는 것이라 거의 즉시다.
///
/// ## 왜 나눴나 (2026-08-16 소유자 지적)
///
/// *"Agents 탭 누르면 로딩 속도가 1초인가 느린데? 일단 로딩되게 하고 업데이트
/// 시키는 방향으로 가야 하지 않을까"* — 맞는 지적이다. 로그인 확인을 붙이면서
/// **화면이 뜨는 시간에 그 비용이 그대로 얹혔다.** 목록을 먼저 그릴 수 있는데도
/// 확인이 끝날 때까지 아무것도 안 보여 주고 있었다.
///
/// 그래서 화면은 두 번 부른다: 먼저 확인 없이 그리고, 그다음 확인해서 고친다.
#[tauri::command]
fn acp_detect_runtimes(app: tauri::AppHandle, probe_login: Option<bool>) -> Vec<acp::AcpRuntimeStatus> {
    let (is_executable, list_dir, read_text, login_ok) = acp::real_probe();
    let skip = |_: &str, _: &std::path::Path, _: &[&str], _: &str| None;
    let probe = acp::FsProbe {
        is_executable: &is_executable,
        list_dir: &list_dir,
        read_text: &read_text,
        login_ok: if probe_login.unwrap_or(false) {
            &login_ok
        } else {
            &skip
        },
    };
    let home =
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    let path = std::env::var_os("PATH");
    // 앱이 대신 깔아 준 것도 찾는다 — 안 그러면 설치해 놓고도 「설치 필요」다.
    let app_data_for_paths = app.path().app_data_dir().ok();
    let managed_bin = app_data_for_paths.as_deref().map(acp::managed_cli_bin_dir);
    let managed_node_bin = app_data_for_paths
        .as_deref()
        .and_then(managed_node::managed_node_bin_dir);
    acp::detect_runtimes(
        home.as_deref(),
        path.as_deref(),
        &probe,
        managed_bin.as_deref(),
        managed_node_bin.as_deref(),
    )
}

/// 설치가 어디까지 왔는지 화면에 알리는 한 줄.
///
/// ## 왜 이벤트인가 (2026-08-20 소유자 지적)
///
/// *"버튼들만 누르면 알아서 설치되는 과정도 보여주고 완료된것도 체크해주고
/// 하나?"* — 아니었다. 종전에는 커맨드가 **끝나야** 돌아왔으므로, 52MB 를
/// 받고 npm 이 도는 동안 화면이 할 수 있는 일은 칩을 비활성으로 두고 「설치
/// 중…」 글자를 띄우는 것뿐이었다. 이 저장소의 워크스루가 **「조용한 기다림」**
/// 이라고 이름 붙여 둔 패턴 그대로다.
///
/// ## 무엇을 안 하나
///
/// **모르는 진행률을 지어내지 않는다.** `received`/`total` 은 아는 자리
/// (Node 내려받기)에만 실리고, npm 은 분모가 없으므로 대신 **자기가 실제로
/// 뱉은 마지막 줄**을 `note` 로 올린다. 이 앱의 업데이트 토스트가 이미 같은
/// 규율을 따른다 — 총량을 모르면 퍼센트를 그리지 않고 그 사실을 말한다.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AcpInstallProgress {
    runtime_id: String,
    /// 어느 일인가 — `"node"` · `"cli"`. 화면이 문구를 갖는다.
    job: &'static str,
    /// Which phase is this — the screen holds the message (we do not generate human language here).
    stage: &'static str,
    received: Option<u64>,
    total: Option<u64>,
    /// 그 도구가 실제로 뱉은 줄. 우리가 지어낸 문장이 아니다.
    note: Option<String>,
    /// 이 상태가 생긴 시각(epoch ms).
    ///
    /// **없으면 어제 끝난 설치가 오늘 「설치했어요」로 뜬다.** 화면은 이 값으로
    /// 낡은 것을 안 그린다 — 마지막 상태를 들고 있는 것과 그것을 언제까지
    /// 보여 줄지는 다른 질문이다.
    at: u64,
}

/// 화면이 듣는 이름. `acp://exit` 와 같은 결로 짓는다.
///
/// ⚠️ **이 이름과 payload 키는 TS 쪽과 맺은 계약이다.** 화면은
/// `payload.runtimeId` 로 남의 진행을 걸러 내므로, 키 이름이 하나만 어긋나도
/// 이벤트는 도착하는데 **전부 버려진다** — 에러 없이 진행률만 영영 안 뜬다.
/// 그래서 아래 테스트가 직렬화 결과의 키를 그대로 못박는다.
const ACP_INSTALL_PROGRESS_EVENT: &str = "acp-install://progress";

/// **마지막 진행 상태를 도구별로 들고 있는 곳.**
///
/// ## 왜 필요한가 (2026-08-20, 카운슬 압박으로 발견)
///
/// 설정 시트는 닫히면 **통째로 언마운트된다**
/// (`AppSettingsMenu.tsx` 의 `(open || settingsMounted) && …` 조건부 포털).
/// 그래서 화면 쪽 `useAgentDoctor` 의 상태가 전부 사라지고 이벤트 구독도 끊긴다.
///
/// 갈래가 셋인데 **마지막 하나가 진짜 결함**이다:
///
/// | 시트를 닫아 둔 사이 | 다시 열면 |
/// |---|---|
/// | Node 내려받는 중 | 250ms 주기라 **0.25초 안에 자가복구**된다 |
/// | npm 설치 중 | npm 이 조용하면 다음 줄이 나올 때까지 아무것도 안 보인다 |
/// | **`done` 이 지나감** | `done` 은 **단발**이다 → **영영 완료를 못 본다** |
///
/// 소유자가 이 라운드에 명시적으로 요구한 것이 그 완료 표시였다
/// (*"완료된것도 체크해주고 하나?"*). 이벤트만으로는 그 요구를 못 지킨다.
///
/// ## 왜 화면이 아니라 여기인가
///
/// 상태를 셸(React)로 올려도 **라우트를 떠나거나 새로고침하면 같이 죽는다** —
/// 목적지로 옮겨도 마찬가지다. 설치를 실제로 소유한 것은 이쪽 프로세스이므로,
/// 마지막 상태도 여기 두는 것이 진실원이 하나가 되는 자리다.
#[derive(Default)]
struct AcpInstallProgressState {
    /// `runtime_id` → 그 도구의 마지막 진행. 도구마다 따로 둔다 — 한 칸이면
    /// Codex 설치가 Claude 의 완료 표시를 덮어쓴다.
    last: Mutex<HashMap<String, AcpInstallProgress>>,
}

fn emit_install_progress(
    app: &tauri::AppHandle,
    runtime_id: &str,
    job: &'static str,
    stage: &'static str,
    received: Option<u64>,
    total: Option<u64>,
    note: Option<String>,
) {
    let payload = AcpInstallProgress {
        runtime_id: runtime_id.to_string(),
        job,
        stage,
        received,
        total,
        note,
        at: std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
    };
    // **먼저 적어 두고 그다음에 보낸다.** 순서가 반대면, 이벤트를 받은 화면이
    // 곧바로 물어봤을 때 아직 안 적힌 값을 읽을 수 있다.
    if let Some(state) = app.try_state::<AcpInstallProgressState>() {
        if let Ok(mut last) = state.last.lock() {
            last.insert(runtime_id.to_string(), payload.clone());
        }
    }
    let _ = app.emit(ACP_INSTALL_PROGRESS_EVENT, payload);
}

/// 이 도구의 **마지막 진행 상태**. 없으면 `None`.
///
/// 화면이 다시 마운트될 때 한 번 물어본다 — 그래야 닫아 둔 사이에 지나간
/// 완료를 놓치지 않는다.
#[tauri::command]
fn acp_install_progress(
    app: tauri::AppHandle,
    runtime_id: String,
) -> Option<AcpInstallProgress> {
    let state = app.try_state::<AcpInstallProgressState>()?;
    let last = state.last.lock().ok()?;
    last.get(&runtime_id).cloned()
}

/// 다시 점검을 시작하면 **지난 설치 결과는 잊는다.**
///
/// 안 지우면, 재점검한 뒤 시트를 닫았다 열었을 때 「설치했어요」가 되살아나
/// 방금 한 일이 아닌 것을 방금 한 것처럼 말하게 된다. 화면 쪽도 같은 순간에
/// 자기 상태를 지우므로, 두 곳이 같은 규칙을 따른다.
fn forget_install_progress(app: &tauri::AppHandle, runtime_id: &str) {
    if let Some(state) = app.try_state::<AcpInstallProgressState>() {
        if let Ok(mut last) = state.last.lock() {
            last.remove(runtime_id);
        }
    }
}

/// **Node 를 앱이 받아 줄 수 있나 — 그렇다면 어디서 무엇을.**
///
/// 화면은 이것을 받아 누르기 전에 **주소와 해시 앞머리**를 보여 준다. 없으면
/// 등재 안 된 플랫폼이고, 화면은 종전대로 공식 안내로 보낸다.
#[tauri::command]
fn acp_node_plan() -> Option<String> {
    managed_node::managed_node_plan()
}

/// Node 를 앱 전용 자리에 받아 두고 **해시를 대조한다.**
///
/// 조건 넷(원장 (88)(89))이 여기서 지켜진다: 사용자가 누를 때만 · 어디서
/// 무엇을 받는지 먼저 보여 준다 · `<app-data>/runtimes/node` 안에만 ·
/// 버전을 고정하고 **받은 뒤 해시를 대조한다**(안 맞으면 지우고 실패).
#[tauri::command]
fn acp_install_node(
    app: tauri::AppHandle,
    runtime_id: String,
) -> Result<Vec<acp_doctor::AcpCheck>, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("app-data-dir-unavailable:{err}"))?;
    let reporter = |stage: &'static str, received: Option<u64>, total: Option<u64>| {
        emit_install_progress(&app, &runtime_id, "node", stage, received, total, None);
    };
    managed_node::ensure_managed_node(&app_data, &reporter).inspect_err(|_| {
        emit_install_progress(&app, &runtime_id, "node", "failed", None, None, None);
    })?;
    emit_install_progress(&app, &runtime_id, "node", "verifying-install", None, None, None);
    let after = doctor_context(&app, &runtime_id)?;
    emit_install_progress(&app, &runtime_id, "node", "done", None, None, None);
    Ok(acp_doctor::diagnose(&after.borrow()))
}

/// **Can the app install this tool on behalf of the user — and if so, with what command.**
///
/// The screen receives this and **shows the raw command before pressing it** (condition ②). If absent,
/// `None` — the screen continues to show only the installation guide link.
#[tauri::command]
fn acp_install_plan(app: tauri::AppHandle, runtime_id: String) -> Option<String> {
    let app_data = app.path().app_data_dir().ok()?;
    acp::managed_install_command(&runtime_id, &app_data)
}

/// Install the tool in the app-specific location.
///
/// Condition four (ledger 2026-08-20 (88)) is upheld here:
/// ① This command is **only invoked when the user presses it** — the app receives nothing on startup.
/// ② The raw command is pre-shown to the screen by `acp_install_plan`.
/// ③ `--prefix <app-data>/managed-node` — does not touch global npm or system PATH.
/// ④ Package version is pinned to `INSTALLABLE_CLI`.
///
/// After installation, **re-verify and return the value** — saying "installed" when it actually wasn't
/// is the worst defect at this location.
#[tauri::command]
fn acp_install_cli(
    app: tauri::AppHandle,
    runtime_id: String,
) -> Result<Vec<acp_doctor::AcpCheck>, String> {
    let package = acp::installable_package(&runtime_id)
        .ok_or_else(|| format!("not-installable:{runtime_id}"))?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("app-data-dir-unavailable:{err}"))?;
    let prefix = acp::managed_cli_prefix(&app_data);
    std::fs::create_dir_all(&prefix).map_err(|err| format!("prefix-failed:{err}"))?;

    let (is_executable, list_dir, read_text, login_ok) = acp::real_probe();
    let probe = acp::FsProbe {
        is_executable: &is_executable,
        list_dir: &list_dir,
        read_text: &read_text,
        login_ok: &login_ok,
    };
    let home =
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    // The app's bundled npm is a fallback — if someone reached here without npm on their system,
    // that is the only way forward.
    let managed_node_bin = managed_node::managed_node_bin_dir(&app_data);
    let dirs = acp::candidate_bin_dirs(
        home.as_deref(),
        std::env::var_os("PATH").as_deref(),
        &probe,
        None,
        managed_node_bin.as_deref(),
    );
    // Do not launch npm by **name** — the PATH of a GUI app differs from the user's shell
    // (the measurement at the top of this file confirms why).
    let npm = acp::resolve_command("npm", &dirs, &probe)
        .ok_or_else(|| "npm-missing".to_string())?;
    let child_path = std::env::join_paths(dirs.iter())
        .map(|joined| joined.to_string_lossy().to_string())
        .unwrap_or_default();

    emit_install_progress(&app, &runtime_id, "cli", "installing", None, None, None);

    let mut command = Command::new(&npm);
    command
        .arg("install")
        .arg("--prefix")
        .arg(&prefix)
        .arg("--global")
        .arg(package)
        .env("PATH", &child_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    /*
     * ⚠️ **Do not use `.output()`** (owner's note 2026-08-20).
     *
     * That function returns only after the process ends. npm runs for 30–90 seconds, during which the screen
     // remains unaware, displaying only the four characters "Installing...", which is the defect this repo calls
     * "quiet waiting".
     *
     * Instead, **stream stderr line by line.** npm writes progress there.
     * Do not fabricate percentages; **push the exact lines the tool actually emitted** —
     * since they are not sentences we created, they do not become outdated.
     */
    let mut child = command.spawn().map_err(|err| format!("install-failed:{err}"))?;
    let stderr_pipe = child.stderr.take();
    let tail = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
    let pump = stderr_pipe.map(|pipe| {
        let app = app.clone();
        let runtime_id = runtime_id.clone();
        let tail = std::sync::Arc::clone(&tail);
        std::thread::spawn(move || {
            use std::io::BufRead;
            for line in std::io::BufReader::new(pipe).lines().map_while(Result::ok) {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                // The last line to show on failure is continuously updated here —
                // no need to collect everything and search later as before.
                if let Ok(mut slot) = tail.lock() {
                    slot.clear();
                    slot.push_str(trimmed);
                }
                emit_install_progress(
                    &app,
                    &runtime_id,
                    "cli",
                    "installing",
                    None,
                    None,
                    Some(trimmed.to_string()),
                );
            }
        })
    });
    let status = child.wait().map_err(|err| format!("install-failed:{err}"))?;
    if let Some(handle) = pump {
        let _ = handle.join();
    }
    if !status.success() {
        // Push only the **last line** of the failure reason — npm emits hundreds of lines; dumping them
        // directly to the screen is not guidance.
        let last = tail.lock().map(|slot| slot.clone()).unwrap_or_default();
        emit_install_progress(&app, &runtime_id, "cli", "failed", None, None, None);
        return Err(format!("install-failed:{last}"));
    }

    // Do not end with "Installed" — **say "Re-verifying..."** and provide the re-verified value.
    emit_install_progress(&app, &runtime_id, "cli", "verifying-install", None, None, None);
    let after = doctor_context(&app, &runtime_id)?;
    emit_install_progress(&app, &runtime_id, "cli", "done", None, None, None);
    Ok(acp_doctor::diagnose(&after.borrow()))
}

/// Open an address going **outside** the app in the default browser.
///
/// ## Why needed (discovered during walkthrough 2026-08-20)
///
/// `<a target="_blank">` inside the app **does nothing**. Tauri WebView
/// does not open new windows, and this app had no plugin to handle it. Thus,
/// pressing "↗ Installation Method" in settings silently did nothing — for users with no tools,
/// that was the **only next step** we provided.
///
/// Measurement: When launching the app as a new user without tools and clicking that link, the foreground process count
/// remained unchanged and the app stayed in front. Outbound links exist in **10 files**.
///
/// ## Why not use a plugin
///
/// New dependencies must be justified in this repo; opening is just one OS command.
/// Since code to spawn a process already exists in this file, the supply chain surface becomes 0.
///
/// ## What it blocks
///
/// **Only opens `http`/`https`.** This location passes the address given by the screen directly to the OS;
/// allowing other schemes would allow opening arbitrary things via a single link.
#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if !is_openable_url(&url) {
        return Err(format!("refused-scheme:{url}"));
    }
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut c = Command::new("/usr/bin/open");
        c.arg(&url);
        c
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut c = Command::new("cmd");
        c.args(["/C", "start", "", &url]);
        c
    };
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut command = {
        let mut c = Command::new("xdg-open");
        c.arg(&url);
        c
    };
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|err| format!("open-failed:{err}"))
}

/// Is this an address that may be opened. **It is an allowlist, not a denylist** — denylists
/// are quietly bypassed whenever new schemes appear.
pub(crate) fn is_openable_url(url: &str) -> bool {
    let lowered = url.trim().to_ascii_lowercase();
    (lowered.starts_with("https://") || lowered.starts_with("http://"))
        && !url.chars().any(|c| c.is_whitespace())
}

/// Integration check — **verify step-by-step, marking fixable items as such.**
///
/// The previous approach of answering one symptom with one sentence sent users to the wrong place
/// when the cause lay in a different phase (as seen in the 2026-08-20 login incident). Here we
/// return only facts; the screen generates the sentences.
#[tauri::command]
fn acp_diagnose(app: tauri::AppHandle, runtime_id: String) -> Result<Vec<acp_doctor::AcpCheck>, String> {
    // If re-verifying starts, forget previous installation results — the screen also clears its
    // state at the same moment, so both locations follow the same rule.
    forget_install_progress(&app, &runtime_id);
    let ctx = doctor_context(&app, &runtime_id)?;
    Ok(acp_doctor::diagnose(&ctx.borrow()))
}

/// When the screen presses "Fix". **Only `fixable` items arrive.**
#[tauri::command]
fn acp_repair(
    app: tauri::AppHandle,
    runtime_id: String,
    check_id: String,
) -> Result<Vec<acp_doctor::AcpCheck>, String> {
    let ctx = doctor_context(&app, &runtime_id)?;
    acp_doctor::repair(&ctx.borrow(), &check_id)?;
    // Return the state **re-verified after fixing**. Saying "fixed" when it actually wasn't
    // is the worst defect at this location, so make the screen show the re-verified value instead of just saying it.
    let after = doctor_context(&app, &runtime_id)?;
    Ok(acp_doctor::diagnose(&after.borrow()))
}

/// Re-establish the connection from scratch — "Re-integrate" per owner request.
///
/// Return the **re-verified value** after deletion. The worst defect here is saying "re-established"
/// while leaving it unchanged.
#[tauri::command]
fn acp_reset_connection(
    app: tauri::AppHandle,
    runtime_id: String,
) -> Result<Vec<acp_doctor::AcpCheck>, String> {
    let ctx = doctor_context(&app, &runtime_id)?;
    acp_doctor::reset_connection(&ctx.borrow())?;
    let after = doctor_context(&app, &runtime_id)?;
    Ok(acp_doctor::diagnose(&after.borrow()))
}

/// Diagnostics collect the outside world in one go. Due to ownership, values are carried as data,
/// and `borrow()` converts them into borrowed forms.
struct OwnedDoctorContext {
    runtime_id: String,
    home: Option<PathBuf>,
    app_data_dir: PathBuf,
    cli: Option<PathBuf>,
    launcher: Option<PathBuf>,
    path_env: String,
    isolated_logged_out: Option<bool>,
    shadow_present: Option<bool>,
}

impl OwnedDoctorContext {
    fn borrow(&self) -> acp_doctor::DoctorContext<'_> {
        acp_doctor::DoctorContext {
            runtime_id: &self.runtime_id,
            home: self.home.as_deref(),
            app_data_dir: &self.app_data_dir,
            cli: self.cli.as_deref(),
            launcher: self.launcher.as_deref(),
            path_env: &self.path_env,
            isolated_logged_out: self.isolated_logged_out,
            shadow_present: self.shadow_present,
        }
    }
}

fn doctor_context(app: &tauri::AppHandle, runtime_id: &str) -> Result<OwnedDoctorContext, String> {
    let (is_executable, list_dir, read_text, login_ok) = acp::real_probe();
    let probe = acp::FsProbe {
        is_executable: &is_executable,
        list_dir: &list_dir,
        read_text: &read_text,
        login_ok: &login_ok,
    };
    let home =
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    let path = std::env::var_os("PATH");
    let app_data_for_paths = app.path().app_data_dir().ok();
    let managed_bin = app_data_for_paths.as_deref().map(acp::managed_cli_bin_dir);
    let managed_node_bin = app_data_for_paths
        .as_deref()
        .and_then(managed_node::managed_node_bin_dir);
    let dirs = acp::candidate_bin_dirs(
        home.as_deref(),
        path.as_deref(),
        &probe,
        managed_bin.as_deref(),
        managed_node_bin.as_deref(),
    );
    let path_env = std::env::join_paths(dirs.iter())
        .map(|joined| joined.to_string_lossy().to_string())
        .unwrap_or_default();

    let agent = acp::registry_agent(runtime_id).ok_or_else(|| format!("unknown-runtime:{runtime_id}"))?;
    let cli = agent
        .cli
        .as_deref()
        .and_then(|name| acp::resolve_command(name, &dirs, &probe));
    let launcher = acp::resolve_launch(
        runtime_id,
        home.as_deref(),
        path.as_deref(),
        &probe,
        managed_bin.as_deref(),
        managed_node_bin.as_deref(),
    )
        .ok()
        .map(|launch| launch.program);

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("app-data-dir-unavailable:{err}"))?;

    // 앱 몫 폴더 기준으로 묻는다 — **화면이 「준비됨」이라고 말하면서 실제로는
    // 로그아웃이던 것**이 이 결함의 절반이었다. 사용자 폴더를 물으면 앱이 쓰지도
    // 않는 자리를 재는 것이다.
    let isolated = app_data_dir.join("agent-config").join(runtime_id);
    let isolated_logged_out = cli
        .as_deref()
        .filter(|_| acp::config_env_for(runtime_id).is_some())
        .and_then(|path| acp::probe_isolated_logged_out(path, &isolated, &path_env));
    let shadow_present = acp::shadow_credentials_present(&isolated);

    Ok(OwnedDoctorContext {
        runtime_id: runtime_id.to_string(),
        home,
        app_data_dir,
        cli,
        launcher,
        path_env,
        isolated_logged_out,
        shadow_present,
    })
}

#[tauri::command]
fn pick_vault_directory(dialog_title: Option<String>) -> Result<Option<String>, String> {
    let title = dialog_title.as_deref().unwrap_or("Open ontology vault");
    let Some(picked) = rfd::FileDialog::new().set_title(title).pick_folder() else {
        return Ok(None);
    };
    // 심볼릭 링크를 따라간 **실제** 자리로 판정한다 — `/tmp` → `/private/tmp`
    // 처럼 이름만 다른 같은 자리를 놓치지 않기 위해서다. canonicalize 가
    // 실패하면(권한 등) 사용자가 방금 고른 경로를 그대로 판정한다.
    let resolved = fs::canonicalize(&picked).unwrap_or_else(|_| picked.clone());
    if let Some(reason) = vault_root_rejection(&resolved) {
        // 화면이 사유별 문구를 고를 수 있도록 **안정된 코드**를 돌려준다.
        // 사람이 읽는 문장을 여기서 만들면 번역이 Rust 안에 갇힌다.
        return Err(format!("vault-root-rejected:{reason}"));
    }
    Ok(Some(picked.to_string_lossy().to_string()))
}

#[tauri::command]
fn list_vault_directory(
    root_path: String,
    relative_path: String,
) -> Result<Vec<TauriVaultEntry>, String> {
    let dir = resolve_existing_inside(&root_path, &relative_path)?;
    let entries = fs::read_dir(dir).map_err(|err| err.to_string())?;
    let mut out = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|err| err.to_string())?;
        let file_type = entry.file_type().map_err(|err| err.to_string())?;
        let kind = if file_type.is_dir() {
            "directory"
        } else if file_type.is_file() {
            "file"
        } else {
            continue;
        };
        out.push(TauriVaultEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            kind: kind.into(),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// 볼트 지문 한 항목 — 경로와 mtime **만**. 본문은 담지 않는다.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultStamp {
    relative_path: String,
    /// `TauriTextFile::last_modified` 와 같은 표현 — 이 볼트에서 mtime 의 타입은 하나다.
    last_modified: u128,
}

/// `vault_fingerprint` 의 결과. 절단·가지치기를 **숨기지 않고** 함께 돌려준다.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultFingerprint {
    entries: Vec<VaultStamp>,
    truncated: bool,
    pruned_dirs: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSourceInspection {
    root_path: String,
    source_id: String,
    kind: String,
    revision: String,
    fingerprint: String,
    dirty: Option<bool>,
    truncated: bool,
    files: Vec<String>,
}

struct SourceInventory {
    hasher: Sha256,
    files: Vec<String>,
    hashed_bytes: u64,
    truncated: bool,
}

const SOURCE_INVENTORY_VERSION: &str = "inventory-v2";
const SOURCE_INVENTORY_MAX_DEPTH: usize = 20;
const SOURCE_INVENTORY_MAX_FILES: usize = 4000;
const SOURCE_INVENTORY_MAX_HASH_BYTES: u64 = 32 * 1024 * 1024;
const SOURCE_PRUNE_DIR_NAMES: &[&str] = &[
    ".git",
    ".next",
    ".turbo",
    ".cache",
    "node_modules",
    "target",
    "dist",
    "build",
    "coverage",
];

fn source_digest(parts: &[&[u8]]) -> String {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part);
        hasher.update([0]);
    }
    format!("sha256:{:x}", hasher.finalize())
}

fn hash_source_file(
    path: &Path,
    relative: &str,
    inventory: &mut SourceInventory,
    hash_content: bool,
) -> Result<(), String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(err) => return Err(err.to_string()),
    };
    let file_type = metadata.file_type();
    if !file_type.is_file() && !file_type.is_symlink() {
        return Ok(());
    }

    inventory.files.push(relative.to_string());
    inventory.hasher.update(relative.as_bytes());
    inventory.hasher.update([0]);
    inventory.hasher.update(metadata.len().to_le_bytes());

    if !hash_content {
        return Ok(());
    }

    if file_type.is_symlink() {
        // A tracked symlink is evidence of the repository entry, not
        // permission to read whatever happens to live outside the root.
        let target = fs::read_link(path).map_err(|err| err.to_string())?;
        let target = target.to_string_lossy();
        let bytes = target.as_bytes();
        let remaining = SOURCE_INVENTORY_MAX_HASH_BYTES.saturating_sub(inventory.hashed_bytes);
        let copied = remaining.min(bytes.len() as u64) as usize;
        inventory.hasher.update(&bytes[..copied]);
        inventory.hashed_bytes += copied as u64;
        if copied < bytes.len() {
            inventory.truncated = true;
        }
        return Ok(());
    }

    let remaining = SOURCE_INVENTORY_MAX_HASH_BYTES.saturating_sub(inventory.hashed_bytes);
    if remaining == 0 {
        inventory.truncated = true;
        return Ok(());
    }
    let file = fs::File::open(path).map_err(|err| err.to_string())?;
    let mut limited = Read::take(file, remaining);
    let copied =
        std::io::copy(&mut limited, &mut inventory.hasher).map_err(|err| err.to_string())?;
    inventory.hashed_bytes += copied;
    if copied < metadata.len() {
        inventory.truncated = true;
    }
    Ok(())
}

fn walk_source_inventory(
    dir: &Path,
    prefix: &str,
    depth: usize,
    inventory: &mut SourceInventory,
) -> Result<(), String> {
    if inventory.files.len() >= SOURCE_INVENTORY_MAX_FILES {
        inventory.truncated = true;
        return Ok(());
    }
    if depth > SOURCE_INVENTORY_MAX_DEPTH {
        inventory.truncated = true;
        return Ok(());
    }

    let mut children = Vec::new();
    for entry in fs::read_dir(dir).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let file_type = entry.file_type().map_err(|err| err.to_string())?;
        if file_type.is_dir() || file_type.is_file() {
            children.push((
                entry.file_name().to_string_lossy().to_string(),
                file_type.is_dir(),
            ));
        }
    }
    children.sort_by(|left, right| left.0.cmp(&right.0));

    for (name, is_dir) in children {
        if inventory.files.len() >= SOURCE_INVENTORY_MAX_FILES {
            inventory.truncated = true;
            break;
        }
        let relative = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        let path = dir.join(&name);
        if is_dir {
            if SOURCE_PRUNE_DIR_NAMES.contains(&name.as_str()) {
                continue;
            }
            walk_source_inventory(&path, &relative, depth + 1, inventory)?;
            continue;
        }

        hash_source_file(&path, &relative, inventory, true)?;
    }
    Ok(())
}

fn inspect_source_inventory(root: &Path) -> Result<(String, bool, Vec<String>), String> {
    let mut inventory = SourceInventory {
        hasher: Sha256::new(),
        files: Vec::new(),
        hashed_bytes: 0,
        truncated: false,
    };
    inventory.hasher.update(SOURCE_INVENTORY_VERSION.as_bytes());
    inventory.hasher.update([0]);
    walk_source_inventory(root, "", 0, &mut inventory)?;
    let fingerprint = format!("sha256:{:x}", inventory.hasher.finalize());
    Ok((fingerprint, inventory.truncated, inventory.files))
}

fn run_source_git(root: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|err| format!("git source inspection failed: {err}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr)
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("unknown git error")
            .trim()
            .to_string();
        return Err(format!("git source inspection failed: {detail}"));
    }
    Ok(output.stdout)
}

fn inspect_git_source_inventory(root: &Path) -> Result<(String, bool, Vec<String>), String> {
    let listing = run_source_git(
        root,
        &[
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ],
    )?;
    let mut paths: Vec<String> = listing
        .split(|byte| *byte == 0)
        .filter(|path| !path.is_empty())
        .map(|path| String::from_utf8_lossy(path).replace('\\', "/"))
        .collect();
    paths.sort();
    paths.dedup();

    let mut dirty_paths: std::collections::HashSet<String> = run_source_git(
        root,
        &["diff", "--name-only", "--no-renames", "-z", "HEAD", "--"],
    )?
    .split(|byte| *byte == 0)
    .filter(|path| !path.is_empty())
    .map(|path| String::from_utf8_lossy(path).replace('\\', "/"))
    .collect();
    dirty_paths.extend(
        run_source_git(root, &["ls-files", "--others", "--exclude-standard", "-z"])?
            .split(|byte| *byte == 0)
            .filter(|path| !path.is_empty())
            .map(|path| String::from_utf8_lossy(path).replace('\\', "/")),
    );

    let mut inventory = SourceInventory {
        hasher: Sha256::new(),
        files: Vec::new(),
        hashed_bytes: 0,
        truncated: paths.len() > SOURCE_INVENTORY_MAX_FILES,
    };
    inventory.hasher.update(SOURCE_INVENTORY_VERSION.as_bytes());
    inventory.hasher.update([0]);
    for relative in paths.iter().take(SOURCE_INVENTORY_MAX_FILES) {
        hash_source_file(
            &root.join(relative),
            relative,
            &mut inventory,
            dirty_paths.remove(relative),
        )?;
    }
    // Deleted tracked paths are absent from the visible inventory, but still
    // need to perturb the worktree fingerprint deterministically.
    let mut deleted: Vec<String> = dirty_paths.into_iter().collect();
    deleted.sort();
    for relative in deleted {
        inventory.hasher.update(b"deleted");
        inventory.hasher.update([0]);
        inventory.hasher.update(relative.as_bytes());
        inventory.hasher.update([0]);
    }
    let fingerprint = format!("sha256:{:x}", inventory.hasher.finalize());
    Ok((fingerprint, inventory.truncated, inventory.files))
}

#[tauri::command]
fn inspect_project_source(root_path: String) -> Result<ProjectSourceInspection, String> {
    let selected_root = canonical_root(&root_path)?;
    match git::find_repo_root(&selected_root)? {
        Some(repo_root) => {
            // Git already owns the source inclusion boundary. Respect its
            // tracked + unignored-untracked set so build caches and private
            // ignored artifacts cannot consume the bounded evidence budget.
            let (inventory_fingerprint, truncated, files) =
                inspect_git_source_inventory(&repo_root)?;
            let head = run_source_git(&repo_root, &["rev-parse", "HEAD"])?;
            let revision = String::from_utf8_lossy(&head).trim().to_string();
            let status = run_source_git(
                &repo_root,
                &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
            )?;
            let canonical = repo_root.to_string_lossy().to_string();
            Ok(ProjectSourceInspection {
                root_path: canonical.clone(),
                source_id: source_digest(&[b"git", canonical.as_bytes()]),
                kind: "git".into(),
                revision: revision.clone(),
                fingerprint: source_digest(&[
                    b"git-state-v1",
                    revision.as_bytes(),
                    inventory_fingerprint.as_bytes(),
                    &status,
                ]),
                dirty: Some(!status.is_empty()),
                truncated,
                files,
            })
        }
        None => {
            let (fingerprint, truncated, files) = inspect_source_inventory(&selected_root)?;
            let canonical = selected_root.to_string_lossy().to_string();
            Ok(ProjectSourceInspection {
                root_path: canonical.clone(),
                source_id: source_digest(&[b"folder", canonical.as_bytes()]),
                kind: "folder".into(),
                revision: fingerprint.clone(),
                fingerprint,
                dirty: None,
                truncated,
                files,
            })
        }
    }
}

/// TS `VAULT_WALK_MAX_DEPTH` 와 **같은 값이어야 한다** (계약 테스트가 본다).
const VAULT_WALK_MAX_DEPTH: usize = 12;
/// TS `VAULT_WALK_MAX_ENTRIES` 와 같은 값.
const VAULT_WALK_MAX_ENTRIES: usize = 4000;
/// TS `PRUNE_BY_NAME` 과 같은 목록.
const VAULT_PRUNE_DIR_NAMES: &[&str] = &["node_modules"];
/// TS `CACHE_DIR_TAG` 와 같은 값.
const VAULT_CACHE_DIR_TAG: &str = "CACHEDIR.TAG";
/// TS `IMAGE_EXT` 와 같은 확장자 집합(소문자 비교).
const VAULT_IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"];

fn vault_entry_is_tracked(name: &str) -> bool {
    if name.ends_with(".md") {
        return true;
    }
    match name.rsplit_once('.') {
        Some((_, ext)) => VAULT_IMAGE_EXTS.contains(&ext.to_ascii_lowercase().as_str()),
        None => false,
    }
}

fn walk_vault_stamps(
    dir: &Path,
    prefix: &str,
    depth: usize,
    acc: &mut VaultFingerprint,
) -> Result<(), String> {
    if acc.truncated {
        return Ok(());
    }
    if depth > VAULT_WALK_MAX_DEPTH {
        acc.truncated = true;
        return Ok(());
    }

    // 목록을 먼저 모은다 — 캐시 표식 판정이 이 목록 안에서 끝난다.
    let mut children: Vec<(String, bool)> = Vec::new();
    for entry in fs::read_dir(dir).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let file_type = entry.file_type().map_err(|err| err.to_string())?;
        if !file_type.is_dir() && !file_type.is_file() {
            continue;
        }
        children.push((
            entry.file_name().to_string_lossy().to_string(),
            file_type.is_dir(),
        ));
    }

    if children.iter().any(|(name, _)| name == VAULT_CACHE_DIR_TAG) {
        acc.pruned_dirs
            .push(if prefix.is_empty() { ".".into() } else { prefix.into() });
        return Ok(());
    }

    for (name, is_dir) in children {
        if acc.entries.len() >= VAULT_WALK_MAX_ENTRIES {
            acc.truncated = true;
            return Ok(());
        }
        if name.starts_with('.') {
            continue;
        }
        let relative = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        if is_dir {
            if VAULT_PRUNE_DIR_NAMES.contains(&name.as_str()) {
                acc.pruned_dirs.push(relative);
                continue;
            }
            walk_vault_stamps(&dir.join(&name), &relative, depth + 1, acc)?;
        } else if vault_entry_is_tracked(&name) {
            let last_modified = metadata_mtime_ms(&dir.join(&name))?;
            acc.entries.push(VaultStamp {
                relative_path: relative,
                last_modified,
            });
        }
    }
    Ok(())
}

/// 볼트를 훑어 **경로와 mtime 만** 돌려준다.
///
/// ## 왜 이 명령이 필요한가 (2026-07-31)
///
/// 지문 계산이 `read_vault_text_file` 을 파일마다 불렀다 — 그 명령은 **본문
/// 전체 + mtime** 을 돌려주므로, 쓰이는 것이 숫자 하나인데 볼트 전체가 IPC 를
/// 건너왔다. 이 저장소 자신을 볼트로 열면 `docs/` 가 **261 파일 · 17.7MB** 이고,
/// 그 경로는 창에 포커스가 돌아올 때마다 돈다.
///
/// 왕복도 파일마다 하나씩이었다(디렉터리마다 `list_vault_directory` 하나 추가).
/// 이제 **한 번**이고, 페이로드는 경로+숫자뿐이다.
///
/// ⚠️ **walk 규칙은 TS 쪽과 한 글자도 달라선 안 된다.** 다르면 지문이 달라지고,
/// 앱은 "바뀐 게 없는데 매번 재빌드" 하거나 "바뀌었는데 안 알아챈다". 상수는 위에
/// 모아 두었고 `tests/contract/vault-walk-rules.contract.test.ts` 가 두 소스를
/// 맞대어 본다.
#[tauri::command]
fn vault_fingerprint(root_path: String) -> Result<VaultFingerprint, String> {
    let root = resolve_existing_inside(&root_path, "")?;
    let mut acc = VaultFingerprint {
        entries: Vec::new(),
        truncated: false,
        pruned_dirs: Vec::new(),
    };
    walk_vault_stamps(&root, "", 0, &mut acc)?;
    Ok(acc)
}

#[tauri::command]
fn read_vault_text_file(root_path: String, relative_path: String) -> Result<TauriTextFile, String> {
    let path = resolve_existing_inside(&root_path, &relative_path)?;
    let text = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let last_modified = metadata_mtime_ms(&path)?;
    Ok(TauriTextFile {
        text,
        last_modified,
    })
}

#[tauri::command]
fn read_vault_binary_file(
    root_path: String,
    relative_path: String,
) -> Result<TauriBinaryFile, String> {
    let path = resolve_existing_inside(&root_path, &relative_path)?;
    let bytes = fs::read(&path).map_err(|err| err.to_string())?;
    let last_modified = metadata_mtime_ms(&path)?;
    Ok(TauriBinaryFile {
        bytes,
        last_modified,
    })
}

/// 파일 하나를 **끊기지 않게** 쓴다 — 임시 파일에 쓰고, 디스크에 확정하고, 이름을 바꾼다.
///
/// ## 왜 (2026-08-16 검수)
///
/// 종전에는 `fs::write` 하나였다. 그건 원본을 **먼저 비우고** 쓴다. 그 사이에
/// 앱이 죽거나 디스크가 차면 사용자의 마크다운이 **잘린 채로** 남는다 — 그리고
/// 그 파일은 방금 우리가 열어 준 그 폴더의 것이다. 이 제품의 약속은 「당신의
/// 파일은 그대로 당신 디스크에 있다」이고, 그 약속에는 「멀쩡하게」가 포함된다.
///
/// 이름 바꾸기는 같은 파일 시스템 안에서 원자적이다. 그래서 어느 순간에 죽어도
/// 파일은 **옛 내용 아니면 새 내용**이지, 반쪽이 되지 않는다.
#[cfg(any(not(unix), test))]
fn write_text_atomically(path: &std::path::Path, content: &str) -> Result<(), String> {
    use std::io::Write;

    static TEMP_SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

    let parent = path
        .parent()
        .ok_or_else(|| "atomic write target must have a parent directory".to_string())?;
    let file_name = path
        .file_name()
        .ok_or_else(|| "atomic write target must include a file name".to_string())?
        .to_string_lossy();
    let nonce = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| err.to_string())?
        .as_nanos();
    let mut created = None;
    for _ in 0..64 {
        let sequence = TEMP_SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let candidate = parent.join(format!(
            ".{file_name}.oatlas-tmp-{}-{nonce:x}-{sequence:x}",
            std::process::id()
        ));
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => {
                created = Some((candidate, file));
                break;
            }
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(err) => return Err(err.to_string()),
        }
    }
    let (temporary, mut file) = created.ok_or_else(|| {
        "could not create a private temporary file for the atomic write".to_string()
    })?;
    let result = (|| -> std::io::Result<()> {
        file.write_all(content.as_bytes())?;
        // 이름을 바꾸기 전에 디스크에 확정한다 — 안 하면 이름만 새것이고
        // 내용은 아직 캐시에 있는 상태로 전원이 나갈 수 있다.
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, path)
    })();
    if result.is_err() {
        // 실패하면 임시 파일만 치운다. 원본은 손대지 않았다.
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(|err| err.to_string())
}

#[tauri::command]
fn write_vault_text_file(
    root_path: String,
    relative_path: String,
    content: String,
) -> Result<(), String> {
    write_vault_text_file_after_validation(root_path, relative_path, content, || {})
}

fn write_vault_text_file_after_validation(
    root_path: String,
    relative_path: String,
    content: String,
    after_validation: impl FnOnce(),
) -> Result<(), String> {
    #[cfg(unix)]
    {
        let root = canonical_root(&root_path)?;
        let relative = normalize_relative_path(&relative_path)?;
        let parent_relative = relative.parent().unwrap_or_else(|| Path::new(""));
        let parent_relative = parent_relative.to_string_lossy();
        resolve_directory_target_inside(&root_path, &parent_relative)?;
        let target = root.join(&relative);
        match fs::symlink_metadata(&target) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err("resolved path must stay inside the selected vault".into());
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
        let root_handle = agent_setup::open_absolute_directory_no_follow(&root)?;
        let (parent, file_name) = agent_setup::open_entry_parent(&root_handle, &relative_path)?;
        after_validation();
        agent_setup::write_entry_atomically(&parent, &file_name, &content, 0o666)
    }

    #[cfg(not(unix))]
    {
        let path = resolve_write_target_inside(&root_path, &relative_path)?;
        after_validation();
        write_text_atomically(&path, &content)
    }
}

#[tauri::command]
fn remove_vault_entry(
    root_path: String,
    relative_path: String,
    recursive: Option<bool>,
) -> Result<(), String> {
    if normalize_relative_path(&relative_path)?
        .as_os_str()
        .is_empty()
    {
        return Err("refusing to remove the selected vault root".into());
    }
    let path = resolve_inside(&root_path, &relative_path)?;
    let root = canonical_root(&root_path)?;
    let parent = path
        .parent()
        .ok_or_else(|| "remove target must have a parent directory".to_string())?;
    let canonical_parent = fs::canonicalize(parent).map_err(|err| err.to_string())?;
    if !canonical_parent.starts_with(&root) {
        return Err("resolved path must stay inside the selected vault".into());
    }

    let entry_metadata = fs::symlink_metadata(&path).map_err(|err| err.to_string())?;
    if entry_metadata.file_type().is_symlink() {
        let canonical_target = fs::canonicalize(&path).map_err(|err| err.to_string())?;
        if !canonical_target.starts_with(&root) {
            return Err("resolved path must stay inside the selected vault".into());
        }

        #[cfg(windows)]
        {
            if fs::metadata(&path)
                .map_err(|err| err.to_string())?
                .is_dir()
            {
                return fs::remove_dir(path).map_err(|err| err.to_string());
            }
        }
        return fs::remove_file(path).map_err(|err| err.to_string());
    }

    let canonical_path = fs::canonicalize(&path).map_err(|err| err.to_string())?;
    if !canonical_path.starts_with(&root) {
        return Err("resolved path must stay inside the selected vault".into());
    }
    let metadata = fs::metadata(&path).map_err(|err| err.to_string())?;
    if metadata.is_dir() {
        if recursive.unwrap_or(false) {
            fs::remove_dir_all(path).map_err(|err| err.to_string())
        } else {
            fs::remove_dir(path).map_err(|err| err.to_string())
        }
    } else {
        fs::remove_file(path).map_err(|err| err.to_string())
    }
}

#[tauri::command]
fn ensure_vault_directory(root_path: String, relative_path: String) -> Result<(), String> {
    ensure_vault_directory_after_validation(root_path, relative_path, || {})
}

fn ensure_vault_directory_after_validation(
    root_path: String,
    relative_path: String,
    after_validation: impl FnOnce(),
) -> Result<(), String> {
    #[cfg(unix)]
    {
        let root = canonical_root(&root_path)?;
        let relative = normalize_relative_path(&relative_path)?;
        resolve_directory_target_inside(&root_path, &relative_path)?;
        if relative.as_os_str().is_empty() {
            after_validation();
            return Ok(());
        }
        let directory_name = relative
            .file_name()
            .ok_or_else(|| "directory target must include a final name".to_string())?;
        let parent_path = relative.parent().unwrap_or_else(|| Path::new(""));
        let root_handle = agent_setup::open_absolute_directory_no_follow(&root)?;
        let parent =
            agent_setup::open_or_create_relative_directory(&root_handle, parent_path, 0o777)?;
        after_validation();
        let directory = agent_setup::open_or_create_relative_directory(
            &parent,
            Path::new(directory_name),
            0o777,
        )?;
        directory.sync_all().map_err(|error| error.to_string())?;
        parent.sync_all().map_err(|error| error.to_string())
    }

    #[cfg(not(unix))]
    {
        let path = resolve_directory_target_inside(&root_path, &relative_path)?;
        after_validation();
        fs::create_dir_all(&path).map_err(|err| err.to_string())?;
        ensure_inside_canonical(&root_path, &path)?;
        Ok(())
    }
}

#[tauri::command]
fn vault_path_exists(
    root_path: String,
    relative_path: String,
    kind: String,
) -> Result<bool, String> {
    let path = resolve_inside(&root_path, &relative_path)?;
    let root = canonical_root(&root_path)?;
    let path = match fs::canonicalize(&path) {
        Ok(path) => path,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(err) => return Err(err.to_string()),
    };
    if !path.starts_with(&root) {
        return Err("resolved path must stay inside the selected vault".into());
    }
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(err) => return Err(err.to_string()),
    };
    Ok(match kind.as_str() {
        "file" => metadata.is_file(),
        "directory" => metadata.is_dir(),
        _ => false,
    })
}

#[tauri::command]
fn open_vault_in_finder(root_path: String) -> Result<(), String> {
    let root = PathBuf::from(&root_path);
    let metadata = fs::metadata(&root).map_err(|err| err.to_string())?;
    if !metadata.is_dir() {
        return Err("vault root must be a directory".into());
    }
    // ⚠️ **`is_dir()` 로는 부족하다** (2026-08-17). macOS 에서 `.app` 은
    // 디렉터리라 위 검사를 통과하고, 그러면 아래 `open` 이 폴더를 여는 게
    // 아니라 **그 프로그램을 실행한다.** 같은 판정을 볼트 루트 문에서 쓰는
    // 함수로 한다 — 판정이 두 벌이 되면 한쪽만 느슨해지는 쪽이 기본값이다.
    if let Some(reason) = vault_root_rejection(&root) {
        return Err(format!("refusing to open this path: {reason}"));
    }

    #[cfg(target_os = "macos")]
    {
        // `-a Finder` 로 **여는 프로그램을 못박는다.** 이것만으로도 번들이
        // 실행되지 않지만, 위 거절과 둘 다 둔다 — 하나가 풀려도 다른 하나가
        // 남는다.
        let status = Command::new("open")
            .arg("-a")
            .arg("Finder")
            .arg(&root)
            .status()
            .map_err(|err| err.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("open exited with status {status}"))
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = root;
        Err("Finder reveal is only available on macOS".into())
    }
}

/// "그냥 시작하기" 데스크톱 first-run 액션 전용 — Documents 안에 vault 들을
/// 모아두는 컨테이너 폴더 이름. Rust 쪽에서만 $HOME/Documents 를 알 수
/// 있으므로(JS 는 fs 플러그인 없이 접근 불가), 경로 조립을 순수 함수로
/// 분리해 테스트하고 커맨드는 그 결과에 create_dir_all 만 더한다.
fn default_vault_parent_dir(home: &str) -> PathBuf {
    PathBuf::from(home).join("Documents").join("Ontology Atlas")
}

#[tauri::command]
fn ensure_default_vault_parent_dir() -> Result<String, String> {
    let home = std::env::var("HOME")
        .map_err(|_| "HOME environment variable is not set".to_string())?;
    let parent = default_vault_parent_dir(&home);
    fs::create_dir_all(&parent).map_err(|err| err.to_string())?;
    let canonical = fs::canonicalize(&parent).map_err(|err| err.to_string())?;
    Ok(canonical.to_string_lossy().to_string())
}

fn show_main_window(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.show();

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn apply_verify_window_size(app: &AppHandle) {
    if std::env::var_os(WEBVIEW_VERIFY_ENV).is_none() {
        return;
    }
    let Ok(raw_size) = std::env::var(WEBVIEW_VERIFY_WINDOW_SIZE_ENV) else {
        return;
    };
    let Some((width, height)) = parse_verify_window_size(&raw_size) else {
        return;
    };
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.set_fullscreen(false);
        let _ = window.unmaximize();
        let resize_result = window.set_size(tauri::LogicalSize::new(width, height));
        let _ = window.center();
        let inner_size = window
            .inner_size()
            .map(|size| format!("{}x{}", size.width, size.height))
            .unwrap_or_else(|err| format!("unavailable:{err}"));
        write_verify_line(format!(
            "[ontology-atlas-window-verify] requested={}x{} resize_ok={} inner_size={}",
            width,
            height,
            resize_result.is_ok(),
            inner_size
        ));
    }
}

fn schedule_show_main_window(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        std::thread::sleep(Duration::from_millis(500));
        show_main_window(&app);
        apply_verify_window_size(&app);
    });
}

/// live-tauri — vault 디렉터리를 recursive 로 감시해 `.md` 변경 시 webview 에
/// `vault-changed` 이벤트를 emit. 500ms debounce 로 에디터의 다중 write 를 묶는다.
/// JS 측은 이 이벤트를 listen 해 즉시 refresh — 5초 폴링 대기 없이 반영.
/// debouncer 를 State 에 보관해 앱 수명 동안 살린다(재호출 시 이전 것을 교체·drop).
#[tauri::command]
fn start_vault_watch(
    app: AppHandle,
    root_path: String,
    state: State<'_, VaultWatcherState>,
) -> Result<(), String> {
    let canonical = canonical_root(&root_path)?;
    let app_handle = app.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        None,
        move |result: DebounceEventResult| {
            if let Ok(events) = result {
                let md_changed = events.iter().any(|event| {
                    event
                        .paths
                        .iter()
                        .any(|path| path.extension().is_some_and(|ext| ext == "md"))
                });
                if md_changed {
                    let _ = app_handle.emit("vault-changed", ());
                }
            }
        },
    )
    .map_err(|err| err.to_string())?;
    debouncer
        .watcher()
        .watch(&canonical, RecursiveMode::Recursive)
        .map_err(|err| err.to_string())?;
    *state
        .debouncer
        .lock()
        .map_err(|_| "vault watcher state poisoned".to_string())? = Some(debouncer);
    Ok(())
}

/// WKWebView rAF 60fps cap release — ProMotion (120Hz) display support.
///
/// WKWebView on macOS 13–15 bundles requestAnimationFrame to 60fps regardless of display
/// refresh rate due to the WebKit internal feature
/// `PreferPageRenderingUpdatesNear60FPSEnabled` (default true). A measurement on this machine
/// (frame-profile probe) also confirmed 17ms fixation on a 120Hz display.
/// Use private `_features` /
/// `_setEnabled:forFeature:` APIs that Safari uses internally to disable this feature. Since we check selector existence first,
/// if the API disappears in future macOS, it will quietly remain at 60fps without crashing.
#[cfg(target_os = "macos")]
fn disable_webview_frame_rate_cap(window: &tauri::WebviewWindow) {
    let _ = window.with_webview(|platform_webview| {
        use objc2::runtime::{AnyClass, AnyObject, Bool};
        use objc2::{msg_send, sel};

        unsafe {
            let webview = platform_webview.inner() as *mut AnyObject;
            if webview.is_null() {
                return;
            }
            let configuration: *mut AnyObject = msg_send![&*webview, configuration];
            if configuration.is_null() {
                return;
            }
            let preferences: *mut AnyObject = msg_send![&*configuration, preferences];
            if preferences.is_null() {
                return;
            }
            let Some(preferences_class) = AnyClass::get(c"WKPreferences") else {
                return;
            };
            let class_object = preferences_class as *const AnyClass as *mut AnyObject;
            let class_responds: Bool =
                msg_send![&*class_object, respondsToSelector: sel!(_features)];
            let instance_responds: Bool = msg_send![
                &*preferences,
                respondsToSelector: sel!(_setEnabled:forFeature:)
            ];
            if !class_responds.as_bool() || !instance_responds.as_bool() {
                eprintln!(
                    "[frame-rate-cap] WKPreferences private feature API unavailable; staying at default frame pacing"
                );
                return;
            }
            let features: *mut AnyObject = msg_send![&*class_object, _features];
            if features.is_null() {
                return;
            }
            let count: usize = msg_send![&*features, count];
            for index in 0..count {
                let feature: *mut AnyObject = msg_send![&*features, objectAtIndex: index];
                if feature.is_null() {
                    continue;
                }
                let key: *mut AnyObject = msg_send![&*feature, key];
                if key.is_null() {
                    continue;
                }
                let utf8: *const std::ffi::c_char = msg_send![&*key, UTF8String];
                if utf8.is_null() {
                    continue;
                }
                let key_str = std::ffi::CStr::from_ptr(utf8).to_string_lossy();
                if key_str == "PreferPageRenderingUpdatesNear60FPSEnabled" {
                    let _: () = msg_send![
                        &*preferences,
                        _setEnabled: Bool::NO,
                        forFeature: &*feature
                    ];
                    eprintln!(
                        "[frame-rate-cap] disabled PreferPageRenderingUpdatesNear60FPSEnabled — WebView follows display refresh rate"
                    );
                    return;
                }
            }
            eprintln!(
                "[frame-rate-cap] PreferPageRenderingUpdatesNear60FPSEnabled feature not found; staying at default frame pacing"
            );
        }
    });
}

pub fn run() {
    let verify_webview = std::env::var_os(WEBVIEW_VERIFY_ENV).is_some();
    let mut context = tauri::generate_context!();
    let isolated_window_count =
        isolate_verify_webview_storage(context.config_mut(), verify_webview);
    if verify_webview {
        write_verify_line(format!(
            "[ontology-atlas-webview-storage] mode=incognito windows={isolated_window_count}"
        ));
    }

    tauri::Builder::default()
        // The updater replaces the bundle only after verifying the minisign signature. The public key is
        // embedded in `tauri.conf.json` and the private key is only in CI secrets, so
        // packages we did not sign are not installed by this app.
        //
        // The process plugin exists solely because of one restart after update — if users must manually
        // close and reopen the app, it is not "one button press".
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(VaultWatcherState::default())
        .manage(AcpInstallProgressState::default())
        .manage(AcpSessions::default())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);

            show_main_window(app.handle());
            apply_verify_window_size(app.handle());

            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                disable_webview_frame_rate_cap(&window);
            }

            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                if std::env::var_os(WEBVIEW_VERIFY_ENV).is_some() {
                    let verify_window = window.clone();
                    let verify_route = std::env::var(WEBVIEW_VERIFY_ROUTE_ENV)
                        .ok()
                        .filter(|route| is_safe_webview_verify_route(route));
                    let verify_vault = std::env::var(WEBVIEW_VERIFY_VAULT_ENV)
                        .ok()
                        .filter(|path| !path.trim().is_empty());
                    let verify_ai_settings =
                        std::env::var_os(WEBVIEW_VERIFY_AI_SETTINGS_ENV).is_some();
                    let verify_ai_base_url = std::env::var(WEBVIEW_VERIFY_AI_BASE_URL_ENV)
                        .ok()
                        .filter(|url| is_safe_verify_base_url(url));
                    let verify_app_update =
                        std::env::var_os(WEBVIEW_VERIFY_APP_UPDATE_ENV).is_some();
                    let verify_acp_install =
                        std::env::var_os(WEBVIEW_VERIFY_ACP_INSTALL_ENV).is_some();
                    tauri::async_runtime::spawn(async move {
                        if let Some(vault_path) = verify_vault {
                            let bootstrap_script =
                                build_webview_verify_vault_bootstrap_script(&vault_path);
                            let _ = verify_window.eval(&bootstrap_script);
                            std::thread::sleep(Duration::from_millis(
                                WEBVIEW_VERIFY_FIXTURE_SETTLE_MS,
                            ));
                        }
                        if let Some(route) = verify_route {
                            let reset_script = build_webview_verify_route_reset_script(&route);
                            let _ = verify_window.eval(&reset_script);
                            std::thread::sleep(Duration::from_millis(
                                WEBVIEW_VERIFY_ROUTE_INTERVAL_MS,
                            ));
                            let script = build_webview_verify_route_script(&route);
                            for _ in 0..WEBVIEW_VERIFY_ROUTE_ATTEMPTS {
                                let _ = verify_window.eval(&script);
                                std::thread::sleep(Duration::from_millis(
                                    WEBVIEW_VERIFY_ROUTE_INTERVAL_MS,
                                ));
                            }
                        } else {
                            std::thread::sleep(Duration::from_millis(2000));
                        }
                        if verify_acp_install {
                            let _ = verify_window.eval(ACP_INSTALL_VERIFY_SCRIPT);
                            // It involves receiving 52MB, so we provide ample time. Verification is about whether
                            // «progress arrives», not completion, so even if interrupted midway,
                            // the accumulated step list provides the answer.
                            std::thread::sleep(Duration::from_millis(90000));
                        }
                        if verify_app_update {
                            let _ = verify_window.eval(APP_UPDATE_VERIFY_SCRIPT);
                            // Two click steps + one actual network round-trip must complete within this
                            // window for marker collection to see the final state.
                            std::thread::sleep(Duration::from_millis(12000));
                        }
                        if verify_ai_settings {
                            match verify_ai_base_url.as_deref() {
                                Some(base_url) => {
                                    let _ = verify_window
                                        .eval(build_webview_verify_ai_settings_script(base_url));
                                    // Five click steps + one actual HTTP round-trip must complete within this
                                    // window for marker collection to see the final state.
                                    std::thread::sleep(Duration::from_millis(12000));
                                }
                                None => {
                                    // If the address is missing or unsafe, **do not silently skip** — leave that fact as a marker so the verifier
                                    // turns red.
                                    let _ = verify_window.eval(
                                        r#"(() => {
                                          window.__ontologyAtlasAiSettingsVerify = {
                                            attempted: false,
                                            step: "start",
                                            reason: "ONTOLOGY_ATLAS_VERIFY_AI_BASE_URL was missing or unsafe"
                                          };
                                        })()"#,
                                    );
                                }
                            }
                        }
                        for _ in 0..WEBVIEW_VERIFY_MARKER_ATTEMPTS {
                            let _ = verify_window.eval_with_callback(
                            r#"(() => {
                              try {
                              const bodyText = document.body ? document.body.innerText : "";
                              const links = Array.from(document.querySelectorAll("a")).map((link) => ({
                                href: link.getAttribute("href") || "",
                                text: link.textContent || "",
                              }));
                              const buttons = Array.from(document.querySelectorAll("button")).map((button) => button.textContent || "");
                              const insightsMaintenanceBoard = document.querySelector(
                                '[data-insights-surface="maintenance-board"]'
                              );
                              const insightsQuestionTabs = Array.from(
                                insightsMaintenanceBoard?.querySelectorAll('[role="tab"]') || []
                              );
                              const insightsSelectedTabs = insightsQuestionTabs.filter(
                                (tab) => tab.getAttribute("aria-selected") === "true"
                              );
                              const insightsSelectedPanelId =
                                insightsSelectedTabs[0]?.getAttribute("aria-controls") || "";
                              const insightsSelectedPanel = insightsSelectedPanelId
                                ? document.getElementById(insightsSelectedPanelId)
                                : null;
                              const insightsSelectedPanelRect =
                                insightsSelectedPanel?.getBoundingClientRect();
                              const insightsSelectedPanelStyle = insightsSelectedPanel
                                ? getComputedStyle(insightsSelectedPanel)
                                : null;
                              const insightsSelectedPanelVisible = Boolean(
                                insightsSelectedPanelRect &&
                                insightsSelectedPanelRect.width > 1 &&
                                insightsSelectedPanelRect.height > 1 &&
                                insightsSelectedPanelStyle?.display !== "none" &&
                                insightsSelectedPanelStyle?.visibility !== "hidden" &&
                                Number(insightsSelectedPanelStyle?.opacity || "1") > 0.01
                              );
                              const aiSettingsVerification = window.__ontologyAtlasAiSettingsVerify || null;
                              const appUpdateVerification = window.__ontologyAtlasAppUpdateVerify || null;
                              const acpInstallVerification = window.__ontologyAtlasAcpInstallVerify || null;
                              const aiSettingsVisible = (el) => {
                                if (!el) return false;
                                const style = getComputedStyle(el);
                                const rect = el.getBoundingClientRect();
                                return style.display !== "none" &&
                                  style.visibility !== "hidden" &&
                                  Number(style.opacity || "1") > 0.01 &&
                                  rect.width > 0 &&
                                  rect.height > 0;
                              };
                              const aiSettingsPopover = document.querySelector('[data-testid="app-settings-popover"]');
                              const aiSettingsAiView = document.querySelector('[data-testid="app-settings-pane-ai"]');
                              const aiSettingsUrlInput = document.querySelector('[data-testid="ai-local-url"]');
                              const aiSettingsVerifiedLine = document.querySelector('[data-testid="ai-local-verified"]');
                              const aiSettingsFailureLine = document.querySelector('[data-testid="ai-local-failure"]');
                              const aiSettingsConnectedLine = document.querySelector('[data-testid="ai-local-connected"]');
                              const topologyDragVerification = window.__ontologyAtlasTopologyDragVerify || null;
                              const topologyFrameProfile = window.__ontologyAtlasTopologyFrameProfile || null;
                              const topologyMapEngineEl = document.querySelector("[data-map-engine]");
                              const topologyMapEngine = topologyMapEngineEl?.getAttribute("data-map-engine") || "";
                              const topologyV2CanvasInkPixels = (() => {
                                if (topologyMapEngine !== "v2") return 0;
                                const canvas = topologyMapEngineEl?.querySelector(
                                  'canvas[data-testid="topology-map-v2-canvas"]'
                                );
                                if (!(canvas instanceof HTMLCanvasElement) || canvas.width < 1 || canvas.height < 1) {
                                  return 0;
                                }
                                try {
                                  const context = canvas.getContext("2d", { willReadFrequently: true });
                                  if (!context) return 0;
                                  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                                  let inkPixels = 0;
                                  for (let index = 3; index < pixels.length; index += 4) {
                                    if (pixels[index] > 0) inkPixels += 1;
                                  }
                                  return inkPixels;
                                } catch (_) {
                                  return 0;
                                }
                              })();
                              const topologyV2DetailPanel = document.querySelector(
                                '[data-testid="topology-v2-detail-panel"]'
                              );
                              const topologyV2DetailPanelRect =
                                topologyV2DetailPanel?.getBoundingClientRect();
                              const topologyV2DetailPanelStyle = topologyV2DetailPanel
                                ? getComputedStyle(topologyV2DetailPanel)
                                : null;
                              const topologyV2DetailPanelVisible = Boolean(
                                topologyV2DetailPanelRect &&
                                topologyV2DetailPanelRect.width > 1 &&
                                topologyV2DetailPanelRect.height > 1 &&
                                topologyV2DetailPanelStyle?.display !== "none" &&
                                topologyV2DetailPanelStyle?.visibility !== "hidden" &&
                                Number(topologyV2DetailPanelStyle?.opacity || "1") > 0.01
                              );
                              const topologyV2ProjectSourceReceipt = document.querySelector(
                                '[data-testid="topology-v2-project-source-receipt"]'
                              );
                              const topologyV2ProjectSourceGap = document.querySelector(
                                '[data-testid="topology-v2-project-source-gap"]'
                              );
                              const topologyV2DetailPanelActions = document.querySelector(
                                '[data-testid="topology-v2-detail-panel-actions"]'
                              );
                              const topologyV2DetailPanelFooter = document.querySelector(
                                '[data-testid="topology-v2-detail-panel-footer"]'
                              );
                              const topologyV2ProjectSourceReceiptRect =
                                topologyV2ProjectSourceReceipt?.getBoundingClientRect();
                              const topologyV2DetailPanelActionsRect =
                                topologyV2DetailPanelActions?.getBoundingClientRect();
                              const topologyV2DetailPanelFooterRect =
                                topologyV2DetailPanelFooter?.getBoundingClientRect();
                              const topologyV2RectOverlapArea = (a, b) => {
                                if (!a || !b) return 0;
                                const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                                const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                                return width > 0.5 && height > 0.5 ? width * height : 0;
                              };
                              const topologyV2InlineActionWidths = topologyV2DetailPanelActions
                                ? Array.from(topologyV2DetailPanelActions.children)
                                  .filter(aiSettingsVisible)
                                  .map((action) => action.getBoundingClientRect().width)
                                : [];
                              const topologyV2EdgePanel = document.querySelector(
                                '[data-testid="topology-v2-edge-panel"]'
                              );
                              const topologyV2EdgePanelRect =
                                topologyV2EdgePanel?.getBoundingClientRect();
                              const topologyV2EdgePanelStyle = topologyV2EdgePanel
                                ? getComputedStyle(topologyV2EdgePanel)
                                : null;
                              const topologyV2EdgePanelVisible = Boolean(
                                topologyV2EdgePanelRect &&
                                topologyV2EdgePanelRect.width > 1 &&
                                topologyV2EdgePanelRect.height > 1 &&
                                topologyV2EdgePanelStyle?.display !== "none" &&
                                topologyV2EdgePanelStyle?.visibility !== "hidden" &&
                                Number(topologyV2EdgePanelStyle?.opacity || "1") > 0.01
                              );
                              const guidedTourOverlay = document.querySelector(
                                '[data-testid="guided-tour-overlay"]'
                              );
                              const guidedTourOverlayRect =
                                guidedTourOverlay?.getBoundingClientRect();
                              const guidedTourOverlayStyle = guidedTourOverlay
                                ? getComputedStyle(guidedTourOverlay)
                                : null;
                              const guidedTourOverlayVisible = Boolean(
                                guidedTourOverlayRect &&
                                guidedTourOverlayRect.width > 1 &&
                                guidedTourOverlayRect.height > 1 &&
                                guidedTourOverlayStyle?.display !== "none" &&
                                guidedTourOverlayStyle?.visibility !== "hidden" &&
                                Number(guidedTourOverlayStyle?.opacity || "1") > 0.01
                              );
                              const topologyV2PrefersReducedMotion =
                                window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
                              const topologyMapCanvasCardCount = document.querySelectorAll(
                                '[data-testid="topology-map-canvas"] [data-skeleton-card]'
                              ).length;
                              const topologyZoomVerification = window.__ontologyAtlasTopologyZoomVerify || null;
                              const topologySelectedRelationVerification =
                                window.__ontologyAtlasTopologySelectedRelationVerify || null;
                              const topologyNodePopoverVerification =
                                window.__ontologyAtlasTopologyNodePopoverVerify || null;
                              const topologyFocusNoopVerification =
                                window.__ontologyAtlasTopologyFocusNoopVerify || null;
                              const topologyDragConnector = document.querySelector("[data-drag-cluster-connector]");
                              const topologyDragConnectorCount =
                                document.querySelectorAll("[data-drag-cluster-connector]").length;
                              const topologyDragConnectorD =
                                topologyDragConnector?.getAttribute("d") ||
                                (topologyDragVerification?.connectorDrawable ? "M snapshot" : "");
                              const topologyDragConnectorClearance =
                                Number(topologyDragConnector?.getAttribute("data-connector-clearance") || "0") ||
                                Number(topologyDragVerification?.connectorClearance || 0);
                              const sigmaViewport = document.querySelector('[data-testid="topology-map-v2"]');
                              const sigmaViewportRect = sigmaViewport?.getBoundingClientRect();
                              const sigmaViewportStyle = sigmaViewport ? getComputedStyle(sigmaViewport) : null;
                              const topologyStagePanClickCancelPx = Number(
                                sigmaViewport?.getAttribute("data-stage-pan-click-cancel-px") ||
                                topologyMapEngineEl?.getAttribute("data-stage-pan-click-cancel-px") ||
                                "0"
                              );
                              const sigmaCanvases = sigmaViewport
                                ? Array.from(sigmaViewport.querySelectorAll("canvas")).map((canvas) => {
                                    const rect = canvas.getBoundingClientRect();
                                    return { width: rect.width, height: rect.height };
                                  })
                                : [];
                              const sigmaLoadingFallbackStyle = (null) ? getComputedStyle((null)) : null;
                              const topologyFocusClusterConnectorCount =
                                (false)
                                  ? (
                                    document.querySelectorAll("[data-focus-cluster-connector]").length ||
                                    document.querySelectorAll("[data-drag-cluster-connector]").length
                                  )
                                  : 0;
                              const visibleTopologyConnectorRelationLabelCount =
                                Array.from(document.querySelectorAll('[data-connector-relation-label="true"]'))
                                  .filter((label) => {
                                    const style = getComputedStyle(label);
                                    const opacity = Number(label.getAttribute("opacity") || style.opacity || "1");
                                    return (
                                      label.getAttribute("aria-hidden") !== "true" &&
                                      style.display !== "none" &&
                                      style.visibility !== "hidden" &&
                                      opacity > 0
                                    );
                                  }).length;
                              const visibleTopologyHtmlRelationLabelCount =
                                Array.from(document.querySelectorAll("[data-relation-label-button]"))
                                  .filter((label) => {
                                    const style = getComputedStyle(label);
                                    const rect = label.getBoundingClientRect();
                                    const opacity = Number(style.opacity || "1");
                                    return (
                                      label.getAttribute("data-relation-label-visibility") === "visible-clear" &&
                                      style.display !== "none" &&
                                      style.visibility !== "hidden" &&
                                      opacity > 0 &&
                                      rect.width > 0 &&
                                      rect.height > 0
                                    );
                                  }).length;
                              const topologyFocusRelationLabelHit =
                                document.querySelector('button[data-relation-label-hit="true"]');
                              const topologyFocusRelationLabelVisibleText =
                                topologyFocusRelationLabelHit?.getAttribute("data-relation-label-visible-text") ||
                                "";
                              const topologyFocusRelationLabelTypeLabel =
                                topologyFocusRelationLabelHit?.getAttribute("data-relation-type-label") ||
                                "";
                              const topologyFocusRelationLabelCount =
                                Number(topologyFocusRelationLabelHit?.getAttribute("data-relation-label-count") || "0");
                              const topologyFocusRelationLabelVisibleCountPolicy =
                                topologyFocusRelationLabelHit?.getAttribute("data-relation-label-visible-count-policy") ||
                                "";
                              const topologyFocusClusterTypedConnectorCount =
                                (false) &&
                                (null)?.getAttribute("data-focus-relation-label-density-contract") === "click-focus-uses-ego-label-only"
                                  ? Array.from(document.querySelectorAll("[data-focus-cluster-connector]"))
                                    .filter((connector) => {
                                      const relationType = connector.getAttribute("data-relation-type") || "";
                                      return relationType.trim().length > 0;
                                    }).length
                                  : 0;
                              const topologyFocusClusterRelationLabelCount =
                                (false)
                                  ? (
                                    Number((null)?.getAttribute("data-focus-cluster-relation-label-count") || "0") ||
                                    visibleTopologyHtmlRelationLabelCount ||
                                    visibleTopologyConnectorRelationLabelCount ||
                                    topologyFocusClusterTypedConnectorCount ||
                                    document.querySelectorAll("[data-focus-relation-label]").length ||
                                    document.querySelectorAll("[data-drag-relation-label]").length
                                  )
                                  : 0;
                              const topologyFocusClusterConnectorMarkerCount =
                                document.querySelectorAll("[data-focus-cluster-connector]").length;
                              const topologyFocusClusterRelationLabelMarkerCount =
                                document.querySelectorAll("[data-focus-relation-label]").length ||
                                visibleTopologyHtmlRelationLabelCount ||
                                visibleTopologyConnectorRelationLabelCount ||
                                topologyFocusClusterTypedConnectorCount ||
                                Number((null)?.getAttribute("data-focus-cluster-relation-label-count") || "0");
                              const topologySelectedNodePopover = document.querySelector('[data-testid="topology-node-popover"]');
                              const topologySelectedNodeId =
                                topologySelectedNodePopover?.getAttribute("data-selected-node-id") ||
                                "";
                              const topologySelectedNodeKind =
                                topologySelectedNodePopover?.getAttribute("data-selected-node-kind") ||
                                "";
                              const topologySelectedNodeTitle =
                                topologySelectedNodePopover?.getAttribute("data-selected-node-title") ||
                                "";
                              const topologySelectedNodeSource =
                                topologySelectedNodePopover?.getAttribute("data-selected-node-source") ||
                                "";
                              const topologySelectedNodeSummary =
                                topologySelectedNodePopover?.getAttribute("data-selected-node-summary") ||
                                "";
                              const topologyNodePopoverSurfaceRole =
                                topologySelectedNodePopover?.getAttribute("data-surface-role") ||
                                "";
                              const topologyNodePopoverAttentionRole =
                                topologySelectedNodePopover?.getAttribute("data-attention-role") ||
                                "";
                              const topologyNodePopoverFocusPrimary =
                                topologySelectedNodePopover?.getAttribute("data-focus-primary") ||
                                "";
                              const topologyNodePopoverHierarchyContract =
                                topologySelectedNodePopover?.getAttribute("data-hierarchy-contract") ||
                                "";
                              const topologyNodePopoverAgentHandoffContract =
                                topologySelectedNodePopover?.getAttribute("data-node-popover-handoff-contract") ||
                                topologySelectedNodePopover?.getAttribute("data-agent-handoff-contract") ||
                                "";
                              const topologyNodePopoverAgentHandoffRoute =
                                topologySelectedNodePopover?.getAttribute("data-node-popover-handoff-route") ||
                                topologySelectedNodePopover?.getAttribute("data-agent-handoff-route") ||
                                "";
                              const topologyNodePopoverAgentHandoffPrimaryAction =
                                topologySelectedNodePopover?.getAttribute("data-node-popover-handoff-primary-action") ||
                                topologySelectedNodePopover?.getAttribute("data-agent-handoff-primary-action") ||
                                "";
                              const topologyNodePopoverAgentHandoffActionCount =
                                topologySelectedNodePopover?.getAttribute("data-node-popover-handoff-action-count") ||
                                topologySelectedNodePopover?.getAttribute("data-agent-handoff-action-count") ||
                                "";
                              const topologyNodePopoverRelationFactCount =
                                topologySelectedNodePopover?.getAttribute("data-relation-fact-count") || "";
                              const topologyNodePopoverRelationTypeCount =
                                topologySelectedNodePopover?.getAttribute("data-relation-type-count") || "";
                              const topologyNodePopoverAgentHandoffRelationFactCount =
                                topologySelectedNodePopover?.getAttribute("data-node-popover-handoff-relation-fact-count") ||
                                topologySelectedNodePopover?.getAttribute("data-agent-handoff-relation-fact-count") ||
                                "";
                              const topologyNodePopoverAgentHandoffRelationTypeCount =
                                topologySelectedNodePopover?.getAttribute("data-node-popover-handoff-relation-type-count") ||
                                topologySelectedNodePopover?.getAttribute("data-agent-handoff-relation-type-count") ||
                                "";
                              const topologyNodePopoverAgentHandoffSummaryContract =
                                topologySelectedNodePopover?.getAttribute("data-node-popover-handoff-summary-contract") ||
                                topologySelectedNodePopover?.getAttribute("data-agent-handoff-summary-contract") ||
                                "";
                              const topologyNodePopoverAgentHandoffVisibleSummary =
                                topologySelectedNodePopover?.getAttribute("data-node-popover-handoff-visible-summary") ||
                                topologySelectedNodePopover?.getAttribute("data-agent-handoff-visible-summary") ||
                                "";
                              const topologyNodePopoverAgentHandoffSelectedNode =
                                topologySelectedNodePopover?.getAttribute("data-node-popover-handoff-selected-node") ||
                                topologySelectedNodePopover?.getAttribute("data-agent-handoff-selected-node") ||
                                "";
                              const markerSummary = (element, attributeName) =>
                                element?.getAttribute(attributeName) ||
                                element?.getAttribute("aria-label") ||
                                element?.textContent ||
                                "";
                              const topologyTopWorkspaceButton = Array.from(document.querySelectorAll("button")).find(
                                (button) =>
                                  (button.getAttribute("aria-label") || "").includes("workspace") ||
                                  (button.getAttribute("aria-label") || "").includes("워크스페이스")
                              );
                              const topologyTopRelayoutButton = document.querySelector('[data-testid="topology-auto-arrange"]');
                              const topologyTopSearchButton = document.querySelector('[data-testid="topology-concept-search"]');
                              const topologySearchActionLane =
                                document.querySelector('[data-testid="topology-search-action-lane"]');
                              const topologySearchActionLaneRect =
                                topologySearchActionLane?.getBoundingClientRect();
                              const topologySearchActionLaneStyle = topologySearchActionLane
                                ? getComputedStyle(topologySearchActionLane)
                                : null;
                              const topologySigmaControlsStackStyle = (null)
                                ? getComputedStyle((null))
                                : null;
                              const topologyShortcutsHelpButton =
                                document.querySelector('[data-testid="topology-shortcuts-help-button"]');
                              const topologyShortcutsHelpButtonRect =
                                topologyShortcutsHelpButton?.getBoundingClientRect();
                              const topologyShortcutsHelpButtonStyle = topologyShortcutsHelpButton
                                ? getComputedStyle(topologyShortcutsHelpButton)
                                : null;
                              const topologyCommandChrome = document.querySelector('[data-testid="topology-command-chrome"]');
                              const topologyCommandChromeState =
                                topologyCommandChrome?.getAttribute("data-command-chrome-state") || "";
                              const topologyUtilityLaneSuppressionContract =
                                topologyCommandChrome?.getAttribute("data-utility-lane-suppression-contract") || "";
                              const topologyNodePopoverPositioner =
                                document.querySelector('[data-testid="topology-node-popover-positioner"]');
                              const topologyUtilityActionLane =
                                document.querySelector('[data-testid="topology-utility-action-lane"]');
                              const topologyUtilityActionLaneRect =
                                topologyUtilityActionLane?.getBoundingClientRect();
                              const topologyUtilityActionLaneStyle = topologyUtilityActionLane
                                ? getComputedStyle(topologyUtilityActionLane)
                                : null;
                              const topologyTopLeftChromeGroup = document.querySelector('[data-testid="topology-top-left-chrome-group"]');
                              const topologyTopLeftChromeGroupState =
                                topologyTopLeftChromeGroup?.getAttribute("data-workspace-context-state") || "";
                              const topologyTopLeftChromeGroupSupportContract =
                                topologyTopLeftChromeGroup?.getAttribute("data-selected-inspector-support-contract") || "";
                              const topologyTopLeftChromeGroupRect = topologyTopLeftChromeGroup?.getBoundingClientRect();
                              const topologyTopLeftChromeGroupStyle = topologyTopLeftChromeGroup
                                ? getComputedStyle(topologyTopLeftChromeGroup)
                                : null;
                              const topologyMapSurface = document.querySelector('[data-testid="topology-map-surface"]');
                              const topologyMapSurfaceStyle = topologyMapSurface
                                ? getComputedStyle(topologyMapSurface)
                                : null;
                              const topologyCreateNodePanel = document.querySelector('[data-testid="topology-create-node-panel"]');
                              const topologyCreateNodeBackdrop = document.querySelector('[data-testid="topology-create-node-backdrop"]');
                              const topologyCreateNodeTitleInput = topologyCreateNodePanel?.querySelector('[data-testid="create-node-title"]');
                              const topologyCreateNodeDomainInput = topologyCreateNodePanel?.querySelector('[data-testid="create-node-domain"]');
                              const topologyCreateNodeKindSelect = topologyCreateNodePanel?.querySelector('[data-testid="create-node-kind"]');
                              const topologyCreateNodeSubmit = topologyCreateNodePanel?.querySelector('[data-testid="create-node-submit"]');
                              const topologyCreateNodeActiveElement = document.activeElement;
                              const topologyCreateNodeActiveElementTestId =
                                topologyCreateNodeActiveElement?.getAttribute("data-testid") || "";
                              const topologyCreateNodeFocusInside =
                                Boolean(
                                  topologyCreateNodePanel &&
                                  topologyCreateNodeActiveElement &&
                                  topologyCreateNodePanel.contains(topologyCreateNodeActiveElement)
                                );
                              const topologyCreateNodePanelRect = topologyCreateNodePanel?.getBoundingClientRect();
                              const topologyCreateNodePanelStyle = topologyCreateNodePanel ? getComputedStyle(topologyCreateNodePanel) : null;
                              const topologyCreateNodeForm = topologyCreateNodePanel?.querySelector('[data-testid="create-node-form"]');
                              const topologyCreateNodeBackdropRect = topologyCreateNodeBackdrop?.getBoundingClientRect();
                              const topologyCreateNodeBackdropStyle = topologyCreateNodeBackdrop ? getComputedStyle(topologyCreateNodeBackdrop) : null;
                              const topologyCreateNodeBackdropVisible = Boolean(
                                topologyCreateNodeBackdropRect &&
                                topologyCreateNodeBackdropStyle &&
                                topologyCreateNodeBackdropStyle.display !== "none" &&
                                topologyCreateNodeBackdropStyle.visibility !== "hidden" &&
                                Number(topologyCreateNodeBackdropStyle.opacity || "1") > 0.01 &&
                                topologyCreateNodeBackdropRect.width > 0 &&
                                topologyCreateNodeBackdropRect.height > 0
                              );
                              /*
                               * ⚠️ 2026-08-11 — **뷰포트가 아니라 「막겠다고 선언한 것」을 덮는지 본다.**
                               * 이 덮개의 계약은 코드에 적혀 있다:
                               * `data-backdrop-contract="blocks-map-and-clears-create-intent"` — 즉 **지도**를
                               * 막고 레일은 살려 둔다(레일로 빠져나가면 만들기 의도가 지워진다). 그런데 이
                               * 검증은 뷰포트 전체를 요구해서, 실측 1448×900 덮개가 1512 뷰포트에 64px
                               * 모자라다는 이유로 **반드시 실패**했다. 레일 폭은 규격이고 결함이 아니다.
                               */
                              const topologyCreateNodeBackdropTargetRect = (
                                document.querySelector('[data-surface-role="map-canvas"]') ||
                                document.querySelector('[data-testid="topology-map-v2"]')
                              )?.getBoundingClientRect();
                              const topologyCreateNodeBackdropCoversViewport =
                                topologyCreateNodeBackdropVisible &&
                                (topologyCreateNodeBackdropTargetRect
                                  ? topologyCreateNodeBackdropRect.left <= topologyCreateNodeBackdropTargetRect.left + 1 &&
                                    topologyCreateNodeBackdropRect.top <= topologyCreateNodeBackdropTargetRect.top + 1 &&
                                    topologyCreateNodeBackdropRect.right >= topologyCreateNodeBackdropTargetRect.right - 1 &&
                                    topologyCreateNodeBackdropRect.bottom >= topologyCreateNodeBackdropTargetRect.bottom - 1
                                  : topologyCreateNodeBackdropRect.left <= 1 &&
                                    topologyCreateNodeBackdropRect.top <= 1 &&
                                    topologyCreateNodeBackdropRect.right >= innerWidth - 1 &&
                                    topologyCreateNodeBackdropRect.bottom >= innerHeight - 1);
                              const topologySelectedRelationQualityLensText =
                                markerSummary((null), "data-relation-quality-summary");
                              const topologyOverviewRelationQualityText =
                                markerSummary((null), "data-relation-quality-summary");
                              const topologyRelationQualityLensText =
                                topologySelectedRelationQualityLensText || topologyOverviewRelationQualityText;
                              const topologyOverviewAgentReadinessText =
                                markerSummary((null), "data-agent-readiness-summary");
                              const topologyOverviewAgentReadinessMeterSegments = (null)
                                ? Array.from((null).querySelectorAll("[data-agent-readiness-segment]")).map((segment) => ({
                                    kind: segment.getAttribute("data-agent-readiness-segment") || "",
                                    count: segment.getAttribute("data-count") || ""
                                  }))
                                : [];
                              const topologySelectedRelationHalos = Array.from(
                                document.querySelectorAll('[data-selected-relation-halo="true"]')
                              ).map((halo) => ({
                                tag: halo.tagName.toLowerCase(),
                                d: halo.getAttribute("d") || "",
                                opacity: Number(halo.getAttribute("opacity") || "1"),
                                computedOpacity: Number(getComputedStyle(halo).opacity || "1"),
                                quality: halo.getAttribute("data-relation-quality") || "",
                                connector: halo.getAttribute("data-connector") || "",
                                overviewFrom: halo.getAttribute("data-overview-connector-from") || "",
                                overviewTo: halo.getAttribute("data-overview-connector-to") || "",
                                axis: halo.getAttribute("data-connector-axis") || "",
                                clearance: halo.getAttribute("data-connector-clearance") || "",
                                selectedRelation: halo.getAttribute("data-selected-relation") || "",
                                className: halo.getAttribute("class") || "",
                                width: halo.getBoundingClientRect().width || 0,
                                height: halo.getBoundingClientRect().height || 0
                              }));
                              const topologySelectedRelationVisibleHalos = topologySelectedRelationHalos.filter(
                                (halo) =>
                                  (halo.d.length > 0 || (halo.width > 0 && halo.height > 0)) &&
                                  halo.opacity > 0.01 &&
                                  halo.computedOpacity > 0.01
                              );
                              const topologySelectedRelationHalo =
                                topologySelectedRelationVisibleHalos[0] || topologySelectedRelationHalos[0] || null;
                              const topologySelectedRelationLabelHit = document.querySelector('[data-relation-label-hit="true"][data-selected-relation="true"]');
                              const topologySelectedRelationLabelGeometryId =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-label-button") || "";
                              const topologySelectedRelationLabelQuality =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-quality") || "";
                              const topologySelectedRelationLabelEvidenceState =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-evidence-state") || "";
                              const topologySelectedRelationLabelEvidenceGlyph =
                                topologySelectedRelationLabelHit?.querySelector("[data-relation-evidence-glyph]")?.textContent || "";
                              const topologySelectedRelationLabelQualityChipText =
                                topologySelectedRelationLabelHit?.querySelector("[data-relation-quality-chip]")?.getAttribute("data-relation-quality-chip-text") ||
                                topologySelectedRelationLabelHit?.querySelector("[data-relation-quality-chip]")?.textContent || "";
                              const topologySelectedRelationLabelAgentGateKind =
                                topologySelectedRelationLabelHit?.getAttribute("data-agent-gate-kind") || "";
                              const topologySelectedRelationLabelPrimaryCopyAction =
                                topologySelectedRelationLabelHit?.getAttribute("data-primary-copy-action") || "";
                              const topologySelectedRelationLabelCliFallbackCommand =
                                topologySelectedRelationLabelHit?.getAttribute("data-cli-fallback-command") || "";
                              const topologySelectedRelationLabelAgentGateText =
                                topologySelectedRelationLabelHit?.querySelector("[data-relation-label-agent-gate]")?.getAttribute("data-route-chip-text") ||
                                topologySelectedRelationLabelHit?.querySelector("[data-relation-label-agent-gate]")?.textContent || "";
                              const topologySelectedRelationLabelFactRoute =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-fact-route") || "";
                              const topologySelectedRelationLabelFactRouteQuality =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-fact-route-quality") || "";
                              const topologySelectedRelationLabelFactRouteEvidence =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-fact-route-evidence") || "";
                              const topologySelectedRelationLabelFactRouteGate =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-fact-route-gate") || "";
                              const topologySelectedRelationLabelFactRouteAction =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-fact-route-action") || "";
                              const topologySelectedRelationLabelType =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-type") || "";
                              const topologySelectedRelationLabelSource =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-label-source") || "";
                              const topologySelectedRelationLabelTarget =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-label-target") || "";
                              const topologySelectedRelationLabelCount =
                                Number(topologySelectedRelationLabelHit?.getAttribute("data-relation-label-count") || "0");
                              const topologySelectedRelationLabelRoute =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-label-route") || "";
                              const topologySelectedRelationLabelTypeLabel =
                                topologySelectedRelationLabelHit?.getAttribute("data-relation-type-label") || "";
                              const topologySelectedRelationLabelFactRouteChips = Array.from(
                                topologySelectedRelationLabelHit?.querySelectorAll("[data-relation-fact-route-rail] [data-route-chip]") || []
                              ).map((chip) => ({
                                kind: chip.getAttribute("data-route-chip") || "",
                                text: chip.getAttribute("data-route-chip-text") || chip.textContent || ""
                              }));
                              const topologySelectedRelationLabelGeometry =
                                topologySelectedRelationLabelGeometryId
                                  ? document.querySelector(
                                      `[data-relation-label-bg="${CSS.escape(topologySelectedRelationLabelGeometryId)}"]`
                                    )
                                  : null;
                              const topologySelectedRelationLabelHitRect =
                                topologySelectedRelationLabelHit?.getBoundingClientRect();
                              const topologySelectedRelationLabelGeometryRect =
                                topologySelectedRelationLabelGeometry?.getBoundingClientRect();
                              const topologySelectedRelationLabelHitAligned =
                                Boolean(topologySelectedRelationLabelHitRect && topologySelectedRelationLabelGeometryRect) &&
                                Math.abs(
                                  (topologySelectedRelationLabelHitRect.left + topologySelectedRelationLabelHitRect.right) / 2 -
                                    (topologySelectedRelationLabelGeometryRect.left + topologySelectedRelationLabelGeometryRect.right) / 2
                                ) <= 1 &&
                                Math.abs(
                                  (topologySelectedRelationLabelHitRect.top + topologySelectedRelationLabelHitRect.bottom) / 2 -
                                    (topologySelectedRelationLabelGeometryRect.top + topologySelectedRelationLabelGeometryRect.bottom) / 2
                                ) <= 1 &&
                                topologySelectedRelationLabelHitRect.width >= topologySelectedRelationLabelGeometryRect.width &&
                                topologySelectedRelationLabelHitRect.height >= topologySelectedRelationLabelGeometryRect.height;
                              const topologySelectedRelationCardStyle = (null)
                                ? getComputedStyle((null))
                                : null;
                              const topologySelectedRelationCardSurfaceComputed =
                                topologySelectedRelationCardStyle?.backgroundColor || "";
                              const topologySelectedRelationCardBorderComputed =
                                topologySelectedRelationCardStyle?.borderTopColor || "";
                              const topologySelectedRelationActionMinWidthTokenValue =
                                topologySelectedRelationCardStyle?.getPropertyValue("--topology-selected-relation-action-min-width").trim() || "";
                              const topologySelectedRelationCopyPayloadMinHeightTokenValue =
                                topologySelectedRelationCardStyle?.getPropertyValue("--topology-selected-relation-copy-payload-min-height").trim() || "";
                              const topologySelectedRelationRouteStepMinWidthTokenValue =
                                topologySelectedRelationCardStyle?.getPropertyValue("--topology-selected-relation-route-step-min-width").trim() || "";
                              const topologySelectedRelationKickerFontSizeTokenValue =
                                topologySelectedRelationCardStyle?.getPropertyValue("--topology-selected-relation-kicker-font-size").trim() || "";
                              const topologySelectedRelationChipFontSizeTokenValue =
                                topologySelectedRelationCardStyle?.getPropertyValue("--topology-selected-relation-chip-font-size").trim() || "";
                              const topologySelectedRelationRouteLabelFontSizeTokenValue =
                                topologySelectedRelationCardStyle?.getPropertyValue("--topology-selected-relation-route-label-font-size").trim() || "";
                              const topologySelectedRelationRouteValueFontSizeTokenValue =
                                topologySelectedRelationCardStyle?.getPropertyValue("--topology-selected-relation-route-value-font-size").trim() || "";
                              const topologySelectedRelationPayloadFontSizeTokenValue =
                                topologySelectedRelationCardStyle?.getPropertyValue("--topology-selected-relation-payload-font-size").trim() || "";
                              const topologyCameraMotionState =
                                sigmaViewport?.getAttribute("data-camera-motion-state") || "";
                              const topologySelectedRelationCardMotionSyncState =
                                (null)
                                  ? topologyCameraMotionState === "settled"
                                    ? "settled-with-camera"
                                    : topologyCameraMotionState === "already-safe"
                                      ? "settled-with-camera"
                                    : topologyCameraMotionState === "animating"
                                      ? "co-present-with-camera-motion"
                                      : topologyCameraMotionState === "reduced-motion"
                                        ? "reduced-motion-ready"
                                        : "camera-state-unknown"
                                  : "";
                              const topologySelectedRelationAgentRouteSteps = (null)
                                ? Array.from((null).querySelectorAll("[data-route-step]")).map((step) => {
                                    const rect = step.getBoundingClientRect();
                                    const label = step.querySelector("[data-route-step-label-text]");
                                    const value = step.querySelector("[data-route-step-value-text]");
                                    return {
                                      kind: step.getAttribute("data-route-step") || "",
                                      label: step.getAttribute("data-route-step-label") || "",
                                      value: step.getAttribute("data-route-step-value") || "",
                                      labelFontSize: label ? getComputedStyle(label).fontSize : "",
                                      valueFontSize: value ? getComputedStyle(value).fontSize : "",
                                      left: rect.left,
                                      top: rect.top,
                                      right: rect.right,
                                      bottom: rect.bottom,
                                      width: rect.width,
                                      height: rect.height
                                    };
                                  })
                                : [];
                              const topologySelectedRelationPrimaryCopyAction = document.querySelector('[data-relation-copy-priority="primary"]');
                              const topologySelectedRelationPrimaryCopyActionKind =
                                topologySelectedRelationPrimaryCopyAction?.getAttribute("data-relation-copy-action") ||
                                "";
                              const topologySelectedRelationPrimaryCopyActionCall =
                                topologySelectedRelationPrimaryCopyAction?.getAttribute("data-relation-copy-payload-call") ||
                                "";
                              const topologySelectedRelationPrimaryCopyActionTitle =
                                topologySelectedRelationPrimaryCopyAction?.getAttribute("title") ||
                                "";
                              const topologySelectedRelationPrimaryCopyActionRect =
                                topologySelectedRelationPrimaryCopyAction?.getBoundingClientRect();
                              const topologySelectedRelationPrimaryCopyRecommendationLabel =
                                topologySelectedRelationPrimaryCopyAction?.getAttribute("data-copy-recommendation-label") ||
                                "";
                              const topologySelectedRelationCopyActions = Array.from(
                                document.querySelectorAll("[data-relation-copy-action]")
                              ).map((action) => {
                                const rect = action.getBoundingClientRect();
                                return {
                                  kind: action.getAttribute("data-relation-copy-action") || "",
                                  priority: action.getAttribute("data-relation-copy-priority") || "",
                                  recommended: action.getAttribute("data-copy-recommended") === "true",
                                  recommendationLabel:
                                    action.getAttribute("data-copy-recommendation-label") || "",
                                  call: action.getAttribute("data-relation-copy-payload-call") || "",
                                  title: action.getAttribute("title") || "",
                                  text: action.textContent || "",
                                  width: rect.width,
                                  height: rect.height
                                };
                              });
                              const topologySelectedRelationEndpointCards = Array.from(
                                document.querySelectorAll('[data-skeleton-card][data-selected-relation-endpoint="true"]')
                              ).map((card) => {
                                const style = getComputedStyle(card);
                                const rect = card.getBoundingClientRect();
                                const opacity = Number(style.opacity || "1");
                                const surfaceHidden = card.getAttribute("data-surface-hidden") || "";
                                const roleBadge = card.querySelector("[data-selected-relation-endpoint-role-badge]");
                                return {
                                  slug: card.getAttribute("data-slug") || "",
                                  role: card.getAttribute("data-selected-relation-endpoint-role") || "",
                                  roleBadgeText:
                                    roleBadge?.getAttribute("data-selected-relation-endpoint-role-badge-text") ||
                                    roleBadge?.textContent ||
                                    "",
                                  roleBadgeContract:
                                    roleBadge?.getAttribute("data-selected-relation-endpoint-role-badge-contract") || "",
                                  roleBadgeVisible:
                                    roleBadge !== null &&
                                    roleBadge.textContent.trim().length > 0,
                                  surfaceHidden,
                                  display: style.display,
                                  visibility: style.visibility,
                                  opacity,
                                  inlineOpacity: card.style.opacity || "",
                                  className: card.getAttribute("class") || "",
                                  shift: card.getAttribute("data-selected-relation-endpoint-surface-shift") || "",
                                  visible:
                                    surfaceHidden !== "true" &&
                                    style.display !== "none" &&
                                    style.visibility !== "hidden" &&
                                    Number.isFinite(opacity) &&
                                    opacity > 0.01 &&
                                    rect.width > 0 &&
                                    rect.height > 0,
                                  left: rect.left,
                                  top: rect.top,
                                  right: rect.right,
                                  bottom: rect.bottom,
                                  width: rect.width,
                                  height: rect.height
                                };
                              });
                              const topologySelectedRelationEndpointVisibleCount =
                                topologySelectedRelationEndpointCards.filter((card) => card.visible).length;
                              const topologySelectedRelationEndpointHiddenCount =
                                topologySelectedRelationEndpointCards.filter((card) => !card.visible).length;
                              const topologyAnalysisPanelStyle = (null)
                                ? getComputedStyle((null))
                                : null;
                              const topologyHealthRepairAuditCard =
                                document.querySelector('[data-health-repair-audit-target="true"]');
                              const topologyPathStartPromptStyle = (null)
                                ? getComputedStyle((null))
                                : null;
                              const topologyPathAnchorPromptStyle = (null)
                                ? getComputedStyle((null))
                                : null;
                              const topologyPathResultBannerStyle = (null)
                                ? getComputedStyle((null))
                                : null;
                              const topologyPathResultRelationChips = (null)
                                ? Array.from((null).querySelectorAll("[data-path-result-relation-chip]")).map((chip) => {
                                    const rect = chip.getBoundingClientRect();
                                    return {
                                      relation: chip.getAttribute("data-path-result-relation-chip") || "",
                                      text: chip.textContent?.trim() || "",
                                      width: rect.width,
                                      height: rect.height
                                    };
                                  })
                                : [];
                              const topologyPathResultActions = (null)
                                ? Array.from((null).querySelectorAll("[data-path-result-action]")).map((action) => {
                                    const rect = action.getBoundingClientRect();
                                    const style = getComputedStyle(action);
                                    const disclosure = action.closest("[data-path-result-secondary-checks]");
                                    return {
                                      kind: action.getAttribute("data-path-result-action") || "",
                                      tier: action.getAttribute("data-action-tier") || "",
                                      disclosureOwner: action.getAttribute("data-disclosure-owner") || "",
                                      visible:
                                        style.display !== "none" &&
                                        style.visibility !== "hidden" &&
                                        Number(style.opacity || "1") > 0.01 &&
                                        rect.width > 0 &&
                                        rect.height > 0,
                                      disclosureOpen: disclosure?.getAttribute("open") !== null,
                                      text: action.textContent?.trim() || "",
                                      width: rect.width,
                                      height: rect.height
                                    };
                                  })
                                : [];
                              const topologyPathResultEndpoints = (null)
                                ? Array.from((null).querySelectorAll("[data-path-result-endpoint]")).map((endpoint) => {
                                    const rect = endpoint.getBoundingClientRect();
                                    return {
                                      kind: endpoint.getAttribute("data-path-result-endpoint") || "",
                                      node: endpoint.getAttribute("data-path-result-node") || "",
                                      text: endpoint.textContent?.trim() || "",
                                      width: rect.width,
                                      height: rect.height
                                    };
                                  })
                                : [];
                              const topologyPathStartPromptVisible =
                                Boolean(
                                  (undefined) &&
                                  topologyPathStartPromptStyle &&
                                  topologyPathStartPromptStyle.display !== "none" &&
                                  topologyPathStartPromptStyle.visibility !== "hidden" &&
                                  Number(topologyPathStartPromptStyle.opacity || "1") > 0.01 &&
                                  (undefined).width > 0 &&
                                  (undefined).height > 0
                                );
                              const topologyPathAnchorPromptVisible =
                                Boolean(
                                  (undefined) &&
                                  topologyPathAnchorPromptStyle &&
                                  topologyPathAnchorPromptStyle.display !== "none" &&
                                  topologyPathAnchorPromptStyle.visibility !== "hidden" &&
                                  Number(topologyPathAnchorPromptStyle.opacity || "1") > 0.01 &&
                                  (undefined).width > 0 &&
                                  (undefined).height > 0
                                );
                              const topologyVisiblePathPromptRect = topologyPathAnchorPromptVisible
                                ? (undefined)
                                : topologyPathStartPromptVisible
                                  ? (undefined)
                                  : null;
                              const topologyPathPromptPanelClearancePx =
                                topologyVisiblePathPromptRect && (undefined)
                                  ? Math.round(topologyVisiblePathPromptRect.left - (undefined).right)
                                  : 0;
                              const topologyPathPromptViewportRightClearancePx =
                                topologyVisiblePathPromptRect
                                  ? Math.round(window.innerWidth - topologyVisiblePathPromptRect.right)
                                  : 0;
                              const topologyPathPromptClearanceContract =
                                topologyVisiblePathPromptRect
                                  ? "analysis-rail-clear-24"
                                  : "";
                              const topologyPathResultBannerVisibleForPromptPolicy =
                                Boolean(
                                  (undefined) &&
                                  topologyPathResultBannerStyle &&
                                  topologyPathResultBannerStyle.display !== "none" &&
                                  topologyPathResultBannerStyle.visibility !== "hidden" &&
                                  Number(topologyPathResultBannerStyle.opacity || "1") > 0.01 &&
                                  (undefined).width > 0 &&
                                  (undefined).height > 0
                                );
                              const topologyPathPromptSuppressionContract =
                                !topologyVisiblePathPromptRect &&
                                !topologyPathResultBannerVisibleForPromptPolicy &&
                                sigmaViewport?.getAttribute("data-skeleton-cards-active") === "true" &&
                                (null)?.getAttribute("data-path-prompt-policy") === "panel-owned-when-card-mode" &&
                                (null)
                                  ? "analysis-rail-owns-path-start"
                                  : topologyVisiblePathPromptRect
                                    ? "prompt-visible"
                                    : "";
                              const topologyFocusCommandSpineStyle = (null)
                                ? getComputedStyle((null))
                                : null;
                              const topologyFocusPrimaryActionStyle = (null)
                                ? getComputedStyle((null))
                                : null;
                              const topologyNodePopover = document.querySelector('[data-testid="topology-node-popover"]');
                              const topologyNodePopoverStyle = topologyNodePopover
                                ? getComputedStyle(topologyNodePopover)
                                : null;
                              const topologyNodePopoverRect = topologyNodePopover?.getBoundingClientRect();
                              const topologyNodePopoverBodyStyle = (undefined)
                                ? getComputedStyle((undefined))
                                : null;
                              const topologyMinimapStyle = (null)
                                ? getComputedStyle((null))
                                : null;
                              const topologyKindLegendStyle = (null)
                                ? getComputedStyle((null))
                                : null;
                              const topologyKindLegendVisible =
                                Boolean(
                                  (undefined) &&
                                  topologyKindLegendStyle &&
                                  topologyKindLegendStyle.display !== "none" &&
                                  topologyKindLegendStyle.visibility !== "hidden" &&
                                  Number(topologyKindLegendStyle.opacity || "1") > 0.01 &&
                                  (undefined).width > 0 &&
                                  (undefined).height > 0
                                );
                              const topologyAuditLegendStyle = (null)
                                ? getComputedStyle((null))
                                : null;
                              const topologyAuditLegendVisible =
                                Boolean(
                                  (undefined) &&
                                  topologyAuditLegendStyle &&
                                  topologyAuditLegendStyle.display !== "none" &&
                                  topologyAuditLegendStyle.visibility !== "hidden" &&
                                  Number(topologyAuditLegendStyle.opacity || "1") > 0.01 &&
                                  (undefined).width > 0 &&
                                  (undefined).height > 0
                                );
                              const topologyMinimapVisible =
                                Boolean(
                                  (undefined) &&
                                  topologyMinimapStyle &&
                                  topologyMinimapStyle.display !== "none" &&
                                  topologyMinimapStyle.visibility !== "hidden" &&
                                  Number(topologyMinimapStyle.opacity || "1") > 0.01 &&
                                  (undefined).width > 0 &&
                                  (undefined).height > 0
                                );
                              const topologyAuditLegendOverlapsAnalysisPanel =
                                Boolean(
                                  topologyAuditLegendVisible &&
                                  (undefined) &&
                                  (undefined) &&
                                  (undefined).left < (undefined).right + 12 &&
                                  (undefined).right > (undefined).left - 12 &&
                                  (undefined).top < (undefined).bottom + 12 &&
                                  (undefined).bottom > (undefined).top - 12
                                );
                              const topologyAuditLegendOverlapsMinimap =
                                Boolean(
                                  topologyAuditLegendVisible &&
                                  topologyMinimapVisible &&
                                  (undefined) &&
                                  (undefined) &&
                                  (undefined).left < (undefined).right + 12 &&
                                  (undefined).right > (undefined).left - 12 &&
                                  (undefined).top < (undefined).bottom + 12 &&
                                  (undefined).bottom > (undefined).top - 12
                                );
                              const topologyNodePopoverRelationRow =
                                topologyNodePopover?.querySelector("[data-relation-row]");
                              const topologyNodePopoverRelationRowRect =
                                topologyNodePopoverRelationRow?.getBoundingClientRect();
                              const topologyNodePopoverFooterStyle = (undefined)
                                ? getComputedStyle((undefined))
                                : null;
                              const topologyNodePopoverVisibleRelationRowHeight =
                                topologyNodePopoverRelationRowRect && (undefined)
                                  ? Math.max(
                                      0,
                                      Math.min(
                                        topologyNodePopoverRelationRowRect.bottom,
                                        (undefined).bottom
                                      ) -
                                        Math.max(
                                          topologyNodePopoverRelationRowRect.top,
                                          (undefined).top
                                        )
                                    )
                                  : 0;
                              const topologyNodePopoverCompactBriefActionStyle = (undefined)
                                ? getComputedStyle((undefined))
                                : null;
                              const topologyNodePopoverCompactMeaningStyle = (undefined)
                                ? getComputedStyle((undefined))
                                : null;
                              const topologyNodePopoverRelationGate =
                                topologyNodePopoverRelationRow?.querySelector("[data-relation-row-agent-gate]");
                              const topologyNodePopoverRelationEvidenceGlyph =
                                topologyNodePopoverRelationRow?.querySelector("[data-relation-evidence-glyph]");
                              const topologyNodePopoverRelationTitle =
                                topologyNodePopoverRelationRow?.querySelector("[data-relation-title]");
                              const topologyNodePopoverRelationRouteRail =
                                topologyNodePopoverRelationRow?.querySelector("[data-relation-route]");
                              const topologyNodePopoverRelationRouteRailRect =
                                topologyNodePopoverRelationRouteRail?.getBoundingClientRect();
                              const topologyNodePopoverRelationPayloadChip =
                                topologyNodePopoverRelationRow?.querySelector("[data-relation-route-chip=\"payload\"]");
                              const topologyNodePopoverRelationPayloadChipRect =
                                topologyNodePopoverRelationPayloadChip?.getBoundingClientRect();
                              const topologyNodePopoverRelationFactRouteChips = Array.from(
                                topologyNodePopoverRelationRow?.querySelectorAll("[data-relation-route-chip]") || []
                              ).map((chip) => ({
                                kind: chip.getAttribute("data-relation-route-chip") || "",
                                text: chip.textContent || ""
                              }));
                              const topologyNodePopoverRelationEndpointChips = Array.from(
                                topologyNodePopoverRelationRow?.querySelectorAll("[data-relation-endpoint-chip]") || []
                              ).map((chip) => ({
                                kind: chip.getAttribute("data-relation-endpoint-chip") || "",
                                text: chip.textContent || ""
                              }));
                              const topologyNodePopoverAgentReadinessLens =
                                topologyNodePopover?.querySelector("[data-testid=\"topology-node-agent-readiness-lens\"]");
                              const topologyNodePopoverAgentReadinessText =
                                topologyNodePopoverAgentReadinessLens?.getAttribute("data-agent-readiness-summary") ||
                                topologyNodePopoverAgentReadinessLens?.getAttribute("aria-label") ||
                                topologyNodePopoverAgentReadinessLens?.textContent ||
                                "";
                              const topologyNodePopoverMapContextNote =
                                topologyNodePopover?.querySelector("[data-testid=\"topology-map-context-note\"]");
                              const topologyNodePopoverAgentReadinessChips =
                                topologyNodePopoverAgentReadinessLens
                                  ? Array.from(
                                      topologyNodePopoverAgentReadinessLens.querySelectorAll("[data-agent-readiness-chip]")
                                    ).map((chip) => ({
                                      kind: chip.getAttribute("data-agent-readiness-chip") || "",
                                      count: chip.getAttribute("data-count") || "",
                                      text: chip.textContent || ""
                                    }))
                                  : [];
                              const fixedTopologySurfaces = Array.from(document.querySelectorAll(
                                '[data-testid="topology-node-popover"]'
                              )).map((surface) => {
                                const style = getComputedStyle(surface);
                                const rect = surface.getBoundingClientRect();
                                const name = surface.getAttribute("data-testid") || surface.tagName.toLowerCase();
                                const mountedBlockingSurface =
                                  name === "topology-node-popover";
                                return {
                                  name,
                                  visible:
                                    style.display !== "none" &&
                                    style.visibility !== "hidden" &&
                                    (Number(style.opacity || "1") > 0.01 || mountedBlockingSurface) &&
                                    rect.width > 0 &&
                                    rect.height > 0,
                                  left: rect.left,
                                  top: rect.top,
                                  right: rect.right,
                                  bottom: rect.bottom
                                };
                              }).filter((surface) => surface.visible);
                              const topologyFixedSurfaceNames = fixedTopologySurfaces.map(
                                (surface) => surface.name
                              );
                              const topologyTransientSurfaceNames = fixedTopologySurfaces
                                .map((surface) => surface.name)
                                .filter((name) => name === "topology-node-popover");
                              const topologyTransientSurfaceCount = topologyTransientSurfaceNames.length;
                              const topologyTransientSurfaceContract =
                                topologyCreateNodePanel
                                  ? "blocking-surface-wins"
                                  : topologyTransientSurfaceCount <= 1
                                      ? "single-transient"
                                    : "review-stack";
                              const topologyInteractiveOverlays = Array.from(document.querySelectorAll("[data-interactive-overlay]"))
                                .map((overlay) => {
                                  const style = getComputedStyle(overlay);
                                  const rect = overlay.getBoundingClientRect();
                                  return {
                                    testId: overlay.getAttribute("data-testid") || "",
                                    role: overlay.getAttribute("role") || "",
                                    visible:
                                      style.display !== "none" &&
                                      style.visibility !== "hidden" &&
                                      Number(style.opacity || "1") > 0.01 &&
                                      rect.width > 0 &&
                                      rect.height > 0
                                  };
                                })
                                .filter((overlay) => overlay.visible);
                              const topologyInteractiveOverlayNames = topologyInteractiveOverlays
                                .map((overlay) => overlay.testId || overlay.role || "interactive-overlay");
                              const topologyBlockingComposerOverlayContract =
                                topologyCreateNodePanel
                                  ? topologyInteractiveOverlayNames.length === 1 &&
                                    topologyInteractiveOverlayNames[0] === "topology-create-node-backdrop"
                                    ? "exclusive-blocking-composer"
                                    : "stacked-interactive-overlays"
                                  : topologyInteractiveOverlayNames.length <= 1
                                    ? "single-interactive-overlay"
                                    : "stacked-interactive-overlays";
                              let topologyFixedSurfaceOverlapCount = 0;
                              const topologyFixedSurfaceOverlapSample = [];
                              for (let i = 0; i < fixedTopologySurfaces.length; i += 1) {
                                const a = fixedTopologySurfaces[i];
                                for (let j = i + 1; j < fixedTopologySurfaces.length; j += 1) {
                                  const b = fixedTopologySurfaces[j];
                                  if (
                                    a.left < b.right + (8) &&
                                    a.right > b.left - (8) &&
                                    a.top < b.bottom + (8) &&
                                    a.bottom > b.top - (8)
                                  ) {
                                    topologyFixedSurfaceOverlapCount += 1;
                                    if (topologyFixedSurfaceOverlapSample.length < 5) {
                                      topologyFixedSurfaceOverlapSample.push([a.name, b.name]);
                                    }
                                  }
                                }
                              }
                              const topologyCards = Array.from(document.querySelectorAll("[data-skeleton-card]"))
                                .map((card) => {
                                  const style = getComputedStyle(card);
                                  const rect = card.getBoundingClientRect();
                                  return {
                                    slug: card.getAttribute("data-slug") || "",
                                    pathRole: card.getAttribute("data-path-role") || "",
                                    pathRoleContract: card.getAttribute("data-path-role-contract") || "",
                                    pathAttentionLayer: card.getAttribute("data-path-attention-layer") || "",
                                    pathNextAction: card.getAttribute("data-path-next-action") || "",
                                    pathAnchor: card.getAttribute("data-path-anchor") || "",
                                    pathBadgeLabel:
                                      card.getAttribute("data-path-badge-label") ||
                                      card.querySelector("[data-path-card-badge]")?.getAttribute("data-path-card-badge-label") ||
                                      card.querySelector("[data-path-card-badge]")?.textContent?.trim() ||
                                      "",
                                    pathWorkflow: card.getAttribute("data-path-workflow") || "",
                                    tier: Number(card.getAttribute("data-tier") || "3"),
                                    dimmed: card.getAttribute("data-dimmed") === "true",
                                    dimOpacityRole: card.getAttribute("data-dim-opacity-role") || "",
                                    selectedRelationEndpoint:
                                      card.getAttribute("data-selected-relation-endpoint") === "true",
                                    visible:
                                      style.display !== "none" &&
                                      style.visibility !== "hidden" &&
                                      Number(style.opacity || "1") > 0.01 &&
                                      rect.width > 0 &&
                                      rect.height > 0,
                                    left: rect.left,
                                    top: rect.top,
                                    right: rect.right,
                                    bottom: rect.bottom,
                                    width: rect.width,
                                    height: rect.height
                                  };
                                })
                                .filter((card) => card.visible);
                              const topologySelectedRelationLowerPriorityVisibleDimmedCount =
                                topologyCards.filter(
                                  (card) =>
                                    card.dimmed &&
                                    !card.selectedRelationEndpoint &&
                                    card.tier > 1
                                ).length;
                              const topologySelectedRelationVisibleOrientationAnchorCount =
                                topologyCards.filter(
                                  (card) =>
                                    card.dimmed &&
                                    !card.selectedRelationEndpoint &&
                                    card.tier <= 1
                                ).length;
                              const topologySelectedRelationHiddenContextCards = Array.from(
                                document.querySelectorAll('[data-skeleton-card][data-dim-opacity-role="suppressed-selected-relation-context"]')
                              ).map((card) => {
                                const style = getComputedStyle(card);
                                return {
                                  contract:
                                    card.getAttribute("data-selected-relation-hidden-interaction-contract") || "",
                                  ariaHidden: card.getAttribute("aria-hidden") || "",
                                  tabIndex: card.getAttribute("tabindex") || "",
                                  pointerEvents: style.pointerEvents,
                                  visibility: style.visibility
                                };
                              });
                              const topologySelectedRelationHiddenContextInteractionContract =
                                topologySelectedRelationHiddenContextCards[0]?.contract || "";
                              const topologySelectedRelationHiddenContextInteractiveCount =
                                topologySelectedRelationHiddenContextCards.filter(
                                  (card) =>
                                    card.contract !== "hidden-context-is-not-pointer-focus-or-a11y-target" ||
                                    card.ariaHidden !== "true" ||
                                    card.tabIndex !== "-1" ||
                                    card.pointerEvents !== "none" ||
                                    card.visibility !== "hidden"
                                ).length;
                              const topologyRawCards = Array.from(document.querySelectorAll("[data-skeleton-card]"))
                                .slice(0, 5)
                                .map((card) => {
                                  const style = getComputedStyle(card);
                                  const rect = card.getBoundingClientRect();
                                  return {
                                    slug: card.getAttribute("data-slug") || "",
                                    opacity: style.opacity,
                                    display: style.display,
                                    visibility: style.visibility,
                                    left: rect.left,
                                    top: rect.top,
                                    width: rect.width,
                                    height: rect.height,
                                    transform: style.transform,
                                    surfaceHidden: card.getAttribute("data-surface-hidden") || "",
                                    pathRole: card.getAttribute("data-path-role") || "",
                                    pathRoleContract: card.getAttribute("data-path-role-contract") || "",
                                    pathAttentionLayer: card.getAttribute("data-path-attention-layer") || "",
                                    pathNextAction: card.getAttribute("data-path-next-action") || "",
                                    pathAnchor: card.getAttribute("data-path-anchor") || "",
                                    pathBadgeLabel:
                                      card.getAttribute("data-path-badge-label") ||
                                      card.querySelector("[data-path-card-badge]")?.getAttribute("data-path-card-badge-label") ||
                                      card.querySelector("[data-path-card-badge]")?.textContent?.trim() ||
                                      "",
                                    pathWorkflow: card.getAttribute("data-path-workflow") || "",
                                  };
                                });
                              const topologyDimmedCards = Array.from(
                                document.querySelectorAll('[data-skeleton-card][data-dimmed="true"]')
                              )
                                .map((card) => {
                                  const style = getComputedStyle(card);
                                  const rect = card.getBoundingClientRect();
                                  const opacity = Number(style.opacity || "1");
                                  return {
                                    tier: Number(card.getAttribute("data-tier") || "3"),
                                    opacity,
                                    visible:
                                      card.getAttribute("data-surface-hidden") !== "true" &&
                                      style.display !== "none" &&
                                      style.visibility !== "hidden" &&
                                      Number.isFinite(opacity) &&
                                      opacity > 0.01 &&
                                      rect.width > 0 &&
                                      rect.height > 0
                                  };
                                })
                                .filter((card) => card.visible);
                              const topologyDimAnchorCards = topologyDimmedCards.filter(
                                (card) => card.tier <= 1
                              );
                              const topologyDimChipCards = topologyDimmedCards.filter(
                                (card) => card.tier > 1
                              );
                              const topologyMinOpacity = (cards) =>
                                cards.length
                                  ? Math.min(...cards.map((card) => card.opacity))
                                  : 0;
                              const topologyPathCandidateCards = topologyCards.filter((card) => card.pathRole === "candidate");
                              const topologyPathSourceCards = topologyCards.filter((card) => card.pathRole === "source");
                              const topologyPathTargetCards = topologyCards.filter((card) => card.pathRole === "target");
                              const topologyPathCandidateCardCount = topologyPathCandidateCards.length;
                              const topologyPathSourceCardCount = topologyPathSourceCards.length;
                              const topologyPathTargetCardCount = topologyPathTargetCards.length;
                              const topologyPathSourceCard = topologyPathSourceCards[0] || null;
                              const topologyPathTargetCard = topologyPathTargetCards[0] || null;
                              let topologyCardOverlapCount = 0;
                              let topologyCardClippedCount = 0;
                              let topologyCardFixedSurfaceOverlapCount = 0;
                              const topologyCardOverlapSample = [];
                              const topologyCardFixedSurfaceOverlapSample = [];
                              for (let i = 0; i < topologyCards.length; i += 1) {
                                const card = topologyCards[i];
                                if (
                                  card.left < 0 ||
                                  card.top < 0 ||
                                  card.right > innerWidth ||
                                  card.bottom > innerHeight
                                ) {
                                  topologyCardClippedCount += 1;
                                }
                                for (const surface of fixedTopologySurfaces) {
                                  if (
                                    card.left < surface.right + (8) &&
                                    card.right > surface.left - (8) &&
                                    card.top < surface.bottom + (8) &&
                                    card.bottom > surface.top - (8)
                                  ) {
                                    topologyCardFixedSurfaceOverlapCount += 1;
                                    if (topologyCardFixedSurfaceOverlapSample.length < 5) {
                                      topologyCardFixedSurfaceOverlapSample.push(card.slug);
                                    }
                                    break;
                                  }
                                }
                                for (let j = i + 1; j < topologyCards.length; j += 1) {
                                  const a = topologyCards[i];
                                  const b = topologyCards[j];
                                  if (
                                    a.left < b.right - (2) &&
                                    a.right > b.left + (2) &&
                                    a.top < b.bottom - (2) &&
                                    a.bottom > b.top + (2)
                                  ) {
                                    topologyCardOverlapCount += 1;
                                    if (topologyCardOverlapSample.length < 5) {
                                      topologyCardOverlapSample.push([a.slug, b.slug]);
                                    }
                                  }
                                }
                              }
                              const topologyAttentionWinner = topologyCreateNodePanel
                                ? "blocking-composer"
                                : new URLSearchParams(location.search).get("mode") === "path"
                                  ? "focus-path-state"
                                  : (null)
                                    ? "active-relation-inspector"
                                  : topologySelectedNodePopover || topologyV2DetailPanel
                                    ? "focus-state"
                                    : "map-layer";
                              return JSON.stringify({
                                href: location.href,
                                title: document.title,
                                bodyText: bodyText.slice(0, 240),
                                bodyChildren: document.body ? document.body.children.length : null,
                                readyState: document.readyState,
                                bg: getComputedStyle(document.body).backgroundColor,
                                color: getComputedStyle(document.body).color,
                                width: innerWidth,
                                height: innerHeight,
                                markers: {
                                  aiSettingsVerification,
                                  appUpdateVerification,
                                  acpInstallVerification,
                                  appUpdateVerification,
                                  acpInstallVerification,
                                  aiSettingsSheetOpen: aiSettingsVisible(aiSettingsPopover),
                                  aiSettingsAiViewOpen: aiSettingsVisible(aiSettingsAiView),
                                  aiSettingsBaseUrlValue: aiSettingsUrlInput?.value || "",
                                  aiSettingsVerifiedVisible: aiSettingsVisible(aiSettingsVerifiedLine),
                                  aiSettingsFailureText: (aiSettingsFailureLine?.textContent || "").trim(),
                                  aiSettingsConnectedVisible: aiSettingsVisible(aiSettingsConnectedLine),
                                  aiSettingsConnectedText: (aiSettingsConnectedLine?.textContent || "").trim(),
                                  aiSettingsAuditRowCount:
                                    document.querySelectorAll('[data-testid="ai-audit-row"]').length,
                                  verificationFixtureVault:
                                    window.localStorage.getItem("ontology-atlas:verify-fixture-vault") || "",
                                  verificationFixtureVaultError:
                                    window.__ontologyAtlasVerifyFixtureVaultError || "",
                                  ontologyNav: links.some((link) => link.href.includes("/ontology") || /온톨로지|Ontology/.test(link.text)),
                                  sourceVaultNav: links.some((link) => link.href.includes("/docs") || /저장소|문서함|Source Vault|Documents/.test(link.text)),
                                  agentBriefCopy: buttons.some((text) => /브리핑 복사|Copy brief/.test(text)) && /agent_brief/.test(bodyText),
                                  insightsMaintenanceBoard: Boolean(insightsMaintenanceBoard),
                                  insightsQuestionModel:
                                    insightsMaintenanceBoard?.getAttribute("data-insights-question-model") || "",
                                  insightsTabCount: insightsQuestionTabs.length,
                                  insightsSelectedTabCount: insightsSelectedTabs.length,
                                  insightsSelectedPanelVisible,
                                  insightsHandoff: Boolean(
                                    insightsMaintenanceBoard?.querySelector(
                                      '[data-insights-handoff="tab-query"]'
                                    )
                                  ),
                                  topologyRelief:
                                    location.pathname.includes("/topology") &&
                                    /Relief|Ontology relief map|concept cards|온톨로지 지형도|대표 카드|카드 골격|후보 \d+\/\d+개 표시|개념 \d+개 · 관계 \d+개|CONCEPTS/.test(bodyText),
                                  topologyAttentionWinner,
                                  topologySigmaViewportVisible: Boolean(
                                    sigmaViewportRect &&
                                    sigmaViewportStyle &&
                                    sigmaViewportStyle.display !== "none" &&
                                    sigmaViewportStyle.visibility !== "hidden" &&
                                    sigmaViewportRect.width > 0 &&
                                    sigmaViewportRect.height > 0
                                  ),
                                  topologySigmaReady:
                                    sigmaViewport?.getAttribute("data-sigma-ready") === "true",
                                  topologySigmaBootError:
                                    sigmaViewport?.getAttribute("data-sigma-boot-error") === "true",
                                  topologySkeletonMode:
                                    sigmaViewport?.getAttribute("data-skeleton-mode") === "true",
                                  topologySkeletonCardsActive:
                                    sigmaViewport?.getAttribute("data-skeleton-cards-active") === "true",
                                  topologySkeletonCardModelCount:
                                    Number(sigmaViewport?.getAttribute("data-skeleton-card-model-count") || "0"),
                                  topologyCameraDepthContract:
                                    sigmaViewport?.getAttribute("data-camera-depth-contract") || "",
                                  topologyCameraMinRatio:
                                    Number(sigmaViewport?.getAttribute("data-camera-min-ratio") || "0"),
                                  topologyCameraMaxRatio:
                                    Number(sigmaViewport?.getAttribute("data-camera-max-ratio") || "0"),
                                  topologyLayoutWorkerFrameStatsContract:
                                    sigmaViewport?.getAttribute("data-layout-worker-frame-stats-contract") || "",
                                  topologyLayoutWorkerPositionFrameReceivedCount:
                                    Number(sigmaViewport?.getAttribute("data-layout-worker-position-frame-received-count") || "0"),
                                  topologyLayoutWorkerPositionFrameAppliedCount:
                                    Number(sigmaViewport?.getAttribute("data-layout-worker-position-frame-applied-count") || "0"),
                                  topologyLayoutWorkerPositionFrameSkippedCount:
                                    Number(sigmaViewport?.getAttribute("data-layout-worker-position-frame-skipped-count") || "0"),
                                  topologyLayoutWorkerPositionFrameEpsilonPx:
                                    Number(sigmaViewport?.getAttribute("data-layout-worker-position-frame-epsilon-px") || "0"),
                                  topologyHealthRepairMapTargetContract:
                                    sigmaViewport?.getAttribute("data-health-repair-map-target-contract") || "",
                                  topologyHealthRepairMapTargetSlug:
                                    sigmaViewport?.getAttribute("data-health-repair-map-target-slug") || "",
                                  topologyHealthRepairMapTargetKind:
                                    sigmaViewport?.getAttribute("data-health-repair-map-target-kind") || "",
                                  topologyHealthRepairAuditTargetContract:
                                    topologyHealthRepairAuditCard?.getAttribute("data-health-repair-audit-contract") ||
                                    "",
                                  topologyHealthRepairAuditTargetSlug:
                                    topologyHealthRepairAuditCard?.getAttribute("data-slug") || "",
                                  topologyHealthRepairAuditTargetKind:
                                    topologyHealthRepairAuditCard?.getAttribute("data-health-repair-audit-kind") ||
                                    "",
                                  topologyHealthRepairAuditTargetBadge:
                                    topologyHealthRepairAuditCard?.getAttribute("data-health-repair-audit-badge") ||
                                    "",
                                  topologyHealthRepairAuditTargetBadgeContract:
                                    topologyHealthRepairAuditCard?.getAttribute("data-health-repair-audit-badge-contract") ||
                                    "",
                                  topologyCameraMotionTrigger:
                                    sigmaViewport?.getAttribute("data-camera-motion-trigger") || "",
                                  topologyCameraMotionContract:
                                    sigmaViewport?.getAttribute("data-camera-motion-contract") || "",
                                  topologyCameraMotionDurationMs:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-duration-ms") || "0"),
                                  topologyCameraMotionEasing:
                                    sigmaViewport?.getAttribute("data-camera-motion-easing") || "",
                                  topologyCameraMotionReduced:
                                    sigmaViewport?.getAttribute("data-camera-motion-reduced") === "true",
                                  topologyCameraMotionState:
                                    topologyCameraMotionState,
                                  topologyCameraMotionIntent:
                                    sigmaViewport?.getAttribute("data-camera-motion-intent") || "",
                                  topologyCameraMotionTargetPolicy:
                                    sigmaViewport?.getAttribute("data-camera-motion-target-policy") || "",
                                  topologyCameraMotionDistancePolicy:
                                    sigmaViewport?.getAttribute("data-camera-motion-distance-policy") || "",
                                  topologyCameraMotionMaxDistancePx:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-max-distance-px") || "0"),
                                  topologyCameraMotionSelectedViewportX:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-selected-viewport-x") || "0"),
                                  topologyCameraMotionSelectedViewportY:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-selected-viewport-y") || "0"),
                                  topologyCameraMotionSafeTargetX:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-safe-target-x") || "0"),
                                  topologyCameraMotionSafeTargetY:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-safe-target-y") || "0"),
                                  topologyCameraMotionDistancePx:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-distance-px") || "0"),
                                  topologyCameraMotionTargetInsideSafeRect:
                                    sigmaViewport?.getAttribute("data-camera-motion-target-inside-safe-rect") === "true",
                                  topologyCameraMotionSafeInsetTop:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-safe-inset-top") || "0"),
                                  topologyCameraMotionSafeInsetRight:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-safe-inset-right") || "0"),
                                  topologyCameraMotionSafeInsetBottom:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-safe-inset-bottom") || "0"),
                                  topologyCameraMotionSafeInsetLeft:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-safe-inset-left") || "0"),
                                  topologyCameraMotionRightReserveContract:
                                    sigmaViewport?.getAttribute("data-camera-motion-right-reserve-contract") || "",
                                  topologyCameraMotionSafeTargetRightClearance:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-safe-target-right-clearance") || "0"),
                                  topologyCameraMotionSelectedFanoutRows:
                                    Number(sigmaViewport?.getAttribute("data-camera-motion-selected-fanout-rows") || "0"),
                                  topologyInitialRevealMotionContract:
                                    sigmaViewport?.getAttribute("data-initial-reveal-motion-contract") || "",
                                  topologyInitialRevealTransformPolicy:
                                    sigmaViewport?.getAttribute("data-initial-reveal-transform-policy") || "",
                                  topologyInitialRevealDurationMs:
                                    Number(sigmaViewport?.getAttribute("data-initial-reveal-duration-ms") || "0"),
                                  topologyDimAnchorVisibleCount:
                                    topologyDimAnchorCards.length,
                                  topologyDimChipVisibleCount:
                                    topologyDimChipCards.length,
                                  topologyDimAnchorMinOpacity:
                                    topologyMinOpacity(topologyDimAnchorCards),
                                  topologyDimChipMinOpacity:
                                    topologyMinOpacity(topologyDimChipCards),
                                  topologyFocusClusterBreathingRoomContract:
                                    "",
                                  topologyFocusClusterBreathingRoomPx:
                                    0,
                                  topologyFocusClusterRightClearance:
                                    0,
                                  topologyFocusClusterBottomClearance:
                                    0,
                                  topologyFocusClusterWidth:
                                    0,
                                  topologyFocusClusterHeight:
                                    0,
                                  topologyFocusClusterLeft:
                                    0,
                                  topologyFocusClusterTop:
                                    0,
                                  topologyFocusClusterRight:
                                    0,
                                  topologyFocusClusterBottom:
                                    0,
                                  topologyFocusClusterConnectorCount,
                                  topologyFocusClusterRelationLabelCount,
                                  topologyFocusClusterConnectorMarkerCount,
                                  topologyFocusClusterRelationLabelMarkerCount,
                                  topologyFocusRelationLabelVisibleText,
                                  topologyFocusRelationLabelTypeLabel,
                                  topologyFocusRelationLabelCount,
                                  topologyFocusRelationLabelVisibleCountPolicy,
                                  topologySigmaCanvasCount: sigmaCanvases.length,
                                  topologySigmaCanvasSizes: sigmaCanvases,
                                  topologyStagePanClickCancelPx,
                                  topologyEngineLoadingVisible:
                                    Boolean(
                                      (undefined) &&
                                      sigmaLoadingFallbackStyle &&
                                      sigmaLoadingFallbackStyle.display !== "none" &&
                                      sigmaLoadingFallbackStyle.visibility !== "hidden" &&
                                      Number(sigmaLoadingFallbackStyle.opacity || "1") > 0.01 &&
                                      (undefined).width > 0 &&
                                      (undefined).height > 0
                                    ),
                                  topologyCardRawCount:
                                    document.querySelectorAll("[data-skeleton-card]").length,
                                  topologyCardRawSample: topologyRawCards,
                                  topologyCardCount: topologyCards.length,
                                  topologyPathCandidateCardCount,
                                  topologyPathSourceCardCount,
                                  topologyPathTargetCardCount,
                                  topologyPathSourceCardSlug: topologyPathSourceCard?.slug || "",
                                  topologyPathSourceCardRoleContract:
                                    topologyPathSourceCard?.pathRoleContract || "",
                                  topologyPathSourceCardAttentionLayer:
                                    topologyPathSourceCard?.pathAttentionLayer || "",
                                  topologyPathSourceCardNextAction:
                                    topologyPathSourceCard?.pathNextAction || "",
                                  topologyPathSourceCardAnchor:
                                    topologyPathSourceCard?.pathAnchor || "",
                                  topologyPathSourceCardBadgeLabel:
                                    topologyPathSourceCard?.pathBadgeLabel || "",
                                  topologyPathTargetCardSlug: topologyPathTargetCard?.slug || "",
                                  topologyPathTargetCardRoleContract:
                                    topologyPathTargetCard?.pathRoleContract || "",
                                  topologyPathTargetCardBadgeLabel:
                                    topologyPathTargetCard?.pathBadgeLabel || "",
                                  topologyAnalysisPanelVisible:
                                    Boolean(
                                      (undefined) &&
                                      topologyAnalysisPanelStyle &&
                                      topologyAnalysisPanelStyle.display !== "none" &&
                                      topologyAnalysisPanelStyle.visibility !== "hidden" &&
                                      Number(topologyAnalysisPanelStyle.opacity || "1") > 0.01 &&
                                      (undefined).width > 0 &&
                                      (undefined).height > 0
                                    ),
                                  topologyPathStartPromptVisible,
                                  topologyPathAnchorPromptVisible,
                                  topologyPathPromptClearanceContract,
                                  topologyPathPromptSuppressionContract,
                                  topologyPathPromptPanelClearancePx,
                                  topologyPathPromptViewportRightClearancePx,
                                  topologyPathResultBannerVisible:
                                    Boolean(
                                      (undefined) &&
                                      topologyPathResultBannerStyle &&
                                      topologyPathResultBannerStyle.display !== "none" &&
                                      topologyPathResultBannerStyle.visibility !== "hidden" &&
                                      Number(topologyPathResultBannerStyle.opacity || "1") > 0.01 &&
                                      (undefined).width > 0 &&
                                      (undefined).height > 0
                                    ),
                                  topologyPathResultRelationChips,
                                  topologyPathResultActions,
                                  topologyPathResultEndpoints,
                                  topologyCardOverlapCount,
                                  topologyCardOverlapSample,
                                  topologyCardClippedCount,
                                  topologyFixedSurfaceCount: fixedTopologySurfaces.length,
                                  topologyFixedSurfaceNames,
                                  topologyFixedSurfaceOverlapCount,
                                  topologyFixedSurfaceOverlapSample,
                                  topologyTransientSurfaceCount,
                                  topologyTransientSurfaceNames,
                                  topologyTransientSurfaceContract,
                                  topologyCardFixedSurfaceOverlapCount,
                                  topologyCardFixedSurfaceOverlapSample,
                                  topologyKindLegendState:
                                    sigmaViewport?.getAttribute("data-kind-legend-state") || "",
                                  topologyKindLegendVisible,
                                  topologyAuditLegendVisible,
                                  topologyAuditLegendOverlapsAnalysisPanel,
                                  topologyAuditLegendOverlapsMinimap,
                                  topologyTopWorkspaceLabel:
                                    topologyTopWorkspaceButton?.textContent?.trim() || "",
                                  topologyTopRelayoutLabel:
                                    topologyTopRelayoutButton?.textContent?.trim() || "",
                                  topologyTopSearchLabel:
                                    topologyTopSearchButton?.textContent?.trim() || "",
                                  topologySearchActionLaneVisible:
                                    Boolean(
                                      topologySearchActionLaneRect &&
                                      topologySearchActionLaneStyle &&
                                      topologySearchActionLaneStyle.display !== "none" &&
                                      topologySearchActionLaneStyle.visibility !== "hidden" &&
                                      Number(topologySearchActionLaneStyle.opacity || "1") > 0.01 &&
                                      topologySearchActionLaneRect.width > 0 &&
                                      topologySearchActionLaneRect.height > 0
                                    ),
                                  topologySearchActionLaneDensity:
                                    topologySearchActionLane?.getAttribute("data-search-lane-density") || "",
                                  topologySearchActionLaneContract:
                                    topologySearchActionLane?.getAttribute("data-search-lane-contract") || "",
                                  topologySearchLaneCompactWidthToken:
                                    topologySearchActionLane?.getAttribute("data-search-lane-compact-width-token") || "",
                                  topologySearchActionLaneWidth:
                                    topologySearchActionLaneRect?.width || 0,
                                  topologySearchActionLaneHeight:
                                    topologySearchActionLaneRect?.height || 0,
                                  topologySigmaControlsStackVisible:
                                    Boolean(
                                      (undefined) &&
                                      topologySigmaControlsStackStyle &&
                                      topologySigmaControlsStackStyle.display !== "none" &&
                                      topologySigmaControlsStackStyle.visibility !== "hidden" &&
                                      Number(topologySigmaControlsStackStyle.opacity || "1") > 0.01 &&
                                      (undefined).width > 0 &&
                                      (undefined).height > 0
                                    ),
                                  topologySigmaControlsStackSurfaceComputed:
                                    topologySigmaControlsStackStyle?.backgroundColor || "",
                                  topologySigmaControlsStackBorderComputed:
                                    topologySigmaControlsStackStyle?.borderTopColor || "",
                                  topologyShortcutsHelpButtonVisible:
                                    Boolean(
                                      topologyShortcutsHelpButtonRect &&
                                      topologyShortcutsHelpButtonStyle &&
                                      topologyShortcutsHelpButtonStyle.display !== "none" &&
                                      topologyShortcutsHelpButtonStyle.visibility !== "hidden" &&
                                      Number(topologyShortcutsHelpButtonStyle.opacity || "1") > 0.01 &&
                                      topologyShortcutsHelpButtonRect.width > 0 &&
                                      topologyShortcutsHelpButtonRect.height > 0
                                    ),
                                  topologyShortcutsHelpButtonDensity:
                                    topologyShortcutsHelpButton?.getAttribute("data-controls-density") || "",
                                  topologyShortcutsHelpButtonContract:
                                    topologyShortcutsHelpButton?.getAttribute("data-controls-contract") || "",
                                  topologyShortcutsHelpButtonWidth:
                                    topologyShortcutsHelpButtonRect?.width || 0,
                                  topologyShortcutsHelpButtonHeight:
                                    topologyShortcutsHelpButtonRect?.height || 0,
                                  topologyCommandChromeState,
                                  topologyUtilityLaneSuppressionContract,
                                  topologyUtilityLaneHeightToken:
                                    topologyCommandChrome?.getAttribute("data-utility-lane-height-token") || "",
                                  topologyUtilityLaneGapToken:
                                    topologyCommandChrome?.getAttribute("data-utility-lane-gap-token") || "",
                                  topologyUtilityLaneCompactWidthToken:
                                    topologyCommandChrome?.getAttribute("data-utility-lane-compact-width-token") || "",
                                  topologyUtilityActionLaneVisible:
                                    Boolean(
                                      topologyUtilityActionLaneRect &&
                                      topologyUtilityActionLaneStyle &&
                                      topologyUtilityActionLaneStyle.display !== "none" &&
                                      topologyUtilityActionLaneStyle.visibility !== "hidden" &&
                                      Number(topologyUtilityActionLaneStyle.opacity || "1") > 0.01 &&
                                      topologyUtilityActionLaneRect.width > 0 &&
                                      topologyUtilityActionLaneRect.height > 0
                                    ),
                                  topologyUtilityActionLaneDensity:
                                    topologyUtilityActionLane?.getAttribute("data-utility-lane-density") || "",
                                  topologyUtilityActionLaneContract:
                                    topologyUtilityActionLane?.getAttribute("data-utility-lane-contract") || "",
                                  topologyUtilityActionLaneWidth:
                                    topologyUtilityActionLaneRect?.width || 0,
                                  topologyUtilityActionLaneHeight:
                                    topologyUtilityActionLaneRect?.height || 0,
                                  topologyTopLeftChromeGroupVisible:
                                    Boolean(
                                      topologyTopLeftChromeGroupRect &&
                                      topologyTopLeftChromeGroupStyle &&
                                      topologyTopLeftChromeGroupStyle.display !== "none" &&
                                      topologyTopLeftChromeGroupStyle.visibility !== "hidden" &&
                                      Number(topologyTopLeftChromeGroupStyle.opacity || "1") > 0.01 &&
                                      topologyTopLeftChromeGroupRect.width > 0 &&
                                      topologyTopLeftChromeGroupRect.height > 0
                                    ),
                                  topologyTopLeftChromeGroupState,
                                  topologyTopLeftChromeGroupLeft:
                                    topologyTopLeftChromeGroupRect?.left || 0,
                                  topologyTopLeftChromeGroupRight:
                                    topologyTopLeftChromeGroupRect?.right || 0,
                                  topologyTopLeftChromeGroupWidth:
                                    topologyTopLeftChromeGroupRect?.width || 0,
                                  topologyCreateNodeOpen:
                                    Boolean(topologyCreateNodePanel),
                                  topologyCreateNodePanelVisible:
                                    Boolean(
                                      topologyCreateNodePanelRect &&
                                      topologyCreateNodePanelStyle &&
                                      topologyCreateNodePanelStyle.display !== "none" &&
                                      topologyCreateNodePanelStyle.visibility !== "hidden" &&
                                      Number(topologyCreateNodePanelStyle.opacity || "1") > 0.01 &&
                                      topologyCreateNodePanelRect.width > 0 &&
                                      topologyCreateNodePanelRect.height > 0
                                    ),
                                  topologyCreateNodePanelAttentionRole:
                                    topologyCreateNodePanel?.getAttribute("data-attention-role") || "",
                                  topologyCreateNodePanelPlacementContract:
                                    topologyCreateNodePanel?.getAttribute("data-placement-contract") || "",
                                  topologyCreateNodeSurfaceRole:
                                    topologyCreateNodePanel?.getAttribute("data-surface-role") || "",
                                  topologyCreateNodeElevationContract:
                                    topologyCreateNodePanel?.getAttribute("data-elevation-contract") || "",
                                  topologyCreateNodeSizeContract:
                                    topologyCreateNodePanel?.getAttribute("data-size-contract") || "",
                                  topologyCreateNodePanelTopToken:
                                    topologyCreateNodePanel?.getAttribute("data-top-token") || "",
                                  topologyCreateNodePanelWidthToken:
                                    topologyCreateNodePanel?.getAttribute("data-width-token") || "",
                                  topologyCreateNodePanelMaxHeightToken:
                                    topologyCreateNodePanel?.getAttribute("data-max-height-token") || "",
                                  topologyCreateNodeFormSurfaceToken:
                                    topologyCreateNodeForm?.getAttribute("data-surface-token") || "",
                                  topologyCreateNodeFormBorderToken:
                                    topologyCreateNodeForm?.getAttribute("data-border-token") || "",
                                  topologyCreateNodeFormShadowToken:
                                    topologyCreateNodeForm?.getAttribute("data-shadow-token") || "",
                                  topologyCreateNodePanelRole:
                                    topologyCreateNodePanel?.getAttribute("role") || "",
                                  topologyCreateNodePanelAriaModal:
                                    topologyCreateNodePanel?.getAttribute("aria-modal") || "",
                                  topologyCreateNodePanelLabelledBy:
                                    topologyCreateNodePanel?.getAttribute("aria-labelledby") || "",
                                  topologyCreateNodeHeadingId:
                                    topologyCreateNodePanel?.querySelector("[id]")?.getAttribute("id") || "",
                                  topologyCreateNodeFocusInside,
                                  topologyCreateNodeActiveElementTestId,
                                  topologyCreateNodePanelTop:
                                    topologyCreateNodePanelRect?.top || 0,
                                  topologyCreateNodePanelBottom:
                                    topologyCreateNodePanelRect?.bottom || 0,
                                  topologyCreateNodePanelLeft:
                                    topologyCreateNodePanelRect?.left || 0,
                                  topologyCreateNodePanelRight:
                                    topologyCreateNodePanelRect?.right || 0,
                                  topologyCreateNodePanelWidth:
                                    topologyCreateNodePanelRect?.width || 0,
                                  topologyCreateNodePanelHeight:
                                    topologyCreateNodePanelRect?.height || 0,
                                  /*
                                   * ⚠️ 2026-08-11 — **가운데의 기준도 지도다.** 뷰포트 가운데로 재던
                                   * 이 값은 레일 폭의 절반(실측 31.5 ≈ 64/2)만큼 늘 어긋났고, 허용
                                   * 24를 넘어 반드시 실패했다. 컴포저는 자기가 막는 영역(지도) 가운데에
                                   * 서고, 그 영역은 위 `topologyCreateNodeBackdropTargetRect` 와 같다.
                                   */
                                  topologyCreateNodePanelCenterOffset:
                                    topologyCreateNodePanelRect
                                      ? Math.abs(
                                          (topologyCreateNodePanelRect.left + (topologyCreateNodePanelRect.width / 2)) -
                                            (topologyCreateNodeBackdropTargetRect
                                              ? topologyCreateNodeBackdropTargetRect.left +
                                                topologyCreateNodeBackdropTargetRect.width / 2
                                              : innerWidth / 2),
                                        )
                                      : 0,
                                  topologyCreateNodeBackdropVisible,
                                  topologyCreateNodeBackdropCoversViewport,
                                  topologyCreateNodeBackdropPointerEvents:
                                    topologyCreateNodeBackdropStyle?.pointerEvents || "",
                                  topologyCreateNodeBackdropContract:
                                    topologyCreateNodeBackdrop?.getAttribute("data-backdrop-contract") || "",
                                  topologyCreateNodeBackdropSurfaceToken:
                                    topologyCreateNodeBackdrop?.getAttribute("data-backdrop-surface-token") || "",
                                  topologyCreateNodeBackdropBackground:
                                    topologyCreateNodeBackdropStyle?.backgroundColor || "",
                                  topologyCreateNodeBackdropFilter:
                                    topologyCreateNodeBackdropStyle?.backdropFilter || "",
                                  topologyInteractiveOverlayCount:
                                    topologyInteractiveOverlayNames.length,
                                  topologyInteractiveOverlayNames,
                                  topologyBlockingComposerOverlayContract,
                                  topologyMapSurfaceBlockingEdit:
                                    topologyMapSurface?.getAttribute("data-blocking-edit") === "true",
                                  topologyMapSurfaceDemoted:
                                    topologyMapSurface?.getAttribute("data-map-demoted") === "true",
                                  topologyMapSurfaceDimOpacity:
                                    Number(topologyMapSurface?.getAttribute("data-map-dim-opacity") || "1"),
                                  topologyMapSurfaceDimOpacityToken:
                                    topologyMapSurface?.getAttribute("data-map-dim-opacity-token") || "",
                                  topologyMapSurfaceFilterToken:
                                    topologyMapSurface?.getAttribute("data-map-filter-token") || "",
                                  topologyMapSurfaceInteractionContract:
                                    topologyMapSurface?.getAttribute("data-map-interaction-contract") || "",
                                  topologyMapSurfaceOpacity:
                                    Number(topologyMapSurfaceStyle?.opacity || "1"),
                                  topologyMapSurfacePointerEvents:
                                    topologyMapSurfaceStyle?.pointerEvents || "",
                                  topologyCreateNodePanelText:
                                    topologyCreateNodePanel?.textContent?.trim() || "",
                                  topologyCreateNodeTitlePlaceholder:
                                    topologyCreateNodeTitleInput?.getAttribute("placeholder") || "",
                                  topologyCreateNodeDomainPlaceholder:
                                    topologyCreateNodeDomainInput?.getAttribute("placeholder") || "",
                                  topologyCreateNodeKindOptions:
                                    Array.from(topologyCreateNodeKindSelect?.querySelectorAll("option") || []).map((option) => option.textContent?.trim() || ""),
                                  topologyCreateNodeSubmitLabel:
                                    topologyCreateNodeSubmit?.textContent?.trim() || "",
                                  topologyMinimapVisible,
                                  topologyMinimapState:
                                    sigmaViewport?.getAttribute("data-minimap-state") || "",
                                  topologyRelationLegendState:
                                    sigmaViewport?.getAttribute("data-relation-legend-state") || "",
                                  topologySupportChromeZoomLensActive:
                                    sigmaViewport?.getAttribute("data-support-chrome-zoom-lens-active") === "true",
                                  topologySupportChromeZoomLensThresholdRatio:
                                    Number(sigmaViewport?.getAttribute("data-support-chrome-zoom-lens-threshold-ratio") || "0"),
                                  topologyMinimapRight:
                                    (undefined) ? innerWidth - (undefined).right : 0,
                                  topologyMinimapBottom:
                                    (undefined) ? innerHeight - (undefined).bottom : 0,
                                  topologyMinimapViewportVisible:
                                    Boolean(
                                      (undefined) &&
                                      topologyMinimapVisible &&
                                      (undefined).width > 2 &&
                                      (undefined).height > 2
                                    ),
                                  topologySelectedNodePopoverVisible: Boolean(topologySelectedNodePopover),
                                  topologySelectedNodeId,
                                  topologySelectedNodeKind,
                                  topologySelectedNodeTitle,
                                  topologySelectedNodeSource,
                                  topologySelectedNodeSummary,
                                  topologyRelationQualityLensText,
                                  topologySelectedRelationQualityLensText,
                                  topologyOverviewRelationQualityText,
                                  topologyOverviewAgentReadinessText,
                                  topologyOverviewAgentReadinessMeterSegments,
                                  topologyAnalysisPanelVisible:
                                    Boolean(
                                      (undefined) &&
                                      topologyAnalysisPanelStyle &&
                                      topologyAnalysisPanelStyle.display !== "none" &&
                                      topologyAnalysisPanelStyle.visibility !== "hidden" &&
                                      Number(topologyAnalysisPanelStyle.opacity || "1") > 0.01 &&
                                      (undefined).width > 0 &&
                                      (undefined).height > 0
                                    ),
                                  topologyAnalysisPanelZIndexComputed:
                                    topologyAnalysisPanelStyle?.zIndex || "",
                                  topologyAnalysisPanelSurfaceComputed:
                                    topologyAnalysisPanelStyle?.backgroundColor || "",
                                  topologyAnalysisPanelBorderComputed:
                                    topologyAnalysisPanelStyle?.borderColor || "",
                                  topologyVerifierTokenContractVersion: "command-spine-v1",
                                  topologyAnalysisPanelOverflowY:
                                    topologyAnalysisPanelStyle?.overflowY || "",
                                  topologyFocusCommandSpineVisible:
                                    Boolean(
                                      (undefined) &&
                                      topologyFocusCommandSpineStyle &&
                                      topologyFocusCommandSpineStyle.display !== "none" &&
                                      topologyFocusCommandSpineStyle.visibility !== "hidden" &&
                                      Number(topologyFocusCommandSpineStyle.opacity || "1") > 0.01 &&
                                      (undefined).width > 0 &&
                                      (undefined).height > 0
                                    ),
                                  topologyFocusCommandSpineBackgroundComputed:
                                    topologyFocusCommandSpineStyle?.backgroundImage || "",
                                  topologyFocusCommandSpineBorderComputed:
                                    topologyFocusCommandSpineStyle?.borderColor || "",
                                  topologyFocusCommandSpinePaddingTokenValue:
                                    topologyFocusCommandSpineStyle?.getPropertyValue("--topology-command-spine-padding").trim() || "",
                                  topologyFocusCommandPrimaryActionSurfaceComputed:
                                    topologyFocusPrimaryActionStyle?.backgroundColor || "",
                                  topologyFocusCommandPrimaryActionBorderComputed:
                                    topologyFocusPrimaryActionStyle?.borderColor || "",
                                  topologyNodePopoverVisible:
                                    Boolean(topologyNodePopoverRect) &&
                                    topologyNodePopoverStyle?.display !== "none" &&
                                    topologyNodePopoverStyle?.visibility !== "hidden" &&
                                    Number(topologyNodePopoverStyle?.opacity || "1") > 0.01,
                                  topologyNodePopoverCollapsed:
                                    topologyNodePopover?.getAttribute("data-collapsed") === "true",
                                  topologyNodePopoverSurfaceRole,
                                  topologyNodePopoverAttentionRole,
                                  topologyNodePopoverFocusPrimary,
                                  topologyNodePopoverHierarchyContract,
                                  topologyNodePopoverPositionContract:
                                    topologyNodePopoverPositioner?.getAttribute("data-position-contract") || "",
                                  topologyNodePopoverGutterContract:
                                    topologyNodePopoverPositioner?.getAttribute("data-selected-inspector-gutter-contract") || "",
                                  topologyNodePopoverRightInsetToken:
                                    topologyNodePopoverPositioner?.getAttribute("data-position-right-inset-token") || "",
                                  topologyTopLeftChromeGroupSupportContract,
                                  topologyNodePopoverSizePolicy:
                                    topologyNodePopover?.getAttribute("data-size-policy") || "",
                                  topologyNodePopoverWidthToken:
                                    topologyNodePopover?.getAttribute("data-width-token") || "",
                                  topologyNodePopoverRailWidthToken:
                                    topologyNodePopover?.getAttribute("data-rail-width-token") || "",
                                  topologyNodePopoverMaxHeightToken:
                                    topologyNodePopover?.getAttribute("data-max-height-token") || "",
                                  topologyNodePopoverScrollContract:
                                    topologyNodePopover?.getAttribute("data-popover-scroll-contract") || "",
                                  topologyNodePopoverOverflowY:
                                    topologyNodePopoverStyle?.overflowY || "",
                                  topologyNodePopoverOverflowX:
                                    topologyNodePopoverStyle?.overflowX || "",
                                  topologyNodePopoverBodyOverflowY:
                                    topologyNodePopoverBodyStyle?.overflowY || "",
                                  topologyNodePopoverBodyOverflowX:
                                    topologyNodePopoverBodyStyle?.overflowX || "",
                                  topologyNodePopoverSurfaceToken:
                                    topologyNodePopover?.getAttribute("data-popover-surface-token") || "",
                                  topologyNodePopoverBorderToken:
                                    topologyNodePopover?.getAttribute("data-popover-border-token") || "",
                                  topologyNodePopoverSurfaceComputed:
                                    topologyNodePopoverStyle?.backgroundColor || "",
                                  topologyNodePopoverBorderComputed:
                                    topologyNodePopoverStyle?.borderTopColor || "",
                                  topologyNodePopoverResponsiveWidthContract:
                                    topologyNodePopover?.getAttribute("data-responsive-width-contract") || "",
                                  topologyNodePopoverCompactHandoffContract:
                                    topologyNodePopover?.getAttribute("data-compact-handoff-contract") || "",
                                  topologyNodePopoverAgentHandoffContract,
                                  topologyNodePopoverAgentHandoffRoute,
                                  topologyNodePopoverAgentHandoffPrimaryAction,
                                  topologyNodePopoverAgentHandoffActionCount,
                                  topologyNodePopoverRelationFactCount,
                                  topologyNodePopoverRelationTypeCount,
                                  topologyNodePopoverAgentHandoffRelationFactCount,
                                  topologyNodePopoverAgentHandoffRelationTypeCount,
                                  topologyNodePopoverAgentHandoffSummaryContract,
                                  topologyNodePopoverAgentHandoffVisibleSummary,
                                  topologyNodePopoverAgentHandoffSelectedNode,
                                  topologyNodePopoverWidth:
                                    topologyNodePopoverRect?.width || 0,
                                  topologyNodePopoverHeight:
                                    topologyNodePopoverRect?.height || 0,
                                  topologyNodePopoverClientHeight:
                                    topologyNodePopover?.clientHeight || 0,
                                  topologyNodePopoverScrollHeight:
                                    topologyNodePopover?.scrollHeight || 0,
                                  topologyNodePopoverClientWidth:
                                    topologyNodePopover?.clientWidth || 0,
                                  topologyNodePopoverScrollWidth:
                                    topologyNodePopover?.scrollWidth || 0,
                                  topologyNodePopoverLeft:
                                    topologyNodePopoverRect?.left || 0,
                                  topologyNodePopoverRight:
                                    topologyNodePopoverRect?.right || 0,
                                  topologyNodePopoverInspectorGap:
                                    topologyNodePopoverRect && (undefined)
                                      ? topologyNodePopoverRect.left - (undefined).right
                                      : 0,
                                  topologyNodePopoverAttentionLaneContract:
                                    topologyNodePopoverRect && (undefined)
                                      ? "right-inspector-separated-from-support-rail"
                                      : "",
                                  topologyNodePopoverTop:
                                    topologyNodePopoverRect?.top || 0,
                                  topologyNodePopoverBottom:
                                    topologyNodePopoverRect?.bottom || 0,
                                  topologyNodePopoverRelationRowVisible:
                                    Boolean(topologyNodePopoverRelationRow),
                                  topologyNodePopoverFooterSurfaceComputed:
                                    topologyNodePopoverFooterStyle?.backgroundColor || "",
                                  topologyNodePopoverCompactBriefActionSurfaceComputed:
                                    topologyNodePopoverCompactBriefActionStyle?.backgroundColor || "",
                                  topologyNodePopoverCompactBriefActionBorderComputed:
                                    topologyNodePopoverCompactBriefActionStyle?.borderTopColor || "",
                                  topologyNodePopoverCompactMeaningVisible:
                                    Boolean((undefined)) &&
                                    (undefined).width > 0 &&
                                    (undefined).height > 0 &&
                                    topologyNodePopoverCompactMeaningStyle?.display !== "none" &&
                                    topologyNodePopoverCompactMeaningStyle?.visibility !== "hidden" &&
                                    Number(topologyNodePopoverCompactMeaningStyle?.opacity || "1") > 0.01,
                                  topologyNodePopoverRelationRowOverflowContract:
                                    topologyNodePopoverRelationRow?.getAttribute("data-overflow-contract") || "",
                                  topologyNodePopoverRelationRowWidth:
                                    topologyNodePopoverRelationRowRect?.width || 0,
                                  topologyNodePopoverRelationRowHeight:
                                    topologyNodePopoverRelationRowRect?.height || 0,
                                  topologyNodePopoverVisibleRelationRowHeight,
                                  topologyNodePopoverRelationRowFullyVisible:
                                    topologyNodePopoverRelationRowRect
                                      ? topologyNodePopoverVisibleRelationRowHeight >=
                                        topologyNodePopoverRelationRowRect.height - 1
                                      : false,
                                  topologyNodePopoverRelationRowClientWidth:
                                    topologyNodePopoverRelationRow?.clientWidth || 0,
                                  topologyNodePopoverRelationRowScrollWidth:
                                    topologyNodePopoverRelationRow?.scrollWidth || 0,
                                  topologyNodePopoverRelationRowDensityContract:
                                    topologyNodePopoverRelationRow?.getAttribute("data-row-density-contract") || "",
                                  topologyNodePopoverRelationRowMinHitHeight:
                                    Number(topologyNodePopoverRelationRow?.getAttribute("data-row-min-hit-height") || "0"),
                                  topologyNodePopoverRelationRowScanOrder:
                                    topologyNodePopoverRelationRow?.getAttribute("data-row-scan-order") || "",
                                  topologyNodePopoverRelationTitlePrimaryScanTarget:
                                    topologyNodePopoverRelationTitle?.getAttribute("data-primary-scan-target") || "",
                                  topologyNodePopoverRelationQuality:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-quality") || "",
                                  topologyNodePopoverRelationType:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-type") || "",
                                  topologyNodePopoverRelationEvidenceState:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-evidence-state") || "",
                                  topologyNodePopoverRelationEvidenceGlyph:
                                    topologyNodePopoverRelationEvidenceGlyph?.textContent || "",
                                  topologyNodePopoverRelationAgentGateKind:
                                    topologyNodePopoverRelationRow?.getAttribute("data-agent-gate-kind") || "",
                                  topologyNodePopoverRelationPrimaryCopyAction:
                                    topologyNodePopoverRelationRow?.getAttribute("data-primary-copy-action") || "",
                                  topologyNodePopoverRelationAgentGateText:
                                    topologyNodePopoverRelationGate?.textContent || "",
                                  topologyNodePopoverRelationFactRoute:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-fact-route") || "",
                                  topologyNodePopoverRelationFactRouteQuality:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-fact-route-quality") || "",
                                  topologyNodePopoverRelationFactRouteEvidence:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-fact-route-evidence") || "",
                                  topologyNodePopoverRelationFactRouteGate:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-fact-route-gate") || "",
                                  topologyNodePopoverRelationFactRouteAction:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-fact-route-action") || "",
                                  topologyNodePopoverRelationHandoffGrammarContract:
                                    topologyNodePopoverRelationRouteRail?.getAttribute("data-handoff-grammar-contract") ||
                                    topologyNodePopoverRelationRow?.getAttribute("data-handoff-grammar-contract") ||
                                    "",
                                  topologyNodePopoverRelationFactRouteChips,
                                  topologyNodePopoverRelationRouteState:
                                    topologyNodePopoverRelationRouteRail?.getAttribute("data-relation-route-state") || "",
                                  topologyNodePopoverRelationHandoffLane:
                                    topologyNodePopoverRelationRouteRail?.getAttribute("data-handoff-lane") || "",
                                  topologyNodePopoverRelationRouteRailWidth:
                                    topologyNodePopoverRelationRouteRailRect?.width || 0,
                                  topologyNodePopoverRelationRouteRailScrollWidth:
                                    topologyNodePopoverRelationRouteRail?.scrollWidth || 0,
                                  topologyNodePopoverRelationPayloadChipWidth:
                                    topologyNodePopoverRelationPayloadChipRect?.width || 0,
                                  topologyNodePopoverRelationPayloadChipText:
                                    topologyNodePopoverRelationPayloadChip?.textContent || "",
                                  topologyNodePopoverRelationPayloadChipTitle:
                                    topologyNodePopoverRelationPayloadChip?.getAttribute("title") || "",
                                  topologyNodePopoverRelationPayloadChipSummary:
                                    topologyNodePopoverRelationPayloadChip?.getAttribute("data-relation-payload-summary") || "",
                                  topologyNodePopoverRelationSourceId:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-source-id") || "",
                                  topologyNodePopoverRelationTargetId:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-target-id") || "",
                                  topologyNodePopoverRelationEndpointRoute:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-endpoint-route") || "",
                                  topologyNodePopoverRelationHandoffSummary:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-handoff-summary") || "",
                                  topologyNodePopoverRelationAccessibleName:
                                    topologyNodePopoverRelationRow?.getAttribute("aria-label") || "",
                                  topologyNodePopoverRelationHandoffTool:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-handoff-tool") || "",
                                  topologyNodePopoverRelationHandoffOperation:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-handoff-operation") || "",
                                  topologyNodePopoverRelationHandoffFrom:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-handoff-from") || "",
                                  topologyNodePopoverRelationHandoffTo:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-handoff-to") || "",
                                  topologyNodePopoverRelationHandoffType:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-handoff-type") || "",
                                  topologyNodePopoverRelationHandoffPayloadSummary:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-handoff-payload-summary") || "",
                                  topologyNodePopoverRelationHandoffPayloadJson:
                                    topologyNodePopoverRelationRow?.getAttribute("data-relation-handoff-payload-json") || "",
                                  topologyNodePopoverRelationEndpointChips,
                                  topologyNodePopoverAgentReadinessVisible:
                                    Boolean(topologyNodePopoverAgentReadinessLens),
                                  topologyNodePopoverAgentReadinessText,
                                  topologyNodePopoverAgentReadinessChips,
                                  topologyNodePopoverMapContextVisible:
                                    Boolean(topologyNodePopoverMapContextNote),
                                  topologyNodePopoverMapContextCount:
                                    Number(topologyNodePopoverMapContextNote?.getAttribute("data-map-context-count") || "0"),
                                  topologyNodePopoverMapContextContract:
                                    topologyNodePopoverMapContextNote?.getAttribute("data-map-context-contract") || "",
                                  topologyNodePopoverMapContextHandoffContract:
                                    topologyNodePopoverMapContextNote?.getAttribute("data-map-context-handoff-contract") || "",
                                  topologyNodePopoverMapContextRelationTypeCount:
                                    Number(topologyNodePopoverMapContextNote?.getAttribute("data-map-context-relation-type-count") || "0"),
                                  topologyNodePopoverMapContextQualitySummary:
                                    topologyNodePopoverMapContextNote?.getAttribute("data-map-context-quality-summary") || "",
                                  topologyNodePopoverMapContextAgentReadinessSummary:
                                    topologyNodePopoverMapContextNote?.getAttribute("data-map-context-agent-readiness-summary") || "",
                                  topologyNodePopoverMapContextText:
                                    topologyNodePopoverMapContextNote?.textContent || "",
                                  topologySelectedRelationHaloVisible:
                                    topologySelectedRelationVisibleHalos.length > 0,
                                  topologySelectedRelationHaloCount:
                                    topologySelectedRelationHalos.length,
                                  topologySelectedRelationVisibleHaloCount:
                                    topologySelectedRelationVisibleHalos.length,
                                  topologySelectedRelationHaloQuality:
                                    topologySelectedRelationHalo?.quality || "",
                                  topologySelectedRelationHaloSample:
                                    topologySelectedRelationHalos.slice(0, 3),
                                  topologySelectedRelationLabelHitAligned,
                                  topologySelectedRelationLabelHitWidth:
                                    topologySelectedRelationLabelHitRect?.width || 0,
                                  topologySelectedRelationLabelHitHeight:
                                    topologySelectedRelationLabelHitRect?.height || 0,
                                  topologySelectedRelationLabelHitLeft:
                                    topologySelectedRelationLabelHitRect?.left || 0,
                                  topologySelectedRelationLabelHitRight:
                                    topologySelectedRelationLabelHitRect?.right || 0,
                                  topologySelectedRelationLabelCompact:
                                    topologySelectedRelationLabelHit?.getAttribute("data-relation-label-compact") || "",
                                  topologySelectedRelationLabelDensity:
                                    topologySelectedRelationLabelHit?.getAttribute("data-relation-label-density") || "",
                                  topologySelectedRelationLabelDesiredWidth:
                                    Number(topologySelectedRelationLabelHit?.getAttribute("data-relation-label-desired-width") || "0"),
                                  topologySelectedRelationLabelCenteredAvailableWidth:
                                    Number(topologySelectedRelationLabelHit?.getAttribute("data-relation-label-centered-available-width") || "0"),
                                  topologySelectedRelationLabelViewportClampContract:
                                    topologySelectedRelationLabelHit?.getAttribute("data-relation-label-viewport-clamp-contract") || "",
                                  topologySelectedRelationLabelViewportClampSide:
                                    topologySelectedRelationLabelHit?.getAttribute("data-relation-label-viewport-clamp-side") || "",
                                  topologySelectedRelationLabelViewportInset:
                                    Number(topologySelectedRelationLabelHit?.getAttribute("data-relation-label-viewport-inset") || "0"),
                                  topologySelectedRelationLabelGeometryId,
                                  topologySelectedRelationLabelQuality,
                                  topologySelectedRelationLabelQualityChipText,
                                  topologySelectedRelationLabelEvidenceState,
                                  topologySelectedRelationLabelEvidenceGlyph,
                                  topologySelectedRelationLabelSource,
                                  topologySelectedRelationLabelTarget,
                                  topologySelectedRelationLabelType,
                                  topologySelectedRelationLabelCount,
                                  topologySelectedRelationLabelRoute,
                                  topologySelectedRelationLabelTypeLabel,
                                  topologySelectedRelationLabelAgentGateKind,
                                  topologySelectedRelationLabelPrimaryCopyAction,
                                  topologySelectedRelationLabelCliFallbackCommand,
                                  topologySelectedRelationLabelAgentGateText,
                                  topologySelectedRelationLabelFactRoute,
                                  topologySelectedRelationLabelFactRouteQuality,
                                  topologySelectedRelationLabelFactRouteEvidence,
                                  topologySelectedRelationLabelFactRouteGate,
                                  topologySelectedRelationLabelFactRouteAction,
                                  topologySelectedRelationLabelFactRouteChips,
                                  topologySelectedRelationCardSurfaceComputed,
                                  topologySelectedRelationCardBorderComputed,
                                  topologySelectedRelationActionMinWidthTokenValue,
                                  topologySelectedRelationCopyPayloadMinHeightTokenValue,
                                  topologySelectedRelationRouteStepMinWidthTokenValue,
                                  topologySelectedRelationKickerFontSizeTokenValue,
                                  topologySelectedRelationChipFontSizeTokenValue,
                                  topologySelectedRelationRouteLabelFontSizeTokenValue,
                                  topologySelectedRelationRouteValueFontSizeTokenValue,
                                  topologySelectedRelationPayloadFontSizeTokenValue,
                                  topologySelectedRelationCardMotionSyncState,
                                  topologySelectedRelationAgentRouteSteps,
                                  topologySelectedRelationPrimaryCopyActionKind,
                                  topologySelectedRelationPrimaryCopyActionText:
                                    topologySelectedRelationPrimaryCopyAction?.textContent || "",
                                  topologySelectedRelationPrimaryCopyActionCall,
                                  topologySelectedRelationPrimaryCopyActionTitle,
                                  topologySelectedRelationPrimaryCopyRecommended:
                                    topologySelectedRelationPrimaryCopyAction?.getAttribute("data-copy-recommended") === "true",
                                  topologySelectedRelationPrimaryCopyBadgeText:
                                    topologySelectedRelationPrimaryCopyRecommendationLabel,
                                  topologySelectedRelationCopyActions,
                                  topologySelectedRelationPrimaryCopyActionWidth:
                                    topologySelectedRelationPrimaryCopyActionRect?.width || 0,
                                  topologySelectedRelationPrimaryCopyActionHeight:
                                    topologySelectedRelationPrimaryCopyActionRect?.height || 0,
                                  topologySelectedRelationEndpointVisibleCount,
                                  topologySelectedRelationEndpointHiddenCount,
                                  topologySelectedRelationEndpointCards,
                                  topologySelectedRelationLowerPriorityVisibleDimmedCount,
                                  topologySelectedRelationVisibleOrientationAnchorCount,
                                  topologySelectedRelationHiddenContextInteractionContract,
                                  topologySelectedRelationHiddenContextInteractiveCount,
                                  topologySelectedRelationVerifyAttempted:
                                    topologySelectedRelationVerification?.attempted === true,
                                  topologySelectedRelationVerifyReason:
                                    topologySelectedRelationVerification?.reason || "",
                                  topologySelectedRelationVerifyClicked:
                                    topologySelectedRelationVerification?.clicked === true,
                                  topologySelectedRelationVerifySelected:
                                    topologySelectedRelationVerification?.selected === true,
                                  topologySelectedRelationVerifyAttempts:
                                    topologySelectedRelationVerification?.attempts || 0,
                                  topologyV2SelectedRelationSource:
                                    topologySelectedRelationVerification?.sourceId || "",
                                  topologyV2SelectedRelationTarget:
                                    topologySelectedRelationVerification?.targetId || "",
                                  topologyV2SelectedRelationType:
                                    topologySelectedRelationVerification?.relationType || "",
                                  topologyDragAttempted: topologyDragVerification?.attempted === true,
                                  topologyDragReason: topologyDragVerification?.reason || "",
                                  topologyFocusNoopAttempted:
                                    topologyFocusNoopVerification?.attempted === true,
                                  topologyFocusNoopReason:
                                    topologyFocusNoopVerification?.reason || "",
                                  topologyFocusNoopBeforeTrigger:
                                    topologyFocusNoopVerification?.beforeTrigger || "",
                                  topologyFocusNoopAfterTrigger:
                                    topologyFocusNoopVerification?.afterTrigger || "",
                                  topologyFocusNoopAfterState:
                                    topologyFocusNoopVerification?.afterState || "",
                                  topologyFocusNoopAfterDistancePx:
                                    Number(topologyFocusNoopVerification?.afterDistancePx || 0),
                                  topologyDragSelectionAttempts: topologyDragVerification?.selectionAttempts || 0,
                                  topologyDragFocusSelected: topologyDragVerification?.focusSelected === true,
                                  topologyDragFocusMoved: topologyDragVerification?.focusMoved === true,
                                  topologyDragFocusDelta: topologyDragVerification?.focusDelta || null,
                                  topologyDragRelationLabelClicked: topologyDragVerification?.relationLabelClicked === true,
                                  topologyDragNodePopoverExpandClicked: topologyDragVerification?.nodePopoverExpandClicked === true,
                                  topologyNodePopoverVerifyAttempted:
                                    topologyNodePopoverVerification?.attempted === true,
                                  topologyNodePopoverVerifyReason:
                                    topologyNodePopoverVerification?.reason || "",
                                  topologyNodePopoverVerifyExpanded:
                                    topologyNodePopoverVerification?.expanded === true,
                                  topologyNodePopoverVerifyCompactFactsVisible:
                                    topologyNodePopoverVerification?.compact?.factsVisible === true,
                                  topologyNodePopoverVerifyCompactFactsContract:
                                    topologyNodePopoverVerification?.compact?.factsContract || "",
                                  topologyNodePopoverVerifyCompactFactsReadableContract:
                                    topologyNodePopoverVerification?.compact?.factsReadableContract || "",
                                  topologyNodePopoverVerifyCompactFactsAccessibleName:
                                    topologyNodePopoverVerification?.compact?.factsAccessibleName || "",
                                  topologyNodePopoverVerifyCompactFactsTitle:
                                    topologyNodePopoverVerification?.compact?.factsTitle || "",
                                  topologyNodePopoverVerifyCompactFactsNoScores:
                                    topologyNodePopoverVerification?.compact?.factsNoScores || "",
                                  topologyNodePopoverVerifyCompactFactsHandoffContract:
                                    topologyNodePopoverVerification?.compact?.factsHandoffContract || "",
                                  topologyNodePopoverVerifyCompactFactsHandoffRoute:
                                    topologyNodePopoverVerification?.compact?.factsHandoffRoute || "",
                                  topologyNodePopoverVerifyCompactFactsHandoffTool:
                                    topologyNodePopoverVerification?.compact?.factsHandoffTool || "",
                                  topologyNodePopoverVerifyCompactFactsHandoffSummary:
                                    topologyNodePopoverVerification?.compact?.factsHandoffSummary || "",
                                  topologyNodePopoverVerifyCompactFactsHiddenRemainderCount:
                                    topologyNodePopoverVerification?.compact?.factsHiddenRemainderCount || 0,
                                  topologyNodePopoverVerifyCompactActionsVisible:
                                    topologyNodePopoverVerification?.compact?.actionsVisible === true,
                                  topologyNodePopoverVerifyCompactActionsContract:
                                    topologyNodePopoverVerification?.compact?.actionsContract || "",
                                  topologyNodePopoverVerifyCompactActionsReadableFlow:
                                    topologyNodePopoverVerification?.compact?.actionsReadableFlow || "",
                                  topologyNodePopoverVerifyCompactBriefVisible:
                                    topologyNodePopoverVerification?.compact?.briefVisible === true,
                                  topologyNodePopoverVerifyCompactBriefAction:
                                    topologyNodePopoverVerification?.compact?.briefAction || "",
                                  topologyNodePopoverVerifyCompactBriefReadableFlow:
                                    topologyNodePopoverVerification?.compact?.briefReadableFlow || "",
                                  topologyNodePopoverVerifyCompactBriefRailLabel:
                                    topologyNodePopoverVerification?.compact?.briefRailLabel || "",
                                  topologyNodePopoverVerifyCompactBriefTitle:
                                    topologyNodePopoverVerification?.compact?.briefTitle || "",
                                  topologyDragCompanionVisible: topologyDragVerification?.companionVisible === true,
                                  topologyDragCompanionAligned: topologyDragVerification?.companionAligned === true,
                                  topologyDragCompanionDelta: topologyDragVerification?.companionDelta || null,
                                  topologyDragCompanionSlug: topologyDragVerification?.companionSlug || "",
                                  topologyDragHandleSlug: topologyDragVerification?.dragHandleSlug || "",
                                  topologyDragCompanionCount: topologyDragVerification?.companionCount || 0,
                                  topologyDragVisibleCompanionCount: topologyDragVerification?.visibleCompanionCount || 0,
                                  topologyDragAlignedCompanionCount: topologyDragVerification?.alignedCompanionCount || 0,
                                  topologyDragClusterSize:
                                    Number(topologyDragVerification?.clusterSize || 0) ||
                                    Number((null)?.getAttribute("data-active-drag-cluster-size") || "0"),
                                  topologyDragPhysicsSyncContract:
                                    topologyDragVerification?.dragPhysicsSyncContract ||
                                    (null)?.getAttribute("data-drag-physics-sync-contract") ||
                                    "",
                                  topologyDragPhysicsReleasePolicy:
                                    topologyDragVerification?.dragPhysicsReleasePolicy ||
                                    (null)?.getAttribute("data-drag-physics-release-policy") ||
                                    "",
                                  topologyDragPhysicsSyncActiveDuring:
                                    topologyDragVerification?.dragPhysicsSyncActiveDuring === true,
                                  topologyDragWorkerAppliedFrameDelta:
                                    Number(topologyDragVerification?.workerAppliedFrameDelta || 0),
                                  topologyDragWorkerAppliedFrameChangeCount:
                                    Number(topologyDragVerification?.workerAppliedFrameChangeCount || 0),
                                  topologyDragRelationLabelVisibilityContract:
                                    topologyDragVerification?.dragRelationLabelVisibilityContract ||
                                    (null)?.getAttribute("data-drag-relation-label-visibility-contract") ||
                                    "",
                                  topologyDragRelationLabelExpectedCount:
                                    Number(
                                      topologyDragVerification?.dragRelationLabelExpectedCount ||
                                        (null)?.getAttribute("data-drag-relation-label-expected-count") ||
                                        "0"
                                    ),
                                  topologyDragRelationLabelVisibleCount:
                                    Number(
                                      topologyDragVerification?.dragRelationLabelVisibleCount ||
                                        (null)?.getAttribute("data-drag-relation-label-visible-count") ||
                                        "0"
                                    ),
                                  topologyDragRelationLabelVisibleDuringDrag:
                                    topologyDragVerification?.dragRelationLabelVisible === true,
                                  topologyDragRelationLabelCompactContract:
                                    topologyDragVerification?.dragRelationLabelCompactContract ||
                                    (null)?.getAttribute("data-drag-relation-label-compact-contract") ||
                                    "",
                                  topologyDragRelationLabelCompactCount:
                                    Number(
                                      topologyDragVerification?.dragRelationLabelCompactCount ||
                                        (null)?.getAttribute("data-drag-relation-label-compact-count") ||
                                        "0"
                                    ),
                                  topologyDragRelationLabelPresentation:
                                    topologyDragVerification?.dragRelationLabelPresentation || "",
                                  topologyDragRelationLabelCompact:
                                    topologyDragVerification?.dragRelationLabelCompact === true,
                                  topologyDragRelationLabelCompactItemContract:
                                    topologyDragVerification?.dragRelationLabelCompactItemContract || "",
                                  topologyDragRelationLabelReadableType:
                                    topologyDragVerification?.dragRelationLabelReadableType || "",
                                  topologyDragRelationLabelVisibleText:
                                    topologyDragVerification?.dragRelationLabelVisibleText || "",
                                  topologyDragRelationLabelBadgeWidth:
                                    Number(topologyDragVerification?.dragRelationLabelBadgeWidth || 0),
                                  topologyDragRelationLabelBadgeHeight:
                                    Number(topologyDragVerification?.dragRelationLabelBadgeHeight || 0),
                                  topologyDragRelationLabelBadgeRadius:
                                    Number(topologyDragVerification?.dragRelationLabelBadgeRadius || 0),
                                  topologyDragInteractionCueContract:
                                    topologyDragVerification?.dragInteractionCueContract || "",
                                  topologyDragInteractionCueVisible:
                                    topologyDragVerification?.dragInteractionCueVisible === true,
                                  topologyDragInteractionCueText:
                                    topologyDragVerification?.dragInteractionCueText || "",
                                  topologyDragInteractionCueLinkedCardCount:
                                    Number(topologyDragVerification?.dragInteractionCueLinkedCardCount || 0),
                                  topologyDragInteractionCueRelationLinkCount:
                                    Number(topologyDragVerification?.dragInteractionCueRelationLinkCount || 0),
                                  topologyDragReactiveContextContract:
                                    topologyDragVerification?.dragReactiveContextContract ||
                                    (null)?.getAttribute("data-drag-reactive-context-contract") ||
                                    "",
                                  topologyDragReactiveContextPolicy:
                                    topologyDragVerification?.dragReactiveContextPolicy ||
                                    (null)?.getAttribute("data-drag-reactive-context-policy") ||
                                    "",
                                  topologyDragReactiveContextOpacity:
                                    topologyDragVerification?.dragReactiveContextOpacity ||
                                    (null)?.getAttribute("data-drag-reactive-context-opacity") ||
                                    "",
                                  topologyDragReactiveContextOpacityToken:
                                    topologyDragVerification?.dragReactiveContextOpacityToken ||
                                    (null)?.getAttribute("data-drag-reactive-context-opacity-token") ||
                                    "",
                                  topologyDragReactiveContextVisualContract:
                                    topologyDragVerification?.dragReactiveContextVisualContract ||
                                    (null)?.getAttribute("data-drag-reactive-context-visual-contract") ||
                                    "",
                                  topologyDragReactiveContextVisualToken:
                                    topologyDragVerification?.dragReactiveContextVisualToken ||
                                    (null)?.getAttribute("data-drag-reactive-context-visual-token") ||
                                    "",
                                  topologyDragReactiveContextVisibleCount:
                                    Number(
                                      topologyDragVerification?.dragReactiveContextVisibleCount ||
                                        (null)?.getAttribute("data-drag-reactive-context-visible-count") ||
                                        "0"
                                    ),
                                  topologyDragReactiveMotionContract:
                                    topologyDragVerification?.dragReactiveMotionContract ||
                                    (null)?.getAttribute("data-drag-reactive-motion-contract") ||
                                    "",
                                  topologyDragReactiveMotionPolicy:
                                    topologyDragVerification?.dragReactiveMotionPolicy ||
                                    (null)?.getAttribute("data-drag-reactive-motion-policy") ||
                                    "",
                                  topologyDragReactiveMotionLinkedPolicy:
                                    topologyDragVerification?.dragReactiveMotionLinkedPolicy ||
                                    (null)?.getAttribute("data-drag-reactive-motion-linked-policy") ||
                                    "",
                                  topologyDragReactiveMotionVisibleCount:
                                    Number(
                                      topologyDragVerification?.dragReactiveMotionVisibleCount ||
                                        (null)?.getAttribute("data-drag-reactive-motion-visible-count") ||
                                        "0"
                                    ),
                                  topologyDragReactiveAmbientMotionVisibleCount:
                                    Number(
                                      topologyDragVerification?.dragReactiveAmbientMotionVisibleCount ||
                                        (null)?.getAttribute("data-drag-reactive-ambient-motion-visible-count") ||
                                        "0"
                                    ),
                                  topologyDragReactiveLinkedMotionVisibleCount:
                                    Number(
                                      topologyDragVerification?.dragReactiveLinkedMotionVisibleCount ||
                                        (null)?.getAttribute("data-drag-reactive-linked-motion-visible-count") ||
                                        "0"
                                    ),
                                  topologyDragReactiveMotionMaxObservedOffsetPx:
                                    Number(
                                      topologyDragVerification?.dragReactiveMotionMaxObservedOffsetPx ||
                                        (null)?.getAttribute("data-drag-reactive-motion-max-observed-offset-px") ||
                                        "0"
                                    ),
                                  topologyDragReactiveMotionMaxOffsetPx:
                                    Number(
                                      topologyDragVerification?.dragReactiveMotionMaxOffsetPx ||
                                        (null)?.getAttribute("data-drag-reactive-motion-max-offset-px") ||
                                        "0"
                                    ),
                                  topologyDragReactiveMotionBaseMaxOffsetPx:
                                    Number(
                                      topologyDragVerification?.dragReactiveMotionBaseMaxOffsetPx ||
                                        (null)?.getAttribute("data-drag-reactive-motion-base-max-offset-px") ||
                                        "0"
                                    ),
                                  topologyDragReactiveMotionLinkedMaxOffsetPx:
                                    Number(
                                      topologyDragVerification?.dragReactiveMotionLinkedMaxOffsetPx ||
                                        (null)?.getAttribute("data-drag-reactive-motion-linked-max-offset-px") ||
                                        "0"
                                    ),
                                  topologyDragReactiveMotionMaxOffsetToken:
                                    topologyDragVerification?.dragReactiveMotionMaxOffsetToken ||
                                    (null)?.getAttribute("data-drag-reactive-motion-max-offset-token") ||
                                    "",
                                  topologyDragTensionConnectorContract:
                                    topologyDragVerification?.dragTensionConnectorContract ||
                                    (null)?.getAttribute("data-drag-tension-connector-contract") ||
                                    "",
                                  topologyDragTensionConnectorPolicy:
                                    topologyDragVerification?.dragTensionConnectorPolicy ||
                                    (null)?.getAttribute("data-drag-tension-connector-policy") ||
                                    "",
                                  topologyDragTensionConnectorExpectedCount:
                                    Number(
                                      topologyDragVerification?.dragTensionConnectorExpectedCount ||
                                        (null)?.getAttribute("data-drag-tension-connector-expected-count") ||
                                        "0"
                                    ),
                                  topologyDragTensionConnectorVisibleCount:
                                    Number(
                                      topologyDragVerification?.dragTensionConnectorVisibleCount ||
                                        (null)?.getAttribute("data-drag-tension-connector-visible-count") ||
                                        "0"
                                    ),
                                  topologyDragTensionConnectorActiveOpacity:
                                    topologyDragVerification?.dragTensionConnectorActiveOpacity ||
                                    (null)?.getAttribute("data-drag-tension-connector-active-opacity") ||
                                    "",
                                  topologyDragTensionConnectorActiveStrokeWidth:
                                    topologyDragVerification?.dragTensionConnectorActiveStrokeWidth ||
                                    (null)?.getAttribute("data-drag-tension-connector-active-stroke-width") ||
                                    "",
                                  topologyDragSettledRoot:
                                    topologyDragVerification?.dragSettledRoot ||
                                    (null)?.getAttribute("data-drag-settled-root") ||
                                    "",
                                  topologyDragSettleFeedbackContract:
                                    topologyDragVerification?.dragSettleFeedbackContract ||
                                    (null)?.getAttribute("data-drag-settle-feedback-contract") ||
                                    "",
                                  topologyDragSettledClusterSize:
                                    Number(
                                      topologyDragVerification?.dragSettledClusterSize ||
                                        (null)?.getAttribute("data-drag-settled-cluster-size") ||
                                        "0"
                                    ),
                                  topologyLayoutWorkerPositionFrameSkipPolicy:
                                    topologyDragVerification?.workerFrameSkipPolicy ||
                                    sigmaViewport?.getAttribute("data-layout-worker-position-frame-skip-policy") ||
                                    "",
                                  topologyFrameProfile,
                                  topologyMapEngine,
                                  topologyV2CanvasInkPixels,
                                  topologyMapCanvasCardCount,
                                  topologyV2DetailPanelVisible,
                                  topologyV2DetailPanelNodeId:
                                    topologyV2DetailPanel?.getAttribute("data-selected-node-id") || "",
                                  topologyV2DetailPanelNodeKind:
                                    topologyV2DetailPanel?.getAttribute("data-selected-node-kind") || "",
                                  topologyV2DetailPanelNodeTitle:
                                    topologyV2DetailPanel?.getAttribute("data-selected-node-title") || "",
                                  topologyV2DetailPanelPresence:
                                    topologyV2DetailPanel?.getAttribute("data-presence") || "",
                                  topologyV2DetailPanelWidth:
                                    topologyV2DetailPanelRect?.width || 0,
                                  topologyV2DetailPanelHeight:
                                    topologyV2DetailPanelRect?.height || 0,
                                  topologyV2ProjectSourceReceiptVisible:
                                    aiSettingsVisible(topologyV2ProjectSourceReceipt),
                                  topologyV2ProjectSourceLayout:
                                    topologyV2ProjectSourceReceipt?.getAttribute("data-source-layout") || "",
                                  topologyV2ProjectSourceTopGap:
                                    topologyV2ProjectSourceReceipt?.getAttribute("data-source-top-gap") || "",
                                  topologyV2ProjectSourceGapVisible:
                                    aiSettingsVisible(topologyV2ProjectSourceGap),
                                  topologyV2ProjectSourceAction:
                                    topologyV2ProjectSourceReceipt?.getAttribute("data-source-action") || "",
                                  topologyV2ProjectSourceInlineActionCount:
                                    Number(topologyV2DetailPanelActions?.getAttribute("data-inline-action-count") || "0"),
                                  topologyV2ProjectSourceRenderedActionCount:
                                    topologyV2InlineActionWidths.length,
                                  topologyV2ProjectSourceInlineActionMinWidth:
                                    topologyV2InlineActionWidths.length > 0
                                      ? Math.min(...topologyV2InlineActionWidths)
                                      : 0,
                                  topologyV2ProjectSourceReceiptActionOverlap:
                                    topologyV2RectOverlapArea(
                                      topologyV2ProjectSourceReceiptRect,
                                      topologyV2DetailPanelActionsRect
                                    ),
                                  topologyV2ProjectSourceReceiptFooterOverlap:
                                    topologyV2RectOverlapArea(
                                      topologyV2ProjectSourceReceiptRect,
                                      topologyV2DetailPanelFooterRect
                                    ),
                                  topologyV2ProjectSourceActionFooterOverlap:
                                    topologyV2RectOverlapArea(
                                      topologyV2DetailPanelActionsRect,
                                      topologyV2DetailPanelFooterRect
                                    ),
                                  topologyV2EdgePanelVisible,
                                  topologyV2EdgePanelRole:
                                    topologyV2EdgePanel?.getAttribute("role") || "",
                                  topologyV2EdgePanelAriaLabel:
                                    topologyV2EdgePanel?.getAttribute("aria-label") || "",
                                  topologyV2EdgePanelSentence:
                                    topologyV2EdgePanel?.querySelector(
                                      '[data-testid="topology-v2-edge-sentence"]'
                                    )?.textContent || "",
                                  topologyV2EdgePanelWidth:
                                    topologyV2EdgePanelRect?.width || 0,
                                  topologyV2EdgePanelHeight:
                                    topologyV2EdgePanelRect?.height || 0,
                                  guidedTourOverlayVisible,
                                  topologyV2PrefersReducedMotion,
                                  topologyZoomVerifyAttempted:
                                    topologyZoomVerification?.attempted === true,
                                  topologyZoomVerifyReason:
                                    topologyZoomVerification?.reason || "",
                                  topologyZoomVerifyHookReason:
                                    topologyZoomVerification?.hookReason || "",
                                  topologyZoomLensPresentationActive:
                                    topologyZoomVerification?.presentationActive === true ||
                                    (null)?.getAttribute("data-zoom-lens-presentation-active") === "true",
                                  topologyZoomLensPresentationSource:
                                    topologyZoomVerification?.presentationSource ||
                                    (null)?.getAttribute("data-zoom-lens-presentation-source") || "",
                                  topologyZoomLensCardMaxWidthPx:
                                    ((null) &&
                                      Number.parseFloat(
                                        getComputedStyle((null))
                                          .getPropertyValue("--topology-zoom-lens-card-max-width")
                                      )) || 0,
                                  topologyZoomLensCameraRatio:
                                    Number(
                                      topologyZoomVerification?.cameraRatio ||
                                      (null)?.getAttribute("data-zoom-lens-camera-ratio") ||
                                      "0"
                                    ),
                                  topologyZoomLensActive:
                                    topologyZoomVerification?.active === true ||
                                    (null)?.getAttribute("data-zoom-lens-active") === "true",
                                  topologyZoomLensCardCompactionActive:
                                    topologyZoomVerification?.cardCompactionActive === true ||
                                    (null)?.getAttribute("data-zoom-lens-card-compaction-active") === "true",
                                  topologyZoomLensActiveCardCount:
                                    Number(
                                      topologyZoomVerification?.activeCardCount ||
                                      (null)?.getAttribute("data-zoom-lens-active-card-count") ||
                                      "0"
                                    ),
                                  topologyZoomLensVisibleActiveCardCount:
                                    Number(
                                      topologyZoomVerification?.visibleActiveCardCount ||
                                      (null)?.getAttribute("data-zoom-lens-visible-active-card-count") ||
                                      "0"
                                    ),
                                  topologyZoomLensPinProximityContract:
                                    topologyZoomVerification?.proximityPinContract ||
                                    (null)?.getAttribute("data-zoom-lens-pin-proximity-contract") || "",
                                  topologyZoomLensPinProximityActive:
                                    topologyZoomVerification?.proximityPinActive === true ||
                                    (null)?.getAttribute("data-zoom-lens-pin-proximity-active") === "true",
                                  topologyZoomLensProximityPinCount:
                                    Number(
                                      topologyZoomVerification?.proximityPinCount ||
                                      (null)?.getAttribute("data-zoom-lens-proximity-pin-count") ||
                                      "0"
                                    ),
                                  topologyZoomLensPinProximityRingToken:
                                    topologyZoomVerification?.proximityPinRingToken ||
                                    (null)?.getAttribute("data-zoom-lens-pin-proximity-ring-token") || "",
                                  topologyZoomLensPinGlyphContract:
                                    topologyZoomVerification?.pinGlyphContract || "",
                                  topologyZoomLensPinGlyphVisibleCount:
                                    Number(topologyZoomVerification?.pinGlyphVisibleCount || "0"),
                                  topologyDragConnectorCount:
                                    Number(topologyDragVerification?.connectorCount || 0) ||
                                    topologyDragConnectorCount,
                                  topologyDragConnectorDrawable: topologyDragConnectorD.startsWith("M "),
                                  topologyDragConnectorClearance
                                }
                              });
                              } catch (markerError) {
                                // marker 수집이 특정 모드의 DOM 에서 throw 하면 빈 payload
                                // 가 12번 찍히고 원인이 사라진다 — 에러를 payload 로 노출.
                                return JSON.stringify({
                                  href: location.href,
                                  title: document.title,
                                  bodyText: "",
                                  bodyChildren: document.body ? document.body.children.length : null,
                                  readyState: document.readyState,
                                  bg: "",
                                  color: "",
                                  width: innerWidth,
                                  height: innerHeight,
                                  markers: {
                                    markerScriptError: String(
                                      (markerError && (markerError.message || markerError.stack)) || markerError
                                    )
                                  }
                                });
                              }
                            })()"#,
                            |result| write_verify_line(format!("[ontology-atlas-webview-verify] {result}")),
                            );
                            std::thread::sleep(Duration::from_millis(
                                WEBVIEW_VERIFY_MARKER_INTERVAL_MS,
                            ));
                        }
                    });
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            acp_detect_runtimes,
            acp_diagnose,
            acp_repair,
            acp_reset_connection,
            open_external_url,
            acp_node_plan,
            acp_install_node,
            acp_install_plan,
            acp_install_cli,
            acp_install_progress,
            acp_start,
            acp_send,
            acp_stop,
            acp_permission_verdict,
            pick_vault_directory,
            inspect_project_source,
            list_vault_directory,
            vault_fingerprint,
            read_vault_text_file,
            read_vault_binary_file,
            write_vault_text_file,
            remove_vault_entry,
            ensure_vault_directory,
            vault_path_exists,
            open_vault_in_finder,
            ensure_default_vault_parent_dir,
            start_vault_watch,
            secrets::secret_set,
            secrets::secret_status,
            secrets::secret_clear,
            llm::secret_verify,
            llm::llm_chat,
            git::git_status,
            git::git_probe,
            git::git_init,
            git::git_set_remote,
            git::git_snapshot,
            git::git_history,
            git::git_diff,
            git::git_commit_diff,
            git::git_pull,
            git::git_fetch,
            agent_setup::mcp_bundled_server,
            agent_setup::plan_agent_config,
            agent_setup::write_agent_config,
            agent_setup::verify_mcp_server,
        ])
        .build(context)
        .expect("error while building ontology-atlas desktop app")
        .run(|app_handle, event| match event {
            RunEvent::Ready => {
                show_main_window(app_handle);
                apply_verify_window_size(app_handle);
                schedule_show_main_window(app_handle.clone());
            }
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => {
                show_main_window(app_handle);
                apply_verify_window_size(app_handle);
                schedule_show_main_window(app_handle.clone());
            }
            // Do not create a state where the adapter and its children continue running even after the window is closed.
            RunEvent::ExitRequested { .. } | RunEvent::Exit => {
                terminate_all_acp_sessions(app_handle);
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    /// **It is an allowlist, not a denylist** — denylists are quietly bypassed whenever new schemes appear. This location passes the address given by the screen directly to the OS,
    /// so if bypassed, a single link could open arbitrary things.
    #[test]
    fn only_http_urls_are_handed_to_the_os() {
        for good in ["https://example.com", "http://example.com/a?b=c", "HTTPS://EXAMPLE.COM"] {
            assert!(crate::is_openable_url(good), "{good} 를 막았다");
        }
        for bad in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,x",
            "ftp://example.com",
            "/ko/topology/",
            "",
            "https://exa mple.com",
            "https://example.com\nfile:///etc/passwd",
        ] {
            assert!(!crate::is_openable_url(bad), "{bad:?} 를 열려고 한다");
        }
    }

    use super::*;

    struct ControlledWriter {
        gate: Option<(
            std::sync::mpsc::SyncSender<()>,
            std::sync::mpsc::Receiver<()>,
        )>,
        bytes: Arc<Mutex<Vec<u8>>>,
    }

    impl ControlledWriter {
        fn blocked(
            entered: std::sync::mpsc::SyncSender<()>,
            release: std::sync::mpsc::Receiver<()>,
        ) -> Self {
            Self {
                gate: Some((entered, release)),
                bytes: Arc::new(Mutex::new(Vec::new())),
            }
        }

        fn recording() -> Self {
            Self {
                gate: None,
                bytes: Arc::new(Mutex::new(Vec::new())),
            }
        }
    }

    impl Write for ControlledWriter {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            if let Some((entered, release)) = self.gate.take() {
                entered
                    .send(())
                    .map_err(|_| std::io::Error::other("test-entered-channel-closed"))?;
                release
                    .recv()
                    .map_err(|_| std::io::Error::other("test-release-channel-closed"))?;
            }
            self.bytes
                .lock()
                .map_err(|_| std::io::Error::other("test-writer-poisoned"))?
                .extend_from_slice(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    fn while_one_session_write_is_blocked<T, F>(action: F) -> Result<T, String>
    where
        T: Send + 'static,
        F: FnOnce(Arc<AcpSessions>) -> T + Send + 'static,
    {
        let sessions = Arc::new(AcpSessions::default());
        let (entered_tx, entered_rx) = std::sync::mpsc::sync_channel(1);
        let (release_tx, release_rx) = std::sync::mpsc::sync_channel(1);
        sessions
            .insert(
                "blocked".to_string(),
                11,
                PathBuf::from("/vault-blocked"),
                ControlledWriter::blocked(entered_tx, release_rx),
            )
            .unwrap();
        sessions
            .insert(
                "other".to_string(),
                22,
                PathBuf::from("/vault-other"),
                ControlledWriter::recording(),
            )
            .unwrap();

        let blocked_sessions = Arc::clone(&sessions);
        let blocked = std::thread::spawn(move || blocked_sessions.send_line("blocked", "wait"));
        entered_rx
            .recv_timeout(Duration::from_secs(1))
            .map_err(|err| format!("blocked writer did not start: {err}"))?;

        let (started_tx, started_rx) = std::sync::mpsc::sync_channel(1);
        let (done_tx, done_rx) = std::sync::mpsc::sync_channel(1);
        let action_thread = std::thread::spawn(move || {
            let _ = started_tx.send(());
            let result = action(sessions);
            let _ = done_tx.send(result);
        });
        started_rx
            .recv_timeout(Duration::from_secs(1))
            .map_err(|err| format!("registry action did not start: {err}"))?;
        let outcome = done_rx
            .recv_timeout(Duration::from_millis(250))
            .map_err(|err| format!("registry action waited for blocked stdin: {err}"));

        let _ = release_tx.send(());
        blocked
            .join()
            .map_err(|_| "blocked send thread panicked".to_string())?
            .map_err(|err| format!("blocked send failed: {err}"))?;
        action_thread
            .join()
            .map_err(|_| "registry action thread panicked".to_string())?;
        outcome
    }

    #[test]
    fn blocked_send_in_one_session_does_not_block_another_session() {
        let result = while_one_session_write_is_blocked(|sessions| {
            sessions.send_line("other", "still-live")
        })
        .expect("another session must not share the blocked stdin lock");
        assert_eq!(result, Ok(()));
    }

    #[test]
    fn blocked_send_does_not_block_stop_take() {
        let result = while_one_session_write_is_blocked(|sessions| sessions.take_pid("blocked"))
            .expect("stop must be able to take the pid and break the blocked pipe");
        assert_eq!(result, Ok(Some(11)));
    }

    #[test]
    fn blocked_send_does_not_delay_child_exit_cleanup() {
        let result = while_one_session_write_is_blocked(|sessions| sessions.remove("blocked"))
            .expect("child exit cleanup must not wait for stdin");
        assert_eq!(result, Ok(()));
    }

    #[test]
    fn blocked_send_does_not_delay_shutdown_drain() {
        let result = while_one_session_write_is_blocked(|sessions| sessions.drain_pids())
            .expect("shutdown must collect pids without waiting for stdin");
        let mut pids = result.unwrap();
        pids.sort_unstable();
        assert_eq!(pids, vec![11, 22]);
    }

    #[test]
    fn permission_verdict_uses_the_registered_session_root_and_unknown_sessions_ask() {
        let base = std::env::temp_dir().join(format!(
            "atlas-acp-session-root-{}",
            std::process::id()
        ));
        let vault = base.join("vault");
        let outside = base.join("outside.md");
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::write(&outside, "outside").unwrap();

        let sessions = AcpSessions::default();
        sessions
            .insert(
                "bound-session".to_string(),
                33,
                std::fs::canonicalize(&vault).unwrap(),
                ControlledWriter::recording(),
            )
            .unwrap();

        assert_eq!(
            permission_verdict_for_session(
                &sessions,
                "bound-session",
                vault.join("inside.md").to_str()
            ),
            acp::PermissionVerdict::AllowInsideVault
        );
        assert_eq!(
            permission_verdict_for_session(&sessions, "bound-session", outside.to_str()),
            acp::PermissionVerdict::Ask
        );
        assert_eq!(
            permission_verdict_for_session(
                &sessions,
                "caller-invented-session",
                outside.to_str()
            ),
            acp::PermissionVerdict::Ask,
            "등록되지 않은 세션은 화면이 어떤 경로를 보내도 자동 허용하면 안 된다"
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn normalize_relative_path_accepts_nested_vault_paths() {
        assert_eq!(
            normalize_relative_path("docs/ontology/project.md").unwrap(),
            PathBuf::from("docs/ontology/project.md")
        );
        assert_eq!(
            normalize_relative_path("./docs//ontology").unwrap(),
            PathBuf::from("docs/ontology")
        );
    }

    #[test]
    fn normalize_relative_path_rejects_escape_paths() {
        for path in [
            "../outside.md",
            "docs/../../outside.md",
            "/tmp/outside.md",
            "docs/../outside.md",
        ] {
            let error = normalize_relative_path(path).unwrap_err();
            assert_eq!(error, "relative path must stay inside the selected vault");
        }
    }

    #[test]
    fn resolve_inside_keeps_paths_under_the_selected_root() {
        assert_eq!(
            resolve_inside("/Users/me/vault", "docs/project.md").unwrap(),
            PathBuf::from("/Users/me/vault/docs/project.md")
        );
    }

    #[test]
    fn open_vault_in_finder_rejects_non_directory_root() {
        let error = open_vault_in_finder("/path/that/does/not/exist".into()).unwrap_err();
        assert!(!error.is_empty());
    }

    /// 2026-08-16 — The folder picker accepted `/` (Macintosh HD) as the vault root, and what blocked it was
    /// not us but macOS's warning dialog. Since the vault root will soon become the agent's working
    /// folder, we close that door first.
    /// 2026-08-17 — On macOS, **`.app` is a directory.** Checking only `is_dir()`
    /// allows it through, and `open <path>` does not open the folder but **executes that program**. "View in Finder" must never be done.
    ///
    /// We also block the vault root for the same reason: the bundle interior is the app's internal structure, not a place for users
    /// to store documents, and even less so when it becomes the agent's working folder.
    #[test]
    fn vault_root_rejection_blocks_macos_bundles() {
        for path in [
            "/Applications/Calculator.app",
            "/Users/someone/Downloads/Thing.app",
            "/tmp/Some.bundle",
            "/tmp/Some.framework",
        ] {
            assert_eq!(
                vault_root_rejection(Path::new(path)),
                Some("bundle-directory"),
                "{path} 이 통과하면 폴더를 여는 대신 프로그램이 실행된다"
            );
        }
    }

    #[test]
    fn vault_root_rejection_allows_ordinary_folders_with_dots() {
        // If you always reject, that's not a validator. A normal folder with dots passes through.
        for path in ["/tmp/my.notes", "/tmp/v1.2.3", "/tmp/plain"] {
            assert_eq!(vault_root_rejection(Path::new(path)), None, "{path}");
        }
    }

    #[test]
    fn vault_root_rejection_blocks_the_filesystem_root() {
        assert_eq!(
            vault_root_rejection(Path::new("/")),
            Some("filesystem-root")
        );
    }

    #[test]
    fn vault_root_rejection_blocks_named_system_directories() {
        // When this list is empty, the check passes and blocks nothing —
        // a gate looping over an empty set isn't a gate, so assert that first.
        let blocked: Vec<&str> = if cfg!(target_os = "macos") {
            vec!["/Applications", "/System", "/Library", "/Users", "/Volumes"]
        } else if cfg!(target_os = "linux") {
            vec!["/home", "/usr", "/etc", "/var"]
        } else if cfg!(windows) {
            vec!["C:\\Windows", "C:\\Program Files", "C:\\Users"]
        } else {
            vec![]
        };
        assert!(
            !blocked.is_empty(),
            "이 플랫폼에는 막을 자리가 하나도 등록돼 있지 않다"
        );
        for dir in blocked {
            assert_eq!(
                vault_root_rejection(Path::new(dir)),
                Some("system-directory"),
                "{dir} 는 볼트 루트로 받으면 안 된다"
            );
        }
    }

    #[test]
    fn vault_root_rejection_blocks_the_home_directory_itself() {
        let key = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
        let Some(home) = std::env::var_os(key).map(PathBuf::from) else {
            return; // In environments without a home directory (some CI), there's nothing to judge
        };
        let Ok(home) = fs::canonicalize(home) else {
            return;
        };
        assert_eq!(
            vault_root_rejection(&home),
            Some("home-directory"),
            "홈 디렉터리 자체는 볼트가 아니다"
        );
    }

    #[test]
    fn vault_root_rejection_allows_ordinary_folders_inside_home() {
        // Blocking the most common legitimate bolt breaks this product.
        // The **inside** of the home must pass.
        let key = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
        let Some(home) = std::env::var_os(key).map(PathBuf::from) else {
            return;
        };
        assert_eq!(vault_root_rejection(&home.join("notes")), None);
        assert_eq!(vault_root_rejection(&home.join("code/atlas/docs")), None);
        // The inside of system directories is also justified depending on location (e.g., external drives).
        if cfg!(target_os = "macos") {
            assert_eq!(vault_root_rejection(Path::new("/Volumes/Work/vault")), None);
        }
    }

    #[test]
    fn default_vault_parent_dir_joins_documents_and_container_name() {
        assert_eq!(
            default_vault_parent_dir("/Users/me"),
            PathBuf::from("/Users/me/Documents/Ontology Atlas")
        );
    }

    #[test]
    fn verify_base_url_guard_rejects_literal_breaking_values() {
        assert!(is_safe_verify_base_url("http://localhost:11434"));
        assert!(is_safe_verify_base_url("https://runner.internal:8080/v1"));
        for unsafe_url in [
            "",
            "localhost:11434",
            "http://localhost:11434\"",
            "http://localhost:11434 && echo",
            "http://local\\host",
            "javascript:alert(1)",
        ] {
            assert!(!is_safe_verify_base_url(unsafe_url), "{unsafe_url}");
        }
    }

    #[test]
    fn ai_settings_verify_script_carries_the_requested_base_url_and_settings_controls() {
        let script = build_webview_verify_ai_settings_script("http://127.0.0.1:1234");

        assert!(script.contains("const baseUrl = \"http://127.0.0.1:1234\""));
        assert!(!script.contains("__ATLAS_AI_BASE_URL__"));
        assert!(script.contains("window.__ontologyAtlasAiSettingsVerify = result"));
        for test_id in [
            "app-settings-trigger",
            "app-settings-nav-ai",
            "app-settings-pane-ai",
            "ai-register-local",
            "ai-local-url",
            "ai-verify-local",
            "ai-local-model-listbox",
            "ai-local-connected",
        ] {
            assert!(script.contains(test_id), "{test_id}");
        }
        // Toggling the control every poll causes it to open and close repeatedly.
        assert!(script.contains("CLICK_COOLDOWN"));
        // There is only one place left to declare success.
        assert_eq!(script.matches("\"done\"").count(), 1);
    }

    #[test]
    fn webview_verify_route_script_navigates_to_target_path() {
        let script = build_webview_verify_route_script("/en/topology/");

        assert!(script.contains("document.querySelectorAll(\"a[href]\")"));
        assert!(script.contains("currentPath === targetPath"));
        assert!(script.contains("targetLink.click()"));
        assert!(script.contains("__ontologyAtlasVerifyRouteMisses < 14"));
        assert!(script.contains("__ontologyAtlasVerifyExpectedRoute"));
        assert!(script.contains("window.setInterval"));
        assert!(script.contains("__ontologyAtlasVerifyRouteTicks >= 60"));
        assert!(script.contains("history.replaceState({}, \"\", next)"));
        assert!(script.contains("window.dispatchEvent(new Event(\"app:urlchange\"))"));
        assert!(!script.contains("location.replace(next)"));
        assert!(script.contains("location.pathname + location.search + location.hash"));
        assert!(script.contains("\"/en/topology/\""));
    }

    #[test]
    fn webview_verify_payload_marks_korean_path_mode_as_topology_relief() {
        let source = include_str!("lib.rs")
            .split("#[cfg(test)]")
            .next()
            .unwrap_or("");

        assert!(source.contains("온톨로지 지형도"));
        assert!(source.contains("후보 \\d+\\/\\d+개 표시"));
        // v2 canvas copy — the original census message must be included in the relief marker.
        assert!(source.contains("개념 \\d+개 · 관계 \\d+개"));
        // Draw evidence to prevent false positives where only the v2 canvas exists.
        assert!(source.contains("topologyV2CanvasInkPixels"));
        assert!(source.contains("getImageData"));
        // The `data-focus-cluster-size` assertion was removed (cleaned up markers on 2026-08-12) — that
        // attribute doesn't exist anywhere in the UI ("retired marker"); this line was a reverse gate forcing
        // dead queries to remain in the probe.
        assert!(source.contains("dragHandleSlug"));
        assert!(source.contains("data-drag-physics-sync-contract"));
        assert!(source.contains("data-drag-physics-release-policy"));
        assert!(source.contains("topologyDragPhysicsSyncActiveDuring"));
        assert!(source.contains("topologyDragWorkerAppliedFrameDelta"));
        assert!(source.contains("topologyDragWorkerAppliedFrameChangeCount"));
        assert!(source.contains("topologyDragRelationLabelVisibilityContract"));
        assert!(source.contains("topologyDragRelationLabelVisibleDuringDrag"));
        assert!(source.contains("topologyDragRelationLabelCompactContract"));
        assert!(source.contains("topologyDragRelationLabelPresentation"));
        assert!(source.contains("topologyDragRelationLabelReadableType"));
        assert!(source.contains("topologyDragReactiveContextContract"));
        assert!(source.contains("topologyDragInteractionCueContract"));
        assert!(source.contains("topologyDragReactiveContextVisibleCount"));
        assert!(source.contains("__ontologyAtlasTopologyZoomVerify"));
        assert!(source.contains("topologyZoomVerifyReason"));
        assert!(source.contains("topologyCameraDepthContract"));
        assert!(source.contains("data-camera-depth-contract"));
        assert!(source.contains("topologyZoomLensPresentationSource"));
        assert!(source.contains("topologySupportChromeZoomLensActive"));
        assert!(source.contains("topologyMinimapState"));
        assert!(source.contains("topologyDragReactiveMotionContract"));
        assert!(source.contains("topologyDragReactiveMotionLinkedPolicy"));
        assert!(source.contains("topologyDragReactiveMotionMaxObservedOffsetPx"));
        assert!(source.contains("topologyDragReactiveAmbientMotionVisibleCount"));
        assert!(source.contains("topologyDragReactiveLinkedMotionVisibleCount"));
        assert!(source.contains("topologyDragReactiveMotionLinkedMaxOffsetPx"));
        assert!(source.contains("topologyDragTensionConnectorContract"));
        assert!(source.contains("topologyDragTensionConnectorVisibleCount"));
        assert!(source.contains("topologyDragTensionConnectorActiveOpacity"));
        assert!(source.contains("__ontologyAtlasTopologyFocusNoopVerify"));
        assert!(source.contains("data-selected-relation-endpoint=\"true\""));
        assert!(source.contains("topologySelectedRelationEndpointCards"));
        assert!(source.contains("topologySelectedRelationLowerPriorityVisibleDimmedCount"));
    }

    #[test]
    fn webview_verify_route_reset_script_clears_last_route_before_click_navigation() {
        let script = build_webview_verify_route_reset_script("/ko/topology/");

        assert!(script.contains("window.localStorage.removeItem(\"ontology-atlas:last-route\")"));
        assert!(script.contains("window.localStorage.setItem(\"ontology-atlas:locale\", \"ko\")"));
        assert!(script.contains("location.replace(localeRoot)"));
        assert!(script.contains("\"/ko/\""));
        assert!(!script.contains("\"/ko/topology/\""));
    }

    #[test]
    fn webview_verify_vault_bootstrap_targets_only_the_incognito_key_value_store() {
        let script =
            build_webview_verify_vault_bootstrap_script("/tmp/Atlas Fixture/docs/ontology");

        assert!(script.contains("indexedDB.open(\"demo-kv\", 1)"));
        assert!(script.contains("\"docs-vault:fs-handle:current\""));
        assert!(script.contains("desktopRootPath: rootPath"));
        assert!(script.contains("\"/tmp/Atlas Fixture/docs/ontology\""));
        assert!(script.contains("const fixtureName = \"ontology\""));
        assert!(script.contains("ontology-atlas:verify-fixture-vault"));
        assert!(script.contains("window.localStorage.setItem(\"guided-tour:v1\", \"skipped\")"));
        assert!(script.contains("location.reload()"));
        assert!(!script.contains("indexedDB.deleteDatabase"));
    }

    #[test]
    fn webview_verifier_isolates_created_windows_without_mutating_normal_app_storage() {
        let mut config = tauri::Config::default();
        config.app.windows.push(Default::default());
        config.app.windows.push(Default::default());
        config.app.windows[1].create = false;

        assert_eq!(isolate_verify_webview_storage(&mut config, false), 0);
        assert!(!config.app.windows[0].incognito);
        assert!(!config.app.windows[1].incognito);

        assert_eq!(isolate_verify_webview_storage(&mut config, true), 1);
        assert!(config.app.windows[0].incognito);
        assert!(!config.app.windows[1].incognito);
    }

    #[test]
    fn parse_verify_window_size_accepts_width_by_height_only() {
        assert_eq!(parse_verify_window_size("1100x800"), Some((1100.0, 800.0)));
        assert_eq!(parse_verify_window_size("1100"), None);
        assert_eq!(parse_verify_window_size("widextall"), None);
        assert_eq!(parse_verify_window_size("0x800"), None);
    }

    #[test]
    fn remove_vault_entry_rejects_root_removal() {
        let error = remove_vault_entry("/tmp/vault".into(), "".into(), Some(true)).unwrap_err();
        assert_eq!(error, "refusing to remove the selected vault root");
    }

    #[test]
    fn remove_vault_entry_removes_files_and_directories() {
        let root = std::env::temp_dir().join(format!(
            "ontology-atlas-remove-test-{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("docs/nested")).unwrap();
        fs::write(root.join("note.md"), "hello").unwrap();
        fs::write(root.join("docs/nested/file.md"), "nested").unwrap();

        remove_vault_entry(root.to_string_lossy().to_string(), "note.md".into(), None).unwrap();
        assert!(!root.join("note.md").exists());

        let non_recursive_error = remove_vault_entry(
            root.to_string_lossy().to_string(),
            "docs".into(),
            Some(false),
        )
        .unwrap_err();
        assert!(!non_recursive_error.is_empty());
        assert!(root.join("docs").exists());

        remove_vault_entry(
            root.to_string_lossy().to_string(),
            "docs".into(),
            Some(true),
        )
        .unwrap();
        assert!(!root.join("docs").exists());

        fs::remove_dir_all(root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn remove_vault_entry_unlinks_an_internal_symlink_without_deleting_its_target() {
        use std::os::unix::fs::symlink;

        let nonce = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("ontology-atlas-remove-link-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        let target = root.join("real.md");
        let alias = root.join("alias.md");
        fs::write(&target, "keep me").unwrap();
        symlink(&target, &alias).unwrap();

        remove_vault_entry(
            root.to_string_lossy().to_string(),
            "alias.md".into(),
            Some(false),
        )
        .unwrap();

        assert!(!alias.exists(), "링크 엔트리가 남았다");
        assert_eq!(fs::read_to_string(&target).unwrap(), "keep me");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn inspect_project_source_returns_a_deterministic_bounded_folder_inventory() {
        let root = std::env::temp_dir().join(format!(
            "ontology-atlas-project-source-folder-{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("src")).unwrap();
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::write(root.join("README.md"), "hello").unwrap();
        fs::write(root.join("src/index.ts"), "export const value = 1;\n").unwrap();
        fs::write(root.join("node_modules/pkg/index.js"), "ignored").unwrap();

        let first = inspect_project_source(root.to_string_lossy().to_string()).unwrap();
        let second = inspect_project_source(root.to_string_lossy().to_string()).unwrap();

        assert_eq!(first.kind, "folder");
        assert_eq!(
            first.root_path,
            fs::canonicalize(&root).unwrap().to_string_lossy()
        );
        assert!(first.source_id.starts_with("sha256:"));
        assert!(first.fingerprint.starts_with("sha256:"));
        assert_eq!(first.revision, first.fingerprint);
        assert_eq!(first.dirty, None);
        assert!(!first.truncated);
        assert_eq!(first.files, ["README.md", "src/index.ts"]);
        assert_eq!(first.fingerprint, second.fingerprint);
        assert_eq!(first.source_id, second.source_id);

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn inspect_project_source_promotes_a_selected_subfolder_to_its_git_worktree() {
        let root = std::env::temp_dir().join(format!(
            "ontology-atlas-project-source-git-{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("packages/app")).unwrap();
        fs::write(root.join("README.md"), "repo\n").unwrap();
        fs::write(
            root.join("packages/app/index.ts"),
            "export const value = 1;\n",
        )
        .unwrap();

        for args in [
            vec!["init"],
            vec!["config", "user.email", "atlas@example.invalid"],
            vec!["config", "user.name", "Atlas Test"],
            vec!["add", "."],
            vec!["commit", "-m", "initial"],
        ] {
            let output = Command::new("git")
                .args(args)
                .current_dir(&root)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
        Command::new("git")
            .args([
                "remote",
                "add",
                "origin",
                "git@example.invalid:private/repo.git",
            ])
            .current_dir(&root)
            .output()
            .unwrap();
        let selected = root.join("packages/app");
        let clean = inspect_project_source(selected.to_string_lossy().to_string()).unwrap();
        assert_eq!(clean.dirty, Some(false));

        fs::write(
            root.join("packages/app/index.ts"),
            "export const value = 2;\n",
        )
        .unwrap();
        fs::write(root.join("packages/app/new.ts"), "export {};\n").unwrap();

        let inspection = inspect_project_source(selected.to_string_lossy().to_string()).unwrap();
        let head = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&root)
            .output()
            .unwrap();

        assert_eq!(inspection.kind, "git");
        assert_eq!(
            inspection.root_path,
            fs::canonicalize(&root).unwrap().to_string_lossy()
        );
        assert_eq!(
            inspection.revision,
            String::from_utf8_lossy(&head.stdout).trim()
        );
        assert_eq!(inspection.dirty, Some(true));
        assert_ne!(inspection.fingerprint, clean.fingerprint);
        assert_eq!(
            inspection.files,
            ["README.md", "packages/app/index.ts", "packages/app/new.ts"]
        );
        assert!(!inspection
            .files
            .iter()
            .any(|path| path.starts_with(".git/")));
        assert!(!inspection.source_id.contains("example.invalid"));
        assert!(!inspection.fingerprint.contains("example.invalid"));

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn inspect_project_source_uses_git_visible_files_instead_of_ignored_inventory_noise() {
        let root = std::env::temp_dir().join(format!(
            "ontology-atlas-project-source-git-ignore-{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("src")).unwrap();
        fs::create_dir_all(root.join("generated")).unwrap();
        fs::write(root.join(".gitignore"), "generated/\n").unwrap();
        fs::write(root.join("src/index.ts"), "export const value = 1;\n").unwrap();
        for index in 0..=SOURCE_INVENTORY_MAX_FILES {
            fs::write(root.join("generated").join(format!("{index:04}.txt")), "x").unwrap();
        }

        for args in [
            vec!["init"],
            vec!["config", "user.email", "atlas@example.invalid"],
            vec!["config", "user.name", "Atlas Test"],
            vec!["add", "."],
            vec!["commit", "-m", "initial"],
        ] {
            let output = Command::new("git")
                .args(args)
                .current_dir(&root)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
        }

        let inspection = inspect_project_source(root.to_string_lossy().to_string()).unwrap();

        assert!(!inspection.truncated);
        assert_eq!(inspection.files, [".gitignore", "src/index.ts"]);
        assert!(!inspection
            .files
            .iter()
            .any(|path| path.starts_with("generated/")));

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn inspect_project_source_is_registered_with_the_tauri_invoke_handler() {
        let source = include_str!("lib.rs");
        let handler = source
            .split(".invoke_handler(tauri::generate_handler![")
            .nth(1)
            .and_then(|rest| rest.split("])").next())
            .expect("Tauri invoke handler");

        assert!(handler.contains("inspect_project_source"));
    }

    #[test]
    fn inspect_project_source_reports_when_the_file_inventory_is_truncated() {
        let root = std::env::temp_dir().join(format!(
            "ontology-atlas-project-source-limit-{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        for index in 0..=SOURCE_INVENTORY_MAX_FILES {
            fs::write(root.join(format!("{index:04}.txt")), "x").unwrap();
        }

        let inspection = inspect_project_source(root.to_string_lossy().to_string()).unwrap();

        assert!(inspection.truncated);
        assert_eq!(inspection.files.len(), SOURCE_INVENTORY_MAX_FILES);
        assert_eq!(
            inspection.files.first().map(String::as_str),
            Some("0000.txt")
        );
        assert_eq!(
            inspection.files.last().map(String::as_str),
            Some("3999.txt")
        );

        fs::remove_dir_all(root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn vault_commands_reject_symlink_escapes() {
        use std::os::unix::fs::symlink;

        let nonce = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("ontology-atlas-vault-root-{nonce}"));
        let outside = std::env::temp_dir().join(format!("ontology-atlas-vault-outside-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("outside.md"), "outside").unwrap();
        symlink(outside.join("outside.md"), root.join("linked.md")).unwrap();
        symlink(&outside, root.join("linked-dir")).unwrap();

        let root_path = root.to_string_lossy().to_string();
        let read_error = read_vault_text_file(root_path.clone(), "linked.md".into()).unwrap_err();
        assert_eq!(
            read_error,
            "resolved path must stay inside the selected vault"
        );

        let write_error =
            write_vault_text_file(root_path.clone(), "linked.md".into(), "changed".into())
                .unwrap_err();
        assert_eq!(
            write_error,
            "resolved path must stay inside the selected vault"
        );
        assert_eq!(
            fs::read_to_string(outside.join("outside.md")).unwrap(),
            "outside"
        );

        let exists_error =
            vault_path_exists(root_path.clone(), "linked.md".into(), "file".into()).unwrap_err();
        assert_eq!(
            exists_error,
            "resolved path must stay inside the selected vault"
        );

        let mkdir_error =
            ensure_vault_directory(root_path.clone(), "linked-dir/new".into()).unwrap_err();
        assert_eq!(
            mkdir_error,
            "resolved path must stay inside the selected vault"
        );
        assert!(!outside.join("new").exists());

        let nested_write_error = write_vault_text_file(
            root_path.clone(),
            "linked-dir/new/created-outside.md".into(),
            "outside".into(),
        )
        .unwrap_err();
        assert_eq!(
            nested_write_error,
            "resolved path must stay inside the selected vault"
        );
        assert!(!outside.join("new").exists());

        let remove_error =
            remove_vault_entry(root_path, "linked.md".into(), Some(false)).unwrap_err();
        assert_eq!(
            remove_error,
            "resolved path must stay inside the selected vault"
        );

        fs::remove_dir_all(root).ok();
        fs::remove_dir_all(outside).ok();
    }
}

#[cfg(test)]
mod atomic_write_tests {
    use super::{
        ensure_vault_directory_after_validation, write_text_atomically,
        write_vault_text_file_after_validation,
    };

    #[cfg(unix)]
    #[test]
    fn vault_write_is_not_redirected_when_parent_is_replaced_after_validation() {
        use std::os::unix::fs::symlink;

        let base = std::env::temp_dir().join(format!(
            "oatlas-vault-parent-race-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let vault = base.join("vault");
        let sidecar = vault.join(".ontology-atlas");
        let original_sidecar = vault.join(".ontology-atlas-original");
        let outside = base.join("outside");
        std::fs::create_dir_all(&sidecar).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(sidecar.join("project-sources.json"), "inside-old").unwrap();
        std::fs::write(outside.join("project-sources.json"), "outside").unwrap();

        let result = write_vault_text_file_after_validation(
            vault.to_string_lossy().into_owned(),
            ".ontology-atlas/project-sources.json".into(),
            "inside-new".into(),
            || {
                std::fs::rename(&sidecar, &original_sidecar).unwrap();
                symlink(&outside, &sidecar).unwrap();
            },
        );

        assert!(
            result.is_ok(),
            "안정된 원래 부모 쓰기는 성공해야 한다: {result:?}"
        );
        assert_eq!(
            std::fs::read_to_string(outside.join("project-sources.json")).unwrap(),
            "outside",
            "검증 뒤 생긴 부모 symlink를 따라 볼트 밖 파일을 바꿨다"
        );
        assert_eq!(
            std::fs::read_to_string(original_sidecar.join("project-sources.json")).unwrap(),
            "inside-new"
        );
        std::fs::remove_dir_all(&base).ok();
    }

    #[cfg(unix)]
    #[test]
    fn vault_mkdir_has_no_outside_effect_when_parent_is_replaced_after_validation() {
        use std::os::unix::fs::symlink;

        let base = std::env::temp_dir().join(format!(
            "oatlas-vault-mkdir-race-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let vault = base.join("vault");
        let sidecar = vault.join(".ontology-atlas");
        let original_sidecar = vault.join(".ontology-atlas-original");
        let outside = base.join("outside");
        std::fs::create_dir_all(&sidecar).unwrap();
        std::fs::create_dir_all(&outside).unwrap();

        let result = ensure_vault_directory_after_validation(
            vault.to_string_lossy().into_owned(),
            ".ontology-atlas/new-dir".into(),
            || {
                std::fs::rename(&sidecar, &original_sidecar).unwrap();
                symlink(&outside, &sidecar).unwrap();
            },
        );

        assert!(
            result.is_ok(),
            "안정된 원래 부모 mkdir은 성공해야 한다: {result:?}"
        );
        assert!(
            !outside.join("new-dir").exists(),
            "검증 뒤 생긴 부모 symlink를 따라 볼트 밖 디렉터리를 만들었다"
        );
        assert!(original_sidecar.join("new-dir").is_dir());
        std::fs::remove_dir_all(&base).ok();
    }

    #[cfg(unix)]
    #[test]
    fn vault_write_replaces_a_hardlink_without_modifying_its_other_path() {
        use std::os::unix::fs::MetadataExt;

        let base = std::env::temp_dir().join(format!(
            "oatlas-vault-hardlink-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let vault = base.join("vault");
        let outside = base.join("outside.md");
        let target = vault.join("note.md");
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::write(&outside, "outside").unwrap();
        std::fs::hard_link(&outside, &target).unwrap();

        write_vault_text_file_after_validation(
            vault.to_string_lossy().into_owned(),
            "note.md".into(),
            "inside-new".into(),
            || {},
        )
        .unwrap();

        assert_eq!(std::fs::read_to_string(&outside).unwrap(), "outside");
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "inside-new");
        assert_ne!(
            std::fs::metadata(&outside).unwrap().ino(),
            std::fs::metadata(&target).unwrap().ino(),
            "vault entry가 기존 외부 inode와의 링크를 끊지 않았다"
        );
        std::fs::remove_dir_all(&base).ok();
    }

    /// **Do not clear the original first.**
    ///
    /// 2026-08-16 review: Previous `fs::write` uses O_TRUNC — if it dies while writing,
    /// the user's markdown remains truncated. This check doesn't catch "did new content
    /// enter?" but rather **「did it go through a temporary file?」**: that nature
    /// produces atomicity, and looking at the result, the two implementations are indistinguishable.
    #[test]
    fn replaces_through_a_temporary_file_and_leaves_none_behind() {
        let dir = std::env::temp_dir().join(format!("oatlas-atomic-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("note.md");
        std::fs::write(&target, "old").unwrap();

        write_text_atomically(&target, "new").unwrap();

        assert_eq!(std::fs::read_to_string(&target).unwrap(), "new");
        // If temporary files remain, the next write will fail on `create` or the user folder gets messy.
        let leftovers: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|name| name.contains("oatlas-tmp"))
            .collect();
        assert!(leftovers.is_empty(), "임시 파일이 남았다: {leftovers:?}");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_failed_write_leaves_the_original_untouched() {
        let dir = std::env::temp_dir().join(format!("oatlas-atomic-fail-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        // Giving a directory as the target causes rename to fail — the fallback for when the original is missing.
        let target = dir.join("as-dir");
        std::fs::create_dir_all(&target).unwrap();

        let result = write_text_atomically(&target, "new");

        assert!(result.is_err(), "디렉터리를 파일로 덮어썼다");
        assert!(target.is_dir(), "대상이 파일로 바뀌었다");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_preexisting_temporary_symlink_cannot_redirect_an_atomic_write() {
        use std::os::unix::fs::symlink;

        let dir = std::env::temp_dir().join(format!(
            "oatlas-atomic-link-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("note.md");
        let sentinel = dir.join("outside-sentinel.txt");
        let predictable_temporary = target.with_extension(format!(
            "{}.oatlas-tmp-{}",
            target.extension().and_then(|e| e.to_str()).unwrap_or(""),
            std::process::id()
        ));
        std::fs::write(&target, "old").unwrap();
        std::fs::write(&sentinel, "outside").unwrap();
        symlink(&sentinel, &predictable_temporary).unwrap();

        write_text_atomically(&target, "new").unwrap();

        assert_eq!(std::fs::read_to_string(&sentinel).unwrap(), "outside");
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "new");
        assert_ne!(std::fs::canonicalize(&target).unwrap(), sentinel);
        std::fs::remove_dir_all(&dir).ok();
    }
}

#[cfg(test)]
mod acp_install_progress_tests {
    use super::*;

    /**
     * **The key name is the contract with TS.**
     *
     * The screen (`AcpInstallProgress` in `src/features/acp-doctor/model/acp-doctor.ts`)
     * filters out other tools' progress using `payload.runtimeId`. So if serde
     * outputs `runtime_id` as-is, the event **arrives but is all discarded** —
     * no errors appear in the console and progress never shows. That silent failure
     * is prevented by that single line `rename_all = "camelCase"`, so lock it down here.
     */
    #[test]
    fn progress_payload_uses_the_keys_the_screen_reads() {
        let json = serde_json::to_value(AcpInstallProgress {
            runtime_id: "claude-acp".to_string(),
            job: "node",
            stage: "downloading",
            received: Some(26_043_779),
            total: Some(52_087_559),
            note: None,
            at: 1_787_000_000_000,
        })
        .expect("progress payload should serialize");

        let object = json.as_object().expect("payload should be a JSON object");
        let mut keys: Vec<&str> = object.keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            vec!["at", "job", "note", "received", "runtimeId", "stage", "total"],
            "화면이 읽는 키와 다르다 — 이러면 진행률이 조용히 사라진다"
        );
        assert_eq!(object["runtimeId"], "claude-acp");
        assert_eq!(object["received"], 26_043_779u64);
        // Unknown values are **null, not absent**. The screen decides whether to render
        // the percentage based on that.
        assert!(object["note"].is_null());
    }

    /// The event name is also a contract — the screen listens for this string.
    #[test]
    fn progress_event_name_matches_the_listener() {
        assert_eq!(ACP_INSTALL_PROGRESS_EVENT, "acp-install://progress");
    }
}
