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
/// One rotation of the app log, kept small on purpose: this file exists so a bug report can carry
/// evidence, not so the app accumulates a history of the owner's machine.
const APP_LOG_MAX_FILE_BYTES: u128 = 5 * 1024 * 1024;

/// Where a recentred window is *placed* below the top of a display. 37 is the notched 14"/16"
/// figure — the conservative choice, because placing a window slightly low costs nothing while
/// placing it under a notch costs the title bar.
const MACOS_MENU_BAR_RESERVE_PT: f64 = 37.0;
/// The shortest menu bar macOS presents: every non-notched panel, including all external displays.
///
/// This is the *acceptance* floor, and it must not be the notched 37. Reserving generously when
/// choosing a position is safe; rejecting a position a non-notched display legitimately allows is
/// not. A window snapped to the top of an external monitor sits at y = 24, and judging it against
/// 37 would call it unreachable and recentre it **on every launch** — the plugin restores the
/// owner's window and this would immediately take it away again. The same conflation shrank a
/// maximised window that fit its display exactly, so the height ceiling below uses this figure too.
const MACOS_MENU_BAR_MIN_PT: f64 = 24.0;
/// The title bar sits outside the inner size Tauri's `width`/`height` describe, so a window's real
/// vertical footprint is content + this.
const MACOS_TITLE_BAR_PT: f64 = 28.0;
/// Must equal `minWidth`/`minHeight` in `tauri.conf.json`; `check-desktop-readiness.mjs` asserts it.
const MAIN_WINDOW_MIN_LOGICAL: (f64, f64) = (1040.0, 720.0);
/// How much grabbable title bar has to remain inside a display. A window whose title bar is off
/// screen cannot be moved back by the person using it.
const MIN_ONSCREEN_TITLE_BAR_PT: f64 = 120.0;
/// `tauri-plugin-window-state`'s own `DEFAULT_FILENAME`, inside `app_config_dir()`. Named here so
/// the launch diagnostic can tell a restored window from a default one, and so the harness's
/// `--reset-window-state` and this agree on one path.
const WINDOW_STATE_FILENAME: &str = ".window-state.json";
/// Restoring `FULLSCREEN` performs a Space transition before first paint and gives macOS's own
/// restoration a second owner; `VISIBLE` can produce a launch with no window at all, which nobody
/// can tell apart from the app failing to start; and nothing here ever changes `DECORATIONS`, so
/// saving them only adds a route to a window that cannot be moved or closed.
#[cfg(desktop)]
const WINDOW_STATE_FLAGS: tauri_plugin_window_state::StateFlags =
    tauri_plugin_window_state::StateFlags::SIZE
        .union(tauri_plugin_window_state::StateFlags::POSITION)
        .union(tauri_plugin_window_state::StateFlags::MAXIMIZED);

/// A window rectangle in logical points. `x`/`y` are the **outer** frame origin — the top-left of
/// the title bar, which is what `set_position` accepts — while `width`/`height` are the **inner**
/// content size, which is what `set_size` accepts and what `tauri.conf.json` declares.
#[derive(Debug, Clone, Copy, PartialEq)]
struct WindowGeometry {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// A display's usable rectangle in logical points.
#[derive(Debug, Clone, Copy, PartialEq)]
struct MonitorRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct SanitizedGeometry {
    geometry: WindowGeometry,
    resized: bool,
    repositioned: bool,
}

/// Decides where the main window may actually sit on a given display.
///
/// This runs on **every** launch, not only after a restore, because the smallest display this
/// product promises (1440×900) cannot hold the default content height either — a restore-only clamp
/// would leave the plain first launch unguarded on that machine.
///
/// It exists because `tauri-plugin-window-state` restores size unconditionally, in *physical*
/// pixels, and its own off-screen test only guards position and passes when any single corner
/// intersects a display. Quitting at 1512×900 on a 2× Retina panel saves 3024×1800; relaunching
/// with that display gone would otherwise ask a 1× monitor for a window larger than itself. Working
/// in logical points and clamping here is what makes that case survivable.
fn sanitize_window_geometry(
    saved: WindowGeometry,
    monitor: MonitorRect,
    min: (f64, f64),
) -> SanitizedGeometry {
    let usable_width = monitor.width.max(min.0);
    let usable_height = (monitor.height - MACOS_MENU_BAR_MIN_PT - MACOS_TITLE_BAR_PT).max(min.1);

    let width = saved.width.clamp(min.0, usable_width);
    let height = saved.height.clamp(min.1, usable_height);
    let resized = width != saved.width || height != saved.height;

    // `saved.y` is already the title bar's top edge, and the title bar is the only part of a window
    // a person can grab. `intersects`-style corner tests pass for a window whose title bar sits
    // above the menu bar while its bottom corners are still on screen — that window is unreachable.
    let onscreen_width = (saved.x + width).min(monitor.x + monitor.width) - saved.x.max(monitor.x);
    let reachable = onscreen_width >= MIN_ONSCREEN_TITLE_BAR_PT
        && saved.y >= monitor.y + MACOS_MENU_BAR_MIN_PT
        && saved.y <= monitor.y + monitor.height - MACOS_TITLE_BAR_PT;

    // A clamped window that keeps its old origin drifts off the right or bottom edge, so a resize
    // implies a reposition.
    let repositioned = resized || !reachable;
    let (x, y) = if repositioned {
        (
            monitor.x + (monitor.width - width) / 2.0,
            monitor.y + MACOS_MENU_BAR_RESERVE_PT + ((usable_height - height) / 2.0).max(0.0),
        )
    } else {
        (saved.x, saved.y)
    };

    SanitizedGeometry {
        geometry: WindowGeometry {
            x,
            y,
            width,
            height,
        },
        resized,
        repositioned,
    }
}
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
    // No parent means the filesystem root (`/`, `C:\`). The caller passes a
    // canonicalized path so a symlink cannot route around this check.
    if root.parent().is_none() {
        return Some("filesystem-root");
    }

