use notify_debouncer_full::notify::{RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{
    new_debouncer_opt, DebounceEventResult, DebouncedEvent, Debouncer, NoCache,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, UNIX_EPOCH};
#[cfg(target_os = "macos")]
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

mod acp;
mod acp_doctor;
mod agent_setup;
mod analysis_archive;
mod connector_secrets;
mod connectors;
mod deep_link;
mod errors;
mod git;
mod gray_area;
mod gray_area_rpc;
mod gray_area_scope;
mod jev;
mod library;
mod llm;
mod llm_audit;
mod managed_node;
mod map_entry_diagnostic;
mod meaning_transition_archive;
mod secrets;
mod vault_grants;

/// 20 attempts 250 ms apart: five seconds for a cold start to produce a document.
#[cfg(desktop)]
const DEEP_LINK_ROUTE_ATTEMPTS: usize = 20;
#[cfg(desktop)]
const DEEP_LINK_ROUTE_INTERVAL_MS: u64 = 250;

const WEBVIEW_VERIFY_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_WEBVIEW";
const WEBVIEW_VERIFY_ROUTE_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_ROUTE";
const WEBVIEW_VERIFY_VAULT_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_VAULT";
const WEBVIEW_VERIFY_AI_SETTINGS_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_AI_SETTINGS";
const WEBVIEW_VERIFY_AI_BASE_URL_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_AI_BASE_URL";
const WEBVIEW_VERIFY_WINDOW_SIZE_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_WINDOW_SIZE";
/// Updater checks can only be measured from the installed app (`.claude/rules/testing.md`).
const WEBVIEW_VERIFY_APP_UPDATE_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_APP_UPDATE";
/// Unit tests mock `listenInstallProgress`, so only the app shows whether `app.emit`
/// reaches React. Meaningful only when launched with no tools (`env -i HOME=<empty>`).
const WEBVIEW_VERIFY_ACP_INSTALL_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_ACP_INSTALL";
const MAIN_WINDOW_LABEL: &str = "main";
#[cfg(target_os = "macos")]
const NATIVE_TRAY_ID: &str = "ontology-atlas-tray";
#[cfg(target_os = "macos")]
const NATIVE_TRAY_OPEN_ID: &str = "ontology-atlas-tray-open";
#[cfg(target_os = "macos")]
const NATIVE_TRAY_QUIT_ID: &str = "ontology-atlas-tray-quit";
/// Small on purpose: enough evidence for a bug report, not a history of the machine.
const APP_LOG_MAX_FILE_BYTES: u128 = 5 * 1024 * 1024;

/// The notched 14"/16" figure: placing a window low costs nothing, under a notch
/// costs the title bar.
const MACOS_MENU_BAR_RESERVE_PT: f64 = 37.0;
/// The acceptance floor for non-notched and external displays. Judging against 37
/// would recentre a window at y = 24 on every launch.
const MACOS_MENU_BAR_MIN_PT: f64 = 24.0;
/// The title bar sits outside the inner size.
const MACOS_TITLE_BAR_PT: f64 = 28.0;
/// Must equal `minWidth`/`minHeight` in `tauri.conf.json`; `check-desktop-readiness.mjs` asserts it.
const MAIN_WINDOW_MIN_LOGICAL: (f64, f64) = (1040.0, 720.0);
/// A window whose title bar is off screen cannot be moved back.
const MIN_ONSCREEN_TITLE_BAR_PT: f64 = 120.0;
/// The plugin's `DEFAULT_FILENAME`, shared with the harness's `--reset-window-state`.
const WINDOW_STATE_FILENAME: &str = ".window-state.json";
/// Restoring `FULLSCREEN` adds a Space transition, `VISIBLE` can launch with no
/// window, and `DECORATIONS` never changes here.
#[cfg(desktop)]
const WINDOW_STATE_FLAGS: tauri_plugin_window_state::StateFlags =
    tauri_plugin_window_state::StateFlags::SIZE
        .union(tauri_plugin_window_state::StateFlags::POSITION)
        .union(tauri_plugin_window_state::StateFlags::MAXIMIZED);

/// `x`/`y` are the outer frame origin (`set_position`); `width`/`height` the inner
/// content size (`set_size`, `tauri.conf.json`).
#[derive(Debug, Clone, Copy, PartialEq)]
struct WindowGeometry {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

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

/// Runs on every launch: the plugin restores size in physical pixels and passes any
/// intersecting corner, so a window saved on a Retina panel could exceed a 1x monitor,
/// and even the default height overflows the smallest promised display (1440x900).
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

    // Only the title bar can be grabbed, so reachability is judged on it, not on corners.
    let onscreen_width = (saved.x + width).min(monitor.x + monitor.width) - saved.x.max(monitor.x);
    let reachable = onscreen_width >= MIN_ONSCREEN_TITLE_BAR_PT
        && saved.y >= monitor.y + MACOS_MENU_BAR_MIN_PT
        && saved.y <= monitor.y + monitor.height - MACOS_TITLE_BAR_PT;

    // A resize implies a reposition, or the old origin drifts off an edge.
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

type VaultDebouncer = Debouncer<RecommendedWatcher, NoCache>;

/// Keeping the root lets a repeat call for the same folder skip rebuilding the
/// FSEvents stream.
struct VaultWatch {
    root: PathBuf,
    // Holding it is the behaviour: dropping the debouncer stops the watcher.
    #[allow(dead_code)]
    debouncer: VaultDebouncer,
}

/// Keeps the watcher alive for the app's lifetime.
#[derive(Default)]
struct VaultWatcherState {
    watch: Mutex<Option<VaultWatch>>,
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

pub(crate) fn normalize_relative_path(relative_path: &str) -> Result<PathBuf, String> {
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

pub(crate) fn canonical_root(root_path: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root_path).map_err(|err| err.to_string())?;
    let metadata = fs::metadata(&root).map_err(|err| err.to_string())?;
    if !metadata.is_dir() {
        return Err("vault root must be a directory".into());
    }
    // The renderer chooses this argument; with an XSS it would choose the home
    // directory. Only a root the user actually granted (picker, app container,
    // restored prior choice) may be operated on.
    if !vault_grants::is_vault_granted(&root) {
        return Err("vault-root-not-granted".into());
    }
    Ok(root)
}

/// Like `canonical_root`, but also admits the repository a granted vault lives in, for
/// project-source inspection and document discovery.
pub(crate) fn canonical_source_root(root_path: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root_path).map_err(|err| err.to_string())?;
    let metadata = fs::metadata(&root).map_err(|err| err.to_string())?;
    if !metadata.is_dir() {
        return Err("vault root must be a directory".into());
    }
    if !vault_grants::is_source_granted(&root) {
        return Err("source-root-not-granted".into());
    }
    Ok(root)
}

/// Blocks only named positions: filesystem root, the home directory itself, `/Users`,
/// OS and app directories, and bundles. The vault root becomes the agent's working
/// folder, so session checks reuse this one gate; size heuristics are omitted.
fn is_bundle_directory(root: &Path) -> bool {
    const BUNDLE_EXTENSIONS: &[&str] = &[
        "app",
        "bundle",
        "framework",
        "kext",
        "plugin",
        "prefpane",
        "qlgenerator",
        "saver",
        "wdgt",
        "xpc",
        "appex",
        "component",
        "mdimporter",
    ];
    root.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .is_some_and(|e| BUNDLE_EXTENSIONS.contains(&e.as_str()))
}

fn vault_root_rejection(root: &Path) -> Option<&'static str> {
    // No parent means a filesystem root; callers canonicalize so a symlink cannot route around it.
    if root.parent().is_none() {
        return Some("filesystem-root");
    }

    // A macOS `.app` is a directory; `open` on it launches the program, and its inside
    // is never a documents or agent working folder.
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
        // Only that exact directory; places inside it can be valid.
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

pub(crate) fn resolve_existing_inside(
    root_path: &str,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let path = resolve_inside(root_path, relative_path)?;
    ensure_inside_canonical(root_path, &path)
}

#[cfg(not(unix))]
pub(crate) fn resolve_write_target_inside(
    root_path: &str,
    relative_path: &str,
) -> Result<PathBuf, String> {
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

/// Unsafe characters are rejected, not escaped, even in verification builds.
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
            // Never inherit or delete the user's vault handle: `incognito` maps to WKWebView's
            // nonPersistent store, so the dogfood graph is a deterministic fixture.
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

/// `ONTOLOGY_ATLAS_VERIFY_VAULT` may list several folders separated by `::`; the first
/// opens and all are planted in the recent list, because the nonPersistent store starts
/// empty every launch and the launch chooser would otherwise be unreachable.
fn build_webview_verify_vault_bootstrap_script(root_path: &str) -> String {
    let mut roots = root_path
        .split("::")
        .map(str::trim)
        .filter(|part| !part.is_empty());
    let primary = roots.next().unwrap_or(root_path);
    let extra: Vec<&str> = roots.collect();
    let recent_rows = std::iter::once(primary)
        .chain(extra.iter().copied())
        .map(|path| {
            let name = Path::new(path)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("ontology");
            format!(
                "{{ id: \"current\", handle: {{ name: {} }}, name: {}, desktopRootPath: {}, createdAt: now, lastAccessedAt: now }}",
                js_string_literal(name),
                js_string_literal(name),
                js_string_literal(path),
            )
        })
        .collect::<Vec<_>>()
        .join(", ");
    let fixture_name = js_string_literal(
        Path::new(primary)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("ontology"),
    );
    let root_path = js_string_literal(primary);
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
    // The recent list decides the launch path, so it is planted too; see the note on this
    // function. Counts are deliberately absent, so rows say "not counted yet" rather than
    // claiming numbers the harness never read from disk.
    transaction.objectStore("kv").put([{recent_rows}], "docs-vault:fs-handle:recent");
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

/// One state machine leaves a result on `window` for the marker probe. Every step
/// logs what it waited for; toggling controls are clicked once per cooldown. The address
/// is substituted rather than `format!`-ed, since the JS is full of braces.
fn build_webview_verify_ai_settings_script(base_url: &str) -> String {
    AI_SETTINGS_VERIFY_SCRIPT.replace("__ATLAS_AI_BASE_URL__", &js_string_literal(base_url))
}

/// Measures whether progress reaches the screen, not install success.
const ACP_INSTALL_VERIFY_SCRIPT: &str = include_str!("webview_verify/acp_install_verify.js");

/// Clicks for real: the plugin import, network round trip and `getVersion()` exist
/// only in the installed app.
const APP_UPDATE_VERIFY_SCRIPT: &str = include_str!("webview_verify/app_update_verify.js");

const AI_SETTINGS_VERIFY_SCRIPT: &str = include_str!("webview_verify/ai_settings_verify.js");

/// The file bytes are the probe.
const DOM_MARKER_PROBE_SCRIPT: &str = include_str!("webview_verify/dom_marker_probe.js");

/// Swaps the address for the client router. Only soft-navigating surfaces (map,
/// workshop) change screen, so pair `--require-webview-route` with the route's own
/// markers via `--require-webview-content`; real navigation would wipe the seeded vault.
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

/// One `stat` instead of two per file.
fn metadata_stamp(path: &Path) -> Result<(u128, u64), String> {
    let metadata = fs::metadata(path).map_err(|err| err.to_string())?;
    let modified = metadata.modified().map_err(|err| err.to_string())?;
    let millis = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|err| err.to_string())?
        .as_millis();
    Ok((millis, metadata.len()))
}

/// Every remaining session ends at app shutdown.
#[derive(Default)]
struct AcpSessions(Mutex<std::collections::HashMap<String, Arc<AcpSessionHandle>>>);

struct AcpSessionHandle {
    pid: u32,
    /// Normalized by `acp_start`; the screen cannot reselect it.
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
        // Never hold the registry and writer locks together, so a blocked stdin cannot stop
        // other sessions, exit cleanup or the shutdown drain.
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

    /// Tells the progress thread when to stop.
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

/// A counter, not the pid, which the OS reuses.
static ACP_SESSION_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

/// A channel fetches payloads of 8 KB or more; `app.emit` evaluates them as script.
#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum AcpStreamEvent {
    Message { line: String },
    Stderr { line: String },
    Notice { message: String },
    Exit { code: Option<i32> },
}

type AcpStream = tauri::ipc::Channel<AcpStreamEvent>;

fn adapter_command(
    program: &Path,
    args: &[String],
    launch_dir: &Path,
    vault_root: &Path,
) -> Command {
    debug_assert!(!launch_dir.starts_with(vault_root));
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(launch_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    command
}

#[tauri::command(async)]
fn acp_start(
    app: AppHandle,
    sessions: State<'_, AcpSessions>,
    runtime_id: String,
    cwd: String,
    on_event: AcpStream,
) -> Result<String, String> {
    let root = canonical_root(&cwd).map_err(|err| format!("cwd-unreadable:{err}"))?;
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
    let home =
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    // Include app installs, or the screen keeps asking for installation.
    let app_data_for_paths = app.path().app_data_dir().ok();
    let managed_bin = app_data_for_paths.as_deref().map(acp::managed_cli_bin_dir);
    // Include the app's Node for the same reason.
    let managed_node_bin = app_data_for_paths
        .as_deref()
        .and_then(managed_node::managed_node_bin_dir);
    let mut launch = acp::resolve_launch(
        &runtime_id,
        home.as_deref(),
        std::env::var_os("PATH").as_deref(),
        &probe,
        managed_bin.as_deref(),
        managed_node_bin.as_deref(),
    )?;
    let repo_root = git::find_repo_root(&root).ok().flatten();
    launch.path_env =
        acp::path_without_vault_node_modules_bin(&launch.path_env, &root, repo_root.as_deref());

    // Heal a half-downloaded npx entry just before launch (see the npx cache block in `acp.rs`).
    let npx_preflight = acp::preflight_npx_cache(&launch, home.as_deref());

    // Never inherit the user's global settings: pre-allowed entries bypass the gate.
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("app-data-dir-unavailable:{err}"))?;
    // No start without a verified app-owned boundary. Shadow checks need the CLI's
    // absolute path because a GUI app's PATH differs from the shell's.
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

    let spawned = matches!(npx_preflight, acp::NpxCachePreflight::CacheReady)
        .then(|| acp::launch_from_npx_cache(&launch, home.as_deref(), &is_executable))
        .flatten();
    log::info!(
        "acp start {runtime_id}: {}",
        if spawned.is_some() {
            "cached adapter bin"
        } else {
            "resolved launcher"
        }
    );
    let spawned = spawned.unwrap_or_else(|| launch.clone());
    let mut command = adapter_command(&spawned.program, &spawned.args, &app_data, &root);
    acp::apply_runtime_environment(&mut command, &runtime_id, &spawned.path_env);
    command.env(isolation_env, isolation_dir);

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    #[cfg(windows)]
    {
        // The child does not inherit `windows_subsystem`, so suppress its console window.
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

    // The first stderr lines go to the exit log; silence is itself the clue.
    let early_stderr: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let started_at = Instant::now();
    spawn_acp_line_pump(
        on_event.clone(),
        stdout,
        |line| AcpStreamEvent::Message { line },
        None,
    );
    spawn_acp_line_pump(
        on_event.clone(),
        stderr,
        |line| AcpStreamEvent::Stderr { line },
        Some(early_stderr.clone()),
    );

    // Register before the exit thread starts, or a child that dies at once is removed
    // first and its reused pid could be killed at shutdown.
    sessions.insert(session_id.clone(), pid, root, stdin)?;

    // The exit thread announces termination and unregisters, or sends go to a dead session.
    {
        let app = app.clone();
        let session_id = session_id.clone();
        let on_event = on_event.clone();
        std::thread::spawn(move || {
            let code = child.wait().ok().and_then(|status| status.code());
            log::info!("acp session {session_id} exited with code {code:?}");
            let said = early_stderr
                .lock()
                .map(|held| held.clone())
                .unwrap_or_default();
            for (index, line) in said.iter().enumerate() {
                log::info!("acp session {session_id} said [{index}]: {line}");
            }
            if said.is_empty() && started_at.elapsed() < DEAD_SESSION_WINDOW {
                log::info!(
                    "acp session {session_id} ended within {}s and printed nothing",
                    DEAD_SESSION_WINDOW.as_secs()
                );
            }
            if let Some(state) = app.try_state::<AcpSessions>() {
                let _ = state.remove(&session_id);
            }
            let _ = on_event.send(AcpStreamEvent::Exit { code });
        });
    }

    let first_run_message = match &npx_preflight {
        // Mention the healing for diagnostics.
        acp::NpxCachePreflight::HealedBrokenEntry { reason } => {
            Some(format!("npx-first-run-download:healed:{reason}"))
        }
        acp::NpxCachePreflight::FirstDownload => Some("npx-first-run-download".to_string()),
        // Report the reason so the screen can explain the repeat failure.
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
            let _ = on_event.send(AcpStreamEvent::Notice { message });
            let (Some(entry), Some(package)) = (entry, package) else {
                return; // Only the healing failure; nothing to measure.
            };
            let started = std::time::Instant::now();
            loop {
                std::thread::sleep(std::time::Duration::from_millis(1000));
                // Do not leave the thread forever.
                if started.elapsed() > std::time::Duration::from_secs(20 * 60) {
                    break;
                }
                let alive = app
                    .try_state::<AcpSessions>()
                    .map(|sessions| sessions.contains(&session_id))
                    .unwrap_or(false);
                if !alive {
                    break;
                }
                if acp::npx_entry_health(&entry, &package) == acp::NpxEntryHealth::Usable {
                    let _ = on_event.send(AcpStreamEvent::Notice {
                        message: "npx-download-done".to_string(),
                    });
                    break;
                }
                let mb = acp::dir_size_bytes(&entry) / (1024 * 1024);
                let _ = on_event.send(AcpStreamEvent::Notice {
                    message: format!("npx-download-progress:{mb}"),
                });
            }
        });
    }

    Ok(session_id)
}

const DEAD_SESSION_WINDOW: Duration = Duration::from_secs(10);
const DEAD_SESSION_LOG_LINES: usize = 3;
const DEAD_SESSION_LOG_CHARS: usize = 200;

/// Bounds a child's stderr in a log people paste into issues (three lines, 200 chars); it does not redact.
fn clip_for_log(line: &str) -> String {
    let trimmed = line.trim();
    if trimmed.chars().count() <= DEAD_SESSION_LOG_CHARS {
        return trimmed.to_string();
    }
    let kept: String = trimmed.chars().take(DEAD_SESSION_LOG_CHARS).collect();
    format!("{kept}…")
}

fn spawn_acp_line_pump<R: std::io::Read + Send + 'static>(
    on_event: AcpStream,
    stream: R,
    event: fn(String) -> AcpStreamEvent,
    // A child that dies at once leaves nothing else to quote.
    early_lines: Option<Arc<Mutex<Vec<String>>>>,
) {
    std::thread::spawn(move || {
        let mut reader = std::io::BufReader::new(stream);
        loop {
            match acp::read_bounded_line(&mut reader, acp::MAX_LINE_BYTES) {
                Ok(Some(bytes)) => {
                    let line = acp_line_text(bytes);
                    if let Some(sink) = early_lines.as_ref() {
                        if let Ok(mut held) = sink.lock() {
                            if held.len() < DEAD_SESSION_LOG_LINES {
                                held.push(clip_for_log(&line));
                            }
                        }
                    }
                    let _ = on_event.send(event(line));
                }
                Ok(None) => break,
                Err(err) => {
                    let _ = on_event.send(AcpStreamEvent::Notice {
                        message: format!("dropped-line:{err}"),
                    });
                    if err.kind() != std::io::ErrorKind::InvalidData {
                        break;
                    }
                }
            }
        }
    });
}

fn acp_line_text(bytes: Vec<u8>) -> String {
    String::from_utf8(bytes)
        .unwrap_or_else(|invalid| String::from_utf8_lossy(invalid.as_bytes()).into_owned())
}

/// Never reimplemented on the screen: the looser copy would win, and only Rust can
/// resolve links. The root is the one bound to the session at `acp_start`.
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

/// The newline is appended here, or the peer waits forever.
#[tauri::command]
fn acp_send(
    sessions: State<'_, AcpSessions>,
    session_id: String,
    line: String,
) -> Result<(), String> {
    // Connector tokens become values only here, one line before leaving the process;
    // ordinary lines pass after one substring check.
    let line = connector_secrets::resolve_secret_refs(&line)?;
    sessions.send_line(&session_id, &line)
}

#[tauri::command(async)]
fn acp_stop(sessions: State<'_, AcpSessions>, session_id: String) -> Result<(), String> {
    // Distinguishes a stop the screen asked for from the child exiting on its own after stdin closes.
    log::info!("acp session {session_id} stop requested by the screen");
    let pid = sessions.take_pid(&session_id)?;
    match pid {
        Some(pid) => acp::terminate_tree(pid),
        None => Ok(()),
    }
}

/// Otherwise closing the window leaves adapters and grandchildren running.
fn terminate_all_acp_sessions(app: &AppHandle) {
    log::info!("acp sessions ending because the app is shutting down");
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

/// Reads only. With `probe_login` it briefly launches each CLI and reads the exit code;
/// the screen calls once without it to draw fast, then again to correct.
#[tauri::command(async)]
fn acp_detect_runtimes(
    app: tauri::AppHandle,
    probe_login: Option<bool>,
) -> Vec<acp::AcpRuntimeStatus> {
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
    // Include app installs, or the screen still says installation is required.
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

/// Only known values are sent: `received`/`total` for the Node download, npm's last
/// actual line as `note`, never an invented percentage.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AcpInstallProgress {
    runtime_id: String,
    /// The screen owns the wording.
    job: &'static str,
    stage: &'static str,
    received: Option<u64>,
    total: Option<u64>,
    /// The tool's own line.
    note: Option<String>,
    /// Epoch ms, so an old completion is not shown as fresh.
    at: u64,
}

/// Contract with the TS side: a wrong payload key discards every event silently,
/// so the test pins the serialized keys.
const ACP_INSTALL_PROGRESS_EVENT: &str = "acp-install://progress";

/// The settings sheet unmounts when closed and one-shot `done` would be missed, so the
/// process that owns the install keeps the last state per tool.
#[derive(Default)]
struct AcpInstallProgressState {
    /// Per tool, or one install overwrites another's completion.
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
    // Record first, or a screen asking right after the event reads a stale value.
    if let Some(state) = app.try_state::<AcpInstallProgressState>() {
        if let Ok(mut last) = state.last.lock() {
            last.insert(runtime_id.to_string(), payload.clone());
        }
    }
    let _ = app.emit(ACP_INSTALL_PROGRESS_EVENT, payload);
}

/// The screen asks once on remount so a completion is not missed.
#[tauri::command]
fn acp_install_progress(app: tauri::AppHandle, runtime_id: String) -> Option<AcpInstallProgress> {
    let state = app.try_state::<AcpInstallProgressState>()?;
    let last = state.last.lock().ok()?;
    last.get(&runtime_id).cloned()
}

/// Otherwise a stale "installed" resurfaces after a re-check; the screen clears its state too.
fn forget_install_progress(app: &tauri::AppHandle, runtime_id: &str) {
    if let Some(state) = app.try_state::<AcpInstallProgressState>() {
        if let Ok(mut last) = state.last.lock() {
            last.remove(runtime_id);
        }
    }
}

/// `None` means an unlisted platform.
#[tauri::command]
fn acp_node_plan() -> Option<String> {
    managed_node::managed_node_plan()
}

/// Only on a click, after showing the source, inside `<app-data>/runtimes/node`, with a
/// pinned version and a verified hash.
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
    emit_install_progress(
        &app,
        &runtime_id,
        "node",
        "verifying-install",
        None,
        None,
        None,
    );
    let after = doctor_context(&app, &runtime_id)?;
    emit_install_progress(&app, &runtime_id, "node", "done", None, None, None);
    Ok(acp_doctor::diagnose(&after.borrow()))
}

/// The screen shows the raw command before the press; `None` leaves only the guide link.
#[tauri::command]
fn acp_install_plan(app: tauri::AppHandle, runtime_id: String) -> Option<String> {
    let app_data = app.path().app_data_dir().ok()?;
    acp::managed_install_command(&runtime_id, &app_data)
}

/// Only on a user press, after `acp_install_plan` showed the command, under `--prefix
/// <app-data>/managed-node`, pinned by `INSTALLABLE_CLI`; the result is
/// re-verified before claiming success.
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
    // The bundled npm is the fallback when the system has none.
    let managed_node_bin = managed_node::managed_node_bin_dir(&app_data);
    let dirs = acp::candidate_bin_dirs(
        home.as_deref(),
        std::env::var_os("PATH").as_deref(),
        &probe,
        None,
        managed_node_bin.as_deref(),
    );
    // Never by name: a GUI app's PATH differs from the shell's.
    let npm =
        acp::resolve_command("npm", &dirs, &probe).ok_or_else(|| "npm-missing".to_string())?;
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
    // Stream stderr instead of `.output()`, which returns only at exit; the tool's own
    // lines are pushed, never invented percentages.
    let mut child = command
        .spawn()
        .map_err(|err| format!("install-failed:{err}"))?;
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
    let status = child
        .wait()
        .map_err(|err| format!("install-failed:{err}"))?;
    if let Some(handle) = pump {
        let _ = handle.join();
    }
    if !status.success() {
        // Only the last line; hundreds of npm lines are not guidance.
        let last = tail.lock().map(|slot| slot.clone()).unwrap_or_default();
        emit_install_progress(&app, &runtime_id, "cli", "failed", None, None, None);
        return Err(format!("install-failed:{last}"));
    }

    // Report re-verifying, then the verified value.
    emit_install_progress(
        &app,
        &runtime_id,
        "cli",
        "verifying-install",
        None,
        None,
        None,
    );
    let after = doctor_context(&app, &runtime_id)?;
    emit_install_progress(&app, &runtime_id, "cli", "done", None, None, None);
    Ok(acp_doctor::diagnose(&after.borrow()))
}

