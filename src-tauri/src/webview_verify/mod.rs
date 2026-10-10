use crate::{APP_LOCALES, DEFAULT_APP_LOCALE, MAIN_WINDOW_LABEL};
use std::io::Write;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub(crate) const WEBVIEW_VERIFY_ENV: &str = "ONTOLOGY_ATLAS_VERIFY_WEBVIEW";
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

const WEBVIEW_VERIFY_ROUTE_ATTEMPTS: usize = 20;
const WEBVIEW_VERIFY_ROUTE_INTERVAL_MS: u64 = 400;
const WEBVIEW_VERIFY_FIXTURE_SETTLE_MS: u64 = 1200;
const WEBVIEW_VERIFY_MARKER_ATTEMPTS: usize = 12;
const WEBVIEW_VERIFY_MARKER_INTERVAL_MS: u64 = 500;

pub(crate) fn js_string_literal(value: &str) -> String {
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

fn webview_verify_locale<'a>(route: &str, locales: &[&'a str]) -> &'a str {
    locales
        .iter()
        .copied()
        .find(|locale| {
            route
                .strip_prefix('/')
                .and_then(|rest| rest.strip_prefix(*locale))
                .is_some_and(|rest| rest.starts_with('/'))
        })
        .unwrap_or(DEFAULT_APP_LOCALE)
}