    // On macOS, **a `.app` is a directory** (2026-08-17). Checking only
    // `is_dir()` lets it through, and `open <path>` does not open the folder —
    // it **launches that program**, the one thing "Reveal in Finder" must
    // never do.
    //
    // It is rejected as a vault root for the same reason: the inside of a
    // bundle is the app's internal structure, not a place where a person keeps
    // documents — and even less a place to become an agent's working folder.
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
        // Block only when it is exactly that directory. **Inside** it there
        // are places a user may legitimately pick (e.g. `/home/<user>` on
        // Linux, `/Volumes/<disk>` on macOS).
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
const ACP_INSTALL_VERIFY_SCRIPT: &str = include_str!("webview_verify/acp_install_verify.js");

/// Open the settings sheet → go to the "App" section → actually click "Check for Updates".
///
/// **Why even click** — unit tests only prove that the button calls `checkNow`. What follows (plugin dynamic import · network round-trip · `getVersion()`) exists only within the installed app, and this repository's wiring was dead exactly in that layer.
const APP_UPDATE_VERIFY_SCRIPT: &str = include_str!("webview_verify/app_update_verify.js");

const AI_SETTINGS_VERIFY_SCRIPT: &str = include_str!("webview_verify/ai_settings_verify.js");

/// The DOM marker collection probe injected with `eval_with_callback` during
/// webview verification. Extracted verbatim from the former inline raw string in
/// `run()`; the file bytes are the behaviour, so edits there are edits to the probe.
const DOM_MARKER_PROBE_SCRIPT: &str = include_str!("webview_verify/dom_marker_probe.js");

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
  // Returned to Rust through `eval_with_callback`, so the harness can stop as soon as the route is
  // actually live instead of running a fixed number of blind attempts and assuming the best.
  const arrived = () =>
    (location.pathname + location.search + location.hash) === next;
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
      return arrived();
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
      return arrived();
    }}
    window.__ontologyAtlasVerifyRouteMisses =
      Number(window.__ontologyAtlasVerifyRouteMisses || 0) + 1;
    if (window.__ontologyAtlasVerifyRouteMisses < 14) {{
      return arrived();
    }}
    history.replaceState({{}}, "", next);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(new Event("app:urlchange"));
  }}
  return arrived();
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
        // Never hold the registry lock and the writer lock at the same time.
        // Even when one child's stdin is blocked, other sessions' send/stop,
        // child-exit cleanup, and the app-shutdown drain must keep moving —
        // that is what makes it possible to kill the blocked process itself.
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

    /// Is this session still alive — this is how the download progress
    /// reporting thread knows when to stop.
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

/// Session names come from a monotonically increasing counter. Using the pid
/// as the name would give a just-ended session and a new session the same name
/// whenever the OS reuses a pid.
static ACP_SESSION_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

/// One line produced by one session.
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

/// Launch the ACP harness. The only thing returned is a session name; every
/// exchange after this uses that name.
///
/// ## What this command guarantees
///
/// 1. **The working folder must pass the vault-root check unchanged.** We call
///    the very function the folder picker uses — if two copies of the check
///    exist, the looser one becomes the default. Handing an agent `/` is not a
///    mistake, it is an incident.
/// 2. **The child gets its own process group.** That is the only way to end
///    the grandchildren the adapter spawns in one stroke; without it,
///    processes survive quitting the app.
/// 3. **The child's PATH is rebuilt from the locations we actually found.**
///    The adapter resolves the real CLI by name, so handing it the sparse PATH
///    a GUI app inherits makes the adapter fail at exactly the same spot.
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
    // Starting without a verified app-owned boundary is never allowed. A launcher that lacks
    // isolation or fails its preparation is a start failure; launching in that state can inherit
    // the user's global allow list while the screen has no enforceable gateway.
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
    let (isolation_env, isolation_dir) = acp::prepare_runtime_isolation(
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
    command.env(isolation_env, isolation_dir);

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
            log::info!("acp session {session_id} exited with code {code:?}");
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

/// Send one line to the session. The newline is appended here — if the caller
/// forgets it, the peer waits forever, and the only visible symptom is "it
/// froze."
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
        // Being asked to stop a session that already ended is not a failure.
        None => Ok(()),
    }
}

/// End every remaining session when the app shuts down.
///
/// Without this, closing the window leaves the adapter and its grandchildren
/// running. The user believes the app is off while the machine keeps working.
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

/// Determine which ACP runtimes actually exist on this machine and return them.
///
/// **PATH alone is not trusted** — an app launched from Finder skips shell
/// initialization, so the paths a version manager (nvm and the like) planted
/// are missing wholesale. What gets searched is written out in full in
/// `acp.rs`, and that list is itself the test subject.
///
/// **Nothing is written.** However, when `probe_login` is true, the CLI is
/// briefly launched to confirm login (only the exit code is inspected — the
/// output is discarded).
///
/// The runtime state of this machine.
///
/// Only when `probe_login` is true does this **launch each CLI to check
/// whether it is logged in.** That is the only slow part of this call
/// (measured: claude 300ms · codex 45ms); everything else scans the disk and
/// is near-instant.
///
/// ## Why the split (2026-08-16 owner remark)
///
/// *"When I click the Agents tab, loading takes about a second — shouldn't we
/// load it first and update afterwards?"* — a correct observation. When the
/// login check was added, **its cost was stacked directly onto the time the
/// screen takes to appear.** The list could have been drawn first, yet nothing
/// was shown until the check finished.
///
/// So the screen calls twice: first draw without the check, then check and
/// correct.
#[tauri::command(async)]
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
    // Also find what the app installed on the user's behalf — otherwise it
    // still reads "installation required" after installing.
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