/// Only `http`/`https`: the screen's address goes straight to the OS, so any other
/// scheme could open arbitrary things. Uses one OS command instead of a plugin.
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
        // No shell: `cmd /C start` would let a metacharacter in the URL (`&`, `|`,
        // `%`, `^`) run a command, and the openable-URL check allows those since it
        // only bars whitespace. rundll32 hands the URL straight to the protocol
        // handler as one argument.
        let mut c = Command::new("rundll32.exe");
        c.args(["url.dll,FileProtocolHandler", &url]);
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

    // Dropping a `Child` does not reap it; a detached wait keeps the command instant
    // without leaving a zombie per clicked link.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

/// An allowlist, because denylists miss new schemes.
pub(crate) fn is_openable_url(url: &str) -> bool {
    let lowered = url.trim().to_ascii_lowercase();
    (lowered.starts_with("https://") || lowered.starts_with("http://"))
        && !url.chars().any(|c| c.is_whitespace())
}

/// Returns facts per step; the screen writes the sentences.
#[tauri::command(async)]
fn acp_diagnose(
    app: tauri::AppHandle,
    runtime_id: String,
) -> Result<Vec<acp_doctor::AcpCheck>, String> {
    // The screen clears its state at the same moment.
    forget_install_progress(&app, &runtime_id);
    let ctx = doctor_context(&app, &runtime_id)?;
    Ok(acp_doctor::diagnose(&ctx.borrow()))
}

/// Only `fixable` items arrive.
#[tauri::command(async)]
fn acp_repair(
    app: tauri::AppHandle,
    runtime_id: String,
    check_id: String,
) -> Result<Vec<acp_doctor::AcpCheck>, String> {
    let ctx = doctor_context(&app, &runtime_id)?;
    acp_doctor::repair(&ctx.borrow(), &check_id)?;
    // Return the re-verified state, never a bare claim of success.
    let after = doctor_context(&app, &runtime_id)?;
    Ok(acp_doctor::diagnose(&after.borrow()))
}