fn webview_verify_locale_root(route: &str, locales: &[&str]) -> String {
    format!("/{}/", webview_verify_locale(route, locales))
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

pub(crate) fn isolate_verify_webview_storage(config: &mut tauri::Config, enabled: bool) -> usize {
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

pub(crate) fn write_verify_line(line: String) {
    let mut stdout = std::io::stdout().lock();
    let _ = writeln!(stdout, "{line}");
}

fn build_webview_verify_route_reset_script(route: &str) -> String {
    build_webview_verify_route_reset_script_for(route, &APP_LOCALES)
}

fn build_webview_verify_route_reset_script_for(route: &str, locales: &[&str]) -> String {
    let locale_root = js_string_literal(&webview_verify_locale_root(route, locales));
    let locale = js_string_literal(webview_verify_locale(route, locales));
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
const ACP_INSTALL_VERIFY_SCRIPT: &str = include_str!("acp_install_verify.js");

/// Clicks for real: the plugin import, network round trip and `getVersion()` exist
/// only in the installed app.
const APP_UPDATE_VERIFY_SCRIPT: &str = include_str!("app_update_verify.js");

const AI_SETTINGS_VERIFY_SCRIPT: &str = include_str!("ai_settings_verify.js");

/// The file bytes are the probe.
const DOM_MARKER_PROBE_SCRIPT: &str = include_str!("dom_marker_probe.js");

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

pub(crate) fn apply_verify_window_size(app: &AppHandle) {
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

pub(crate) fn spawn_webview_verify(window: &tauri::WebviewWindow) {
    let verify_window = window.clone();
    let verify_route = std::env::var(WEBVIEW_VERIFY_ROUTE_ENV)
        .ok()
        .filter(|route| is_safe_webview_verify_route(route));
    let verify_vault = std::env::var(WEBVIEW_VERIFY_VAULT_ENV)
        .ok()
        .filter(|path| !path.trim().is_empty());
    let verify_ai_settings = std::env::var_os(WEBVIEW_VERIFY_AI_SETTINGS_ENV).is_some();
    let verify_ai_base_url = std::env::var(WEBVIEW_VERIFY_AI_BASE_URL_ENV)
        .ok()
        .filter(|url| is_safe_verify_base_url(url));
    let verify_app_update = std::env::var_os(WEBVIEW_VERIFY_APP_UPDATE_ENV).is_some();
    let verify_acp_install = std::env::var_os(WEBVIEW_VERIFY_ACP_INSTALL_ENV).is_some();
    tauri::async_runtime::spawn(async move {
        if let Some(vault_path) = verify_vault {
            let bootstrap_script = build_webview_verify_vault_bootstrap_script(&vault_path);
            let _ = verify_window.eval(&bootstrap_script);
            std::thread::sleep(Duration::from_millis(WEBVIEW_VERIFY_FIXTURE_SETTLE_MS));
        }
        if let Some(route) = verify_route {
            let reset_script = build_webview_verify_route_reset_script(&route);
            let _ = verify_window.eval(&reset_script);
            std::thread::sleep(Duration::from_millis(WEBVIEW_VERIFY_ROUTE_INTERVAL_MS));
            let script = build_webview_verify_route_script(&route);
            // The script reports arrival, so the harness stops on it and says when it never arrives.
            let arrived = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
            let mut attempts_used = WEBVIEW_VERIFY_ROUTE_ATTEMPTS;
            for attempt in 1..=WEBVIEW_VERIFY_ROUTE_ATTEMPTS {
                let sink = std::sync::Arc::clone(&arrived);
                let _ = verify_window.eval_with_callback(script.as_str(), move |result| {
                    if result.trim() == "true" {
                        sink.store(true, std::sync::atomic::Ordering::SeqCst);
                    }
                });
                std::thread::sleep(Duration::from_millis(WEBVIEW_VERIFY_ROUTE_INTERVAL_MS));
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
                    let _ = verify_window.eval(build_webview_verify_ai_settings_script(base_url));
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
        if std::env::var_os("ONTOLOGY_ATLAS_VERIFY_AUDIT_READ").is_some() {
            if let Ok(root) = std::env::var(WEBVIEW_VERIFY_VAULT_ENV) {
                let script = include_str!("audit_read_verify.js")
                    .replace("__ROOT_PATH__", &js_string_literal(&root));
                let _ = verify_window.eval(&script);
                for _ in 0..100 {
                    let completed = Arc::new(std::sync::atomic::AtomicBool::new(false));
                    let flag = completed.clone();
                    let _ = verify_window.eval_with_callback(
                        "JSON.stringify(window.__ontologyAtlasAuditReadVerify || {})",
                        move |result| {
                            if result.contains("done") || result.contains("failed") {
                                write_verify_line(format!(
                                    "[ontology-atlas-audit-read-verify] {result}"
                                ));
                                flag.store(true, std::sync::atomic::Ordering::SeqCst);
                            }
                        },
                    );
                    tokio::time::sleep(Duration::from_millis(500)).await;
                    if completed.load(std::sync::atomic::Ordering::SeqCst) {
                        break;
                    }
                }
            }
        }
        for _ in 0..WEBVIEW_VERIFY_MARKER_ATTEMPTS {
            let _ = verify_window.eval_with_callback(DOM_MARKER_PROBE_SCRIPT, |result| {
                write_verify_line(format!("[ontology-atlas-webview-verify] {result}"))
            });
            std::thread::sleep(Duration::from_millis(WEBVIEW_VERIFY_MARKER_INTERVAL_MS));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn webview_verify_locale_follows_the_injected_list() {
        let four = ["en", "ko", "ja", "zh"];
        for (route, expected) in [
            ("/ja/topology/", "ja"),
            ("/zh/", "zh"),
            ("/ko/topology/", "ko"),
            ("/en/topology/", "en"),
            ("/jax/", "en"),
            ("/ja", "en"),
            ("", "en"),
            ("/", "en"),
        ] {
            assert_eq!(
                super::webview_verify_locale(route, &four),
                expected,
                "{route}"
            );
        }
        assert_eq!(
            super::webview_verify_locale("/ja/topology/", &crate::APP_LOCALES),
            "ja"
        );
        assert_eq!(super::webview_verify_locale_root("/zh/map/", &four), "/zh/");
        let script = super::build_webview_verify_route_reset_script_for("/ja/topology/", &four);
        assert!(script.contains("\"/ja/\""));
        assert!(script.contains("\"ja\""));
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
        let source = include_str!("dom_marker_probe.js");

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
}