/// One line telling the screen how far the installation has come.
///
/// ## Why an event (2026-08-20 owner remark)
///
/// *"If I just press the buttons, does it show the installation happening on
/// its own and check off completion too?"* — it did not. Previously the
/// command returned only **after finishing**, so while 52MB downloaded and npm
/// ran, all the screen could do was disable the chip and display the words
/// "Installing…" — exactly the pattern this repository's walkthrough named
/// **"the silent wait."**
///
/// ## What it does not do
///
/// **It does not invent progress it does not know.** `received`/`total` are
/// populated only where they are known (the Node download); npm has no
/// denominator, so instead **the last line it actually emitted** is carried
/// as `note`. This app's update toast already follows the same discipline —
/// when the total is unknown, it draws no percentage and says so.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AcpInstallProgress {
    runtime_id: String,
    /// Which job this is — `"node"` · `"cli"`. The screen owns the wording.
    job: &'static str,
    /// Which phase is this — the screen holds the message (we do not generate human language here).
    stage: &'static str,
    received: Option<u64>,
    total: Option<u64>,
    /// The line the tool actually emitted. Not a sentence we made up.
    note: Option<String>,
    /// When this state was produced (epoch ms).
    ///
    /// **Without it, an installation that finished yesterday shows up today as
    /// "installed it."** The screen uses this value to avoid drawing stale
    /// state — holding the last state and deciding how long to keep showing it
    /// are different questions.
    at: u64,
}

/// The name the screen listens for. Named in the same grain as `acp://exit`.
///
/// ⚠️ **This name and the payload keys are a contract with the TS side.** The
/// screen filters out other runtimes' progress by `payload.runtimeId`, so if
/// even one key name is off, the events arrive but are **all discarded** — no
/// error, the progress just never appears. That is why the test below pins the
/// serialized keys exactly.
const ACP_INSTALL_PROGRESS_EVENT: &str = "acp-install://progress";

/// **Where the last progress state is held, per tool.**
///
/// ## Why it is needed (2026-08-20, found under council pressure)
///
/// The settings sheet **unmounts wholesale** when closed
/// (the `(open || settingsMounted) && …` conditional portal in
/// `AppSettingsMenu.tsx`). So all of `useAgentDoctor`'s state on the screen
/// side vanishes and the event subscription is severed too.
///
/// There are three branches, and **the last one is the real defect**:
///
/// | While the sheet was closed | On reopening |
/// |---|---|
/// | Node downloading | 250ms cadence, so it **self-heals within 0.25s** |
/// | npm installing | if npm is quiet, nothing shows until its next line |
/// | **`done` went by** | `done` is **one-shot** → **completion is never seen** |
///
/// That completion indicator is what the owner explicitly demanded this round
/// (*"does it check off completion too?"*). Events alone cannot honor that
/// demand.
///
/// ## Why here and not the screen
///
/// Lifting the state into the shell (React) still **dies with a route change
/// or a reload** — moving it to the destination changes nothing. The process
/// that actually owns the installation is this one, so keeping the last state
/// here is where the source of truth becomes singular.
#[derive(Default)]
struct AcpInstallProgressState {
    /// `runtime_id` → that tool's last progress. Kept per tool — with a single
    /// slot, a Codex install would overwrite Claude's completion indicator.
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
    // **Record first, send after.** In the reverse order, a screen that
    // received the event and asked right away could read a value not yet
    // recorded.
    if let Some(state) = app.try_state::<AcpInstallProgressState>() {
        if let Ok(mut last) = state.last.lock() {
            last.insert(runtime_id.to_string(), payload.clone());
        }
    }
    let _ = app.emit(ACP_INSTALL_PROGRESS_EVENT, payload);
}

/// This tool's **last progress state**. `None` when there is none.
///
/// The screen asks once when it remounts — that is how a completion that went
/// by while the sheet was closed is not missed.
#[tauri::command]
fn acp_install_progress(
    app: tauri::AppHandle,
    runtime_id: String,
) -> Option<AcpInstallProgress> {
    let state = app.try_state::<AcpInstallProgressState>()?;
    let last = state.last.lock().ok()?;
    last.get(&runtime_id).cloned()
}

/// Starting a fresh check **forgets the previous installation result.**
///
/// Without clearing it, closing and reopening the sheet after a re-check would
/// resurrect "installed it," presenting something that was not just done as if
/// it were. The screen side clears its own state at the same moment, so both
/// places follow the same rule.
fn forget_install_progress(app: &tauri::AppHandle, runtime_id: &str) {
    if let Some(state) = app.try_state::<AcpInstallProgressState>() {
        if let Ok(mut last) = state.last.lock() {
            last.remove(runtime_id);
        }
    }
}

/// **Can the app download Node for the user — and if so, what from where.**
///
/// The screen takes this and shows the **URL and hash prefix** before the
/// click. `None` means an unlisted platform, and the screen sends the user to
/// the official instructions as before.
#[tauri::command]
fn acp_node_plan() -> Option<String> {
    managed_node::managed_node_plan()
}

/// Download Node into the app-owned location and **verify the hash.**
///
/// The four conditions (ledger (88)(89)) are honored here: only when the user
/// clicks · show first what is downloaded from where · only inside
/// `<app-data>/runtimes/node` · pin the version and **verify the hash after
/// download** (on mismatch, delete and fail).
#[tauri::command(async)]
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
#[tauri::command(async)]
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
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|err| format!("open-failed:{err}"))?;

    // Dropping a `Child` does not reap it. `open` exits almost immediately, so every clicked link
    // used to leave a zombie in the process table for the rest of the session — unbounded by
    // anything but how many links someone follows. Waiting on a detached thread keeps this command
    // instant while still collecting the exit status. (`reveal_in_finder` below already uses
    // `.status()` for the same reason; it can afford to wait because it is a one-shot action.)
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
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
#[tauri::command(async)]
fn acp_diagnose(app: tauri::AppHandle, runtime_id: String) -> Result<Vec<acp_doctor::AcpCheck>, String> {
    // If re-verifying starts, forget previous installation results — the screen also clears its
    // state at the same moment, so both locations follow the same rule.
    forget_install_progress(&app, &runtime_id);
    let ctx = doctor_context(&app, &runtime_id)?;
    Ok(acp_doctor::diagnose(&ctx.borrow()))
}