/// Returns the re-verified value, never a bare claim.
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

/// Owned values; `borrow()` converts them.
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

    let agent =
        acp::registry_agent(runtime_id).ok_or_else(|| format!("unknown-runtime:{runtime_id}"))?;
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

    // Ask against the app-owned folder the session actually uses.
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

/// Not `async`: `NSOpenPanel` must run on the macOS main thread with its own modal
/// loop, so moving it to a worker would break it.
#[tauri::command]
fn pick_vault_directory(dialog_title: Option<String>) -> Result<Option<String>, String> {
    let title = dialog_title.as_deref().unwrap_or("Open ontology vault");
    let Some(picked) = rfd::FileDialog::new().set_title(title).pick_folder() else {
        return Ok(None);
    };
    // Judge the real location after symlinks (`/tmp` vs `/private/tmp`); fall back to
    // the picked path when canonicalize fails.
    let resolved = fs::canonicalize(&picked).unwrap_or_else(|_| picked.clone());
    if let Some(reason) = vault_root_rejection(&resolved) {
        // A stable code, so translation stays on the screen.
        return Err(format!("vault-root-rejected:{reason}"));
    }
    // The native picker is a genuine user choice, so this is where a vault becomes a
    // granted root; the redirect into `<project>/atlas` stays inside it.
    vault_grants::grant_vault_root(&resolved);
    Ok(Some(picked.to_string_lossy().to_string()))
}

#[tauri::command(async)]
fn list_vault_directory(
    root_path: String,
    relative_path: String,
    include_links: Option<bool>,
) -> Result<Vec<TauriVaultEntry>, String> {
    let dir = resolve_existing_inside(&root_path, &relative_path)?;
    let entries = fs::read_dir(dir).map_err(|err| err.to_string())?;
    let mut out = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|err| err.to_string())?;
        let file_type = entry.file_type().map_err(|err| err.to_string())?;
        let kind = if file_type.is_symlink() {
            if include_links != Some(true) {
                continue;
            }
            "symlink"
        } else if file_type.is_dir() {
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

/// Path and mtime only, never content.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultStamp {
    relative_path: String,
    last_modified: u128,
    /// From directory metadata; reading the file would undo this command's purpose.
    size: u64,
}

/// Truncation and pruning are returned, not hidden.
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSourceContinuityExclusions {
    target: Option<String>,
    archive_prefix: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSourceContinuityInspection {
    #[serde(flatten)]
    source: ProjectSourceInspection,
    scope: String,
    exclusions: ProjectSourceContinuityExclusions,
}

struct SourceInventory {
    hasher: Sha256,
    files: Vec<String>,
    hashed_bytes: u64,
    truncated: bool,
}

// Byte-for-byte aligned with mcp/src/project-source-inspection.mjs so a fresh MCP
// process reproduces the receipt; tests/contract/source-inventory-bound.contract.test.ts
// fails on drift.
const SOURCE_INVENTORY_VERSION: &str = "inventory-v2";
const SOURCE_INVENTORY_MAX_DEPTH: usize = 20;
const SOURCE_INVENTORY_MAX_FILES: usize = 8000;
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
        // A tracked symlink is evidence, not permission to read outside the root.
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
    // A connected project source is untrusted repo content; the base hardening
    // refuses an embedded bare repo and disables fsmonitor/hooks before git reads
    // the source's own config. These reads (ls-files/diff --name-only/status/
    // rev-parse) run no content filter, so name discovery is not needed here.
    let output = git::hardened_base_command()
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
    // Deleted paths still perturb the worktree fingerprint.
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

fn continuity_excluded(relative: &str, target: Option<&str>, archive_prefix: Option<&str>) -> bool {
    target == Some(relative) || archive_prefix.is_some_and(|prefix| relative.starts_with(prefix))
}

fn git_continuity_observation(
    repo_root: &Path,
    target: Option<&str>,
    archive_prefix: Option<&str>,
) -> Result<(String, bool, Vec<String>), String> {
    let listing = run_source_git(
        repo_root,
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
        .filter(|path| !continuity_excluded(path, target, archive_prefix))
        .collect();
    paths.sort();
    paths.dedup();

    let status = run_source_git(
        repo_root,
        &[
            "status",
            "--porcelain=v1",
            "--no-renames",
            "-z",
            "--untracked-files=all",
        ],
    )?;
    let mut visible_status: Vec<Vec<u8>> = status
        .split(|byte| *byte == 0)
        .filter(|row| !row.is_empty())
        .filter(|row| {
            let relative = if row.len() > 3 {
                String::from_utf8_lossy(&row[3..]).replace('\\', "/")
            } else {
                String::new()
            };
            !continuity_excluded(&relative, target, archive_prefix)
        })
        .map(|row| row.to_vec())
        .collect();
    visible_status.sort();

    let dirty_paths: std::collections::HashSet<String> = visible_status
        .iter()
        .filter_map(|row| {
            (row.len() > 3).then(|| String::from_utf8_lossy(&row[3..]).replace('\\', "/"))
        })
        .collect();
    let mut inventory = SourceInventory {
        hasher: Sha256::new(),
        files: Vec::new(),
        hashed_bytes: 0,
        truncated: paths.len() > SOURCE_INVENTORY_MAX_FILES,
    };
    inventory.hasher.update(b"continuity-v1");
    inventory.hasher.update([0]);
    for relative in paths.iter().take(SOURCE_INVENTORY_MAX_FILES) {
        hash_source_file(
            &repo_root.join(relative),
            relative,
            &mut inventory,
            dirty_paths.contains(relative),
        )?;
    }
    for row in visible_status {
        inventory.hasher.update(&row);
        inventory.hasher.update([0]);
    }
    Ok((
        format!("sha256:{:x}", inventory.hasher.finalize()),
        inventory.truncated,
        inventory.files,
    ))
}

#[tauri::command(async)]
fn inspect_project_source_continuity(
    source_root: String,
    vault_root: String,
    target_slug: String,
) -> Result<ProjectSourceContinuityInspection, String> {
    let selected_source = canonical_source_root(&source_root)?;
    let vault = canonical_root(&vault_root)?;
    let slug = normalize_relative_path(&target_slug)?;
    if slug.extension().is_some() || slug.as_os_str().is_empty() {
        return Err("continuity target must be a vault slug without an extension".into());
    }
    let target_path = vault.join(&slug).with_extension("md");
    let target_metadata = fs::symlink_metadata(&target_path).map_err(|err| err.to_string())?;
    if !target_metadata.file_type().is_file() || target_metadata.file_type().is_symlink() {
        return Err("continuity target must be an existing regular vault file".into());
    }
    let canonical_target = fs::canonicalize(&target_path).map_err(|err| err.to_string())?;
    if !canonical_target.starts_with(&vault) {
        return Err("continuity target must stay inside the selected vault".into());
    }
    let repo_root = git::find_repo_root(&selected_source)?
        .ok_or_else(|| "meaning transition continuity requires a Git source".to_string())?;
    let relative_target = canonical_target
        .strip_prefix(&repo_root)
        .ok()
        .map(|path| path.to_string_lossy().replace('\\', "/"));
    let archive = vault.join(".ontology-atlas/meaning-transitions");
    let relative_archive = archive.strip_prefix(&repo_root).ok().map(|path| {
        let mut value = path.to_string_lossy().replace('\\', "/");
        if !value.ends_with('/') {
            value.push('/');
        }
        value
    });
    let (fingerprint, truncated, files) = git_continuity_observation(
        &repo_root,
        relative_target.as_deref(),
        relative_archive.as_deref(),
    )?;
    if truncated {
        return Err("meaning transition continuity inventory is truncated".into());
    }
    let head = run_source_git(&repo_root, &["rev-parse", "HEAD"])?;
    let revision = String::from_utf8_lossy(&head).trim().to_string();
    let status = run_source_git(
        &repo_root,
        &[
            "status",
            "--porcelain=v1",
            "--no-renames",
            "-z",
            "--untracked-files=all",
        ],
    )?;
    let visible_dirty = status
        .split(|byte| *byte == 0)
        .filter(|row| !row.is_empty())
        .any(|row| {
            let relative = if row.len() > 3 {
                String::from_utf8_lossy(&row[3..]).replace('\\', "/")
            } else {
                String::new()
            };
            !continuity_excluded(
                &relative,
                relative_target.as_deref(),
                relative_archive.as_deref(),
            )
        });
    let canonical = repo_root.to_string_lossy().to_string();
    Ok(ProjectSourceContinuityInspection {
        source: ProjectSourceInspection {
            root_path: canonical.clone(),
            source_id: source_digest(&[b"git", canonical.as_bytes()]),
            kind: "git".into(),
            revision,
            fingerprint,
            dirty: Some(visible_dirty),
            truncated: false,
            files,
        },
        scope: "meaning-transition-continuity-v1".into(),
        exclusions: ProjectSourceContinuityExclusions {
            target: relative_target,
            archive_prefix: relative_archive,
        },
    })
}

#[tauri::command(async)]
fn inspect_project_source(root_path: String) -> Result<ProjectSourceInspection, String> {
    let selected_root = canonical_source_root(&root_path)?;
    match git::find_repo_root(&selected_root)? {
        Some(repo_root) => {
            // Git's tracked plus unignored set keeps caches and ignored artifacts out of the budget.
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

/// Must equal TS `VAULT_WALK_MAX_DEPTH`; a contract test watches it.
const VAULT_WALK_MAX_DEPTH: usize = 12;
/// Same value as TS `VAULT_WALK_MAX_ENTRIES`.
const VAULT_WALK_MAX_ENTRIES: usize = 100000;
/// Same list as TS `PRUNE_BY_NAME`.
const VAULT_PRUNE_DIR_NAMES: &[&str] = &["node_modules"];
/// Same value as TS `CACHE_DIR_TAG`.
const VAULT_CACHE_DIR_TAG: &str = "CACHEDIR.TAG";
/// Same extension set as TS `IMAGE_EXT` (lowercase comparison).
const VAULT_IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"];
/// Same value as TS `VAULT_SOURCES_DIR`. Raw sources are listed by name, size and
/// mtime but never parsed, so any format can sit in the vault (`docs/DECISIONS.md`).
const VAULT_SOURCES_DIR: &str = "sources";

/// Anchored at the top level: `notes/sources/a.pdf` is not a raw source.
fn vault_relative_is_source(relative: &str) -> bool {
    relative
        .strip_prefix(VAULT_SOURCES_DIR)
        .is_some_and(|rest| rest.starts_with('/'))
}

fn vault_entry_is_tracked(name: &str) -> bool {
    if name.ends_with(".md") {
        return true;
    }
    match name.rsplit_once('.') {
        Some((_, ext)) => VAULT_IMAGE_EXTS.contains(&ext.to_ascii_lowercase().as_str()),
        None => false,
    }
}

const VAULT_AGENT_CONFIG_FILES: &[&str] = &[".mcp.json", ".mcp.json.example", ".codex/config.toml"];

/// macOS reports a folder moved in, out or renamed only on the folder's own path, so a walked
/// path that is no longer a regular file counts too.
fn vault_change_is_visible(root: &Path, path: &Path) -> bool {
    if path.extension().is_some_and(|ext| ext == "md") {
        return true;
    }
    let Ok(relative) = path.strip_prefix(root) else {
        return false;
    };
    let relative = relative.to_string_lossy().replace('\\', "/");
    if relative.starts_with(".ontology-atlas/")
        || VAULT_AGENT_CONFIG_FILES.contains(&relative.as_str())
    {
        return true;
    }
    let mut parts = relative.split('/');
    let name = parts.next_back().unwrap_or_default();
    let walked = parts.all(|part| !part.starts_with('.') && !VAULT_PRUNE_DIR_NAMES.contains(&part));
    if !walked || name.starts_with('.') || VAULT_PRUNE_DIR_NAMES.contains(&name) {
        return false;
    }
    vault_entry_is_tracked(name)
        || vault_relative_is_source(&relative)
        || !fs::symlink_metadata(path).is_ok_and(|metadata| metadata.is_file())
}

fn vault_batch_is_visible(root: &Path, events: &[DebouncedEvent]) -> bool {
    events.iter().any(|event| {
        event.need_rescan()
            || event
                .paths
                .iter()
                .any(|path| vault_change_is_visible(root, path))
    })
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

    // The cache-tag judgment needs the whole listing.
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
        acc.pruned_dirs.push(if prefix.is_empty() {
            ".".into()
        } else {
            prefix.into()
        });
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
        } else if vault_entry_is_tracked(&name) || vault_relative_is_source(&relative) {
            let (last_modified, size) = metadata_stamp(&dir.join(&name))?;
            acc.entries.push(VaultStamp {
                relative_path: relative,
                last_modified,
                size,
            });
        }
    }
    Ok(())
}

/// Paths and mtimes only, in one call instead of reading every body across IPC. The
/// walk rules must match TS exactly or fingerprints diverge; the contract
/// test `tests/contract/vault-walk-rules.contract.test.ts` holds both.
#[tauri::command(async)]
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

#[tauri::command(async)]
fn read_vault_text_file(root_path: String, relative_path: String) -> Result<TauriTextFile, String> {
    let path = resolve_existing_inside(&root_path, &relative_path)?;
    let text = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let last_modified = metadata_mtime_ms(&path)?;
    Ok(TauriTextFile {
        text,
        last_modified,
    })
}

const VAULT_TEXT_BATCH_MAX: usize = 256;
const VAULT_TEXT_BATCH_FILE_MAX_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TauriTextFileRead {
    relative_path: String,
    text: Option<String>,
    last_modified: Option<u128>,
    error: Option<String>,
}

#[tauri::command(async)]
fn read_vault_text_files(
    root_path: String,
    relative_paths: Vec<String>,
) -> Result<Vec<TauriTextFileRead>, String> {
    if relative_paths.len() > VAULT_TEXT_BATCH_MAX {
        return Err(format!(
            "at most {VAULT_TEXT_BATCH_MAX} files are read in one batch"
        ));
    }
    let root = canonical_root(&root_path)?;
    Ok(relative_paths
        .into_iter()
        .map(
            |relative_path| match read_vault_markdown(&root, &relative_path) {
                Ok((text, last_modified)) => TauriTextFileRead {
                    relative_path,
                    text: Some(text),
                    last_modified: Some(last_modified),
                    error: None,
                },
                Err(error) => TauriTextFileRead {
                    relative_path,
                    text: None,
                    last_modified: None,
                    error: Some(error),
                },
            },
        )
        .collect())
}

fn is_visible_markdown(relative: &Path) -> bool {
    relative.extension().is_some_and(|ext| ext == "md")
        && !relative
            .components()
            .any(|part| part.as_os_str().to_string_lossy().starts_with('.'))
}

fn read_vault_markdown(root: &Path, relative_path: &str) -> Result<(String, u128), String> {
    let relative = normalize_relative_path(relative_path)?;
    if !is_visible_markdown(&relative) {
        return Err("a batch reads only Markdown outside dot folders".into());
    }
    let path = fs::canonicalize(root.join(&relative)).map_err(|err| err.to_string())?;
    let Ok(target) = path.strip_prefix(root) else {
        return Err("resolved path must stay inside the selected vault".into());
    };
    if !is_visible_markdown(target) {
        return Err("a batch reads only Markdown outside dot folders".into());
    }
    let metadata = fs::metadata(&path).map_err(|err| err.to_string())?;
    if metadata.len() > VAULT_TEXT_BATCH_FILE_MAX_BYTES {
        return Err(format!(
            "a batch reads files up to {VAULT_TEXT_BATCH_FILE_MAX_BYTES} bytes"
        ));
    }
    let text = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let last_modified = metadata_mtime_ms(&path)?;
    Ok((text, last_modified))
}

#[tauri::command(async)]
fn read_vault_text_tail(
    root_path: String,
    relative_path: String,
    max_lines: usize,
) -> Result<String, String> {
    let path = resolve_existing_inside(&root_path, &relative_path)?;
    read_text_tail(&path, max_lines, MAX_TEXT_TAIL_BYTES).map_err(|err| err.to_string())
}

const MAX_TEXT_TAIL_BYTES: u64 = 1024 * 1024;

fn read_text_tail(path: &Path, max_lines: usize, max_bytes: u64) -> std::io::Result<String> {
    use std::io::{Seek, SeekFrom};
    const CHUNK_BYTES: u64 = 16 * 1024;

    let mut file = fs::File::open(path)?;
    let end = file.metadata()?.len();
    let floor = end.saturating_sub(max_bytes);
    let mut start = end;
    let mut newlines = 0;
    let mut chunks: Vec<Vec<u8>> = Vec::new();
    while start > floor && newlines <= max_lines {
        let from = start.saturating_sub(CHUNK_BYTES).max(floor);
        let mut chunk = vec![0_u8; (start - from) as usize];
        file.seek(SeekFrom::Start(from))?;
        file.read_exact(&mut chunk)?;
        newlines += chunk.iter().filter(|byte| **byte == b'\n').count();
        chunks.push(chunk);
        start = from;
    }
    let tail: Vec<u8> = chunks.into_iter().rev().flatten().collect();
    let text = String::from_utf8_lossy(&tail);
    let mut lines: Vec<&str> = text.lines().collect();
    if start > 0 && !lines.is_empty() {
        lines.remove(0);
    }
    let keep = lines.len().saturating_sub(max_lines);
    Ok(lines[keep..].join("\n"))
}

/// A u64 LE mtime, then raw bytes: a serde `Vec<u8>` is one JSON number per byte.
#[tauri::command(async)]
fn read_vault_binary_file(
    root_path: String,
    relative_path: String,
) -> Result<tauri::ipc::Response, String> {
    let path = resolve_existing_inside(&root_path, &relative_path)?;
    read_stamped_bytes(&path).map(tauri::ipc::Response::new)
}

fn read_stamped_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let mut file = fs::File::open(path).map_err(|err| err.to_string())?;
    let metadata = file.metadata().map_err(|err| err.to_string())?;
    let modified = metadata.modified().map_err(|err| err.to_string())?;
    let last_modified = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|err| err.to_string())?
        .as_millis() as u64;
    let mut stamped = Vec::with_capacity(8 + metadata.len() as usize);
    stamped.extend_from_slice(&last_modified.to_le_bytes());
    file.read_to_end(&mut stamped)
        .map_err(|err| err.to_string())?;
    Ok(stamped)
}

/// Temporary file, sync, then rename, so a crash leaves old or new content, never a
/// truncated file.
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
        // Sync first, or power loss can leave the new name with cached content.
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, path)
    })();
    if result.is_err() {
        // Only the temporary file; the original was never touched.
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryCollectionsWriteResult {
    written: bool,
    current_content: Option<String>,
}

#[cfg(not(unix))]
fn read_library_collections_file(path: &Path) -> Result<Option<String>, String> {
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let mut text = String::new();
    file.take(1024 * 1024 + 1)
        .read_to_string(&mut text)
        .map_err(|error| error.to_string())?;
    if text.len() > 1024 * 1024 {
        return Err("collection preferences exceed the 1 MiB limit".into());
    }
    Ok(Some(text))
}

#[tauri::command(async)]
fn read_library_collections(root_path: String) -> Result<Option<String>, String> {
    const DIRECTORY: &str = ".ontology-atlas";
    const FILE_NAME: &str = "library-collections.json";
    #[cfg(unix)]
    {
        let root = canonical_root(&root_path)?;
        let root_handle = agent_setup::open_absolute_directory_no_follow(&root)?;
        let Some(parent) =
            agent_setup::open_relative_directory(&root_handle, Path::new(DIRECTORY))?
        else {
            return Ok(None);
        };
        let file_name = std::ffi::CString::new(FILE_NAME).map_err(|error| error.to_string())?;
        return agent_setup::read_entry_text(&parent, &file_name);
    }
    #[cfg(not(unix))]
    {
        // A read must not create the sidecar folder via the write-target resolver.
        let path = resolve_inside(&root_path, &format!("{DIRECTORY}/{FILE_NAME}"))?;
        if !path.exists() {
            return Ok(None);
        }
        let path = ensure_inside_canonical(&root_path, &path)?;
        read_library_collections_file(&path)
    }
}

/// Serialized only within this process; external editors do not share the lock, so a
/// conflict returns the current bytes and callers re-read.
#[tauri::command]
fn write_library_collections(
    root_path: String,
    expected_content: Option<String>,
    content: String,
) -> Result<LibraryCollectionsWriteResult, String> {
    static WRITE_LOCK: std::sync::OnceLock<Mutex<()>> = std::sync::OnceLock::new();
    let _guard = WRITE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "library collection write lock is unavailable".to_string())?;
    const RELATIVE_PATH: &str = ".ontology-atlas/library-collections.json";
    if content.len() > 1024 * 1024 {
        return Err("library collection preferences exceed the 1 MiB limit".into());
    }

    #[cfg(unix)]
    {
        let root = canonical_root(&root_path)?;
        let root_handle = agent_setup::open_absolute_directory_no_follow(&root)?;
        let (parent, file_name) = agent_setup::open_entry_parent(&root_handle, RELATIVE_PATH)?;
        let current = agent_setup::read_entry_text(&parent, &file_name)?;
        if current != expected_content {
            return Ok(LibraryCollectionsWriteResult {
                written: false,
                current_content: current,
            });
        }
        agent_setup::write_entry_atomically(&parent, &file_name, &content, 0o600)?;
        return Ok(LibraryCollectionsWriteResult {
            written: true,
            current_content: Some(content),
        });
    }

    #[cfg(not(unix))]
    {
        let sidecar = resolve_write_target_inside(&root_path, ".ontology-atlas")?;
        fs::create_dir_all(&sidecar).map_err(|error| error.to_string())?;
        ensure_inside_canonical(&root_path, &sidecar)?;
        let path = resolve_write_target_inside(&root_path, RELATIVE_PATH)?;
        let current = read_library_collections_file(&path)?;
        if current != expected_content {
            return Ok(LibraryCollectionsWriteResult {
                written: false,
                current_content: current,
            });
        }
        write_text_atomically(&path, &content)?;
        Ok(LibraryCollectionsWriteResult {
            written: true,
            current_content: Some(content),
        })
    }
}