/// When the screen presses "Fix". **Only `fixable` items arrive.**
#[tauri::command(async)]
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
#[tauri::command(async)]
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

    // Ask against the app-owned folder — **the screen saying "ready" while it
    // was actually logged out** was half of this defect. Asking the user's
    // folder measures a place the app does not even use.
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

/// Deliberately **not** `(async)`, unlike the other slow commands in this file.
///
/// `rfd::FileDialog::pick_folder` opens an `NSOpenPanel`, which macOS requires on the main thread
/// and which runs its own modal event loop — so the UI stays responsive *because* this blocks here.
/// Moving it to a worker is the one change in this file that would break the thing the others fix.
#[tauri::command]
fn pick_vault_directory(dialog_title: Option<String>) -> Result<Option<String>, String> {
    let title = dialog_title.as_deref().unwrap_or("Open ontology vault");
    let Some(picked) = rfd::FileDialog::new().set_title(title).pick_folder() else {
        return Ok(None);
    };
    // Judge the **actual** location after following symlinks — so that the
    // same place under a different name, like `/tmp` → `/private/tmp`, is not
    // missed. When canonicalize fails (permissions and the like), judge the
    // path the user just picked as-is.
    let resolved = fs::canonicalize(&picked).unwrap_or_else(|_| picked.clone());
    if let Some(reason) = vault_root_rejection(&resolved) {
        // Return a **stable code** so the screen can pick per-reason wording.
        // Composing the human-readable sentence here would trap translation
        // inside Rust.
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

/// One vault fingerprint entry — path and mtime **only**. No body content.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultStamp {
    relative_path: String,
    /// Same representation as `TauriTextFile::last_modified` — this vault has one type for mtime.
    last_modified: u128,
}

/// The result of `vault_fingerprint`. Truncation and pruning are returned
/// alongside, **not hidden**.
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

#[tauri::command(async)]
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

/// **Must equal** TS `VAULT_WALK_MAX_DEPTH` (a contract test watches it).
const VAULT_WALK_MAX_DEPTH: usize = 12;
/// Same value as TS `VAULT_WALK_MAX_ENTRIES`.
const VAULT_WALK_MAX_ENTRIES: usize = 4000;
/// Same list as TS `PRUNE_BY_NAME`.
const VAULT_PRUNE_DIR_NAMES: &[&str] = &["node_modules"];
/// Same value as TS `CACHE_DIR_TAG`.
const VAULT_CACHE_DIR_TAG: &str = "CACHEDIR.TAG";
/// Same extension set as TS `IMAGE_EXT` (lowercase comparison).
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

    // Collect the listing first — the cache-tag judgment completes within
    // this list.
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

/// Walk the vault and return **paths and mtimes only**.
///
/// ## Why this command is needed (2026-07-31)
///
/// The fingerprint computation called `read_vault_text_file` per file — that
/// command returns the **entire body + mtime**, so the whole vault crossed IPC
/// when all that was used was one number. Opening this repository itself as a
/// vault makes `docs/` **261 files · 17.7MB**, and that path runs every time
/// focus returns to the window.
///
/// Round-trips were also one per file (plus one `list_vault_directory` per
/// directory). Now it is **one call**, and the payload is paths + numbers only.
///
/// ⚠️ **The walk rules must not differ from the TS side by a single
/// character.** If they differ, the fingerprints differ, and the app either
/// "rebuilds every time though nothing changed" or "doesn't notice what did."
/// The constants are gathered above and
/// `tests/contract/vault-walk-rules.contract.test.ts` holds the two sources
/// against each other.
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

/// Write one file **without tearing** — write to a temporary file, commit it
/// to disk, then rename.
///
/// ## Why (2026-08-16 review)
///
/// Previously this was a single `fs::write`. That **truncates the original
/// first** and then writes. If the app dies or the disk fills in between, the
/// user's Markdown is left **cut short** — and that file belongs to the very
/// folder we just opened for them. This product's promise is "your files stay
/// on your disk as they are," and that promise includes "intact."
///
/// A rename is atomic within the same filesystem. So no matter when the crash
/// comes, the file is **either the old content or the new content**, never
/// half of one.
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
        // Commit to disk before renaming — otherwise power can be lost with
        // the name already new while the content still sits in cache.
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, path)
    })();
    if result.is_err() {
        // On failure, clean up only the temporary file. The original was
        // never touched.
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
    // ⚠️ **`is_dir()` is not enough** (2026-08-17). On macOS a `.app` is a
    // directory, so it passes the check above, and then the `open` below does
    // not open the folder — it **launches that program.** The judgment is made
    // with the same function the vault-root gate uses — if two copies of the
    // check exist, the looser one becomes the default.
    if let Some(reason) = vault_root_rejection(&root) {
        return Err(format!("refusing to open this path: {reason}"));
    }

    #[cfg(target_os = "macos")]
    {
        // `-a Finder` **pins which program opens it.** This alone keeps a
        // bundle from launching, but both it and the rejection above stay —
        // if one comes loose, the other remains.
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

/// Exclusive to the "just start" desktop first-run action — the container folder
/// that gathers vaults created with no project in mind. Only the Rust side can
/// know $HOME (JS cannot reach it without the fs plugin), so path assembly is a
/// pure function for testing and the command adds only create_dir_all.
///
/// ⚠️ **Deliberately not inside Documents** (2026-08-25). It used to be
/// `~/Documents/Ontology Atlas`, and Documents is one of the folders macOS
/// protects with TCC. So the button whose entire promise is "no decisions, just
/// begin" made a system permission dialog the very first thing a new person saw,
/// before any map existed to justify it. `$HOME` itself carries no such gate, so
/// "just start" now starts.
///
/// This is the no-project path only. When somebody points Atlas at a codebase,
/// the map goes inside that project as `<project>/atlas` — see
/// `src/shared/lib/project-vault-dir.ts`.
fn default_vault_parent_dir(home: &str) -> PathBuf {
    PathBuf::from(home).join("Ontology Atlas")
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

/// The subset of `tauri-plugin-window-state`'s file this app reads back itself.
///
/// The plugin writes **physical** pixels, which is the whole reason the geometry cannot be trusted
/// unexamined: quitting at 1512x900 on a 2x panel stores 3024x1800, and restoring that on a 1x
/// display asks for a window larger than the display. Measured on this machine 2026-08-24.
#[derive(serde::Deserialize)]
struct SavedWindowState {
    width: f64,
    height: f64,
    x: f64,
    y: f64,
    #[serde(default)]
    maximized: bool,
}

/// Reads the geometry the plugin saved, or `None` when there is nothing to restore.
fn read_saved_window_state(app: &AppHandle) -> Option<SavedWindowState> {
    let path = app.path().app_config_dir().ok()?.join(WINDOW_STATE_FILENAME);
    let raw = fs::read_to_string(path).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).ok()?;
    serde_json::from_value(parsed.get(MAIN_WINDOW_LABEL)?.clone()).ok()
}

/// Runs `sanitize_window_geometry` against the live window and leaves one provable line behind.
///
/// `source` records whether the geometry came from a restored state file, from the config default,
/// or from the verification harness, because "the window opened somewhere I did not leave it" is
/// only diagnosable if the record says which of the three produced the rectangle.
///
/// It is written twice on purpose. `log::info!` reaches the file an owner can actually send from an
/// installed build; `write_verify_line` reaches the harness, which parses stdout. Emitting only the
/// latter would put this diagnostic exactly where the decision that added logging says nobody can
/// read it.
fn fit_main_window_to_display(
    window: &tauri::WebviewWindow,
    saved: Option<SavedWindowState>,
    source: &str,
) {
    // A restored window is measured on the display it was saved on, not the one the app happens to
    // open on. `monitor_from_point` takes physical coordinates, which is what the file stores.
    let monitor = match saved
        .as_ref()
        .and_then(|state| window.monitor_from_point(state.x, state.y).ok().flatten())
    {
        Some(monitor) => Some(monitor),
        None => match window.current_monitor() {
            Ok(Some(monitor)) => Some(monitor),
            _ => window.primary_monitor().ok().flatten(),
        },
    };
    let Some(monitor) = monitor else {
        log::warn!("no monitor reported; leaving window geometry untouched");
        return;
    };
    let scale = monitor.scale_factor();
    let monitor_size = monitor.size().to_logical::<f64>(scale);
    let monitor_position = monitor.position().to_logical::<f64>(scale);

    // A maximised window is on-screen and correctly sized by definition, and macOS owns what zoom
    // means on each display. Reproducing it from stored numbers would fight the window manager.
    if saved.as_ref().is_some_and(|state| state.maximized) {
        let _ = window.maximize();
        let line = format!("[ontology-atlas-window-verify] fit source={source} maximized=true");
        log::info!("{line}");
        write_verify_line(line);
        return;
    }

    let current = match (window.inner_size(), window.outer_position()) {
        (Ok(inner), Ok(position)) => WindowGeometry {
            x: position.to_logical::<f64>(scale).x,
            y: position.to_logical::<f64>(scale).y,
            width: inner.to_logical::<f64>(scale).width,
            height: inner.to_logical::<f64>(scale).height,
        },
        _ => {
            log::warn!("window geometry unreadable; leaving it untouched");
            return;
        }
    };

    // The saved rectangle is sanitised **before** it is applied, never read back afterwards.
    // `set_size` is dispatched through the event loop, so a read taken straight after a restore
    // still reports the pre-restore geometry — measured 2026-08-24, when a planted 3000x2000 state
    // produced a 3000pt window while this line reported 1512x900 and `recentered=false`. Letting the
    // plugin restore and then inspecting the result made the clamp a no-op in the one case it
    // exists for, so the plugin no longer performs the initial restore at all.
    let requested = match saved.as_ref() {
        Some(state) => WindowGeometry {
            x: state.x / scale,
            y: state.y / scale,
            width: state.width / scale,
            height: state.height / scale,
        },
        None => current,
    };

    let sanitized = sanitize_window_geometry(
        requested,
        MonitorRect {
            x: monitor_position.x,
            y: monitor_position.y,
            width: monitor_size.width,
            height: monitor_size.height,
        },
        MAIN_WINDOW_MIN_LOGICAL,
    );

    // When restoring, the window is not yet where the file says, so size and position are applied
    // unconditionally. On a plain launch only an actual correction is written.
    let restoring = saved.is_some();
    if restoring || sanitized.resized {
        let _ = window.set_size(tauri::LogicalSize::new(
            sanitized.geometry.width,
            sanitized.geometry.height,
        ));
    }
    if restoring || sanitized.repositioned {
        let _ = window.set_position(tauri::LogicalPosition::new(
            sanitized.geometry.x,
            sanitized.geometry.y,
        ));
    }

    let line = format!(
        "[ontology-atlas-window-verify] fit source={source} requested={:.0}x{:.0} applied={:.0}x{:.0} recentered={}",
        requested.width,
        requested.height,
        sanitized.geometry.width,
        sanitized.geometry.height,
        sanitized.repositioned
    );
    log::info!("{line}");
    write_verify_line(line);
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

/// Watches the vault directory recursively and emits `vault-changed` to the webview when a `.md`
/// file changes, debounced by 500ms so one editor's burst of writes arrives as a single event.
///
/// The screen listens and refreshes immediately, which is what the app has over the web surface:
/// no five-second polling gap. The debouncer is held in `State` so it lives as long as the app —
/// calling this again replaces and drops the previous one.
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
        move |result: DebounceEventResult| match result {
            Ok(events) => {
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
            // This arm was previously dropped in silence. When the watcher fails, the vault simply
            // stops appearing to change — the screen looks fine and nothing anywhere says why.
            Err(errors) => {
                for error in errors {
                    // `error.kind` only. A `notify` error's full `Display` embeds the paths it was
                    // watching, which for a vault means the owner's own note filenames — and a
                    // filename is already meaning in this product. The kind is what makes a watcher
                    // failure diagnosable; the file list is not.
                    log::warn!("vault watcher error: {:?}", error.kind);
                }
            }
        },
    )
    .map_err(|err| err.to_string())?;
    debouncer
        .watcher()
        .watch(&canonical, RecursiveMode::Recursive)
        .map_err(|err| err.to_string())?;
    log::info!("vault watcher started at {}", canonical.display());
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
                log::warn!(
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
                    log::info!(
                        "[frame-rate-cap] disabled PreferPageRenderingUpdatesNear60FPSEnabled — WebView follows display refresh rate"
                    );
                    return;
                }
            }
            log::warn!(
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

    let mut builder = tauri::Builder::default();

    // Registered before every other plugin, as the plugin's own guidance requires, so it runs before
    // anything else can claim state. A second launch does not open a rival window: it hands focus back
    // to the window that already exists. Without this, two instances would watch, harness and write the
    // same vault at once — and the updater's restart makes a second launch routine.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }));
    }

    // Registered after single-instance, and **not at all** under the verification harness. Skipping
    // only the initial restore would not be enough: the plugin also writes on exit, so a harness run
    // that resizes the window would overwrite the owner's real geometry, and the next verification
    // would adjudicate `--min-window-size` against whatever a developer last dragged. A gate whose
    // verdict depends on the last window drag is not evidence.
    if !verify_webview {
        builder = builder.plugin(
            tauri_plugin_window_state::Builder::new()
                // FULLSCREEN, VISIBLE and DECORATIONS are deliberately absent. Restoring fullscreen
                // performs a Space transition before first paint and gives macOS's own restoration a
                // second owner; restoring `visible` can launch with no window at all, which is
                // indistinguishable from the app failing to start; and nothing in this app ever
                // changes decorations, so saving them only adds a route to an undecorated window
                // that cannot be moved or closed.
                .with_state_flags(WINDOW_STATE_FLAGS)
                // The plugin restores from `on_window_ready`, which fires *after* `setup`. Leaving
                // it to do the initial restore meant `fit_main_window_to_display` measured the
                // config default, found it fine, and did nothing — and the restored geometry then
                // landed unchecked. Measured on 2026-08-24: a planted 3000x2000 state produced a
                // 3000pt window hanging off the display while the fit line reported 1512x900 and
                // `recentered=false`. The clamp was a no-op in exactly the case it exists for. So
                // the initial restore is skipped here and performed explicitly below, in an order
                // this file controls.
                .skip_initial_state(MAIN_WINDOW_LABEL)
                .build(),
        );
    }

    builder
        // A rotating log file in the OS log directory, because a packaged bundle's stdout reaches
        // nobody. Written outside the vault so it never becomes a second store of meaning, and kept at
        // `Info` so it records what the app *did* — never vault content, prompts, or secrets.
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("ontology-atlas".to_string()),
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stderr),
                ])
                .level(log::LevelFilter::Info)
                .max_file_size(APP_LOG_MAX_FILE_BYTES)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
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
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);

            // The first line of every log file: without a version, a bug report's log cannot be
            // matched to the build that produced it.
            log::info!(
                "ontology atlas {} started",
                app.handle().package_info().version
            );

            show_main_window(app.handle());
            apply_verify_window_size(app.handle());

            // Claiming the harness is isolated in a comment is not proof; this line is what the
            // payload contract asserts.
            write_verify_line(format!(
                "[ontology-atlas-window-verify] state_plugin={}",
                if verify_webview { "disabled" } else { "enabled" }
            ));
            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                // The plugin reads this file at window creation and leaves it in place, so its
                // presence at setup time is what separates "the owner's window came back" from
                // "this is the config default", and this app — not the plugin — is what applies it.
                let saved = if verify_webview {
                    None
                } else {
                    read_saved_window_state(app.handle())
                };
                let source = match (verify_webview, saved.is_some()) {
                    (true, _) => "harness",
                    (false, true) => "restored",
                    (false, false) => "default",
                };
                fit_main_window_to_display(&window, saved, source);
            }

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
                            // This loop used to run all 20 attempts unconditionally and never learn
                            // the outcome: 8 seconds burned even on an immediate arrival, and a
                            // route that never resolved looked exactly like one that did. The
                            // script now reports whether the route is live, so the harness stops on
                            // arrival and says so when it never arrives.
                            let arrived = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(
                                false,
                            ));
                            let mut attempts_used = WEBVIEW_VERIFY_ROUTE_ATTEMPTS;
                            for attempt in 1..=WEBVIEW_VERIFY_ROUTE_ATTEMPTS {
                                let sink = std::sync::Arc::clone(&arrived);
                                let _ = verify_window.eval_with_callback(
                                    script.as_str(),
                                    move |result| {
                                        if result.trim() == "true" {
                                            sink.store(true, std::sync::atomic::Ordering::SeqCst);
                                        }
                                    },
                                );
                                std::thread::sleep(Duration::from_millis(
                                    WEBVIEW_VERIFY_ROUTE_INTERVAL_MS,
                                ));
                                if arrived.load(std::sync::atomic::Ordering::SeqCst) {
                                    attempts_used = attempt;
                                    break;
                                }
                            }
                            let landed = arrived.load(std::sync::atomic::Ordering::SeqCst);
                            write_verify_line(format!(
                                "[ontology-atlas-verify-route] route={route} arrived={landed} attempts={attempts_used}"
                            ));
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
                            DOM_MARKER_PROBE_SCRIPT,
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
            git::vault_node_revisions,
            git::git_diff,
            git::git_commit_diff,
            git::git_pull,
            git::git_fetch,
            agent_setup::mcp_bundled_server,
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

    /// ⚠️ The container must stay **out of** the folders macOS protects with TCC. "Just start"
    /// promises no decisions, and putting it under Documents made a system permission dialog the
    /// first thing a new person saw, before any map existed to justify it.
    #[test]
    fn just_start_container_sits_outside_the_protected_folders() {
        assert_eq!(
            default_vault_parent_dir("/Users/me"),
            PathBuf::from("/Users/me/Ontology Atlas")
        );
        let path = default_vault_parent_dir("/Users/me");
        for protected in ["Documents", "Desktop", "Downloads"] {
            assert!(
                !path.iter().any(|part| part == protected),
                "just start would open a TCC prompt before the person has anything to consent about"
            );
        }
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
        // 2026-08-24 extraction: the marker probe moved verbatim from an inline raw
        // string in `run()` to `webview_verify/dom_marker_probe.js`, so this test now
        // reads the probe file directly. Every assertion below is unchanged.
        let source = include_str!("webview_verify/dom_marker_probe.js");

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
        // `data-drag-physics-sync-contract` and `data-drag-physics-release-policy` were removed on
        // 2026-08-24 for the same reason `data-focus-cluster-size` was removed above: neither
        // attribute is rendered anywhere in `src/` or `app/`, so pinning them here was a reverse
        // gate forcing dead queries to stay in the probe. The drag contracts they belonged to are
        // still measured — from `window.__ontologyAtlasTopologyDragVerify`, which is the live
        // source; the DOM lookups were an unreachable fallback.
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
        // `data-camera-depth-contract` removed 2026-08-24 — not rendered anywhere in the UI.
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


#[cfg(test)]
mod window_geometry_tests {
    use super::{
        sanitize_window_geometry, MonitorRect, WindowGeometry, MACOS_MENU_BAR_MIN_PT,
        MACOS_MENU_BAR_RESERVE_PT, MACOS_TITLE_BAR_PT, MAIN_WINDOW_MIN_LOGICAL,
    };

    /// The 14-inch MacBook Pro reference panel in logical points.
    const REFERENCE_14_INCH: MonitorRect = MonitorRect {
        x: 0.0,
        y: 0.0,
        width: 1512.0,
        height: 982.0,
    };

    fn at(x: f64, y: f64, width: f64, height: f64) -> WindowGeometry {
        WindowGeometry {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn a_window_that_already_fits_is_returned_untouched() {
        // The identity case. Without it, an over-eager clamp would move a window every launch and
        // every other test here would still pass.
        let saved = at(0.0, MACOS_MENU_BAR_RESERVE_PT, 1512.0, 900.0);
        let result = sanitize_window_geometry(saved, REFERENCE_14_INCH, MAIN_WINDOW_MIN_LOGICAL);
        assert_eq!(result.geometry, saved);
        assert!(!result.resized);
        assert!(!result.repositioned);
    }

    #[test]
    fn the_shipped_default_fits_the_reference_panel() {
        // 1512x982 was the shipped default and is the *entire* display: 982 content + 28 title bar
        // against a 945-point visible frame. 900 is what actually fits, and is the number the
        // measurement scripts already sweep.
        let usable = REFERENCE_14_INCH.height - MACOS_MENU_BAR_RESERVE_PT - MACOS_TITLE_BAR_PT;
        assert!(900.0 <= usable, "900 must fit inside {usable}");
        assert!(982.0 > usable, "982 must not fit, which is why it was never a window");
    }

    #[test]
    fn a_window_larger_than_the_display_is_clamped_and_recentered() {
        let result = sanitize_window_geometry(
            at(0.0, MACOS_MENU_BAR_RESERVE_PT, 2560.0, 1400.0),
            REFERENCE_14_INCH,
            MAIN_WINDOW_MIN_LOGICAL,
        );
        assert_eq!(result.geometry.width, 1512.0);
        assert_eq!(
            result.geometry.height,
            REFERENCE_14_INCH.height - MACOS_MENU_BAR_MIN_PT - MACOS_TITLE_BAR_PT
        );
        assert!(result.resized);
        assert!(result.repositioned, "a clamped window must not keep an origin that now overflows");
    }

    #[test]
    fn geometry_saved_in_physical_pixels_survives_losing_the_retina_display() {
        // The plugin saves `inner_size()`, which is physical. Quitting at 1512x900 on a 2x panel
        // writes 3024x1800; relaunching on a 1x 1440x900 display must not ask for a window larger
        // than the display itself.
        let one_x = MonitorRect {
            x: 0.0,
            y: 0.0,
            width: 1440.0,
            height: 900.0,
        };
        let result = sanitize_window_geometry(
            at(0.0, MACOS_MENU_BAR_RESERVE_PT, 3024.0, 1800.0),
            one_x,
            MAIN_WINDOW_MIN_LOGICAL,
        );
        assert_eq!(result.geometry.width, 1440.0);
        assert_eq!(
            result.geometry.height,
            one_x.height - MACOS_MENU_BAR_MIN_PT - MACOS_TITLE_BAR_PT
        );
        assert!(result.geometry.width <= one_x.width);
        assert!(result.geometry.height <= one_x.height);
    }

    #[test]
    fn a_title_bar_above_the_menu_bar_is_brought_back() {
        // A corner-intersection test passes for this window: its bottom corners are on screen. Its
        // title bar is not, so nobody can move it.
        let result = sanitize_window_geometry(
            at(0.0, -200.0, 1200.0, 800.0),
            REFERENCE_14_INCH,
            MAIN_WINDOW_MIN_LOGICAL,
        );
        assert!(result.repositioned);
        assert!(result.geometry.y >= REFERENCE_14_INCH.y + MACOS_MENU_BAR_RESERVE_PT);
        assert!(!result.resized, "position was the only problem");
    }

    #[test]
    fn a_window_dragged_almost_entirely_off_the_right_edge_is_brought_back() {
        let result = sanitize_window_geometry(
            at(1470.0, 300.0, 1200.0, 800.0),
            REFERENCE_14_INCH,
            MAIN_WINDOW_MIN_LOGICAL,
        );
        assert!(result.repositioned);
        assert!(result.geometry.x >= REFERENCE_14_INCH.x);
    }

    #[test]
    fn a_window_below_the_minimum_is_raised_to_it() {
        let result = sanitize_window_geometry(
            at(100.0, 100.0, 600.0, 400.0),
            REFERENCE_14_INCH,
            MAIN_WINDOW_MIN_LOGICAL,
        );
        assert_eq!(result.geometry.width, MAIN_WINDOW_MIN_LOGICAL.0);
        assert_eq!(result.geometry.height, MAIN_WINDOW_MIN_LOGICAL.1);
        assert!(result.resized);
    }

    #[test]
    fn a_second_display_left_of_the_primary_keeps_its_negative_origin() {
        // Monitor rects are not anchored at zero. A sanitizer that assumed they were would drag
        // every window on a left-hand external display back onto the built-in panel.
        let left_monitor = MonitorRect {
            x: -1920.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
        };
        let saved = at(-1800.0, 200.0, 1400.0, 900.0);
        let result = sanitize_window_geometry(saved, left_monitor, MAIN_WINDOW_MIN_LOGICAL);
        assert_eq!(result.geometry, saved);
        assert!(!result.repositioned);
    }

    /// A 1080p external display: no notch, so its menu bar is the 24pt minimum.
    const EXTERNAL_1080P: MonitorRect = MonitorRect {
        x: 0.0,
        y: 0.0,
        width: 1920.0,
        height: 1080.0,
    };

    #[test]
    fn a_window_snapped_to_the_top_of_a_non_notched_display_is_left_alone() {
        // Every external monitor spends 24pt on its menu bar, not the notched 37. Judging this
        // window against 37 called it unreachable and recentred it — on every single launch, which
        // took away the very position the state plugin had just restored.
        let saved = at(0.0, MACOS_MENU_BAR_MIN_PT, 1400.0, 900.0);
        let result = sanitize_window_geometry(saved, EXTERNAL_1080P, MAIN_WINDOW_MIN_LOGICAL);
        assert_eq!(result.geometry, saved);
        assert!(!result.repositioned, "a window a non-notched display allows must be left where it is");
        assert!(!result.resized);
    }

    #[test]
    fn a_maximized_window_that_exactly_fills_a_non_notched_display_is_not_shrunk() {
        // The zoomed shape macOS itself produces on a 1080p panel. Reserving the notched 37 here
        // clamped a window that fits exactly, so a restored maximised window was resized *and*
        // recentred immediately after the plugin restored it.
        let zoomed_height = EXTERNAL_1080P.height - MACOS_MENU_BAR_MIN_PT - MACOS_TITLE_BAR_PT;
        let saved = at(0.0, MACOS_MENU_BAR_MIN_PT, 1920.0, zoomed_height);
        let result = sanitize_window_geometry(saved, EXTERNAL_1080P, MAIN_WINDOW_MIN_LOGICAL);
        assert_eq!(result.geometry, saved);
        assert!(!result.resized, "a window that fits its display exactly must not be clamped");
        assert!(!result.repositioned);
    }

    #[test]
    fn a_title_bar_genuinely_under_the_menu_bar_is_still_recovered() {
        // The acceptance floor was loosened, not removed: above the shortest menu bar is still
        // unreachable, so relaxing 37 to 24 must not turn this case green.
        let result = sanitize_window_geometry(
            at(0.0, MACOS_MENU_BAR_MIN_PT - 8.0, 1400.0, 900.0),
            EXTERNAL_1080P,
            MAIN_WINDOW_MIN_LOGICAL,
        );
        assert!(result.repositioned);
        assert!(result.geometry.y >= EXTERNAL_1080P.y + MACOS_MENU_BAR_MIN_PT);
    }

    #[test]
    fn a_recentred_window_is_placed_clear_of_a_notch_and_still_fits() {
        // Placement stays conservative even though acceptance is permissive: a recentred window
        // clears the notched menu bar, and its bottom edge must still land on the display.
        let result = sanitize_window_geometry(
            at(0.0, -400.0, 3024.0, 1800.0),
            REFERENCE_14_INCH,
            MAIN_WINDOW_MIN_LOGICAL,
        );
        assert!(result.repositioned);
        assert!(result.geometry.y >= REFERENCE_14_INCH.y + MACOS_MENU_BAR_RESERVE_PT);
        assert!(
            result.geometry.y + result.geometry.height
                <= REFERENCE_14_INCH.y + REFERENCE_14_INCH.height,
            "a recentred window must not hang off the bottom"
        );
    }
}