#[cfg(test)]
mod library_collections_write_tests {
    use super::{read_library_collections, write_library_collections};

    fn vault(label: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "ontology-atlas-library-collections-{label}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    /// A vault without saved constellations is empty, not an error.
    #[test]
    fn read_answers_absent_for_a_vault_that_never_saved_collections() {
        let root = vault("absent");
        let root_path = root.to_string_lossy().to_string();
        assert_eq!(read_library_collections(root_path.clone()).unwrap(), None);
        assert!(
            !root.join(".ontology-atlas").exists(),
            "reading must not create the sidecar folder"
        );
        std::fs::create_dir(root.join(".ontology-atlas")).unwrap();
        std::fs::write(root.join(".ontology-atlas/activity.jsonl"), "{}\n").unwrap();
        assert_eq!(read_library_collections(root_path).unwrap(), None);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn compare_before_save_preserves_newer_content() {
        let root = vault("conflict");
        let root_path = root.to_string_lossy().to_string();
        let first = write_library_collections(root_path.clone(), None, "first\n".into()).unwrap();
        assert!(first.written);
        let conflict = write_library_collections(root_path, None, "stale\n".into()).unwrap();
        assert!(!conflict.written);
        assert_eq!(conflict.current_content.as_deref(), Some("first\n"));
        assert_eq!(
            std::fs::read_to_string(root.join(".ontology-atlas/library-collections.json")).unwrap(),
            "first\n"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn read_rejects_a_nonregular_target_without_waiting_for_a_writer() {
        use std::os::unix::ffi::OsStrExt;

        let root = vault("fifo");
        let sidecar = root.join(".ontology-atlas");
        std::fs::create_dir(&sidecar).unwrap();
        let path = sidecar.join("library-collections.json");
        let name = std::ffi::CString::new(path.as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
        let error = read_library_collections(root.to_string_lossy().to_string()).unwrap_err();
        assert!(error.contains("not a regular file"), "{error}");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn read_and_write_reject_content_beyond_the_preferences_budget() {
        let root = vault("oversize");
        let sidecar = root.join(".ontology-atlas");
        std::fs::create_dir(&sidecar).unwrap();
        std::fs::write(
            sidecar.join("library-collections.json"),
            vec![b'x'; 1024 * 1024 + 1],
        )
        .unwrap();
        let root_path = root.to_string_lossy().to_string();
        assert!(read_library_collections(root_path.clone())
            .unwrap_err()
            .contains("1 MiB"));
        let write_error =
            match write_library_collections(root_path, None, "x".repeat(1024 * 1024 + 1)) {
                Err(error) => error,
                Ok(_) => panic!("oversized collection preferences were accepted"),
            };
        assert!(write_error.contains("1 MiB"));
        std::fs::remove_dir_all(root).unwrap();
    }
}

/// Create-only: existing entries are preserved byte for byte.
#[tauri::command]
fn create_vault_text_file(
    root_path: String,
    relative_path: String,
    content: String,
) -> Result<bool, String> {
    create_vault_text_file_after_validation(root_path, relative_path, content, || {})
}

fn create_vault_text_file_after_validation(
    root_path: String,
    relative_path: String,
    content: String,
    after_validation: impl FnOnce(),
) -> Result<bool, String> {
    #[cfg(unix)]
    {
        let root = canonical_root(&root_path)?;
        let relative = normalize_relative_path(&relative_path)?;
        let parent_relative = relative.parent().unwrap_or_else(|| Path::new(""));
        resolve_directory_target_inside(&root_path, &parent_relative.to_string_lossy())?;
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
        agent_setup::create_entry_atomically(&parent, &file_name, &content, 0o666)
    }
    #[cfg(not(unix))]
    {
        let path = resolve_write_target_inside(&root_path, &relative_path)?;
        after_validation();
        create_text_exclusively(&path, &content)
    }
}

/// Unsupported hard-link publication fails closed.
#[cfg(any(not(unix), test))]
fn create_text_exclusively(path: &Path, content: &str) -> Result<bool, String> {
    create_text_exclusively_with(path, content, |from, to| fs::hard_link(from, to))
}

#[cfg(any(not(unix), test))]
fn create_text_exclusively_with(
    path: &Path,
    content: &str,
    publish: impl FnOnce(&Path, &Path) -> std::io::Result<()>,
) -> Result<bool, String> {
    use std::io::Write;
    static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let parent = path.parent().ok_or("file creation requires a parent")?;
    let nonce = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let mut created = None;
    for _ in 0..64 {
        let sequence = SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let temporary = parent.join(format!(
            ".oatlas-create-{}-{nonce:x}-{sequence:x}.tmp",
            std::process::id()
        ));
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
        {
            Ok(file) => {
                created = Some((temporary, file));
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    let (temporary, mut file) = created.ok_or("could not reserve a private creation temporary")?;
    let result = (|| -> std::io::Result<bool> {
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        drop(file);
        match publish(&temporary, path) {
            Ok(()) => Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => Ok(false),
            Err(error) => Err(error),
        }
    })();
    fs::remove_file(&temporary).map_err(|error| error.to_string())?;
    result.map_err(|error| error.to_string())
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
            if fs::metadata(&path).map_err(|err| err.to_string())?.is_dir() {
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
    // Only reveal a folder the user granted; an XSS must not open Finder anywhere.
    let root = canonical_root(&root_path)?;
    // A `.app` passes `is_dir()` and `open` would launch it; the same gate as the vault
    // root, so the looser copy cannot win.
    if let Some(reason) = vault_root_rejection(&root) {
        return Err(format!("refusing to open this path: {reason}"));
    }

    #[cfg(target_os = "macos")]
    {
        // `-a Finder` also stops a bundle launching; both guards stay in case one comes loose.
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

/// The "just start" container under `$HOME`, not Documents, which TCC protects with a
/// permission dialog. Pure for testing. Project vaults go to `<project>/atlas`
/// (`src/shared/lib/project-vault-dir.ts`).
fn default_vault_parent_dir(home: &str) -> PathBuf {
    PathBuf::from(home).join("Ontology Atlas")
}

#[tauri::command]
fn ensure_default_vault_parent_dir() -> Result<String, String> {
    let home =
        std::env::var("HOME").map_err(|_| "HOME environment variable is not set".to_string())?;
    let parent = default_vault_parent_dir(&home);
    fs::create_dir_all(&parent).map_err(|err| err.to_string())?;
    let canonical = fs::canonicalize(&parent).map_err(|err| err.to_string())?;
    // The app's own "just start" container: creating a vault under it is a granted
    // operation, so the create/list/write commands that follow are allowed.
    vault_grants::grant_vault_root(&canonical);
    Ok(canonical.to_string_lossy().to_string())
}

/// The URL is never logged: it may be a trick link and its payload a server config.
/// The only effect is a pre-filled form the person still confirms.
#[cfg(desktop)]
fn answer_deep_link(app: &AppHandle, url: &str) {
    let payload = match deep_link::parse_install_deep_link(url) {
        Ok(payload) => payload,
        Err(refusal) => {
            // Dropped, not redirected, so a refused URL cannot move the window.
            log::warn!("deep link refused: {refusal}");
            return;
        }
    };
    log::info!(
        "deep link: opening the connector form with a {} byte install payload",
        payload.len()
    );
    show_main_window(app);
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    // A cold-start link arrives before the document exists; the script reports arrival.
    let script = deep_link::build_install_route_script(&payload);
    tauri::async_runtime::spawn(async move {
        let arrived = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        for _ in 0..DEEP_LINK_ROUTE_ATTEMPTS {
            if arrived.load(std::sync::atomic::Ordering::SeqCst) {
                return;
            }
            let sink = std::sync::Arc::clone(&arrived);
            let _ = window.eval_with_callback(script.as_str(), move |result| {
                if result.trim() == "true" {
                    sink.store(true, std::sync::atomic::Ordering::SeqCst);
                }
            });
            std::thread::sleep(Duration::from_millis(DEEP_LINK_ROUTE_INTERVAL_MS));
        }
        log::warn!("deep link: the connector form did not come up within the retry window");
    });
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

#[cfg(target_os = "macos")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct NativeTrayLabels {
    open: &'static str,
    quit: &'static str,
}

#[cfg(target_os = "macos")]
fn native_tray_labels(language_hint: &str) -> NativeTrayLabels {
    let hint = language_hint.to_ascii_lowercase();
    if hint.contains("ko") || hint.contains("korean") {
        NativeTrayLabels {
            open: "Ontology Atlas 열기",
            quit: "Ontology Atlas 종료",
        }
    } else {
        NativeTrayLabels {
            open: "Open Ontology Atlas",
            quit: "Quit Ontology Atlas",
        }
    }
}

#[cfg(target_os = "macos")]
fn macos_language_hint() -> String {
    let mut hint = ["LANG", "LC_ALL", "LC_MESSAGES"]
        .iter()
        .filter_map(|key| std::env::var(key).ok())
        .collect::<Vec<_>>()
        .join(" ");
    if let Ok(output) = Command::new("defaults")
        .args(["read", "-g", "AppleLanguages"])
        .output()
    {
        hint.push(' ');
        hint.push_str(&String::from_utf8_lossy(&output.stdout));
    }
    hint
}

/// Restores the existing window only; never a second window, never keeps the app
/// alive after quit, and exposes no tray or menu permission to the webview.
#[cfg(target_os = "macos")]
fn install_native_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let labels = native_tray_labels(&macos_language_hint());
    let open =
        tauri::menu::MenuItem::with_id(app, NATIVE_TRAY_OPEN_ID, labels.open, true, None::<&str>)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit =
        tauri::menu::MenuItem::with_id(app, NATIVE_TRAY_QUIT_ID, labels.quit, true, None::<&str>)?;
    let menu = tauri::menu::Menu::with_items(app, &[&open, &separator, &quit])?;

    TrayIconBuilder::with_id(NATIVE_TRAY_ID)
        .icon(tauri::include_image!("icons/tray-template.png"))
        .icon_as_template(true)
        .tooltip("Ontology Atlas")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().0.as_str() {
            NATIVE_TRAY_OPEN_ID => show_main_window(app),
            NATIVE_TRAY_QUIT_ID => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

/// The plugin writes physical pixels, so a 2x-panel size would exceed a 1x display.
#[derive(serde::Deserialize)]
struct SavedWindowState {
    width: f64,
    height: f64,
    x: f64,
    y: f64,
    #[serde(default)]
    maximized: bool,
}

fn read_saved_window_state(app: &AppHandle) -> Option<SavedWindowState> {
    let path = app
        .path()
        .app_config_dir()
        .ok()?
        .join(WINDOW_STATE_FILENAME);
    let raw = fs::read_to_string(path).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).ok()?;
    serde_json::from_value(parsed.get(MAIN_WINDOW_LABEL)?.clone()).ok()
}

/// Records whether the geometry came from a restored file, the config default or the
/// harness. Written to `log::info!` for installed builds and to the harness line.
fn fit_main_window_to_display(
    window: &tauri::WebviewWindow,
    saved: Option<SavedWindowState>,
    source: &str,
) {
    // Measured on the display it was saved on; `monitor_from_point` takes physical coordinates.
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

    // macOS owns zoom; reproducing it from stored numbers would fight the window manager.
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

    // Sanitized before applying: `set_size` goes through the event loop, so a read right
    // after restore still shows the old geometry and the clamp would be a no-op.
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

    // Restoring applies size and position unconditionally; a plain launch writes only corrections.
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

/// Emits `vault-changed` for what a refresh reads, debounced 500ms. Idempotent per canonical
/// root, and a replaced debouncer drops on a background thread because FSEvents
/// teardown joins its run loop.
/// Deliberately `async` with no await: Tauri then runs it off the macOS main thread.
#[tauri::command]
async fn start_vault_watch(
    app: AppHandle,
    root_path: String,
    state: State<'_, VaultWatcherState>,
) -> Result<(), String> {
    let canonical = canonical_root(&root_path)?;
    let mut watch = state
        .watch
        .lock()
        .map_err(|_| "vault watcher state poisoned".to_string())?;
    if watch
        .as_ref()
        .is_some_and(|existing| existing.root == canonical)
    {
        log::debug!("vault watcher reused at {}", canonical.display());
        return Ok(());
    }
    let app_handle = app.clone();
    let watched_root = canonical.clone();
    let mut debouncer = new_debouncer_opt::<_, RecommendedWatcher, NoCache>(
        Duration::from_millis(500),
        None,
        move |result: DebounceEventResult| match result {
            Ok(events) => {
                if vault_batch_is_visible(&watched_root, &events) {
                    let _ = app_handle.emit("vault-changed", ());
                }
            }
            // A silent failure would make the vault stop changing with no clue why.
            Err(errors) => {
                for error in errors {
                    // `error.kind` only: the full error embeds note file names, which are meaning.
                    log::warn!("vault watcher error: {:?}", error.kind);
                }
            }
        },
        NoCache,
        notify_debouncer_full::notify::Config::default(),
    )
    .map_err(|err| err.to_string())?;
    debouncer
        .watcher()
        .watch(&canonical, RecursiveMode::Recursive)
        .map_err(|err| err.to_string())?;
    log::info!("vault watcher started at {}", canonical.display());
    let previous = watch.replace(VaultWatch {
        root: canonical,
        debouncer,
    });
    drop(watch);
    if let Some(previous) = previous {
        // Dropping joins the watcher thread at an unbounded cost the UI thread cannot pay.
        std::thread::spawn(move || drop(previous));
    }
    Ok(())
}

/// WKWebView caps rAF at 60fps via `PreferPageRenderingUpdatesNear60FPSEnabled`;
/// the private `_features` API lifts it for ProMotion. Selectors are checked first,
/// so a removed API leaves 60fps rather than crashing.
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

/// The release binary is stripped, so this line is the only record of where it died.
fn format_panic_report(thread_name: &str, location: &str, message: &str) -> String {
    format!("panic in thread '{thread_name}' at {location}: {message}")
}

/// Writes `panic.log` and stderr, then defers to the previous hook. Never touches `log`.
fn install_panic_logger() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .map(|text| (*text).to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "unknown panic payload".to_string());
        let location = info
            .location()
            .map(|at| format!("{}:{}:{}", at.file(), at.line(), at.column()))
            .unwrap_or_else(|| "unknown location".to_string());
        let thread = std::thread::current();
        let thread_name = thread.name().unwrap_or("unnamed").to_string();
        let report = format_panic_report(&thread_name, &location, &message);
        // No `log::error!`: the logger can itself panic, and a panic inside the hook aborts.
        append_panic_report_file(&report);
        // `writeln!`, not `eprintln!`, which panics on a closed pipe, a real state for a
        // Finder-launched app; a double panic would lose both reports.
        let _ = writeln!(std::io::stderr(), "{report}");
        previous(info);
    }));
}

/// fern panics on a failed stderr write, and the parent may close the pipe any time.
struct QuietStderr;

impl Write for QuietStderr {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let _ = std::io::stderr().write_all(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        let _ = std::io::stderr().flush();
        Ok(())
    }
}

/// Same directory as the log plugin on macOS.
#[cfg(target_os = "macos")]
fn panic_report_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(
        PathBuf::from(home)
            .join("Library")
            .join("Logs")
            .join("dev.jinan.ontology-atlas")
            .join("panic.log"),
    )
}

#[cfg(not(target_os = "macos"))]
fn panic_report_path() -> Option<PathBuf> {
    None
}

fn append_panic_report_file(report: &str) {
    let Some(path) = panic_report_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(file, "[unix {stamp}] {report}");
    }
}

/// Puts WebView crashes in the native log, which a shipped app otherwise never shows.
/// Bounded so a runaway page cannot fill it.
#[tauri::command]
async fn log_webview_error(
    message: String,
    source: Option<String>,
    line: Option<u32>,
    column: Option<u32>,
    stack: Option<String>,
    kind: String,
) -> Result<(), String> {
    let report = format_webview_error_report(
        &message,
        source.as_deref(),
        line,
        column,
        stack.as_deref(),
        &kind,
    );
    log::error!("{report}");
    Ok(())
}

fn format_webview_error_report(
    message: &str,
    source: Option<&str>,
    line: Option<u32>,
    column: Option<u32>,
    stack: Option<&str>,
    kind: &str,
) -> String {
    fn clip(text: &str, max: usize) -> String {
        if text.chars().count() <= max {
            return text.to_string();
        }
        let head: String = text.chars().take(max).collect();
        format!("{head}… (clipped)")
    }
    let kind = match kind {
        "error" | "unhandledrejection" | "render" => kind,
        _ => "unknown",
    };
    let mut report = format!("webview {kind}: {}", clip(message, 2_000));
    if let Some(source) = source.filter(|s| !s.is_empty()) {
        report.push_str(&format!(" at {}", clip(source, 512)));
        if let Some(line) = line {
            report.push_str(&format!(":{line}"));
            if let Some(column) = column {
                report.push_str(&format!(":{column}"));
            }
        }
    }
    if let Some(stack) = stack.filter(|s| !s.is_empty()) {
        report.push('\n');
        report.push_str(&clip(stack, 8_000));
    }
    report
}

pub fn run() {
    install_panic_logger();
    if let Some(path) = std::env::var_os("PATH") {
        std::env::set_var("PATH", acp::sanitized_process_path(&path));
    }
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

    // First plugin, as it requires: a second launch focuses the existing window, or two
    // instances would write the same vault.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }));
        // Right after single-instance, so a second link press routes the existing window.
        builder = builder.plugin(tauri_plugin_deep_link::init());
    }

    // Read-only diagnostic, independent of the verifier.
    if map_entry_diagnostic::enabled_from_env() {
        builder = builder.plugin(map_entry_diagnostic::init());
    }

    // Not under the harness: the plugin writes on exit, so a harness resize would
    // overwrite the owner's geometry and make `--min-window-size` verdicts depend on it.
    if !verify_webview {
        builder = builder.plugin(
            tauri_plugin_window_state::Builder::new()
                // See `WINDOW_STATE_FLAGS`.
                .with_state_flags(WINDOW_STATE_FLAGS)
                // The plugin restores after `setup`, so the fit would check the default and let the
                // restored geometry land unchecked; the restore is done explicitly below.
                .skip_initial_state(MAIN_WINDOW_LABEL)
                .build(),
        );
    }

    builder
        // Outside the vault, at `Info`: what the app did, never vault content, prompts or secrets.
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("ontology-atlas".to_string()),
                    }),
                    // Not `TargetKind::Stderr`: fern panics on a failed stderr write, and a harness that
                    // exits with a piped stderr makes every later line abort the app.
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Dispatch(
                        tauri_plugin_log::fern::Dispatch::new()
                            .chain(Box::new(QuietStderr) as Box<dyn Write + Send>),
                    )),
                ])
                .level(log::LevelFilter::Info)
                // Local time, matching crash report names.
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
                .max_file_size(APP_LOG_MAX_FILE_BYTES)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        // Updates install only with a valid minisign signature (public key in `tauri.conf.json`).
        // The process plugin exists for the one post-update restart.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(VaultWatcherState::default())
        .manage(AcpInstallProgressState::default())
        .manage(AcpSessions::default())
        .setup(move |app| {
            // Seed the vault-grant registry before any command can run: turn the
            // boundary on, choose where grants persist, and re-grant the app's own
            // vault container plus every vault a prior launch recorded.
            if let Ok(store) = app.path().app_data_dir() {
                let container =
                    std::env::var("HOME").ok().map(|home| default_vault_parent_dir(&home));
                vault_grants::initialize(store.join("granted-vault-roots.json"), container);
            }

            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);

            #[cfg(target_os = "macos")]
            install_native_tray(app)?;

            // Before anything slow: the plugin holds a cold-start link only until a handler exists.
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let deep_link_app = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        answer_deep_link(&deep_link_app, url.as_str());
                    }
                });
            }

            // Without the version a log cannot be matched to its build.
            log::info!(
                "ontology atlas {} started",
                app.handle().package_info().version
            );

            show_main_window(app.handle());
            apply_verify_window_size(app.handle());

            // The payload contract asserts this line.
            write_verify_line(format!(
                "[ontology-atlas-window-verify] state_plugin={}",
                if verify_webview { "disabled" } else { "enabled" }
            ));
            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                // Its presence at setup separates a restored window from the config default.
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
                let diagnostic_default_pacing =
                    map_entry_diagnostic::default_pacing_from_env();
                map_entry_diagnostic::write_pacing_metadata(diagnostic_default_pacing);
                if !diagnostic_default_pacing {
                    disable_webview_frame_rate_cap(&window);
                }
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
                            // The script reports arrival, so the harness stops on it and says when it never arrives.
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
                            // Ample time for a 52MB download; the accumulated steps are the answer even if cut off.
                            std::thread::sleep(Duration::from_millis(90000));
                        }
                        if verify_app_update {
                            let _ = verify_window.eval(APP_UPDATE_VERIFY_SCRIPT);
                            // Two clicks and one network round trip must finish before marker collection.
                            std::thread::sleep(Duration::from_millis(12000));
                        }
                        if verify_ai_settings {
                            match verify_ai_base_url.as_deref() {
                                Some(base_url) => {
                                    let _ = verify_window
                                        .eval(build_webview_verify_ai_settings_script(base_url));
                                    // Five clicks and one HTTP round trip must finish before marker collection.
                                    std::thread::sleep(Duration::from_millis(12000));
                                }
                                None => {
                                    // A missing or unsafe address is left as a marker so the verifier turns red.
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
            inspect_project_source_continuity,
            list_vault_directory,
            vault_fingerprint,
            read_vault_text_file,
            read_vault_text_files,
            read_vault_text_tail,
            read_vault_binary_file,
            write_vault_text_file,
            read_library_collections,
            write_library_collections,
            create_vault_text_file,
            analysis_archive::append_analysis_record,
            analysis_archive::read_analysis_record_text,
            meaning_transition_archive::observe_meaning_transition_root,
            meaning_transition_archive::append_meaning_transition_bundle,
            meaning_transition_archive::read_meaning_transition_record_text,
            meaning_transition_archive::read_meaning_transition_artifact_text,
            meaning_transition_archive::list_meaning_transition_history,
            remove_vault_entry,
            ensure_vault_directory,
            vault_path_exists,
            open_vault_in_finder,
            ensure_default_vault_parent_dir,
            library::hash_vault_files,
            gray_area::read_gray_area_evidence,
            gray_area::preview_gray_area_scope,
            gray_area::check_gray_area_evidence,
            library::pick_source_files,
            library::import_source_files,
            library::discover_source_candidates,
            library::reveal_vault_file,
            start_vault_watch,
            log_webview_error,
            secrets::secret_set,
            secrets::secret_status,
            secrets::secret_clear,
            jev::jev_secret_set,
            jev::jev_secret_status,
            jev::jev_secret_clear,
            jev::jev_judge,
            llm::secret_verify,
            llm::llm_chat,
            git::git_status,
            git::git_probe,
            git::git_init,
            git::git_set_remote,
            git::git_snapshot,
            git::git_history,
            git::vault_node_revisions,
            git::git_paths_last_change,
            git::git_diff,
            git::git_commit_diff,
            git::git_pull,
            git::git_fetch,
            git::git_restore_file,
            git::git_document_diff,
            agent_setup::mcp_bundled_server,
            agent_setup::verify_mcp_server,
            connectors::discover_mcp_connectors,
            connectors::resolve_connector_runtimes,
            connector_secrets::connector_secret_set,
            connector_secrets::connector_secret_status,
            connector_secrets::connector_secret_delete,
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
            // Adapters and their children must not outlive the window.
            RunEvent::ExitRequested { .. } | RunEvent::Exit => {
                terminate_all_acp_sessions(app_handle);
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    #[test]
    fn vault_walk_keeps_the_last_entry_at_the_ceiling_and_reports_overflow() {
        let dir = std::env::temp_dir().join(format!("atlas-walk-boundary-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.md"), "# A").unwrap();
        let mut acc = super::VaultFingerprint {
            entries: (0..super::VAULT_WALK_MAX_ENTRIES - 1)
                .map(|i| super::VaultStamp {
                    relative_path: format!("n{i}.md"),
                    last_modified: 0,
                    size: 0,
                })
                .collect(),
            truncated: false,
            pruned_dirs: Vec::new(),
        };
        super::walk_vault_stamps(&dir, "", 0, &mut acc).unwrap();
        assert_eq!(acc.entries.len(), 100000);
        assert_eq!(acc.entries.last().unwrap().relative_path, "a.md");
        assert!(!acc.truncated);
        super::walk_vault_stamps(&dir, "", 0, &mut acc).unwrap();
        assert!(acc.truncated);
        assert_eq!(acc.entries.len(), 100000);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_adapter_launches_from_app_data_not_the_vault() {
        use std::path::{Path, PathBuf};
        let app_data = PathBuf::from("/private/tmp/atlas-app-support");
        let vault = PathBuf::from("/private/tmp/atlas-vault");
        let command = super::adapter_command(Path::new("/bin/echo"), &[], &app_data, &vault);
        assert_eq!(command.get_current_dir(), Some(app_data.as_path()));
        assert!(!command.get_current_dir().unwrap().starts_with(&vault));
    }

    #[test]
    fn a_binary_read_is_the_mtime_then_the_raw_bytes() {
        let dir = std::env::temp_dir().join(format!("atlas-binary-read-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("figure.png");
        let body: Vec<u8> = (0..=255).collect();
        std::fs::write(&file, &body).unwrap();

        let stamped = super::read_stamped_bytes(&file).unwrap();

        let (stamp, bytes) = stamped.split_at(8);
        assert_eq!(bytes, body.as_slice());
        let expected = super::metadata_mtime_ms(&file).unwrap() as u64;
        assert_eq!(u64::from_le_bytes(stamp.try_into().unwrap()), expected);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_agent_line_keeps_its_buffer_and_repairs_only_broken_utf8() {
        let bytes = b"{\"jsonrpc\":\"2.0\"}".to_vec();
        let buffer = bytes.as_ptr();
        let line = super::acp_line_text(bytes);
        assert_eq!(line, "{\"jsonrpc\":\"2.0\"}");
        assert_eq!(line.as_ptr(), buffer, "a valid line must not be copied");
        assert_eq!(super::acp_line_text(vec![b'a', 0xff, b'b']), "a\u{fffd}b");
    }

    #[test]
    fn an_agent_event_names_its_kind_for_the_screen() {
        let json = |event: &super::AcpStreamEvent| serde_json::to_value(event).unwrap();
        assert_eq!(
            json(&super::AcpStreamEvent::Message { line: "{}".into() }),
            serde_json::json!({ "kind": "message", "line": "{}" })
        );
        assert_eq!(
            json(&super::AcpStreamEvent::Exit { code: Some(1) }),
            serde_json::json!({ "kind": "exit", "code": 1 })
        );
        assert_eq!(
            json(&super::AcpStreamEvent::Notice {
                message: "npx-download-done".into()
            }),
            serde_json::json!({ "kind": "notice", "message": "npx-download-done" })
        );
    }

    #[test]
    fn a_tail_read_returns_only_the_last_whole_lines() {
        let dir = std::env::temp_dir().join(format!("atlas-tail-read-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let log = dir.join("activity.jsonl");
        let lines: Vec<String> = (0..1000)
            .map(|i| format!("{{\"v\":1,\"summary\":\"entry {i:04}\"}}"))
            .collect();
        std::fs::write(&log, format!("{}\n", lines.join("\n"))).unwrap();

        let tail = super::read_text_tail(&log, 50, super::MAX_TEXT_TAIL_BYTES).unwrap();
        assert_eq!(tail, lines[950..].join("\n"));

        let short = super::read_text_tail(&log, 50, 100).unwrap();
        assert!(!short.is_empty() && short.lines().count() < 50);
        assert!(
            lines[950..].join("\n").ends_with(&short),
            "a capped read keeps whole lines only"
        );

        std::fs::write(&log, "one\ntwo").unwrap();
        assert_eq!(
            super::read_text_tail(&log, 50, super::MAX_TEXT_TAIL_BYTES).unwrap(),
            "one\ntwo"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_watcher_reports_what_a_refresh_reads_and_nothing_under_git() {
        let root = std::env::temp_dir().join(format!("atlas-watch-filter-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        for dir in [
            "notes/sources",
            "features",
            ".git/objects/ab",
            "node_modules/pkg",
            "capabilities",
        ] {
            std::fs::create_dir_all(root.join(dir)).unwrap();
        }
        for file in [
            "notes/sources/a.pdf",
            "notes/todo.txt",
            ".git/index",
            ".git/objects/ab/cdef.png",
            "node_modules/pkg/logo.png",
            ".DS_Store",
            "capabilities/.draft.png",
        ] {
            std::fs::write(root.join(file), b"x").unwrap();
        }
        let visible = |relative: &str| super::vault_change_is_visible(&root, &root.join(relative));
        for path in [
            "capabilities/a.md",
            ".claude/skills/x.md",
            "assets/diagram.PNG",
            "sources/scan.pdf",
            ".ontology-atlas/activity.jsonl",
            ".ontology-atlas/agent-activity.json",
            ".mcp.json",
            ".codex/config.toml",
            "features",
            "drafts",
        ] {
            assert!(visible(path), "{path} changes what the screen shows");
        }
        for path in [
            ".git",
            ".git/index",
            ".git/objects/ab/cdef.png",
            "node_modules",
            "node_modules/pkg/logo.png",
            "notes/sources/a.pdf",
            "notes/todo.txt",
            ".DS_Store",
            "capabilities/.draft.png",
        ] {
            assert!(!visible(path), "{path} changes nothing on screen");
        }
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_rescan_after_dropped_events_is_always_reported() {
        use notify_debouncer_full::notify::{event::Flag, Event, EventKind};
        let root = std::path::Path::new("/vault");
        let batch = |event: Event| [super::DebouncedEvent::new(event, std::time::Instant::now())];
        let rescan = Event::new(EventKind::Other)
            .set_flag(Flag::Rescan)
            .add_path(root.join(".git"));
        assert!(super::vault_batch_is_visible(root, &batch(rescan)));
        let unseen = Event::new(EventKind::Any).add_path(root.join(".git/index"));
        assert!(!super::vault_batch_is_visible(root, &batch(unseen)));
    }

    #[test]
    fn a_logged_line_is_trimmed_and_capped() {
        assert_eq!(
            super::clip_for_log("  npx: command not found  "),
            "npx: command not found"
        );
        let long = "x".repeat(super::DEAD_SESSION_LOG_CHARS + 50);
        let clipped = super::clip_for_log(&long);
        assert_eq!(clipped.chars().count(), super::DEAD_SESSION_LOG_CHARS + 1);
        assert!(clipped.ends_with('…'));
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn native_tray_labels_follow_the_system_language_hint() {
        assert_eq!(
            crate::native_tray_labels("(\n    \"ko-KR\",\n    \"en-US\"\n)"),
            crate::NativeTrayLabels {
                open: "Ontology Atlas 열기",
                quit: "Ontology Atlas 종료",
            }
        );
        assert_eq!(
            crate::native_tray_labels("en_US.UTF-8"),
            crate::NativeTrayLabels {
                open: "Open Ontology Atlas",
                quit: "Quit Ontology Atlas",
            }
        );
    }

    /// The screen's address goes straight to the OS, so a bypass could open anything.
    #[test]
    fn only_http_urls_are_handed_to_the_os() {
        for good in [
            "https://example.com",
            "http://example.com/a?b=c",
            "HTTPS://EXAMPLE.COM",
        ] {
            assert!(crate::is_openable_url(good), "{good} was blocked");
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
            assert!(!crate::is_openable_url(bad), "{bad:?} would be opened");
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
        let base =
            std::env::temp_dir().join(format!("atlas-acp-session-root-{}", std::process::id()));
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
            permission_verdict_for_session(&sessions, "caller-invented-session", outside.to_str()),
            acp::PermissionVerdict::Ask,
            "an unregistered session must not auto-allow any path"
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

    /// `/` and app bundles must never become a vault root, which is the agent's working
    /// folder; `open` on a `.app` launches it.
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
                "{path} passing would run a program instead of opening a folder"
            );
        }
    }

    #[test]
    fn vault_root_rejection_allows_ordinary_folders_with_dots() {
        // A validator that always rejects is no validator.
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
        // An empty list would make the gate pass idle.
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
            "no blocked roots are registered for this platform"
        );
        for dir in blocked {
            assert_eq!(
                vault_root_rejection(Path::new(dir)),
                Some("system-directory"),
                "{dir} must not be accepted as a vault root"
            );
        }
    }

    #[test]
    fn vault_root_rejection_blocks_the_home_directory_itself() {
        let key = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
        let Some(home) = std::env::var_os(key).map(PathBuf::from) else {
            return; // no home directory in some CI
        };
        let Ok(home) = fs::canonicalize(home) else {
            return;
        };
        assert_eq!(
            vault_root_rejection(&home),
            Some("home-directory"),
            "the home directory itself is not a vault"
        );
    }

    #[test]
    fn vault_root_rejection_allows_ordinary_folders_inside_home() {
        // The inside of home must pass.
        let key = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
        let Some(home) = std::env::var_os(key).map(PathBuf::from) else {
            return;
        };
        assert_eq!(vault_root_rejection(&home.join("notes")), None);
        assert_eq!(vault_root_rejection(&home.join("code/atlas/docs")), None);
        if cfg!(target_os = "macos") {
            assert_eq!(vault_root_rejection(Path::new("/Volumes/Work/vault")), None);
        }
    }

    /// The container stays outside TCC-protected folders.
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
            "agents-tab-models",
            "app-nav-rail",
            "ai-connection-view",
            "ai-provider-local-custom",
            "ai-register-local-custom",
            "ai-local-url",
            "ai-verify-local",
            "ai-local-model-listbox",
            "ai-local-connected",
        ] {
            assert!(script.contains(test_id), "{test_id}");
        }
        // Clicking every poll toggles the control open and shut.
        assert!(script.contains("CLICK_COOLDOWN"));
        // Only one place declares success.
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
        let source = include_str!("webview_verify/dom_marker_probe.js");

        assert!(source.contains("온톨로지 지형도"));
        assert!(source.contains("후보 \\d+\\/\\d+개 표시"));
        assert!(source.contains("개념 \\d+개 · 관계 \\d+개"));
        // Guards against a canvas that exists but draws nothing.
        assert!(source.contains("ontologyMapCanvasInkPixels"));
        assert!(source.contains("getImageData"));
        assert!(source.contains("dragHandleSlug"));
        // The drag contracts are read from `window.__ontologyAtlasTopologyDragVerify`.
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
        // One folder resumes rather than asking.
        assert!(script.contains("\"docs-vault:fs-handle:recent\""));
    }

    /// Several folders are the only way a desktop check reaches the chooser.
    #[test]
    fn webview_verify_vault_bootstrap_plants_every_named_folder_in_the_recent_list() {
        let script = build_webview_verify_vault_bootstrap_script(
            "/tmp/Atlas Fixture/atlas-map::/tmp/Atlas Fixture/atlas-wiki",
        );

        assert!(script.contains("const rootPath = \"/tmp/Atlas Fixture/atlas-map\""));
        assert!(script.contains("const fixtureName = \"atlas-map\""));
        assert!(script.contains("\"docs-vault:fs-handle:recent\""));
        assert!(script.contains("desktopRootPath: \"/tmp/Atlas Fixture/atlas-map\""));
        assert!(script.contains("desktopRootPath: \"/tmp/Atlas Fixture/atlas-wiki\""));
        // No counts: the harness never read those folders.
        assert!(!script.contains("docCount"));
        assert!(!script.contains("conceptCount"));
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

        assert!(!alias.exists(), "the link entry remains");
        assert_eq!(fs::read_to_string(&target).unwrap(), "keep me");
        fs::remove_dir_all(root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn list_vault_directory_reports_symbolic_links_only_when_asked_and_never_follows_them() {
        use std::os::unix::fs::symlink;

        let nonce = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("ontology-atlas-list-links-{nonce}"));
        let outside = std::env::temp_dir().join(format!("ontology-atlas-list-links-outside-{nonce}"));
        fs::create_dir_all(root.join("wiki/team")).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(root.join("wiki/plan.md"), "plan").unwrap();
        fs::write(outside.join("secret.md"), "secret").unwrap();
        symlink(outside.join("secret.md"), root.join("wiki/escape.md")).unwrap();
        symlink(&outside, root.join("wiki/elsewhere")).unwrap();
        let root_path = root.to_string_lossy().to_string();

        let named = |entries: Vec<TauriVaultEntry>| {
            entries
                .into_iter()
                .map(|entry| format!("{}:{}", entry.name, entry.kind))
                .collect::<Vec<_>>()
        };
        assert_eq!(
            named(list_vault_directory(root_path.clone(), "wiki".into(), None).unwrap()),
            vec!["plan.md:file", "team:directory"]
        );
        assert_eq!(
            named(list_vault_directory(root_path.clone(), "wiki".into(), Some(true)).unwrap()),
            vec!["elsewhere:symlink", "escape.md:symlink", "plan.md:file", "team:directory"]
        );

        fs::remove_dir_all(root).ok();
        fs::remove_dir_all(outside).ok();
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
    fn meaning_transition_continuity_excludes_only_target_and_archive() {
        let root = std::env::temp_dir().join(format!(
            "ontology-atlas-continuity-{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let vault = root.join("docs/ontology");
        fs::create_dir_all(vault.join("capabilities")).unwrap();
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(vault.join("capabilities/refund.md"), "before\n").unwrap();
        fs::write(root.join("src/index.ts"), "export const value = 1;\n").unwrap();
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
        let observe = || {
            inspect_project_source_continuity(
                root.to_string_lossy().to_string(),
                vault.to_string_lossy().to_string(),
                "capabilities/refund".into(),
            )
            .unwrap()
        };
        let baseline = observe();
        assert_eq!(baseline.source.dirty, Some(false));
        assert_eq!(
            baseline.exclusions.target.as_deref(),
            Some("docs/ontology/capabilities/refund.md")
        );

        fs::write(
            vault.join("capabilities/refund.md"),
            "after meaning write\n",
        )
        .unwrap();
        fs::create_dir_all(vault.join(".ontology-atlas/meaning-transitions/artifacts")).unwrap();
        fs::write(
            vault.join(".ontology-atlas/meaning-transitions/transition.md"),
            "record\n",
        )
        .unwrap();
        let meaning_only = observe();
        assert_eq!(meaning_only.source.fingerprint, baseline.source.fingerprint);
        assert_eq!(meaning_only.source.dirty, Some(false));

        fs::write(vault.join(".ontology-atlas/project-sources.json"), "{}\n").unwrap();
        let config_drift = observe();
        assert_ne!(config_drift.source.fingerprint, baseline.source.fingerprint);
        assert_eq!(config_drift.source.dirty, Some(true));
        fs::remove_file(vault.join(".ontology-atlas/project-sources.json")).unwrap();

        fs::write(root.join("src/index.ts"), "export const value = 2;\n").unwrap();
        assert_ne!(observe().source.fingerprint, baseline.source.fingerprint);
        fs::remove_dir_all(root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn meaning_transition_continuity_rejects_traversal_and_symlink_targets() {
        use std::os::unix::fs::symlink;
        let root = std::env::temp_dir().join(format!(
            "ontology-atlas-continuity-link-{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let vault = root.join("vault");
        fs::create_dir_all(vault.join("capabilities")).unwrap();
        fs::write(root.join("outside.md"), "outside\n").unwrap();
        symlink(
            root.join("outside.md"),
            vault.join("capabilities/refund.md"),
        )
        .unwrap();
        let source = root.to_string_lossy().to_string();
        let vault_text = vault.to_string_lossy().to_string();
        assert!(inspect_project_source_continuity(
            source.clone(),
            vault_text.clone(),
            "../outside".into()
        )
        .is_err());
        assert!(inspect_project_source_continuity(
            source,
            vault_text,
            "capabilities/refund".into()
        )
        .is_err());
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
            Some(format!("{:04}.txt", SOURCE_INVENTORY_MAX_FILES - 1).as_str())
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
mod create_only_tests {
    use super::{
        create_text_exclusively, create_text_exclusively_with,
        create_vault_text_file_after_validation,
    };
    use std::fs;
    use std::path::PathBuf;

    fn fixture() -> PathBuf {
        static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let sequence = SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "oatlas-create-only-{}-{}-{sequence}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("vault/wiki/answers")).unwrap();
        root
    }

    #[test]
    fn creates_complete_content_and_preserves_existing_bytes_without_temporary_debris() {
        let base = fixture();
        let vault = base.join("vault");
        let target = vault.join("wiki/answers/answer.md");
        let create = |text: &str| {
            create_vault_text_file_after_validation(
                vault.to_string_lossy().into_owned(),
                "wiki/answers/answer.md".into(),
                text.into(),
                || {},
            )
        };
        assert!(create("first answer — complete").unwrap());
        assert!(!create("replacement must not land").unwrap());
        assert_eq!(
            fs::read_to_string(&target).unwrap(),
            "first answer — complete"
        );
        assert_eq!(fs::read_dir(target.parent().unwrap()).unwrap().count(), 1);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn a_destination_created_after_validation_is_not_overwritten() {
        let base = fixture();
        let vault = base.join("vault");
        let target = vault.join("wiki/answers/answer.md");
        let created = create_vault_text_file_after_validation(
            vault.to_string_lossy().into_owned(),
            "wiki/answers/answer.md".into(),
            "late writer".into(),
            || fs::write(&target, "racing writer").unwrap(),
        )
        .unwrap();
        assert!(!created);
        assert_eq!(fs::read_to_string(&target).unwrap(), "racing writer");
        assert_eq!(fs::read_dir(target.parent().unwrap()).unwrap().count(), 1);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn concurrent_creators_publish_exactly_one_complete_winner() {
        let base = fixture();
        let vault = base.join("vault");
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let threads: Vec<_> = ["answer A", "answer B"]
            .into_iter()
            .map(|text| {
                let root = vault.to_string_lossy().into_owned();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    create_vault_text_file_after_validation(
                        root,
                        "wiki/answers/answer.md".into(),
                        text.into(),
                        || {
                            barrier.wait();
                        },
                    )
                    .unwrap()
                })
            })
            .collect();
        let winners = threads
            .into_iter()
            .map(|thread| thread.join().unwrap())
            .filter(|created| *created)
            .count();
        assert_eq!(winners, 1);
        let text = fs::read_to_string(vault.join("wiki/answers/answer.md")).unwrap();
        assert!(text == "answer A" || text == "answer B");
        assert_eq!(fs::read_dir(vault.join("wiki/answers")).unwrap().count(), 1);
        fs::remove_dir_all(base).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_and_keeps_the_open_parent_after_a_directory_swap() {
        use std::os::unix::fs::symlink;
        let base = fixture();
        let vault = base.join("vault");
        let outside = base.join("outside");
        fs::create_dir(&outside).unwrap();
        fs::write(outside.join("answer.md"), "outside original").unwrap();
        symlink(outside.join("answer.md"), vault.join("linked.md")).unwrap();
        assert!(create_vault_text_file_after_validation(
            vault.to_string_lossy().into_owned(),
            "linked.md".into(),
            "must not land".into(),
            || {}
        )
        .is_err());
        assert!(create_vault_text_file_after_validation(
            vault.to_string_lossy().into_owned(),
            "../outside/answer.md".into(),
            "must not land".into(),
            || {}
        )
        .is_err());
        let parent = vault.join("wiki/answers");
        let parked = vault.join("wiki/parked");
        assert!(create_vault_text_file_after_validation(
            vault.to_string_lossy().into_owned(),
            "wiki/answers/answer.md".into(),
            "inside complete".into(),
            || {
                fs::rename(&parent, &parked).unwrap();
                symlink(&outside, &parent).unwrap();
            }
        )
        .unwrap());
        assert_eq!(
            fs::read_to_string(outside.join("answer.md")).unwrap(),
            "outside original"
        );
        assert_eq!(
            fs::read_to_string(parked.join("answer.md")).unwrap(),
            "inside complete"
        );
        assert_eq!(fs::read_dir(&parked).unwrap().count(), 1);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn portable_publication_preserves_existing_file_and_fails_closed_without_hard_links() {
        let base = fixture();
        let parent = base.join("vault/wiki/answers");
        let target = parent.join("answer.md");
        assert!(create_text_exclusively(&target, "original").unwrap());
        assert!(!create_text_exclusively(&target, "replacement").unwrap());
        let missing = parent.join("unsupported.md");
        assert!(
            create_text_exclusively_with(&missing, "never published", |_, _| {
                Err(std::io::Error::new(
                    std::io::ErrorKind::Unsupported,
                    "exclusive publication unavailable",
                ))
            })
            .is_err()
        );
        assert!(!missing.exists());
        assert_eq!(fs::read_to_string(&target).unwrap(), "original");
        assert_eq!(fs::read_dir(parent).unwrap().count(), 1);
        fs::remove_dir_all(base).unwrap();
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
            "a write under the stable original parent must succeed: {result:?}"
        );
        assert_eq!(
            std::fs::read_to_string(outside.join("project-sources.json")).unwrap(),
            "outside",
            "followed a parent symlink created after validation and wrote outside the vault"
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
            "mkdir under the stable original parent must succeed: {result:?}"
        );
        assert!(
            !outside.join("new-dir").exists(),
            "followed a parent symlink created after validation and created a directory outside the vault"
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
            "the vault entry kept its link to the outside inode"
        );
        std::fs::remove_dir_all(&base).ok();
    }

    /// Checks the write went through a temporary file, since results alone cannot tell
    /// the implementations apart.
    #[test]
    fn replaces_through_a_temporary_file_and_leaves_none_behind() {
        let dir = std::env::temp_dir().join(format!("oatlas-atomic-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("note.md");
        std::fs::write(&target, "old").unwrap();

        write_text_atomically(&target, "new").unwrap();

        assert_eq!(std::fs::read_to_string(&target).unwrap(), "new");
        // A leftover temporary file breaks the next write.
        let leftovers: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|name| name.contains("oatlas-tmp"))
            .collect();
        assert!(
            leftovers.is_empty(),
            "temporary files remain: {leftovers:?}"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_failed_write_leaves_the_original_untouched() {
        let dir = std::env::temp_dir().join(format!("oatlas-atomic-fail-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        // A directory target makes rename fail.
        let target = dir.join("as-dir");
        std::fs::create_dir_all(&target).unwrap();

        let result = write_text_atomically(&target, "new");

        assert!(result.is_err(), "overwrote a directory with a file");
        assert!(target.is_dir(), "the target became a file");
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

    // `rename_all = "camelCase"` is the contract: the screen
    // (`src/features/acp-doctor/model/acp-doctor.ts`) filters by `payload.runtimeId`, and a
    // wrong key discards every event silently.
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
            vec![
                "at",
                "job",
                "note",
                "received",
                "runtimeId",
                "stage",
                "total"
            ],
            "key differs from the one the UI reads, so progress would vanish"
        );
        assert_eq!(object["runtimeId"], "claude-acp");
        assert_eq!(object["received"], 26_043_779u64);
        // Unknown is null, not absent; the screen decides on percentages from it.
        assert!(object["note"].is_null());
    }

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
        // The identity case: an over-eager clamp would move a window every launch.
        let saved = at(0.0, MACOS_MENU_BAR_RESERVE_PT, 1512.0, 900.0);
        let result = sanitize_window_geometry(saved, REFERENCE_14_INCH, MAIN_WINDOW_MIN_LOGICAL);
        assert_eq!(result.geometry, saved);
        assert!(!result.resized);
        assert!(!result.repositioned);
    }

    #[test]
    fn the_shipped_default_fits_the_reference_panel() {
        // 982 content plus 28 title bar exceeds the 945pt visible frame; 900 fits.
        let usable = REFERENCE_14_INCH.height - MACOS_MENU_BAR_RESERVE_PT - MACOS_TITLE_BAR_PT;
        assert!(900.0 <= usable, "900 must fit inside {usable}");
        assert!(
            982.0 > usable,
            "982 must not fit, which is why it was never a window"
        );
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
        assert!(
            result.repositioned,
            "a clamped window must not keep an origin that now overflows"
        );
    }

    #[test]
    fn geometry_saved_in_physical_pixels_survives_losing_the_retina_display() {
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
        // Bottom corners on screen but title bar not: unreachable.
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
        // Monitor rects are not anchored at zero.
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

    const EXTERNAL_1080P: MonitorRect = MonitorRect {
        x: 0.0,
        y: 0.0,
        width: 1920.0,
        height: 1080.0,
    };

    #[test]
    fn a_window_snapped_to_the_top_of_a_non_notched_display_is_left_alone() {
        // External monitors use 24pt, not the notched 37.
        let saved = at(0.0, MACOS_MENU_BAR_MIN_PT, 1400.0, 900.0);
        let result = sanitize_window_geometry(saved, EXTERNAL_1080P, MAIN_WINDOW_MIN_LOGICAL);
        assert_eq!(result.geometry, saved);
        assert!(
            !result.repositioned,
            "a window a non-notched display allows must be left where it is"
        );
        assert!(!result.resized);
    }

    #[test]
    fn a_maximized_window_that_exactly_fills_a_non_notched_display_is_not_shrunk() {
        // The zoomed shape macOS produces must not be clamped.
        let zoomed_height = EXTERNAL_1080P.height - MACOS_MENU_BAR_MIN_PT - MACOS_TITLE_BAR_PT;
        let saved = at(0.0, MACOS_MENU_BAR_MIN_PT, 1920.0, zoomed_height);
        let result = sanitize_window_geometry(saved, EXTERNAL_1080P, MAIN_WINDOW_MIN_LOGICAL);
        assert_eq!(result.geometry, saved);
        assert!(
            !result.resized,
            "a window that fits its display exactly must not be clamped"
        );
        assert!(!result.repositioned);
    }

    #[test]
    fn a_title_bar_genuinely_under_the_menu_bar_is_still_recovered() {
        // Above the shortest menu bar is still unreachable.
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
        // Placement stays conservative while acceptance is permissive.
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

#[cfg(test)]
mod webview_error_report_tests {
    use super::format_webview_error_report;

    #[test]
    fn report_names_kind_location_and_stack() {
        let report = format_webview_error_report(
            "boom",
            Some("http://tauri.localhost/app.js"),
            Some(12),
            Some(5),
            Some("Error: boom\n  at f"),
            "render",
        );
        assert_eq!(
            report,
            "webview render: boom at http://tauri.localhost/app.js:12:5\nError: boom\n  at f"
        );
    }

    #[test]
    fn report_clips_runaway_text_and_unknown_kinds() {
        let long = "x".repeat(3_000);
        let report = format_webview_error_report(&long, None, None, None, None, "weird");
        assert!(report.starts_with("webview unknown: "));
        assert!(report.ends_with("… (clipped)"));
        assert!(report.chars().count() < 2_100);
    }
}

#[cfg(test)]
mod panic_report_tests {
    use super::format_panic_report;

    #[test]
    fn panic_report_names_thread_location_and_message() {
        assert_eq!(
            format_panic_report("main", "src/lib.rs:12:5", "index out of bounds"),
            "panic in thread 'main' at src/lib.rs:12:5: index out of bounds"
        );
    }

    #[test]
    fn panic_report_keeps_the_unknown_placeholders_readable() {
        assert_eq!(
            format_panic_report("unnamed", "unknown location", "unknown panic payload"),
            "panic in thread 'unnamed' at unknown location: unknown panic payload"
        );
    }
}

#[cfg(test)]
mod vault_scope_tests {
    use super::{
        canonical_root, list_vault_directory, read_vault_text_file, remove_vault_entry,
        resolve_existing_inside, write_vault_text_file,
    };

    #[test]
    fn every_vault_door_refuses_an_ungranted_root_and_opens_a_granted_one() {
        let base = std::env::temp_dir().join(format!("atlas-scope-doors-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let home = base.join("home");
        std::fs::create_dir_all(base.join("vault/nested")).unwrap();
        std::fs::create_dir_all(home.join(".ssh")).unwrap();
        std::fs::write(base.join("vault/note.md"), b"# note").unwrap();
        std::fs::write(home.join(".ssh/id_rsa"), b"fixture, not a key").unwrap();
        let vault = std::fs::canonicalize(base.join("vault")).unwrap();
        let home_path = home.to_string_lossy().to_string();
        let vault_path = vault.to_string_lossy().to_string();
        let scope = crate::vault_grants::EnforcedScope::granting(&[vault.clone()]);

        let refused = |result: Result<(), String>| {
            let err = result.unwrap_err();
            assert!(err.contains("not-granted"), "{err}");
        };
        refused(read_vault_text_file(home_path.clone(), ".ssh/id_rsa".into()).map(|_| ()));
        refused(write_vault_text_file(
            home_path.clone(),
            "planted.md".into(),
            "x".into(),
        ));
        refused(remove_vault_entry(
            home_path.clone(),
            ".ssh/id_rsa".into(),
            None,
        ));
        refused(list_vault_directory(home_path.clone(), String::new(), None).map(|_| ()));
        refused(crate::git::validate_vault_dir(&home_path).map(|_| ()));
        refused(canonical_root(&base.to_string_lossy()).map(|_| ()));
        assert!(!home.join("planted.md").exists());
        assert!(home.join(".ssh/id_rsa").exists());

        assert!(read_vault_text_file(vault_path.clone(), "note.md".into()).is_ok());
        assert!(canonical_root(&vault.join("nested").to_string_lossy()).is_ok());
        assert!(crate::git::validate_vault_dir(&vault_path).is_ok());

        let judged = crate::jev::jev_judge(home_path.clone(), "{}".into()).unwrap_err();
        assert!(judged.contains("not-granted"), "{judged}");
        let verified = crate::agent_setup::verify_mcp_server(home_path.clone(), None);
        assert!(!verified.ok);
        assert!(
            verified
                .failure
                .as_deref()
                .unwrap_or("")
                .contains("not-granted"),
            "{:?}",
            verified.failure
        );
        refused(super::open_vault_in_finder(home_path.clone()));
        let report =
            crate::library::discover_source_candidates(vec![crate::library::SourceDiscoveryRoot {
                root_path: home_path.clone(),
                label: "home".into(),
                skip_relative: Vec::new(),
            }])
            .unwrap();
        assert!(
            report.candidates.is_empty(),
            "an ungranted root yields no candidates"
        );
        assert_eq!(report.unreadable_roots, vec!["home".to_string()]);

        drop(scope);
        let _ = std::fs::remove_dir_all(&base);
    }

    // The grant gate is permissive here (production `initialize` never runs in unit
    // tests); this pins the path-containment half of the boundary the gate rides on.
    // Unix-only: it needs a real symlink; canonicalisation guards both platforms.
    #[cfg(unix)]
    #[test]
    fn a_symlink_that_escapes_the_root_is_refused() {
        use std::os::unix::fs::symlink;
        let base = std::env::temp_dir().join(format!("atlas-scope-symlink-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let vault = base.join("vault");
        let outside = base.join("outside");
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("secret.txt"), b"secret").unwrap();
        symlink(&outside, vault.join("escape")).unwrap();

        let root = vault.to_string_lossy().to_string();
        std::fs::write(vault.join("inside.md"), b"# ok").unwrap();
        assert!(resolve_existing_inside(&root, "inside.md").is_ok());
        // The same relative path through the symlink canonicalises outside the root
        // and is refused, so a tracked symlink cannot read another directory.
        let err = resolve_existing_inside(&root, "escape/secret.txt").unwrap_err();
        assert!(err.contains("stay inside"), "{err}");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn canonical_root_resolves_a_real_directory_and_rejects_a_missing_one() {
        let base = std::env::temp_dir().join(format!("atlas-scope-canon-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        assert!(canonical_root(&base.to_string_lossy()).is_ok());
        assert!(canonical_root(&base.join("missing").to_string_lossy()).is_err());
        let _ = std::fs::remove_dir_all(&base);
    }
}

#[cfg(test)]
mod vault_text_batch_tests {
    use super::{read_vault_text_files, VAULT_TEXT_BATCH_FILE_MAX_BYTES, VAULT_TEXT_BATCH_MAX};

    fn vault(name: &str) -> std::path::PathBuf {
        let base =
            std::env::temp_dir().join(format!("atlas-text-batch-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(base.join("vault/domains")).unwrap();
        std::fs::create_dir_all(base.join("vault/.claude")).unwrap();
        std::fs::write(base.join("vault/project.md"), "# project").unwrap();
        std::fs::write(base.join("vault/domains/order.md"), "# order").unwrap();
        std::fs::write(base.join("vault/.claude/notes.md"), "hidden").unwrap();
        std::fs::write(base.join("vault/.env.md"), "hidden").unwrap();
        std::fs::write(base.join("vault/plan.txt"), "not markdown").unwrap();
        std::fs::write(base.join("outside.md"), "outside").unwrap();
        base
    }

    #[test]
    fn reads_every_requested_markdown_file_in_the_order_asked() {
        let base = vault("order");
        let root = base.join("vault").to_string_lossy().to_string();
        let read =
            read_vault_text_files(root, vec!["domains/order.md".into(), "project.md".into()])
                .unwrap();
        let paths: Vec<&str> = read
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect();
        assert_eq!(paths, ["domains/order.md", "project.md"]);
        assert_eq!(read[0].text.as_deref(), Some("# order"));
        assert_eq!(read[1].text.as_deref(), Some("# project"));
        assert!(read
            .iter()
            .all(|file| file.error.is_none() && file.last_modified.is_some()));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn a_file_it_may_not_read_fails_alone_and_says_why() {
        let base = vault("refuse");
        let root = base.join("vault").to_string_lossy().to_string();
        let read = read_vault_text_files(
            root,
            vec![
                ".claude/notes.md".into(),
                ".env.md".into(),
                "plan.txt".into(),
                "../outside.md".into(),
                "missing.md".into(),
                "project.md".into(),
            ],
        )
        .unwrap();
        assert_eq!(read.len(), 6);
        for refused in &read[..5] {
            assert!(refused.text.is_none(), "{} was read", refused.relative_path);
            assert!(
                refused.error.is_some(),
                "{} has no reason",
                refused.relative_path
            );
        }
        assert_eq!(read[5].text.as_deref(), Some("# project"));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn a_link_that_leaves_the_vault_is_not_followed() {
        use std::os::unix::fs::symlink;
        let base = vault("link");
        symlink(base.join("outside.md"), base.join("vault/linked.md")).unwrap();
        let root = base.join("vault").to_string_lossy().to_string();
        let read = read_vault_text_files(root, vec!["linked.md".into()]).unwrap();
        assert!(read[0].text.is_none());
        let reason = read[0].error.clone().unwrap_or_default();
        assert!(reason.contains("stay inside"), "{reason}");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn a_markdown_name_linked_to_a_dot_file_is_not_read() {
        use std::os::unix::fs::symlink;
        let base = vault("dotlink");
        std::fs::write(base.join("vault/.env"), "SECRET=1").unwrap();
        symlink(".env", base.join("vault/notes.md")).unwrap();
        symlink(".claude/notes.md", base.join("vault/claude.md")).unwrap();
        let root = base.join("vault").to_string_lossy().to_string();
        let read =
            read_vault_text_files(root, vec!["notes.md".into(), "claude.md".into()]).unwrap();
        for refused in &read {
            assert!(refused.text.is_none(), "{} was read", refused.relative_path);
            assert!(refused.error.is_some());
        }
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn a_file_past_the_byte_bound_is_left_to_the_single_read() {
        let base = vault("bytes");
        let large = "x".repeat(VAULT_TEXT_BATCH_FILE_MAX_BYTES as usize + 1);
        std::fs::write(base.join("vault/large.md"), &large).unwrap();
        let root = base.join("vault").to_string_lossy().to_string();
        let read =
            read_vault_text_files(root.clone(), vec!["large.md".into(), "project.md".into()])
                .unwrap();
        assert!(read[0].text.is_none());
        let reason = read[0].error.clone().unwrap_or_default();
        assert!(reason.contains("bytes"), "{reason}");
        assert_eq!(read[1].text.as_deref(), Some("# project"));
        assert_eq!(
            super::read_vault_text_file(root, "large.md".into())
                .unwrap()
                .text
                .len(),
            large.len()
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn refuses_a_batch_past_the_bound_and_an_ungranted_root() {
        let base = vault("bound");
        let root = base.join("vault").to_string_lossy().to_string();
        let too_many = vec!["project.md".to_string(); VAULT_TEXT_BATCH_MAX + 1];
        assert!(read_vault_text_files(root.clone(), too_many).is_err());
        assert!(read_vault_text_files(root.clone(), Vec::new())
            .unwrap()
            .is_empty());

        let granted = std::fs::canonicalize(base.join("vault/domains")).unwrap();
        let scope = crate::vault_grants::EnforcedScope::granting(&[granted]);
        let err = read_vault_text_files(root, vec!["project.md".into()]).unwrap_err();
        assert!(err.contains("not-granted"), "{err}");
        drop(scope);
        let _ = std::fs::remove_dir_all(&base);
    }
}
